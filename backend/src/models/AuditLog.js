
const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },

        companyId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Company',
            default: null,
        },

        action: {
            type: String,
            required: true,

            enum: [
                // ─────────────────────────────
                // Auth Actions
                // ─────────────────────────────
                'REGISTER',
                'LOGIN',
                'LOGOUT',
                'CHANGE_PASSWORD',
                'REQUEST_PASSWORD_RESET',
                'RESET_PASSWORD',
                'ACCEPT_EMPLOYEE_INVITE',

                // ─────────────────────────────
                // User Actions
                // ─────────────────────────────
                'UPDATE_USER',
                'DELETE_USER',
                'SUSPEND_USER',
                'ACTIVATE_USER',

                // ─────────────────────────────
                // Company Actions
                // ─────────────────────────────
                'CREATE_COMPANY',
                'UPDATE_COMPANY',
                'DELETE_COMPANY',
                'APPROVE_COMPANY',
                'REJECT_COMPANY',
                'SUSPEND_COMPANY',
                'REACTIVATE_COMPANY',
                'UPDATE_COMPANY_VERIFICATION',
                'UPDATE_COMPANY_LOGO',

                // ─────────────────────────────
                // Company Worker Actions
                // ─────────────────────────────
                'CREATE_COMPANY_WORKER',
                'UPDATE_COMPANY_WORKER',
                'REMOVE_COMPANY_WORKER',
                'ACTIVATE_COMPANY_WORKER',
                'DEACTIVATE_COMPANY_WORKER',
                'REACTIVATE_COMPANY_WORKER',

                // ─────────────────────────────
                // Employee Actions
                // ─────────────────────────────
                'INVITE_EMPLOYEE',
                'REMOVE_EMPLOYEE',
                'UPDATE_EMPLOYEE_ROLE',
                'UPDATE_EMPLOYEE_PERMISSIONS',
                'ACTIVATE_EMPLOYEE',
                'DEACTIVATE_EMPLOYEE',

                // ─────────────────────────────
                // Department Actions
                // ─────────────────────────────
                'CREATE_DEPARTMENT',
                'UPDATE_DEPARTMENT',
                'DELETE_DEPARTMENT',
                'ASSIGN_EMPLOYEE_DEPARTMENT',

                // ─────────────────────────────
                // Campaign Actions
                // ─────────────────────────────
                'CREATE_CAMPAIGN',
                'UPDATE_CAMPAIGN',
                'DELETE_CAMPAIGN',
                'SUBMIT_CAMPAIGN',
                'APPROVE_CAMPAIGN',
                'REJECT_CAMPAIGN',
                'PAUSE_CAMPAIGN',
                'RESUME_CAMPAIGN',
                'COMPLETE_CAMPAIGN',
                'UPDATE_CAMPAIGN_STATUS',

                // ─────────────────────────────
                // Booking Actions
                // ─────────────────────────────
                'CREATE_BOOKING',
                'UPDATE_BOOKING',
                'DELETE_BOOKING',
                'ACCEPT_BOOKING',
                'REJECT_BOOKING',
                'CANCEL_BOOKING',
                'COMPLETE_BOOKING',
                'SCHEDULE_BOOKING',
                'UPLOAD_BOOKING_PROOF',

                // ─────────────────────────────
                // Payment Actions
                // ─────────────────────────────
                'CREATE_PAYMENT',
                'UPDATE_PAYMENT',
                'VERIFY_PAYMENT',
                'REFUND_PAYMENT',

                // ─────────────────────────────
                // Subscription & Document Actions
                // ─────────────────────────────
                'CREATE_SUBSCRIPTION',
                'CANCEL_SUBSCRIPTION',
                'UPDATE_PLAN',
                'UPLOAD_DOCUMENT',
                'DELETE_DOCUMENT',
                'FAIL_PAYMENT',

                // ─────────────────────────────
                // Creative Actions
                // ─────────────────────────────
                'UPLOAD_CREATIVE',
                'UPDATE_CREATIVE',
                'DELETE_CREATIVE',
                'APPROVE_CREATIVE',
                'REJECT_CREATIVE',

                // ─────────────────────────────
                // Station Actions
                // ─────────────────────────────
                'CREATE_STATION',
                'UPDATE_STATION',
                'DELETE_STATION',
                'APPROVE_STATION',
                'REJECT_STATION',
                'UPDATE_STATION_INVENTORY_STATUS',
                'ACTIVATE_STATION',
                'DEACTIVATE_STATION',

                // ─────────────────────────────
                // Admin Actions
                // ─────────────────────────────
                'ADMIN_LOGIN',
                'ADMIN_LOGOUT',

                // ─────────────────────────────
                // System Actions
                // ─────────────────────────────
                'SYSTEM_ERROR',
                'SYSTEM_WARNING',
                'SYSTEM_INFO',
            ],
        },

        entityType: {
            type: String,
            required: true,

            enum: [
                'USER',
                'COMPANY',
                'EMPLOYEE',
                'CAMPAIGN',
                'BOOKING',
                'PAYMENT',
                'STATION',
                'DEPARTMENT',
                'CREATIVE',
                'SCHEDULE',
                'SYSTEM',
                'SUBSCRIPTION',
                'DOCUMENT',
            ],
        },

        entityId: {
            type: String,
            default: null,
        },

        changes: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },

        metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },

        ipAddress: {
            type: String,
            default: null,
        },

        userAgent: {
            type: String,
            default: null,
        },

        sessionId: {
            type: String,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

// ─────────────────────────────
// Indexes
// ─────────────────────────────

AuditLogSchema.index({
    userId: 1,
    createdAt: -1,
});

AuditLogSchema.index({
    companyId: 1,
    createdAt: -1,
});

AuditLogSchema.index({
    action: 1,
});

AuditLogSchema.index({
    entityType: 1,
    entityId: 1,
});

AuditLogSchema.index({
    createdAt: -1,
});

module.exports = mongoose.model(
    'AuditLog',
    AuditLogSchema
);

