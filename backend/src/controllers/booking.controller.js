const crypto = require('crypto');

const Booking = require('../models/Booking');
const Campaign = require('../models/Campaign');
const Station = require('../models/Station');
const Payment = require('../models/Payment');
const AuditLog = require('../models/AuditLog');
const { advertiserScope, advertiserOwner } = require('../utils/advertiser');
const { getPaymentProvider } = require('../utils/payments');
const { stationOwnerFilter, ownsStation } = require('../utils/stationOperator');
const { checkStationCalendar } = require('../utils/stationCalendar');
const { quoteCancellation, paidValueOf, airTimeOf, canStillCancel, CANCEL_CUTOFF_HOURS } = require('../utils/cancellationPolicy');
const {
    canTransitionBookingStatus,
    INVENTORY_RELEASING_STATUSES,
} = require('../utils/bookingStatus');
const { canCampaignRequestBookings } = require('../utils/campaignStatus');
const { notifyBookingStatus, notifyCustomerCancellation } = require('../utils/notifications');
const {
    acquireStationBookingLock,
    releaseStationBookingLock,
} = require('../utils/stationBookingLock');

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

const isValidObjectId = (id) =>
    /^[0-9a-fA-F]{24}$/.test(String(id));

const invalidBookingId = (res) =>
    res.status(400).json({
        success: false,
        message: 'Invalid booking ID',
    });

const generateBookingReference = () => {
    const randomPart = crypto.randomBytes(4).toString('hex').toUpperCase();

    return `BK-${Date.now()}-${randomPart}`;
};

const timeToMinutes = (time) => {
    const [hours, minutes] = time.split(':').map(Number);

    return hours * 60 + minutes;
};

const isValidTime = (time) => {
    return /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(time);
};

const getDateOnly = (date) => {
    const parsedDate = new Date(date);

    if (Number.isNaN(parsedDate.getTime())) {
        return null;
    }

    return parsedDate.toISOString().split('T')[0];
};

const createDateFromDateOnly = (dateOnly) => {
    return new Date(`${dateOnly}T00:00:00.000Z`);
};

// An active booking (anything not rejected/cancelled) on the same station
// and date whose [time, time + duration) overlaps the requested range.
// With a session (checkout), the read joins the transaction and so also
// sees the bookings that transaction inserted.
const findConflictingBooking = async ({ stationId, bookingDate, start, end, excludeId, excludeIds, session }) => {
    const query = Booking.find({
        stationId,
        date: bookingDate,
        status: {
            $nin: INVENTORY_RELEASING_STATUSES,
        },
    }).select('time duration status bookingReference');

    if (session) query.session(session);

    const existingBookings = await query;
    const excluded = new Set([excludeId, ...(excludeIds || [])].filter(Boolean).map(String));

    return existingBookings.find((existing) => {
        if (excluded.has(String(existing._id))) {
            return false;
        }

        const existingStart = timeToMinutes(existing.time);
        const existingEnd =
            existingStart + Number(existing.duration);

        return (
            start < existingEnd &&
            end > existingStart
        );
    }) || null;
};

const bookingConflictResponse = (res, conflictingBooking) =>
    res.status(409).json({
        success: false,
        message: 'The station is already booked for this time',
        data: {
            bookingReference:
                conflictingBooking.bookingReference,
            status: conflictingBooking.status,
        },
    });

// Same rule as the public station catalogue, plus station-level inventory.
// A missing inventoryStatus is the schema default, AVAILABLE.
const STATION_UNAVAILABLE_MESSAGE = 'This station is not available for booking right now.';

// ─────────────────────────────────────────────
// BOOKING REQUEST CHECKS
// Shared by createBooking (one booking) and checkout (a cart of them), in
// the order and with the wording createBooking has always used. Each
// returns an error message (a 400) or the validated value.
// ─────────────────────────────────────────────

const validateBookingFields = ({ campaignId, stationId, slot, date, time, duration } = {}) => {
    if (
        !campaignId ||
        !stationId ||
        !slot ||
        !date ||
        !time ||
        duration === undefined ||
        duration === null
    ) {
        return { error: 'Required fields: campaignId, stationId, slot, date, time, duration' };
    }

    if (!isValidObjectId(campaignId) || !isValidObjectId(stationId)) {
        return { error: 'Invalid campaignId or stationId' };
    }

    // slot is a free-text label (e.g. "PRIME_TIME"), not an inventory
    // key: availability is decided by station + date + time + duration.
    if (typeof slot !== 'string' || !slot.trim() || slot.trim().length > 50) {
        return { error: 'Slot must be text of at most 50 characters' };
    }

    if (/[\u0000-\u001F\u007F]/.test(slot)) {
        return { error: 'Slot contains invalid characters' };
    }

    if (typeof time !== 'string' || !isValidTime(time)) {
        return { error: 'Invalid time. Use HH:mm format.' };
    }

    const numericDuration =
        typeof duration === 'number' ||
        (typeof duration === 'string' && duration.trim() !== '')
            ? Number(duration)
            : NaN;

    if (
        !Number.isInteger(numericDuration) ||
        numericDuration <= 0 ||
        numericDuration > 24 * 60
    ) {
        return { error: 'Duration must be a whole number of minutes greater than 0' };
    }

    const dateOnly = typeof date === 'string' ? getDateOnly(date) : null;

    if (!dateOnly) {
        return { error: 'Invalid booking date' };
    }

    const todayString = new Date().toISOString().split('T')[0];

    if (dateOnly < todayString) {
        return { error: 'Booking date cannot be in the past' };
    }

    return {
        value: {
            campaignId,
            stationId,
            slot: slot.trim(),
            time,
            duration: numericDuration,
            dateOnly,
            bookingDate: createDateFromDateOnly(dateOnly),
        },
    };
};

