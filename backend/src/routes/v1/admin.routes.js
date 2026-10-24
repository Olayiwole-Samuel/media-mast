const express = require('express');

const {
    getDashboardStats,

    // Companies
    getCompanies,
    createCompany,
    getCompanyById,
    updateCompany,
    updateCompanyVerification,
    suspendCompany,
    reactivateCompany,
    getCompanyWorkers,

    // Company Workers
    getCompanyWorkerById,
    createCompanyWorker,
    updateCompanyWorker,
    activateCompanyWorker,
    deactivateCompanyWorker,
    reactivateCompanyWorker,
    removeCompanyWorker,

    // Stations
    getStations,
    getStationById,
    createStation,
    updateStation,
    approveStation,
    rejectStation,
    updateStationInventoryStatus,
    activateStation,
    deactivateStation,
    deleteStation,

    // Users
    getUsers,
    suspendUser,
    activateUser,

    // Individuals
    getIndividuals,
    getIndividualById,
    updateIndividual,
    suspendIndividual,
    activateIndividual,
    reactivateIndividual,
    deleteIndividual,
    resetIndividual,

    // Individual Campaigns
    getIndividualCampaigns,
    getIndividualCampaign,
    createIndividualCampaign,
    updateIndividualCampaign,
    updateIndividualCampaignStatus,
    deleteIndividualCampaign,

    // Individual Bookings
    getIndividualBookings,

    // Individual Activity
    getIndividualActivity,

} = require('../../controllers/admin.controller');

// Campaign controllers
const {
    getAdminCampaigns,
    getAdminCampaign,
} = require('../../controllers/campaign.controller');

// Booking controllers
const {
    getAdminBookings,
} = require('../../controllers/booking.controller');

const { protect } = require('../../middleware/auth');
const { requireAdmin } = require('../../middleware/role');

const router = express.Router();


// ============================================================
// ALL ADMIN ROUTES
// ============================================================

router.use(protect);
router.use(requireAdmin);


// ============================================================
// DASHBOARD
// ============================================================

router.get(
    '/dashboard',
    getDashboardStats
);


// ============================================================
// COMPANIES
// ============================================================

// Get all companies
router.get(
    '/companies',
    getCompanies
);

// Create company
router.post(
    '/companies',
    createCompany
);

// Get single company
router.get(
    '/companies/:id',
    getCompanyById
);

// Update company
router.patch(
    '/companies/:id',
    updateCompany
);

// Update company verification
router.patch(
    '/companies/:id/verification',
    updateCompanyVerification
);

// Company owner record: check (read only) and repair (safe cases only)
const {
    checkCompanyOwner,
    repairCompanyOwner,
} = require('../../controllers/companyOwner.controller');

router.get('/companies/:id/owner-check', checkCompanyOwner);
router.post('/companies/:id/owner-repair', repairCompanyOwner);

// Suspend company
router.patch(
    '/companies/:id/suspend',
    suspendCompany
);

// Reactivate company
router.patch(
    '/companies/:id/reactivate',
    reactivateCompany
);

// Get company workers
router.get(
    '/companies/:id/workers',
    getCompanyWorkers
);


// ============================================================
// COMPANY WORKERS
// ============================================================

// Get single worker
router.get(
    '/companies/:id/workers/:workerId',
    getCompanyWorkerById
);

// Create worker
router.post(
    '/companies/:id/workers',
    createCompanyWorker
);

// Update worker
router.patch(
    '/companies/:id/workers/:workerId',
    updateCompanyWorker
);

// Activate worker
router.patch(
    '/companies/:id/workers/:workerId/activate',
    activateCompanyWorker
);

// Deactivate worker
router.patch(
    '/companies/:id/workers/:workerId/deactivate',
    deactivateCompanyWorker
);

// Reactivate worker
router.patch(
    '/companies/:id/workers/:workerId/reactivate',
    reactivateCompanyWorker
);

// Remove worker
router.delete(
    '/companies/:id/workers/:workerId',
    removeCompanyWorker
);


// ============================================================
// STATIONS
// ============================================================

// Get all stations
router.get(
    '/stations',
    getStations
);

// Get single station
router.get(
    '/stations/:id',
    getStationById
);

// Create station
router.post(
    '/stations',
    createStation
);

