const express = require('express');

const {
    getDashboardData,
    getTeam,
    inviteTeamMember,
    removeTeamMember,
    updateTeamMemberRole,
} = require('../../controllers/company.controller');

const { protect } = require('../../middleware/auth');

const {
    requireCompany,
    requireCompanyOwner,
    requirePermission,
} = require('../../middleware/role');
const { objectIdParam } = require('../../utils/objectId');

const router = express.Router();

// ─────────────────────────────────────────────
// ROUTER MIDDLEWARE
// ─────────────────────────────────────────────

router.use(protect);
router.use(requireCompany);

// Every :id in this router is a Employee (team member) ObjectId: a malformed id is a
// 400 before any query runs (N17). Valid-but-unknown ids keep their 404.
router.param('id', objectIdParam('team member'));

// ─────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────

// Spend, bookings and recent activity: analytics data.
router.get(
    '/dashboard',
    requirePermission('ANALYTICS_VIEW'),
    getDashboardData
);

// ─────────────────────────────────────────────
// COMPANY TEAM
// ─────────────────────────────────────────────

// Colleague names, emails and permissions.
router.get(
    '/team',
    requirePermission('TEAM_VIEW'),
    getTeam
);

router.post(
    '/team/invite',
    requireCompanyOwner,
    inviteTeamMember
);

router.delete(
    '/team/:id',
    requireCompanyOwner,
    removeTeamMember
);

router.put(
    '/team/:id',
    requireCompanyOwner,
    updateTeamMemberRole
);

module.exports = router;