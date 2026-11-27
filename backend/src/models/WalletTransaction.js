const mongoose = require('mongoose');

// One movement of money in or out of a wallet. Amounts are always positive;
// the type says which way it went.
//   FUND        money added by the advertiser
//   HOLD        a checkout: the spots' money set aside until they air (not spent yet)
//   CHARGE      a spot aired: its held money is paid to the media house (spent)
//   REFUND      money returned (declined / cancelled / not aired / upheld dispute, or a failed checkout)
//   ADJUSTMENT  an admin correction (e.g. a bank transfer received); may be negative
// Media house wallets:
//   EARNING     an aired spot paid in (after VAT and commission)
//   PAYOUT      money sent to the media house's bank (or a payout request)
//   PAYOUT_REVERSED  a payout request that was declined: back to the balance

const WalletTransactionSchema = new mongoose.Schema(
    {
        walletId: { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet', required: true },
        type: { type: String, enum: ['FUND', 'CHARGE', 'REFUND', 'ADJUSTMENT', 'HOLD', 'EARNING', 'PAYOUT', 'PAYOUT_REVERSED'], required: true },
        // CHARGE/REFUND/FUND: positive. ADJUSTMENT: signed.
        amount: { type: Number, required: true },
        balanceAfter: { type: Number, required: true },
        currency: { type: String, default: 'NGN' },

        reference: { type: String, default: null },
        // How the money came in: TEST (instant test mode), PAYSTACK_TEST (Paystack's
        // test mode), PAYSTACK (real money), ADMIN.
        method: { type: String, default: null },

        campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', default: null },
        paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', default: null },
        bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null },
        note: { type: String, default: null, maxlength: 300 },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    },
    { timestamps: true }
);

WalletTransactionSchema.index({ walletId: 1, createdAt: -1 });

module.exports = mongoose.models.WalletTransaction || mongoose.model('WalletTransaction', WalletTransactionSchema);
