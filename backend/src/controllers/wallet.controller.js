const mongoose = require('mongoose');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const Campaign = require('../models/Campaign');
const Company = require('../models/Company');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const {
    getOrCreateWallet, credit, debit, fundWallet, fundingProvider, round2, MIN_FUND, MAX_FUND,
} = require('../utils/wallet');
const { advertiserOwner, ownsRecord } = require('../utils/advertiser');
const { paystackMode, paystackEnabled } = require('../utils/paystack');
const FundingIntent = require('../models/FundingIntent');
const { startFunding, confirmFunding, liveBlocked } = require('../utils/funding');
const { notifyWalletCredited } = require('../utils/notifications');

// ─────────────────────────────────────────────────────────────
// Advertiser wallet: balance, spend per campaign, history, top-ups.
// Only the account owner (company owner or individual) can fund or spend;
// team logins are switched off (utils/team.js).
// ─────────────────────────────────────────────────────────────

// Newest first; entries in the same millisecond by creation order (ObjectId).
const newestFirst = (a, b) => (new Date(b.createdAt) - new Date(a.createdAt)) || String(b._id).localeCompare(String(a._id));

const OWNER_ONLY = { success: false, code: 'OWNER_ONLY', message: 'Only the account owner can manage the wallet.' };

const publicWallet = (w) => ({
    _id: w._id,
    currency: w.currency || 'NGN',
    balance: round2(w.balance || 0),
    // Paid for booked spots that haven't aired yet: reserved, not spent.
    held: round2(w.held || 0),
    totalFunded: round2(w.totalFunded || 0),
    totalSpent: round2(w.totalSpent || 0),
    totalRefunded: round2(w.totalRefunded || 0),
    lowBalanceThreshold: round2(w.lowBalanceThreshold || 0),
    isLow: (w.lowBalanceThreshold || 0) > 0 && (w.balance || 0) < w.lowBalanceThreshold,
});

const publicTransaction = (t, campaignNames = new Map()) => ({
    _id: t._id,
    type: t.type,
    amount: round2(t.amount),
    balanceAfter: round2(t.balanceAfter),
    currency: t.currency || 'NGN',
    reference: t.reference || null,
    method: t.method || null,
    note: t.note || null,
    campaignId: t.campaignId || null,
    campaignName: t.campaignId ? campaignNames.get(String(t.campaignId)) || null : null,
    createdAt: t.createdAt,
});

const campaignNamesFor = async (transactions) => {
    const ids = [...new Set(transactions.map((t) => t.campaignId && String(t.campaignId)).filter(Boolean))];
    if (!ids.length) return new Map();
    const campaigns = await Campaign.find({ _id: { $in: ids } }).select('name');
    return new Map(campaigns.map((c) => [String(c._id), c.name]));
};

// GET /wallet — balance, totals, spend per campaign, latest movements.
const getMyWallet = async (req, res) => {
    try {
        const wallet = await getOrCreateWallet(advertiserOwner(req));
        const all = await WalletTransaction.find({ walletId: wallet._id });
        const sorted = [...all].sort(newestFirst);
        const names = await campaignNamesFor(sorted);

        // Per campaign: booked (held at checkout), spent (aired, paid to the
        // media house), refunded, and what is still on hold.
        const perCampaign = new Map();
        for (const t of sorted) {
            if (!t.campaignId || !['HOLD', 'CHARGE', 'REFUND'].includes(t.type)) continue;
            const key = String(t.campaignId);
            if (!perCampaign.has(key)) perCampaign.set(key, { campaignId: t.campaignId, campaignName: names.get(key) || 'Campaign', booked: 0, spent: 0, refunded: 0 });
            const row = perCampaign.get(key);
            if (t.type === 'HOLD') row.booked += t.amount;
            else if (t.type === 'CHARGE') row.spent += t.amount;
            else row.refunded += t.amount;
        }
        const byCampaign = [...perCampaign.values()]
            .map((r) => ({
                ...r,
                booked: round2(r.booked),
                spent: round2(r.spent),
                refunded: round2(r.refunded),
                onHold: round2(Math.max(0, r.booked - r.spent - r.refunded)),
            }))
            .sort((a, b) => b.booked - a.booked);

        return res.json({
            success: true,
            data: {
                wallet: publicWallet(wallet),
                byCampaign,
                recent: sorted.slice(0, 10).map((t) => publicTransaction(t, names)),
                funding: {
                    provider: paystackMode() === 'OFF' ? fundingProvider.name : 'PAYSTACK',
                    testMode: paystackMode() !== 'LIVE',
                    available: paystackMode() !== 'INVALID',
                    min: MIN_FUND,
                    max: MAX_FUND,
                },
            },
        });
    } catch (error) {
        console.error('❌ Wallet error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to load your wallet' });
    }
};