// The campaign must still be open, and the date within its dates (when set).
const checkCampaignForBooking = (campaign, dateOnly) => {
    if (!canCampaignRequestBookings(campaign.status)) {
        return 'This campaign can no longer take new bookings.';
    }

    const campaignStart = campaign.startDate ? getDateOnly(campaign.startDate) : null;
    const campaignEnd = campaign.endDate ? getDateOnly(campaign.endDate) : null;

    if (campaignStart && campaignEnd && campaignStart > campaignEnd) {
        return 'The campaign end date is before its start date. Fix the campaign dates before booking.';
    }

    if (
        (campaignStart && dateOnly < campaignStart) ||
        (campaignEnd && dateOnly > campaignEnd)
    ) {
        return 'The booking date must be within the campaign dates.';
    }

    return null;
};

// Approved, active, AVAILABLE, and priced — price and currency come only
// from this Station record (server-authoritative, never from the client).
// A spot time inside a rate's belt (HH:mm–HH:mm; an end before the start
// means the belt runs past midnight).
const timeInBelt = (time, startTime, endTime) => {
    const t = timeToMinutes(time);
    const s = timeToMinutes(startTime);
    const e = timeToMinutes(endTime);
    return s <= e ? t >= s && t < e : t >= s || t < e;
};

// Price for one spot: the chosen rate-card entry when the station has a rate
// card (required then), otherwise the station's standard price.
const resolveStationPrice = (station, { rateId, time } = {}) => {
    const currency =
        typeof station.pricing?.currency === 'string'
            ? station.pricing.currency.trim().toUpperCase()
            : '';
    const rates = (station.rateCard || []).filter((r) => r && r.isActive !== false);

    if (!rates.length) {
        if (rateId) {
            return { error: 'This station has no rate card; book it at its standard price.' };
        }
        const price = Number(station.pricing?.amount);
        if (!Number.isFinite(price) || price <= 0 || !currency) {
            return { error: 'Station pricing is not configured for this booking.' };
        }
        return { price, currency, rate: null };
    }

    if (!rateId) {
        return { error: "Choose a rate from this station's rate card" };
    }
    const rate = rates.find((r) => String(r._id) === String(rateId));
    if (!rate) {
        return { error: "That rate is not on this station's rate card" };
    }
    if (rate.kind === 'TIME_BELT' && rate.startTime && rate.endTime && time && !timeInBelt(time, rate.startTime, rate.endTime)) {
        return { error: `The ${rate.name} rate is for spots starting between ${rate.startTime} and ${rate.endTime}` };
    }
    if (!currency || !(Number(rate.price) > 0)) {
        return { error: 'Station pricing is not configured for this booking.' };
    }
    return { price: Number(rate.price), currency, rate };
};

// Press ads don't take exclusive airtime: several can run on the same day.
const takesExclusiveTime = (station) => station.type !== 'PRESS';

const checkStationForBooking = (station, priceOptions = {}) => {
    if (station.approvalStatus !== 'APPROVED') {
        return { error: 'This station is not approved for bookings' };
    }

    if (!station.isActive) {
        return { error: 'This station is currently inactive' };
    }

    if ((station.inventoryStatus || 'AVAILABLE') !== 'AVAILABLE') {
        return { error: STATION_UNAVAILABLE_MESSAGE };
    }

    return resolveStationPrice(station, priceOptions);
};

const getBookingRange = (time, duration) => {
    const start = timeToMinutes(time);
    const end = start + duration;

    return {
        start,
        end,
        error: end > 24 * 60 ? 'Booking duration cannot extend beyond midnight' : null,
    };
};

// ─────────────────────────────────────────────
// REFUNDS
// A PAID booking that is released is settled in the same conditional
// write as its status change (see the callers):
//   station-caused (declined, blocked dates)  → full refund, no fee.
//   advertiser-cancelled → utils/cancellationPolicy.js (free before the
//     campaign starts; 10–20% fee in progress; no cancelling within 2h).
// recordBookingRefund then refunds through the provider and updates the
// Payment totals. Failures there are logged, never turned into an error
// for the status change that already happened.
// ─────────────────────────────────────────────

