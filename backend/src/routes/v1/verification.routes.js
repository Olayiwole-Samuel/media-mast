const express = require('express');
const { protectAllowPending } = require('../../middleware/auth');
const {
    getMyVerification,
    updateMyVerification,
    addMyDocument,
    removeMyDocument,
    downloadMyDocument,
    setMyRateCard,
    submitMyVerification,
} = require('../../controllers/verification.controller');
const { objectIdParam } = require('../../utils/objectId');

// A business's own verification (open while its account is PENDING, and
// afterwards so it can see what it sent).
const router = express.Router();

router.use(protectAllowPending);
router.param('docId', objectIdParam('document'));

router.get('/', getMyVerification);
router.put('/', updateMyVerification);
router.post('/documents', addMyDocument);
router.delete('/documents/:docId', removeMyDocument);
router.get('/documents/:docId/file', downloadMyDocument);
router.put('/rate-card', setMyRateCard);
router.post('/submit', submitMyVerification);

module.exports = router;
