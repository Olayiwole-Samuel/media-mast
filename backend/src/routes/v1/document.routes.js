const express = require('express');

const {
    listMyDocuments,
    uploadDocument,
    downloadDocument,
    deleteMyDocument,
} = require('../../controllers/document.controller');
const { protect } = require('../../middleware/auth');
const { requireAdvertiser, requirePermission } = require('../../middleware/role');
const { objectIdParam } = require('../../utils/objectId');
const { MAX_FILE_BYTES } = require('../../utils/documentStorage');

const router = express.Router();

router.use(protect);
router.use(requireAdvertiser);
router.param('id', objectIdParam('document'));

router.get('/', requirePermission('CREATIVE_VIEW'), listMyDocuments);
// The raw file is the body (any content type); a little headroom over the limit
// so an oversized file gets the friendly size message rather than a 413.
router.post(
    '/',
    requirePermission('CREATIVE_UPLOAD'),
    express.raw({ type: () => true, limit: MAX_FILE_BYTES + 64 * 1024 }),
    uploadDocument
);
router.get('/:id/download', requirePermission('CREATIVE_VIEW'), downloadDocument);
router.delete('/:id', requirePermission('CREATIVE_UPLOAD'), deleteMyDocument);

module.exports = router;
