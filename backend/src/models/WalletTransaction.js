const mongoose = require('mongoose');

// One movement of money in or out of a wallet. Amounts are always positive;
// the type says which way it went.
//   FUND        money added by the advertiser (test mode now; Paystack later)
//   CHARGE      a checkout paid from the wallet
//   REFUND      money returned (declined / cancelled / unaired spots, or a failed checkout)
//   ADJUSTMENT  an admin correction (e.g. a bank transfer received); may be negative

const WalletTransactionSchema = new mongoose.Schema(
    {
        walletId: { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet', required: true },
        type: { type: String, enum: ['FUND', 'CHARGE', 'REFUND', 'ADJUSTMENT'], required: true },
        // CHARGE/REFUND/FUND: positive. ADJUSTMENT: signed.
        amount: { type: Number, required: true },
        balanceAfter: { type: Number, required: true },
        currency: { type: String, default: 'NGN' },

        reference: { type: String, default: null },
        // How the money came in: TEST (test mode), PAYSTACK, ADMIN.
        method: { type: String, default: null },

        campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', default: null },
        paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', default: null },
        note: { type: String, default: null, maxlength: 300 },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    },
    { timestamps: true }
);

WalletTransactionSchema.index({ walletId: 1, createdAt: -1 });

module.exports = mongoose.models.WalletTransaction || mongoose.model('WalletTransaction', WalletTransactionSchema);
