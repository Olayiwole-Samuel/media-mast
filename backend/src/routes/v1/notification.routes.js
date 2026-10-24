const express = require('express');

const {
    getMyNotifications,
    markRead,
    markAllRead,
    getPreferences,
    updatePreferences,
} = require('../../controllers/notification.controller');
const { protect } = require('../../middleware/auth');

const router = express.Router();

// Every signed-in account (advertisers, station managers, admins) has a bell.
router.use(protect);

router.get('/', getMyNotifications);
router.post('/read-all', markAllRead);
router.get('/preferences', getPreferences);
router.put('/preferences', updatePreferences);
router.post('/:id/read', markRead);

module.exports = router;