const loadPayment = async (booking) =>
    booking.paymentId ? Payment.findById(booking.paymentId) : null;

// Campaign context for the policy (progress is measured over its bookings).
const loadCancellationContext = async (booking) => {
    const [payment, campaignBookings] = await Promise.all([
        loadPayment(booking),
        Booking.find({ campaignId: booking.campaignId }).select('status price date time duration paymentStatus'),
    ]);
    return { payment, campaignBookings };
};

const quoteForBooking = async (booking, now = new Date()) => {
    const { payment, campaignBookings } = await loadCancellationContext(booking);
    return quoteCancellation({ booking, payment, campaignBookings, now });
};

// Station-caused: full refund of what was paid (incl. its fee share).
const stationRefundFields = async (booking, reason) => {
    if (booking.paymentStatus !== 'PAID') {
        return { filter: {}, set: { cancelledBy: 'STATION', cancellationReason: reason || null } };
    }
    const payment = await loadPayment(booking);
    return {
        filter: { paymentStatus: 'PAID' },
        set: {
            paymentStatus: 'REFUNDED',
            refundedAt: new Date(),
            refundAmount: paidValueOf(booking, payment),
            cancellationFee: 0,
            cancelledBy: 'STATION',
            cancellationReason: reason || null,
        },
    };
};

// Advertiser-cancelled: what the policy quote says.
const customerRefundFields = (booking, quote) => {
    const common = { cancelledBy: 'CUSTOMER', cancellationReason: quote.explanation };
    if (booking.paymentStatus !== 'PAID') return { filter: {}, set: common };

    return quote.refundAmount > 0
        ? {
            filter: { paymentStatus: 'PAID' },
            set: { ...common, paymentStatus: 'REFUNDED', refundedAt: new Date(), refundAmount: quote.refundAmount, cancellationFee: quote.fee },
        }
        // Nothing refundable (late cancellation): the station keeps the payment.
        : { filter: { paymentStatus: 'PAID' }, set: { ...common, refundAmount: 0, cancellationFee: quote.fee } };
};

const recordBookingRefund = async (req, booking, reason) => {
    const amount = Math.round((Number(booking.refundAmount) || 0) * 100) / 100;
    if (booking.paymentStatus !== 'REFUNDED' || !booking.paymentId || amount <= 0) return;

    try {
        const payment = await Payment.findById(booking.paymentId);
        if (!payment) return;

        const result = await getPaymentProvider().refund({ payment, amount, reason });

        const updated = await Payment.findOneAndUpdate(
            { _id: payment._id },
            {
                $inc: { refundAmount: amount },
                $set: { refundedAt: new Date(), refundReference: result.refundReference },
            },
            { returnDocument: 'after' }
        );

        if (updated && Number(updated.refundAmount) >= Number(updated.amount) - 0.005) {
            await Payment.updateOne({ _id: updated._id, status: 'SUCCESSFUL' }, { $set: { status: 'REFUNDED' } });
        }

        await writeAuditLog({
            userId: req.user.id,
            companyId: booking.companyId || null,
            action: 'REFUND_PAYMENT',
            entityId: booking._id,
            metadata: {
                bookingReference: booking.bookingReference,
                paymentReference: payment.reference,
                amount,
                fee: booking.cancellationFee || 0,
                currency: payment.currency,
                provider: payment.provider,
                reason,
            },
        });
    } catch (error) {
        console.error('❌ Booking refund error:', error.name, error.message);
    }
};

const writeAuditLog = async ({
    userId,
    companyId,
    action,
    entityId,
    metadata,
}) => {
    try {
        await AuditLog.create({
            userId,
            companyId,
            action,
            entityType: 'BOOKING',
            entityId,
            metadata,
        });
    } catch (error) {
        // Do not turn a successful business operation into a 500
        // because an audit log failed.
        console.error('⚠️ Audit log error:', error);
    }
};

// ─────────────────────────────────────────────
// GET ALL BOOKINGS
// ADVERTISER-SCOPED (company or individual)
// ─────────────────────────────────────────────

const getBookings = async (req, res) => {
    try {
        const bookings = await Booking.find(advertiserScope(req))
            .sort({ createdAt: -1 })
            .populate('campaignId', 'name budget status')
            .populate(
                'stationId',
                'name type location approvalStatus inventoryStatus isActive'
            )
            .populate('userId', 'name email')
            .populate('companyId', 'name email phone logo status');

        return res.json({
            success: true,
            data: bookings,
        });

    } catch (error) {
        console.error('❌ Get bookings error:', error);

        return res.status(500).json({
            success: false,
            message: 'Failed to load bookings',
        });
    }
};

// ─────────────────────────────────────────────
// GET ALL BOOKINGS
// ADMIN
// ─────────────────────────────────────────────

