const express = require('express');
const router = express.Router();

// ── Load Routes ──
const authRoutes = require('./v1/auth.routes');
const companyRoutes = require('./v1/company.routes');
const campaignRoutes = require('./v1/campaign.routes');
const bookingRoutes = require('./v1/booking.routes');
const stationRoutes = require('./v1/station.routes');
const settingsRoutes = require('./v1/settings.routes');
const creativeRoutes = require('./v1/creative.routes');
const employeeRoutes = require('./v1/employee.routes');
const adminRoutes = require('./v1/admin.routes');
const departmentRoutes = require('./v1/department.routes');
const paymentRoutes = require('./v1/payment.routes');
const stationPortalRoutes = require('./v1/stationPortal.routes');
const subscriptionRoutes = require('./v1/subscription.routes');
const documentRoutes = require('./v1/document.routes');
const notificationRoutes = require('./v1/notification.routes');
const insightsRoutes = require('./v1/insights.routes');
const { runReminderJob } = require('../controllers/notification.controller');
const { getPlans } = require('../controllers/subscription.controller');

// ── Health Check ──
router.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'API v1 is running',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
    });
});

// ── Test Route ──
router.get('/test', (req, res) => {
    res.json({
        success: true,
        message: 'Test route is working!',
        timestamp: new Date().toISOString(),
    });
});

// ── Routes ──
router.use('/auth', authRoutes);
router.use('/company', companyRoutes);
router.use('/campaigns', campaignRoutes);
router.use('/bookings', bookingRoutes);
router.use('/stations', stationRoutes);
router.use('/settings', settingsRoutes);
router.use('/creatives', creativeRoutes);
router.use('/employees', employeeRoutes);
router.use('/admin', adminRoutes);
router.use('/departments', departmentRoutes); // ← ADD THIS
router.use('/payments', paymentRoutes);
router.use('/station-portal', stationPortalRoutes);
router.use('/subscriptions', subscriptionRoutes);
router.use('/documents', documentRoutes);
router.use('/notifications', notificationRoutes);
router.use('/insights', insightsRoutes);
// Cron (no user session): send due slot reminders. Bearer CRON_SECRET.
router.post('/jobs/reminders', runReminderJob);
// Public: plans and checkout discount tiers (pricing page).
router.get('/plans', getPlans);

module.exports = router;