// GET /wallet/transactions?page=1&type=CHARGE
const getMyTransactions = async (req, res) => {
    try {
        const wallet = await getOrCreateWallet(advertiserOwner(req));
        const type = ['FUND', 'HOLD', 'CHARGE', 'REFUND', 'ADJUSTMENT'].includes(req.query.type) ? req.query.type : null;
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = 25;
        const all = (await WalletTransaction.find({ walletId: wallet._id, ...(type ? { type } : {}) }))
            .sort(newestFirst);
        const slice = all.slice((page - 1) * limit, page * limit);
        const names = await campaignNamesFor(slice);
        return res.json({
            success: true,
            data: slice.map((t) => publicTransaction(t, names)),
            pagination: { page, limit, total: all.length, pages: Math.max(1, Math.ceil(all.length / limit)) },
        });
    } catch (error) {
        console.error('❌ Wallet transactions error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to load wallet history' });
    }
};

const readAmount = (raw) => {
    const n = typeof raw === 'string' ? Number(raw.replace(/[,\s₦]/g, '')) : Number(raw);
    return Number.isFinite(n) ? round2(n) : NaN;
};

// A path on this site to come back to (never another site).
const safeBack = (raw) => (typeof raw === 'string' && /^\/(?![/\\])[^\\\s]*$/.test(raw) && raw.length <= 400 ? raw : null);

// Where Paystack sends the payer back: the site they came from (its Origin
// already passed the CORS check), else APP_URL.
const walletUrl = (req) => {
    const site = String(req.get('origin') || process.env.APP_URL || 'http://localhost:3000').trim().replace(/\/+$/, '');
    return `${site}${req.user.accountType === 'INDIVIDUAL' ? '/wallet' : '/company/wallet'}`;
};

// Paystack: nothing is credited here, the payer is sent to its checkout.
const fundWithPaystack = async (req, res, amount) => {
    if (!paystackEnabled()) return res.status(503).json({ success: false, message: 'Payments are not set up correctly. Please contact support.' });
    if (await liveBlocked()) {
        console.error('❌ Live top-up refused: this database has test top-ups');
        return res.status(503).json({ success: false, message: 'Payments are not open yet. Please contact support.' });
    }
    try {
        const url = walletUrl(req);
        const { intent, authorizationUrl } = await startFunding(advertiserOwner(req), {
            amount, email: req.user.email, actorId: req.user._id, back: safeBack(req.body?.back), callbackUrl: url, cancelUrl: url,
        });
        return res.status(201).json({
            success: true,
            message: 'Continue to Paystack to pay',
            data: { provider: 'PAYSTACK', reference: intent.reference, authorizationUrl, testMode: intent.mode !== 'LIVE' },
        });
    } catch (error) {
        console.error('❌ Paystack checkout error:', error.name, error.message);
        if (error.name !== 'PaystackError') return res.status(500).json({ success: false, message: 'Failed to fund your wallet' });
        return res.status(502).json({ success: false, message: 'We could not open the Paystack checkout. You have not been charged. Please try again.' });
    }
};

