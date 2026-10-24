const Joi = require('joi');
const {
    JOI_VALIDATE_OPTIONS,
    fieldError,
    joiFieldErrors,
} = require('../utils/validationResponse');

// ─────────────────────────────────────────────────────────────
// COMPANY SELF-SERVICE SETTINGS (PUT /api/v1/settings, owner only)
//
// Exactly the fields updateCompanySettings already allowed. Anything else
// — status, slug, subscriptionId, _id, timestamps, Mongo operators such as
// $set, or __proto__ — is rejected (unknown keys), never merged.
// Rules reuse existing conventions: company name 1–100 (registration),
// Joi email (registration), phone pattern (registration), http(s) links
// without credentials (creative links, E5), IANA timezone (default
// Africa/Lagos), ISO 4217 currency (default NGN, uppercased like admin).
// Optional text fields can be cleared with null or "".
// ─────────────────────────────────────────────────────────────

const NO_CONTROL_CHARS = /^[^\u0000-\u001F\u007F]*$/;
// Multi-line text may keep \t \n \r.
const NO_CONTROL_CHARS_MULTILINE = /^[^\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]*$/;

const singleLine = (max) => Joi.string().trim().max(max)
    .pattern(NO_CONTROL_CHARS, 'no control characters');

const clearable = (schema) => schema.allow(null, '');

const httpUrl = Joi.string().trim().max(2048).custom((value, helpers) => {
    let parsed = null;
    try {
        parsed = new URL(value);
    } catch {
        parsed = null;
    }
    if (!parsed || !['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) {
        return helpers.message('{{#label}} must be a valid http(s) link');
    }
    if (parsed.username || parsed.password) {
        return helpers.message('{{#label}} must not contain a username or password');
    }
    return value;
});

const timezone = Joi.string().trim().max(64).custom((value, helpers) => {
    try {
        new Intl.DateTimeFormat('en', { timeZone: value });
        return value;
    } catch {
        return helpers.message('{{#label}} must be a valid IANA time zone (e.g. Africa/Lagos)');
    }
});

const CURRENCIES = new Set(Intl.supportedValuesOf('currency'));
const currency = Joi.string().trim().uppercase().length(3).custom((value, helpers) => (
    CURRENCIES.has(value) ? value : helpers.message('{{#label}} must be an ISO 4217 currency code (e.g. NGN)')
));

// Field rules shared by the owner settings endpoint and the admin company
// update endpoint (PATCH /admin/companies/:id).
const companyProfileFields = {
    name: singleLine(100).min(1).messages({
        'string.empty': 'Company name cannot be empty',
        'string.min': 'Company name cannot be empty',
    }),
    email: Joi.string().trim().lowercase().max(254).email().messages({
        'string.empty': 'Company email cannot be empty',
        'string.email': 'Please enter a valid company email',
    }),
    phone: clearable(Joi.string().trim().pattern(/^[0-9+\-\s()]{10,15}$/).messages({
        'string.pattern.base': 'Please enter a valid phone number',
    })),
    logo: clearable(httpUrl),
    website: clearable(httpUrl),
    description: clearable(Joi.string().trim().max(2000)
        .pattern(NO_CONTROL_CHARS_MULTILINE, 'no control characters')),
    address: clearable(singleLine(200)),
    city: clearable(singleLine(100)),
    state: clearable(singleLine(100)),
    country: clearable(singleLine(100)),
    timezone,
    currency,
};

// Joi's default text for named patterns quotes the submitted value.
const PATTERN_MESSAGE = { 'string.pattern.name': '{{#label}} contains invalid characters' };

const companySettingsSchema = Joi.object(companyProfileFields).unknown(false).messages({
    'object.unknown': '{{#label}} cannot be changed through company settings',
    ...PATTERN_MESSAGE,
});

// ── Admin company update ──
// Same profile rules, plus the admin-only slug (format produced by
// generateSlug: lowercase letters/digits, single hyphens). Admins could
// already clear timezone/currency (null), so that stays allowed.
// Status/approval, subscription, ownership and ids have their own admin
// endpoints and are not accepted here.
const COMPANY_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const adminCompanyUpdateSchema = Joi.object({
    ...companyProfileFields,
    slug: Joi.string().trim().lowercase().min(1).max(100).pattern(COMPANY_SLUG).messages({
        'string.empty': 'Company slug cannot be empty',
        'string.min': 'Company slug cannot be empty',
        'string.pattern.base': 'Slug may only contain lowercase letters, numbers and single hyphens',
    }),
    timezone: timezone.allow(null),
    currency: currency.allow(null),
}).unknown(false).messages({
    'object.unknown': '{{#label}} cannot be changed through this endpoint',
    ...PATTERN_MESSAGE,
});

const CLEARABLE_FIELDS = ['phone', 'logo', 'website', 'description', 'address', 'city', 'state', 'country'];

// JSON.parse keeps these as own keys; Joi would silently drop them, but they
// are refused outright so nothing prototype-shaped is ever merged.
const DANGEROUS_KEYS = ['__proto__', 'constructor', 'prototype'];

// Returns { errors: [{ field, message }] } or { value } with "" normalised
// to null for clearable fields.
const validateCompanyFields = (schema, body, { bodyLabel, unknownSuffix }) => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return { errors: [fieldError(null, `${bodyLabel} must be a JSON object`)] };
    }

    const dangerous = Object.keys(body).filter((key) => DANGEROUS_KEYS.includes(key));
    if (dangerous.length > 0) {
        return { errors: dangerous.map((key) => fieldError(key, `${key} ${unknownSuffix}`)) };
    }

    const { error, value } = schema.validate(body, {
        abortEarly: false,
        convert: true,
        ...JOI_VALIDATE_OPTIONS,
    });

    if (error) {
        return { errors: joiFieldErrors(error) };
    }

    for (const field of CLEARABLE_FIELDS) {
        if (value[field] === '') value[field] = null;
    }

    return { value };
};

