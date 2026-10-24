const crypto = require('crypto');

// ── Single-use tokens (password reset, employee invitation) ──
// The raw token goes to the user once; only its SHA-256 is stored.

const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000; // 30 minutes
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const hashToken = (rawToken) =>
    crypto.createHash('sha256').update(String(rawToken)).digest('hex');

const createOneTimeToken = (ttlMs) => {
    const token = crypto.randomBytes(32).toString('base64url');

    return {
        token,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + ttlMs),
    };
};

module.exports = {
    PASSWORD_RESET_TTL_MS,
    INVITE_TTL_MS,
    hashToken,
    createOneTimeToken,
};
