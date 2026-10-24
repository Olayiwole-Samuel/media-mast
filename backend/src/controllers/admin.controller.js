const mongoose = require('mongoose');
const User = require('../models/User');
const Company = require('../models/Company');
const Station = require('../models/Station');
const Campaign = require('../models/Campaign');
const Booking = require('../models/Booking');
const Payment = require('../models/Payment');
const Employee = require('../models/Employee');
const Department = require('../models/Department');
const AuditLog = require('../models/AuditLog');
const Creative = require('../models/Creative');
const {
    mongooseFieldErrors,
    sendValidationErrors,
} = require('../utils/validationResponse');
const {
    validateAdminCompanyUpdate,
    validateAdminCompanyCreate,
    validateAdminWorkerCreate,
    validateAdminWorkerUpdate,
} = require('../validators/settings.validator');
const {
    CAMPAIGN_HAS_BOOKINGS_MESSAGE,
    deleteCampaignWithoutHistory,
} = require('../utils/campaignDeletion');
const {
    acquireStationBookingLock,
    releaseStationBookingLock,
} = require('../utils/stationBookingLock');
const {
    isKnownCampaignStatus,
    canTransitionCampaignStatus,
} = require('../utils/campaignStatus');
const crypto = require('crypto');
const { notifyCompanyApproved, notifyNewStation } = require('../utils/notifications');

// ============================================================
// HELPERS
// ============================================================

const isValidObjectId = (id) =>
    /^[0-9a-fA-F]{24}$/.test(String(id));

const getAdminId = (req) =>
    req.user?.id || req.user?._id || null;

const getRequestMetadata = (req) => ({
    ipAddress: req.ip || null,
    userAgent: req.get('user-agent') || null,
});

const sendValidationError = (
    res,
    error,
    fallbackMessage
) => {
    // Field-level messages; Mongoose's raw text names the model and can
    // quote submitted values.
    if (error?.name === 'ValidationError') {
        return sendValidationErrors(
            res,
            mongooseFieldErrors(error)
        );
    }

    if (error?.code === 11000) {
        return res.status(409).json({
            success: false,
            message:
                'A record with this information already exists',
        });
    }

    return res.status(500).json({
        success: false,
        message: fallbackMessage,
    });
};

const checkCompanyExists = async (id, res) => {
    if (!isValidObjectId(id)) {
        res.status(400).json({
            success: false,
            message: 'Invalid company ID',
        });

        return null;
    }

    const company = await Company.findById(id);

    if (!company) {
        res.status(404).json({
            success: false,
            message: 'Company not found',
        });

        return null;
    }

    return company;
};

const checkEmployeeExists = async (
    workerId,
    companyId,
    res
) => {
    if (!isValidObjectId(workerId)) {
        res.status(400).json({
            success: false,
            message: 'Invalid worker ID',
        });

        return null;
    }

    const employee = await Employee.findOne({
        _id: workerId,
        companyId,
    });

    if (!employee) {
        res.status(404).json({
            success: false,
            message:
                'Worker not found in this company',
        });

        return null;
    }

    return employee;
};

const getWorkerUser = async (
    employee,
    companyId,
    res
) => {
    const user = await User.findOne({
        _id: employee.userId,
        companyId,
        accountType: 'EMPLOYEE',
    });

    if (!user) {
        res.status(404).json({
            success: false,
            message:
                'Worker user account not found',
        });

        return null;
    }

    return user;
};

// ─────────────────────────────────────────────────────────────
// Ensures the Company Owner Employee record that requireCompanyOwner
// relies on exists for (companyId, userId). Idempotent: an existing
// matching active owner record is reused, never duplicated. Any other
// existing record (different company, different position, inactive) or a
// different owner already recorded for the company is a conflict and is
// never silently overwritten.
// ─────────────────────────────────────────────────────────────
const ensureCompanyOwnerEmployee = async ({
    companyId,
    userId,
    invitedBy = null,
    // Optional: when called inside a transaction, every read/write joins it.
    session = null,
}) => {
    const existing = await Employee.findOne({ userId }).session(session);

    if (existing) {
        if (
            String(existing.companyId) === String(companyId) &&
            existing.position === 'Company Owner' &&
            existing.isActive === true
        ) {
            return { employee: existing, created: false };
        }

        const conflict = new Error(
            'An employee record already exists for this user and does not match the company owner relationship'
        );
        conflict.code = 'OWNER_EMPLOYEE_CONFLICT';
        throw conflict;
    }

    const otherOwner = await Employee.findOne({
        companyId,
        position: 'Company Owner',
        userId: { $ne: userId },
    }).select('_id').session(session);

    if (otherOwner) {
        const conflict = new Error(
            'This company already has a different Company Owner'
        );
        conflict.code = 'OWNER_EMPLOYEE_CONFLICT';
        throw conflict;
    }

    const now = new Date();

    // Mirrors the owner record created by self-registration
    // (auth.controller.js register).
    const ownerFields = {
        userId,
        companyId,
        position: 'Company Owner',
        permissions: ['ALL_ACCESS'],
        isActive: true,
        invitedAt: now,
        invitedBy,
        acceptedAt: now,
    };

    const employee = session
        ? (await Employee.create([ownerFields], { session }))[0]
        : await Employee.create(ownerFields);

    return { employee, created: true };
};

const logAudit = async (req, data) => {
    await AuditLog.create({
        userId: getAdminId(req),
        ...data,
        ...getRequestMetadata(req),
    });
};

// ============================================================
// ADMIN DASHBOARD
// ============================================================

const getDashboardStats = async (req, res) => {
    try {
        const [
            totalUsers,
            totalCompanies,
            totalStations,
            totalCampaigns,
            totalBookings,
            totalPayments,
            pendingCompanies,
            pendingStations,
        ] = await Promise.all([
            User.countDocuments(),
            Company.countDocuments(),
            Station.countDocuments(),
            Campaign.countDocuments(),
            Booking.countDocuments(),
            Payment.countDocuments(),
            Company.countDocuments({
                status: 'PENDING',
            }),
            Station.countDocuments({
                approvalStatus: 'PENDING',
            }),
        ]);

        const recentActivity =
            await AuditLog.find()
                .sort({ createdAt: -1 })
                .limit(10)
                .populate(
                    'userId',
                    'name email'
                )
                .lean();

        const payments =
            await Payment.find({
                status: 'SUCCESSFUL',
            }).select('amount');

        const totalRevenue =
            payments.reduce(
                (sum, payment) =>
                    sum +
                    Number(payment.amount || 0),
                0
            );

        return res.json({
            success: true,
            data: {
                stats: {
                    totalUsers,
                    totalCompanies,
                    totalStations,
                    totalCampaigns,
                    totalBookings,
                    totalPayments,
                    totalRevenue,
                    pendingCompanies,
                    pendingStations,
                },
                recentActivity,
            },
        });
    } catch (error) {
        console.error(
            '❌ Admin dashboard error:',
            error
        );

        return res.status(500).json({
            success: false,
            message:
                'Failed to load admin dashboard',
        });
    }
};

// ============================================================
// COMPANIES
// ============================================================

const getCompanies = async (req, res) => {
    try {
        const companies =
            await Company.find()
                .sort({ createdAt: -1 })
                .lean();

        const companiesWithUsers =
            await Promise.all(
                companies.map(
                    async (company) => ({
                        ...company,

                        userCount:
                            await User.countDocuments({
                                companyId:
                                    company._id,
                            }),

                        activeWorkerCount:
                            await Employee.countDocuments(
                                {
                                    companyId:
                                        company._id,
                                    isActive: true,
                                }
                            ),
                    })
                )
            );

        return res.json({
            success: true,
            data: companiesWithUsers,
        });
    } catch (error) {
        console.error(
            '❌ Get companies error:',
            error
        );

        return res.status(500).json({
            success: false,
            message:
                'Failed to load companies',
        });
    }
};

// A request-level conflict detected inside the transaction. Thrown (not
// returned) so withTransaction aborts; mapped to the HTTP response after.
class CompanyCreateConflict extends Error {
    constructor(message) {
        super(message);
        this.name = 'CompanyCreateConflict';
    }
}

const createCompany = async (req, res) => {
    // ── Validate everything before touching the database ──
    const check = validateAdminCompanyCreate(req.body);

    if (check.errors) {
        return sendValidationErrors(res, check.errors);
    }

    const {
        name,
        email: normalizedEmail,
        password,
        phone,
        logo,
        website,
        description,
        address,
        city,
        state,
        country,
        timezone,
        currency,
    } = check.value;

    // Company, owner User and owner Employee are written in ONE MongoDB
    // transaction: they commit together or not at all. withTransaction may
    // run the callback more than once (transient errors), so it only does
    // database work and rebuilds its result each time; the response and the
    // audit entry happen after commit.
    let session = null;
    let step = 'start';
    let result = null;

    try {
        session = await mongoose.startSession();

        await session.withTransaction(async () => {
            result = null;

            step = 'precheck';
            if (
                await User.findOne({
                    email: normalizedEmail,
                }).select('_id').session(session)
            ) {
                throw new CompanyCreateConflict(
                    'A user with this email already exists'
                );
            }

            if (
                await Company.findOne({
                    email: normalizedEmail,
                }).select('_id').session(session)
            ) {
                throw new CompanyCreateConflict(
                    'A company with this email already exists'
                );
            }

            const baseSlug =
                name
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-+|-+$/g, '') ||
                `company-${Date.now()}`;

            let slug = baseSlug;
            let counter = 1;

            while (
                await Company.exists({ slug }).session(session)
            ) {
                slug = `${baseSlug}-${counter++}`;
            }

            step = 'company';
            const [company] = await Company.create([{
                name,
                slug,
                email: normalizedEmail,
                phone: phone || null,
                logo: logo || null,
                website: website || null,
                description: description || null,
                address: address || null,
                city: city || null,
                state: state || null,
                country: country || 'Nigeria',
                timezone: timezone || 'Africa/Lagos',
                currency: currency || 'NGN',
                status: 'PENDING',
            }], { session });

            step = 'user';
            const [companyUser] = await User.create([{
                email: normalizedEmail,
                password, // hashed by the User pre-save hook
                name,
                accountType: 'COMPANY',
                status: 'PENDING',
                companyId: company._id,
                emailVerified: null,
                // Admin chose this password: the owner must replace it.
                mustChangePassword: true,
            }], { session });

            // ── Owner Employee record (required by requireCompanyOwner) ──
            step = 'employee';
            const owner = await ensureCompanyOwnerEmployee({
                companyId: company._id,
                userId: companyUser._id,
                invitedBy: getAdminId(req),
                session,
            });

            result = {
                company,
                companyUser,
                ownerEmployee: owner.employee,
            };
        }, {
            readConcern: { level: 'snapshot' },
            writeConcern: { w: 'majority' },
        });
    } catch (error) {
        // The transaction was aborted: nothing from this request remains.

        if (error instanceof CompanyCreateConflict) {
            return res.status(409).json({
                success: false,
                message: error.message,
            });
        }

        // Name/message only: a full error object can carry submitted values.
        console.error(
            '❌ Create company error:',
            step,
            error.name,
            error.message
        );

        if (error.code === 'OWNER_EMPLOYEE_CONFLICT') {
            return res.status(409).json({
                success: false,
                message: error.message,
            });
        }

        if (error.code === 11000) {
            // A concurrent create won the race on a unique index.
            const field =
                Object.keys(
                    error.keyPattern || error.keyValue || {}
                )[0];

            return res.status(409).json({
                success: false,
                message:
                    step === 'user'
                        ? 'A user with this email already exists'
                        : `A company with this ${
                              field || 'information'
                          } already exists`,
            });
        }

        return error.name ===
            'ValidationError'
            ? sendValidationErrors(
                  res,
                  mongooseFieldErrors(error)
              )
            : res.status(500).json({
                  success: false,
                  message:
                      'Failed to create company',
              });
    } finally {
        if (session) {
            await session.endSession().catch(() => {});
        }
    }

    const { company, companyUser, ownerEmployee } = result;

    // Non-fatal and after commit only: the company and owner already exist,
    // so an audit failure must not turn this into a 500 (the D2 convention).
    try {
        await logAudit(req, {
            companyId: company._id,
            action: 'CREATE_COMPANY',
            entityType: 'COMPANY',
            entityId: company._id,
            metadata: {
                name: company.name,
                email: company.email,
                slug: company.slug,
                ownerUserId: companyUser._id.toString(),
                ownerEmployeeId: ownerEmployee._id.toString(),
            },
        });
    } catch (auditError) {
        console.error('⚠️ Audit log error:', auditError.name, auditError.message);
    }

    return res.status(201).json({
        success: true,
        message:
            'Company created successfully',
        data: {
            company,
            user: {
                id: companyUser._id,
                name: companyUser.name,
                email: companyUser.email,
                accountType:
                    companyUser.accountType,
                status: companyUser.status,
            },
        },
    });
};