const getAdminBookings = async (req, res) => {
    try {
        const bookings = await Booking.find({})
            .sort({ createdAt: -1 })
            .populate(
                'campaignId',
                'name budget status'
            )
            .populate(
                'stationId',
                'name type location approvalStatus inventoryStatus isActive'
            )
            .populate(
                'userId',
                'name email accountType'
            )
            .populate(
                'companyId',
                'name email phone logo status'
            );

        return res.json({
            success: true,
            data: bookings,
        });

    } catch (error) {
        console.error(
            '❌ Admin get bookings error:',
            error
        );

        return res.status(500).json({
            success: false,
            message: 'Failed to load bookings',
        });
    }
};

// ─────────────────────────────────────────────
// GET SINGLE BOOKING
// ADVERTISER-SCOPED (company or individual)
// ─────────────────────────────────────────────

const getBooking = async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            return invalidBookingId(res);
        }

        const booking = await Booking.findOne({
            _id: id,
            ...advertiserScope(req),
        })
            .populate('campaignId', 'name budget status')
            .populate(
                'stationId',
                'name type location approvalStatus inventoryStatus isActive'
            )
            .populate('userId', 'name email')
            .populate('companyId', 'name email phone logo status');

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found',
            });
        }

        return res.json({
            success: true,
            data: booking,
        });

    } catch (error) {
        console.error('❌ Get booking error:', error);

        return res.status(500).json({
            success: false,
            message: 'Failed to load booking',
        });
    }
};

// ─────────────────────────────────────────────
// CREATE BOOKING
// ─────────────────────────────────────────────

const createBooking = async (req, res) => {
    try {
        const { companyId, userId } = advertiserOwner(req);

        // NOTE: price and currency are deliberately NOT read from the request.
        // The station's server-side pricing is authoritative (see
        // checkStationForBooking); any client-supplied price/currency is ignored.
        const fields = validateBookingFields(req.body);

        if (fields.error) {
            return res.status(400).json({
                success: false,
                message: fields.error,
            });
        }

        const {
            campaignId,
            stationId,
            slot,
            time,
            duration: numericDuration,
            dateOnly,
            bookingDate,
        } = fields.value;

        // ── Verify the campaign belongs to this advertiser ──

        const campaign = await Campaign.findOne({
            _id: campaignId,
            ...advertiserScope(req),
        });

        if (!campaign) {
            return res.status(404).json({
                success: false,
                message: 'Campaign not found',
            });
        }

        const campaignProblem = checkCampaignForBooking(campaign, dateOnly);

        if (campaignProblem) {
            return res.status(400).json({
                success: false,
                message: campaignProblem,
            });
        }

        // ── Verify station ──

        const station = await Station.findById(stationId);

        if (!station) {
            return res.status(404).json({
                success: false,
                message: 'Station not found',
            });
        }

        const rateId = req.body?.rateId ?? null;
        if (rateId !== null && !isValidObjectId(rateId)) {
            return res.status(400).json({ success: false, message: 'Invalid rateId' });
        }

        const stationCheck = checkStationForBooking(station, { rateId, time });

        if (stationCheck.error) {
            return res.status(400).json({
                success: false,
                message: stationCheck.error,
            });
        }

        const { price: stationPrice, currency: stationCurrency, rate } = stationCheck;
        const exclusive = takesExclusiveTime(station);

        // ── Calculate requested time range (never beyond midnight) ──

        const range = getBookingRange(time, numericDuration);

        if (range.error) {
            return res.status(400).json({
                success: false,
                message: range.error,
            });
        }

        const requestedStart = range.start;
        const requestedEnd = range.end;

        // ── Station calendar: weekly airtime and blocked dates ──
        const calendarProblem = checkStationCalendar(station, dateOnly, requestedStart, requestedEnd);

        if (calendarProblem) {
            return res.status(400).json({
                success: false,
                message: calendarProblem,
            });
        }

        // ── Reserve: conflict check + insert while holding the station lock ──
        // Two simultaneous requests for overlapping time on one station are
        // serialised here, so the second one sees the first booking.

        const conflictQuery = {
            stationId: station._id,
            bookingDate,
            start: requestedStart,
            end: requestedEnd,
        };

        const lock = await acquireStationBookingLock(station._id);

        if (!lock) {
            return res.status(409).json({
                success: false,
                message: 'This station is taking another booking right now. Please try again.',
            });
        }

        const bookingReference = generateBookingReference();
        let booking = null;
        let conflict = null;

        // The lock is released before any response is sent.
        try {
            conflict = exclusive ? await findConflictingBooking(conflictQuery) : null;

            if (!conflict) {
                booking = await Booking.create({
                    bookingReference,
                    campaignId,
                    stationId,
                    userId,
                    companyId,
                    slot: slot.trim(),
                    date: bookingDate,
                    time,
                    duration: numericDuration,
                    price: stationPrice,
                    currency: stationCurrency,
                    rateId: rate ? rate._id : null,
                    rateName: rate ? rate.name : null,
                    status: 'PENDING',
                });

                // Defence in depth (e.g. a lock that expired mid-request):
                // if another active booking now overlaps, withdraw ours.
                conflict = exclusive
                    ? await findConflictingBooking({ ...conflictQuery, excludeId: booking._id })
                    : null;

                if (conflict) {
                    await Booking.deleteOne({ _id: booking._id });
                    booking = null;
                }
            }
        } finally {
            await releaseStationBookingLock(station._id, lock);
        }

        if (conflict) {
            return bookingConflictResponse(res, conflict);
        }

        // ── Audit log ──

        await writeAuditLog({
            userId,
            companyId,
            action: 'CREATE_BOOKING',
            entityId: booking._id,
            metadata: {
                bookingReference,
                campaignId,
                stationId,
                slot: slot.trim(),
                date: dateOnly,
                time,
                duration: numericDuration,
                price: stationPrice,
                currency: stationCurrency,
                pricingUnit: station.pricing?.unit || null,
            },
        });

        return res.status(201).json({
            success: true,
            message: 'Booking created successfully',
            data: booking,
        });

    } catch (error) {
        console.error('❌ Create booking error:', error);

        // Handle duplicate booking reference safely

        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message:
                    'A booking reference conflict occurred. Please try again.',
            });
        }

        return res.status(500).json({
            success: false,
            message: 'Failed to create booking',
        });
    }
};

