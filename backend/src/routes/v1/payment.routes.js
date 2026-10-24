const express = require('express');

const {
    checkout,
    getPayments,
    getPayment,
} = require('../../controllers/payment.controller');
const { protect } = require('../../middleware/auth');
const {
    requireAdvertiser,
    requirePermission,
} = require('../../middleware/role');
const { objectIdParam } = require('../../utils/objectId');

const router = express.Router();

// Individuals and companies pay for their own bookings.
router.use(protect);
router.use(requireAdvertiser);
router.param('id', objectIdParam('payment'));

// One payment for a cart of booking requests across stations.
router.post('/checkout', requirePermission('BOOKING_CREATE'), checkout);

router.get('/', requirePermission('PAYMENTS_VIEW'), getPayments);
router.get('/:id', requirePermission('PAYMENTS_VIEW'), getPayment);

module.exports = router;
