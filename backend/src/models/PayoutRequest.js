const mongoose = require('mongoose');

// A media house asking for its earned money to be sent to its bank.
// The amount leaves its earnings balance when requested. An admin either
// sends it with Paystack (PROCESSING → PAID, or back to PENDING if it fails;
// utils/payouts.js), or sends it by hand and marks it PAID with the bank
// reference, or DECLINES it, which puts the amount back.
const PayoutRequestSchema = new mongoose.Schema(
    {
        stationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Station', required: true },
        amount: { type: Number, required: true, min: 0 },
        currency: { type: String, default: 'NGN' },
        status: { type: String, enum: ['PENDING', 'PROCESSING', 'PAID', 'DECLINED'], default: 'PENDING' },
        // The bank account at the time of the request.
        account: {
            bankName: { type: String, default: null },
            bankCode: { type: String, default: null }, // Paystack's code for the bank
            accountNumber: { type: String, default: null },
            accountName: { type: String, default: null },
        },
        requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        decidedAt: { type: Date, default: null },
        reference: { type: String, default: null, maxlength: 120 }, // bank transfer reference
        note: { type: String, default: null, maxlength: 500 },

        // Paystack transfer (provider PAYSTACK)
        provider: { type: String, enum: ['MANUAL', 'PAYSTACK'], default: 'MANUAL' },
        mode: { type: String, enum: ['TEST', 'LIVE', null], default: null },
        attempt: { type: Number, default: 1 }, // goes up only after a definite failure
        transferReference: { type: String, default: null },
        transferCode: { type: String, default: null },
        transferStatus: { type: String, default: null }, // Paystack's word: pending, otp, success…
        sentAt: { type: Date, default: null },
        failure: { type: String, default: null, maxlength: 300 }, // why the last try failed
    },
    { timestamps: true }
);

PayoutRequestSchema.index({ stationId: 1, createdAt: -1 });
PayoutRequestSchema.index({ status: 1, createdAt: -1 });
PayoutRequestSchema.index({ transferReference: 1 }, { partialFilterExpression: { transferReference: { $type: 'string' } } });

module.exports = mongoose.models.PayoutRequest || mongoose.model('PayoutRequest', PayoutRequestSchema);
