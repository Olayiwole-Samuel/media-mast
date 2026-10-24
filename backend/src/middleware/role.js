const Employee = require('../models/Employee');
const User = require('../models/User');
const Company = require('../models/Company');

// ─────────────────────────────────────────────────────────────
// CHECK IF USER BELONGS TO AN ACTIVE / APPROVED COMPANY
// ─────────────────────────────────────────────────────────────
const requireCompany = async (req, res, next) => {
    try {
        if (!req.user || !req.user.companyId) {
            return res.status(403).json({
                success: false,
                message: 'Access denied. Company account required.',
            });
        }

        const user = await User.findById(req.user.id).select(
            'accountType status companyId'
        );

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found.',
            });
        }

        // ── Only company users and employees may access company routes ──
        if (
            user.accountType !== 'COMPANY' &&
            user.accountType !== 'EMPLOYEE'
        ) {
            return res.status(403).json({
                success: false,
                message: 'Access denied. Company account required.',
            });
        }

        // ── User account must be active ──
        if (user.status !== 'ACTIVE') {
            return res.status(403).json({
                success: false,
                message: 'Your company account is not currently active.',
            });
        }

        // ─────────────────────────────────────────────────────────
        // EMPLOYEE-SPECIFIC CHECK
        //
        // An employee must still have an active Employee record.
        //
        // This prevents a removed employee from regaining access simply
        // because their User document was later reactivated.
        // ─────────────────────────────────────────────────────────

        if (user.accountType === 'EMPLOYEE') {
            const employee = await Employee.findOne({
                userId: user._id,
                companyId: user.companyId,
                isActive: true,
            }).select('_id companyId position permissions isActive');

            if (!employee) {
                return res.status(403).json({
                    success: false,
                    message:
                        'Access denied. Your employee access has been removed or deactivated.',
                });
            }

            // Make the employee record available to downstream middleware.
            req.employee = employee;
        }

        // ─────────────────────────────────────────────────────────
        // COMPANY
        // ─────────────────────────────────────────────────────────

        const company = await Company.findById(user.companyId).select(
            '_id name status'
        );

        if (!company) {
            return res.status(404).json({
                success: false,
                message: 'Company not found.',
            });
        }

        if (company.status !== 'APPROVED') {
            let message = 'Company account is not approved.';

            if (company.status === 'PENDING') {
                message = 'Company account is awaiting approval.';
            }

            if (company.status === 'REJECTED') {
                message = 'Company account has been rejected.';
            }

            if (company.status === 'SUSPENDED') {
                message = 'Company account has been suspended.';
            }

            return res.status(403).json({
                success: false,
                message,
            });
        }

        // ── Attach verified company to request ──
        req.company = company;

        next();
    } catch (error) {
        console.error('❌ Company access check error:', error);

        return res.status(500).json({
            success: false,
            message: 'Error verifying company access',
        });
    }
};


// ─────────────────────────────────────────────────────────────
// ADVERTISER: INDIVIDUAL OR COMPANY
//
// Campaign, creative and customer-side booking routes serve both kinds of
// advertiser. An INDIVIDUAL acts only on records they own (userId, no
// company), so there are no company permissions to check. Everyone else
// goes through requireCompany unchanged. req.advertiser records which
// kind passed; use utils/advertiser.js to scope queries by it.
// ─────────────────────────────────────────────────────────────
const requireAdvertiser = async (req, res, next) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required.',
            });
        }

        if (req.user.accountType === 'INDIVIDUAL') {
            // protect already loaded this user fresh and required ACTIVE.
            if (req.user.status !== 'ACTIVE') {
                return res.status(403).json({
                    success: false,
                    message: 'Your account is not active.',
                });
            }

            req.advertiser = {
                kind: 'INDIVIDUAL',
                userId: req.user._id,
                companyId: null,
            };

            return next();
        }

        if (
            req.user.accountType !== 'COMPANY' &&
            req.user.accountType !== 'EMPLOYEE'
        ) {
            return res.status(403).json({
                success: false,
                message: 'Access denied. Advertiser account required.',
            });
        }

        return requireCompany(req, res, () => {
            req.advertiser = {
                kind: 'COMPANY',
                userId: req.user._id,
                companyId: req.user.companyId,
            };

            return next();
        });
    } catch (error) {
        console.error('❌ Advertiser access check error:', error.name, error.message);

        return res.status(500).json({
            success: false,
            message: 'Error verifying account access',
        });
    }
};


// ─────────────────────────────────────────────────────────────
// CHECK IF USER IS COMPANY OWNER
// ─────────────────────────────────────────────────────────────
const requireCompanyOwner = async (req, res, next) => {
    try {
        if (!req.user || !req.user.companyId) {
            return res.status(403).json({
                success: false,
                message: 'Company account required.',
            });
        }

        // ── Verify the current User account ──
        const user = await User.findById(req.user.id).select(
            'accountType status companyId'
        );

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found.',
            });
        }

        if (user.status !== 'ACTIVE') {
            return res.status(403).json({
                success: false,
                message: 'Your account is not active.',
            });
        }

        if (
            user.accountType !== 'COMPANY' &&
            user.accountType !== 'EMPLOYEE'
        ) {
            return res.status(403).json({
                success: false,
                message: 'Company owner access required.',
            });
        }

        // ─────────────────────────────────────────────────────────
        // OWNER MUST HAVE AN ACTIVE EMPLOYEE RECORD
        // ─────────────────────────────────────────────────────────

        const employee = await Employee.findOne({
            userId: user._id,
            companyId: user.companyId,
            position: 'Company Owner',
            isActive: true,
        }).select('_id companyId position permissions isActive');

        if (!employee) {
            return res.status(403).json({
                success: false,
                message: 'Access denied. Company owner only.',
            });
        }

        // Attach verified employee record for downstream use.
        req.employee = employee;

        next();
    } catch (error) {
        console.error('❌ Owner role check error:', error);

        return res.status(500).json({
            success: false,
            message: 'Error verifying owner permissions',
        });
    }
};


