const User = require('../models/User');
const Company = require('../models/Company');
const Employee = require('../models/Employee');
const AuditLog = require('../models/AuditLog');
const jwt = require('jsonwebtoken');
const {
    mongooseFieldErrors,
    sendValidationErrors,
} = require('../utils/validationResponse');
const authMailer = require('../utils/authMailer');
const {
    PASSWORD_RESET_TTL_MS,
    hashToken,
    createOneTimeToken,
} = require('../utils/authTokens');

// ── Generate JWT ──
// tokenVersion lets the server revoke every token issued before a
// password change/reset (checked in middleware/auth.js).
const generateToken = (user) => {
    return jwt.sign({ id: user._id, tokenVersion: user.tokenVersion || 0 }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRE || '7d',
    });
};

// ── Generate Slug ──
const generateSlug = (name) => {
    return name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
};

// ── REGISTER ──
// Input comes only from req.validatedBody (Joi: email lowercased/trimmed,
// names trimmed, unknown fields stripped). Every record created here is
// tracked and removed again if any later step fails, so a failed
// registration never leaves an orphan Company / User / Employee behind.
// No transactions are used in this project; this mirrors the manual
// rollback in admin createCompany.
const registrationConflict = (res, message) =>
    res.status(409).json({
        success: false,
        message,
    });

const register = async (req, res) => {
    const created = { employeeId: null, userId: null, companyId: null };

    const rollback = async () => {
        const steps = [
            created.employeeId && (() => Employee.findByIdAndDelete(created.employeeId)),
            created.userId && (() => User.findByIdAndDelete(created.userId)),
            created.companyId && (() => Company.findByIdAndDelete(created.companyId)),
        ].filter(Boolean);

        for (const step of steps) {
            try {
                await step();
            } catch (rollbackError) {
                console.error('❌ Registration rollback error:', rollbackError.message);
            }
        }
    };

    try {
        const { accountType, email, password, name, companyName, phone } = req.validatedBody;

        console.log('📝 Registration attempt:', { accountType, email, name });

        // Check if user exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'Email already registered',
            });
        }

        let user = null;
        let company = null;

        // ── INDIVIDUAL Registration ──
        if (accountType === 'individual') {
            user = await User.create({
                email,
                password,
                name,
                accountType: 'INDIVIDUAL',
            });
            created.userId = user._id;

            console.log('✅ Individual user created:', user.email);
        }

        // ── COMPANY Registration ──
        if (accountType === 'company') {
            // Check if company exists
            const existingCompany = await Company.findOne({ email });

            if (existingCompany) {
                return res.status(400).json({
                    success: false,
                    message: 'Company already registered',
                });
            }

            // Generate slug
            let slug = generateSlug(companyName);
            let slugExists = await Company.findOne({ slug });
            let counter = 1;

            while (slugExists) {
                slug = `${generateSlug(companyName)}-${counter}`;
                slugExists = await Company.findOne({ slug });
                counter++;
            }

            // Create company
            company = await Company.create({
                name: companyName,
                slug,
                email,
                phone: phone || null,
                status: 'PENDING',
            });
            created.companyId = company._id;

            // Create company owner account
            user = await User.create({
                email,
                password,
                name,
                accountType: 'COMPANY',
                status: 'PENDING',
                companyId: company._id,
            });
            created.userId = user._id;

            console.log('✅ Company user created:', user.email);

            // Create company owner employee record
            const ownerEmployee = await Employee.create({
                userId: user._id,
                companyId: company._id,
                position: 'Company Owner',
                permissions: ['ALL_ACCESS'],
                isActive: true,
            });
            created.employeeId = ownerEmployee._id;
        }

        // ── Check if user was created ──
        if (!user) {
            console.error('❌ User creation failed - user is null');
            await rollback();
            return res.status(500).json({
                success: false,
                message: 'User creation failed',
            });
        }

        // ── Generate Token ──
        const token = generateToken(user);

        // ── Update last login ──
        user.lastLogin = new Date();
        user.loginCount = (user.loginCount || 0) + 1;
        await user.save();

        // ── Audit log (non-fatal, as elsewhere: the account already exists) ──
        try {
            await AuditLog.create(
                company
                    ? {
                        userId: user._id,
                        companyId: company._id,
                        action: 'REGISTER',
                        entityType: 'COMPANY',
                        entityId: company._id,
                        metadata: {
                            companyName: company.name,
                        },
                    }
                    : {
                        userId: user._id,
                        action: 'REGISTER',
                        entityType: 'USER',
                        entityId: user._id,
                        metadata: { accountType: 'INDIVIDUAL' },
                    }
            );
        } catch (auditError) {
            console.error('⚠️ Audit log error:', auditError.message);
        }

        // ── Response ──
        res.status(201).json({
            success: true,
            message: accountType === 'individual'
                ? 'Account created successfully'
                : 'Company registered. Awaiting approval.',
            data: {
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    accountType: user.accountType,
                    companyId: user.companyId,
                },
                company: company ? {
                    id: company._id,
                    name: company.name,
                    slug: company.slug,
                    status: company.status,
                } : null,
            },
            token,
        });

    } catch (error) {
        await rollback();

        // Log the name/message only: a full validation error object can
        // carry the submitted values (including the password).
        console.error('❌ Registration error:', error.name, error.message);

        // A concurrent registration with the same email/slug passed the
        // pre-checks above and lost the race on the unique index.
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern || error.keyValue || {})[0];
            return registrationConflict(
                res,
                field === 'slug'
                    ? 'A company with a similar name was just registered. Please try again.'
                    : 'Email already registered'
            );
        }

        if (error.name === 'ValidationError') {
            return sendValidationErrors(res, mongooseFieldErrors(error));
        }

        res.status(500).json({
            success: false,
            message: 'Registration failed. Please try again.',
        });
    }
};

