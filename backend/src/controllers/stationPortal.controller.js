const Station = require('../models/Station');
const Booking = require('../models/Booking');
const AuditLog = require('../models/AuditLog');
const { stationOwnerFilter } = require('../utils/stationOperator');
const { validateStationProfile, validateAirtime, validateBlackout, validateRateCard } = require('../validators/station.validator');
const { bookingInBlackout, REASON_LABEL } = require('../utils/stationCalendar');
const { airTimeOf } = require('../utils/cancellationPolicy');
const { bookingHelpers } = require('./booking.controller');

const { releaseBookingForStation } = bookingHelpers;
const { sendValidationErrors, mongooseFieldErrors } = require('../utils/validationResponse');

// ─────────────────────────────────────────────
// STATION PORTAL — a station's own listings, profile and dashboard summary.
// Every query is scoped by stationOwnerFilter (requireStationOperator).
// ─────────────────────────────────────────────

const STATION_FIELDS = '-bookingLockUntil';

const getMyStations = async (req, res) => {
    try {
        const stations = await Station.find(stationOwnerFilter(req))
            .select(STATION_FIELDS)
            .sort({ createdAt: 1 });

        return res.json({ success: true, data: stations });
    } catch (error) {
        console.error('❌ Station portal stations error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to load your stations' });
    }
};

const updateMyStation = async (req, res) => {
    try {
        const station = await Station.findOne({ _id: req.params.id, ...stationOwnerFilter(req) });

        if (!station) {
            return res.status(404).json({ success: false, message: 'Station not found' });
        }

        const check = validateStationProfile(req.body);

        if (check.errors) {
            return sendValidationErrors(res, check.errors);
        }

        const changed = [];

        for (const [field, value] of Object.entries(check.value)) {
            if (field === 'location') {
                for (const [sub, subValue] of Object.entries(value)) {
                    station.set(`location.${sub}`, subValue);
                }
            } else if (field === 'pricing') {
                station.set('pricing', { ...value });
            } else {
                station.set(field, value);
            }
            changed.push(field);
        }

        await station.save();

        try {
            await AuditLog.create({
                userId: req.user._id,
                companyId: station.companyId || null,
                action: 'UPDATE_STATION',
                entityType: 'STATION',
                entityId: station._id,
                metadata: {
                    fields: changed,
                    ...(check.value.pricing ? { pricing: check.value.pricing } : {}),
                    ...(check.value.inventoryStatus ? { inventoryStatus: check.value.inventoryStatus } : {}),
                },
            });
        } catch (auditError) {
            console.error('⚠️ Audit log error:', auditError.name, auditError.message);
        }

        const fresh = station.toObject();
        delete fresh.bookingLockUntil;

        return res.json({ success: true, message: 'Station updated', data: fresh });
    } catch (error) {
        console.error('❌ Station portal update error:', error.name, error.message);

        if (error.name === 'ValidationError') {
            return sendValidationErrors(res, mongooseFieldErrors(error));
        }

        return res.status(500).json({ success: false, message: 'Failed to update station' });
    }
};

// ─────────────────────────────────────────────
// CALENDAR — weekly airtime and blocked dates (days off, maintenance…).
// ─────────────────────────────────────────────

const ACTIVE_STATUSES = ['PENDING', 'ACCEPTED', 'SCHEDULED', 'CHANGES_REQUESTED'];

const loadOwnStation = async (req, res) => {
    const station = await Station.findOne({ _id: req.params.id, ...stationOwnerFilter(req) });
    if (!station) {
        res.status(404).json({ success: false, message: 'Station not found' });
        return null;
    }
    return station;
};

const calendarAudit = async (req, station, event, extra = {}) => {
    try {
        await AuditLog.create({
            userId: req.user._id,
            companyId: station.companyId || null,
            action: 'UPDATE_STATION',
            entityType: 'STATION',
            entityId: station._id,
            metadata: { event, ...extra },
        });
    } catch (auditError) {
        console.error('⚠️ Audit log error:', auditError.name, auditError.message);
    }
};

