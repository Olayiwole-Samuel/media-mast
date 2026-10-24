const express = require('express');

const {
    getDepartments,
    getDepartment,
    createDepartment,
    updateDepartment,
    deleteDepartment,
    assignEmployee,
} = require('../../controllers/department.controller');

const { protect } = require('../../middleware/auth');

const {
    requireCompany,
    requireCompanyOwner,
    requirePermission,
} = require('../../middleware/role');
const { objectIdParam } = require('../../utils/objectId');

const router = express.Router();

// ─────────────────────────────────────────────
// AUTHENTICATION + COMPANY ACCESS
// ─────────────────────────────────────────────

router.use(protect);
router.use(requireCompany);

// Every :id in this router is a Department ObjectId: a malformed id is a
// 400 before any query runs (N17). Valid-but-unknown ids keep their 404.
router.param('id', objectIdParam('department'));

// ─────────────────────────────────────────────
// DEPARTMENT READ ROUTES
// ─────────────────────────────────────────────

// Departments expose team structure (managers, members' names, emails and
// permissions), so reading them needs TEAM_VIEW. There is no separate
// department permission in utils/permissions.js.
router.get('/', requirePermission('TEAM_VIEW'), getDepartments);

router.get('/:id', requirePermission('TEAM_VIEW'), getDepartment);

// ─────────────────────────────────────────────
// DEPARTMENT MANAGEMENT
// ─────────────────────────────────────────────

// Only the Company Owner can create departments.
router.post(
    '/',
    requireCompanyOwner,
    createDepartment
);

// Only the Company Owner can update departments.
router.put(
    '/:id',
    requireCompanyOwner,
    updateDepartment
);

// Only the Company Owner can delete departments.
router.delete(
    '/:id',
    requireCompanyOwner,
    deleteDepartment
);

// Only the Company Owner can assign employees to departments.
router.post(
    '/assign',
    requireCompanyOwner,
    assignEmployee
);

module.exports = router;