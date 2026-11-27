const mongoose = require('mongoose');
const FundingIntent = require('../models/FundingIntent');
const PayoutRequest = require('../models/PayoutRequest');
const Station = require('../models/Station');
const Company = require('../models/Company');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const paystack = require('../utils/paystack');
const { confirmFunding, hasTestMoney, liveBlocked } = require('../utils/funding');
const { sendPayout, approvePayout, refreshPayout } = require('../utils/payouts');
const { publicPayout } = require('../utils/payoutView');
const { notifyFundingProblem } = require('../utils/notifications');

// ─────────────────────────────────────────────────────────────
// Paystack: the webhook, and the admin side (connection status, top-ups,
// sending payouts). Advertisers' top-ups are in wallet.controller.
// ─────────────────────────────────────────────────────────────

const TEST_MONEY_MESSAGE = 'This database has test top-ups in it, so real money is blocked. Use a separate live database (or clear the test activity) first.';
const UNREACHABLE = 'Paystack could not be reached. Try again in a moment.';

// POST /webhooks/paystack: Paystack telling us something happened. The
// signature is checked on the raw body, and even then the event is only a
// nudge: what is credited or marked paid comes from asking Paystack's API.
// The work finishes before replying (a serverless function may stop after
// the reply); a failure answers 500 so Paystack sends it again.
const paystackWebhook = async (req, res) => {
    if (!paystack.verifyWebhookSignature(req.rawBody, req.headers)) return res.sendStatus(401);
    const event = req.body && typeof req.body.event === 'string' ? req.body.event : '';
    const data = (req.body && req.body.data) || {};
    const reference = typeof data.reference === 'string' ? data.reference : null;
    try {
        if (event === 'charge.success' && reference) {
            await confirmFunding(reference);
        } else if (/^transfer\.(success|failed|reversed)$/.test(event) && reference) {
            const payout = await PayoutRequest.findOne({ transferReference: reference });
            if (payout) await refreshPayout(payout);
        } else if (event === 'charge.dispute.create' || event === 'refund.processed') {
            // A chargeback, or a refund made on the Paystack dashboard: the
            // wallet isn't changed automatically, an admin decides.
            const about = (data.transaction && data.transaction.reference) || data.transaction_reference;
            const intent = about ? await FundingIntent.findOne({ reference: String(about) }) : null;
            if (intent) {
                await notifyFundingProblem(intent, event === 'refund.processed'
                    ? 'This top-up was refunded on Paystack. Take it out of the wallet with an adjustment.'
                    : 'The payer disputed this top-up with their bank. Reply to it on the Paystack dashboard.');
            }
        }
        return res.sendStatus(200);
    } catch (error) {
        console.error('❌ Paystack webhook error:', event, error.name);
        return res.sendStatus(500);
    }
};

// GET /admin/paystack: is it connected, which mode, what can be paid out.
const getPaystackStatus = async (req, res) => {
    const mode = paystack.paystackMode();
    const data = {
        mode,
        webhookSecretSet: !!String(process.env.PAYSTACK_WEBHOOK_SECRET || '').trim(),
        testMoney: await hasTestMoney().catch(() => null),
        balance: null,
        error: null,
    };
    if (paystack.paystackEnabled()) {
        try {
            data.balance = await paystack.getBalance();
        } catch (error) {
            data.error = error.status === 401 ? 'Paystack did not accept the secret key' : error.message;
        }
    }
    return res.json({ success: true, data });
};

const publicIntent = (i, names) => ({
    _id: i._id, reference: i.reference, amount: i.amount, currency: i.currency, status: i.status, mode: i.mode,
    channel: i.channel, fee: i.fee, message: i.message, createdAt: i.createdAt, paidAt: i.paidAt,
    owner: names.get(String(i.companyId || i.userId)) || null,
});

// GET /admin/paystack/top-ups: the latest top-ups, for "I paid but it's not in my wallet".
const getTopUps = async (req, res) => {
    try {
        const status = ['PENDING', 'PAID', 'FAILED', 'MISMATCH'].includes(req.query.status) ? req.query.status : null;
        const rows = (await FundingIntent.find(status ? { status } : {}).sort({ createdAt: -1 }).limit(200))
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 200);
        const [companies, users] = await Promise.all([
            Company.find({ _id: { $in: rows.map((r) => r.companyId).filter(Boolean) } }).select('name'),
            User.find({ _id: { $in: rows.filter((r) => !r.companyId).map((r) => r.userId) } }).select('name'),
        ]);
        const names = new Map([...companies, ...users].map((x) => [String(x._id), x.name]));
        return res.json({ success: true, data: rows.map((r) => publicIntent(r, names)) });
    } catch (error) {
        console.error('❌ Top-ups error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to load top-ups' });
    }
};

