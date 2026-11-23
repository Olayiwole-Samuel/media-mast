const express = require('express');
const { protect } = require('../../middleware/auth');
const { requireAdvertiser, requirePermission } = require('../../middleware/role');
const ops = require('../../controllers/operations.controller');

// Advertiser tools: invoices and the getting-started checklist.
// Mounted at the API root, so each route signs in on its own (a blanket
// router.use(protect) here would also catch public routes mounted later).
const router = express.Router();

router.get('/onboarding', protect, ops.getOnboarding);
router.get('/invoices', protect, requireAdvertiser, requirePermission('PAYMENTS_VIEW'), ops.listInvoices);
router.get('/invoices/:kind/:id', protect, requireAdvertiser, requirePermission('PAYMENTS_VIEW'), ops.getInvoice);

module.exports = router;
