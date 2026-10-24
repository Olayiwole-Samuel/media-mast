const mongoose = require('mongoose');

const AdminSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true,
    },
    permissions: {
        type: [String],
        default: [
            'MANAGE_COMPANIES',
            'MANAGE_STATIONS',
            'MANAGE_USERS',
            'VIEW_ANALYTICS',
            'HANDLE_DISPUTES',
            'VIEW_AUDIT_LOGS',
            'SYSTEM_SETTINGS',
        ],
    },
    isActive: {
        type: Boolean,
        default: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

module.exports = mongoose.model('Admin', AdminSchema);