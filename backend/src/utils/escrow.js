const Booking = require('../models/Booking');
const Payment = require('../models/Payment');
const PlatformSetting = require('../models/PlatformSetting');
const { airTimeOf, paidValueOf } = require('./cancellationPolicy');
const { spendHeld, unhold, creditStation, round2 } = require('./wallet');

// ─────────────────────────────────────────────────────────────
// MONEY HELD UNTIL THE SPOT AIRS (wallet bookings)
//
//   checkout            each spot's share of the payment is HELD in the
//                       advertiser's wallet (reserved, not spent)
//   media house         marks the spot aired with its TX log and a clip
//                       → AIRED; the advertiser can dispute until releaseAt
//   advertiser confirms → paid now (RELEASED)
//   window passes       → paid automatically (RELEASED)
//   dispute             → DISPUTED; an admin releases, refunds or splits
//   not aired/declined  → REFUNDED to the advertiser's available balance
//
// "Paid" = the advertiser's held money is spent, and the media house's
// earnings wallet is credited with the spot's value less VAT and commission.
// Settings (admin-editable): dispute window, confirmation deadline, commission.
// ─────────────────────────────────────────────────────────────

const DEFAULTS = {
    disputeHours: Number(process.env.DISPUTE_WINDOW_HOURS) || 18,
    confirmHours: Number(process.env.AIR_CONFIRM_HOURS) || 12,
    commissionPercent: Number(process.env.COMMISSION_PERCENT) || 0,
};
const LIMITS = { disputeHours: [1, 168], confirmHours: [1, 168], commissionPercent: [0, 50] };

const getSettlementSettings = async () => {
    const row = await PlatformSetting.findOne({ key: 'settlement' });
    const value = { ...DEFAULTS, ...((row && row.value) || {}) };
    for (const [k, [min, max]] of Object.entries(LIMITS)) {
        const n = Number(value[k]);
        value[k] = Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : DEFAULTS[k];
    }
    return value;
};

const payerOf = (payment) => ({ companyId: payment.companyId || null, userId: payment.userId });
const isEscrowPayment = (payment) => payment && payment.provider === 'WALLET';

// ── Checkout: record each spot's held share (the shares add up to the payment) ──
const holdBookings = async (payment, bookings) => {
    if (!isEscrowPayment(payment) || !bookings.length) return;
    const total = round2(payment.amount);
    const vatTotal = round2(payment.vat || 0);
    let given = 0, vatGiven = 0;
    for (const [i, b] of bookings.entries()) {
        const last = i === bookings.length - 1;
        const amount = last ? round2(total - given) : paidValueOf(b, payment);
        const vat = last ? round2(vatTotal - vatGiven) : (total > 0 ? round2(vatTotal * (amount / total)) : 0);
        given = round2(given + amount);
        vatGiven = round2(vatGiven + vat);
        const escrow = { status: 'HELD', amount, vat, refunded: 0, released: 0, stationAmount: 0, commission: 0 };
        await Booking.updateOne({ _id: b._id }, { $set: { escrow } });
        b.escrow = escrow;
    }
};

const remainingOf = (booking) => round2((booking.escrow?.amount || 0) - (booking.escrow?.refunded || 0) - (booking.escrow?.released || 0));

// Pay the media house: the advertiser's held money is spent; the station is
// credited with it less VAT and commission.
const payStation = async (booking, payment, amount, { note } = {}) => {
    const gross = round2(amount);
    if (!(gross > 0)) return { gross: 0, vat: 0, commission: 0, stationAmount: 0 };
    const { commissionPercent } = await getSettlementSettings();
    const vat = booking.escrow.amount > 0 ? round2((booking.escrow.vat || 0) * (gross / booking.escrow.amount)) : 0;
    const base = round2(gross - vat);
    const commission = round2(base * (commissionPercent / 100));
    const stationAmount = round2(base - commission);
    const meta = { campaignId: booking.campaignId, paymentId: payment._id, bookingId: booking._id };
    await spendHeld(payerOf(payment), gross, { ...meta, note: note || `Spot aired: ${booking.bookingReference}` });
    await creditStation(booking.stationId, stationAmount, {
        ...meta,
        note: `${booking.bookingReference}${booking.rateName ? ` · ${booking.rateName}` : ''}${commission ? ` (less ${commissionPercent}% commission)` : ''}`.slice(0, 300),
    });
    return { gross, vat, commission, stationAmount };
};

const loadForSettlement = async (bookingId, statuses) => {
    const booking = await Booking.findById(bookingId);
    if (!booking || !booking.escrow || !statuses.includes(booking.escrow.status)) return null;
    const payment = await Payment.findById(booking.paymentId);
    return payment ? { booking, payment } : null;
};

