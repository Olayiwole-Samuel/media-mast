const mongoose = require('mongoose');

const CreativeSchema = new mongoose.Schema({
    campaignId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Campaign',
        required: true,
    },
    name: {
        type: String,
        required: [true, 'Creative name is required'],
        trim: true,
    },
    description: {
        type: String,
        default: null,
        trim: true,
    },
    type: {
        type: String,
        enum: ['IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'OTHER'],
        default: 'IMAGE',
    },
    url: {
        type: String,
        required: [true, 'File URL is required'],
    },
    size: {
        type: Number,
        default: null,
    },
    mimeType: {
        type: String,
        default: null,
    },
    status: {
        type: String,
        enum: ['PENDING', 'APPROVED', 'REJECTED', 'REVISION_REQUESTED'],
        default: 'PENDING',
    },
    uploadedBy: {
        type: String,
        required: true,
    },
    uploadedAt: {
        type: Date,
        default: Date.now,
    },
    approvedAt: {
        type: Date,
        default: null,
    },
    approvedBy: {
        type: String,
        default: null,
    },
    version: {
        type: Number,
        default: 1,
    },
}, {
    timestamps: true,
});

// ── Indexes ──
CreativeSchema.index({ campaignId: 1 });
CreativeSchema.index({ status: 1 });
CreativeSchema.index({ type: 1 });

module.exports = mongoose.model('Creative', CreativeSchema);