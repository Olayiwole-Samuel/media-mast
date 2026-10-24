const Joi = require('joi');
const { fieldRules } = require('./settings.validator');

const {
    NO_CONTROL_CHARS_MULTILINE,
    singleLine,
    clearable,
    httpUrl,
    currency,
    validateCompanyFields,
    PATTERN_MESSAGE,
} = fieldRules;

// ─────────────────────────────────────────────────────────────
// STATION PROFILE (PUT /api/v1/station-portal/stations/:id)
//
// What a station may edit about its own listing: how it presents itself,
// its rate and whether it is taking bookings. Name, type, slug, owner,
// approval and active state stay with Media Masters admins, so they are
// rejected like any unknown key. Every field is optional.
// ─────────────────────────────────────────────────────────────

const tagList = Joi.array().items(singleLine(50).min(1)).max(20).unique();

const stationProfileSchema = Joi.object({
    description: clearable(Joi.string().trim().max(2000)
        .pattern(NO_CONTROL_CHARS_MULTILINE, 'no control characters')),
    phone: clearable(Joi.string().trim().pattern(/^[0-9+\-\s()]{10,15}$/).messages({
        'string.pattern.base': 'Please enter a valid phone number',
    })),
    email: clearable(Joi.string().trim().lowercase().max(254).email().messages({
        'string.email': 'Please enter a valid email',
    })),
    website: clearable(httpUrl),
    logo: clearable(httpUrl),
    coverImage: clearable(httpUrl),
    location: Joi.object({
        address: clearable(singleLine(200)),
        city: clearable(singleLine(100)),
        state: clearable(singleLine(100)),
    }).unknown(false),
    advertisingFormats: tagList.messages({ 'array.unique': 'Advertising formats must be unique' }),
    features: tagList.messages({ 'array.unique': 'Features must be unique' }),
    reach: clearable(singleLine(200)),
    pricing: Joi.object({
        amount: Joi.number().greater(0).max(1e9).required().messages({
            'number.base': 'Price must be a number',
            'number.greater': 'Price must be greater than 0',
            'any.required': 'Price is required',
        }),
        currency: currency.default('NGN'),
        unit: Joi.string().trim().uppercase().valid('DAY', 'WEEK', 'MONTH', 'CAMPAIGN', 'SPOT', 'IMPRESSION', 'CUSTOM').default('SPOT').messages({
            'any.only': 'Price unit must be DAY, WEEK, MONTH, CAMPAIGN, SPOT, IMPRESSION or CUSTOM',
        }),
    }).unknown(false),
    // Pause or resume bookings. MAINTENANCE stays an admin decision.
    inventoryStatus: Joi.string().trim().uppercase().valid('AVAILABLE', 'BOOKED', 'UNAVAILABLE').messages({
        'any.only': 'Availability must be AVAILABLE, BOOKED or UNAVAILABLE',
    }),
}).unknown(false).min(1).messages({
    'object.unknown': '{{#label}} cannot be changed from the station portal',
    'object.min': 'No changes were provided',
    ...PATTERN_MESSAGE,
});

const validateStationProfile = (body) => {
    const check = validateCompanyFields(stationProfileSchema, body, {
        bodyLabel: 'Station details',
        unknownSuffix: 'cannot be changed from the station portal',
    });

    if (check.value) {
        for (const field of ['description', 'phone', 'email', 'website', 'logo', 'coverImage', 'reach']) {
            if (check.value[field] === '') check.value[field] = null;
        }
        if (check.value.location) {
            for (const field of ['address', 'city', 'state']) {
                if (check.value.location[field] === '') check.value.location[field] = null;
            }
        }
    }

    return check;
};

// ─────────────────────────────────────────────────────────────
// STATION CALENDAR
// ─────────────────────────────────────────────────────────────

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
const minutes = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

