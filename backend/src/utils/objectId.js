// ── Request-supplied MongoDB ObjectIds ──
// A malformed id is a client error (400). It must be rejected before it
// reaches Mongoose, which would otherwise throw a CastError (→ 500).
// A well-formed id that matches nothing keeps each route's existing 404.
//
// Strict 24-hex check, same as the existing admin/booking helpers
// (mongoose.isValidObjectId also accepts any 12-character string).
const isValidObjectId = (value) =>
    typeof value === 'string' && /^[0-9a-fA-F]{24}$/.test(value);

const invalidIdResponse = (res, label) =>
    res.status(400).json({
        success: false,
        message: `Invalid ${label} ID`,
    });

// For router.param('id', objectIdParam('campaign')): runs before the
// route's handler for every route in that router that has :id.
const objectIdParam = (label) => (req, res, next, value) => {
    if (!isValidObjectId(value)) {
        return invalidIdResponse(res, label);
    }

    return next();
};

module.exports = {
    isValidObjectId,
    invalidIdResponse,
    objectIdParam,
};
