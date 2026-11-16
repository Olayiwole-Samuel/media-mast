const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Station = require('../models/Station');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const PayoutRequest = require('../models/PayoutRequest');
const PlatformSetting = require('../models/PlatformSetting');
const AuditLog = require('../models/AuditLog');
const escrow = require('../utils/escrow');
const { getOrCreateWallet, debitStation, reverseStationPayout, round2 } = require('../utils/wallet');
const { ownsStation, stationOwnerFilter } = require('../utils/stationOperator');
const {
    notifyDisputeResolved, notifyStationEarning, notifyPayoutRequested, notifyPayoutDecided,
} = require('../utils/notifications');

// ─────────────────────────────────────────────────────────────
// Settlement: disputes, media house earnings and payouts, and the settings
// (dispute window, confirmation deadline, commission). See utils/escrow.js.
// ─────────────────────────────────────────────────────────────

const isId = (v) => mongoose.isValidObjectId(v);
const audit = (req, metadata, entityId) => AuditLog.create({
    userId: req.user._id, action: 'UPDATE_PAYMENT', entityType: 'PAYMENT', entityId: entityId || null, metadata,
}).catch(() => {});

const publicDispute = (b) => ({
    _id: b._id,
    bookingReference: b.bookingReference,
    station: b.stationId && b.stationId.name ? { _id: b.stationId._id, name: b.stationId.name } : { _id: b.stationId },
    campaign: b.campaignId && b.campaignId.name ? { _id: b.campaignId._id, name: b.campaignId.name } : { _id: b.campaignId },
    date: b.date, time: b.time, rateName: b.rateName || null, spotSeconds: b.spotSeconds || null,
    currency: b.currency || 'NGN',
    escrow: b.escrow,
    remaining: escrow.remainingOf(b),
});

// ── Admin: disputes ──
const getDisputes = async (req, res) => {
    try {
        const open = req.query.status !== 'resolved';
        const rows = await Booking.find(open ? { 'escrow.status': 'DISPUTED' } : { 'escrow.dispute.resolvedAt': { $ne: null } })
            .populate('stationId', 'name').populate('campaignId', 'name');
        const sorted = [...rows].sort((a, b) => new Date(b.escrow?.dispute?.openedAt || 0) - new Date(a.escrow?.dispute?.openedAt || 0));
        return res.json({ success: true, data: sorted.slice(0, 200).map(publicDispute) });
    } catch (error) {
        console.error('❌ Disputes error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to load disputes' });
    }
};

const resolveDispute = async (req, res) => {
    try {
        if (!isId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid booking ID' });
        const outcome = String(req.body?.outcome || '').toUpperCase();
        const resolution = typeof req.body?.resolution === 'string' ? req.body.resolution.trim().slice(0, 1000) : '';
        if (!resolution) return res.status(400).json({ success: false, message: 'Add a short note explaining the decision' });
        const result = await escrow.resolveDispute(req.params.id, { outcome, refundAmount: req.body?.refundAmount, resolution });
        if (result.error) return res.status(400).json({ success: false, message: result.error });
        const booking = await Booking.findById(req.params.id);
        await audit(req, { event: 'RESOLVE_DISPUTE', outcome, refunded: result.refunded, bookingReference: booking.bookingReference }, booking._id);
        await notifyDisputeResolved(booking, { outcome, refunded: result.refunded, resolution });
        if (booking.escrow?.stationAmount > 0) await notifyStationEarning(booking, booking.escrow.stationAmount);
        return res.json({ success: true, message: 'Dispute resolved', data: publicDispute(booking) });
    } catch (error) {
        console.error('❌ Resolve dispute error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to resolve the dispute' });
    }
};

// ── Admin: settings ──
const getSettings = async (req, res) => {
    try {
        return res.json({ success: true, data: await escrow.getSettlementSettings(), limits: escrow.LIMITS });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to load settings' });
    }
};

const updateSettings = async (req, res) => {
    try {
        const current = await escrow.getSettlementSettings();
        const next = { ...current };
        for (const [k, [min, max]] of Object.entries(escrow.LIMITS)) {
            if (req.body?.[k] === undefined) continue;
            const n = Number(req.body[k]);
            if (!Number.isFinite(n) || n < min || n > max) {
                return res.status(400).json({ success: false, message: `${k} must be between ${min} and ${max}` });
            }
            next[k] = Math.round(n * 100) / 100;
        }
        const existing = await PlatformSetting.findOne({ key: 'settlement' });
        if (existing) await PlatformSetting.updateOne({ _id: existing._id }, { $set: { value: next, updatedBy: req.user._id } });
        else await PlatformSetting.create({ key: 'settlement', value: next, updatedBy: req.user._id });
        await audit(req, { event: 'SETTLEMENT_SETTINGS', from: current, to: next });
        return res.json({ success: true, message: 'Settings saved', data: next });
    } catch (error) {
        console.error('❌ Settlement settings error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to save settings' });
    }
};

