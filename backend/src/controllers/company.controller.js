const Company = require('../models/Company');
const Employee = require('../models/Employee');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const Campaign = require('../models/Campaign');
const Booking = require('../models/Booking');
const Creative = require('../models/Creative');
const { PERMISSIONS } = require('../utils/permissions');
const { INVITE_TTL_MS, createOneTimeToken } = require('../utils/authTokens');
const { sendInvitationEmail } = require('../utils/authMailer');

// Emails the invitation link (best-effort; false when email isn't configured).
const emailInvitation = async (companyId, user, invite) => {
    try {
        const company = await Company.findById(companyId).select('name');
        return await sendInvitationEmail({ email: user.email, name: user.name, companyName: company && company.name, token: invite.token, expiresAt: invite.expiresAt });
    } catch (error) {
        console.error('⚠️ Invitation email failed:', error.name);
        return false;
    }
};

// ── Latest 12 UTC calendar months, oldest first ──
// Each entry: { year, month (1–12), start, end } with end exclusive.
const getLast12UtcMonths = (now) => {
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth(); // 0–11

    return Array.from({ length: 12 }, (_, i) => {
        const start = new Date(Date.UTC(year, month - 11 + i, 1));
        const end = new Date(Date.UTC(year, month - 10 + i, 1));

        return {
            year: start.getUTCFullYear(),
            month: start.getUTCMonth() + 1,
            start,
            end,
        };
    });
};