// ─────────────────────────────────────────────────────────────
// CHECK IF USER HAS SPECIFIC PERMISSION
// ─────────────────────────────────────────────────────────────
const requirePermission = (permission) => {
    return async (req, res, next) => {
        try {
            if (!permission || typeof permission !== 'string') {
                return res.status(500).json({
                    success: false,
                    message: 'Invalid permission configuration.',
                });
            }

            // An individual verified by requireAdvertiser owns their records
            // and has no company role to check.
            if (req.advertiser && req.advertiser.kind === 'INDIVIDUAL') {
                return next();
            }

            if (!req.user || !req.user.companyId) {
                return res.status(403).json({
                    success: false,
                    message: 'Company account required.',
                });
            }

            // ─────────────────────────────────────────────────────
            // Reuse the employee record if requireCompany already
            // verified it for this request.
            // ─────────────────────────────────────────────────────

            let employee = req.employee;

            if (
                !employee ||
                employee.userId?.toString() !==
                    req.user.id?.toString()
            ) {
                employee = await Employee.findOne({
                    userId: req.user.id,
                    companyId: req.user.companyId,
                    isActive: true,
                }).select(
                    '_id companyId position permissions isActive userId'
                );
            }

            // ── No active employee record ──
            if (!employee) {
                return res.status(403).json({
                    success: false,
                    message:
                        'Access denied. Active employee record not found.',
                });
            }

            // ─────────────────────────────────────────────────────
            // COMPANY OWNER
            //
            // The owner automatically has all company permissions.
            // ─────────────────────────────────────────────────────

            if (employee.position === 'Company Owner') {
                req.employee = employee;
                return next();
            }

            // ─────────────────────────────────────────────────────
            // EXPLICIT ALL_ACCESS
            // ─────────────────────────────────────────────────────

            const permissions = Array.isArray(employee.permissions)
                ? employee.permissions
                : [];

            if (permissions.includes('ALL_ACCESS')) {
                req.employee = employee;
                return next();
            }

            // ─────────────────────────────────────────────────────
            // SPECIFIC PERMISSION
            // ─────────────────────────────────────────────────────

            if (permissions.includes(permission)) {
                req.employee = employee;
                return next();
            }

            return res.status(403).json({
                success: false,
                message:
                    'Access denied. You do not have permission to perform this action.',
            });
        } catch (error) {
            console.error('❌ Permission check error:', error);

            return res.status(500).json({
                success: false,
                message: 'Error verifying permissions',
            });
        }
    };
};


// ─────────────────────────────────────────────────────────────
// STATION OPERATOR
//
// Station-side booking actions and the station desk serve:
//   STATION  a station manager (account created by an admin); acts for
//            the stations it is assigned to (Station.managerIds).
//   ADMIN    a full Media Masters admin; acts for every station.
//   COMPANY  (transition) a company an admin linked to a station
//            (Station.companyId), with the given company permission.
// req.stationOperator records which; utils/stationOperator.js scopes by it.
// ─────────────────────────────────────────────────────────────
const requireStationOperator = (permission) => async (req, res, next) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required.',
            });
        }

        if (req.user.accountType === 'STATION') {
            if (req.user.status !== 'ACTIVE') {
                return res.status(403).json({
                    success: false,
                    message: 'Your station manager account is not active.',
                });
            }

            req.stationOperator = { kind: 'STATION', userId: req.user._id };
            return next();
        }

        if (req.user.accountType === 'ADMIN') {
            if (req.user.status !== 'ACTIVE') {
                return res.status(403).json({
                    success: false,
                    message: 'Admin account is not active.',
                });
            }

            req.stationOperator = { kind: 'ADMIN', userId: req.user._id };
            return next();
        }

        return requireCompany(req, res, () =>
            requirePermission(permission)(req, res, () => {
                req.stationOperator = { kind: 'COMPANY', companyId: req.user.companyId };
                return next();
            })
        );
    } catch (error) {
        console.error('❌ Station access check error:', error.name, error.message);

        return res.status(500).json({
            success: false,
            message: 'Error verifying station access',
        });
    }
};


// ─────────────────────────────────────────────────────────────
// CHECK IF USER IS ADMIN
// ─────────────────────────────────────────────────────────────
const requireAdmin = async (req, res, next) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required.',
            });
        }

        const user = await User.findById(req.user.id).select(
            'accountType status'
        );

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }

        if (user.accountType !== 'ADMIN') {
            return res.status(403).json({
                success: false,
                message: 'Access denied. Admin account required.',
            });
        }

        if (user.status !== 'ACTIVE') {
            return res.status(403).json({
                success: false,
                message: 'Admin account is not active.',
            });
        }

        next();
    } catch (error) {
        console.error('❌ Admin check error:', error);

        return res.status(500).json({
            success: false,
            message: 'Error verifying admin permissions',
        });
    }
};


module.exports = {
    requireAdvertiser,
    requireStationOperator,
    requireCompany,
    requireCompanyOwner,
    requirePermission,
    requireAdmin,
};