// Claim the booking's settlement (so two runs never pay twice), then pay.
const claim = async (booking, fromStatus, set) => {
    const res = await Booking.updateOne(
        { _id: booking._id, 'escrow.status': fromStatus },
        { $set: set }
    );
    return res.modifiedCount === 1;
};

// AIRED (or DISPUTED, by an admin) → RELEASED: the media house is paid.
const releaseBooking = async (bookingId, { from = ['AIRED'], note } = {}) => {
    const ctx = await loadForSettlement(bookingId, from);
    if (!ctx) return null;
    const { booking, payment } = ctx;
    const amount = remainingOf(booking);
    const now = new Date();
    if (!(await claim(booking, booking.escrow.status, { 'escrow.status': 'RELEASED', 'escrow.settledAt': now }))) return null;
    const paid = await payStation(booking, payment, amount, { note });
    await Booking.updateOne({ _id: booking._id }, {
        $set: {
            'escrow.released': round2((booking.escrow.released || 0) + paid.gross),
            'escrow.stationAmount': round2((booking.escrow.stationAmount || 0) + paid.stationAmount),
            'escrow.commission': round2((booking.escrow.commission || 0) + paid.commission),
        },
    });
    return { booking, ...paid };
};

// Money back to the advertiser's available balance (from what was held).
const refundToAdvertiser = async (booking, payment, amount, reason) => {
    const value = round2(amount);
    if (!(value > 0)) return 0;
    await unhold(payerOf(payment), value, {
        campaignId: booking.campaignId, paymentId: payment._id, bookingId: booking._id, note: reason.slice(0, 300),
    });
    return value;
};

// After the normal refund path (declined, not aired, cancelled) moved money
// back: record it on the hold, and pay any rest (a late-cancellation fee) to
// the media house.
const afterBookingRefund = async (bookingId, refundedAmount) => {
    const booking = await Booking.findById(bookingId);
    if (!booking || !booking.escrow || booking.escrow.status !== 'HELD') return;
    const refunded = round2((booking.escrow.refunded || 0) + (Number(refundedAmount) || 0));
    await Booking.updateOne({ _id: booking._id }, { $set: { 'escrow.refunded': refunded } });
    booking.escrow.refunded = refunded;
    await settleClosedHold(booking);
};

// A closed booking (declined / cancelled / not aired) whose hold is still open:
// the rest is a cancellation fee the media house keeps, or nothing is left.
const settleClosedHold = async (booking) => {
    if (!['REJECTED', 'CANCELLED', 'NOT_AIRED'].includes(booking.status) || booking.escrow?.status !== 'HELD') return;
    const rest = remainingOf(booking);
    const now = new Date();
    if (rest <= 0.005) {
        await claim(booking, 'HELD', { 'escrow.status': 'REFUNDED', 'escrow.settledAt': now });
        return;
    }
    const payment = await Payment.findById(booking.paymentId);
    if (!payment) return;
    if (!(await claim(booking, 'HELD', { 'escrow.status': booking.escrow.refunded > 0 ? 'SPLIT' : 'RELEASED', 'escrow.settledAt': now }))) return;
    const paid = await payStation(booking, payment, rest, { note: `Cancellation fee: ${booking.bookingReference}` });
    await Booking.updateOne({ _id: booking._id }, {
        $set: { 'escrow.released': paid.gross, 'escrow.stationAmount': paid.stationAmount, 'escrow.commission': paid.commission },
    });
};

// ── Media house marked the spot aired (proof attached) ──
const markAired = async (booking, proof, now = new Date()) => {
    const { disputeHours } = await getSettlementSettings();
    const releaseAt = new Date(now.getTime() + disputeHours * 3600000);
    await Booking.updateOne({ _id: booking._id, 'escrow.status': 'HELD' }, {
        $set: { 'escrow.status': 'AIRED', 'escrow.airedAt': now, 'escrow.releaseAt': releaseAt, 'escrow.proof': proof },
    });
    return { releaseAt, disputeHours };
};

const DISPUTE_REASONS = {
    NOT_AIRED: 'It did not air',
    WRONG_ADVERT: 'The wrong advert aired',
    WRONG_TIME: 'It aired at the wrong time or in the wrong programme',
    CUT_SHORT: 'It was cut short',
    OTHER: 'Something else',
};

const openDispute = async (booking, { reason, details }, now = new Date()) => {
    if (booking.escrow?.status !== 'AIRED') return { error: 'Only a spot marked aired and not yet paid out can be disputed' };
    if (booking.escrow.releaseAt && new Date(booking.escrow.releaseAt) <= now) return { error: 'The time to dispute this spot has passed' };
    if (!DISPUTE_REASONS[reason]) return { error: 'Choose what went wrong' };
    const ok = await claim(booking, 'AIRED', {
        'escrow.status': 'DISPUTED',
        'escrow.dispute': { reason, details: details || null, openedAt: now, resolvedAt: null, outcome: null, resolution: null },
    });
    return ok ? { ok: true } : { error: 'This spot changed; reload and try again' };
};

