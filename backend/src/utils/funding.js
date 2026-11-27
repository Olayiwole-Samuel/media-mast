const crypto = require('crypto');
const mongoose = require('mongoose');
const FundingIntent = require('../models/FundingIntent');
const WalletTransaction = require('../models/WalletTransaction');
const AuditLog = require('../models/AuditLog');
const paystack = require('./paystack');
const { credit, getOrCreateWallet, clearLowBalanceAlert, round2 } = require('./wallet');
const { notifyWalletCredited, notifyFundingProblem } = require('./notifications');

// ─────────────────────────────────────────────────────────────
// WALLET TOP-UPS THROUGH PAYSTACK
//
// startFunding   creates the intent and a Paystack checkout to send the
//                advertiser to.
// confirmFunding asks Paystack what happened to a reference and, if it was
//                paid, credits the wallet. Called when the advertiser comes
//                back, by the webhook, and by the sweep. Whoever gets there
//                first credits it; the others find it done.
// sweepFunding   re-checks top-ups that nobody reported back on (the browser
//                was closed, the webhook was missed, a slow bank transfer).
// ─────────────────────────────────────────────────────────────

const SWEEP_DAYS = 3;
const SWEEP_LIMIT = 25;
const UNFINISHED = ['PENDING', 'FAILED'];
const newFundingReference = () => `FUND-${Date.now()}-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

// Pretend money and real money must not share a database: with a live key,
// refuse while any test top-up exists (see src/scripts/resetActivity.js).
const TEST_METHODS = ['TEST', 'PAYSTACK_TEST'];
const hasTestMoney = async () => !!(await WalletTransaction.findOne({ type: 'FUND', method: { $in: TEST_METHODS } }).select('_id'));
const liveBlocked = async () => paystack.paystackMode() === 'LIVE' && hasTestMoney();

const startFunding = async (owner, { amount, email, actorId, back, callbackUrl, cancelUrl }) => {
    const reference = newFundingReference();
    const intent = await FundingIntent.create({
        reference, userId: actorId, companyId: owner.companyId || null, amount: round2(amount), mode: paystack.paystackMode(), back: back || null,
    });
    try {
        const { authorizationUrl } = await paystack.initializeTransaction({
            email,
            amount: intent.amount,
            reference,
            callbackUrl,
            cancelUrl: cancelUrl ? `${cancelUrl}?cancelled=${encodeURIComponent(reference)}` : null,
            metadata: { purpose: 'wallet_top_up' },
        });
        return { intent, authorizationUrl };
    } catch (error) {
        await FundingIntent.updateOne({ _id: intent._id }, { $set: { status: 'FAILED', message: String(error.message).slice(0, 300) } });
        throw error;
    }
};

// Confirmed by Paystack: mark it paid and add the money, together or not at all.
const creditIntent = async (intent, tx) => {
    const payer = { companyId: intent.companyId || null, userId: intent.userId };
    await getOrCreateWallet(payer); // created outside the transaction
    let result = null;
    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            result = null;
            const claimed = await FundingIntent.findOneAndUpdate(
                { _id: intent._id, status: { $in: UNFINISHED } },
                {
                    $set: {
                        status: 'PAID',
                        channel: tx.channel || null,
                        fee: tx.fees == null ? null : paystack.fromKobo(tx.fees),
                        paystackId: tx.id == null ? null : String(tx.id),
                        message: tx.gateway_response ? String(tx.gateway_response).slice(0, 300) : null,
                        paidAt: tx.paid_at ? new Date(tx.paid_at) : new Date(),
                        lastCheckedAt: new Date(),
                    },
                },
                { returnDocument: 'after', session }
            );
            if (!claimed) return; // already credited by someone else
            result = await credit(payer, intent.amount, {
                type: 'FUND',
                reference: intent.reference,
                method: intent.mode === 'LIVE' ? 'PAYSTACK' : 'PAYSTACK_TEST',
                createdBy: intent.userId,
                note: `Paystack${tx.channel ? ` (${String(tx.channel).replace(/_/g, ' ')})` : ''}${intent.mode === 'LIVE' ? '' : ': test payment, no real money moved'}`,
            }, { session });
            await FundingIntent.updateOne({ _id: intent._id }, { $set: { walletTransactionId: result.transaction._id } }, { session });
        }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
    } finally {
        await session.endSession();
    }
    if (!result) return false;
    await clearLowBalanceAlert(result.wallet);
    await AuditLog.create({
        userId: intent.userId, companyId: intent.companyId || null, action: 'UPDATE_PAYMENT', entityType: 'PAYMENT', entityId: result.wallet._id,
        metadata: { event: 'WALLET_FUND', amount: intent.amount, provider: 'PAYSTACK', mode: intent.mode, reference: intent.reference },
    }).catch(() => {});
    await notifyWalletCredited(result.wallet, { userId: intent.userId, amount: intent.amount, type: 'FUND' });
    return true;
};

// Why this confirmed payment isn't the one we asked for (null = it is).
// requested_amount is what we asked for; amount is what was charged (more when
// the payer bears Paystack's fee, less on a partial debit).
const mismatchOf = (intent, tx) => {
    const expected = paystack.toKobo(intent.amount);
    const charged = Number(tx.amount);
    const requested = tx.requested_amount == null ? charged : Number(tx.requested_amount);
    if (tx.reference !== intent.reference) return 'a different reference';
    if (String(tx.currency).toUpperCase() !== 'NGN') return `currency ${tx.currency}`;
    if (requested !== expected || !(charged >= expected)) return `₦${paystack.fromKobo(charged).toLocaleString()} instead of ₦${intent.amount.toLocaleString()}`;
    if (tx.domain && tx.domain !== intent.mode.toLowerCase()) return `a payment in ${tx.domain} mode`;
    return null;
};

// What happened to this top-up? Throws when Paystack can't be reached.
const confirmFunding = async (reference) => {
    const intent = await FundingIntent.findOne({ reference: String(reference) });
    if (!intent) return { found: false };
    if (!UNFINISHED.includes(intent.status) || intent.mode !== paystack.paystackMode()) return { found: true, intent, credited: false };

    let tx;
    try {
        tx = await paystack.verifyTransaction(intent.reference);
    } catch (error) {
        if (!error.answered || error.status === 401 || error.status === 403) throw error;
        tx = { status: 'failed', gateway_response: error.message }; // Paystack has no such payment
    }
    if (!tx) throw new paystack.PaystackError('Empty reply from Paystack');

    let credited = false;
    if (tx.status === 'success') {
        const problem = mismatchOf(intent, tx);
        if (problem) {
            const moved = await FundingIntent.findOneAndUpdate(
                { _id: intent._id, status: { $in: UNFINISHED } },
                { $set: { status: 'MISMATCH', message: `Paystack confirmed ${problem}`.slice(0, 300), lastCheckedAt: new Date() } },
                { returnDocument: 'after' }
            );
            if (moved) await notifyFundingProblem(moved, `Paystack confirmed ${problem}. The wallet was not credited.`);
        } else {
            credited = await creditIntent(intent, tx);
        }
    } else {
        // "abandoned" is also what an unpaid checkout says while it is still open.
        const failed = ['failed', 'reversed'].includes(tx.status);
        await FundingIntent.updateOne(
            { _id: intent._id, status: { $in: UNFINISHED } },
            { $set: { status: failed ? 'FAILED' : 'PENDING', message: tx.gateway_response ? String(tx.gateway_response).slice(0, 300) : null, lastCheckedAt: new Date() } }
        );
    }
    return { found: true, intent: await FundingIntent.findById(intent._id), credited, paystackStatus: tx.status };
};

// Re-check unfinished top-ups from the last few days: often at first, then
// hourly, so a forgotten checkout doesn't keep asking Paystack.
const sweepFunding = async (now = new Date()) => {
    if (!paystack.paystackEnabled()) return { checked: 0, credited: 0 };
    const since = new Date(now.getTime() - SWEEP_DAYS * 864e5);
    const open = await FundingIntent.find({ status: { $in: UNFINISHED }, mode: paystack.paystackMode(), createdAt: { $gte: since } });
    const due = open.filter((i) => {
        const age = now - i.createdAt;
        const waited = now - (i.lastCheckedAt || i.createdAt);
        return age >= 2 * 60000 && waited >= Math.min(60 * 60000, Math.max(2 * 60000, age / 4));
    }).slice(0, SWEEP_LIMIT);
    let credited = 0;
    for (const intent of due) {
        try {
            if ((await confirmFunding(intent.reference)).credited) credited += 1;
        } catch (error) {
            console.error('⚠️ Top-up check failed:', error.name);
            break; // Paystack unreachable: try again next run
        }
    }
    return { checked: due.length, credited };
};

module.exports = { startFunding, confirmFunding, sweepFunding, hasTestMoney, liveBlocked };
