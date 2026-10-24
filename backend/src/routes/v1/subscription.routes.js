const express = require('express');

const {
    getMySubscription,
    subscribe,
    cancelMySubscription,
} = require('../../controllers/subscription.controller');
const { protect } = require('../../middleware/auth');
const { requireAdvertiser, requireCompanyOwner } = require('../../middleware/role');

const router = express.Router();

// Individuals manage their own plan; for a company only the owner does
// (team members use the company's subscription).
const ownerOrIndividual = (req, res, next) =>
    req.user.accountType === 'INDIVIDUAL' ? next() : requireCompanyOwner(req, res, next);

router.use(protect);
router.use(requireAdvertiser);

router.get('/me', getMySubscription);
router.post('/', ownerOrIndividual, subscribe);
router.post('/me/cancel', ownerOrIndividual, cancelMySubscription);

module.exports = router;