// Admin decision: RELEASE (pay the media house), REFUND (all back to the
// advertiser) or SPLIT (refund part, pay the rest).
const resolveDispute = async (bookingId, { outcome, refundAmount, resolution }, now = new Date()) => {
    const ctx = await loadForSettlement(bookingId, ['DISPUTED']);
    if (!ctx) return { error: 'This spot is not under dispute' };
    const { booking, payment } = ctx;
    const rest = remainingOf(booking);
    const dispute = { ...(booking.escrow.dispute?.toObject ? booking.escrow.dispute.toObject() : booking.escrow.dispute || {}), resolvedAt: now, outcome, resolution: resolution || null };

    if (outcome === 'RELEASE') {
        await Booking.updateOne({ _id: booking._id }, { $set: { 'escrow.dispute': dispute } });
        await releaseBooking(booking._id, { from: ['DISPUTED'], note: `Dispute resolved for the media house: ${booking.bookingReference}` });
        return { ok: true, refunded: 0 };
    }
    const refund = outcome === 'REFUND' ? rest : round2(Number(refundAmount));
    if (outcome === 'SPLIT' && !(refund > 0 && refund < rest)) return { error: `Refund between ₦1 and ₦${rest.toLocaleString()} for a split` };
    if (!['REFUND', 'SPLIT'].includes(outcome)) return { error: 'Choose release, refund or split' };

    const status = outcome === 'REFUND' ? 'REFUNDED' : 'SPLIT';
    if (!(await claim(booking, 'DISPUTED', { 'escrow.status': status, 'escrow.settledAt': now, 'escrow.dispute': dispute }))) {
        return { error: 'This spot changed; reload and try again' };
    }
    await refundToAdvertiser(booking, payment, refund, `Dispute upheld: ${booking.bookingReference}`);
    const set = {
        'escrow.refunded': round2((booking.escrow.refunded || 0) + refund),
        refundAmount: round2((Number(booking.refundAmount) || 0) + refund),
        refundedAt: now,
        ...(outcome === 'REFUND' ? { paymentStatus: 'REFUNDED' } : {}),
    };
    if (outcome === 'SPLIT') {
        booking.escrow.refunded = round2((booking.escrow.refunded || 0) + refund);
        const paid = await payStation(booking, payment, round2(rest - refund), { note: `Dispute split: ${booking.bookingReference}` });
        Object.assign(set, { 'escrow.released': paid.gross, 'escrow.stationAmount': paid.stationAmount, 'escrow.commission': paid.commission });
    }
    await Booking.updateOne({ _id: booking._id }, { $set: set });
    return { ok: true, refunded: refund };
};

// ── The background run (every few minutes, with the slot reminders) ──
// 1. Pay out spots whose dispute window has passed.
// 2. Alert the media house (and admins) about spots not confirmed in time.
// 3. Settle holds left on closed bookings.
const runSettlement = async (now = new Date(), { notifyOverdue } = {}) => {
    const out = { released: 0, overdue: 0, closed: 0 };

    const due = await Booking.find({ 'escrow.status': 'AIRED', 'escrow.releaseAt': { $lte: now } });
    for (const b of due) {
        if (await releaseBooking(b._id, { note: `Paid after the dispute window: ${b.bookingReference}` })) out.released += 1;
    }

    const { confirmHours } = await getSettlementSettings();
    const open = await Booking.find({ status: { $in: ['ACCEPTED', 'SCHEDULED', 'PENDING'] }, 'escrow.status': 'HELD' });
    for (const b of open) {
        const slotEnd = airTimeOf(b).getTime() + (Number(b.duration) || 0) * 60000;
        if (b.escrow.overdueAlertedAt || now.getTime() < slotEnd + confirmHours * 3600000) continue;
        const res = await Booking.updateOne({ _id: b._id, 'escrow.overdueAlertedAt': null }, { $set: { 'escrow.overdueAlertedAt': now } });
        if (res.modifiedCount && notifyOverdue) { await notifyOverdue(b, confirmHours); out.overdue += 1; }
    }

    const closed = await Booking.find({ status: { $in: ['REJECTED', 'CANCELLED', 'NOT_AIRED'] }, 'escrow.status': 'HELD' });
    for (const b of closed) { await settleClosedHold(b); out.closed += 1; }
    return out;
};

module.exports = {
    DEFAULTS,
    LIMITS,
    DISPUTE_REASONS,
    getSettlementSettings,
    isEscrowPayment,
    holdBookings,
    remainingOf,
    releaseBooking,
    afterBookingRefund,
    settleClosedHold,
    markAired,
    openDispute,
    resolveDispute,
    runSettlement,
};
