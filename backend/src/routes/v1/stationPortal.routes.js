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

// Earnings (paid for aired spots), the bank account, payout requests.
const settlement = require('../../controllers/settlement.controller');
router.get('/earnings', requireStationOperator('BOOKING_VIEW'), settlement.getEarnings);

// Media plans: accept a whole order; mark a day's spots aired (one TX log + clip).
const plans = require('../../controllers/mediaPlan.controller');
router.patch('/orders/:paymentId/accept', requireStationOperator('BOOKING_APPROVE'), plans.acceptOrder);
router.patch('/stations/:id/aired-day', requireStationOperator('BOOKING_APPROVE'), plans.markDayAired);
router.patch('/schedule-all', requireStationOperator('BOOKING_APPROVE'), plans.scheduleAll);

// Agencies' volume discounts with this media house: confirm or reject.
const agreements = require('../../controllers/volumeAgreement.controller');
router.get('/volume-agreements', requireStationOperator('BOOKING_VIEW'), agreements.getStationAgreements);
router.patch('/volume-agreements/:agreementId', requireStationOperator('BOOKING_APPROVE'), (req, res) => { req.params.id = req.params.agreementId; return agreements.decideAgreement(req, res); });
router.put('/stations/:id/payout-account', requireStationOperator('BOOKING_APPROVE'), settlement.setPayoutAccount);
router.post('/stations/:id/payouts', requireStationOperator('BOOKING_APPROVE'), settlement.requestPayout);
router.get('/stations', requireStationOperator('BOOKING_VIEW'), getMyStations);
router.put('/stations/:id', requireStationOperator('BOOKING_APPROVE'), updateMyStation);

// Calendar
router.put('/stations/:id/airtime', requireStationOperator('BOOKING_APPROVE'), setAirtimeHours);
router.put('/stations/:id/rate-card', requireStationOperator('BOOKING_APPROVE'), setRateCard);
router.post('/stations/:id/blackouts', requireStationOperator('BOOKING_APPROVE'), addBlackout);
router.delete('/stations/:id/blackouts/:blackoutId', requireStationOperator('BOOKING_APPROVE'), removeBlackout);

module.exports = router;
