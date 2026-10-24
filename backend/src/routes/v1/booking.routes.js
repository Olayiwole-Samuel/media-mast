const express = require('express');

const {
    getBookings,
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
} = require('../../controllers/booking.controller');

const { protect } = require('../../middleware/auth');

const {
    requireAdvertiser,
    requireStationOperator,
    requirePermission,
} = require('../../middleware/role');

const router = express.Router();

// ─────────────────────────────────────────────
// AUTHENTICATION
//
// Customer routes (the advertiser's own bookings) serve individuals and
// companies: requireAdvertiser. Station routes act for the media company
// operates the booked station: requireStationOperator (a STATION account,
// or during the transition the media company linked to the station).
// ─────────────────────────────────────────────

router.use(protect);

// ─────────────────────────────────────────────
// BOOKING READ ROUTES
// ─────────────────────────────────────────────

router.get(
    '/',
    requireAdvertiser,
    requirePermission('BOOKING_VIEW'),
    getBookings
);

// Bookings made on stations owned by the user's company (station side).
// Declared before '/:id' so "station" is not read as a booking ID.
router.get(
    '/station',
    requireStationOperator('BOOKING_VIEW'),
    getStationBookings
);

router.get(
    '/:id',
    requireAdvertiser,
    requirePermission('BOOKING_VIEW'),
    getBooking
);

// ─────────────────────────────────────────────
// CREATE BOOKING (direct, unpaid)
// ─────────────────────────────────────────────
// Bookings are made through checkout (POST /api/v1/payments/checkout), which
// takes payment first. This direct route creates an unpaid booking, so it is
// off unless ALLOW_DIRECT_BOOKING=true (checked per request).

const directBookingGate = (req, res, next) => {
    if (process.env.ALLOW_DIRECT_BOOKING === 'true') return next();
    return res.status(410).json({
        success: false,
        message: 'Bookings are made through checkout. Add the spot to your cart and check out.',
    });
};

router.post(
    '/',
    directBookingGate,
    requireAdvertiser,
    requirePermission('BOOKING_CREATE'),
    createBooking
);

// ─────────────────────────────────────────────
// STATION ACTIONS
// ─────────────────────────────────────────────
// Only the media company that owns the booked station (Station.companyId)
// may perform these; the controller enforces that ownership. There is no
// generic status update route.

router.patch('/:id/accept', requireStationOperator('BOOKING_APPROVE'), acceptBooking);
router.patch('/:id/reject', requireStationOperator('BOOKING_APPROVE'), rejectBooking);
router.patch('/:id/request-changes', requireStationOperator('BOOKING_APPROVE'), requestBookingChanges);
router.patch('/:id/schedule', requireStationOperator('BOOKING_APPROVE'), scheduleBooking);
router.patch('/:id/proof', requireStationOperator('BOOKING_APPROVE'), uploadBookingProof);
router.patch('/:id/complete', requireStationOperator('BOOKING_APPROVE'), completeBooking);

// ─────────────────────────────────────────────
// CUSTOMER: RESUBMIT AFTER REQUESTED CHANGES
// ─────────────────────────────────────────────

router.patch(
    '/:id/resubmit',
    requireAdvertiser,
    requirePermission('BOOKING_CREATE'),
    resubmitBooking
);

// ─────────────────────────────────────────────
// CANCEL BOOKING
// ─────────────────────────────────────────────

// What cancelling would refund (policy quote), before confirming.
router.get(
    '/:id/cancellation-quote',
    requireAdvertiser,
    requirePermission('BOOKING_VIEW'),
    getBookingCancellationQuote
);

router.post(
    '/:id/cancel',
    requireAdvertiser,
    requirePermission('BOOKING_CANCEL'),
    cancelBooking
);

module.exports = router;