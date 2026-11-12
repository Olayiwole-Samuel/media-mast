const express = require('express');
const { protectAllowPending } = require('../../middleware/auth');
const { PART_SIZE } = require('../../utils/fileUploads');
const { startUpload, uploadPart, completeUpload, cancelUpload } = require('../../controllers/upload.controller');
const { objectIdParam } = require('../../utils/objectId');

// Large files in parts (adverts up to 100 MB). Verification documents may be
// uploaded by a business still awaiting approval; the controller checks
// which purposes each account may use.
const router = express.Router();

router.use(protectAllowPending);
router.param('id', objectIdParam('upload'));

router.post('/', startUpload);
router.put(
    '/:id/parts/:index',
    express.raw({ type: () => true, limit: PART_SIZE + 64 * 1024 }),
    uploadPart
);
router.post('/:id/complete', completeUpload);
router.delete('/:id', cancelUpload);

module.exports = router;