const timeWindow = Joi.object({
    start: Joi.string().pattern(HHMM).required().messages({ 'string.pattern.base': 'Use HH:mm for times', 'any.required': 'Start time is required' }),
    end: Joi.string().pattern(HHMM).required().messages({ 'string.pattern.base': 'Use HH:mm for times', 'any.required': 'End time is required' }),
}).unknown(false).custom((value, helpers) => (
    minutes(value.start) < minutes(value.end) ? value : helpers.message('The end time must be after the start time')
));

const airtimeSchema = Joi.object({
    airtimeHours: Joi.object(Object.fromEntries(WEEKDAYS.map((d) => [d, timeWindow.allow(null)]))).unknown(false).required().messages({
        'object.unknown': '{{#label}} is not a weekday (use MONDAY … SUNDAY)',
        'any.required': 'airtimeHours is required',
    }),
}).unknown(false);

const validateAirtime = (body) => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return { errors: [{ field: null, message: 'Airtime details must be a JSON object' }] };
    }
    const { error, value } = airtimeSchema.validate(body, { abortEarly: false, convert: true, errors: { wrap: { label: false } } });
    return error
        ? { errors: error.details.map((d) => ({ field: d.path.join('.') || null, message: String(d.message).replace(/"/g, '') })) }
        : { value };
};

const blackoutSchema = Joi.object({
    startDate: Joi.string().pattern(DATE_ONLY).required().messages({ 'string.pattern.base': 'Use YYYY-MM-DD for dates', 'any.required': 'Start date is required' }),
    endDate: Joi.string().pattern(DATE_ONLY).messages({ 'string.pattern.base': 'Use YYYY-MM-DD for dates' }),
    startTime: Joi.string().pattern(HHMM).messages({ 'string.pattern.base': 'Use HH:mm for times' }),
    endTime: Joi.string().pattern(HHMM).messages({ 'string.pattern.base': 'Use HH:mm for times' }),
    reason: Joi.string().trim().uppercase().valid('OFF_AIR', 'MAINTENANCE', 'HOLIDAY', 'FULLY_BOOKED', 'OTHER').default('OTHER').messages({
        'any.only': 'Reason must be OFF_AIR, MAINTENANCE, HOLIDAY, FULLY_BOOKED or OTHER',
    }),
    note: clearable(Joi.string().trim().max(500).pattern(NO_CONTROL_CHARS_MULTILINE, 'no control characters')),
    cancelAffected: Joi.boolean().default(false),
}).unknown(false).and('startTime', 'endTime').messages({
    'object.unknown': '{{#label}} cannot be set here',
    'object.and': 'Give both a start and an end time, or neither for the whole day',
    ...PATTERN_MESSAGE,
});

const validateBlackout = (body, todayDateOnly) => {
    const check = validateCompanyFields(blackoutSchema, body, {
        bodyLabel: 'Blocked period',
        unknownSuffix: 'cannot be set here',
    });
    if (check.errors) return check;

    const v = check.value;
    v.endDate = v.endDate || v.startDate;
    const errors = [];
    const valid = (d) => !Number.isNaN(new Date(`${d}T00:00:00.000Z`).getTime()) && new Date(`${d}T00:00:00.000Z`).toISOString().slice(0, 10) === d;

    if (!valid(v.startDate)) errors.push({ field: 'startDate', message: 'Start date is not a real date' });
    if (!valid(v.endDate)) errors.push({ field: 'endDate', message: 'End date is not a real date' });
    if (!errors.length) {
        if (v.endDate < v.startDate) errors.push({ field: 'endDate', message: 'The end date must be on or after the start date' });
        if (v.endDate < todayDateOnly) errors.push({ field: 'endDate', message: 'This period is already over' });
        const days = (new Date(`${v.endDate}T00:00:00Z`) - new Date(`${v.startDate}T00:00:00Z`)) / 864e5;
        if (days > 366) errors.push({ field: 'endDate', message: 'A blocked period can be at most one year long' });
    }
    if (v.startTime && v.endTime && minutes(v.startTime) >= minutes(v.endTime)) {
        errors.push({ field: 'endTime', message: 'The end time must be after the start time' });
    }
    if (v.note === '') v.note = null;

    return errors.length ? { errors } : { value: v };
};

// ── Rate card (PUT /station-portal/stations/:id/rate-card) ──
// TIME_BELT (TV/radio): a belt with start/end time, e.g. AAA 19:00–22:00.
// PLACEMENT (press, billboard, digital): a size/position, e.g. full page colour.
const MAX_RATES = 40;
const rateSchema = Joi.object({
    _id: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).messages({ 'string.pattern.base': 'Invalid rate id' }),
    name: Joi.string().trim().min(1).max(80).pattern(/^[^\u0000-\u001F\u007F]*$/, 'no control characters').required().messages({ 'any.required': 'Each rate needs a name', 'string.empty': 'Each rate needs a name' }),
    kind: Joi.string().trim().uppercase().valid('TIME_BELT', 'PLACEMENT').required().messages({ 'any.only': 'Kind must be TIME_BELT or PLACEMENT', 'any.required': 'Each rate needs a kind' }),
    code: Joi.string().trim().uppercase().max(30).pattern(/^[A-Z0-9_ -]+$/).allow(null, '').messages({ 'string.pattern.base': 'Code can use letters, numbers, spaces, - and _' }),
    startTime: Joi.string().pattern(HHMM).allow(null).messages({ 'string.pattern.base': 'Use HH:mm for times' }),
    endTime: Joi.string().pattern(HHMM).allow(null).messages({ 'string.pattern.base': 'Use HH:mm for times' }),
    spotSeconds: Joi.number().integer().min(1).max(3600).allow(null).messages({ 'number.base': 'Spot length must be a number of seconds' }),
    size: Joi.string().trim().max(40).allow(null, ''),
    colour: Joi.string().trim().uppercase().valid('COLOUR', 'BLACK_WHITE').allow(null, ''),
    price: Joi.number().greater(0).max(1e10).required().messages({ 'number.greater': 'Each rate needs a price above 0', 'any.required': 'Each rate needs a price' }),
    isActive: Joi.boolean().default(true),
}).unknown(false).custom((v, helpers) => {
    if (v.kind === 'TIME_BELT') {
        if (!v.startTime || !v.endTime) return helpers.message('A time belt needs a start and an end time');
        if (v.startTime === v.endTime) return helpers.message('A time belt cannot start and end at the same time');
    }
    return v;
});
const rateCardSchema = Joi.object({
    rates: Joi.array().items(rateSchema).max(MAX_RATES).required().messages({ 'array.max': `A rate card can have at most ${MAX_RATES} rates`, 'any.required': 'Send the rates as a list' }),
}).unknown(false).messages({ 'object.unknown': '{{#label}} cannot be set here' });

const validateRateCard = (body) => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return { errors: [{ field: null, message: 'Rate card must be a JSON object' }] };
    }
    const { error, value } = rateCardSchema.validate(body, { abortEarly: false, convert: true, errors: { wrap: { label: false } } });
    if (error) {
        return { errors: error.details.map((d) => ({ field: d.path.join('.') || null, message: String(d.message).replace(/"/g, '') })) };
    }
    const names = value.rates.map((r) => r.name.toLowerCase());
    const dup = names.find((n, i) => names.indexOf(n) !== i);
    if (dup) return { errors: [{ field: 'rates', message: 'Each rate needs its own name' }] };
    return {
        value: {
            rates: value.rates.map((r) => ({
                ...(r._id ? { _id: r._id } : {}),
                name: r.name,
                kind: r.kind,
                code: r.code || null,
                startTime: r.kind === 'TIME_BELT' ? r.startTime : null,
                endTime: r.kind === 'TIME_BELT' ? r.endTime : null,
                spotSeconds: r.kind === 'TIME_BELT' ? (r.spotSeconds ?? null) : null,
                size: r.kind === 'PLACEMENT' ? (r.size || null) : null,
                colour: r.kind === 'PLACEMENT' ? (r.colour || null) : null,
                price: r.price,
                isActive: r.isActive,
            })),
        },
    };
};

module.exports = {
    validateRateCard,
    validateStationProfile,
    validateAirtime,
    validateBlackout,
};