// ── GET COMPANY DASHBOARD DATA ──
const getDashboardData = async (req, res) => {
    try {
        const companyId = req.user.companyId;

        if (!companyId) {
            return res.status(400).json({
                success: false,
                message: 'No company associated with this account',
            });
        }

        // ── Get company ──
        const company = await Company.findById(companyId).select(
            'name slug status'
        );

        if (!company) {
            return res.status(404).json({
                success: false,
                message: 'Company not found',
            });
        }

        // ── Date boundaries ──
        const now = new Date();

        const startOfCurrentMonth = new Date(
            now.getFullYear(),
            now.getMonth(),
            1
        );

        const startOfPreviousMonth = new Date(
            now.getFullYear(),
            now.getMonth() - 1,
            1
        );

        const startOfNextMonth = new Date(
            now.getFullYear(),
            now.getMonth() + 1,
            1
        );

        // ── Monthly performance window: current month + previous 11 ──
        // UTC calendar months, matching how booking dates are stored (UTC
        // midnight) and how $year/$month group them. Upper bound exclusive.
        const performanceMonths = getLast12UtcMonths(now);
        const performanceWindowStart = performanceMonths[0].start;
        const performanceWindowEnd = performanceMonths[11].end;

        // ── Dashboard queries ──
        const [
            employeeCount,
            totalCampaigns,
            activeCampaigns,
            totalBookings,
            pendingBookings,

            totalSpendResult,

            currentMonthSpendResult,
            previousMonthSpendResult,

            totalReachResult,

            upcomingBookings,

            monthlyPerformance,

            recentCampaigns,
            recentActivity,

            storageResult,
        ] = await Promise.all([
            // ─────────────────────────────────────────────
            // ACTIVE EMPLOYEES
            // ─────────────────────────────────────────────
            Employee.countDocuments({
                companyId,
                isActive: true,
            }),

            // ─────────────────────────────────────────────
            // TOTAL CAMPAIGNS
            // ─────────────────────────────────────────────
            Campaign.countDocuments({
                companyId,
            }),

            // ─────────────────────────────────────────────
            // ACTIVE CAMPAIGNS
            // ─────────────────────────────────────────────
            Campaign.countDocuments({
                companyId,
                status: 'LIVE',
            }),

            // ─────────────────────────────────────────────
            // TOTAL BOOKINGS
            // ─────────────────────────────────────────────
            Booking.countDocuments({
                companyId,
            }),

            // ─────────────────────────────────────────────
            // PENDING BOOKINGS
            // ─────────────────────────────────────────────
            Booking.countDocuments({
                companyId,
                status: 'PENDING',
            }),

            // ─────────────────────────────────────────────
            // TOTAL SPEND
            // ─────────────────────────────────────────────
            Booking.aggregate([
                {
                    $match: {
                        companyId,
                        status: {
                            $in: [
                                'ACCEPTED',
                                'SCHEDULED',
                                'COMPLETED',
                            ],
                        },
                    },
                },
                {
                    $group: {
                        _id: null,
                        total: {
                            $sum: '$price',
                        },
                    },
                },
            ]),

            // ─────────────────────────────────────────────
            // CURRENT MONTH SPEND
            // ─────────────────────────────────────────────
            Booking.aggregate([
                {
                    $match: {
                        companyId,
                        createdAt: {
                            $gte: startOfCurrentMonth,
                            $lt: startOfNextMonth,
                        },
                        status: {
                            $in: [
                                'ACCEPTED',
                                'SCHEDULED',
                                'COMPLETED',
                            ],
                        },
                    },
                },
                {
                    $group: {
                        _id: null,
                        total: {
                            $sum: '$price',
                        },
                    },
                },
            ]),

            // ─────────────────────────────────────────────
            // PREVIOUS MONTH SPEND
            // ─────────────────────────────────────────────
            Booking.aggregate([
                {
                    $match: {
                        companyId,
                        createdAt: {
                            $gte: startOfPreviousMonth,
                            $lt: startOfCurrentMonth,
                        },
                        status: {
                            $in: [
                                'ACCEPTED',
                                'SCHEDULED',
                                'COMPLETED',
                            ],
                        },
                    },
                },
                {
                    $group: {
                        _id: null,
                        total: {
                            $sum: '$price',
                        },
                    },
                },
            ]),

            // ─────────────────────────────────────────────
            // TOTAL REACH
            // ─────────────────────────────────────────────
            Campaign.aggregate([
                {
                    $match: {
                        companyId,
                    },
                },
                {
                    $group: {
                        _id: null,
                        total: {
                            $sum: '$totalReach',
                        },
                    },
                },
            ]),

            // ─────────────────────────────────────────────
            // UPCOMING BOOKINGS
            // ─────────────────────────────────────────────
            Booking.find({
                companyId,
                date: {
                    $gte: now,
                },
                status: {
                    $nin: [
                        'CANCELLED',
                        'REJECTED',
                        'COMPLETED',
                    ],
                },
            })
                .sort({
                    date: 1,
                })
                .limit(5)
                .populate('stationId', 'name type logo')
                .populate('campaignId', 'name')
                .lean(),

            // ─────────────────────────────────────────────
            // MONTHLY PERFORMANCE
            // ─────────────────────────────────────────────
            // Confirmed spend and booking count per calendar month of the
            // booking's broadcast date, for the latest 12 months only.
            Booking.aggregate([
                {
                    $match: {
                        companyId,
                        status: {
                            $in: [
                                'ACCEPTED',
                                'SCHEDULED',
                                'COMPLETED',
                            ],
                        },
                        date: {
                            $gte: performanceWindowStart,
                            $lt: performanceWindowEnd,
                        },
                    },
                },
                {
                    $group: {
                        _id: {
                            year: {
                                $year: '$date',
                            },
                            month: {
                                $month: '$date',
                            },
                        },
                        spend: {
                            $sum: '$price',
                        },
                        bookings: {
                            $sum: 1,
                        },
                    },
                },
            ]),

            // ─────────────────────────────────────────────
            // RECENT CAMPAIGNS
            // ─────────────────────────────────────────────
            Campaign.find({
                companyId,
            })
                .sort({
                    createdAt: -1,
                })
                .limit(5)
                .select(
                    'name objective status budget currency startDate endDate totalReach progress createdAt'
                )
                .lean(),

            // ─────────────────────────────────────────────
            // RECENT ACTIVITY
            // ─────────────────────────────────────────────
            AuditLog.find({
                companyId,
            })
                .sort({
                    createdAt: -1,
                })
                .limit(5)
                .populate('userId', 'name email')
                .lean(),

            // ─────────────────────────────────────────────
            // ACTUAL CREATIVE STORAGE
            // ─────────────────────────────────────────────
            Creative.aggregate([
                {
                    $lookup: {
                        from: 'campaigns',
                        localField: 'campaignId',
                        foreignField: '_id',
                        as: 'campaign',
                    },
                },
                {
                    $unwind: '$campaign',
                },
                {
                    $match: {
                        'campaign.companyId': companyId,
                    },
                },
                {
                    $group: {
                        _id: '$type',
                        totalBytes: {
                            $sum: {
                                $ifNull: ['$size', 0],
                            },
                        },
                        fileCount: {
                            $sum: 1,
                        },
                    },
                },
            ]),
        ]);

        // ─────────────────────────────────────────────
        // EXTRACT TOTAL SPEND
        // ─────────────────────────────────────────────

        const totalSpend =
            totalSpendResult.length > 0
                ? totalSpendResult[0].total
                : 0;

        const currentMonthSpend =
            currentMonthSpendResult.length > 0
                ? currentMonthSpendResult[0].total
                : 0;

        const previousMonthSpend =
            previousMonthSpendResult.length > 0
                ? previousMonthSpendResult[0].total
                : 0;

        // ─────────────────────────────────────────────
        // EXTRACT TOTAL REACH
        // ─────────────────────────────────────────────

        const totalReach =
            totalReachResult.length > 0
                ? totalReachResult[0].total
                : 0;

        // ─────────────────────────────────────────────
        // CALCULATE SPEND CHANGE
        // ─────────────────────────────────────────────

        let spendChange = null;

        if (previousMonthSpend > 0) {
            spendChange =
                ((currentMonthSpend - previousMonthSpend) /
                    previousMonthSpend) *
                100;
        }

        // ─────────────────────────────────────────────
        // FORMAT UPCOMING BOOKINGS
        // ─────────────────────────────────────────────

        const formattedUpcomingBookings =
            upcomingBookings.map((booking) => ({
                id: booking._id,
                bookingReference: booking.bookingReference,

                campaign: booking.campaignId
                    ? {
                          id: booking.campaignId._id,
                          name: booking.campaignId.name,
                      }
                    : null,

                station: booking.stationId
                    ? {
                          id: booking.stationId._id,
                          name: booking.stationId.name,
                          type: booking.stationId.type,
                          logo: booking.stationId.logo,
                      }
                    : null,

                slot: booking.slot,
                date: booking.date,
                time: booking.time,
                duration: booking.duration,

                price: booking.price,
                currency: booking.currency,

                status: booking.status,
            }));

        // ─────────────────────────────────────────────
        // FORMAT PERFORMANCE
        // ─────────────────────────────────────────────

        // All 12 months, oldest → current, zeros where there was no activity.
        const performanceByMonth = new Map(
            monthlyPerformance.map((item) => [
                `${item._id.year}-${item._id.month}`,
                item,
            ])
        );

        const formattedPerformance =
            performanceMonths.map(({ year, month }) => {
                const item = performanceByMonth.get(`${year}-${month}`);

                return {
                    year,
                    month,
                    spend: item?.spend || 0,
                    bookings: item?.bookings || 0,
                };
            });

        // ─────────────────────────────────────────────
        // FORMAT STORAGE
        // ─────────────────────────────────────────────

        const storageCategories =
            storageResult.map((item) => ({
                type: item._id,
                totalBytes: item.totalBytes || 0,
                fileCount: item.fileCount || 0,
            }));

        const totalStorageBytes =
            storageCategories.reduce(
                (total, category) =>
                    total + category.totalBytes,
                0
            );

        // ─────────────────────────────────────────────
        // RESPONSE
        // ─────────────────────────────────────────────

        return res.json({
            success: true,

            data: {
                company: {
                    id: company._id,
                    name: company.name,
                    slug: company.slug,
                    status: company.status,
                },

                stats: {
                    totalSpend,
                    currentMonthSpend,
                    previousMonthSpend,
                    spendChange,
                    totalReach,
                    activeCampaigns,
                    totalCampaigns,
                    totalBookings,
                    pendingBookings,
                    employeeCount,
                },

                upcomingBookings:
                    formattedUpcomingBookings,

                performance: {
                    monthly: formattedPerformance,
                },

                recentCampaigns,

                recentActivity,

                storage: {
                    usedBytes: totalStorageBytes,
                    categories: storageCategories,
                },
            },
        });
    } catch (error) {
        console.error('❌ Dashboard error:', error);

        return res.status(500).json({
            success: false,
            message: 'Failed to load dashboard data',
        });
    }
};

