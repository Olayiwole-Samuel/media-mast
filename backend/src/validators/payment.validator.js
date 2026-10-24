const Joi = require('joi');
const {
    JOI_VALIDATE_OPTIONS,
    fieldError,
    joiFieldErrors,
} = require('../utils/validationResponse');

// ─────────────────────────────────────────────────────────────
// CHECKOUT (POST /api/v1/payments/checkout)
//
// One campaign and a cart of 1–20 spots, possibly across many stations.
// Only the shape is checked here; the booking rules (date not in the past,
// within the campaign, station bookable, no conflicts) are the ones
// createBooking uses, applied per item by the controller. Price and
// currency are never accepted from the client: they come from the
// station records, so they are rejected like any unknown key.
// ─────────────────────────────────────────────────────────────

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
const MAX_CART_ITEMS = 20;

const itemSchema = Joi.object({
    stationId: Joi.string().trim().pattern(OBJECT_ID).required().messages({
        'any.required': 'Each item needs a station',
        'string.pattern.base': 'Invalid station ID',
    }),
    slot: Joi.string().trim().min(1).max(50).required().messages({
        'any.required': 'Each item needs a slot',
    }),
    date: Joi.string().trim().max(40).required().messages({
        'any.required': 'Each item needs a date',
    }),
    time: Joi.string().trim().pattern(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/).required().messages({
        'any.required': 'Each item needs a start time',
        'string.pattern.base': 'Invalid time. Use HH:mm format.',
    }),
    // A rate from the station's rate card (required when it has one).
    rateId: Joi.string().trim().pattern(OBJECT_ID).allow(null).optional().messages({
        'string.pattern.base': 'Invalid rate',
    }),
    duration: Joi.number().integer().min(1).max(24 * 60).required().messages({
        'any.required': 'Each item needs a duration',
        'number.base': 'Duration must be a whole number of minutes greater than 0',
        'number.integer': 'Duration must be a whole number of minutes greater than 0',
        'number.min': 'Duration must be a whole number of minutes greater than 0',
        'number.max': 'Duration must be a whole number of minutes greater than 0',
    }),
}).unknown(false);

const checkoutSchema = Joi.object({
    campaignId: Joi.string().trim().pattern(OBJECT_ID).required().messages({
        'any.required': 'Choose the campaign these bookings are for',
        'string.pattern.base': 'Invalid campaign ID',
    }),
    items: Joi.array().items(itemSchema).min(1).max(MAX_CART_ITEMS).required().messages({
        'any.required': 'Your cart is empty',
        'array.base': 'Items must be a list',
        'array.min': 'Your cart is empty',
        'array.max': `A checkout can include at most ${MAX_CART_ITEMS} items`,
    }),
}).unknown(false).messages({
    'object.unknown': '{{#label}} cannot be set at checkout',
    'string.pattern.name': '{{#label}} is invalid',
});

const DANGEROUS_KEYS = ['__proto__', 'constructor', 'prototype'];

const validateCheckout = (body) => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return { errors: [fieldError(null, 'Checkout details must be a JSON object')] };
    }

    const dangerous = Object.keys(body).filter((key) => DANGEROUS_KEYS.includes(key));
    if (dangerous.length) {
        return { errors: dangerous.map((key) => fieldError(key, `${key} cannot be set at checkout`)) };
    }

    const { error, value } = checkoutSchema.validate(body, {
        abortEarly: false,
        convert: true,
        ...JOI_VALIDATE_OPTIONS,
    });

    return error ? { errors: joiFieldErrors(error) } : { value };
};

module.exports = {
    validateCheckout,
    MAX_CART_ITEMS,
};
