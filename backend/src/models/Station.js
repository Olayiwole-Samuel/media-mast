const mongoose = require('mongoose');

const StationSchema = new mongoose.Schema(
    {
        // ============================================================
        // BASIC INFORMATION
        // ============================================================

        name: {
            type: String,
            required: [true, 'Station name is required'],
            trim: true,
            maxlength: 150,
        },

        slug: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },

        type: {
            type: String,
            required: [true, 'Station type is required'],
            enum: [
                'TV',
                'RADIO',
                'PRESS',
                'BILLBOARD',
                'DIGITAL',
            ],
        },

        description: {
            type: String,
            default: null,
            trim: true,
        },

        // ============================================================
        // MEDIA COMPANY OWNER
        // ============================================================

        // Optional media company that owns the station (stations are run by
        // Media Masters admins and assigned station managers, managerIds).
        companyId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Company',
            default: null,
        },

        // ============================================================
        // LOCATION
        // ============================================================

        location: {
            address: {
                type: String,
                default: null,
                trim: true,
            },

            city: {
                type: String,
                default: null,
                trim: true,
            },

            state: {
                type: String,
                default: null,
                trim: true,
            },

            country: {
                type: String,
                default: 'Nigeria',
                trim: true,
            },

            coordinates: {
                latitude: {
                    type: Number,
                    default: null,
                },

                longitude: {
                    type: Number,
                    default: null,
                },
            },
        },

        // ============================================================
        // CONTACT INFORMATION
        // ============================================================

        phone: {
            type: String,
            default: null,
            trim: true,
        },

        email: {
            type: String,
            default: null,
            trim: true,
        },

        website: {
            type: String,
            default: null,
            trim: true,
        },

        // ============================================================
        // IMAGES
        // ============================================================

        logo: {
            type: String,
            default: null,
        },

        coverImage: {
            type: String,
            default: null,
        },

        images: {
            type: [String],
            default: [],
        },

        // ============================================================
        // ADVERTISING INFORMATION
        // ============================================================

        specifications: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },

        advertisingFormats: {
            type: [String],
            default: [],
        },

        features: {
            type: [String],
            default: [],
        },

        // ============================================================
        // PRICING
        // ============================================================

        pricing: {
            amount: {
                type: Number,
                default: 0,
                min: 0,
            },

            currency: {
                type: String,
                default: 'NGN',
                uppercase: true,
                trim: true,
            },

            unit: {
                type: String,
                enum: [
                    'DAY',
                    'WEEK',
                    'MONTH',
                    'CAMPAIGN',
                    'SPOT',
                    'IMPRESSION',
                    'CUSTOM',
                ],
                default: 'WEEK',
            },
        },

        // ============================================================
        // RATE CARD
        // The station's own published rates (set by its station managers).
        // TV/radio: TIME_BELT entries (e.g. AAA 19:00–22:00, 30s spot).
        // Press/billboard/digital: PLACEMENT entries (e.g. full page, colour).
        // When a station has active entries, a booking must pick one and is
        // charged its price; otherwise pricing.amount applies.
        // ============================================================

        rateCard: {
            type: [
                new mongoose.Schema(
                    {
                        name: { type: String, required: true, trim: true, maxlength: 80 },
                        kind: { type: String, enum: ['TIME_BELT', 'PLACEMENT'], required: true },
                        code: { type: String, trim: true, maxlength: 30, default: null },
                        startTime: { type: String, default: null }, // HH:mm, TIME_BELT only
                        endTime: { type: String, default: null }, // HH:mm; before startTime = runs past midnight
                        spotSeconds: { type: Number, min: 1, max: 3600, default: null },
                        size: { type: String, trim: true, maxlength: 40, default: null },
                        colour: { type: String, enum: ['COLOUR', 'BLACK_WHITE', null], default: null },
                        price: { type: Number, required: true, min: 1 },
                        isActive: { type: Boolean, default: true },
                    },
                    { _id: true }
                ),
            ],
            default: [],
        },

        // ============================================================
        // AVAILABILITY
        // ============================================================

        availability: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },

        operatingHours: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },

        // ============================================================
        // ADMIN APPROVAL
        // ============================================================

        approvalStatus: {
            type: String,
            enum: [
                'PENDING',
                'APPROVED',
                'REJECTED',
            ],
            default: 'PENDING',
        },

        // ============================================================
        // INVENTORY STATUS
        // ============================================================

        inventoryStatus: {
            type: String,
            enum: [
                'AVAILABLE',
                'BOOKED',
                'UNAVAILABLE',
                'MAINTENANCE',
            ],
            default: 'AVAILABLE',
        },

        isActive: {
            type: Boolean,
            default: true,
        },

        // ============================================================
        // MARKETPLACE INFORMATION
        // ============================================================

        reach: {
            type: String,
            default: null,
            trim: true,
        },

        rating: {
            type: Number,
            default: 0,
            min: 0,
            max: 5,
        },

        reviews: {
            type: Number,
            default: 0,
            min: 0,
        },

        // ============================================================
        // SOCIAL MEDIA
        // ============================================================

        social: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },

        // ============================================================
        // ADMIN REFERENCE
        // ============================================================

        adminId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },

        // Station managers (STATION accounts created by admins) who run this
        // station's desk: bookings, prices, calendar. A manager can be
        // assigned to many stations and a station can have many managers.
        managerIds: {
            type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
            default: [],
        },

        // ── Calendar ──
        // Weekly airtime: per weekday, the bookable window ("HH:mm"–"HH:mm"),
        // or null for a day off. An empty object means no weekly limits.
        airtimeHours: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },

        // Blocked dates (days off, maintenance, holidays…): no booking may
        // overlap them. Without a time window the whole day is blocked.
        blackouts: {
            type: [{
                startDate: { type: Date, required: true },
                endDate: { type: Date, required: true },
                startTime: { type: String, default: null },
                endTime: { type: String, default: null },
                reason: {
                    type: String,
                    enum: ['OFF_AIR', 'MAINTENANCE', 'HOLIDAY', 'FULLY_BOOKED', 'OTHER'],
                    default: 'OTHER',
                },
                note: { type: String, default: null, maxlength: 500 },
                createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
                createdAt: { type: Date, default: Date.now },
            }],
            default: [],
        },

        // Short-lived lock taken while a booking is being created, so two
        // simultaneous requests can't both reserve the same airtime.
        bookingLockUntil: {
            type: Date,
            default: null,
            select: false,
        },
    },
    {
        timestamps: true,
    }
);

// ============================================================
// INDEXES
// ============================================================

StationSchema.index({ companyId: 1 });
StationSchema.index({ type: 1 });
StationSchema.index({ approvalStatus: 1 });
StationSchema.index({ inventoryStatus: 1 });
StationSchema.index({ companyId: 1, type: 1 });
StationSchema.index({ companyId: 1, inventoryStatus: 1 });

module.exports = mongoose.model('Station', StationSchema);