// ── LOGIN ──
const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        console.log('🔍 Login attempt:', { email });

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials',
            });
        }

        const isPasswordValid = await user.comparePassword(password);

        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials',
            });
        }

        if (user.status !== 'ACTIVE') {
            return res.status(403).json({
                success: false,
                message: user.status === 'PENDING' && user.accountType === 'COMPANY'
                    ? 'Your account is awaiting approval. We will email you once it has been reviewed.'
                    : 'Account is suspended or deactivated',
            });
        }

        const token = generateToken(user);

        user.lastLogin = new Date();
        user.loginCount = (user.loginCount || 0) + 1;
        await user.save();

        await AuditLog.create({
            userId: user._id,
            companyId: user.companyId,
            action: 'LOGIN',
            entityType: 'USER',
            entityId: user._id,
        });

        const userData = {
            id: user._id,
            name: user.name,
            email: user.email,
            accountType: user.accountType,
            companyId: user.companyId,
            status: user.status,
            image: user.image,
            mustChangePassword: user.mustChangePassword === true,
        };

        console.log('✅ Login successful for:', user.email);

        res.json({
            success: true,
            message: 'Login successful',
            data: { user: userData },
            token,
        });

    } catch (error) {
        console.error('❌ Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Login failed. Please try again.',
        });
    }
};

// ── GET CURRENT USER ──
const getMe = async (req, res) => {
    try {
        const user = await User.findById(req.user.id)
            .select('-password')
            .populate('companyId');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }

        res.json({
            success: true,
            data: user,
        });

    } catch (error) {
        console.error('❌ Get me error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get user data',
        });
    }
};

// ── LOGOUT ──
const logout = async (req, res) => {
    try {
        await AuditLog.create({
            userId: req.user.id,
            companyId: req.user.companyId,
            action: 'LOGOUT',
            entityType: 'USER',
            entityId: req.user.id,
        });

        res.json({
            success: true,
            message: 'Logged out successfully',
        });
    } catch (error) {
        console.error('❌ Logout error:', error);
        res.status(500).json({
            success: false,
            message: 'Logout failed',
        });
    }
};

// ── Shared: set a new password and revoke every existing JWT ──
const applyNewPassword = (user, newPassword) => {
    user.password = newPassword; // hashed by the User pre-save hook
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    user.passwordChangedAt = new Date();
    user.mustChangePassword = false;
    // Any outstanding reset link is void once the password changes.
    user.passwordResetTokenHash = null;
    user.passwordResetExpiresAt = null;
};

// ── CHANGE PASSWORD (authenticated) ──
const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.validatedBody;

        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid token',
            });
        }

        // 400 rather than 401: the session itself is still valid.
        const isCurrentValid = await user.comparePassword(currentPassword);
        if (!isCurrentValid) {
            return res.status(400).json({
                success: false,
                message: 'Current password is incorrect',
            });
        }

        if (await user.comparePassword(newPassword)) {
            return res.status(400).json({
                success: false,
                message: 'New password must be different from the current password',
            });
        }

        applyNewPassword(user, newPassword);
        await user.save();

        await AuditLog.create({
            userId: user._id,
            companyId: user.companyId,
            action: 'CHANGE_PASSWORD',
            entityType: 'USER',
            entityId: user._id,
        });

        res.json({
            success: true,
            message: 'Password updated. Please sign in again with your new password.',
        });

    } catch (error) {
        console.error('❌ Change password error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to change password',
        });
    }
};