const getCompanyById = async (req, res) => {
    try {
        const company =
            await checkCompanyExists(
                req.params.id,
                res
            );

        if (!company) return;

        const companyUser =
            await User.findOne({
                companyId: company._id,
                accountType: 'COMPANY',
            })
                .select(
                    '_id name email status emailVerified lastLogin createdAt'
                )
                .lean();

        const workers =
            await Employee.find({
                companyId: company._id,
            })
                .populate(
                    'userId',
                    'name email image accountType status emailVerified lastLogin loginCount createdAt'
                )
                .populate(
                    'departmentId',
                    'name description isActive'
                )
                .populate(
                    'invitedBy',
                    'name email'
                )
                .sort({ createdAt: -1 })
                .lean();

        return res.json({
            success: true,
            data: {
                company,
                user: companyUser || null,
                workers,
                workerCount: workers.length,
                activeWorkerCount:
                    workers.filter(
                        (worker) =>
                            worker.isActive
                    ).length,
            },
        });
    } catch (error) {
        console.error(
            '❌ Get company error:',
            error
        );

        return res.status(500).json({
            success: false,
            message:
                'Failed to load company',
        });
    }
};

const updateCompany = async (req, res) => {
    try {
        const company =
            await checkCompanyExists(
                req.params.id,
                res
            );

        if (!company) return;

        // Validate before anything is changed. The admin form sends every
        // field on each save, so a value identical to what is stored is not a
        // change and is not re-validated (older records may hold values that
        // predate these rules). Anything new must pass the shared rules;
        // unknown/protected keys, operators, dotted paths and wrong types are
        // rejected with a 400.
        const ADMIN_COMPANY_FIELDS = [
            'name', 'slug', 'email', 'phone', 'logo', 'website', 'description',
            'address', 'city', 'state', 'country', 'timezone', 'currency',
        ];
        const body = req.body;
        // Null prototype: a "__proto__" key stays an ordinary key here, so the
        // validator sees (and rejects) it instead of it silently vanishing.
        const incoming = Object.create(null);

        if (body && typeof body === 'object' && !Array.isArray(body)) {
            for (const [field, value] of Object.entries(body)) {
                // Only supported fields can be "unchanged"; any other key
                // (status, $set, __proto__, ...) always reaches the validator.
                const stored = company[field] == null ? null : company[field];
                const unchanged =
                    ADMIN_COMPANY_FIELDS.includes(field) &&
                    (value === stored || (value === null && stored === null));

                if (!unchanged) incoming[field] = value;
            }
        }

        const check = validateAdminCompanyUpdate(
            body && typeof body === 'object' && !Array.isArray(body) ? incoming : body
        );

        if (check.errors) {
            return sendValidationErrors(res, check.errors);
        }

        const changes = {};

        const originalEmail =
            company.email;

        const originalName =
            company.name;

        for (const [field, value] of Object.entries(check.value)) {
            if (company[field] !== value) {
                changes[field] = {
                    from: company[field],
                    to: value,
                };

                company[field] = value;
            }
        }

        // Company.email is unique too (not only the owner's User email).
        if (changes.email) {
            if (
                await Company.findOne({
                    email: changes.email.to,
                    _id: {
                        $ne: company._id,
                    },
                }).select('_id')
            ) {
                return res.status(409).json({
                    success: false,
                    message:
                        'A company with this email already exists',
                });
            }
        }

        if (changes.email) {
            const companyUser =
                await User.findOne({
                    companyId: company._id,
                    accountType: 'COMPANY',
                }).select('_id');

            if (
                await User.findOne({
                    email:
                        changes.email.to,
                    _id: {
                        $ne:
                            companyUser?._id,
                    },
                }).select('_id')
            ) {
                return res.status(409).json({
                    success: false,
                    message:
                        'A user with this email already exists',
                });
            }
        }

        if (changes.slug) {
            if (
                await Company.findOne({
                    slug: changes.slug.to,
                    _id: {
                        $ne: company._id,
                    },
                }).select('_id')
            ) {
                return res.status(409).json({
                    success: false,
                    message:
                        'A company with this slug already exists',
                });
            }
        }

        if (!Object.keys(changes).length) {
            return res.status(400).json({
                success: false,
                message:
                    'No changes were provided',
            });
        }

        await company.save();

        const companyUser =
            await User.findOne({
                companyId: company._id,
                accountType: 'COMPANY',
            });

        if (companyUser) {
            let userChanged = false;

            if (
                changes.email &&
                companyUser.email !==
                    company.email
            ) {
                companyUser.email =
                    company.email;

                userChanged = true;
            }

            if (
                changes.name &&
                companyUser.name !==
                    company.name
            ) {
                companyUser.name =
                    company.name;

                userChanged = true;
            }

            if (userChanged) {
                try {
                    await companyUser.save();
                } catch (syncError) {
                    // e.g. another user took the email in the meantime:
                    // put the company back so the two records stay in step.
                    for (const [field, change] of Object.entries(changes)) {
                        company[field] = change.from;
                    }

                    try {
                        await company.save();
                    } catch (revertError) {
                        console.error('❌ Update company revert error:', revertError.message);
                    }

                    throw syncError;
                }
            }
        }

        await logAudit(req, {
            companyId: company._id,
            action: 'UPDATE_COMPANY',
            entityType: 'COMPANY',
            entityId: company._id,
            changes,
            metadata: {
                originalEmail,
                originalName,
            },
        });

        return res.json({
            success: true,
            message:
                'Company updated successfully',
            data: company,
        });
    } catch (error) {
        console.error(
            '❌ Update company error:',
            error
        );

        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message:
                    'Company email or slug already exists',
            });
        }

        return error.name ===
            'ValidationError'
            ? sendValidationErrors(
                  res,
                  mongooseFieldErrors(error)
              )
            : res.status(500).json({
                  success: false,
                  message:
                      'Failed to update company',
              });
    }
};

const updateCompanyVerification = async (
    req,
    res
) => {
    try {
        const company =
            await checkCompanyExists(
                req.params.id,
                res
            );

        if (!company) return;

        const { status } = req.body;

        const normalizedStatus =
            String(status || '')
                .trim()
                .toUpperCase();

        if (
            ![
                'PENDING',
                'APPROVED',
                'REJECTED',
            ].includes(normalizedStatus)
        ) {
            return res.status(400).json({
                success: false,
                message:
                    'Verification status must be PENDING, APPROVED, or REJECTED',
            });
        }

        if (company.status === 'SUSPENDED') {
            return res.status(400).json({
                success: false,
                message:
                    'Suspended companies must be reactivated before verification can be changed',
            });
        }

        if (
            company.status ===
            normalizedStatus
        ) {
            return res.status(400).json({
                success: false,
                message: `Company is already ${normalizedStatus}`,
            });
        }

        const previousStatus =
            company.status;

        company.status =
            normalizedStatus;

        await company.save();

        const companyUser =
            await User.findOne({
                companyId: company._id,
                accountType: 'COMPANY',
            });

        if (companyUser) {
            companyUser.status =
                normalizedStatus === 'APPROVED'
                    ? 'ACTIVE'
                    : normalizedStatus ===
                      'PENDING'
                    ? 'PENDING'
                    : 'DEACTIVATED';

            await companyUser.save();
        }

        if (normalizedStatus === 'APPROVED') {
            await notifyCompanyApproved(company, companyUser);
        }

        await logAudit(req, {
            companyId: company._id,
            action:
                'UPDATE_COMPANY_VERIFICATION',
            entityType: 'COMPANY',
            entityId: company._id,
            changes: {
                status: {
                    from: previousStatus,
                    to: normalizedStatus,
                },
            },
            metadata: {
                companyName: company.name,
                companyEmail: company.email,
            },
        });

        return res.json({
            success: true,
            message: `Company verification status changed to ${normalizedStatus}`,
            data: {
                company,
                userStatus:
                    companyUser?.status ||
                    null,
            },
        });
    } catch (error) {
        console.error(
            '❌ Update company verification error:',
            error
        );

        return error.name ===
            'ValidationError'
            ? sendValidationErrors(
                  res,
                  mongooseFieldErrors(error)
              )
            : res.status(500).json({
                  success: false,
                  message:
                      'Failed to update company verification',
              });
    }
};

const suspendCompany = async (req, res) => {
    try {
        const company =
            await checkCompanyExists(
                req.params.id,
                res
            );

        if (!company) return;

        if (company.status === 'SUSPENDED') {
            return res.status(400).json({
                success: false,
                message:
                    'Company is already suspended',
            });
        }

        // Only APPROVED → SUSPENDED is a valid transition. Suspending a
        // PENDING or REJECTED company would let reactivateCompany
        // (SUSPENDED → APPROVED) bypass the approval process.
        if (company.status !== 'APPROVED') {
            return res.status(400).json({
                success: false,
                message:
                    'Only approved companies can be suspended',
            });
        }

        const previousStatus =
            company.status;

        company.status = 'SUSPENDED';

        await company.save();

        const companyUser =
            await User.findOne({
                companyId: company._id,
                accountType: 'COMPANY',
            });

        if (companyUser) {
            companyUser.status =
                'SUSPENDED';

            await companyUser.save();
        }

        await logAudit(req, {
            companyId: company._id,
            action: 'SUSPEND_COMPANY',
            entityType: 'COMPANY',
            entityId: company._id,
            changes: {
                status: {
                    from: previousStatus,
                    to: 'SUSPENDED',
                },
            },
            metadata: {
                companyName: company.name,
            },
        });

        return res.json({
            success: true,
            message:
                'Company suspended successfully',
            data: company,
        });
    } catch (error) {
        console.error(
            '❌ Suspend company error:',
            error
        );

        return res.status(500).json({
            success: false,
            message:
                'Failed to suspend company',
        });
    }
};

const reactivateCompany = async (
    req,
    res
) => {
    try {
        const company =
            await checkCompanyExists(
                req.params.id,
                res
            );

        if (!company) return;

        if (company.status !== 'SUSPENDED') {
            return res.status(400).json({
                success: false,
                message:
                    'Only suspended companies can be reactivated',
            });
        }

        company.status = 'APPROVED';

        await company.save();

        const companyUser =
            await User.findOne({
                companyId: company._id,
                accountType: 'COMPANY',
            });

        if (companyUser) {
            companyUser.status =
                'ACTIVE';

            await companyUser.save();
        }

        await logAudit(req, {
            companyId: company._id,
            action:
                'REACTIVATE_COMPANY',
            entityType: 'COMPANY',
            entityId: company._id,
            changes: {
                status: {
                    from: 'SUSPENDED',
                    to: 'APPROVED',
                },
            },
            metadata: {
                companyName: company.name,
            },
        });

        return res.json({
            success: true,
            message:
                'Company reactivated successfully',
            data: company,
        });
    } catch (error) {
        console.error(
            '❌ Reactivate company error:',
            error
        );

        return res.status(500).json({
            success: false,
            message:
                'Failed to reactivate company',
        });
    }
};