// ── GET TEAM MEMBERS ──
const getTeam = async (req, res) => {
    try {
        const companyId = req.user.companyId;

        if (!companyId) {
            return res.status(400).json({
                success: false,
                message: 'No company associated with this account',
            });
        }

        const employees = await Employee.find({
            companyId,
            isActive: true,
        })
            .populate('userId', 'name email image')
            .select(
                'userId position permissions invitedAt isActive'
            );

        return res.json({
            success: true,
            data: employees,
        });
    } catch (error) {
        console.error('❌ Team error:', error);

        return res.status(500).json({
            success: false,
            message: 'Failed to load team data',
        });
    }
};

// ── INVITE TEAM MEMBER ──
const inviteTeamMember = async (req, res) => {
    try {
        const companyId = req.user.companyId;
        const {
            email,
            name,
            position,
            permissions,
        } = req.body || {};

        // ── The employee chooses their own password when accepting ──
        if (req.body && req.body.password !== undefined) {
            return res.status(400).json({
                success: false,
                message: 'Do not set a password. The team member chooses their own password when accepting the invitation.',
            });
        }

        // ── Validation ──
        if (!email || !name) {
            return res.status(400).json({
                success: false,
                message: 'Email and name are required',
            });
        }

        if (typeof email !== 'string' || typeof name !== 'string') {
            return res.status(400).json({
                success: false,
                message: 'Email and name must be text',
            });
        }

        if (!email.trim() || !name.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Email and name are required',
            });
        }

        // Same rule as the User schema's email `match`.
        if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
            return res.status(400).json({
                success: false,
                message: 'Please enter a valid email',
            });
        }

        // ── Position: free-text job title, as in role updates; never the owner ──
        if (
            position !== undefined &&
            (typeof position !== 'string' || !position.trim())
        ) {
            return res.status(400).json({
                success: false,
                message: 'Position must be a non-empty string.',
            });
        }

        if (
            position !== undefined &&
            position.trim().toLowerCase() === 'company owner'
        ) {
            return res.status(400).json({
                success: false,
                message: 'Company Owner cannot be assigned through an invitation.',
            });
        }

        // ── Permissions: known values only, no duplicates, never ALL_ACCESS ──
        if (permissions !== undefined) {
            if (!Array.isArray(permissions)) {
                return res.status(400).json({
                    success: false,
                    message: 'Permissions must be an array.',
                });
            }

            const validPermissions = new Set(Object.values(PERMISSIONS));

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

            if (permissions.includes(PERMISSIONS.ALL_ACCESS)) {
                return res.status(400).json({
                    success: false,
                    message: 'ALL_ACCESS can only be assigned to the Company Owner.',
                });
            }

            if (new Set(permissions).size !== permissions.length) {
                return res.status(400).json({
                    success: false,
                    message: 'Duplicate permissions are not allowed.',
                });
            }
        }

        // ── Normalize email ──
        const normalizedEmail = email.trim().toLowerCase();

        // ── Check if user already exists ──
        const existingUser = await User.findOne({
            email: normalizedEmail,
        });

        // ============================================================
        // EXISTING USER
        // ============================================================
        //
        // SECURITY RULE:
        // An invitation must NEVER modify an existing user's:
        // - password
        // - name
        // - accountType
        // - status
        // - companyId
        //
        // Existing accounts are rejected.
        // ============================================================

        if (existingUser) {
            // ── Existing administrator ──
            if (existingUser.accountType === 'ADMIN') {
                return res.status(403).json({
                    success: false,
                    message:
                        'This email belongs to an administrator and cannot be added as a company employee.',
                });
            }

            // ── Existing user belongs to another company ──
            if (
                existingUser.companyId &&
                existingUser.companyId.toString() !==
                    companyId.toString()
            ) {
                return res.status(409).json({
                    success: false,
                    message:
                        'This user already belongs to another company.',
                });
            }

            // ── Check for an existing Employee record ──
            const existingEmployee = await Employee.findOne({
                userId: existingUser._id,
            });

            if (existingEmployee) {
                // ── Existing active employee in this company ──
                if (
                    existingEmployee.companyId.toString() ===
                    companyId.toString()
                ) {
                    // ── Invitation still pending: issue a fresh token ──
                    // (the old one stops working). Permissions/position
                    // are changed through the employee management flow.
                    if (
                        existingEmployee.isActive &&
                        !existingEmployee.acceptedAt &&
                        existingUser.accountType === 'EMPLOYEE' &&
                        existingUser.status === 'PENDING' &&
                        !existingUser.password
                    ) {
                        const invite = createOneTimeToken(INVITE_TTL_MS);

                        await Employee.updateOne(
                            { _id: existingEmployee._id },
                            {
                                $set: {
                                    inviteTokenHash: invite.tokenHash,
                                    inviteExpiresAt: invite.expiresAt,
                                    invitedAt: new Date(),
                                    invitedBy: req.user.id,
                                },
                            }
                        );

                        await AuditLog.create({
                            userId: req.user.id,
                            companyId,
                            action: 'INVITE_EMPLOYEE',
                            entityType: 'EMPLOYEE',
                            entityId: existingEmployee._id,
                            metadata: {
                                email: existingUser.email,
                                name: existingUser.name,
                                position: existingEmployee.position,
                                resent: true,
                            },
                        });

                        const emailSent = await emailInvitation(companyId, existingUser, invite);

                        return res.json({
                            success: true,
                            message: emailSent
                                ? 'Invitation re-sent by email. The previous invitation link no longer works.'
                                : 'Invitation re-sent. The previous invitation link no longer works.',
                            emailSent,
                            data: {
                                id: existingEmployee._id,
                                name: existingUser.name,
                                email: existingUser.email,
                                position: existingEmployee.position,
                                permissions: existingEmployee.permissions,
                                isActive: existingEmployee.isActive,
                                invitationPending: true,
                                invitation: {
                                    token: invite.token,
                                    expiresAt: invite.expiresAt,
                                },
                            },
                        });
                    }

                    if (existingEmployee.isActive) {
                        return res.status(409).json({
                            success: false,
                            message:
                                'This user is already a member of your company.',
                        });
                    }

                    // ── Previously removed employee ──
                    return res.status(409).json({
                        success: false,
                        message:
                            'This user was previously removed from the company and must be reactivated through the employee management flow.',
                    });
                }

                // ── Employee belongs to another company ──
                return res.status(409).json({
                    success: false,
                    message:
                        'This user already belongs to another company.',
                });
            }

            // ── Existing individual account ──
            if (existingUser.accountType === 'INDIVIDUAL') {
                return res.status(409).json({
                    success: false,
                    message:
                        'This email is already registered. The existing account must be handled through the appropriate account-linking flow.',
                });
            }

            // ── Existing company account ──
            if (existingUser.accountType === 'COMPANY') {
                return res.status(409).json({
                    success: false,
                    message:
                        'This email is already registered. The existing account must be handled through the appropriate account-linking flow.',
                });
            }

            // ── Existing employee account ──
            if (existingUser.accountType === 'EMPLOYEE') {
                return res.status(409).json({
                    success: false,
                    message:
                        'This email is already registered. The existing account must be handled through the appropriate account-linking flow.',
                });
            }

            // ── Existing account with no recognized account type ──
            return res.status(409).json({
                success: false,
                message:
                    'This email is already registered. The existing account must be handled through the appropriate account-linking flow.',
            });
        }

        // ============================================================
        // NEW USER ONLY
        // ============================================================
        //
        // A User is created only when the email does not already exist.
        // ============================================================

        // No password yet: the account stays PENDING (cannot sign in)
        // until the employee accepts the invitation and sets one.
        const user = await User.create({
            email: normalizedEmail,
            name: name.trim(),
            accountType: 'EMPLOYEE',
            status: 'PENDING',
            companyId,
        });

        const invite = createOneTimeToken(INVITE_TTL_MS);

        // ── Create employee record ──
        const employee = await Employee.create({
            userId: user._id,
            companyId,
            position:
                position !== undefined
                    ? position.trim()
                    : 'Team Member',
            permissions:
                permissions !== undefined
                    ? [...permissions]
                    : [],
            isActive: true,
            invitedAt: new Date(),
            invitedBy: req.user.id,
            acceptedAt: null,
            inviteTokenHash: invite.tokenHash,
            inviteExpiresAt: invite.expiresAt,
        });

        // ── Audit log ──
        await AuditLog.create({
            userId: req.user.id,
            companyId,
            action: 'INVITE_EMPLOYEE',
            entityType: 'EMPLOYEE',
            entityId: employee._id,
            metadata: {
                email: normalizedEmail,
                name: user.name,
                position: employee.position,
            },
        });

        const emailSent = await emailInvitation(companyId, user, invite);

        return res.status(201).json({
            success: true,
            message: emailSent
                ? `Invitation emailed to ${user.email}. You can also share the one-time code below.`
                : 'Invitation created. Share the invitation with the team member so they can set their own password.',
            emailSent,
            data: {
                id: employee._id,
                name: user.name,
                email: user.email,
                position: employee.position,
                permissions: employee.permissions,
                isActive: employee.isActive,
                invitationPending: true,
                // Shown once to the owner for delivery; only its hash is stored.
                invitation: {
                    token: invite.token,
                    expiresAt: invite.expiresAt,
                },
            },
        });
    } catch (error) {
        console.error('❌ Invite error:', error);

        return res.status(500).json({
            success: false,
            message: 'Failed to add team member',
        });
    }
};

