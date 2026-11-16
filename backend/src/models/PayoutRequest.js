const mongoose = require('mongoose');

// A media house asking for its earned money to be sent to its bank.
// The amount leaves its earnings balance when requested; an admin sends the
// transfer and marks it PAID (with the bank reference), or DECLINES it, which
// puts the amount back. Paystack transfers can replace the manual step later.
const PayoutRequestSchema = new mongoose.Schema(
    {
        stationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Station', required: true },
        amount: { type: Number, required: true, min: 0 },
        currency: { type: String, default: 'NGN' },
        status: { type: String, enum: ['PENDING', 'PAID', 'DECLINED'], default: 'PENDING' },
        // The bank account at the time of the request.
        account: {
            bankName: { type: String, default: null },
            accountNumber: { type: String, default: null },
            accountName: { type: String, default: null },
        },
        requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        decidedAt: { type: Date, default: null },
        reference: { type: String, default: null, maxlength: 120 }, // bank transfer reference
        note: { type: String, default: null, maxlength: 500 },
    },
    { timestamps: true }
);

PayoutRequestSchema.index({ stationId: 1, createdAt: -1 });
PayoutRequestSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.models.PayoutRequest || mongoose.model('PayoutRequest', PayoutRequestSchema);
