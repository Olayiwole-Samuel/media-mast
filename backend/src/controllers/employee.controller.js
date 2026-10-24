const Employee = require('../models/Employee');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { PERMISSIONS, PERMISSION_SETS } = require('../utils/permissions');

// ─────────────────────────────────────────────────────────────
// GET EMPLOYEE PERMISSIONS
// ─────────────────────────────────────────────────────────────
const getEmployeePermissions = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = req.user.companyId;

    const employee = await Employee.findOne({
      _id: id,
      companyId,
    }).populate('userId', 'name email');

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found',
      });
    }

    return res.json({
      success: true,
      data: {
        id: employee._id,
        userId: employee.userId,
        position: employee.position,
        permissions: employee.permissions,
        isActive: employee.isActive,
      },
    });
  } catch (error) {
    console.error('❌ Get employee permissions error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to load employee permissions',
    });
  }
};

// ─────────────────────────────────────────────────────────────
// UPDATE EMPLOYEE PERMISSIONS
// ─────────────────────────────────────────────────────────────
const updateEmployeePermissions = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = req.user.companyId;
    const { permissions, position } = req.body;

    // ── Validate request body ──
    if (permissions === undefined && position === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Provide permissions or position to update.',
      });
    }

    if (permissions !== undefined && !Array.isArray(permissions)) {
      return res.status(400).json({
        success: false,
        message: 'Permissions must be an array.',
      });
    }

    if (
      position !== undefined &&
      (typeof position !== 'string' || !position.trim())
    ) {
      return res.status(400).json({
        success: false,
        message: 'Position must be a non-empty string.',
      });
    }

    // ── Find employee inside current company only ──
    const employee = await Employee.findOne({
      _id: id,
      companyId,
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found',
      });
    }

    // ── Never modify Company Owner ──
    if (employee.position === 'Company Owner') {
      return res.status(403).json({
        success: false,
        message: 'Cannot modify company owner permissions',
      });
    }

    // ── Never modify your own permissions ──
    if (
      employee.userId &&
      employee.userId.toString() === req.user.id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: 'You cannot modify your own role or permissions.',
      });
    }

    // ── Never assign Company Owner through this endpoint ──
    if (
      position !== undefined &&
      position.trim() === 'Company Owner'
    ) {
      return res.status(403).json({
        success: false,
        message:
          'Company Owner role cannot be assigned through this endpoint.',
      });
    }

    // ── Validate permissions ──
    if (permissions !== undefined) {
      const validPermissions = new Set(
        Object.values(PERMISSIONS)
      );

      const invalidPermissions = permissions.filter(
        (permission) =>
          typeof permission !== 'string' ||
          !validPermissions.has(permission)
      );

      if (invalidPermissions.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'One or more permissions are invalid.',
          invalidPermissions,
        });
      }

      // ── Prevent duplicate permissions ──
      if (
        new Set(permissions).size !== permissions.length
      ) {
        return res.status(400).json({
          success: false,
          message: 'Duplicate permissions are not allowed.',
        });
      }

      // ── ALL_ACCESS belongs only to Company Owner ──
      if (permissions.includes(PERMISSIONS.ALL_ACCESS)) {
        return res.status(403).json({
          success: false,
          message:
            'ALL_ACCESS can only be assigned to the Company Owner.',
        });
      }
    }

    const oldPermissions = Array.isArray(employee.permissions)
      ? [...employee.permissions]
      : [];

    const oldPosition = employee.position;

    // ── Apply changes ──
    if (permissions !== undefined) {
      employee.permissions = [...permissions];
    }

    if (position !== undefined) {
      employee.position = position.trim();
    }

    await employee.save();

    // ── Audit log ──
    await AuditLog.create({
      userId: req.user.id,
      companyId,
      action: 'UPDATE_EMPLOYEE_PERMISSIONS',
      entityType: 'EMPLOYEE',
      entityId: employee._id,
      metadata: {
        oldPermissions,
        newPermissions: employee.permissions,
        oldPosition,
        newPosition: employee.position,
      },
    });

    return res.json({
      success: true,
      message: 'Employee permissions updated successfully',
      data: {
        id: employee._id,
        position: employee.position,
        permissions: employee.permissions,
      },
    });
  } catch (error) {
    console.error('❌ Update permissions error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to update permissions',
    });
  }
};

// ─────────────────────────────────────────────────────────────
// GET PERMISSION TEMPLATES
// ─────────────────────────────────────────────────────────────
const getPermissionTemplates = async (req, res) => {
  try {
    return res.json({
      success: true,
      data: {
        allPermissions: Object.values(PERMISSIONS),
        templates: PERMISSION_SETS,
      },
    });
  } catch (error) {
    console.error('❌ Get permission templates error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to load permission templates',
    });
  }
};

