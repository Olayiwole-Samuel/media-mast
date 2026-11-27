const crypto = require('crypto');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');

// ─────────────────────────────────────────────────────────────
// WALLETS
//
// Advertisers pay for airtime only from their wallet (WALLET_PAYMENTS,
// default on). They fund it at any time. Checkout moves the total from the
// available balance to "held" in one atomic step (never below zero): the
// money is reserved, not spent. Each spot's share is only spent when the spot
// airs (utils/escrow.js releases it to the media house); if it doesn't air,
// is declined or a dispute is upheld, it goes back to the available balance.
//
// Funding goes through Paystack when PAYSTACK_SECRET_KEY is set
// (utils/funding.js: checkout → confirmed with Paystack → credit). Without a
// key it is instant TEST MODE: the amount is added and no real money moves.
// ─────────────────────────────────────────────────────────────

const round2 = (n) => Math.round(Number(n) * 100) / 100;

const walletPaymentsEnabled = () => String(process.env.WALLET_PAYMENTS || 'true').trim().toLowerCase() !== 'false';

const MIN_FUND = 1000;
const MAX_FUND = 500000000;

const newReference = (prefix) => `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

// The wallet's owner: a company (shared) or an individual.
const scopeOf = ({ companyId, userId, stationId }) => {
    if (stationId) return { stationId };
    return companyId ? { companyId } : { companyId: null, stationId: null, userId };
};

const findWallet = (payer) => Wallet.findOne(scopeOf(payer));

// The payer's wallet, created empty the first time it is needed.
const getOrCreateWallet = async (payer) => {
    const existing = await findWallet(payer);
    if (existing) return existing;
    try {
        return await Wallet.create({ ...scopeOf(payer), userId: payer.stationId ? null : payer.userId || null });
    } catch (error) {
        // Two requests created it at once: use the one that won.
        if (error && error.code === 11000) return findWallet(payer);
        throw error;
    }
};

const record = async (wallet, fields, session) => {
    const entry = {
        walletId: wallet._id,
        currency: wallet.currency || 'NGN',
        balanceAfter: round2(wallet.balance),
        ...fields,
    };
    if (!session) return WalletTransaction.create(entry);
    return (await WalletTransaction.create([entry], { session }))[0];
};

// Back above the alert line: the next drop alerts again.
const clearLowBalanceAlert = async (wallet) => {
    if (!wallet.lowBalanceAlertedAt || wallet.balance < (wallet.lowBalanceThreshold || 0)) return;
    await Wallet.updateOne({ _id: wallet._id }, { $set: { lowBalanceAlertedAt: null } });
    wallet.lowBalanceAlertedAt = null;
};

// Add money (FUND, REFUND or a positive ADJUSTMENT). Inside a database
// transaction pass { session }: the caller clears the alert after it commits.
const credit = async (payer, amount, { type, ...meta }, { session } = {}) => {
    const value = round2(amount);
    if (!(value > 0)) throw new Error('Credit amount must be positive');
    const wallet = await getOrCreateWallet(payer);
    const totals = type === 'FUND' ? { totalFunded: value } : type === 'REFUND' ? { totalRefunded: value } : {};
    const updated = await Wallet.findOneAndUpdate(
        { _id: wallet._id },
        { $inc: { balance: value, ...totals } },
        { returnDocument: 'after', ...(session ? { session } : {}) }
    );
    if (!session) await clearLowBalanceAlert(updated);
    const transaction = await record(updated, { type, amount: value, ...meta }, session);
    return { wallet: updated, transaction };
};

// Take money out, only if the balance covers it (atomic: never below zero).
const debit = async (payer, amount, { type = 'CHARGE', ...meta }) => {
    const value = round2(amount);
    const wallet = await getOrCreateWallet(payer);
    if (!(value > 0)) return { ok: true, wallet, transaction: null };
    const updated = await Wallet.findOneAndUpdate(
        { _id: wallet._id, balance: { $gte: value } },
        { $inc: { balance: -value, ...(type === 'CHARGE' ? { totalSpent: value } : {}) } },
        { returnDocument: 'after' }
    );
    if (!updated) {
        const current = await Wallet.findById(wallet._id);
        const balance = round2(current ? current.balance : 0);
        return { ok: false, wallet: current || wallet, balance, needed: value, shortfall: round2(value - balance) };
    }
    const transaction = await record(updated, { type, amount: type === 'ADJUSTMENT' ? -value : value, ...meta });
    return { ok: true, wallet: updated, transaction };
};

// ── Holds: booked but not yet aired ──

// Checkout: available -> held (only if the available balance covers it).
const hold = async (payer, amount, meta) => {
    const value = round2(amount);
    const wallet = await getOrCreateWallet(payer);
    if (!(value > 0)) return { ok: true, wallet, transaction: null };
    const updated = await Wallet.findOneAndUpdate(
        { _id: wallet._id, balance: { $gte: value } },
        { $inc: { balance: -value, held: value } },
        { returnDocument: 'after' }
    );
    if (!updated) {
        const current = await Wallet.findById(wallet._id);
        const balance = round2(current ? current.balance : 0);
        return { ok: false, wallet: current || wallet, balance, needed: value, shortfall: round2(value - balance) };
    }
    const transaction = await record(updated, { type: 'HOLD', amount: value, ...meta });
    return { ok: true, wallet: updated, transaction };
};

// Not spent after all: held -> available (a refund). Money that was never
// held (a wallet from before holds) is simply credited.
const unhold = async (payer, amount, meta) => {
    const value = round2(amount);
    if (!(value > 0)) return null;
    const wallet = await getOrCreateWallet(payer);
    const fromHeld = Math.min(value, round2(wallet.held || 0));
    const updated = await Wallet.findOneAndUpdate(
        { _id: wallet._id, held: { $gte: fromHeld } },
        { $inc: { held: -fromHeld, balance: value, totalRefunded: value } },
        { returnDocument: 'after' }
    );
    if (!updated) throw new Error('Wallet hold changed; retry the refund');
    if (updated.lowBalanceAlertedAt && updated.balance >= (updated.lowBalanceThreshold || 0)) {
        await Wallet.updateOne({ _id: updated._id }, { $set: { lowBalanceAlertedAt: null } });
    }
    return record(updated, { type: 'REFUND', amount: value, ...meta });
};

// The spot aired: its held money is spent (paid to the media house).
const spendHeld = async (payer, amount, meta) => {
    const value = round2(amount);
    if (!(value > 0)) return null;
    const wallet = await getOrCreateWallet(payer);
    const fromHeld = Math.min(value, round2(wallet.held || 0));
    const updated = await Wallet.findOneAndUpdate(
        { _id: wallet._id, held: { $gte: fromHeld } },
        { $inc: { held: -fromHeld, totalSpent: value } },
        { returnDocument: 'after' }
    );
    if (!updated) throw new Error('Wallet hold changed; retry the release');
    return record(updated, { type: 'CHARGE', amount: value, ...meta });
};

// ── Media house earnings ──
const creditStation = async (stationId, amount, meta) => {
    const value = round2(amount);
    if (!(value > 0)) return null;
    const wallet = await getOrCreateWallet({ stationId });
    const updated = await Wallet.findOneAndUpdate(
        { _id: wallet._id },
        { $inc: { balance: value, totalEarned: value } },
        { returnDocument: 'after' }
    );
    return record(updated, { type: 'EARNING', amount: value, ...meta });
};

// A payout request takes the money out of the media house's balance.
const debitStation = async (stationId, amount, meta) => {
    const value = round2(amount);
    const wallet = await getOrCreateWallet({ stationId });
    const updated = await Wallet.findOneAndUpdate(
        { _id: wallet._id, balance: { $gte: value } },
        { $inc: { balance: -value, totalPaidOut: value } },
        { returnDocument: 'after' }
    );
    if (!updated) return { ok: false, balance: round2(wallet.balance || 0) };
    const transaction = await record(updated, { type: 'PAYOUT', amount: value, ...meta });
    return { ok: true, wallet: updated, transaction };
};

// A declined payout request goes back to the balance.
const reverseStationPayout = async (stationId, amount, meta) => {
    const value = round2(amount);
    const wallet = await getOrCreateWallet({ stationId });
    const updated = await Wallet.findOneAndUpdate(
        { _id: wallet._id },
        { $inc: { balance: value, totalPaidOut: -value } },
        { returnDocument: 'after' }
    );
    return record(updated, { type: 'PAYOUT_REVERSED', amount: value, ...meta });
};

// Has this debit just taken the balance under the owner's alert line?
const crossedLowBalance = (wallet) =>
    wallet && wallet.lowBalanceThreshold > 0 && wallet.balance < wallet.lowBalanceThreshold && !wallet.lowBalanceAlertedAt;

// ── The wallet as a payment provider (same interface as utils/payments.js) ──
const walletProvider = {
    name: 'WALLET',
    isTestMode: false,

    async charge({ amount, currency, reference, payer, campaignId, actorId }) {
        if (!payer || (!payer.companyId && !payer.userId)) throw new Error('Wallet charge needs the payer');
        const result = await hold(payer, amount, { reference, campaignId: campaignId || null, createdBy: actorId || null, note: 'Held for booked spots until they air' });
        if (!result.ok) {
            return { status: 'INSUFFICIENT_FUNDS', balance: result.balance, needed: result.needed, shortfall: result.shortfall, currency: currency || 'NGN' };
        }
        if (crossedLowBalance(result.wallet)) {
            await Wallet.updateOne({ _id: result.wallet._id }, { $set: { lowBalanceAlertedAt: new Date() } });
            const { notifyWalletLow } = require('./notifications');
            await notifyWalletLow(result.wallet, payer);
        }
        return { status: 'SUCCESSFUL', providerReference: `WALLET-${reference}`, walletBalance: round2(result.wallet.balance) };
    },

    // Back to the available balance (from what was held): a booking refund
    // ({ payment }) or a failed checkout ({ payer }).
    async refund({ payment, payer, amount, reason, bookingId }) {
        const owner = payer || (payment ? { companyId: payment.companyId || null, userId: payment.userId } : null);
        if (!owner) throw new Error('Wallet refund needs the payer');
        const reference = newReference('WALLET-RF');
        await unhold(owner, amount, {
            reference,
            campaignId: payment ? payment.campaignId : null,
            paymentId: payment ? payment._id : null,
            bookingId: bookingId || null,
            note: reason ? String(reason).slice(0, 300) : 'Refund',
        });
        return { status: 'REFUNDED', refundReference: reference };
    },
};

// ── Funding without Paystack (no key set): instant, pretend money ──
const fundingProvider = {
    name: 'TEST',
    isTestMode: true,
    async collect() {
        return { status: 'SUCCESSFUL' };
    },
};

const fundWallet = async (payer, amount, { actorId } = {}) => {
    const value = round2(amount);
    const collected = await fundingProvider.collect({ amount: value });
    if (!collected || collected.status !== 'SUCCESSFUL') return { ok: false };
    const reference = newReference('FUND');
    const result = await credit(payer, value, {
        type: 'FUND',
        reference,
        method: fundingProvider.name,
        createdBy: actorId || null,
        note: fundingProvider.isTestMode ? 'Test-mode top-up (no real money moved)' : 'Wallet top-up',
    });
    return { ok: true, testMode: fundingProvider.isTestMode, ...result };
};

module.exports = {
    walletPaymentsEnabled,
    walletProvider,
    fundingProvider,
    getOrCreateWallet,
    findWallet,
    credit,
    debit,
    hold,
    unhold,
    spendHeld,
    creditStation,
    debitStation,
    reverseStationPayout,
    fundWallet,
    clearLowBalanceAlert,
    round2,
    MIN_FUND,
    MAX_FUND,
};