// ── Admin: payouts ──
const publicPayout = (p, stationName) => ({
    _id: p._id, stationId: p.stationId, stationName: stationName || null, amount: round2(p.amount), currency: p.currency || 'NGN',
    status: p.status, account: p.account, reference: p.reference, note: p.note, createdAt: p.createdAt, decidedAt: p.decidedAt,
});

const getPayouts = async (req, res) => {
    try {
        const status = ['PENDING', 'PAID', 'DECLINED'].includes(req.query.status) ? req.query.status : null;
        const rows = (await PayoutRequest.find(status ? { status } : {})).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 300);
        const stations = await Station.find({ _id: { $in: [...new Set(rows.map((r) => String(r.stationId)))] } }).select('name');
        const names = new Map(stations.map((s) => [String(s._id), s.name]));
        return res.json({ success: true, data: rows.map((r) => publicPayout(r, names.get(String(r.stationId)))) });
    } catch (error) {
        console.error('❌ Payouts error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to load payouts' });
    }
};

const decidePayout = (paid) => async (req, res) => {
    try {
        if (!isId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid payout ID' });
        const reference = typeof req.body?.reference === 'string' ? req.body.reference.trim().slice(0, 120) : '';
        const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 500) : '';
        if (paid && !reference) return res.status(400).json({ success: false, message: 'Enter the bank transfer reference' });
        if (!paid && !note) return res.status(400).json({ success: false, message: 'Say why the payout is declined' });
        const request = await PayoutRequest.findOneAndUpdate(
            { _id: req.params.id, status: 'PENDING' },
            { $set: { status: paid ? 'PAID' : 'DECLINED', reference: reference || null, note: note || null, decidedBy: req.user._id, decidedAt: new Date() } },
            { returnDocument: 'after' }
        );
        if (!request) return res.status(409).json({ success: false, message: 'This payout is no longer pending' });
        if (!paid) await reverseStationPayout(request.stationId, request.amount, { note: `Payout declined: ${note}`.slice(0, 300) });
        const station = await Station.findById(request.stationId).select('name');
        await audit(req, { event: paid ? 'PAYOUT_PAID' : 'PAYOUT_DECLINED', amount: request.amount, reference, station: station?.name }, request._id);
        await notifyPayoutDecided(request, station || { _id: request.stationId });
        return res.json({ success: true, message: paid ? 'Marked as paid' : 'Payout declined; the amount is back in their earnings', data: publicPayout(request, station?.name) });
    } catch (error) {
        console.error('❌ Payout decision error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to update the payout' });
    }
};

// ── Media house: earnings and payouts ──
const LIVE_HOLD = ['HELD', 'AIRED', 'DISPUTED'];

