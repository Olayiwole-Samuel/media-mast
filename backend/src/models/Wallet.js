const mongoose = require('mongoose');

// ─────────────────────────────────────────────────────────────
// WALLET — one per advertiser (a company, or an individual).
//
// The advertiser funds it at any time; every checkout is paid from it, and
// refunds (declined, cancelled or unaired spots) go back into it. The
// balance only changes through utils/wallet.js, which also writes a
// WalletTransaction for every movement.
// ─────────────────────────────────────────────────────────────

const WalletSchema = new mongoose.Schema(
    {
        // A company's wallet (shared by the whole company), or an individual's.
        companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

        currency: { type: String, default: 'NGN' },
        balance: { type: Number, default: 0, min: 0 },

        totalFunded: { type: Number, default: 0 },
        totalSpent: { type: Number, default: 0 },
        totalRefunded: { type: Number, default: 0 },

        // Alert the owner when the balance falls below this (0 = off).
        lowBalanceThreshold: { type: Number, default: 0, min: 0 },
        lowBalanceAlertedAt: { type: Date, default: null },
    },
    { timestamps: true }
);

WalletSchema.index({ companyId: 1 }, { unique: true, partialFilterExpression: { companyId: { $type: 'objectId' } } });
WalletSchema.index({ userId: 1 }, { unique: true, partialFilterExpression: { companyId: null, userId: { $type: 'objectId' } } });

module.exports = mongoose.models.Wallet || mongoose.model('Wallet', WalletSchema);
