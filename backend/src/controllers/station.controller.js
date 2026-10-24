const mongoose = require('mongoose');
const Station = require('../models/Station');
const { publicCalendar } = require('../utils/stationCalendar');

// ─────────────────────────────────────────────────────────────
// PUBLIC STATION CATALOGUE
//
// Station lifecycle (models/Station.js):
//   approvalStatus  PENDING | APPROVED | REJECTED  — admin vetting
//   isActive        true | false                  — admin on/off switch
// A station is publicly visible / bookable only when it is APPROVED and
// active (the same rule booking.controller.js enforces).
//
// Station writes (create / approve / update / deactivate) live in
// admin.controller.js; the legacy /stations write routes delegate there.
// ─────────────────────────────────────────────────────────────

const PUBLIC_STATION_FILTER = {
    approvalStatus: 'APPROVED',
    isActive: true,
};

// Explicit allowlist of customer-facing fields. Internal references
// (companyId, adminId, managerIds, calendar), lifecycle flags, direct contact details and
// timestamps are not exposed publicly.
const PUBLIC_STATION_FIELDS = [
    'name',
    'slug',
    'type',
    'description',
    'location',
    'logo',
    'coverImage',
    'images',
    'specifications',
    'advertisingFormats',
    'features',
    'pricing',
    'rateCard',
    'availability',
    'operatingHours',
    'inventoryStatus',
    'reach',
    'rating',
    'reviews',
    'website',
    'social',
].join(' ');

// ── GET ALL STATIONS ──
const getStations = async (req, res) => {
    try {
        const stations = await Station.find(PUBLIC_STATION_FILTER)
            .select(PUBLIC_STATION_FIELDS)
            .sort({ name: 1 });

        res.json({
            success: true,
            data: stations,
        });

    } catch (error) {
        console.error('❌ Get stations error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load stations',
        });
    }
};

// ── GET SINGLE STATION ──
const getStation = async (req, res) => {
    try {
        const { id } = req.params;

        // Malformed, unknown, unapproved and inactive stations all look the
        // same to the public: not found.
        const station = mongoose.isValidObjectId(id)
            ? await Station.findOne({ _id: id, ...PUBLIC_STATION_FILTER })
                .select(PUBLIC_STATION_FIELDS)
            : null;

        if (!station) {
            return res.status(404).json({
                success: false,
                message: 'Station not found',
            });
        }

        res.json({
            success: true,
            data: station,
        });

    } catch (error) {
        console.error('❌ Get station error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load station',
        });
    }
};

// ── GET STATIONS BY TYPE ──
const getStationsByType = async (req, res) => {
    try {
        const { type } = req.params;

        const stations = await Station.find({
            ...PUBLIC_STATION_FILTER,
            type: String(type).toUpperCase(),
        })
            .select(PUBLIC_STATION_FIELDS)
            .sort({ name: 1 });

        res.json({
            success: true,
            data: stations,
        });

    } catch (error) {
        console.error('❌ Get stations by type error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load stations',
        });
    }
};

// ── GET STATION AVAILABILITY (public) ──
// Weekly airtime hours and upcoming blocked dates, so advertisers can see
// when a station can't be booked. Internal notes are never included.
const getStationAvailability = async (req, res) => {
    try {
        if (!/^[0-9a-fA-F]{24}$/.test(String(req.params.id))) {
            return res.status(400).json({ success: false, message: 'Invalid station ID' });
        }

        const station = await Station.findOne({ _id: req.params.id, ...PUBLIC_STATION_FILTER })
            .select('airtimeHours blackouts');

        if (!station) {
            return res.status(404).json({ success: false, message: 'Station not found' });
        }

        return res.json({
            success: true,
            data: publicCalendar(station, new Date().toISOString().slice(0, 10)),
        });
    } catch (error) {
        console.error('❌ Station availability error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to load availability' });
    }
};

module.exports = {
    getStationAvailability,
    getStations,
    getStationsByType,
    getStation,
    PUBLIC_STATION_FIELDS,
};
