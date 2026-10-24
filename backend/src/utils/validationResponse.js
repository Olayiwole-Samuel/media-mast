// ─────────────────────────────────────────────────────────────
// VALIDATION ERROR RESPONSES (E13)
//
// One 400 shape for request validation failures:
//
//   {
//     success: false,
//     message: "<first problem>",          ← always present (the frontend shows it)
//     errors: ["<problem>", ...],           ← unchanged: array of strings, which
//                                              the login page and lib/api.js read
//     fieldErrors: [{ field, message }, ...] ← which field each problem is about
//   }
//
// Messages never quote submitted values or name internal models.
// ─────────────────────────────────────────────────────────────

const GENERIC_VALIDATION_MESSAGE = 'Please check the information you entered.';

const fieldError = (field, message) => ({
    field: field || null,
    message: message || GENERIC_VALIDATION_MESSAGE,
});

const sendValidationErrors = (res, fieldErrors) => {
    const list = Array.isArray(fieldErrors) && fieldErrors.length > 0
        ? fieldErrors
        : [fieldError(null, GENERIC_VALIDATION_MESSAGE)];

    return res.status(400).json({
        success: false,
        message: list[0].message,
        errors: list.map((item) => item.message),
        fieldErrors: list,
    });
};

// ── Joi ──
// Pass as validate() options: unquoted labels, and generic text for Joi
// defaults that would otherwise quote the submitted value. Schema-level
// custom messages still take precedence.
const JOI_VALIDATE_OPTIONS = {
    errors: { wrap: { label: false } },
    messages: {
        'string.pattern.base': '{{#label}} is invalid',
        'string.pattern.name': '{{#label}} is invalid',
        'string.pattern.invert.base': '{{#label}} is invalid',
        'string.pattern.invert.name': '{{#label}} is invalid',
    },
};

const joiFieldErrors = (joiError) =>
    (joiError?.details || []).map((detail) =>
        fieldError(
            Array.isArray(detail.path) && detail.path.length ? detail.path.join('.') : null,
            String(detail.message || '').replace(/"/g, '')
        ));

// ── Mongoose ValidationError ──
// Schema-defined messages (e.g. "Please enter a valid email") are kept.
// Mongoose's built-in messages quote the value ("Path `x` (`abc`) is
// shorter…", "`abc` is not a valid enum value for path `x`."). Every
// built-in template (mongoose.Error.messages) wraps the path in backticks
// and the schemas' own messages never do, so a backtick marks a built-in
// message, which is replaced by neutral per-kind text. (In Mongoose 9 the
// error only carries the rendered text, not the template.)
const isMongooseBuiltInMessage = (message) =>
    typeof message !== 'string' || message.includes('`') || message.includes('{VALUE}');

const KIND_MESSAGES = {
    required: (f) => `${f} is required`,
    enum: (f) => `${f} has an unsupported value`,
    minlength: (f) => `${f} is too short`,
    maxlength: (f) => `${f} is too long`,
    min: (f) => `${f} is too small`,
    max: (f) => `${f} is too large`,
};

const safeMongooseMessage = (item) => {
    const field = item.path || 'value';

    if (item.name === 'CastError') {
        return `${field} has an invalid value`;
    }

    if (!isMongooseBuiltInMessage(item.message)) {
        return item.message;
    }

    return (KIND_MESSAGES[item.kind] || ((f) => `${f} is invalid`))(field);
};

const mongooseFieldErrors = (validationError) =>
    Object.values(validationError?.errors || {}).map((item) =>
        fieldError(item.path || null, safeMongooseMessage(item)));

module.exports = {
    GENERIC_VALIDATION_MESSAGE,
    JOI_VALIDATE_OPTIONS,
    fieldError,
    sendValidationErrors,
    joiFieldErrors,
    mongooseFieldErrors,
};
