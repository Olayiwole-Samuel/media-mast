const express = require('express');

const {
    getCampaigns,
    getCampaign,
    createCampaign,
    updateCampaign,
    deleteCampaign,
    updateCampaignStatus,
    getCampaignCancellationQuote,
    cancelCampaign,
} = require('../../controllers/campaign.controller');

const { protect } = require('../../middleware/auth');

const {
    requireAdvertiser,
    requirePermission,
} = require('../../middleware/role');
const { objectIdParam } = require('../../utils/objectId');

const router = express.Router();

// ─────────────────────────────────────────────
// AUTHENTICATION + COMPANY ACCESS
// ─────────────────────────────────────────────

router.use(protect);
// Individuals and companies (see requireAdvertiser in middleware/role.js).
router.use(requireAdvertiser);

// Every :id in this router is a Campaign ObjectId: a malformed id is a
// 400 before any query runs (N17). Valid-but-unknown ids keep their 404.
router.param('id', objectIdParam('campaign'));

// ─────────────────────────────────────────────
// CAMPAIGN READ ROUTES
// ─────────────────────────────────────────────

router.get(
    '/',
    requirePermission('CAMPAIGN_VIEW'),
    getCampaigns
);

router.get(
    '/:id',
    requirePermission('CAMPAIGN_VIEW'),
    getCampaign
);

// ─────────────────────────────────────────────
// CAMPAIGN CREATE
// ─────────────────────────────────────────────

router.post(
    '/',
    requirePermission('CAMPAIGN_CREATE'),
    createCampaign
);

// ─────────────────────────────────────────────
// CAMPAIGN EDIT
// ─────────────────────────────────────────────

router.put(
    '/:id',
    requirePermission('CAMPAIGN_EDIT'),
    updateCampaign
);

// ─────────────────────────────────────────────
// CAMPAIGN DELETE
// ─────────────────────────────────────────────

router.delete(
    '/:id',
    requirePermission('CAMPAIGN_DELETE'),
    deleteCampaign
);

// ─────────────────────────────────────────────
// CAMPAIGN STATUS
// ─────────────────────────────────────────────

router.patch(
    '/:id/status',
    requirePermission('CAMPAIGN_SUBMIT'),
    updateCampaignStatus
);

// ─────────────────────────────────────────────
// CAMPAIGN CANCELLATION (policy: free before start, 10–20% fee in progress)
// ─────────────────────────────────────────────

router.get(
    '/:id/cancellation-quote',
    requirePermission('CAMPAIGN_VIEW'),
    getCampaignCancellationQuote
);

router.post(
    '/:id/cancel',
    requirePermission('BOOKING_CANCEL'),
    cancelCampaign
);

// Spots planned / aired / pending and money held / spent, per media house.
router.get('/:id/tracker', requireAdvertiser, requirePermission('CAMPAIGN_VIEW'), require('../../controllers/mediaPlan.controller').getCampaignTracker);
// Bulk: cancel or move many spots; the plan as Excel; the proof-of-airing report.
const ops = require('../../controllers/operations.controller');
router.post('/:id/bulk', requireAdvertiser, requirePermission('BOOKING_CANCEL'), ops.bulkCampaign);
router.get('/:id/plan.xlsx', requireAdvertiser, requirePermission('CAMPAIGN_VIEW'), ops.exportCampaignPlan);
router.get('/:id/report', requireAdvertiser, requirePermission('CAMPAIGN_VIEW'), ops.getCampaignReport);

module.exports = router;