// Update station
router.patch(
    '/stations/:id',
    updateStation
);

// Approve station
router.patch(
    '/stations/:id/approve',
    approveStation
);

// Reject station
router.patch(
    '/stations/:id/reject',
    rejectStation
);

// Update inventory status
router.patch(
    '/stations/:id/inventory-status',
    updateStationInventoryStatus
);

// Activate station
router.patch(
    '/stations/:id/activate',
    activateStation
);

// Deactivate station
router.patch(
    '/stations/:id/deactivate',
    deactivateStation
);

// Delete station
router.delete(
    '/stations/:id',
    deleteStation
);


// ============================================================
// CAMPAIGNS
// ============================================================

// Get all campaigns
router.get(
    '/campaigns',
    getAdminCampaigns
);

// Get single campaign
router.get(
    '/campaigns/:id',
    getAdminCampaign
);


// ============================================================
// BOOKINGS
// ============================================================

// Get all bookings
router.get(
    '/bookings',
    getAdminBookings
);

// ============================================================
// PAYMENTS (every payment, totals; refunds are made by cancellations)
// ============================================================

const {
    getAdminPayments,
    getAdminPayment,
} = require('../../controllers/payment.controller');

router.get('/payments', getAdminPayments);
router.get('/payments/:id', getAdminPayment);

// ============================================================
// SUBSCRIPTIONS & PLANS
// ============================================================

const {
    getAdminSubscriptions,
    assignSubscription,
    getAdminPlans,
    updatePlan,
} = require('../../controllers/subscription.controller');

router.get('/subscriptions', getAdminSubscriptions);
router.post('/subscriptions', assignSubscription);
router.get('/plans', getAdminPlans);
router.put('/plans/:code', updatePlan);


// ============================================================
// USERS
// ============================================================

// Get all users
router.get(
    '/users',
    getUsers
);

// Suspend user
router.patch(
    '/users/:id/suspend',
    suspendUser
);

// Activate user
router.patch(
    '/users/:id/activate',
    activateUser
);


// ============================================================
// INDIVIDUALS
// ============================================================

// Get all individuals
router.get(
    '/individuals',
    getIndividuals
);

// Get individual campaigns
router.get(
    '/individuals/:id/campaigns',
    getIndividualCampaigns
);

// Get single individual campaign
router.get(
    '/individuals/:id/campaigns/:campaignId',
    getIndividualCampaign
);

// Update individual
router.patch(
    '/individuals/:id',
    updateIndividual
);

// Update individual campaign
router.put(
    '/individuals/:id/campaigns/:campaignId',
    updateIndividualCampaign
);

// Get individual
router.get(
    '/individuals/:id',
    getIndividualById
);

// Delete individual campaign
router.delete(
    '/individuals/:id/campaigns/:campaignId',
    deleteIndividualCampaign
);

// Suspend individual
router.patch(
    '/individuals/:id/suspend',
    suspendIndividual
);

// Update individual campaign status
router.patch(
    '/individuals/:id/campaigns/:campaignId/status',
    updateIndividualCampaignStatus
);

// Activate individual
router.patch(
    '/individuals/:id/activate',
    activateIndividual
);

// Create campaign for individual
router.post(
    '/individuals/:id/campaigns',
    createIndividualCampaign
);

// Get individual bookings
router.get(
    '/individuals/:id/bookings',
    getIndividualBookings
);

// Get individual activity
router.get(
    '/individuals/:id/activity',
    getIndividualActivity
);

// Reactivate individual
router.patch(
    '/individuals/:id/reactivate',
    reactivateIndividual
);

// Reset individual
router.post(
    '/individuals/:id/reset',
    resetIndividual
);

// Delete individual
router.delete(
    '/individuals/:id',
    deleteIndividual
);


// ============================================================
// EXPORT
// ============================================================

// ── Station managers (STATION accounts that run assigned stations' desks) ──
const {
    listStationManagers,
    createStationManager,
    updateStationManager,
    setStationManagers,
} = require('../../controllers/stationManager.controller');

router.get('/station-managers', listStationManagers);
router.post('/station-managers', createStationManager);
router.patch('/station-managers/:id', updateStationManager);
router.put('/stations/:id/managers', setStationManagers);

module.exports = router;