// ============================================================
// COMPANY WORKERS LIST
// ============================================================

const getCompanyWorkers = async (
    req,
    res
) => {
    try {
        const company =
            await checkCompanyExists(
                req.params.id,
                res
            );

        if (!company) return;

        const workers =
            await Employee.find({
                companyId: company._id,
            })
                .populate(
                    'userId',
                    'name email image accountType status emailVerified lastLogin createdAt'
                )
                .populate(
                    'departmentId',
                    'name description isActive'
                )
                .populate(
                    'invitedBy',
                    'name email'
                )
                .sort({ createdAt: -1 })
                .lean();

        return res.json({
            success: true,
            data: {
                company,
                workers,
                total: workers.length,
                active: workers.filter(
                    (worker) =>
                        worker.isActive
                ).length,
                inactive: workers.filter(
                    (worker) =>
                        !worker.isActive
                ).length,
            },
        });
    } catch (error) {
        console.error(
            '❌ Get company workers error:',
            error
        );

        return res.status(500).json({
            success: false,
            message:
                'Failed to load company workers',
        });
    }
};

// ============================================================
// COMPANY WORKER
// ============================================================

const getCompanyWorkerById = async (
    req,
    res
) => {
    try {
        const company =
            await checkCompanyExists(
                req.params.id,
                res
            );

        if (!company) return;

        const employee =
            await checkEmployeeExists(
                req.params.workerId,
                company._id,
                res
            );

        if (!employee) return;

        const worker =
            await Employee.findOne({
                _id: employee._id,
                companyId: company._id,
            })
                .populate(
                    'userId',
                    'name email image accountType status emailVerified lastLogin loginCount createdAt'
                )
                .populate(
                    'departmentId',
                    'name description isActive'
                )
                .populate(
                    'invitedBy',
                    'name email'
                )
                .lean();

        return res.json({
            success: true,
            data: {
                company,
                worker,
            },
        });
    } catch (error) {
        console.error(
            '❌ Get company worker error:',
            error
        );

        return res.status(500).json({
            success: false,
            message:
                'Failed to load company worker',
        });
    }
};

// ============================================================
// CREATE COMPANY WORKER
// ============================================================

// Request-level outcome raised inside the worker transaction (aborts it).
class WorkerCreateRejection extends Error {
    constructor(status, message) {
        super(message);
        this.name = 'WorkerCreateRejection';
        this.status = status;
    }
}

const createCompanyWorker = async (
    req,
    res
) => {
    // Worker User and Employee are written in ONE MongoDB transaction, the
    // same approach as createCompany: they commit together or not at all.
    // withTransaction may run the callback more than once, so it only does
    // database work and rebuilds its result each time; the audit entry and
    // the response happen after commit.
    let session = null;
    let step = 'start';
    let result = null;

    try {
        const company =
            await checkCompanyExists(
                req.params.id,
                res
            );

        if (!company) return;

        if (
            ['SUSPENDED', 'REJECTED'].includes(
                company.status
            )
        ) {
            return res.status(400).json({
                success: false,
                message:
                    'Cannot add workers to a suspended or rejected company',
            });
        }

        // ── Validate everything before touching the database ──
        const check = validateAdminWorkerCreate(req.body);

        if (check.errors) {
            return sendValidationErrors(res, check.errors);
        }

        const {
            name: workerName,
            email: normalizedEmail,
            password,
            position,
            departmentId,
            permissions,
            image,
        } = check.value;

        const workerPermissions = permissions || [];

        session = await mongoose.startSession();

        await session.withTransaction(async () => {
            result = null;

            step = 'precheck';
            if (
                departmentId &&
                !(
                    await Department.findOne({
                        _id: departmentId,
                        companyId: company._id,
                        isActive: true,
                    }).select('_id').session(session)
                )
            ) {
                throw new WorkerCreateRejection(
                    400,
                    'Department not found in this company'
                );
            }

            if (
                await User.findOne({
                    email: normalizedEmail,
                }).select('_id').session(session)
            ) {
                throw new WorkerCreateRejection(
                    409,
                    'A user with this email already exists'
                );
            }

            step = 'user';
            const [user] = await User.create([{
                name: workerName,
                email: normalizedEmail,
                password, // hashed by the User pre-save hook
                accountType: 'EMPLOYEE',
                status: 'ACTIVE',
                companyId: company._id,
                image: image || null,
                // Admin chose this password: the worker must replace it.
                mustChangePassword: true,
            }], { session });

            step = 'employee';
            const [employee] = await Employee.create([{
                userId: user._id,
                companyId: company._id,
                departmentId: departmentId || null,
                position: position || 'Team Member',
                permissions: workerPermissions,
                isActive: true,
                invitedAt: new Date(),
                invitedBy: getAdminId(req),
                acceptedAt: new Date(),
            }], { session });

            result = { user, employee };
        }, {
            readConcern: { level: 'snapshot' },
            writeConcern: { w: 'majority' },
        });
    } catch (error) {
        // The transaction was aborted: nothing from this request remains.

        if (error instanceof WorkerCreateRejection) {
            return res.status(error.status).json({
                success: false,
                message: error.message,
            });
        }

        // Name/message only (field paths for validation errors): a full
        // error object can carry submitted values.
        console.error(
            '❌ Create company worker error:',
            step,
            error.name,
            error.name === 'ValidationError'
                ? Object.keys(error.errors || {}).join(', ')
                : error.message
        );

        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message:
                    'A user or employee with this information already exists',
            });
        }

        return error.name ===
            'ValidationError'
            ? sendValidationErrors(
                  res,
                  mongooseFieldErrors(error)
              )
            : res.status(500).json({
                  success: false,
                  message:
                      'Failed to create company worker',
              });
    } finally {
        if (session) {
            await session.endSession().catch(() => {});
        }
    }

    const { user, employee } = result;

    // Non-fatal and after commit only: the worker already exists, so an
    // audit failure must not turn this into a 500 (the D2 convention).
    try {
        await logAudit(req, {
            companyId: employee.companyId,
            action:
                'CREATE_COMPANY_WORKER',
            entityType: 'EMPLOYEE',
            entityId: employee._id,
            metadata: {
                name: user.name,
                email: user.email,
                position:
                    employee.position,
                departmentId:
                    employee.departmentId
                        ?.toString() ||
                    null,
                permissions:
                    employee.permissions,
            },
        });
    } catch (auditError) {
        console.error('⚠️ Audit log error:', auditError.name, auditError.message);
    }

    // Response population is also post-commit: if it fails, answer 201 with
    // the committed records (worker fields picked explicitly, no password).
    let populatedEmployee = null;

    try {
        populatedEmployee =
            await Employee.findById(
                employee._id
            )
                .populate(
                    'userId',
                    'name email image accountType status emailVerified lastLogin createdAt'
                )
                .populate(
                    'departmentId',
                    'name description'
                )
                .populate(
                    'invitedBy',
                    'name email'
                )
                .lean();
    } catch (populateError) {
        console.error(
            '⚠️ Create company worker: response population failed:',
            populateError.name,
            populateError.message
        );
    }

    if (!populatedEmployee) {
        const {
            inviteTokenHash,
            inviteExpiresAt,
            ...employeeFields
        } = employee.toObject();

        populatedEmployee = {
            ...employeeFields,
            userId: {
                _id: user._id,
                name: user.name,
                email: user.email,
                image: user.image,
                accountType: user.accountType,
                status: user.status,
                emailVerified: user.emailVerified,
                lastLogin: user.lastLogin,
                createdAt: user.createdAt,
            },
        };
    }

    return res.status(201).json({
        success: true,
        message:
            'Company worker created successfully',
        data: populatedEmployee,
    });
};

// ============================================================
// UPDATE COMPANY WORKER
// ============================================================

const updateCompanyWorker = async (
    req,
    res
) => {
    try {
        const company =
            await checkCompanyExists(
                req.params.id,
                res
            );

        if (!company) return;

        const employee =
            await checkEmployeeExists(
                req.params.workerId,
                company._id,
                res
            );

        if (!employee) return;

        // The Company Owner record is the marker requireCompanyOwner and
        // requirePermission grant owner powers from. It is never edited
        // through worker management, whatever its account type — the same
        // rule as the company-side endpoints. The owner's login name and
        // email stay in sync with the company through updateCompany.
        if (
            String(employee.position || '')
                .trim()
                .toLowerCase() === 'company owner'
        ) {
            return res.status(403).json({
                success: false,
                message:
                    'Cannot modify the company owner through worker management',
            });
        }

        const user =
            await getWorkerUser(
                employee,
                company._id,
                res
            );

        if (!user) return;

        // ── Validate every field before changing anything ──
        const check = validateAdminWorkerUpdate(req.body);

        if (check.errors) {
            return sendValidationErrors(res, check.errors);
        }

        const {
            name,
            email,
            phone,
            position,
            departmentId,
            permissions,
            image,
        } = check.value;

        const changes = {};

        // ----------------------------------------------------
        // NAME
        // ----------------------------------------------------

        if (name !== undefined) {
            const newName = name;

            if (
                newName !== user.name
            ) {
                changes.name = {
                    from: user.name,
                    to: newName,
                };

                user.name = newName;
            }
        }

        // ----------------------------------------------------
        // EMAIL
        // ----------------------------------------------------

        if (email !== undefined) {
            const normalizedEmail = email;

            if (
                normalizedEmail !==
                user.email
            ) {
                const existingUser =
                    await User.findOne({
                        email:
                            normalizedEmail,
                        _id: {
                            $ne: user._id,
                        },
                    }).select('_id');

                if (existingUser) {
                    return res.status(409).json({
                        success: false,
                        message:
                            'A user with this email already exists',
                    });
                }

                changes.email = {
                    from: user.email,
                    to: normalizedEmail,
                };

                user.email =
                    normalizedEmail;
            }
        }

        // ----------------------------------------------------
        // PHONE
        // ----------------------------------------------------

        if (phone !== undefined) {
            const newPhone =
                phone || null;

            const oldPhone =
                user.phone?.trim() || null;

            if (
                oldPhone !== newPhone
            ) {
                changes.phone = {
                    from: oldPhone,
                    to: newPhone,
                };

                user.phone =
                    newPhone;
            }
        }

        // ----------------------------------------------------
        // IMAGE
        // ----------------------------------------------------

        if (image !== undefined) {
            const newImage =
                image || null;

            if (
                user.image !== newImage
            ) {
                changes.image = {
                    from: user.image,
                    to: newImage,
                };

                user.image = newImage;
            }
        }

        // ----------------------------------------------------
        // POSITION
        // ----------------------------------------------------

        if (position !== undefined) {
            const newPosition = position;

            if (
                employee.position !==
                newPosition
            ) {
                changes.position = {
                    from:
                        employee.position,
                    to: newPosition,
                };

                employee.position =
                    newPosition;
            }
        }

        // ----------------------------------------------------
        // DEPARTMENT
        // ----------------------------------------------------

        if (
            departmentId !== undefined
        ) {
            if (departmentId) {
                const department =
                    await Department.findOne(
                        {
                            _id:
                                departmentId,
                            companyId:
                                company._id,
                            isActive: true,
                        }
                    ).select('_id');

                if (!department) {
                    return res.status(400).json({
                        success: false,
                        message:
                            'Department not found in this company',
                    });
                }
            }

            const oldDept =
                employee.departmentId
                    ?.toString() ||
                null;

            const newDept =
                departmentId
                    ? String(
                          departmentId
                      )
                    : null;

            if (
                oldDept !== newDept
            ) {
                changes.departmentId = {
                    from: oldDept,
                    to: newDept,
                };

                employee.departmentId =
                    departmentId || null;
            }
        }

        // ----------------------------------------------------
        // PERMISSIONS
        // ----------------------------------------------------

        if (
            permissions !== undefined
        ) {
            const oldPerms =
                employee.permissions ||
                [];

            if (
                JSON.stringify(
                    oldPerms
                ) !==
                JSON.stringify(
                    permissions
                )
            ) {
                changes.permissions = {
                    from: oldPerms,
                    to: permissions,
                };

                employee.permissions =
                    permissions;
            }
        }

        // ----------------------------------------------------
        // CHECK FOR CHANGES
        // ----------------------------------------------------

        if (
            !Object.keys(changes).length
        ) {
            return res.status(400).json({
                success: false,
                message:
                    'No changes were provided',
            });
        }

        // ----------------------------------------------------
        // SAVE
        // ----------------------------------------------------

        await user.save();
        await employee.save();

        // ----------------------------------------------------
        // AUDIT LOG
        // ----------------------------------------------------

        await logAudit(req, {
            companyId: company._id,
            action:
                'UPDATE_COMPANY_WORKER',
            entityType: 'EMPLOYEE',
            entityId: employee._id,
            changes,
            metadata: {
                workerUserId:
                    user._id.toString(),
                name: user.name,
                email: user.email,
                phone:
                    user.phone || null,
                position:
                    employee.position,
                departmentId:
                    employee.departmentId
                        ?.toString() ||
                    null,
                permissions:
                    employee.permissions,
            },
        });

        // ----------------------------------------------------
        // RETURN UPDATED WORKER
        // ----------------------------------------------------

        const updatedEmployee =
            await Employee.findById(
                employee._id
            )
                .populate(
                    'userId',
                    'name email phone image accountType status emailVerified lastLogin createdAt'
                )
                .populate(
                    'departmentId',
                    'name description'
                )
                .populate(
                    'invitedBy',
                    'name email'
                )
                .lean();

        return res.json({
            success: true,
            message:
                'Company worker updated successfully',
            data: updatedEmployee,
        });

    } catch (error) {
        // Name/message only (field paths for validation errors): a full
        // error object can carry submitted values.
        console.error(
            '❌ Update company worker error:',
            error.name,
            error.name === 'ValidationError'
                ? Object.keys(error.errors || {}).join(', ')
                : error.message
        );

        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message:
                    'A user with this email already exists',
            });
        }

        return error.name ===
            'ValidationError'
            ? sendValidationErrors(
                  res,
                  mongooseFieldErrors(error)
              )
            : res.status(500).json({
                  success: false,
                  message:
                      'Failed to update company worker',
              });
    }
};