// PUT /station-portal/stations/:id/rate-card — replace the station's rates.
// Existing entries keep their id (send it back) so bookings stay linked.
const setRateCard = async (req, res) => {
    try {
        const station = await loadOwnStation(req, res);
        if (!station) return undefined;

        const check = validateRateCard(req.body);
        if (check.errors) return sendValidationErrors(res, check.errors);

        const existingIds = new Set((station.rateCard || []).map((r) => String(r._id)));
        const rates = check.value.rates.map((r) => {
            if (r._id && !existingIds.has(String(r._id))) {
                const { _id, ...rest } = r;
                return rest;
            }
            return r;
        });
        station.rateCard = rates;
        station.markModified('rateCard');
        await station.save();
        await calendarAudit(req, station, 'SET_RATE_CARD', { rates: rates.length });

        return res.json({ success: true, message: 'Rate card updated', data: { rateCard: station.rateCard } });
    } catch (error) {
        console.error('❌ Set rate card error:', error.name, error.message);
        if (error.name === 'ValidationError') return sendValidationErrors(res, mongooseFieldErrors(error));
        return res.status(500).json({ success: false, message: 'Failed to update the rate card' });
    }
};

// PUT /station-portal/stations/:id/airtime — replace the weekly hours.
const setAirtimeHours = async (req, res) => {
    try {
        const station = await loadOwnStation(req, res);
        if (!station) return undefined;

        const check = validateAirtime(req.body);
        if (check.errors) return sendValidationErrors(res, check.errors);

        station.airtimeHours = check.value.airtimeHours;
        station.markModified('airtimeHours');
        await station.save();
        await calendarAudit(req, station, 'SET_AIRTIME_HOURS', { days: Object.keys(check.value.airtimeHours) });

        return res.json({ success: true, message: 'Airtime hours updated', data: { airtimeHours: station.airtimeHours } });
    } catch (error) {
        console.error('❌ Set airtime error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to update airtime hours' });
    }
};

// POST /station-portal/stations/:id/blackouts — block a period. Bookings
// already in it are listed first (409); resend with cancelAffected: true
// to cancel them with a full refund (station-caused, no fee).
const addBlackout = async (req, res) => {
    try {
        const station = await loadOwnStation(req, res);
        if (!station) return undefined;

        const today = new Date().toISOString().slice(0, 10);
        const check = validateBlackout(req.body, today);
        if (check.errors) return sendValidationErrors(res, check.errors);

        const { cancelAffected, ...input } = check.value;
        const candidate = {
            startDate: new Date(`${input.startDate}T00:00:00.000Z`),
            endDate: new Date(`${input.endDate}T00:00:00.000Z`),
            startTime: input.startTime || null,
            endTime: input.endTime || null,
            reason: input.reason,
            note: input.note || null,
            createdBy: req.user._id,
            createdAt: new Date(),
        };

        const now = new Date();
        const affected = (await Booking.find({ stationId: station._id, status: { $in: ACTIVE_STATUSES } })
            .select('bookingReference status date time duration price currency paymentStatus paymentId campaignId companyId userId'))
            .filter((b) => bookingInBlackout(b, candidate) && airTimeOf(b) > now);

        if (affected.length && !cancelAffected) {
            return res.status(409).json({
                success: false,
                message: `${affected.length} booking(s) fall in this period. Confirm to cancel them with a full refund to the advertiser, or reschedule them first.`,
                data: {
                    affected: affected.map((b) => ({
                        _id: b._id,
                        bookingReference: b.bookingReference,
                        status: b.status,
                        date: b.date,
                        time: b.time,
                        duration: b.duration,
                        paymentStatus: b.paymentStatus,
                    })),
                },
            });
        }

        station.blackouts.push(candidate);
        await station.save();
        const saved = station.blackouts[station.blackouts.length - 1];

        const reasonText = `The station is unavailable on these dates (${REASON_LABEL[candidate.reason] || 'unavailable'}).`;
        const released = [];
        for (const booking of affected) {
            const result = await releaseBookingForStation(req, booking, reasonText);
            released.push({ bookingReference: booking.bookingReference, ...result });
        }

        await calendarAudit(req, station, 'ADD_BLACKOUT', {
            startDate: input.startDate,
            endDate: input.endDate,
            reason: candidate.reason,
            releasedBookings: released.filter((r) => r.released).length,
        });

        return res.status(201).json({
            success: true,
            message: released.length
                ? `Dates blocked. ${released.filter((r) => r.released).length} booking(s) cancelled with a full refund.`
                : 'Dates blocked',
            data: { blackout: saved, released },
        });
    } catch (error) {
        console.error('❌ Add blackout error:', error.name, error.message);
        if (error.name === 'ValidationError') return sendValidationErrors(res, mongooseFieldErrors(error));
        return res.status(500).json({ success: false, message: 'Failed to block these dates' });
    }
};

