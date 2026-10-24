const express = require('express');

const { getSpendInsights } = require('../../controllers/insights.controller');
const { protect } = require('../../middleware/auth');

const router = express.Router();

// Any signed-in account: advertisers plan with it, stations and admins see the market.
router.use(protect);
router.get('/spend', getSpendInsights);

module.exports = router;
