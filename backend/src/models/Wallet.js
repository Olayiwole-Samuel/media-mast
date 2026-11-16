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
        // A media house's earnings wallet (aired spots, less VAT and commission).
        stationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Station', default: null },

        currency: { type: String, default: 'NGN' },
        // Advertiser: available to spend. Media house: earned, available to pay out.
        balance: { type: Number, default: 0, min: 0 },
        // Advertiser: paid for booked spots that haven't aired yet (not spent until they air).
        held: { type: Number, default: 0, min: 0 },

        totalFunded: { type: Number, default: 0 },
        totalSpent: { type: Number, default: 0 },
        totalRefunded: { type: Number, default: 0 },
        // Media house
        totalEarned: { type: Number, default: 0 },
        totalPaidOut: { type: Number, default: 0 },

        // Alert the owner when the balance falls below this (0 = off).
        lowBalanceThreshold: { type: Number, default: 0, min: 0 },
        lowBalanceAlertedAt: { type: Date, default: null },
    },
    { timestamps: true }
);

WalletSchema.index({ companyId: 1 }, { unique: true, partialFilterExpression: { companyId: { $type: 'objectId' } } });
// Individuals' wallets are found by userId (a company's or media house's wallet also records who opened it).
WalletSchema.index({ userId: 1 });
WalletSchema.index({ stationId: 1 }, { unique: true, partialFilterExpression: { stationId: { $type: 'objectId' } } });

module.exports = mongoose.models.Wallet || mongoose.model('Wallet', WalletSchema);
