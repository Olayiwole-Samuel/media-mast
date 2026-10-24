const express = require('express');
const {
    getEmployeePermissions,
    updateEmployeePermissions,
    getPermissionTemplates,
    activateEmployee,
    deactivateEmployee,
} = require('../../controllers/employee.controller');
const { protect } = require('../../middleware/auth');
const {
    requireCompany,
    requireCompanyOwner,
    requirePermission,
} = require('../../middleware/role');
const { objectIdParam } = require('../../utils/objectId');

const router = express.Router();

// ── All routes require authentication and company access ──
router.use(protect);
router.use(requireCompany);

// Every :id in this router is a Employee ObjectId: a malformed id is a
// 400 before any query runs (N17). Valid-but-unknown ids keep their 404.
router.param('id', objectIdParam('employee'));

// ── Permission Templates ──
router.get('/templates', getPermissionTemplates);

// ── Employee Permission Routes ──
// A colleague's name, email and permissions: same data class as /company/team.
router.get('/:id/permissions', requirePermission('TEAM_VIEW'), getEmployeePermissions);

// ── Employee access management: Company Owner only ──
router.put('/:id/permissions', requireCompanyOwner, updateEmployeePermissions);
router.patch('/:id/activate', requireCompanyOwner, activateEmployee);
router.patch('/:id/deactivate', requireCompanyOwner, deactivateEmployee);

module.exports = router;