// ─────────────────────────────────────────────
// STATUS CHANGES
// There is no generic status update: each business action has its own
// endpoint, checked against utils/bookingStatus.js. Writes are
// conditional on the status that was checked, so a concurrent change
// returns 409 instead of being overwritten.
// ─────────────────────────────────────────────

const applyBookingTransition = async (req, res, {
    booking,
    actor,
    toStatus,
    set = {},
    auditAction,
    auditCompanyId,
    message,
}) => {
    const fromStatus = booking.status;

    if (fromStatus === toStatus) {
        return res.status(400).json({
            success: false,
            message: `Booking is already ${toStatus}`,
        });
    }

    if (!canTransitionBookingStatus(actor, fromStatus, toStatus)) {
        return res.status(400).json({
            success: false,
            message: `Cannot change booking status from ${fromStatus} to ${toStatus}`,
        });
    }

    // A paid booking that is released (rejected/cancelled) is refunded in
    // the same conditional write.
    const refund = INVENTORY_RELEASING_STATUSES.includes(toStatus) && actor === 'STATION'
        ? await stationRefundFields(booking, set.stationNote || 'Declined by the station')
        : { filter: {}, set: {} };

    const updated = await Booking.findOneAndUpdate(
        { _id: booking._id, status: fromStatus, ...refund.filter },
        { $set: { status: toStatus, ...set, ...refund.set } },
        { returnDocument: 'after', runValidators: true }
    );

    if (!updated) {
        return res.status(409).json({
            success: false,
            message: 'The booking changed while this request was processed. Please reload and try again.',
        });
    }

    await writeAuditLog({
        userId: req.user.id,
        companyId: auditCompanyId,
        action: auditAction,
        entityId: updated._id,
        metadata: {
            bookingReference: updated.bookingReference,
            oldStatus: fromStatus,
            newStatus: toStatus,
            actor,
        },
    });

    if (refund.set.paymentStatus) {
        await recordBookingRefund(req, updated, `${actor === 'STATION' ? 'Station' : 'Customer'} ${toStatus.toLowerCase()} the booking`);
    }

    await notifyBookingStatus(updated, { actor, toStatus });

    return res.json({
        success: true,
        message,
        data: updated,
    });
};

// ── Station side ──
// The caller must operate the booked station: its STATION account
// manager (Station.managerIds), a full admin, or during the transition its media company
// (Station.companyId) — see requireStationOperator. A stationId or
// companyId in the request is never used. The booking's own advertiser
// company gets 403 ("station only"); anyone else gets 404 so booking IDs
// can't be probed.
const loadStationBooking = async (req, res) => {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
        invalidBookingId(res);
        return null;
    }

    const booking = await Booking.findById(id);

    if (!booking) {
        res.status(404).json({ success: false, message: 'Booking not found' });
        return null;
    }

    const station = await Station.findById(booking.stationId).select('companyId managerIds approvalStatus isActive');

    if (!station || !ownsStation(req, station)) {
        if (req.user.companyId && String(booking.companyId) === String(req.user.companyId)) {
            res.status(403).json({
                success: false,
                message: 'Only the station that was booked can perform this action.',
            });
        } else {
            res.status(404).json({ success: false, message: 'Booking not found' });
        }
        return null;
    }

    return { booking, station };
};

const readNote = (req) => {
    const note = req.body?.note;
    if (note === undefined || note === null) return { ok: true, value: undefined };
    if (typeof note !== 'string' || note.length > 1000) return { ok: false };
    return { ok: true, value: note.trim() || null };
};

