const Joi = require('joi');
const {
    JOI_VALIDATE_OPTIONS,
    joiFieldErrors,
    sendValidationErrors,
} = require('../utils/validationResponse');

// ── Shared password rule (registration, change, reset, invitation) ──
const passwordRule = () => Joi.string()
    .min(8)
    .pattern(/[A-Z]/, 'uppercase')
    .pattern(/[a-z]/, 'lowercase')
    .pattern(/[0-9]/, 'number')
    .pattern(/[^A-Za-z0-9]/, 'special character')
    .required()
    .messages({
        'string.min': 'Password must be at least 8 characters',
        // Named patterns report 'string.pattern.name'; Joi's default text
        // for it quotes the submitted value, i.e. the password itself.
        'string.pattern.name': 'Password must contain at least one {#name}',
        'string.pattern.base': 'Password must contain at least one {#name}',
        'any.required': 'Password is required',
    });

// ── Register Validation Schema ──
const registerSchema = Joi.object({
    accountType: Joi.string()
        .valid('individual', 'company')
        .required()
        .messages({
            'any.only': 'Account type must be either "individual" or "company"',
            'any.required': 'Account type is required',
        }),
    email: Joi.string()
        .email()
        .required()
        .lowercase()
        .trim()
        .messages({
            'string.email': 'Please enter a valid email address',
            'any.required': 'Email is required',
        }),
    password: passwordRule(),
    name: Joi.string()
        .when('accountType', {
            is: Joi.string().valid('individual', 'company'),
            then: Joi.string().required().trim().min(1).max(100),
            otherwise: Joi.string().optional().allow(''),
        })
        .messages({
            'any.required': 'Full name is required',
            'string.empty': 'Full name cannot be empty',
        }),
    companyName: Joi.string()
        .when('accountType', {
            is: 'company',
            then: Joi.string().required().trim().min(1).max(100),
            otherwise: Joi.string().optional().allow(''),
        })
        .messages({
            'any.required': 'Company name is required',
            'string.empty': 'Company name cannot be empty',
        }),
    phone: Joi.string()
        .optional()
        .allow('')
        .pattern(/^[0-9+\-\s()]{10,15}$/)
        .messages({
            'string.pattern.base': 'Please enter a valid phone number',
        }),
});

// ── Login Validation Schema ──
const loginSchema = Joi.object({
    email: Joi.string()
        .email()
        .required()
        .lowercase()
        .trim()
        .messages({
            'string.email': 'Please enter a valid email address',
            'any.required': 'Email is required',
        }),
    password: Joi.string()
        .required()
        .messages({
            'any.required': 'Password is required',
        }),
});

// ── Validation Middleware ──
const validateRegister = (req, res, next) => {
    console.log('🔍 Validating registration request:', {
        accountType: req.body.accountType,
        email: req.body.email,
        name: req.body.name,
    });

    const { error, value } = registerSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
        ...JOI_VALIDATE_OPTIONS,
    });

    if (error) {
        const fieldErrors = joiFieldErrors(error);
        console.log('❌ Validation errors:', fieldErrors.map(e => e.message));
        return sendValidationErrors(res, fieldErrors);
    }

    // Attach validated data to request
    req.validatedBody = value;
    next();
};

const validateLogin = (req, res, next) => {
    const { error, value } = loginSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
        ...JOI_VALIDATE_OPTIONS,
    });

    if (error) {
        return sendValidationErrors(res, joiFieldErrors(error));
    }

    req.validatedBody = value;
    next();
};

// ── Password lifecycle schemas ──
const changePasswordSchema = Joi.object({
    currentPassword: Joi.string().required().messages({
        'any.required': 'Current password is required',
    }),
    newPassword: passwordRule().messages({
        'any.required': 'New password is required',
    }),
});

const forgotPasswordSchema = Joi.object({
    email: Joi.string().email().required().lowercase().trim().messages({
        'string.email': 'Please enter a valid email address',
        'any.required': 'Email is required',
    }),
});

const resetPasswordSchema = Joi.object({
    token: Joi.string().trim().max(200).required().messages({
        'any.required': 'Reset token is required',
    }),
    password: passwordRule(),
});

// Only these fields are read; anything else (companyId, permissions,
// accountType, ...) is stripped and comes from the invitation record.
const acceptInviteSchema = Joi.object({
    token: Joi.string().trim().max(200).required().messages({
        'any.required': 'Invitation token is required',
    }),
    name: Joi.string().trim().min(1).max(100).optional(),
    password: passwordRule(),
});

const validateWith = (schema) => (req, res, next) => {
    const { error, value } = schema.validate(req.body || {}, {
        abortEarly: false,
        stripUnknown: true,
        ...JOI_VALIDATE_OPTIONS,
    });

    if (error) {
        return sendValidationErrors(res, joiFieldErrors(error));
    }

    req.validatedBody = value;
    next();
};

module.exports = {
    // Shared with the admin company-creation validator (same owner password rule).
    passwordRule,
    validateRegister,
    validateLogin,
    validateChangePassword: validateWith(changePasswordSchema),
    validateForgotPassword: validateWith(forgotPasswordSchema),
    validateResetPassword: validateWith(resetPasswordSchema),
    validateAcceptInvite: validateWith(acceptInviteSchema),
};