// ============================================================
// WORKER STATUS
// ============================================================

const toggleWorkerStatus = async (
    req,
    res,
    action
) => {
    try {
        const company =
            await checkCompanyExists(
                req.params.id,
                res
            );

        if (!company) return;

        const employee =
            await checkEmployeeExists(
                req.params.workerId,
                company._id,
                res
            );

        if (!employee) return;

        /*
         * IMPORTANT:
         *
         * There is intentionally NO Company Owner
         * restriction here.
         *
         * Admin can activate, deactivate, and
         * reactivate ANY worker.
         */

        const user =
            await getWorkerUser(
                employee,
                company._id,
                res
            );

        if (!user) return;

        const isActivating =
            action === 'activate' ||
            action === 'reactivate';

        // ----------------------------------------------------
        // ALREADY ACTIVE
        // ----------------------------------------------------

        if (
            isActivating &&
            employee.isActive &&
            user.status === 'ACTIVE'
        ) {
            return res.status(400).json({
                success: false,
                message:
                    'Company worker is already active',
            });
        }

        // ----------------------------------------------------
        // ALREADY DEACTIVATED
        // ----------------------------------------------------

        if (
            !isActivating &&
            !employee.isActive &&
            user.status ===
                'DEACTIVATED'
        ) {
            return res.status(400).json({
                success: false,
                message:
                    'Company worker is already deactivated',
            });
        }

        const previousEmployeeActive =
            employee.isActive;

        const previousUserStatus =
            user.status;

        // ----------------------------------------------------
        // UPDATE STATUS
        // ----------------------------------------------------

        employee.isActive =
            isActivating;

        if (
            isActivating &&
            !employee.acceptedAt
        ) {
            employee.acceptedAt =
                new Date();
        }

        user.status = isActivating
            ? 'ACTIVE'
            : 'DEACTIVATED';

        await employee.save();
        await user.save();

        const actionMap = {
            activate:
                'ACTIVATE_COMPANY_WORKER',

            reactivate:
                'REACTIVATE_COMPANY_WORKER',

            deactivate:
                'DEACTIVATE_COMPANY_WORKER',
        };

        await logAudit(req, {
            companyId: company._id,
            action:
                actionMap[action] ||
                'UPDATE_COMPANY_WORKER_STATUS',
            entityType: 'EMPLOYEE',
            entityId: employee._id,

            changes: {
                employeeActive: {
                    from:
                        previousEmployeeActive,
                    to: isActivating,
                },

                userStatus: {
                    from:
                        previousUserStatus,
                    to: user.status,
                },
            },

            metadata: {
                workerUserId:
                    user._id.toString(),
                workerName: user.name,
                workerEmail: user.email,
                position:
                    employee.position,
            },
        });

        const updatedEmployee =
            await Employee.findById(
                employee._id
            )
                .populate(
                    'userId',
                    'name email image accountType status emailVerified lastLogin createdAt'
                )
                .populate(
                    'departmentId',
                    'name description'
                )
                .populate(
                    'invitedBy',
                    'name email'
                )
                .lean();

        let message;

        if (action === 'activate') {
            message =
                'Company worker activated successfully';
        } else if (
            action === 'reactivate'
        ) {
            message =
                'Company worker reactivated successfully';
        } else {
            message =
                'Company worker deactivated successfully';
        }

        return res.json({
            success: true,
            message,
            data: updatedEmployee,
        });
    } catch (error) {
        console.error(
            `❌ ${action} company worker error:`,
            error
        );

        return res.status(500).json({
            success: false,
            message: `Failed to ${action} company worker`,
        });
    }
};

const activateCompanyWorker = (
    req,
    res
) =>
    toggleWorkerStatus(
        req,
        res,
        'activate'
    );

const deactivateCompanyWorker = (
    req,
    res
) =>
    toggleWorkerStatus(
        req,
        res,
        'deactivate'
    );

const reactivateCompanyWorker = (
    req,
    res
) =>
    toggleWorkerStatus(
        req,
        res,
        'reactivate'
    );

// ============================================================
// REMOVE COMPANY WORKER
// ============================================================

const removeCompanyWorker = async (
    req,
    res
) => {
    try {
        const company =
            await checkCompanyExists(
                req.params.id,
                res
            );

        if (!company) return;

        const employee =
            await checkEmployeeExists(
                req.params.workerId,
                company._id,
                res
            );

        if (!employee) return;

        /*
         * IMPORTANT:
         *
         * There is intentionally NO Company Owner
         * restriction here.
         *
         * Admin can remove ANY worker,
         * including the Company Owner.
         */

        const user =
            await getWorkerUser(
                employee,
                company._id,
                res
            );

        if (!user) return;

        // ----------------------------------------------------
        // SAVE PREVIOUS VALUES BEFORE CHANGING THEM
        // ----------------------------------------------------

        const previousUserStatus =
            user.status;

        const previousEmployeeActive =
            employee.isActive;

        const workerInfo = {
            employeeId:
                employee._id.toString(),

            userId:
                user._id.toString(),

            name: user.name,

            email: user.email,

            position:
                employee.position,

            departmentId:
                employee.departmentId
                    ?.toString() ||
                null,
        };

        // ----------------------------------------------------
        // REMOVE EMPLOYEE RELATIONSHIP
        // ----------------------------------------------------

        await Employee.deleteOne({
            _id: employee._id,
            companyId: company._id,
        });

        // ----------------------------------------------------
        // DETACH USER FROM COMPANY
        // ----------------------------------------------------

        user.status =
            'DEACTIVATED';

        user.companyId = null;

        await user.save();

        // ----------------------------------------------------
        // AUDIT
        // ----------------------------------------------------

        await logAudit(req, {
            companyId: company._id,
            action:
                'REMOVE_COMPANY_WORKER',
            entityType: 'EMPLOYEE',
            entityId:
                workerInfo.employeeId,

            changes: {
                employeeRelationship: {
                    from:
                        previousEmployeeActive
                            ? 'ACTIVE'
                            : 'INACTIVE',
                    to: 'REMOVED',
                },

                userStatus: {
                    from:
                        previousUserStatus,
                    to: 'DEACTIVATED',
                },

                companyId: {
                    from:
                        company._id.toString(),
                    to: null,
                },
            },

            metadata: workerInfo,
        });

        return res.json({
            success: true,
            message:
                'Company worker removed successfully',

            data: {
                workerId:
                    workerInfo.employeeId,

                userId:
                    workerInfo.userId,

                name:
                    workerInfo.name,

                email:
                    workerInfo.email,
            },
        });
    } catch (error) {
        console.error(
            '❌ Remove company worker error:',
            error
        );

        return res.status(500).json({
            success: false,
            message:
                'Failed to remove company worker',
        });
    }
};

// ============================================================
// STATIONS
// ============================================================

// ============================================================
// STATIONS
// ============================================================

// ─────────────────────────────────────────────────────────────
// GET ALL STATIONS
// ─────────────────────────────────────────────────────────────

const getStations = async (req, res) => {
    try {
        const stations = await Station.find()
            .populate(
                'companyId',
                'name email phone logo status'
            )
            .sort({ createdAt: -1 })
            .lean();

        return res.json({
            success: true,
            data: stations,
        });
    } catch (error) {
        console.error('❌ Get stations error:', error);

        return res.status(500).json({
            success: false,
            message: 'Failed to load stations',
        });
    }
};


// ─────────────────────────────────────────────────────────────
// GET SINGLE STATION
// ─────────────────────────────────────────────────────────────

const getStationById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid station ID',
            });
        }

        const station = await Station.findById(id)
            .populate(
                'companyId',
                'name email phone logo website status'
            )
            .lean();

        if (!station) {
            return res.status(404).json({
                success: false,
                message: 'Station not found',
            });
        }

        return res.json({
            success: true,
            data: station,
        });
    } catch (error) {
        console.error('❌ Get station error:', error);

        return res.status(500).json({
            success: false,
            message: 'Failed to load station',
        });
    }
};


// ─────────────────────────────────────────────────────────────
// CREATE STATION
// ─────────────────────────────────────────────────────────────