// GET /wallet/fund/:reference — the payer is back from Paystack: was it paid?
const getFundingResult = async (req, res) => {
    if (req.user.accountType === 'EMPLOYEE') return res.status(403).json(OWNER_ONLY);
    try {
        const own = await FundingIntent.findOne({ reference: String(req.params.reference) });
        if (!own || !ownsRecord(req, own)) return res.status(404).json({ success: false, message: 'Top-up not found' });
        let intent = own;
        try {
            const result = await confirmFunding(own.reference);
            intent = result.intent;
        } catch (error) {
            if (error.name !== 'PaystackError') throw error;
            console.error('⚠️ Top-up could not be checked:', error.message); // stays pending; checked again later
        }
        const naira = `₦${intent.amount.toLocaleString()}`;
        const message = {
            PAID: `${naira} added to your wallet${intent.mode === 'LIVE' ? '.' : ' (Paystack test payment: no real money moved).'}`,
            PENDING: `Your ${naira} payment isn't confirmed yet. It appears here as soon as Paystack confirms it.`,
            FAILED: `The ${naira} payment didn't go through. Your wallet was not credited.`,
            MISMATCH: 'We received a payment that needs checking. Media Masters has been told and will sort it out.',
        }[intent.status];
        return res.json({ success: true, message, data: { reference: intent.reference, status: intent.status, amount: intent.amount, back: intent.back, testMode: intent.mode !== 'LIVE' } });
    } catch (error) {
        console.error('❌ Top-up check error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to check the payment' });
    }
};

// POST /wallet/fund { amount, back } — owner only. With Paystack: returns its
// checkout address. Without a key (test mode): credited at once.
const fundMyWallet = async (req, res) => {
    if (req.user.accountType === 'EMPLOYEE') return res.status(403).json(OWNER_ONLY);
    const amount = readAmount(req.body?.amount);
    if (!(amount >= MIN_FUND) || amount > MAX_FUND) {
        return res.status(400).json({ success: false, message: `Enter an amount between ₦${MIN_FUND.toLocaleString()} and ₦${MAX_FUND.toLocaleString()}` });
    }
    if (paystackMode() !== 'OFF') return fundWithPaystack(req, res, amount);
    try {
        const owner = advertiserOwner(req);
        const result = await fundWallet(owner, amount, { actorId: req.user._id });
        if (!result.ok) return res.status(402).json({ success: false, message: 'The top-up was not completed. You have not been charged.' });
        await AuditLog.create({
            userId: req.user._id, companyId: owner.companyId || null, action: 'UPDATE_PAYMENT', entityType: 'PAYMENT',
            entityId: result.wallet._id, metadata: { event: 'WALLET_FUND', amount, testMode: result.testMode },
        }).catch(() => {});
        await notifyWalletCredited(result.wallet, { userId: req.user._id, amount, type: 'FUND' });
        return res.status(201).json({
            success: true,
            message: result.testMode ? `Test mode: ₦${amount.toLocaleString()} added to your wallet. No real money moved.` : 'Wallet funded',
            data: { wallet: publicWallet(result.wallet), transaction: publicTransaction(result.transaction), testMode: result.testMode },
        });
    } catch (error) {
        console.error('❌ Wallet fund error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to fund your wallet' });
    }
};

// PATCH /wallet/settings { lowBalanceThreshold } — owner only.
const updateMyWalletSettings = async (req, res) => {
    if (req.user.accountType === 'EMPLOYEE') return res.status(403).json(OWNER_ONLY);
    const threshold = readAmount(req.body?.lowBalanceThreshold);
    if (!(threshold >= 0) || threshold > MAX_FUND) {
        return res.status(400).json({ success: false, message: 'Enter the alert amount in naira (0 turns the alert off)' });
    }
    try {
        const wallet = await getOrCreateWallet(advertiserOwner(req));
        const updated = await Wallet.findOneAndUpdate(
            { _id: wallet._id },
            { $set: { lowBalanceThreshold: threshold, lowBalanceAlertedAt: null } },
            { returnDocument: 'after' }
        );
        return res.json({ success: true, message: threshold ? 'Low-balance alert saved' : 'Low-balance alert turned off', data: { wallet: publicWallet(updated) } });
    } catch (error) {
        console.error('❌ Wallet settings error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to save the alert' });
    }
};

// ── Admin ──

