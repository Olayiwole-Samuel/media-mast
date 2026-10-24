const Department = require('../models/Department');
const Employee = require('../models/Employee');
const AuditLog = require('../models/AuditLog');
const User = require('../models/User');
const { isValidObjectId, invalidIdResponse } = require('../utils/objectId');

// ── Department name rule (same as the schema: trimmed, 1–50 chars) ──
// Any characters are allowed except control characters, so names like
// "Media & Communications" or "R&D (Lagos)" keep working.
const DEPARTMENT_NAME_MAX = 50;
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

const validateDepartmentName = (name) => {
    if (typeof name !== 'string' || !name.trim()) {
        return { error: 'Department name is required' };
    }

    const trimmed = name.trim();

    if (trimmed.length > DEPARTMENT_NAME_MAX) {
        return { error: `Department name cannot exceed ${DEPARTMENT_NAME_MAX} characters` };
    }

    if (CONTROL_CHARS.test(trimmed)) {
        return { error: 'Department name contains invalid characters' };
    }

    return { name: trimmed };
};

// The duplicate check is a case-insensitive exact match. The name is
// escaped so it is matched literally: user input is never run as a regex
// (no "(" crashes, no ".*" matching every department, no ReDoS).
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const exactNameRegex = (name) => new RegExp(`^${escapeRegex(name)}$`, 'i');

// ── GET ALL DEPARTMENTS ──
const getDepartments = async (req, res) => {
    try {
        const companyId = req.user.companyId;

        if (!companyId) {
            return res.status(400).json({
                success: false,
                message: 'No company associated with this account',
            });
        }

        const departments = await Department.find({
            companyId: companyId,
            isActive: true,
        })
        .sort({ name: 1 })
        .populate('managerId', 'name email');

        // Get employee count for each department
        const departmentsWithCount = await Promise.all(
            departments.map(async (dept) => {
                const employeeCount = await Employee.countDocuments({
                    companyId: companyId,
                    departmentId: dept._id,
                    isActive: true,
                });
                return {
                    ...dept.toObject(),
                    employeeCount,
                };
            })
        );

        res.json({
            success: true,
            data: departmentsWithCount,
        });

    } catch (error) {
        console.error('❌ Get departments error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load departments',
        });
    }
};

// ── GET SINGLE DEPARTMENT ──
const getDepartment = async (req, res) => {
    try {
        const { id } = req.params;
        const companyId = req.user.companyId;

        const department = await Department.findOne({
            _id: id,
            companyId: companyId,
        }).populate('managerId', 'name email');

        if (!department) {
            return res.status(404).json({
                success: false,
                message: 'Department not found',
            });
        }

        // Get employees in this department
        const employees = await Employee.find({
            companyId: companyId,
            departmentId: department._id,
            isActive: true,
        })
        .populate('userId', 'name email image')
        .select('userId position permissions');

        res.json({
            success: true,
            data: {
                ...department.toObject(),
                employees,
            },
        });

    } catch (error) {
        console.error('❌ Get department error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load department',
        });
    }
};

// ── CREATE DEPARTMENT ──
const createDepartment = async (req, res) => {
    try {
        const companyId = req.user.companyId;
        const { description, managerId } = req.body;

        const nameCheck = validateDepartmentName(req.body.name);

        if (nameCheck.error) {
            return res.status(400).json({
                success: false,
                message: nameCheck.error,
            });
        }

        const name = nameCheck.name;

        // managerId is a User ObjectId (looked up as Employee.userId)
        if (managerId && !isValidObjectId(managerId)) {
            return invalidIdResponse(res, 'manager');
        }

        // Check if department already exists
        const existingDepartment = await Department.findOne({
            companyId: companyId,
            name: { $regex: exactNameRegex(name) },
        });

        if (existingDepartment) {
            return res.status(400).json({
                success: false,
                message: 'Department with this name already exists',
            });
        }

        // Verify manager is an employee
        if (managerId) {
            const employee = await Employee.findOne({
                userId: managerId,
                companyId: companyId,
                isActive: true,
            });

            if (!employee) {
                return res.status(400).json({
                    success: false,
                    message: 'Manager must be an active employee',
                });
            }
        }

        const department = await Department.create({
            name: name.trim(),
            description: description?.trim() || null,
            companyId: companyId,
            managerId: managerId || null,
        });

        // Audit log
        await AuditLog.create({
            userId: req.user.id,
            companyId: companyId,
            action: 'CREATE_DEPARTMENT',
            entityType: 'DEPARTMENT',
            entityId: department._id,
            metadata: { name: department.name },
        });

        res.status(201).json({
            success: true,
            message: 'Department created successfully',
            data: department,
        });

    } catch (error) {
        console.error('❌ Create department error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create department',
        });
    }
};