const createStation = async (req, res) => {
    try {
        const {
            name,
            type,
            description,
            companyId,
            location,
            phone,
            email,
            website,
            logo,
            coverImage,
            images,
            specifications,
            advertisingFormats,
            features,
            pricing,
            availability,
            operatingHours,
            reach,
            social,
        } = req.body;

        // --------------------------------------------------------
        // Required fields
        // --------------------------------------------------------

        if (!name?.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Station name is required',
            });
        }

        if (!type) {
            return res.status(400).json({
                success: false,
                message: 'Station type is required',
            });
        }

        // Stations are run by Media Masters (admins and station managers);
        // a media company owner is optional.
        if (companyId) {
            if (!isValidObjectId(companyId)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid media company ID',
                });
            }

            const company = await checkCompanyExists(
                companyId,
                res
            );

            if (!company) return;
        }

        // --------------------------------------------------------
        // Generate unique slug
        // --------------------------------------------------------

        const baseSlug =
            name
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '') ||
            `station-${Date.now()}`;

        let slug = baseSlug;
        let counter = 1;

        while (await Station.exists({ slug })) {
            slug = `${baseSlug}-${counter++}`;
        }

        // --------------------------------------------------------
        // Create station
        // --------------------------------------------------------

        const station = await Station.create({
            name: name.trim(),
            slug,
            type,
            description: description?.trim() || null,

            companyId,

            location: location || {},

            phone: phone?.trim() || null,
            email: email?.trim() || null,
            website: website?.trim() || null,

            logo: logo || null,
            coverImage: coverImage || null,
            images: Array.isArray(images) ? images : [],

            specifications:
                specifications || {},

            advertisingFormats:
                Array.isArray(advertisingFormats)
                    ? advertisingFormats
                    : [],

            features:
                Array.isArray(features)
                    ? features
                    : [],

            pricing: {
                amount:
                    Number(pricing?.amount) || 0,

                currency:
                    pricing?.currency
                        ?.trim()
                        ?.toUpperCase() || 'NGN',

                unit:
                    pricing?.unit || 'WEEK',
            },

            availability:
                availability || {},

            operatingHours:
                operatingHours || {},

            reach: reach?.trim() || null,

            social: social || {},

            // New stations need Admin approval
            approvalStatus: 'PENDING',

            // Inventory starts as available
            inventoryStatus: 'AVAILABLE',

            isActive: false,
        });

        // --------------------------------------------------------
        // Audit
        // --------------------------------------------------------

        await logAudit(req, {
            companyId,
            action: 'CREATE_STATION',
            entityType: 'STATION',
            entityId: station._id,
            metadata: {
                name: station.name,
                type: station.type,
                companyId,
            },
        });

        // --------------------------------------------------------
        // Return populated station
        // --------------------------------------------------------

        await station.populate(
            'companyId',
            'name email phone logo status'
        );

        return res.status(201).json({
            success: true,
            message: 'Station created successfully',
            data: station,
        });

    } catch (error) {
        console.error('❌ Create station error:', error);

        return sendValidationError(
            res,
            error,
            'Failed to create station'
        );
    }
};


// ─────────────────────────────────────────────────────────────
// UPDATE STATION
// ─────────────────────────────────────────────────────────────

const updateStation = async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid station ID',
            });
        }

        const station = await Station.findById(id);

        if (!station) {
            return res.status(404).json({
                success: false,
                message: 'Station not found',
            });
        }

        // Keep the original values before making changes
        const originalName = station.name;
        const originalCompanyId = station.companyId;

        // ========================================================
        // VALIDATE COMPANY CHANGE FIRST
        // ========================================================

        // The company is optional: an empty value unlinks it (run by
        // station managers only).
        if (req.body && req.body.companyId === '') {
            req.body.companyId = null;
        }

        if (
            req.body.companyId &&
            String(req.body.companyId) !==
                String(originalCompanyId)
        ) {
            const company = await checkCompanyExists(
                req.body.companyId,
                res
            );

            if (!company) return;
        }

        // ========================================================
        // UPDATE ALLOWED FIELDS
        // ========================================================

        const allowedFields = [
            'name',
            'type',
            'description',
            'companyId',
            'location',
            'phone',
            'email',
            'website',
            'logo',
            'coverImage',
            'images',
            'specifications',
            'advertisingFormats',
            'features',
            'pricing',
            'availability',
            'operatingHours',
            'reach',
            'social',
        ];

        allowedFields.forEach((field) => {
            if (
                Object.prototype.hasOwnProperty.call(
                    req.body,
                    field
                )
            ) {
                station[field] = req.body[field];
            }
        });

        // ========================================================
        // UPDATE SLUG IF NAME CHANGED
        // ========================================================

        if (
            req.body.name &&
            req.body.name.trim() !== originalName
        ) {
            const baseSlug =
                req.body.name
                    .trim()
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-+|-+$/g, '') ||
                `station-${Date.now()}`;

            let slug = baseSlug;
            let counter = 1;

            while (
                await Station.exists({
                    slug,
                    _id: { $ne: station._id },
                })
            ) {
                slug = `${baseSlug}-${counter++}`;
            }

            station.slug = slug;
        }

        await station.save();

        // ========================================================
        // AUDIT LOG
        // ========================================================

        await logAudit(req, {
            companyId: station.companyId,
            action: 'UPDATE_STATION',
            entityType: 'STATION',
            entityId: station._id,
            metadata: {
                name: station.name,
                previousName: originalName,
                previousCompanyId: originalCompanyId,
                companyId: station.companyId,
            },
        });

        // ========================================================
        // POPULATE COMPANY
        // ========================================================

        await station.populate(
            'companyId',
            'name email phone logo status'
        );

        return res.json({
            success: true,
            message: 'Station updated successfully',
            data: station,
        });

    } catch (error) {
        console.error(
            '❌ Update station error:',
            error
        );

        return sendValidationError(
            res,
            error,
            'Failed to update station'
        );
    }
};


// ─────────────────────────────────────────────────────────────
// APPROVE STATION
// ─────────────────────────────────────────────────────────────

const approveStation = async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid station ID',
            });
        }

        const station = await Station.findById(id);

        if (!station) {
            return res.status(404).json({
                success: false,
                message: 'Station not found',
            });
        }

        station.approvalStatus = 'APPROVED';
        station.isActive = true;

        if (
            station.inventoryStatus === 'UNAVAILABLE'
        ) {
            station.inventoryStatus = 'AVAILABLE';
        }

        await station.save();

        await logAudit(req, {
            companyId: station.companyId,
            action: 'APPROVE_STATION',
            entityType: 'STATION',
            entityId: station._id,
            metadata: {
                name: station.name,
            },
        });

        // Advertisers who asked to hear about new stations (best-effort).
        await notifyNewStation(station);

        return res.json({
            success: true,
            message: 'Station approved successfully',
            data: station,
        });

    } catch (error) {
        console.error('❌ Approve station error:', error);

        return res.status(500).json({
            success: false,
            message: 'Failed to approve station',
        });
    }
};


// ─────────────────────────────────────────────────────────────
// REJECT STATION
// ─────────────────────────────────────────────────────────────

const rejectStation = async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid station ID',
            });
        }

        const station = await Station.findById(id);

        if (!station) {
            return res.status(404).json({
                success: false,
                message: 'Station not found',
            });
        }

        station.approvalStatus = 'REJECTED';
        station.isActive = false;

        await station.save();

        await logAudit(req, {
            companyId: station.companyId,
            action: 'REJECT_STATION',
            entityType: 'STATION',
            entityId: station._id,
            metadata: {
                name: station.name,
            },
        });

        return res.json({
            success: true,
            message: 'Station rejected successfully',
            data: station,
        });

    } catch (error) {
        console.error('❌ Reject station error:', error);

        return res.status(500).json({
            success: false,
            message: 'Failed to reject station',
        });
    }
};


// ─────────────────────────────────────────────────────────────
// UPDATE INVENTORY STATUS
// ─────────────────────────────────────────────────────────────

const updateStationInventoryStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { inventoryStatus } = req.body;

        if (!isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid station ID',
            });
        }

        const validStatuses = [
            'AVAILABLE',
            'BOOKED',
            'UNAVAILABLE',
            'MAINTENANCE',
        ];

        if (!validStatuses.includes(inventoryStatus)) {
            return res.status(400).json({
                success: false,
                message:
                    'Invalid inventory status',
            });
        }

        const station = await Station.findById(id);

        if (!station) {
            return res.status(404).json({
                success: false,
                message: 'Station not found',
            });
        }

        station.inventoryStatus =
            inventoryStatus;

        await station.save();

        await logAudit(req, {
            companyId: station.companyId,
            action: 'UPDATE_STATION_INVENTORY_STATUS',
            entityType: 'STATION',
            entityId: station._id,
            metadata: {
                name: station.name,
                inventoryStatus,
            },
        });

        return res.json({
            success: true,
            message:
                'Station inventory status updated successfully',
            data: station,
        });

    } catch (error) {
        console.error(
            '❌ Update station inventory status error:',
            error
        );

        return res.status(500).json({
            success: false,
            message:
                'Failed to update station inventory status',
        });
    }
};


// ─────────────────────────────────────────────────────────────
// ACTIVATE STATION
// ─────────────────────────────────────────────────────────────

const activateStation = async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid station ID',
            });
        }

        const station = await Station.findById(id);

        if (!station) {
            return res.status(404).json({
                success: false,
                message: 'Station not found',
            });
        }

        if (
            station.approvalStatus !== 'APPROVED'
        ) {
            return res.status(400).json({
                success: false,
                message:
                    'Only approved stations can be activated',
            });
        }

        station.isActive = true;

        if (
            station.inventoryStatus ===
            'UNAVAILABLE'
        ) {
            station.inventoryStatus =
                'AVAILABLE';
        }

        await station.save();

        // The station is already activated; an audit failure must not turn
        // that into a false 500 (same pattern as booking.controller.js).
        try {
            await logAudit(req, {
                companyId: station.companyId,
                action: 'ACTIVATE_STATION',
                entityType: 'STATION',
                entityId: station._id,
                metadata: {
                    name: station.name,
                },
            });
        } catch (auditError) {
            console.error('⚠️ Audit log error:', auditError);
        }

        return res.json({
            success: true,
            message: 'Station activated successfully',
            data: station,
        });

    } catch (error) {
        console.error(
            '❌ Activate station error:',
            error
        );

        return res.status(500).json({
            success: false,
            message:
                'Failed to activate station',
        });
    }
};


// ─────────────────────────────────────────────────────────────
// DEACTIVATE STATION
// ─────────────────────────────────────────────────────────────

const deactivateStation = async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid station ID',
            });
        }

        const station = await Station.findById(id);

        if (!station) {
            return res.status(404).json({
                success: false,
                message: 'Station not found',
            });
        }

        station.isActive = false;
        station.inventoryStatus =
            'UNAVAILABLE';

        await station.save();

        // The station is already deactivated; an audit failure must not turn
        // that into a false 500 (same pattern as booking.controller.js).
        try {
            await logAudit(req, {
                companyId: station.companyId,
                action: 'DEACTIVATE_STATION',
                entityType: 'STATION',
                entityId: station._id,
                metadata: {
                    name: station.name,
                },
            });
        } catch (auditError) {
            console.error('⚠️ Audit log error:', auditError);
        }

        return res.json({
            success: true,
            message:
                'Station deactivated successfully',
            data: station,
        });

    } catch (error) {
        console.error(
            '❌ Deactivate station error:',
            error
        );

        return res.status(500).json({
            success: false,
            message:
                'Failed to deactivate station',
        });
    }
};


// ─────────────────────────────────────────────────────────────
// DELETE STATION
// ─────────────────────────────────────────────────────────────