// ── REMOVE TEAM MEMBER ──
const removeTeamMember = async (req, res) => {
    try {
        const companyId = req.user.companyId;
        const { id } = req.params;

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

        // ── Don't remove the owner ──
        if (employee.position === 'Company Owner') {
            return res.status(403).json({
                success: false,
                message: 'Cannot remove company owner',
            });
        }

        // ── Soft delete ──
        employee.isActive = false;
        await employee.save();

        // ── Also update user status (ACTIVE → DEACTIVATED only) ──
        // A SUSPENDED or PENDING platform status is left untouched, so
        // removal can never convert a platform suspension into a state the
        // company could later reverse through employee activation.
        await User.updateOne(
            { _id: employee.userId, status: 'ACTIVE' },
            { status: 'DEACTIVATED' }
        );

        // ── Audit log ──
        await AuditLog.create({
            userId: req.user.id,
            companyId,
            action: 'REMOVE_EMPLOYEE',
            entityType: 'EMPLOYEE',
            entityId: employee._id,
            metadata: {
                userId: employee.userId,
            },
        });

        return res.json({
            success: true,
            message: 'Team member removed successfully',
        });
    } catch (error) {
        console.error('❌ Remove error:', error);

        return res.status(500).json({
            success: false,
            message: 'Failed to remove team member',
        });
    }
};

