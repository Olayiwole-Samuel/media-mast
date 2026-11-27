const express = require('express');
const { protect } = require('../../middleware/auth');
const { requireAdvertiser } = require('../../middleware/role');
const { getMyWallet, getMyTransactions, fundMyWallet, getFundingResult, updateMyWalletSettings } = require('../../controllers/wallet.controller');

// The advertiser's wallet (company owner or individual).
const router = express.Router();
router.use(protect);
router.use(requireAdvertiser);

router.get('/', getMyWallet);
router.get('/transactions', getMyTransactions);
router.post('/fund', fundMyWallet);
router.get('/fund/:reference', getFundingResult);
router.patch('/settings', updateMyWalletSettings);

module.exports = router;