const deleteStation = async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid station ID',
            });
        }

        const station = await Station.findById(id);

        if (!station) {
            return res.status(404).json({
                success: false,
                message: 'Station not found',
            });
        }

        // Don't allow deletion of active inventory.
        if (
            station.isActive ||
            station.inventoryStatus ===
                'BOOKED'
        ) {
            return res.status(400).json({
                success: false,
                message:
                    'Active or booked stations cannot be deleted',
            });
        }

        // A station with any booking (any status) is history: it is never
        // hard-deleted, it stays deactivated. The booking lock stops a
        // booking being created between this check and the delete.
        const lock =
            await acquireStationBookingLock(
                station._id
            );

        if (!lock) {
            return res.status(409).json({
                success: false,
                message:
                    'This station is taking a booking right now. Please try again.',
            });
        }

        try {
            const booking =
                await Booking.findOne({
                    stationId: station._id,
                }).select('_id');

            if (booking) {
                return res.status(409).json({
                    success: false,
                    message:
                        'This station has booking history and cannot be deleted. It stays deactivated and keeps its records.',
                });
            }

            await Station.findByIdAndDelete(id);
        } finally {
            await releaseStationBookingLock(
                station._id,
                lock
            );
        }

        await logAudit(req, {
            companyId: station.companyId,
            action: 'DELETE_STATION',
            entityType: 'STATION',
            entityId: station._id,
            metadata: {
                name: station.name,
            },
        });

        return res.json({
            success: true,
            message:
                'Station deleted successfully',
        });

    } catch (error) {
        console.error(
            '❌ Delete station error:',
            error
        );

        return res.status(500).json({
            success: false,
            message:
                'Failed to delete station',
        });
    }
};

// ============================================================
// USERS
// ============================================================

const getUsers = async (
    req,
    res
) => {
    try {
        const users =
            await User.find()
                .select('-password')
                .sort({ createdAt: -1 })
                .lean();

        return res.json({
            success: true,
            data: users,
        });
    } catch (error) {
        console.error(
            '❌ Get users error:',
            error
        );

        return res.status(500).json({
            success: false,
            message:
                'Failed to load users',
        });
    }
};

const toggleUserStatus = async (
    req,
    res,
    status
) => {
    try {
        if (
            !isValidObjectId(
                req.params.id
            )
        ) {
            return res.status(400).json({
                success: false,
                message:
                    'Invalid user ID',
            });
        }

        const user =
            await User.findById(
                req.params.id
            );

        if (!user) {
            return res.status(404).json({
                success: false,
                message:
                    'User not found',
            });
        }

        const statusMap = {
            suspend: 'SUSPENDED',
            activate: 'ACTIVE',
        };

        const targetStatus =
            statusMap[status];

        if (!targetStatus) {
            return res.status(400).json({
                success: false,
                message:
                    'Invalid status action',
            });
        }

        if (
            user.status ===
            targetStatus
        ) {
            return res.status(400).json({
                success: false,
                message: `User is already ${targetStatus.toLowerCase()}`,
            });
        }

        const previousStatus =
            user.status;

        user.status = targetStatus;

        await user.save();

        await logAudit(req, {
            action: `${status.toUpperCase()}_USER`,
            entityType: 'USER',
            entityId: req.params.id,
            changes: {
                status: {
                    from: previousStatus,
                    to: targetStatus,
                },
            },
            metadata: {
                email: user.email,
                name: user.name,
            },
        });

        return res.json({
            success: true,
            message: `User ${status}ed successfully`,
            data: user,
        });
    } catch (error) {
        console.error(
            `❌ ${status} user error:`,
            error
        );

        return res.status(500).json({
            success: false,
            message: `Failed to ${status} user`,
        });
    }
};

const suspendUser = (
    req,
    res
) =>
    toggleUserStatus(
        req,
        res,
        'suspend'
    );

const activateUser = (
    req,
    res
) =>
    toggleUserStatus(
        req,
        res,
        'activate'
    );

// ============================================================
// INDIVIDUALS
// ============================================================

const getIndividuals = async (
    req,
    res
) => {
    try {
        const individuals =
            await User.find({
                accountType: 'INDIVIDUAL',
            })
                .select('-password')
                .sort({ createdAt: -1 })
                .lean();

        return res.json({
            success: true,
            data: individuals,
        });
    } catch (error) {
        console.error(
            '❌ Get individuals error:',
            error
        );

        return res.status(500).json({
            success: false,
            message:
                'Failed to load individuals',
        });
    }
};

const getIndividualById = async (
    req,
    res
) => {
    try {
        if (
            !isValidObjectId(
                req.params.id
            )
        ) {
            return res.status(400).json({
                success: false,
                message:
                    'Invalid individual ID',
            });
        }

        const individual =
            await User.findOne({
                _id: req.params.id,
                accountType:
                    'INDIVIDUAL',
            })
                .select('-password')
                .lean();

        if (!individual) {
            return res.status(404).json({
                success: false,
                message:
                    'Individual not found',
            });
        }

        return res.json({
            success: true,
            data: individual,
        });
    } catch (error) {
        console.error(
            '❌ Get individual error:',
            error
        );

        return res.status(500).json({
            success: false,
            message:
                'Failed to load individual',
        });
    }
};

const updateIndividual = async (
    req,
    res
) => {
    try {
        if (
            !isValidObjectId(
                req.params.id
            )
        ) {
            return res.status(400).json({
                success: false,
                message:
                    'Invalid individual ID',
            });
        }

        const individual =
            await User.findOne({
                _id: req.params.id,
                accountType:
                    'INDIVIDUAL',
            });

        if (!individual) {
            return res.status(404).json({
                success: false,
                message:
                    'Individual not found',
            });
        }

        const {
            name,
            email,
            image,
        } = req.body;

        const changes = {};

        if (name !== undefined) {
            const trimmedName =
                String(name).trim();

            if (!trimmedName) {
                return res.status(400).json({
                    success: false,
                    message:
                        'Name cannot be empty',
                });
            }

            if (
                individual.name !==
                trimmedName
            ) {
                changes.name = {
                    from:
                        individual.name,
                    to: trimmedName,
                };

                individual.name =
                    trimmedName;
            }
        }

        if (email !== undefined) {
            const normalizedEmail =
                String(email)
                    .trim()
                    .toLowerCase();

            if (!normalizedEmail) {
                return res.status(400).json({
                    success: false,
                    message:
                        'Email cannot be empty',
                });
            }

            if (
                normalizedEmail !==
                individual.email
            ) {
                if (
                    await User.findOne({
                        email:
                            normalizedEmail,
                        _id: {
                            $ne:
                                individual._id,
                        },
                    }).select('_id')
                ) {
                    return res.status(409).json({
                        success: false,
                        message:
                            'Email address is already in use',
                    });
                }

                changes.email = {
                    from:
                        individual.email,
                    to: normalizedEmail,
                };

                individual.email =
                    normalizedEmail;
            }
        }

        if (image !== undefined) {
            const newImage =
                image || null;

            if (
                individual.image !==
                newImage
            ) {
                changes.image = {
                    from:
                        individual.image,
                    to: newImage,
                };

                individual.image =
                    newImage;
            }
        }

        if (
            !Object.keys(changes)
                .length
        ) {
            return res.status(400).json({
                success: false,
                message:
                    'No changes were provided',
            });
        }

        await individual.save();

        await logAudit(req, {
            action: 'UPDATE_USER',
            entityType: 'USER',
            entityId:
                individual._id,
            changes,
            metadata: {
                targetUserId:
                    individual._id.toString(),
                accountType:
                    'INDIVIDUAL',
            },
        });

        const updatedIndividual =
            await User.findById(
                req.params.id
            )
                .select('-password')
                .lean();

        return res.json({
            success: true,
            message:
                'Individual updated successfully',
            data: updatedIndividual,
        });
    } catch (error) {
        console.error(
            '❌ Update individual error:',
            error
        );

        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message:
                    'Email address is already in use',
            });
        }

        return error.name ===
            'ValidationError'
            ? sendValidationErrors(
                  res,
                  mongooseFieldErrors(error)
              )
            : res.status(500).json({
                  success: false,
                  message:
                      'Failed to update individual',
              });
    }
};

const toggleIndividualStatus = async (
    req,
    res,
    status
) => {
    try {
        if (
            !isValidObjectId(
                req.params.id
            )
        ) {
            return res.status(400).json({
                success: false,
                message:
                    'Invalid individual ID',
            });
        }

        const individual =
            await User.findOne({
                _id: req.params.id,
                accountType:
                    'INDIVIDUAL',
            });

        if (!individual) {
            return res.status(404).json({
                success: false,
                message:
                    'Individual not found',
            });
        }

        const statusMap = {
            suspend: 'SUSPENDED',
            activate: 'ACTIVE',
            reactivate: 'ACTIVE',
        };

        const targetStatus =
            statusMap[status];

        if (!targetStatus) {
            return res.status(400).json({
                success: false,
                message:
                    'Invalid status action',
            });
        }

        if (
            individual.status ===
            targetStatus
        ) {
            if (
                status === 'activate' ||
                status === 'reactivate'
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        'Individual is already active',
                });
            }

            return res.status(400).json({
                success: false,
                message:
                    'Individual is already suspended',
            });
        }

        if (
            status === 'activate' &&
            individual.status !==
                'PENDING'
        ) {
            return res.status(400).json({
                success: false,
                message: `Cannot activate an individual with ${individual.status.toLowerCase()} status. Use reactivate instead.`,
            });
        }

        if (
            status === 'reactivate' &&
            ![
                'SUSPENDED',
                'DEACTIVATED',
            ].includes(
                individual.status
            )
        ) {
            return res.status(400).json({
                success: false,
                message: `Cannot reactivate an individual with ${individual.status.toLowerCase()} status.`,
            });
        }

        const previousStatus =
            individual.status;

        individual.status =
            targetStatus;

        await individual.save();

        await logAudit(req, {
            action:
                status === 'suspend'
                    ? 'SUSPEND_USER'
                    : 'ACTIVATE_USER',

            entityType: 'USER',

            entityId:
                individual._id,

            changes: {
                status: {
                    from:
                        previousStatus,
                    to: targetStatus,
                },
            },

            metadata: {
                accountType:
                    'INDIVIDUAL',

                targetUserId:
                    individual._id.toString(),

                ...(status ===
                'reactivate'
                    ? {
                          reactivated:
                              true,
                      }
                    : {}),
            },
        });

        const updatedIndividual =
            await User.findById(
                req.params.id
            )
                .select('-password')
                .lean();

        const message =
            status === 'suspend'
                ? 'suspended'
                : status === 'activate'
                ? 'activated'
                : 'reactivated';

        return res.json({
            success: true,
            message: `Individual ${message} successfully`,
            data: updatedIndividual,
        });
    } catch (error) {
        console.error(
            `❌ ${status} individual error:`,
            error
        );

        return res.status(500).json({
            success: false,
            message: `Failed to ${status} individual`,
        });
    }
};

const suspendIndividual = (
    req,
    res
) =>
    toggleIndividualStatus(
        req,
        res,
        'suspend'
    );

const activateIndividual = (
    req,
    res
) =>
    toggleIndividualStatus(
        req,
        res,
        'activate'
    );

const reactivateIndividual = (
    req,
    res
) =>
    toggleIndividualStatus(
        req,
        res,
        'reactivate'
    );