// ─────────────────────────────────────────────────────────────
// PLATFORM ACCOUNT STATUS BOUNDARY
//
// Company-side employee management may only move a User between
// ACTIVE and DEACTIVATED. Any other status (e.g. SUSPENDED by a
// platform admin, or PENDING approval) is owned by the platform and
// must never be changed from here.
// ─────────────────────────────────────────────────────────────
const COMPANY_MANAGED_USER_STATUSES = ['ACTIVE', 'DEACTIVATED'];

// ─────────────────────────────────────────────────────────────
// ACTIVATE EMPLOYEE
// ─────────────────────────────────────────────────────────────
const activateEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = req.user.companyId;

    const employee = await Employee.findOne({
      _id: id,
      companyId,
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found',
      });
    }

    // ── Never activate Company Owner through this endpoint ──
    if (employee.position === 'Company Owner') {
      return res.status(403).json({
        success: false,
        message:
          'Company owner does not require employee activation.',
      });
    }

    // ── Prevent changing your own lifecycle ──
    if (
      employee.userId &&
      employee.userId.toString() === req.user.id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: 'You cannot change your own employee status.',
      });
    }

    // ── Platform account status is authoritative (checked before any change) ──
    const user = await User.findById(employee.userId).select('status');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Employee user account not found',
      });
    }

    if (!COMPANY_MANAGED_USER_STATUSES.includes(user.status)) {
      return res.status(403).json({
        success: false,
        message:
          user.status === 'SUSPENDED'
            ? 'This account has been suspended by the platform and cannot be activated by the company.'
            : 'This account cannot be activated by the company in its current state.',
      });
    }

    // ── Update linked user status first, only if still company-managed ──
    // The status condition makes this safe if the platform suspends the
    // account between the check above and this write.
    const userUpdate = await User.updateOne(
      { _id: user._id, status: { $in: COMPANY_MANAGED_USER_STATUSES } },
      { status: 'ACTIVE' }
    );

    if (userUpdate.matchedCount === 0) {
      return res.status(409).json({
        success: false,
        message: 'The account status changed during this request. Please try again.',
      });
    }

    employee.isActive = true;
    employee.acceptedAt = new Date();

    await employee.save();

    // ── Audit log ──
    await AuditLog.create({
      userId: req.user.id,
      companyId,
      action: 'ACTIVATE_EMPLOYEE',
      entityType: 'EMPLOYEE',
      entityId: employee._id,
      metadata: {
        employeeUserId: employee.userId,
      },
    });

    return res.json({
      success: true,
      message: 'Employee activated successfully',
      data: employee,
    });
  } catch (error) {
    console.error('❌ Activate employee error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to activate employee',
    });
  }
};

// ─────────────────────────────────────────────────────────────
// DEACTIVATE EMPLOYEE
// ─────────────────────────────────────────────────────────────
const deactivateEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = req.user.companyId;

    const employee = await Employee.findOne({
      _id: id,
      companyId,
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found',
      });
    }

    // ── Never deactivate Company Owner ──
    if (employee.position === 'Company Owner') {
      return res.status(403).json({
        success: false,
        message: 'Cannot deactivate company owner',
      });
    }

    // ── Prevent changing your own lifecycle ──
    if (
      employee.userId &&
      employee.userId.toString() === req.user.id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: 'You cannot change your own employee status.',
      });
    }

    employee.isActive = false;

    await employee.save();

    // ── Update linked user status (ACTIVE → DEACTIVATED only) ──
    // A SUSPENDED or PENDING platform status is left untouched, so a
    // company deactivation can never convert a platform suspension into
    // a company-reversible state.
    await User.updateOne(
      { _id: employee.userId, status: 'ACTIVE' },
      { status: 'DEACTIVATED' }
    );

    // ── Audit log ──
    await AuditLog.create({
      userId: req.user.id,
      companyId,
      action: 'DEACTIVATE_EMPLOYEE',
      entityType: 'EMPLOYEE',
      entityId: employee._id,
      metadata: {
        employeeUserId: employee.userId,
      },
    });

    return res.json({
      success: true,
      message: 'Employee deactivated successfully',
      data: employee,
    });
  } catch (error) {
    console.error('❌ Deactivate employee error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to deactivate employee',
    });
  }
};

module.exports = {
  getEmployeePermissions,
  updateEmployeePermissions,
  getPermissionTemplates,
  activateEmployee,
  deactivateEmployee,
};