const stationAction = ({ toStatus, auditAction, message, withNote = false, beforeApply }) =>
    async (req, res) => {
        try {
            const set = {};

            if (withNote) {
                const note = readNote(req);
                if (!note.ok) {
                    return res.status(400).json({
                        success: false,
                        message: 'Note must be text of at most 1000 characters',
                    });
                }
                if (note.value !== undefined) set.stationNote = note.value;
            }

            const ctx = await loadStationBooking(req, res);
            if (!ctx) return undefined;

            if (beforeApply) {
                const problem = beforeApply(ctx.booking, ctx.station);
                if (problem) {
                    return res.status(400).json({ success: false, message: problem });
                }
            }

            return await applyBookingTransition(req, res, {
                booking: ctx.booking,
                actor: 'STATION',
                toStatus,
                set,
                auditAction,
                auditCompanyId: ctx.station.companyId,
                message,
            });
        } catch (error) {
            console.error('❌ Station booking action error:', error.message);
            return res.status(500).json({
                success: false,
                message: 'Failed to update booking',
            });
        }
    };

// Accepting makes a new commitment, so the station must still be live
// (approved + active). Inventory status is not re-checked here: the
// booking already holds its time.
const acceptBooking = stationAction({
    toStatus: 'ACCEPTED',
    auditAction: 'ACCEPT_BOOKING',
    message: 'Booking accepted',
    withNote: true,
    beforeApply: (booking, station) =>
        station.approvalStatus === 'APPROVED' && station.isActive !== false
            ? null
            : STATION_UNAVAILABLE_MESSAGE,
});

const rejectBooking = stationAction({
    toStatus: 'REJECTED',
    auditAction: 'REJECT_BOOKING',
    message: 'Booking rejected',
    withNote: true,
});

const requestBookingChanges = stationAction({
    toStatus: 'CHANGES_REQUESTED',
    auditAction: 'UPDATE_BOOKING',
    message: 'Changes requested',
    withNote: true,
});

const scheduleBooking = stationAction({
    toStatus: 'SCHEDULED',
    auditAction: 'SCHEDULE_BOOKING',
    message: 'Booking scheduled',
});

// A spot has aired once its slot has ended (air time + duration, Lagos time).
const spotHasAired = (booking, now = new Date()) =>
    airTimeOf(booking).getTime() + (Number(booking.duration) || 0) * 60000 <= now.getTime();

// Completion needs the spot to have aired. Broadcast proof is optional for
// now (the proof endpoint still records a link if a station sends one).
const completeBooking = stationAction({
    toStatus: 'COMPLETED',
    auditAction: 'COMPLETE_BOOKING',
    message: 'Booking completed',
    beforeApply: (booking) => {
        return spotHasAired(booking) ? null : 'This spot has not aired yet. Mark it as aired after its time slot has ended.';
    },
});

// ── Station: record broadcast proof (status unchanged) ──
const uploadBookingProof = async (req, res) => {
    try {
        const proofUrl = typeof req.body?.proofUrl === 'string' ? req.body.proofUrl.trim() : '';

        let parsed = null;
        try { parsed = new URL(proofUrl); } catch { parsed = null; }

        if (!parsed || !['http:', 'https:'].includes(parsed.protocol) || proofUrl.length > 2048) {
            return res.status(400).json({
                success: false,
                message: 'proofUrl must be an http(s) link',
            });
        }

        const ctx = await loadStationBooking(req, res);
        if (!ctx) return undefined;

        if (ctx.booking.status !== 'SCHEDULED') {
            return res.status(400).json({
                success: false,
                message: `Proof can only be added to a SCHEDULED booking (current: ${ctx.booking.status})`,
            });
        }

        const updated = await Booking.findOneAndUpdate(
            { _id: ctx.booking._id, status: 'SCHEDULED' },
            { $set: { proofUrl, proofUploadedAt: new Date(), proofVerified: false } },
            { returnDocument: 'after', runValidators: true }
        );

        if (!updated) {
            return res.status(409).json({
                success: false,
                message: 'The booking changed while this request was processed. Please reload and try again.',
            });
        }

        await writeAuditLog({
            userId: req.user.id,
            companyId: ctx.station.companyId,
            action: 'UPLOAD_BOOKING_PROOF',
            entityId: updated._id,
            metadata: {
                bookingReference: updated.bookingReference,
                status: updated.status,
            },
        });

        return res.json({
            success: true,
            message: 'Broadcast proof recorded',
            data: updated,
        });
    } catch (error) {
        console.error('❌ Upload booking proof error:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Failed to record proof',
        });
    }
};

// ── Station: bookings for stations owned by the user's company ──
const getStationBookings = async (req, res) => {
    try {
        const stations = await Station.find(stationOwnerFilter(req)).select('_id');

        const bookings = stations.length
            ? await Booking.find({ stationId: { $in: stations.map((st) => st._id) } })
                .sort({ createdAt: -1 })
                .populate('campaignId', 'name status')
                .populate('stationId', 'name type location')
                .populate('companyId', 'name')
                // Individual advertisers have no company: show their name only.
                .populate('userId', 'name')
                .populate('paymentId', 'provider status')
            : [];

        return res.json({
            success: true,
            data: bookings,
        });
    } catch (error) {
        console.error('❌ Get station bookings error:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Failed to load bookings',
        });
    }
};