// POST /admin/paystack/top-ups/:reference/check: ask Paystack again.
const checkTopUp = async (req, res) => {
    try {
        const result = await confirmFunding(req.params.reference);
        if (!result.found) return res.status(404).json({ success: false, message: 'Top-up not found' });
        const message = {
            PAID: result.credited ? 'Paid: the wallet has been credited' : 'Already paid and credited',
            FAILED: `Not paid${result.intent.message ? `: ${result.intent.message}` : ''}`,
            MISMATCH: result.intent.message || 'Paystack confirmed something different',
            PENDING: 'Not paid yet',
        }[result.intent.status];
        return res.json({ success: true, message, data: publicIntent(result.intent, new Map()) });
    } catch (error) {
        console.error('❌ Top-up check error:', error.name, error.message);
        return res.status(502).json({ success: false, message: UNREACHABLE });
    }
};

// ── Sending payouts ──
const payoutReply = async (req, res, result, event) => {
    if (result.error) return res.status(result.code).json({ success: false, message: result.error });
    const { payout } = result;
    const station = await Station.findById(payout.stationId).select('name');
    if (event) {
        await AuditLog.create({
            userId: req.user._id, action: 'UPDATE_PAYMENT', entityType: 'PAYMENT', entityId: payout._id,
            metadata: { event, amount: payout.amount, station: station?.name, reference: payout.transferReference, mode: payout.mode, status: payout.status },
        }).catch(() => {});
    }
    const message = payout.status === 'PAID' ? 'Sent'
        : payout.status === 'PENDING' ? `Not sent: ${payout.failure || 'try again'}`
            : payout.transferStatus === 'otp' ? 'Paystack sent an approval code to the business owner. Enter it to finish.'
                : result.unknown ? 'Paystack did not answer in time. We keep checking; do not pay it another way until this shows as sent or returned.'
                    : 'Paystack is processing it';
    return res.json({ success: true, message, data: publicPayout(payout, station?.name) });
};

const guardPayout = async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) { res.status(400).json({ success: false, message: 'Invalid payout ID' }); return false; }
    if (!paystack.paystackEnabled()) { res.status(503).json({ success: false, message: 'Paystack is not set up' }); return false; }
    if (await liveBlocked()) { res.status(409).json({ success: false, code: 'TEST_MONEY', message: TEST_MONEY_MESSAGE }); return false; }
    return true;
};

const payoutAction = (label, event, action) => async (req, res) => {
    try {
        if (!(await guardPayout(req, res))) return undefined;
        return await payoutReply(req, res, await action(req), event);
    } catch (error) {
        console.error(`❌ ${label} error:`, error.name, error.message);
        return error.name === 'PaystackError'
            ? res.status(502).json({ success: false, message: UNREACHABLE })
            : res.status(500).json({ success: false, message: 'Failed to update the payout' });
    }
};

// POST /admin/payouts/:id/send
const sendPayoutNow = payoutAction('Payout send', 'PAYOUT_SENT', (req) => sendPayout(req.params.id, req.user._id));

// POST /admin/payouts/:id/otp { otp }
const approvePayoutNow = payoutAction('Payout approval', 'PAYOUT_APPROVED', async (req) => {
    const otp = typeof req.body?.otp === 'string' ? req.body.otp.trim() : '';
    if (!/^\d{4,10}$/.test(otp)) return { code: 400, error: 'Enter the code Paystack sent' };
    return approvePayout(req.params.id, otp);
});

// POST /admin/payouts/:id/refresh
const refreshPayoutNow = payoutAction('Payout check', null, async (req) => {
    const payout = await PayoutRequest.findById(req.params.id);
    if (!payout) return { code: 404, error: 'Payout not found' };
    return { payout: await refreshPayout(payout) };
});

module.exports = { paystackWebhook, getPaystackStatus, getTopUps, checkTopUp, sendPayoutNow, approvePayoutNow, refreshPayoutNow, TEST_MONEY_MESSAGE };
