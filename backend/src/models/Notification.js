const mongoose = require('mongoose');

// An in-app notification (the bell). Email copies are sent separately.
const NotificationSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        type: {
            type: String,
            enum: [
                'BOOKING_REQUEST', 'BOOKING_STATUS', 'BOOKING_CANCELLED', 'PAYMENT_RECEIVED',
                'SLOT_REMINDER', 'NEW_STATION', 'SUBSCRIPTION', 'ACCOUNT',
            ],
            required: true,
        },
        title: { type: String, required: true, maxlength: 160 },
        body: { type: String, default: '', maxlength: 600 },
        link: { type: String, default: null, maxlength: 300 }, // a path in the app, e.g. /bookings
        readAt: { type: Date, default: null },
    },
    { timestamps: true }
);

NotificationSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.models.Notification || mongoose.model('Notification', NotificationSchema);
