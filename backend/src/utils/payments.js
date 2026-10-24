const crypto = require('crypto');

// ─────────────────────────────────────────────────
// PAYMENT PROVIDER
//
// Checkout charges through a provider with this interface:
//
//   charge({ amount, currency, reference })
//     → { status: 'SUCCESSFUL', providerReference }
//   refund({ payment, amount, reason })
//     → { status: 'REFUNDED', refundReference }
//
// Only the STUB provider exists for the MVP: it records the payment as
// successful immediately and NO MONEY MOVES. Payments, bookings and
// refunds are still fully recorded (Payment.provider = 'STUB'), so a real
// provider (e.g. Paystack: initialize → redirect → verified webhook) can
// replace it later without changing the booking flow.
//
// PAYMENT_PROVIDER selects the provider (default: stub). An unknown value
// fails closed: checkout refuses instead of guessing.
// ─────────────────────────────────────────────────

const stubProvider = {
    name: 'STUB',
    isTestMode: true,

    async charge({ reference }) {
        return {
            status: 'SUCCESSFUL',
            providerReference: `STUB-${reference}`,
        };
    },

    async refund() {
        return {
            status: 'REFUNDED',
            refundReference: `STUB-RF-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
        };
    },
};

const PROVIDERS = { stub: stubProvider };

// Tests may swap the provider (failure injection); production code never does.
let override = null;

const getPaymentProvider = () => {
    if (override) return override;

    const name = String(process.env.PAYMENT_PROVIDER || 'stub').trim().toLowerCase();
    const provider = PROVIDERS[name];

    if (!provider) {
        const error = new Error(`Unknown PAYMENT_PROVIDER "${name}"`);
        error.code = 'PAYMENT_PROVIDER_UNAVAILABLE';
        throw error;
    }

    return provider;
};

const setPaymentProviderForTests = (provider) => {
    override = provider || null;
};

const generatePaymentReference = () =>
    `PAY-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

// Platform fee (percent of the stations' total), added at checkout.
// Default 0. Invalid values fall back to 0 rather than overcharging.
const getPlatformFeePercent = () => {
    const raw = Number(process.env.PLATFORM_FEE_PERCENT);
    return Number.isFinite(raw) && raw >= 0 && raw <= 50 ? raw : 0;
};

module.exports = {
    getPaymentProvider,
    setPaymentProviderForTests,
    generatePaymentReference,
    getPlatformFeePercent,
};