// ── Customer: resubmit after the station requested changes ──
const resubmitBooking = async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            return invalidBookingId(res);
        }

        const booking = await Booking.findOne({
            _id: id,
            ...advertiserScope(req),
        });

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found',
            });
        }

        return await applyBookingTransition(req, res, {
            booking,
            actor: 'CUSTOMER',
            toStatus: 'PENDING',
            auditAction: 'UPDATE_BOOKING',
            auditCompanyId: advertiserOwner(req).companyId,
            message: 'Booking resubmitted to the station',
        });
    } catch (error) {
        console.error('❌ Resubmit booking error:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Failed to resubmit booking',
        });
    }
};

// Statuses an advertiser may cancel (the spot must not have aired yet).
const CUSTOMER_CANCELLABLE = ['PENDING', 'ACCEPTED', 'SCHEDULED', 'CHANGES_REQUESTED'];

const publicQuote = (quote) => ({
    rule: quote.rule,
    explanation: quote.explanation,
    refundAmount: quote.refundAmount,
    fee: quote.fee,
    feePercent: quote.feePercent,
    paidValue: quote.paidValue,
    campaignStarted: quote.campaignStarted,
    progress: quote.progress,
    airsAt: quote.airsAt,
});

// Cancel one booking as its advertiser, applying the policy quote.
// Returns { status, body } so it serves both endpoints and campaign cancel.
const cancelBookingAsCustomer = async (req, booking, { now = new Date(), quote: givenQuote } = {}) => {
    if (!CUSTOMER_CANCELLABLE.includes(booking.status)) {
        return { status: 403, body: { success: false, message: `Cannot cancel booking with status: ${booking.status}` } };
    }

    if (!canStillCancel(booking, now)) {
        return {
            status: 400,
            body: {
                success: false,
                message: airTimeOf(booking) <= now
                    ? 'This spot has already aired, so it cannot be cancelled.'
                    : `Cancellations close ${CANCEL_CUTOFF_HOURS} hours before broadcast, so this spot can no longer be cancelled.`,
            },
        };
    }

    const quote = givenQuote || await quoteForBooking(booking, now);
    const refund = customerRefundFields(booking, quote);
    const oldStatus = booking.status;

    // Conditional write: if the station moved the booking on in the
    // meantime (e.g. SCHEDULED → COMPLETED), don't overwrite that.
    const cancelled = await Booking.findOneAndUpdate(
        { _id: booking._id, ...advertiserScope(req), status: oldStatus, ...refund.filter },
        { $set: { status: 'CANCELLED', ...refund.set } },
        { returnDocument: 'after' }
    );

    if (!cancelled) {
        return { status: 409, body: { success: false, message: 'The booking changed while this request was processed. Please reload and try again.' } };
    }

    await writeAuditLog({
        userId: req.user.id,
        companyId: advertiserOwner(req).companyId,
        action: 'CANCEL_BOOKING',
        entityId: booking._id,
        metadata: {
            bookingReference: booking.bookingReference,
            oldStatus,
            newStatus: 'CANCELLED',
            rule: quote.rule,
            refundAmount: quote.refundAmount,
            fee: quote.fee,
        },
    });

    await recordBookingRefund(req, cancelled, quote.explanation);
    await notifyCustomerCancellation(cancelled);

    return {
        status: 200,
        body: {
            success: true,
            message: quote.refundAmount > 0
                ? 'Booking cancelled and refunded'
                : 'Booking cancelled',
            data: cancelled,
            cancellation: publicQuote(quote),
        },
    };
};

// ─────────────────────────────────────────────
// CANCEL BOOKING (advertiser)
// ─────────────────────────────────────────────

const loadOwnBooking = async (req, res) => {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
        invalidBookingId(res);
        return null;
    }

    const booking = await Booking.findOne({ _id: id, ...advertiserScope(req) });

    if (!booking) {
        res.status(404).json({ success: false, message: 'Booking not found' });
        return null;
    }

    return booking;
};

const cancelBooking = async (req, res) => {
    try {
        const booking = await loadOwnBooking(req, res);
        if (!booking) return undefined;

        const result = await cancelBookingAsCustomer(req, booking);
        return res.status(result.status).json(result.body);
    } catch (error) {
        console.error('❌ Cancel booking error:', error.name, error.message);

        return res.status(500).json({
            success: false,
            message: 'Failed to cancel booking',
        });
    }
};