const validateCompanySettings = (body) => validateCompanyFields(companySettingsSchema, body, {
    bodyLabel: 'Settings',
    unknownSuffix: 'cannot be changed through company settings',
});

const validateAdminCompanyUpdate = (body) => validateCompanyFields(adminCompanyUpdateSchema, body, {
    bodyLabel: 'Company update',
    unknownSuffix: 'cannot be changed through this endpoint',
});

// ── Admin company creation (POST /admin/companies) ──
// Exactly the fields createCompany already read. name, email and the
// owner's password are required; the password follows the registration
// rule. slug (generated), status (always PENDING), subscription and
// ownership are server-set, so they are rejected like any unknown key.
// Empty country/timezone/currency fall back to the existing defaults in
// the controller.
const { passwordRule } = require('./auth.validator');

const adminCompanyCreateSchema = Joi.object({
    name: companyProfileFields.name.required().messages({
        'any.required': 'Company name is required',
    }),
    email: companyProfileFields.email.required().messages({
        'any.required': 'Company email is required',
    }),
    password: passwordRule(),
    phone: companyProfileFields.phone,
    logo: companyProfileFields.logo,
    website: companyProfileFields.website,
    description: companyProfileFields.description,
    address: companyProfileFields.address,
    city: companyProfileFields.city,
    state: companyProfileFields.state,
    country: companyProfileFields.country,
    timezone: timezone.allow(null, ''),
    currency: currency.allow(null, ''),
}).unknown(false).messages({
    'object.unknown': '{{#label}} cannot be set when creating a company',
    ...PATTERN_MESSAGE,
});

const validateAdminCompanyCreate = (body) => validateCompanyFields(adminCompanyCreateSchema, body, {
    bodyLabel: 'Company details',
    unknownSuffix: 'cannot be set when creating a company',
});

// ── Admin worker creation (POST /admin/companies/:id/workers) ──
// Exactly the fields createCompanyWorker already read, plus phone: the admin
// create page sends it, but no model stores it, so it is checked and ignored
// as before. The temporary password follows the registration rule. As on the
// company side (invitations, role updates), a worker is never made Company
// Owner and never given ALL_ACCESS; permissions must be known and unique.
// Empty position/departmentId/image fall back to the controller defaults.
const { PERMISSIONS } = require('../utils/permissions');

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

const KNOWN_PERMISSIONS = new Set(Object.values(PERMISSIONS));

const workerPermission = Joi.string()
    .custom((value, helpers) => {
        if (value === PERMISSIONS.ALL_ACCESS) {
            return helpers.message('ALL_ACCESS can only be assigned to the Company Owner');
        }
        return KNOWN_PERMISSIONS.has(value)
            ? value
            : helpers.message('One or more permissions are invalid');
    })
    .messages({
        'string.base': 'Each permission must be text',
    });

