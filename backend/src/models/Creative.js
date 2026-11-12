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
    // The advert file, uploaded to Media Masters (GridFS "creatives" bucket).
    // Older creatives may only have a url; new ones always have a file.
    fileId: {
        type: mongoose.Schema.Types.ObjectId,
        default: null,
    },
    fileName: {
        type: String,
        default: null,
    },
    url: {
        type: String,
        default: null,
    },
    // Length of a video/audio advert in seconds (matches the spot bought).
    durationSeconds: {
        type: Number,
        default: null,
    },
    // ARCON (Advertising Regulatory Council of Nigeria) pre-exposure approval:
    // every advert must carry its certificate before it can be uploaded.
    arcon: {
        certificateNumber: { type: String, trim: true, maxlength: 60, default: null },
        fileId: { type: mongoose.Schema.Types.ObjectId, default: null },
        fileName: { type: String, default: null },
        contentType: { type: String, default: null },
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