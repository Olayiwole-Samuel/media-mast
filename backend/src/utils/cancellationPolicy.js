// ─────────────────────────────────────────────────
// CANCELLATION POLICY (advertiser-initiated)
//
//   • Cancelling closes 2 hours (CANCEL_CUTOFF_HOURS) before the spot airs: from then on (and
//     once it has aired) it can't be cancelled at all (rule TOO_LATE).
//   • Not paid → nothing to refund.
//   • The campaign hasn't started yet (its first spot hasn't aired) → full
//     refund.
//   • The campaign is in progress → refund minus a fee that grows with
//     progress: 10% + 10% × progress, so between 10% and at most 20%.
//     Progress = share of the campaign's booked value that has aired.
//
// Station-caused cancellations (declined, blocked dates) are always
// refunded in full and don't use this policy.
//
// Times: booking dates are date-only and times "HH:mm" in Lagos time
// (WAT, UTC+1, no daylight saving).
// ─────────────────────────────────────────────────

// Cancelling closes this many hours before broadcast.
const CANCEL_CUTOFF_HOURS = 2;
const MIN_FEE_PERCENT = 10;
const MAX_FEE_PERCENT = 20;
const LAGOS_UTC_OFFSET_MINUTES = 60;

const RELEASED = ['REJECTED', 'CANCELLED'];

const round2 = (n) => Math.round(n * 100) / 100;

const airTimeOf = (booking) => {
    const d = new Date(booking.date);
    const [h, m] = String(booking.time || '00:00').split(':').map(Number);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, m) - LAGOS_UTC_OFFSET_MINUTES * 60000);
};

// What the advertiser actually paid for this spot: its share of the payment
// (list price ÷ the checkout's list-price subtotal × the amount charged), so
// any multi-station discount and the platform fee are both reflected.
// Payment may be null for unpaid bookings.
const paidValueOf = (booking, payment) => {
    const price = Number(booking.price) || 0;
    const subtotal = Number(payment?.subtotal) || 0;
    const amount = Number(payment?.amount);
    if (subtotal > 0 && Number.isFinite(amount)) return round2((price / subtotal) * amount);
    return round2(price);
};

// Cancelling is allowed until CANCEL_CUTOFF_HOURS before the spot airs.
const canStillCancel = (booking, now = new Date()) =>
    airTimeOf(booking).getTime() - now.getTime() > CANCEL_CUTOFF_HOURS * 3600000;

// Campaign progress (0–1) and start, from the campaign's bookings.
const campaignProgress = (campaignBookings, now) => {
    const live = campaignBookings.filter((b) => !RELEASED.includes(b.status));
    if (!live.length) return { started: false, progress: 0, startsAt: null };

    const startsAt = new Date(Math.min(...live.map((b) => airTimeOf(b).getTime())));
    const total = live.reduce((sum, b) => sum + (Number(b.price) || 0), 0);
    const aired = live
        .filter((b) => b.status === 'COMPLETED' || airTimeOf(b) <= now)
        .reduce((sum, b) => sum + (Number(b.price) || 0), 0);

    return {
        started: now >= startsAt,
        progress: total > 0 ? Math.min(1, aired / total) : 0,
        startsAt,
    };
};

const feePercentFor = (progress) =>
    Math.min(MAX_FEE_PERCENT, round2(MIN_FEE_PERCENT + (MAX_FEE_PERCENT - MIN_FEE_PERCENT) * progress));

const quoteCancellation = ({ booking, payment, campaignBookings, now = new Date() }) => {
    const airsAt = airTimeOf(booking);
    const paid = booking.paymentStatus === 'PAID';
    const paidValue = paid ? paidValueOf(booking, payment) : 0;
    const { started, progress, startsAt } = campaignProgress(campaignBookings || [booking], now);
    const hoursToAir = (airsAt.getTime() - now.getTime()) / 3600000;

    const base = {
        paid,
        paidValue,
        airsAt,
        campaignStartsAt: startsAt,
        campaignStarted: started,
        progress: round2(progress),
    };

    if (hoursToAir <= CANCEL_CUTOFF_HOURS) {
        return {
            ...base,
            refundAmount: 0,
            fee: 0,
            feePercent: 0,
            rule: 'TOO_LATE',
            explanation: hoursToAir <= 0
                ? 'This spot has already aired, so it can no longer be cancelled.'
                : `Cancellations close ${CANCEL_CUTOFF_HOURS} hours before broadcast, so this spot can no longer be cancelled.`,
        };
    }

    if (!paid) {
        return { ...base, refundAmount: 0, fee: 0, feePercent: 0, rule: 'NOT_PAID', explanation: 'This booking was not paid, so there is nothing to refund.' };
    }

    if (!started) {
        return { ...base, refundAmount: paidValue, fee: 0, feePercent: 0, rule: 'BEFORE_START', explanation: 'Your campaign has not started yet, so this is a free cancellation.' };
    }

    const feePercent = feePercentFor(progress);
    const fee = round2(paidValue * (feePercent / 100));
    return {
        ...base,
        refundAmount: round2(paidValue - fee),
        fee,
        feePercent,
        rule: 'IN_PROGRESS',
        explanation: `Your campaign is ${Math.round(progress * 100)}% through, so a ${feePercent}% cancellation fee applies.`,
    };
};

module.exports = {
    CANCEL_CUTOFF_HOURS,
    canStillCancel,
    MIN_FEE_PERCENT,
    MAX_FEE_PERCENT,
    RELEASED,
    airTimeOf,
    paidValueOf,
    campaignProgress,
    feePercentFor,
    quoteCancellation,
};
