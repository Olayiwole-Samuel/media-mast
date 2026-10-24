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

module.exports = router;