// DELETE /station-portal/stations/:id/blackouts/:blackoutId
const removeBlackout = async (req, res) => {
    try {
        if (!/^[0-9a-fA-F]{24}$/.test(String(req.params.blackoutId))) {
            return res.status(400).json({ success: false, message: 'Invalid blocked period ID' });
        }

        const station = await loadOwnStation(req, res);
        if (!station) return undefined;

        const before = station.blackouts.length;
        station.blackouts = station.blackouts.filter((b) => String(b._id) !== String(req.params.blackoutId));
        if (station.blackouts.length === before) {
            return res.status(404).json({ success: false, message: 'Blocked period not found' });
        }

        await station.save();
        await calendarAudit(req, station, 'REMOVE_BLACKOUT', { blackoutId: String(req.params.blackoutId) });

        return res.json({ success: true, message: 'Blocked period removed' });
    } catch (error) {
        console.error('❌ Remove blackout error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to remove the blocked period' });
    }
};

// Dashboard numbers for the caller's stations.
const getSummary = async (req, res) => {
    try {
        const stations = await Station.find(stationOwnerFilter(req)).select('_id name approvalStatus isActive inventoryStatus');
        const stationIds = stations.map((s) => s._id);

        const bookings = stationIds.length
            ? await Booking.find({ stationId: { $in: stationIds } })
                .select('stationId status date time duration price currency paymentStatus bookingReference createdAt cancellationFee cancelledBy')
                .populate('stationId', 'name')
            : [];

        const byStatus = {};
        for (const b of bookings) byStatus[b.status] = (byStatus[b.status] || 0) + 1;

        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));

        const upcoming = bookings
            .filter((b) => ['ACCEPTED', 'SCHEDULED'].includes(b.status) && new Date(b.date) >= today)
            .sort((a, b) => new Date(a.date) - new Date(b.date) || String(a.time).localeCompare(String(b.time)))
            .slice(0, 8);

        // Earnings: paid bookings that were not refunded, by currency.
        const earnings = {};
        for (const b of bookings) {
            const e = () => earnings[b.currency] || (earnings[b.currency] = { booked: 0, completed: 0, thisMonth: 0, cancellationFees: 0 });
            // Fees kept when an advertiser cancelled late or mid-campaign.
            const fee = b.status === 'CANCELLED' && b.cancelledBy === 'CUSTOMER' ? Number(b.cancellationFee) || 0 : 0;
            if (fee > 0) e().cancellationFees += fee;
            if (b.paymentStatus !== 'PAID' || b.status === 'CANCELLED') continue;
            e().booked += Number(b.price) || 0;
            if (b.status === 'COMPLETED') e().completed += Number(b.price) || 0;
            if (new Date(b.createdAt) >= monthStart) e().thisMonth += Number(b.price) || 0;
        }

        return res.json({
            success: true,
            data: {
                stations,
                counts: {
                    total: bookings.length,
                    needsResponse: byStatus.PENDING || 0,
                    accepted: byStatus.ACCEPTED || 0,
                    scheduled: byStatus.SCHEDULED || 0,
                    completed: byStatus.COMPLETED || 0,
                    declined: byStatus.REJECTED || 0,
                    cancelled: byStatus.CANCELLED || 0,
                    changesRequested: byStatus.CHANGES_REQUESTED || 0,
                },
                upcoming,
                earnings,
            },
        });
    } catch (error) {
        console.error('❌ Station portal summary error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to load your dashboard' });
    }
};

module.exports = {
    setRateCard,
    getMyStations,
    updateMyStation,
    getSummary,
    setAirtimeHours,
    addBlackout,
    removeBlackout,
};
