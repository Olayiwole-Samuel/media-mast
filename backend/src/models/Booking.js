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

        // A new date the station suggests when it asks to reschedule.
        proposedDate: {
            type: Date,
            default: null,
        },

        // Spot length bought (seconds, from the rate card: 60/45/30/15).
        spotSeconds: {
            type: Number,
            default: null,
        },

        // The advert (with its ARCON certificate) the station should air.
        creativeId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Creative',
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
                // The media house could not air the spot: refunded in full.
                'NOT_AIRED',
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

        // ── Money held until the spot airs (wallet bookings) ──
        // HELD      paid from the wallet, waiting for the spot to air
        // AIRED     media house confirmed it aired (with TX log + clip); the
        //           advertiser can dispute until releaseAt, then it's paid out
        // DISPUTED  the advertiser raised a problem; an admin decides
        // RELEASED  paid to the media house (aired, confirmed or not disputed)
        // REFUNDED  returned to the advertiser's wallet (declined, not aired, upheld dispute)
        // SPLIT     part paid to the media house, part refunded (admin decision)
        escrow: {
            type: new mongoose.Schema({
                status: { type: String, enum: ['HELD', 'AIRED', 'DISPUTED', 'RELEASED', 'REFUNDED', 'SPLIT'], default: 'HELD' },
                amount: { type: Number, default: 0 },          // what the advertiser paid for this spot (incl. VAT)
                refunded: { type: Number, default: 0 },        // returned to the advertiser
                released: { type: Number, default: 0 },        // taken from the advertiser for the media house
                stationAmount: { type: Number, default: 0 },   // credited to the media house (after VAT and commission)
                commission: { type: Number, default: 0 },
                vat: { type: Number, default: 0 },
                airedAt: { type: Date, default: null },
                releaseAt: { type: Date, default: null },      // end of the dispute window
                settledAt: { type: Date, default: null },
                overdueAlertedAt: { type: Date, default: null },
                proof: {
                    logFileId: { type: mongoose.Schema.Types.ObjectId, default: null },
                    logName: { type: String, default: null },
                    clipFileId: { type: mongoose.Schema.Types.ObjectId, default: null },
                    clipName: { type: String, default: null },
                    note: { type: String, default: null, maxlength: 1000 },
                },
                dispute: {
                    reason: { type: String, default: null },
                    details: { type: String, default: null, maxlength: 2000 },
                    openedAt: { type: Date, default: null },
                    resolvedAt: { type: Date, default: null },
                    outcome: { type: String, enum: ['RELEASE', 'REFUND', 'SPLIT', null], default: null },
                    resolution: { type: String, default: null, maxlength: 1000 },
                },
            }, { _id: false }),
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