// ── UPDATE TEAM MEMBER ROLE ──
const updateTeamMemberRole = async (req, res) => {
    try {
        const companyId = req.user.companyId;
        const { id } = req.params;
        const { position, permissions } = req.body;

        // ── Validate that something is being updated ──
        if (
            position === undefined &&
            permissions === undefined
        ) {
            return res.status(400).json({
                success: false,
                message: 'Provide a position or permissions to update.',
            });
        }

        // ── Validate position if supplied ──
        if (
            position !== undefined &&
            (typeof position !== 'string' || !position.trim())
        ) {
            return res.status(400).json({
                success: false,
                message: 'Position must be a non-empty string.',
            });
        }

        // ── Company Owner cannot be assigned through this endpoint ──
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

        // ── Validate permissions if supplied ──
        if (permissions !== undefined) {
            if (!Array.isArray(permissions)) {
                return res.status(400).json({
                    success: false,
                    message: 'Permissions must be an array.',
                });
            }

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

            // ── ALL_ACCESS is reserved for Company Owner ──
            if (
                permissions.includes(
                    PERMISSIONS.ALL_ACCESS
                )
            ) {
                return res.status(403).json({
                    success: false,
                    message:
                        'ALL_ACCESS can only be assigned to the Company Owner.',
                });
            }

            // ── Duplicate permissions are not allowed ──
            if (
                new Set(permissions).size !==
                permissions.length
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        'Duplicate permissions are not allowed.',
                });
            }
        }

        // ── Target must be an active employee in this company ──
        const employee = await Employee.findOne({
            _id: id,
            companyId,
            isActive: true,
        });

        if (!employee) {
            return res.status(404).json({
                success: false,
                message: 'Active employee not found.',
            });
        }

        // ── Never allow the Company Owner to be edited ──
        if (employee.position === 'Company Owner') {
            return res.status(403).json({
                success: false,
                message: 'Cannot modify the company owner.',
            });
        }

        // ── Never allow self-role manipulation ──
        if (
            employee.userId &&
            employee.userId.toString() ===
                req.user.id.toString()
        ) {
            return res.status(403).json({
                success: false,
                message:
                    'You cannot modify your own role or permissions.',
            });
        }

        // ── Apply only supplied changes ──
        if (position !== undefined) {
            employee.position = position.trim();
        }

        if (permissions !== undefined) {
            employee.permissions = [...permissions];
        }

        await employee.save();

        // ── Audit log ──
        await AuditLog.create({
            userId: req.user.id,
            companyId,
            action: 'UPDATE_EMPLOYEE_ROLE',
            entityType: 'EMPLOYEE',
            entityId: employee._id,
            metadata: {
                position:
                    position !== undefined
                        ? position.trim()
                        : employee.position,
                permissions:
                    permissions !== undefined
                        ? permissions
                        : employee.permissions,
            },
        });

        return res.json({
            success: true,
            message: 'Employee role updated',
            data: employee,
        });
    } catch (error) {
        console.error('❌ Update role error:', error);

        return res.status(500).json({
            success: false,
            message: 'Failed to update employee role',
        });
    }
};

module.exports = {
    getDashboardData,
    getTeam,
    inviteTeamMember,
    removeTeamMember,
    updateTeamMemberRole,
};