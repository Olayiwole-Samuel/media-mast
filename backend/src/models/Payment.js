const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema({
    campaignId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Campaign',
        required: true,
    },
    // The payer's company; null when an individual paid.
    companyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        default: null,
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    // amount = subtotal (stations' list prices) − discount + platformFee
    amount: {
        type: Number,
        required: true,
        min: 0,
    },
    subtotal: {
        type: Number,
        default: null,
        min: 0,
    },
    platformFee: {
        type: Number,
        default: 0,
        min: 0,
    },
    // Multi-station (and plan) discount taken off the subtotal at checkout.
    discount: {
        type: Number,
        default: 0,
        min: 0,
    },
    discountPercent: {
        type: Number,
        default: 0,
        min: 0,
    },
    currency: {
        type: String,
        default: 'NGN',
    },
    reference: {
        type: String,
        required: true,
        unique: true, // ← This creates the index
    },
    status: {
        type: String,
        enum: ['PENDING', 'SUCCESSFUL', 'FAILED', 'REFUNDED', 'DISPUTED'],
        default: 'PENDING',
    },
    provider: {
        type: String,
        default: 'PAYSTACK',
    },
    providerReference: {
        type: String,
        default: null,
    },
    providerData: {
        type: mongoose.Schema.Types.Mixed,
        default: null,
    },
    refundAmount: {
        type: Number,
        default: null,
    },
    refundReference: {
        type: String,
        default: null,
    },
    refundedAt: {
        type: Date,
        default: null,
    },
    initiatedAt: {
        type: Date,
        default: Date.now,
    },
    verifiedAt: {
        type: Date,
        default: null,
    },
    failedAt: {
        type: Date,
        default: null,
    },
    description: {
        type: String,
        default: null,
    },
}, {
    timestamps: true,
});

// ── Remove duplicate index - reference already has unique: true ──
// PaymentSchema.index({ reference: 1 }); // ← REMOVED - duplicate

// ── Keep only these indexes ──
PaymentSchema.index({ companyId: 1, createdAt: -1 });
PaymentSchema.index({ campaignId: 1 });
PaymentSchema.index({ status: 1 });

module.exports = mongoose.model('Payment', PaymentSchema);