// ── In-memory rate limiter for authentication endpoints ──
// Fixed window per client IP. State lives in process memory, so each
// server instance (or serverless instance) keeps its own counters.

const createRateLimiter = ({
    windowMs,
    max,
    message = 'Too many requests. Please try again later.',
    // When true, only responses with status >= 400 count towards the limit
    // (successful logins don't use up a shared office IP's allowance).
    countFailuresOnly = false,
}) => {
    const hits = new Map();

    // Drop expired windows so the map doesn't grow without bound.
    const cleanup = setInterval(() => {
        const now = Date.now();
        for (const [key, entry] of hits) {
            if (entry.resetAt <= now) hits.delete(key);
        }
    }, windowMs);
    cleanup.unref();

    const limiter = (req, res, next) => {
        const key = req.ip || 'unknown';
        const now = Date.now();

        let entry = hits.get(key);
        if (!entry || entry.resetAt <= now) {
            entry = { count: 0, resetAt: now + windowMs };
            hits.set(key, entry);
        }

        if (entry.count >= max) {
            res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
            return res.status(429).json({
                success: false,
                message,
            });
        }

        // Count up front so a parallel burst can't slip past the check,
        // then refund successful requests when countFailuresOnly is set.
        entry.count += 1;
        if (countFailuresOnly) {
            res.on('finish', () => {
                if (res.statusCode < 400 && entry.count > 0) entry.count -= 1;
            });
        }

        next();
    };

    limiter.reset = () => hits.clear();

    return limiter;
};

// 10 failed sign-in attempts per IP per 15 minutes.
const loginLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 10,
    countFailuresOnly: true,
    message: 'Too many sign-in attempts. Please try again in a few minutes.',
});

// 10 registrations per IP per hour.
const registerLimiter = createRateLimiter({
    windowMs: 60 * 60 * 1000,
    max: 10,
    message: 'Too many registration attempts. Please try again later.',
});

// 5 reset requests per IP per 15 minutes.
const forgotPasswordLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: 'Too many password reset requests. Please try again later.',
});

// 10 failed token submissions per IP per 15 minutes (reset + invitation).
const resetPasswordLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 10,
    countFailuresOnly: true,
    message: 'Too many attempts. Please try again in a few minutes.',
});

const acceptInviteLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 10,
    countFailuresOnly: true,
    message: 'Too many attempts. Please try again in a few minutes.',
});

// 10 failed password changes per IP per 15 minutes (wrong current password).
const changePasswordLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 10,
    countFailuresOnly: true,
    message: 'Too many attempts. Please try again in a few minutes.',
});

module.exports = {
    createRateLimiter,
    loginLimiter,
    registerLimiter,
    forgotPasswordLimiter,
    resetPasswordLimiter,
    acceptInviteLimiter,
    changePasswordLimiter,
};