const deleteIndividual = async (
    req,
    res
) => {
    try {
        if (
            !isValidObjectId(
                req.params.id
            )
        ) {
            return res.status(400).json({
                success: false,
                message:
                    'Invalid individual ID',
            });
        }

        const individual =
            await User.findOne({
                _id: req.params.id,
                accountType:
                    'INDIVIDUAL',
            });

        if (!individual) {
            return res.status(404).json({
                success: false,
                message:
                    'Individual not found',
            });
        }

        // Campaigns, bookings and payments keep a required userId, so an
        // individual with any of them is never hard-deleted.
        const [
            campaign,
            booking,
            payment,
        ] = await Promise.all([
            Campaign.findOne({ userId: individual._id }).select('_id'),
            Booking.findOne({ userId: individual._id }).select('_id'),
            Payment.findOne({ userId: individual._id }).select('_id'),
        ]);

        if (campaign || booking || payment) {
            return res.status(409).json({
                success: false,
                message:
                    'This individual has campaign or booking history and cannot be deleted. Suspend the account instead.',
            });
        }

        await User.deleteOne({
            _id: req.params.id,
            accountType:
                'INDIVIDUAL',
        });

        await logAudit(req, {
            action: 'DELETE_USER',
            entityType: 'USER',
            entityId:
                individual._id,
            changes: {
                status: {
                    from:
                        individual.status,
                    to: 'DELETED',
                },
            },
            metadata: {
                performedBy:
                    getAdminId(
                        req
                    )?.toString(),

                accountType:
                    'INDIVIDUAL',

                email:
                    individual.email,

                name:
                    individual.name,
            },
        });

        return res.json({
            success: true,
            message:
                'Individual deleted successfully',
            data: {
                id:
                    individual._id,
                email:
                    individual.email,
                name:
                    individual.name,
            },
        });
    } catch (error) {
        console.error(
            '❌ Delete individual error:',
            error
        );

        return res.status(500).json({
            success: false,
            message:
                'Failed to delete individual',
        });
    }
};

const resetIndividual = async (
    req,
    res
) => {
    try {
        if (
            !isValidObjectId(
                req.params.id
            )
        ) {
            return res.status(400).json({
                success: false,
                message:
                    'Invalid individual ID',
            });
        }

        const individual =
            await User.findOne({
                _id: req.params.id,
                accountType:
                    'INDIVIDUAL',
            });

        if (!individual) {
            return res.status(404).json({
                success: false,
                message:
                    'Individual not found',
            });
        }

        if (
            [
                'SUSPENDED',
                'DEACTIVATED',
            ].includes(
                individual.status
            )
        ) {
            return res.status(400).json({
                success: false,
                message: `Cannot reset a ${individual.status.toLowerCase()} individual. Reactivate the account first.`,
            });
        }

        const temporaryPassword =
            crypto.randomBytes(9)
                .toString('base64url') +
            'A1!';

        individual.password =
            temporaryPassword;

        // One-time credential: force a change at next sign-in and
        // revoke every JWT issued before the reset.
        individual.mustChangePassword = true;
        individual.tokenVersion =
            (individual.tokenVersion || 0) + 1;
        individual.passwordChangedAt = new Date();
        individual.passwordResetTokenHash = null;
        individual.passwordResetExpiresAt = null;

        individual.lastLogin = null;
        individual.loginCount = 0;

        await individual.save();

        await logAudit(req, {
            action: 'UPDATE_USER',
            entityType: 'USER',
            entityId:
                individual._id,
            changes: {
                password: 'RESET',
            },
            metadata: {
                accountType:
                    'INDIVIDUAL',
                actionType:
                    'PASSWORD_RESET',
                targetUserId:
                    individual._id.toString(),
            },
        });

        return res.json({
            success: true,
            message:
                'Individual account reset successfully',
            data: {
                id:
                    individual._id,
                name:
                    individual.name,
                email:
                    individual.email,
                temporaryPassword,
                mustChangePassword: true,
            },
        });
    } catch (error) {
        console.error(
            '❌ Reset individual error:',
            error
        );

        return res.status(500).json({
            success: false,
            message:
                'Failed to reset individual account',
        });
    }
};

// ============================================================
// INDIVIDUAL CAMPAIGNS & BOOKINGS
// ============================================================

const getIndividualData = async (
    req,
    res,
    model,
    populateFields,
    sortField = 'createdAt'
) => {
    try {
        if (
            !isValidObjectId(
                req.params.id
            )
        ) {
            return res.status(400).json({
                success: false,
                message:
                    'Invalid individual ID',
            });
        }

        const individual =
            await User.findOne({
                _id: req.params.id,
                accountType:
                    'INDIVIDUAL',
            })
                .select(
                    '_id name email accountType status'
                )
                .lean();

        if (!individual) {
            return res.status(404).json({
                success: false,
                message:
                    'Individual not found',
            });
        }

        const query = {
            userId: individual._id,
        };

        const data =
            await model.find(query)
                .populate(
                    populateFields
                )
                .sort({
                    [sortField]: -1,
                })
                .lean();

        return res.json({
            success: true,
            data: {
                individual,
                total: data.length,
                [
                    model.modelName.toLowerCase() +
                        's'
                ]: data,
            },
        });
    } catch (error) {
        console.error(
            `❌ Get individual ${model.modelName.toLowerCase()}s error:`,
            error
        );

        return res.status(500).json({
            success: false,
            message: `Failed to load individual ${model.modelName.toLowerCase()}s`,
        });
    }
};

const getIndividualCampaigns = (
    req,
    res
) =>
    getIndividualData(
        req,
        res,
        Campaign,
        [
            'companyId',
            // Explicit safe fields: never populate the full User (the
            // query uses .lean(), so User.toJSON cannot strip password).
            {
                path: 'userId',
                select: 'name email accountType status',
            },
        ],
        'createdAt'
    );

const getIndividualBookings = (
    req,
    res
) =>
    getIndividualData(
        req,
        res,
        Booking,
        ['campaignId', 'stationId'],
        'createdAt'
    );

const getIndividualActivity = async (
    req,
    res
) => {
    try {
        if (
            !isValidObjectId(
                req.params.id
            )
        ) {
            return res.status(400).json({
                success: false,
                message:
                    'Invalid individual ID',
            });
        }

        const individual =
            await User.findOne({
                _id: req.params.id,
                accountType:
                    'INDIVIDUAL',
            })
                .select(
                    '_id name email accountType status'
                )
                .lean();

        if (!individual) {
            return res.status(404).json({
                success: false,
                message:
                    'Individual not found',
            });
        }

        const activities =
            await AuditLog.find({
                $or: [
                    {
                        userId:
                            individual._id,
                    },
                    {
                        entityId:
                            individual._id.toString(),
                    },
                    {
                        'metadata.individualId':
                            individual._id.toString(),
                    },
                    {
                        'metadata.createdFor':
                            individual._id.toString(),
                    },
                ],
            })
                .populate(
                    'userId',
                    'name email accountType'
                )
                .populate(
                    'companyId',
                    'name'
                )
                .sort({
                    createdAt: -1,
                })
                .lean();

        return res.json({
            success: true,
            data: {
                individual,
                total:
                    activities.length,
                activities,
            },
        });
    } catch (error) {
        console.error(
            '❌ Get individual activity error:',
            error
        );

        return res.status(500).json({
            success: false,
            message:
                'Failed to load individual activity',
        });
    }
};

const createIndividualCampaign =
    async (req, res) => {
        try {
            if (
                !isValidObjectId(
                    req.params.id
                )
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        'Invalid individual ID',
                });
            }

            const individual =
                await User.findOne({
                    _id: req.params.id,
                    accountType:
                        'INDIVIDUAL',
                });

            if (!individual) {
                return res.status(404).json({
                    success: false,
                    message:
                        'Individual not found',
                });
            }

            if (
                individual.status !==
                'ACTIVE'
            ) {
                return res.status(400).json({
                    success: false,
                    message: `Cannot create campaign for an individual with ${individual.status.toLowerCase()} status`,
                });
            }

            const {
                name,
                description,
                objective,
                budget,
                currency,
                startDate,
                endDate,
            } = req.body;

            if (!name?.trim()) {
                return res.status(400).json({
                    success: false,
                    message:
                        'Campaign name is required',
                });
            }

            if (
                budget === undefined ||
                budget === null ||
                budget === ''
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        'Campaign budget is required',
                });
            }

            const numericBudget =
                Number(budget);

            if (
                !Number.isFinite(
                    numericBudget
                ) ||
                numericBudget < 0
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        'Campaign budget must be a valid non-negative number',
                });
            }

            const campaign =
                await Campaign.create({
                    name: name.trim(),
                    description:
                        description ||
                        null,
                    objective:
                        objective ||
                        'BRAND_AWARENESS',
                    budget:
                        numericBudget,
                    currency:
                        currency || 'NGN',
                    startDate:
                        startDate || null,
                    endDate:
                        endDate || null,
                    companyId:
                        individual.companyId ||
                        null,
                    userId:
                        individual._id,
                    status: 'DRAFT',
                });

            await logAudit(req, {
                companyId:
                    individual.companyId ||
                    null,
                action:
                    'CREATE_CAMPAIGN',
                entityType:
                    'CAMPAIGN',
                entityId:
                    campaign._id,
                metadata: {
                    name:
                        campaign.name,
                    createdFor:
                        individual._id.toString(),
                    createdForName:
                        individual.name,
                    createdForEmail:
                        individual.email,
                    onBehalfOfIndividual:
                        true,
                },
            });

            const createdCampaign =
                await Campaign.findById(
                    campaign._id
                )
                    .populate(
                        'userId',
                        'name email accountType status'
                    )
                    .populate(
                        'companyId',
                        'name'
                    )
                    .lean();

            return res.status(201).json({
                success: true,
                message:
                    'Campaign created successfully for individual',
                data: createdCampaign,
            });
        } catch (error) {
            console.error(
                '❌ Create individual campaign error:',
                error
            );

            return sendValidationError(
                res,
                error,
                'Failed to create campaign for individual'
            );
        }
    };

const getIndividualCampaign = async (
    req,
    res
) => {
    try {
        const {
            id,
            campaignId,
        } = req.params;

        if (
            !isValidObjectId(id) ||
            !isValidObjectId(
                campaignId
            )
        ) {
            return res.status(400).json({
                success: false,
                message:
                    'Invalid individual or campaign ID',
            });
        }

        const individual =
            await User.findOne({
                _id: id,
                accountType:
                    'INDIVIDUAL',
            })
                .select(
                    '_id name email accountType status'
                )
                .lean();

        if (!individual) {
            return res.status(404).json({
                success: false,
                message:
                    'Individual not found',
            });
        }

        const campaign =
            await Campaign.findOne({
                _id: campaignId,
                userId: individual._id,
            })
                .populate(
                    'userId',
                    'name email accountType status'
                )
                .populate(
                    'companyId',
                    'name'
                )
                .lean();

        if (!campaign) {
            return res.status(404).json({
                success: false,
                message:
                    'Campaign not found for this individual',
            });
        }

        const bookings =
            await Booking.find({
                campaignId:
                    campaign._id,
            })
                .populate(
                    'stationId',
                    'name type'
                )
                .sort({
                    createdAt: -1,
                })
                .lean();

        return res.json({
            success: true,
            data: {
                individual,
                campaign,
                bookings,
            },
        });
    } catch (error) {
        console.error(
            '❌ Get individual campaign error:',
            error
        );

        return res.status(500).json({
            success: false,
            message:
                'Failed to load individual campaign',
        });
    }
};