// ── UPDATE DEPARTMENT ──
const updateDepartment = async (req, res) => {
    try {
        const { id } = req.params;
        const companyId = req.user.companyId;
        const { description, managerId, isActive } = req.body;

        let name;

        if (req.body.name !== undefined) {
            const nameCheck = validateDepartmentName(req.body.name);

            if (nameCheck.error) {
                return res.status(400).json({
                    success: false,
                    message: nameCheck.error,
                });
            }

            name = nameCheck.name;
        }

        if (managerId && !isValidObjectId(managerId)) {
            return invalidIdResponse(res, 'manager');
        }

        const department = await Department.findOne({
            _id: id,
            companyId: companyId,
        });

        if (!department) {
            return res.status(404).json({
                success: false,
                message: 'Department not found',
            });
        }

        // Check name uniqueness
        if (name && name !== department.name) {
            const existingDepartment = await Department.findOne({
                companyId: companyId,
                name: { $regex: exactNameRegex(name) },
                _id: { $ne: id },
            });

            if (existingDepartment) {
                return res.status(400).json({
                    success: false,
                    message: 'Department with this name already exists',
                });
            }
            department.name = name.trim();
        }

        if (description !== undefined) {
            department.description = description?.trim() || null;
        }

        if (managerId !== undefined) {
            if (managerId) {
                const employee = await Employee.findOne({
                    userId: managerId,
                    companyId: companyId,
                    isActive: true,
                });

                if (!employee) {
                    return res.status(400).json({
                        success: false,
                        message: 'Manager must be an active employee',
                    });
                }
            }
            department.managerId = managerId || null;
        }

        if (isActive !== undefined) {
            department.isActive = isActive;
        }

        await department.save();

        // Audit log
        await AuditLog.create({
            userId: req.user.id,
            companyId: companyId,
            action: 'UPDATE_DEPARTMENT',
            entityType: 'DEPARTMENT',
            entityId: department._id,
            metadata: { name: department.name },
        });

        res.json({
            success: true,
            message: 'Department updated successfully',
            data: department,
        });

    } catch (error) {
        console.error('❌ Update department error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update department',
        });
    }
};

// ── DELETE DEPARTMENT ──
const deleteDepartment = async (req, res) => {
    try {
        const { id } = req.params;
        const companyId = req.user.companyId;

        const department = await Department.findOne({
            _id: id,
            companyId: companyId,
        });

        if (!department) {
            return res.status(404).json({
                success: false,
                message: 'Department not found',
            });
        }

        // Check if employees are in this department
        const employeeCount = await Employee.countDocuments({
            companyId: companyId,
            departmentId: department._id,
            isActive: true,
        });

        if (employeeCount > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot delete department with ${employeeCount} active employees. Reassign them first.`,
            });
        }

        // Soft delete
        department.isActive = false;
        await department.save();

        // Audit log
        await AuditLog.create({
            userId: req.user.id,
            companyId: companyId,
            action: 'DELETE_DEPARTMENT',
            entityType: 'DEPARTMENT',
            entityId: department._id,
            metadata: { name: department.name },
        });

        res.json({
            success: true,
            message: 'Department deleted successfully',
        });

    } catch (error) {
        console.error('❌ Delete department error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete department',
        });
    }
};

// ── ASSIGN EMPLOYEE TO DEPARTMENT ──
const assignEmployee = async (req, res) => {
    try {
        const companyId = req.user.companyId;
        const { employeeId, departmentId } = req.body;

        if (!employeeId) {
            return res.status(400).json({
                success: false,
                message: 'Employee ID is required',
            });
        }

        if (!isValidObjectId(employeeId)) {
            return invalidIdResponse(res, 'employee');
        }

        // departmentId is optional (null/'' unassigns), but must be valid if given
        if (departmentId && !isValidObjectId(departmentId)) {
            return invalidIdResponse(res, 'department');
        }

        const employee = await Employee.findOne({
            _id: employeeId,
            companyId: companyId,
            isActive: true,
        });

        if (!employee) {
            return res.status(404).json({
                success: false,
                message: 'Employee not found',
            });
        }

        let department = null;
        if (departmentId) {
            department = await Department.findOne({
                _id: departmentId,
                companyId: companyId,
                isActive: true,
            });

            if (!department) {
                return res.status(404).json({
                    success: false,
                    message: 'Department not found',
                });
            }
        }

        employee.departmentId = departmentId || null;
        await employee.save();

        // Audit log
        await AuditLog.create({
            userId: req.user.id,
            companyId: companyId,
            action: 'ASSIGN_EMPLOYEE_DEPARTMENT',
            entityType: 'EMPLOYEE',
            entityId: employee._id,
            metadata: {
                employee: employee.userId,
                department: department?.name || 'Unassigned',
            },
        });

        res.json({
            success: true,
            message: 'Employee assigned to department successfully',
            data: employee,
        });

    } catch (error) {
        console.error('❌ Assign employee error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to assign employee',
        });
    }
};

module.exports = {
    getDepartments,
    getDepartment,
    createDepartment,
    updateDepartment,
    deleteDepartment,
    assignEmployee,
};