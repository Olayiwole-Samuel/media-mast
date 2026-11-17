const express = require('express');
const { protect } = require('../../middleware/auth');
const { requireAdvertiser, requirePermission } = require('../../middleware/role');
const { quotePlan, checkoutPlan } = require('../../controllers/mediaPlan.controller');

// Media plans: a campaign's spots over a period, priced and paid from the wallet.
const router = express.Router();
router.use(protect);
router.use(requireAdvertiser);

router.post('/quote', requirePermission('BOOKING_VIEW'), quotePlan);
router.post('/checkout', requirePermission('BOOKING_CREATE'), checkoutPlan);

module.exports = router;