// What cancelling would refund, before the advertiser confirms.
const getBookingCancellationQuote = async (req, res) => {
    try {
        const booking = await loadOwnBooking(req, res);
        if (!booking) return undefined;

        const cancellable = CUSTOMER_CANCELLABLE.includes(booking.status) && canStillCancel(booking);
        const quote = await quoteForBooking(booking);

        return res.json({
            success: true,
            data: { cancellable, ...publicQuote(quote) },
        });
    } catch (error) {
        console.error('❌ Cancellation quote error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to work out the cancellation' });
    }
};

// ─────────────────────────────────────────────
// CAMPAIGN CANCELLATION (advertiser) — every spot that hasn't aired
// is cancelled under the same policy, quoted once for the whole campaign
// so every spot gets the same progress-based fee.
// ─────────────────────────────────────────────

const quoteCampaignCancellation = async (campaign, now = new Date()) => {
    const campaignBookings = await Booking.find({ campaignId: campaign._id })
        .select('bookingReference stationId status price currency date time duration paymentStatus paymentId companyId userId campaignId')
        .populate('stationId', 'name');

    const paymentIds = [...new Set(campaignBookings.map((b) => b.paymentId).filter(Boolean).map(String))];
    const payments = paymentIds.length ? await Payment.find({ _id: { $in: paymentIds } }) : [];
    const paymentById = new Map(payments.map((p) => [String(p._id), p]));

    const items = campaignBookings
        .filter((b) => CUSTOMER_CANCELLABLE.includes(b.status) && canStillCancel(b, now))
        .map((b) => ({
            booking: b,
            quote: quoteCancellation({ booking: b, payment: paymentById.get(String(b.paymentId)) || null, campaignBookings, now }),
        }));

    const totals = items.reduce((t, { quote }) => ({
        refundAmount: Math.round((t.refundAmount + quote.refundAmount) * 100) / 100,
        fee: Math.round((t.fee + quote.fee) * 100) / 100,
    }), { refundAmount: 0, fee: 0 });

    return { items, totals, campaignBookings };
};

const cancelCampaignBookings = async (req, campaign) => {
    const now = new Date();
    const { items, totals } = await quoteCampaignCancellation(campaign, now);
    const outcomes = [];

    for (const { booking, quote } of items) {
        const result = await cancelBookingAsCustomer(req, booking, { now, quote });
        outcomes.push({
            bookingId: booking._id,
            bookingReference: booking.bookingReference,
            status: result.status,
            refundAmount: result.status === 200 ? quote.refundAmount : 0,
            fee: result.status === 200 ? quote.fee : 0,
            message: result.body.message,
        });
    }

    return { outcomes, totals };
};

// ─────────────────────────────────────────────
// STATION-CAUSED RELEASE (blocked dates): full refund, no fee.
// PENDING / CHANGES_REQUESTED → REJECTED; ACCEPTED / SCHEDULED → CANCELLED.
// ─────────────────────────────────────────────

const STATION_RELEASE_TARGET = {
    PENDING: 'REJECTED',
    CHANGES_REQUESTED: 'REJECTED',
    ACCEPTED: 'CANCELLED',
    SCHEDULED: 'CANCELLED',
};

const releaseBookingForStation = async (req, booking, reason) => {
    const toStatus = STATION_RELEASE_TARGET[booking.status];
    if (!toStatus) return { released: false, reason: `status ${booking.status}` };

    const refund = await stationRefundFields(booking, reason);
    const updated = await Booking.findOneAndUpdate(
        { _id: booking._id, status: booking.status, ...refund.filter },
        { $set: { status: toStatus, stationNote: reason, ...refund.set } },
        { returnDocument: 'after' }
    );

    if (!updated) return { released: false, reason: 'changed concurrently' };

    await writeAuditLog({
        userId: req.user.id,
        companyId: booking.companyId || null,
        action: toStatus === 'REJECTED' ? 'REJECT_BOOKING' : 'CANCEL_BOOKING',
        entityId: updated._id,
        metadata: {
            bookingReference: updated.bookingReference,
            oldStatus: booking.status,
            newStatus: toStatus,
            actor: 'STATION',
            reason,
        },
    });

    await recordBookingRefund(req, updated, reason);
    await notifyBookingStatus(updated, { actor: 'STATION', toStatus });

    return { released: true, status: toStatus, refundAmount: updated.refundAmount || 0 };
};

// ─────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────

module.exports = {
    getBookings,
    getAdminBookings,
    getBooking,
    createBooking,
    cancelBooking,
    getBookingCancellationQuote,
    resubmitBooking,
    getStationBookings,
    acceptBooking,
    rejectBooking,
    requestBookingChanges,
    scheduleBooking,
    uploadBookingProof,
    completeBooking,
    // Shared with checkout (controllers/payment.controller.js)
    bookingHelpers: {
        validateBookingFields,
        checkCampaignForBooking,
        checkStationForBooking,
        takesExclusiveTime,
        getBookingRange,
        findConflictingBooking,
        generateBookingReference,
        writeAuditLog,
        quoteCampaignCancellation,
        cancelCampaignBookings,
        releaseBookingForStation,
        publicQuote,
    },
};