const getEarnings = async (req, res) => {
    try {
        const stations = await Station.find({ ...stationOwnerFilter(req) }).select('name payoutAccount');
        const ids = stations.map((s) => s._id);
        const { commissionPercent, disputeHours } = await escrow.getSettlementSettings();
        const bookings = ids.length ? await Booking.find({ stationId: { $in: ids }, 'escrow.status': { $in: LIVE_HOLD } }) : [];

        const out = [];
        for (const station of stations) {
            const wallet = await getOrCreateWallet({ stationId: station._id });
            const mine = bookings.filter((b) => String(b.stationId) === String(station._id));
            // Expected: booked spots not yet paid, after VAT and commission.
            const expectedOf = (b) => {
                const rest = escrow.remainingOf(b);
                const vat = b.escrow.amount > 0 ? (b.escrow.vat || 0) * (rest / b.escrow.amount) : 0;
                return round2((rest - vat) * (1 - commissionPercent / 100));
            };
            // Booked spots grouped by programme/belt and day (e.g. "News at 10 · 17 Nov").
            const groups = new Map();
            for (const b of mine) {
                const day = new Date(b.date).toISOString().slice(0, 10);
                const key = `${day}|${b.rateName || b.slot}|${b.time}`;
                if (!groups.has(key)) groups.set(key, { date: day, programme: b.rateName || b.slot, time: b.time, spots: 0, expected: 0, aired: 0, disputed: 0 });
                const g = groups.get(key);
                g.spots += 1;
                g.expected = round2(g.expected + expectedOf(b));
                if (b.escrow.status === 'AIRED') g.aired += 1;
                if (b.escrow.status === 'DISPUTED') g.disputed += 1;
            }
            const txs = (await WalletTransaction.find({ walletId: wallet._id })).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt) || String(b._id).localeCompare(String(a._id)));
            const payouts = (await PayoutRequest.find({ stationId: station._id })).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            out.push({
                station: { _id: station._id, name: station.name },
                payoutAccount: station.payoutAccount || null,
                expected: round2(mine.reduce((t, b) => t + expectedOf(b), 0)),
                awaitingRelease: round2(mine.filter((b) => b.escrow.status !== 'HELD').reduce((t, b) => t + expectedOf(b), 0)),
                earned: round2(wallet.balance || 0),
                totalEarned: round2(wallet.totalEarned || 0),
                totalPaidOut: round2(wallet.totalPaidOut || 0),
                byProgramme: [...groups.values()].sort((a, b) => a.date.localeCompare(b.date) || String(a.time).localeCompare(String(b.time))),
                history: txs.slice(0, 50).map((t) => ({ _id: t._id, type: t.type, amount: round2(t.amount), balanceAfter: round2(t.balanceAfter), note: t.note, createdAt: t.createdAt })),
                payouts: payouts.slice(0, 50).map((p) => publicPayout(p, station.name)),
            });
        }
        return res.json({ success: true, data: out, settings: { commissionPercent, disputeHours } });
    } catch (error) {
        console.error('❌ Earnings error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to load earnings' });
    }
};

const loadOwnStation = async (req, res) => {
    if (!isId(req.params.id)) { res.status(400).json({ success: false, message: 'Invalid station ID' }); return null; }
    const station = await Station.findById(req.params.id);
    if (!station || !ownsStation(req, station)) { res.status(404).json({ success: false, message: 'Station not found' }); return null; }
    return station;
};

const setPayoutAccount = async (req, res) => {
    try {
        const station = await loadOwnStation(req, res);
        if (!station) return undefined;
        const clean = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
        const account = { bankName: clean(req.body?.bankName, 80), accountNumber: clean(req.body?.accountNumber, 20).replace(/\s/g, ''), accountName: clean(req.body?.accountName, 120) };
        if (!account.bankName || !account.accountName || !/^\d{10}$/.test(account.accountNumber)) {
            return res.status(400).json({ success: false, message: 'Enter the bank, a 10-digit account number and the account name' });
        }
        await Station.updateOne({ _id: station._id }, { $set: { payoutAccount: account } });
        await audit(req, { event: 'PAYOUT_ACCOUNT', station: station.name, bank: account.bankName }, station._id);
        return res.json({ success: true, message: 'Bank account saved', data: account });
    } catch (error) {
        console.error('❌ Payout account error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to save the bank account' });
    }
};

const MIN_PAYOUT = 1000;

const requestPayout = async (req, res) => {
    try {
        const station = await loadOwnStation(req, res);
        if (!station) return undefined;
        const account = station.payoutAccount;
        if (!account || !account.accountNumber) return res.status(400).json({ success: false, message: 'Add your bank account first' });
        const amount = round2(Number(String(req.body?.amount ?? '').replace(/[,\s₦]/g, '')));
        if (!(amount >= MIN_PAYOUT)) return res.status(400).json({ success: false, message: `Request at least ₦${MIN_PAYOUT.toLocaleString()}` });
        const pending = await PayoutRequest.findOne({ stationId: station._id, status: 'PENDING' });
        if (pending) return res.status(409).json({ success: false, message: 'You already have a payout request waiting' });

        const taken = await debitStation(station._id, amount, { note: 'Payout requested' });
        if (!taken.ok) return res.status(400).json({ success: false, message: `You have ₦${taken.balance.toLocaleString()} available to pay out` });
        const request = await PayoutRequest.create({
            stationId: station._id, amount, account: { bankName: account.bankName, accountNumber: account.accountNumber, accountName: account.accountName }, requestedBy: req.user._id,
        });
        await notifyPayoutRequested(request, station);
        return res.status(201).json({ success: true, message: 'Payout requested. Media Masters will transfer it to your bank.', data: publicPayout(request, station.name) });
    } catch (error) {
        console.error('❌ Payout request error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to request the payout' });
    }
};

module.exports = {
    getDisputes,
    resolveDispute,
    getSettings,
    updateSettings,
    getPayouts,
    markPayoutPaid: decidePayout(true),
    declinePayout: decidePayout(false),
    getEarnings,
    setPayoutAccount,
    requestPayout,
};
