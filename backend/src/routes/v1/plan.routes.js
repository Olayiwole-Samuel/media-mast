const express = require('express');
const { protect } = require('../../middleware/auth');
const { requireAdvertiser, requirePermission } = require('../../middleware/role');
const plans = require('../../controllers/mediaPlan.controller');

// Media plans: a campaign's spots over a period, priced and paid from the wallet.
// The plan cart (drafts) saves each plan as it's built, so nothing is lost
// while the advertiser funds the wallet.
const router = express.Router();
router.use(protect);
router.use(requireAdvertiser);

router.post('/quote', requirePermission('BOOKING_VIEW'), (req, res) => plans.quotePlan(req, res));
router.post('/checkout', requirePermission('BOOKING_CREATE'), (req, res) => plans.checkoutPlan(req, res));

router.get('/drafts', requirePermission('BOOKING_VIEW'), plans.getDrafts);
router.get('/drafts/:campaignId', requirePermission('BOOKING_VIEW'), plans.getDraft);
router.put('/drafts/:campaignId', requirePermission('BOOKING_CREATE'), plans.saveDraft);
router.delete('/drafts/:campaignId', requirePermission('BOOKING_CREATE'), plans.deleteDraft);
router.post('/drafts/:campaignId/checkout', requirePermission('BOOKING_CREATE'), plans.checkoutDraft);

const ops = require('../../controllers/operations.controller');
router.get('/summary', requirePermission('BOOKING_VIEW'), ops.getPlanSummary);
router.get('/drafts/:campaignId/export', requirePermission('BOOKING_VIEW'), ops.exportDraftPlan);
router.post('/drafts/:campaignId/share', requirePermission('BOOKING_CREATE'), ops.shareDraft);
router.get('/sources', requirePermission('BOOKING_VIEW'), ops.listPlanSources);
router.get('/sources/:campaignId', requirePermission('BOOKING_VIEW'), ops.getPlanSource);

module.exports = router;
