const mongoose = require('mongoose');

const BookingSchema = new mongoose.Schema(
    {
        bookingReference: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },

        campaignId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Campaign',
            required: true,
        },

        stationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Station',
            required: true,
        },

        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },

        // The advertiser's company; null when an individual booked.
        companyId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Company',
            default: null,
        },

        slot: {
            type: String,
            required: true,
            trim: true,
        },

        date: {
            type: Date,
            required: true,
        },

        time: {
            type: String,
            required: true,
            match: /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/,
        },

        duration: {
            type: Number,
            required: true,
            min: [1, 'Duration must be at least 1 minute'],
        },

        // List price of the spot (the station's rate). A multi-station
        // discount is applied to the payment, not here.
        price: {
            type: Number,
            required: true,
            min: [0, 'Price cannot be negative'],
        },

        // The rate-card entry this spot was booked at (null = standard price),
        // with its name kept as booked even if the station edits its card later.
        rateId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
        },
        rateName: {
            type: String,
            default: null,
        },

        currency: {
            type: String,
            default: 'NGN',
            uppercase: true,
            trim: true,
        },

        status: {
            type: String,
            enum: [
                'PENDING',
                'ACCEPTED',
                'REJECTED',
                'CHANGES_REQUESTED',
                'SCHEDULED',
                'COMPLETED',
                'CANCELLED',
            ],
            default: 'PENDING',
        },

        stationResponse: {
            type: String,
            default: null,
        },

        stationNote: {
            type: String,
            default: null,
        },

        proofUrl: {
            type: String,
            default: null,
        },

        proofUploadedAt: {
            type: Date,
            default: null,
        },

        proofVerified: {
            type: Boolean,
            default: false,
        },

        // ── Payment (checkout) ──
        // UNPAID: created by the direct booking endpoint (no payment).
        // PAID: created by checkout together with its Payment.
        // REFUNDED: rejected or cancelled after payment.
        paymentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Payment',
            default: null,
        },

        paymentStatus: {
            type: String,
            enum: ['UNPAID', 'PAID', 'REFUNDED'],
            default: 'UNPAID',
        },

        // Slot reminders already sent (each goes once).
        reminder24SentAt: {
            type: Date,
            default: null,
        },
        reminder1SentAt: {
            type: Date,
            default: null,
        },

        refundedAt: {
            type: Date,
            default: null,
        },

        // ── Cancellation outcome ──
        // refundAmount: what went back to the advertiser; cancellationFee:
        // what was kept under the cancellation policy (utils/cancellationPolicy.js).
        refundAmount: {
            type: Number,
            default: null,
            min: 0,
        },

        cancellationFee: {
            type: Number,
            default: null,
            min: 0,
        },

        cancelledBy: {
            type: String,
            enum: ['CUSTOMER', 'STATION', null],
            default: null,
        },

        cancellationReason: {
            type: String,
            default: null,
            maxlength: 500,
        },
    },
    {
        timestamps: true,
    }
);

// ── Indexes ──


BookingSchema.index({ campaignId: 1 });
BookingSchema.index({ stationId: 1 });
BookingSchema.index({ companyId: 1, createdAt: -1 });
BookingSchema.index({ status: 1 });
BookingSchema.index({ date: 1 });

module.exports = mongoose.model('Booking', BookingSchema);