const express = require('express');

const {
    getCompanySettings,
    updateCompanySettings,
    updateCompanyLogo,
    getCompanyUsage,
} = require('../../controllers/settings.controller');

const { protect } = require('../../middleware/auth');

const {
    requireCompany,
    requireCompanyOwner,
    requirePermission,
} = require('../../middleware/role');

const router = express.Router();

// ─────────────────────────────────────────────
// AUTHENTICATION + COMPANY ACCESS
// ─────────────────────────────────────────────

router.use(protect);
router.use(requireCompany);

// ─────────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────────

// Company settings are owner-managed (see PUT / PATCH below) and there is no
// settings permission in utils/permissions.js, so reading them is owner-only.
router.get('/', requireCompanyOwner, getCompanySettings);

// Only the Company Owner can change company settings.
router.put(
    '/',
    requireCompanyOwner,
    updateCompanySettings
);

// Only the Company Owner can change the company logo.
router.patch(
    '/logo',
    requireCompanyOwner,
    updateCompanyLogo
);

// Usage counts (employees, campaigns, bookings): analytics data.
router.get('/usage', requirePermission('ANALYTICS_VIEW'), getCompanyUsage);

module.exports = router;