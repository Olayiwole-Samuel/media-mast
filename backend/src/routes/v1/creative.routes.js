const express = require('express');

const {
    getCreativesByCampaign,
    getCreative,
    uploadCreative,
    updateCreative,
    deleteCreative,
    approveCreative,
    rejectCreative,
} = require('../../controllers/creative.controller');

const { protect } = require('../../middleware/auth');

const {
    requireAdvertiser,
    requirePermission,
} = require('../../middleware/role');

const router = express.Router();

// ─────────────────────────────────────────────
// AUTHENTICATION + COMPANY ACCESS
// ─────────────────────────────────────────────

router.use(protect);
// Individuals and companies (see requireAdvertiser in middleware/role.js).
router.use(requireAdvertiser);

// ─────────────────────────────────────────────
// CREATIVE READ ROUTES
// ─────────────────────────────────────────────

router.get(
    '/campaign/:campaignId',
    requirePermission('CREATIVE_VIEW'),
    getCreativesByCampaign
);

router.get(
    '/:id',
    requirePermission('CREATIVE_VIEW'),
    getCreative
);

// ─────────────────────────────────────────────
// CREATIVE UPLOAD / EDIT
// ─────────────────────────────────────────────

router.post(
    '/',
    requirePermission('CREATIVE_UPLOAD'),
    uploadCreative
);

router.put(
    '/:id',
    requirePermission('CREATIVE_UPLOAD'),
    updateCreative
);

// ─────────────────────────────────────────────
// CREATIVE DELETE
// ─────────────────────────────────────────────

router.delete(
    '/:id',
    requirePermission('CREATIVE_DELETE'),
    deleteCreative
);

// ─────────────────────────────────────────────
// CREATIVE REVIEW
// ─────────────────────────────────────────────

router.patch(
    '/:id/approve',
    requirePermission('CREATIVE_APPROVE'),
    approveCreative
);

router.patch(
    '/:id/reject',
    requirePermission('CREATIVE_APPROVE'),
    rejectCreative
);

module.exports = router;