const workerPosition = singleLine(100).custom((value, helpers) => (
    value.toLowerCase() === 'company owner'
        ? helpers.message('Company Owner cannot be assigned to a worker')
        : value
));

const adminWorkerCreateSchema = Joi.object({
    name: singleLine(100).min(1).required().messages({
        'any.required': 'Worker name is required',
        'string.empty': 'Worker name is required',
        'string.min': 'Worker name is required',
    }),
    email: Joi.string().trim().lowercase().max(254).email().required().messages({
        'any.required': 'Worker email is required',
        'string.empty': 'Worker email is required',
        'string.email': 'Please enter a valid email',
    }),
    password: passwordRule(),
    position: clearable(workerPosition),
    departmentId: clearable(Joi.string().trim().pattern(OBJECT_ID).messages({
        'string.pattern.base': 'Invalid department ID',
    })),
    permissions: Joi.array().items(workerPermission).unique().messages({
        'array.base': 'Permissions must be an array',
        'array.unique': 'Duplicate permissions are not allowed',
    }),
    image: clearable(httpUrl),
    phone: companyProfileFields.phone,
}).unknown(false).messages({
    'object.unknown': '{{#label}} cannot be set when creating a worker',
    ...PATTERN_MESSAGE,
});

const validateAdminWorkerCreate = (body) => {
    const check = validateCompanyFields(adminWorkerCreateSchema, body, {
        bodyLabel: 'Worker details',
        unknownSuffix: 'cannot be set when creating a worker',
    });

    if (check.value) {
        for (const field of ['position', 'departmentId', 'image']) {
            if (check.value[field] === '') check.value[field] = null;
        }
    }

    return check;
};

// ── Admin worker update (PATCH /admin/companies/:id/workers/:workerId) ──
// Exactly the fields updateCompanyWorker already read, all optional, with
// the same position/permission rules as creation. Name, email and position
// cannot be emptied (as before); phone, image and departmentId can be
// cleared with null or "". Status, password, account type and ownership
// have their own endpoints and are rejected like any unknown key.
const adminWorkerUpdateSchema = Joi.object({
    name: singleLine(100).min(1).messages({
        'string.empty': 'Worker name cannot be empty',
        'string.min': 'Worker name cannot be empty',
    }),
    email: Joi.string().trim().lowercase().max(254).email().messages({
        'string.empty': 'Worker email cannot be empty',
        'string.email': 'Please enter a valid email',
    }),
    phone: companyProfileFields.phone,
    position: workerPosition.min(1).messages({
        'string.empty': 'Position cannot be empty',
        'string.min': 'Position cannot be empty',
    }),
    departmentId: clearable(Joi.string().trim().pattern(OBJECT_ID).messages({
        'string.pattern.base': 'Invalid department ID',
    })),
    permissions: Joi.array().items(workerPermission).unique().messages({
        'array.base': 'Permissions must be an array',
        'array.unique': 'Duplicate permissions are not allowed',
    }),
    image: clearable(httpUrl),
}).unknown(false).messages({
    'object.unknown': '{{#label}} cannot be changed through this endpoint',
    ...PATTERN_MESSAGE,
});

const validateAdminWorkerUpdate = (body) => {
    const check = validateCompanyFields(adminWorkerUpdateSchema, body, {
        bodyLabel: 'Worker update',
        unknownSuffix: 'cannot be changed through this endpoint',
    });

    if (check.value) {
        for (const field of ['departmentId', 'image']) {
            if (check.value[field] === '') check.value[field] = null;
        }
    }

    return check;
};

const logoSchema = httpUrl.required().label('Logo URL').messages({
    'any.required': 'Logo URL is required',
    'string.empty': 'Logo URL is required',
});

const validateLogo = (logo) => {
    const { error, value } = logoSchema.validate(logo, { convert: true, ...JOI_VALIDATE_OPTIONS });
    return error ? { errors: joiFieldErrors(error).slice(0, 1).map((e) => ({ ...e, field: 'logo' })) } : { value };
};

module.exports = {
    validateCompanySettings,
    validateAdminCompanyUpdate,
    validateAdminCompanyCreate,
    validateAdminWorkerCreate,
    validateAdminWorkerUpdate,
    validateLogo,
    // Field rules reused by the station portal validator.
    fieldRules: {
        NO_CONTROL_CHARS_MULTILINE,
        singleLine,
        clearable,
        httpUrl,
        currency,
        validateCompanyFields,
        PATTERN_MESSAGE,
    },
};
