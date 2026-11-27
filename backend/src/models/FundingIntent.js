const mongoose = require('mongoose');

// One Paystack wallet top-up, from "Add money" to the credit. The wallet is
// credited only when Paystack's verify API confirms the payment, and only
// once: the intent is moved to PAID in the same database transaction that
// adds the money (utils/funding.js).
//   PENDING   sent to Paystack, not paid (or not confirmed) yet
//   PAID      confirmed and credited
//   FAILED    Paystack says it failed (a retry on the same checkout can still succeed)
//   MISMATCH  Paystack confirmed something other than what was asked for: not
//             credited, an admin looks at it
const FundingIntentSchema = new mongoose.Schema(
    {
        reference: { type: String, required: true, unique: true },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
        amount: { type: Number, required: true, min: 0 }, // naira
        currency: { type: String, default: 'NGN' },
        mode: { type: String, enum: ['TEST', 'LIVE'], required: true }, // which Paystack key was in use
        status: { type: String, enum: ['PENDING', 'PAID', 'FAILED', 'MISMATCH'], default: 'PENDING' },
        // Page to return to after paying (the plan being built). Same-site path only.
        back: { type: String, default: null, maxlength: 400 },

        channel: { type: String, default: null }, // card, bank_transfer, ussd…
        fee: { type: Number, default: null }, // Paystack's charge, naira
        paystackId: { type: String, default: null },
        message: { type: String, default: null, maxlength: 300 },
        paidAt: { type: Date, default: null },
        lastCheckedAt: { type: Date, default: null },
        walletTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'WalletTransaction', default: null },
    },
    { timestamps: true }
);

FundingIntentSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.models.FundingIntent || mongoose.model('FundingIntent', FundingIntentSchema);