const updateIndividualCampaign =
    async (req, res) => {
        try {
            const {
                id,
                campaignId,
            } = req.params;

            if (
                !isValidObjectId(id) ||
                !isValidObjectId(
                    campaignId
                )
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        'Invalid individual or campaign ID',
                });
            }

            const individual =
                await User.findOne({
                    _id: id,
                    accountType:
                        'INDIVIDUAL',
                });

            if (!individual) {
                return res.status(404).json({
                    success: false,
                    message:
                        'Individual not found',
                });
            }

            const campaign =
                await Campaign.findOne({
                    _id: campaignId,
                    userId: individual._id,
                });

            if (!campaign) {
                return res.status(404).json({
                    success: false,
                    message:
                        'Campaign not found for this individual',
                });
            }

            const {
                name,
                description,
                objective,
                budget,
                currency,
                startDate,
                endDate,
            } = req.body;

            const changes = {};

            if (name !== undefined) {
                const newName =
                    String(name).trim();

                if (!newName) {
                    return res.status(400).json({
                        success: false,
                        message:
                            'Campaign name cannot be empty',
                    });
                }

                if (
                    campaign.name !==
                    newName
                ) {
                    changes.name = {
                        from:
                            campaign.name,
                        to: newName,
                    };

                    campaign.name =
                        newName;
                }
            }

            if (
                description !== undefined
            ) {
                const newDescription =
                    description
                        ? String(
                              description
                          ).trim()
                        : null;

                if (
                    campaign.description !==
                    newDescription
                ) {
                    changes.description = {
                        from:
                            campaign.description,
                        to: newDescription,
                    };

                    campaign.description =
                        newDescription;
                }
            }

            if (
                objective !== undefined
            ) {
                if (
                    typeof objective !==
                    'string'
                ) {
                    return res.status(400).json({
                        success: false,
                        message:
                            'Campaign objective must be text',
                    });
                }

                const trimmedObjective =
                    objective.trim();

                if (!trimmedObjective) {
                    return res.status(400).json({
                        success: false,
                        message:
                            'Campaign objective cannot be empty',
                    });
                }

                if (
                    campaign.objective !==
                    trimmedObjective
                ) {
                    changes.objective = {
                        from:
                            campaign.objective,
                        to: trimmedObjective,
                    };

                    campaign.objective =
                        trimmedObjective;
                }
            }

            if (budget !== undefined) {
                const numericBudget =
                    Number(budget);

                if (
                    !Number.isFinite(
                        numericBudget
                    ) ||
                    numericBudget < 0
                ) {
                    return res.status(400).json({
                        success: false,
                        message:
                            'Campaign budget must be a valid non-negative number',
                    });
                }

                if (
                    campaign.budget !==
                    numericBudget
                ) {
                    changes.budget = {
                        from:
                            campaign.budget,
                        to: numericBudget,
                    };

                    campaign.budget =
                        numericBudget;
                }
            }

            if (
                currency !== undefined
            ) {
                const newCurrency =
                    String(currency)
                        .trim()
                        .toUpperCase();

                if (!newCurrency) {
                    return res.status(400).json({
                        success: false,
                        message:
                            'Currency cannot be empty',
                    });
                }

                if (
                    campaign.currency !==
                    newCurrency
                ) {
                    changes.currency = {
                        from:
                            campaign.currency,
                        to: newCurrency,
                    };

                    campaign.currency =
                        newCurrency;
                }
            }

            if (
                startDate !== undefined
            ) {
                const newStartDate =
                    startDate
                        ? new Date(
                              startDate
                          )
                        : null;

                if (
                    startDate &&
                    Number.isNaN(
                        newStartDate.getTime()
                    )
                ) {
                    return res.status(400).json({
                        success: false,
                        message:
                            'Invalid start date',
                    });
                }

                const oldVal =
                    campaign.startDate
                        ? campaign.startDate.toISOString()
                        : null;

                const newVal =
                    newStartDate
                        ? newStartDate.toISOString()
                        : null;

                if (oldVal !== newVal) {
                    changes.startDate = {
                        from: oldVal,
                        to: newVal,
                    };

                    campaign.startDate =
                        newStartDate;
                }
            }

            if (
                endDate !== undefined
            ) {
                const newEndDate =
                    endDate
                        ? new Date(endDate)
                        : null;

                if (
                    endDate &&
                    Number.isNaN(
                        newEndDate.getTime()
                    )
                ) {
                    return res.status(400).json({
                        success: false,
                        message:
                            'Invalid end date',
                    });
                }

                const oldVal =
                    campaign.endDate
                        ? campaign.endDate.toISOString()
                        : null;

                const newVal =
                    newEndDate
                        ? newEndDate.toISOString()
                        : null;

                if (oldVal !== newVal) {
                    changes.endDate = {
                        from: oldVal,
                        to: newVal,
                    };

                    campaign.endDate =
                        newEndDate;
                }
            }

            if (
                campaign.startDate &&
                campaign.endDate &&
                campaign.startDate >
                    campaign.endDate
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        'Start date cannot be after end date',
                });
            }

            if (
                !Object.keys(changes)
                    .length
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        'No changes were provided',
                });
            }

            await campaign.save();

            await logAudit(req, {
                companyId:
                    campaign.companyId ||
                    null,

                action:
                    'UPDATE_CAMPAIGN',

                entityType:
                    'CAMPAIGN',

                entityId:
                    campaign._id,

                changes,

                metadata: {
                    campaignName:
                        campaign.name,

                    individualId:
                        individual._id.toString(),

                    individualName:
                        individual.name,

                    individualEmail:
                        individual.email,

                    onBehalfOfIndividual:
                        true,
                },
            });

            const updatedCampaign =
                await Campaign.findById(
                    campaign._id
                )
                    .populate(
                        'userId',
                        'name email accountType status'
                    )
                    .populate(
                        'companyId',
                        'name'
                    )
                    .lean();

            return res.json({
                success: true,
                message:
                    'Individual campaign updated successfully',
                data: updatedCampaign,
            });
        } catch (error) {
            console.error(
                '❌ Update individual campaign error:',
                error
            );

            return sendValidationError(
                res,
                error,
                'Failed to update individual campaign'
            );
        }
    };

const updateIndividualCampaignStatus =
    async (req, res) => {
        try {
            const {
                id,
                campaignId,
            } = req.params;

            const { status } = req.body;

            if (
                !isValidObjectId(id) ||
                !isValidObjectId(
                    campaignId
                )
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        'Invalid individual or campaign ID',
                });
            }

            if (!status) {
                return res.status(400).json({
                    success: false,
                    message:
                        'Campaign status is required',
                });
            }

            if (!isKnownCampaignStatus(status)) {
                return res.status(400).json({
                    success: false,
                    message:
                        'Invalid campaign status',
                });
            }

            const individual =
                await User.findOne({
                    _id: id,
                    accountType:
                        'INDIVIDUAL',
                });

            if (!individual) {
                return res.status(404).json({
                    success: false,
                    message:
                        'Individual not found',
                });
            }

            const campaign =
                await Campaign.findOne({
                    _id: campaignId,
                    userId: individual._id,
                });

            if (!campaign) {
                return res.status(404).json({
                    success: false,
                    message:
                        'Campaign not found for this individual',
                });
            }

            if (
                campaign.status ===
                status
            ) {
                return res.status(400).json({
                    success: false,
                    message: `Campaign is already ${status}`,
                });
            }

            const previousStatus =
                campaign.status;

            // Admin review / on-behalf transitions only (utils/campaignStatus.js).
            if (
                !canTransitionCampaignStatus(
                    'ADMIN',
                    previousStatus,
                    status
                )
            ) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid campaign status transition: ${previousStatus} → ${status}`,
                });
            }

            // Conditional write: only if the status is still what we validated.
            const transitioned =
                await Campaign.findOneAndUpdate(
                    {
                        _id: campaign._id,
                        userId: individual._id,
                        status: previousStatus,
                    },
                    { $set: { status } },
                    { new: true, runValidators: true }
                );

            if (!transitioned) {
                return res.status(409).json({
                    success: false,
                    message:
                        'Campaign status changed during this request. Please reload and try again.',
                });
            }

            await logAudit(req, {
                companyId:
                    campaign.companyId ||
                    null,

                action:
                    'UPDATE_CAMPAIGN_STATUS',

                entityType:
                    'CAMPAIGN',

                entityId:
                    campaign._id,

                changes: {
                    status: {
                        from:
                            previousStatus,
                        to: status,
                    },
                },

                metadata: {
                    campaignName:
                        campaign.name,

                    individualId:
                        individual._id.toString(),

                    individualName:
                        individual.name,

                    individualEmail:
                        individual.email,

                    onBehalfOfIndividual:
                        true,
                },
            });

            const updatedCampaign =
                await Campaign.findById(
                    campaign._id
                )
                    .populate(
                        'userId',
                        'name email accountType status'
                    )
                    .populate(
                        'companyId',
                        'name'
                    )
                    .lean();

            return res.json({
                success: true,
                message: `Campaign status updated from ${previousStatus} to ${status}`,
                data: updatedCampaign,
            });
        } catch (error) {
            console.error(
                '❌ Update individual campaign status error:',
                error
            );

            return sendValidationError(
                res,
                error,
                'Failed to update individual campaign status'
            );
        }
    };

const deleteIndividualCampaign =
    async (req, res) => {
        try {
            const {
                id,
                campaignId,
            } = req.params;

            if (
                !isValidObjectId(id) ||
                !isValidObjectId(
                    campaignId
                )
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        'Invalid individual or campaign ID',
                });
            }

            const individual =
                await User.findOne({
                    _id: id,
                    accountType:
                        'INDIVIDUAL',
                });

            if (!individual) {
                return res.status(404).json({
                    success: false,
                    message:
                        'Individual not found',
                });
            }

            const campaign =
                await Campaign.findOne({
                    _id: campaignId,
                    userId: individual._id,
                });

            if (!campaign) {
                return res.status(404).json({
                    success: false,
                    message:
                        'Campaign not found for this individual',
                });
            }

            if (
                ![
                    'DRAFT',
                    'CANCELLED',
                ].includes(
                    campaign.status
                )
            ) {
                return res.status(403).json({
                    success: false,
                    message: `Cannot delete campaign with status: ${campaign.status}`,
                });
            }

            const campaignInfo = {
                id: campaign._id.toString(),
                name: campaign.name,
                status: campaign.status,
                budget: campaign.budget,
                currency: campaign.currency,
                individualId:
                    individual._id.toString(),
                individualName:
                    individual.name,
                individualEmail:
                    individual.email,
            };

            // Booking history is never deleted (see utils/campaignDeletion.js).
            const result =
                await deleteCampaignWithoutHistory(
                    campaign
                );

            if (!result.deleted) {
                return res.status(409).json({
                    success: false,
                    message:
                        CAMPAIGN_HAS_BOOKINGS_MESSAGE,
                });
            }

            await logAudit(req, {
                companyId:
                    campaign.companyId ||
                    null,

                action:
                    'DELETE_CAMPAIGN',

                entityType:
                    'CAMPAIGN',

                entityId:
                    campaignInfo.id,

                changes: {
                    status: {
                        from:
                            campaignInfo.status,
                        to: 'DELETED',
                    },
                },

                metadata: {
                    campaignName:
                        campaignInfo.name,

                    budget:
                        campaignInfo.budget,

                    currency:
                        campaignInfo.currency,

                    individualId:
                        campaignInfo.individualId,

                    individualName:
                        campaignInfo.individualName,

                    individualEmail:
                        campaignInfo.individualEmail,

                    onBehalfOfIndividual:
                        true,
                },
            });

            return res.json({
                success: true,
                message:
                    'Individual campaign deleted successfully',

                data: {
                    campaignId:
                        campaignInfo.id,

                    campaignName:
                        campaignInfo.name,

                    individualId:
                        campaignInfo.individualId,
                },
            });
        } catch (error) {
            console.error(
                '❌ Delete individual campaign error:',
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    'Failed to delete individual campaign',
            });
        }
    };

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    // Dashboard
    getDashboardStats,

    // Companies
    getCompanies,
    createCompany,
    getCompanyById,
    updateCompany,
    updateCompanyVerification,
    suspendCompany,
    reactivateCompany,

    // Company Workers
    getCompanyWorkers,
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

    // Helpers (shared owner-record logic, e.g. for a future backfill)
    ensureCompanyOwnerEmployee,
};