// ── FORGOT PASSWORD (public) ──
// Same response whether or not the email exists.
const FORGOT_PASSWORD_MESSAGE =
    'If an account exists for that email, password reset instructions will be sent.';

const forgotPassword = async (req, res) => {
    try {
        const { email } = req.validatedBody;

        const user = await User.findOne({ email });

        if (user) {
            const { token, tokenHash, expiresAt } =
                createOneTimeToken(PASSWORD_RESET_TTL_MS);

            // updateOne: no full-document validation, so a legacy record
            // can't turn this into an error that reveals the account exists.
            await User.updateOne(
                { _id: user._id },
                {
                    $set: {
                        passwordResetTokenHash: tokenHash,
                        passwordResetExpiresAt: expiresAt,
                    },
                }
            );

            await AuditLog.create({
                userId: user._id,
                companyId: user.companyId,
                action: 'REQUEST_PASSWORD_RESET',
                entityType: 'USER',
                entityId: user._id,
            });

            await authMailer.sendPasswordResetEmail({
                email: user.email,
                token,
                expiresAt,
            });
        }

        res.json({
            success: true,
            message: FORGOT_PASSWORD_MESSAGE,
        });

    } catch (error) {
        console.error('❌ Forgot password error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to process password reset request',
        });
    }
};

// ── RESET PASSWORD (public, with emailed token) ──
const resetPassword = async (req, res) => {
    try {
        const { token, password } = req.validatedBody;

        // Atomically claim the token so it can only ever be used once.
        const claimed = await User.findOneAndUpdate(
            {
                passwordResetTokenHash: hashToken(token),
                passwordResetExpiresAt: { $gt: new Date() },
            },
            {
                $set: {
                    passwordResetTokenHash: null,
                    passwordResetExpiresAt: null,
                },
            }
        );

        if (!claimed) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired reset token',
            });
        }

        const user = await User.findById(claimed._id);
        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired reset token',
            });
        }

        applyNewPassword(user, password);
        await user.save();

        await AuditLog.create({
            userId: user._id,
            companyId: user.companyId,
            action: 'RESET_PASSWORD',
            entityType: 'USER',
            entityId: user._id,
        });

        res.json({
            success: true,
            message: 'Password has been reset. Please sign in with your new password.',
        });

    } catch (error) {
        console.error('❌ Reset password error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to reset password',
        });
    }
};

// ── ACCEPT EMPLOYEE INVITATION (public, with invitation token) ──
// companyId, permissions, position and accountType all come from the
// server-side invitation; the request only supplies token, name, password.
const INVALID_INVITE_MESSAGE = 'Invalid or expired invitation';

const acceptInvite = async (req, res) => {
    try {
        const { token, name, password } = req.validatedBody;

        // Atomically claim the invitation so it can only ever be used once.
        const employee = await Employee.findOneAndUpdate(
            {
                inviteTokenHash: hashToken(token),
                inviteExpiresAt: { $gt: new Date() },
                acceptedAt: null,
                isActive: true,
            },
            {
                $set: {
                    inviteTokenHash: null,
                    inviteExpiresAt: null,
                    acceptedAt: new Date(),
                },
            }
        );

        if (!employee) {
            return res.status(400).json({
                success: false,
                message: INVALID_INVITE_MESSAGE,
            });
        }

        const user = await User.findById(employee.userId);

        if (
            !user ||
            user.accountType !== 'EMPLOYEE' ||
            user.status !== 'PENDING' ||
            user.password ||
            String(user.companyId) !== String(employee.companyId)
        ) {
            return res.status(400).json({
                success: false,
                message: INVALID_INVITE_MESSAGE,
            });
        }

        if (name) user.name = name;
        applyNewPassword(user, password);
        user.status = 'ACTIVE';
        await user.save();

        await AuditLog.create({
            userId: user._id,
            companyId: employee.companyId,
            action: 'ACCEPT_EMPLOYEE_INVITE',
            entityType: 'EMPLOYEE',
            entityId: employee._id,
        });

        res.json({
            success: true,
            message: 'Invitation accepted. You can now sign in.',
            data: {
                email: user.email,
                name: user.name,
            },
        });

    } catch (error) {
        console.error('❌ Accept invitation error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to accept invitation',
        });
    }
};

module.exports = {
    register,
    login,
    getMe,
    logout,
    changePassword,
    forgotPassword,
    resetPassword,
    acceptInvite,
};