const mongoose = require('mongoose');

const EmployeeSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true,
    },
    companyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true,
    },
    departmentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Department',
        default: null,
    },
    position: {
        type: String,
        default: 'Team Member',
    },
    permissions: {
        type: [String],
        default: [],
    },
    isActive: {
        type: Boolean,
        default: true,
    },
    invitedAt: {
        type: Date,
        default: null,
    },
    invitedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
    },
    acceptedAt: {
        type: Date,
        default: null,
    },
    // SHA-256 of the invitation token; the raw token is never stored.
    inviteTokenHash: {
        type: String,
        default: null,
        select: false,
    },
    inviteExpiresAt: {
        type: Date,
        default: null,
    },
}, {
    timestamps: true,
});

// ── Indexes ──
EmployeeSchema.index({ companyId: 1, isActive: 1 });

module.exports = mongoose.model('Employee', EmployeeSchema);