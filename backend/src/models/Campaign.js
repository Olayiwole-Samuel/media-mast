const mongoose = require('mongoose');

const CampaignSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Campaign name is required'],
        trim: true,
        maxlength: [100, 'Campaign name cannot exceed 100 characters'],
    },
    description: {
        type: String,
        default: null,
        trim: true,
    },
    objective: {
    type: String,
    trim: true,
    required: true,
},
    status: {
        type: String,
        enum: [
            'DRAFT',
            'SUBMITTED',
            'PAYMENT_PENDING',
            'PAYMENT_SUCCESSFUL',
            'BOOKING_REQUESTS_SENT',
            'MEDIA_REVIEW',
            'ACCEPTED',
            'REJECTED',
            'REVISION_REQUESTED',
            'CREATIVE_APPROVED',
            'SCHEDULED',
            'LIVE',
            'PROOF_UPLOADED',
            'COMPANY_REVIEW',
            'COMPLETED',
            'CANCELLED',
            'EXPIRED',
            'REFUNDED',
            'DISPUTED',
            'FAILED'
        ],
        default: 'DRAFT',
    },
    budget: {
        type: Number,
        required: [true, 'Budget is required'],
        min: [0, 'Budget cannot be negative'],
    },
    currency: {
        type: String,
        default: 'NGN',
        uppercase: true,
    },
    startDate: {
        type: Date,
        default: null,
    },
    endDate: {
        type: Date,
        default: null,
    },
    scheduledDate: {
        type: Date,
        default: null,
    },
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
    totalReach: {
        type: Number,
        default: 0,
    },
    engagement: {
        type: Number,
        default: 0,
    },
    progress: {
        type: Number,
        default: 0,
        min: 0,
        max: 100,
    },
}, {
    timestamps: true,
});

// ── Indexes for faster queries ──
CampaignSchema.index({ companyId: 1, createdAt: -1 });
CampaignSchema.index({ status: 1 });
CampaignSchema.index({ userId: 1 });
CampaignSchema.index({ startDate: 1, endDate: 1 });

module.exports = mongoose.model('Campaign', CampaignSchema);