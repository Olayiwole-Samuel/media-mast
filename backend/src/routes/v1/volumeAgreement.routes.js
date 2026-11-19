const express = require('express');
const { protect } = require('../../middleware/auth');
const { requireAdvertiser } = require('../../middleware/role');
const va = require('../../controllers/volumeAgreement.controller');

// A media agency's volume discounts with media houses (each confirmed by the media house).
const router = express.Router();
router.use(protect);
router.use(requireAdvertiser);

router.get('/', va.getMyAgreements);
router.put('/:stationId', va.saveMyAgreement);
router.delete('/:stationId', va.deleteMyAgreement);

module.exports = router;
