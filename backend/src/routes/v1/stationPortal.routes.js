const express = require('express');

const {
    getMyStations,
    updateMyStation,
    getSummary,
    setAirtimeHours,
    setRateCard,
    addBlackout,
    removeBlackout,
} = require('../../controllers/stationPortal.controller');
const { protect } = require('../../middleware/auth');
const { requireStationOperator } = require('../../middleware/role');
const { objectIdParam } = require('../../utils/objectId');

// A media station's own portal: its listings, profile and dashboard.
// Booking requests are handled through /bookings/station and the
// /bookings/:id station actions.
const router = express.Router();

router.use(protect);
router.param('id', objectIdParam('station'));

router.get('/summary', requireStationOperator('BOOKING_VIEW'), getSummary);
router.get('/stations', requireStationOperator('BOOKING_VIEW'), getMyStations);
router.put('/stations/:id', requireStationOperator('BOOKING_APPROVE'), updateMyStation);

// Calendar
router.put('/stations/:id/airtime', requireStationOperator('BOOKING_APPROVE'), setAirtimeHours);
router.put('/stations/:id/rate-card', requireStationOperator('BOOKING_APPROVE'), setRateCard);
router.post('/stations/:id/blackouts', requireStationOperator('BOOKING_APPROVE'), addBlackout);
router.delete('/stations/:id/blackouts/:blackoutId', requireStationOperator('BOOKING_APPROVE'), removeBlackout);

module.exports = router;
