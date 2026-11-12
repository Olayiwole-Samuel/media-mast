const jwt = require('jsonwebtoken');
const User = require('../models/User');

// A business that has signed up but is not yet approved (status PENDING)
// may use only the routes that take protectAllowPending: its profile,
// sign-out and its verification page. Every other route uses protect.
const PENDING_ALLOWED_TYPES = ['COMPANY', 'STATION'];

const authenticate = ({ allowPending = false } = {}) => async (req, res, next) => {
    try {
        let token;

        // ─────────────────────────────────────────────
        // Get Bearer token
        // ─────────────────────────────────────────────
        const authorization = req.headers.authorization;

        if (authorization && authorization.startsWith('Bearer ')) {
            token = authorization.split(' ')[1];
        }

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Not authorized, no token',
            });
        }

        // ─────────────────────────────────────────────
        // Verify JWT
        // ─────────────────────────────────────────────
        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        // ─────────────────────────────────────────────
        // Find current user
        // ─────────────────────────────────────────────
        const user = await User.findById(decoded.id)
            .select('-password');

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'User not found',
            });
        }

        // ─────────────────────────────────────────────
        // Check token version (revoked by password change/reset)
        // Tokens issued before versioning carry no claim and count as
        // version 0, so they stay valid only until the first revocation.
        // ─────────────────────────────────────────────
        const tokenVersion = decoded.tokenVersion === undefined ? 0 : decoded.tokenVersion;

        if (tokenVersion !== (user.tokenVersion || 0)) {
            return res.status(401).json({
                success: false,
                message: 'Invalid token',
            });
        }

        // ─────────────────────────────────────────────
        // Check account status
        // ─────────────────────────────────────────────
        const pendingAndAllowed = allowPending
            && user.status === 'PENDING'
            && PENDING_ALLOWED_TYPES.includes(user.accountType);

        if (user.status !== 'ACTIVE' && !pendingAndAllowed) {
            let message = 'Account is not active.';

            if (user.status === 'PENDING') {
                return res.status(403).json({
                    success: false,
                    code: 'VERIFICATION_REQUIRED',
                    message: 'Your account is awaiting verification. Finish and submit your verification details to continue.',
                });
            }

            if (user.status === 'SUSPENDED') {
                message = 'Your account has been suspended.';
            }

            if (user.status === 'DEACTIVATED') {
                message = 'Your account has been deactivated.';
            }

            return res.status(403).json({
                success: false,
                message,
            });
        }

        // ─────────────────────────────────────────────
        // Attach authenticated user
        // ─────────────────────────────────────────────
        req.user = user;

        next();

    } catch (error) {
        console.error('❌ AUTH MIDDLEWARE ERROR:', {
            name: error.name,
            message: error.message,
        });

        // ─────────────────────────────────────────────
        // Invalid JWT
        // ─────────────────────────────────────────────
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'Invalid token',
            });
        }

        // ─────────────────────────────────────────────
        // Expired JWT
        // ─────────────────────────────────────────────
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token expired',
            });
        }

        // ─────────────────────────────────────────────
        // Invalid JWT secret/configuration
        // ─────────────────────────────────────────────
        if (error.name === 'NotBeforeError') {
            return res.status(401).json({
                success: false,
                message: 'Token is not active yet',
            });
        }

        // ─────────────────────────────────────────────
        // Other authentication errors
        // ─────────────────────────────────────────────
        return res.status(500).json({
            success: false,
            message: 'Authentication failed',
        });
    }
};

const protect = authenticate();
const protectAllowPending = authenticate({ allowPending: true });

module.exports = {
    protect,
    protectAllowPending,
};