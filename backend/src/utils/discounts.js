// ─────────────────────────────────────────────────────────────
// CHECKOUT DISCOUNTS
//
// Booking across several stations in one checkout earns a discount on the
// spots' list prices: by default 5% for 3+ stations and 10% for 5+.
// Override with MULTI_STATION_DISCOUNTS="3:5,5:10" (min stations:percent).
// A subscription plan can add its own percentage on top (planPercent).
// The total is capped at MAX_DISCOUNT_PERCENT.
// ─────────────────────────────────────────────────────────────

const DEFAULT_TIERS = [
    { minStations: 3, percent: 5 },
    { minStations: 5, percent: 10 },
];
const MAX_DISCOUNT_PERCENT = 30;

const round2 = (n) => Math.round(n * 100) / 100;

const parseTiers = (raw) => {
    if (typeof raw !== 'string' || !raw.trim()) return null;
    const tiers = raw.split(',').map((part) => {
        const [min, pct] = part.split(':').map((x) => Number(String(x).trim()));
        return { minStations: min, percent: pct };
    });
    const valid = tiers.every((t) => Number.isInteger(t.minStations) && t.minStations >= 2 && Number.isFinite(t.percent) && t.percent >= 0 && t.percent <= MAX_DISCOUNT_PERCENT);
    return valid ? tiers.sort((a, b) => a.minStations - b.minStations) : null;
};

// Invalid configuration falls back to the defaults rather than failing checkout.
const getDiscountTiers = () => parseTiers(process.env.MULTI_STATION_DISCOUNTS) || DEFAULT_TIERS;

const multiStationPercent = (stationCount, tiers = getDiscountTiers()) =>
    tiers.reduce((best, t) => (stationCount >= t.minStations ? Math.max(best, t.percent) : best), 0);

// { percent, multiStationPercent, planPercent, amount } for a subtotal.
const discountFor = ({ subtotal, stationCount, planPercent = 0 }) => {
    const multi = multiStationPercent(stationCount);
    const plan = Number.isFinite(Number(planPercent)) ? Math.max(0, Number(planPercent)) : 0;
    const percent = Math.min(MAX_DISCOUNT_PERCENT, round2(multi + plan));
    return {
        percent,
        multiStationPercent: multi,
        planPercent: plan,
        amount: round2((Number(subtotal) || 0) * (percent / 100)),
    };
};

module.exports = {
    DEFAULT_TIERS,
    MAX_DISCOUNT_PERCENT,
    getDiscountTiers,
    multiStationPercent,
    discountFor,
};