// GET /admin/wallets — every wallet with its owner.
const getAdminWallets = async (req, res) => {
    try {
        const wallets = await Wallet.find({});
        const companyIds = wallets.map((w) => w.companyId).filter(Boolean);
        const userIds = wallets.filter((w) => !w.companyId).map((w) => w.userId).filter(Boolean);
        const [companies, users] = await Promise.all([
            companyIds.length ? Company.find({ _id: { $in: companyIds } }).select('name companyType') : [],
            userIds.length ? User.find({ _id: { $in: userIds } }).select('name email') : [],
        ]);
        const companyById = new Map(companies.map((c) => [String(c._id), c]));
        const userById = new Map(users.map((u) => [String(u._id), u]));
        const data = wallets.map((w) => {
            const company = w.companyId ? companyById.get(String(w.companyId)) : null;
            const user = !w.companyId && w.userId ? userById.get(String(w.userId)) : null;
            return {
                ...publicWallet(w),
                owner: company ? { kind: 'COMPANY', name: company.name, companyType: company.companyType || null }
                    : { kind: 'INDIVIDUAL', name: user ? user.name : 'Individual', email: user ? user.email : null },
                updatedAt: w.updatedAt,
            };
        }).sort((a, b) => b.balance - a.balance);
        const totals = data.reduce((t, w) => ({
            balance: t.balance + w.balance, funded: t.funded + w.totalFunded, spent: t.spent + w.totalSpent, refunded: t.refunded + w.totalRefunded,
        }), { balance: 0, funded: 0, spent: 0, refunded: 0 });
        return res.json({ success: true, data, totals: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, round2(v)])) });
    } catch (error) {
        console.error('❌ Admin wallets error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to load wallets' });
    }
};

// GET /admin/wallets/:id/transactions
const getAdminWalletTransactions = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid wallet ID' });
        const all = (await WalletTransaction.find({ walletId: req.params.id }))
            .sort(newestFirst).slice(0, 200);
        const names = await campaignNamesFor(all);
        return res.json({ success: true, data: all.map((t) => publicTransaction(t, names)) });
    } catch (error) {
        console.error('❌ Admin wallet history error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to load wallet history' });
    }
};

// POST /admin/wallets/:id/adjust { amount (+ adds, − removes), note }
// e.g. crediting a bank transfer the advertiser made, or a correction.
const adjustWallet = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid wallet ID' });
        const amount = readAmount(req.body?.amount);
        const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 300) : '';
        if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > MAX_FUND) {
            return res.status(400).json({ success: false, message: 'Enter a non-zero amount (negative to remove money)' });
        }
        if (!note) return res.status(400).json({ success: false, message: 'Add a note saying why (e.g. bank transfer reference)' });

        const wallet = await Wallet.findById(req.params.id);
        if (!wallet) return res.status(404).json({ success: false, message: 'Wallet not found' });
        const payer = { companyId: wallet.companyId || null, userId: wallet.userId };
        const meta = { type: 'ADJUSTMENT', method: 'ADMIN', note, createdBy: req.user._id, reference: `ADJ-${Date.now()}` };

        let result;
        if (amount > 0) {
            result = await credit(payer, amount, meta);
        } else {
            result = await debit(payer, -amount, meta);
            if (!result.ok) return res.status(400).json({ success: false, message: `The wallet only has ₦${result.balance.toLocaleString()}` });
        }
        await AuditLog.create({
            userId: req.user._id, action: 'UPDATE_PAYMENT', entityType: 'PAYMENT', entityId: wallet._id,
            metadata: { event: 'WALLET_ADJUST', amount, note },
        }).catch(() => {});
        if (amount > 0) {
            const notifyUser = wallet.companyId
                ? (await User.findOne({ companyId: wallet.companyId, accountType: 'COMPANY' }).select('_id'))?._id
                : wallet.userId;
            if (notifyUser) await notifyWalletCredited(result.wallet, { userId: notifyUser, amount, type: 'ADJUSTMENT', note });
        }
        return res.json({ success: true, message: 'Wallet adjusted', data: { wallet: publicWallet(result.wallet), transaction: publicTransaction(result.transaction) } });
    } catch (error) {
        console.error('❌ Admin wallet adjust error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to adjust the wallet' });
    }
};

module.exports = {
    getMyWallet,
    getMyTransactions,
    fundMyWallet,
    getFundingResult,
    updateMyWalletSettings,
    getAdminWallets,
    getAdminWalletTransactions,
    adjustWallet,
};
