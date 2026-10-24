const mongoose = require('mongoose');
const Joi = require('joi');

const User = require('../models/User');
const Station = require('../models/Station');
const AuditLog = require('../models/AuditLog');
const { passwordRule } = require('../validators/auth.validator');
const { notifyStationManagerCreated } = require('../utils/notifications');
const {
    JOI_VALIDATE_OPTIONS,
    fieldError,
    joiFieldErrors,
    sendValidationErrors,
    mongooseFieldErrors,
} = require('../utils/validationResponse');

// ─────────────────────────────────────────────────────────────
// STATION MANAGERS (admin only)
//
// Station managers are Media Masters staff (or, later, a station's own
// staff) who run the station desk for the stations they are assigned to:
// booking requests, prices and the station calendar. They are STATION
// accounts, created only here — there is no public station sign-up — and
// they cannot reach any other admin area.
// ─────────────────────────────────────────────────────────────

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
const NO_CONTROL_CHARS = /^[^\u0000-\u001F\u007F]*$/;

const stationIdList = Joi.array()
    .items(Joi.string().trim().pattern(OBJECT_ID).messages({ 'string.pattern.base': 'Invalid station ID' }))
    .unique()
    .max(100)
    .messages({ 'array.unique': 'Each station can only be listed once' });

const createSchema = Joi.object({
    name: Joi.string().trim().min(1).max(100).pattern(NO_CONTROL_CHARS, 'no control characters').required().messages({
        'any.required': 'Name is required',
        'string.empty': 'Name is required',
    }),
    email: Joi.string().trim().lowercase().max(254).email().required().messages({
        'any.required': 'Email is required',
        'string.email': 'Please enter a valid email',
    }),
    password: passwordRule(),
    stationIds: stationIdList.default([]),
}).unknown(false).messages({ 'object.unknown': '{{#label}} cannot be set here' });

const updateSchema = Joi.object({
    name: Joi.string().trim().min(1).max(100).pattern(NO_CONTROL_CHARS, 'no control characters').messages({
        'string.empty': 'Name cannot be empty',
    }),
    status: Joi.string().trim().uppercase().valid('ACTIVE', 'SUSPENDED').messages({
        'any.only': 'Status must be ACTIVE or SUSPENDED',
    }),
    stationIds: stationIdList,
}).unknown(false).min(1).messages({
    'object.unknown': '{{#label}} cannot be changed here',
    'object.min': 'No changes were provided',
});

const validate = (schema, body) => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return { errors: [fieldError(null, 'Details must be a JSON object')] };
    }
    const { error, value } = schema.validate(body, { abortEarly: false, convert: true, ...JOI_VALIDATE_OPTIONS });
    return error ? { errors: joiFieldErrors(error) } : { value };
};

const audit = async (req, action, entityType, entityId, metadata) => {
    try {
        await AuditLog.create({ userId: req.user._id, action, entityType, entityId, metadata });
    } catch (error) {
        console.error('⚠️ Audit log error:', error.name, error.message);
    }
};

const publicManager = (user, stations) => ({
    _id: user._id,
    name: user.name,
    email: user.email,
    status: user.status,
    mustChangePassword: user.mustChangePassword === true,
    lastLogin: user.lastLogin || null,
    createdAt: user.createdAt,
    stations: stations
        .filter((s) => (s.managerIds || []).some((id) => String(id) === String(user._id)))
        .map((s) => ({ _id: s._id, name: s.name, type: s.type })),
});

const missingStations = async (ids, session) => {
    if (!ids.length) return [];
    const found = await Station.find({ _id: { $in: ids } }).select('_id').session(session || null);
    const have = new Set(found.map((s) => String(s._id)));
    return ids.filter((id) => !have.has(String(id)));
};

class ManagerRejection extends Error {
    constructor(status, message, field) {
        super(message);
        this.name = 'ManagerRejection';
        this.status = status;
        this.field = field;
    }
}

const respondError = (res, error, fallback) => {
    if (error instanceof ManagerRejection) {
        return error.status === 400
            ? sendValidationErrors(res, [fieldError(error.field || null, error.message)])
            : res.status(error.status).json({ success: false, message: error.message });
    }
    console.error(`❌ ${fallback}:`, error.name, error.message);
    if (error.code === 11000) {
        return res.status(409).json({ success: false, message: 'A user with this email already exists' });
    }
    if (error.name === 'ValidationError') {
        return sendValidationErrors(res, mongooseFieldErrors(error));
    }
    return res.status(500).json({ success: false, message: fallback });
};

// GET /admin/station-managers
const listStationManagers = async (req, res) => {
    try {
        const users = await User.find({ accountType: 'STATION' })
            .select('name email status mustChangePassword lastLogin createdAt')
            .sort({ createdAt: -1 });
        const stations = users.length
            ? await Station.find({ managerIds: { $in: users.map((u) => u._id) } }).select('name type managerIds')
            : [];

        return res.json({ success: true, data: users.map((u) => publicManager(u, stations)) });
    } catch (error) {
        return respondError(res, error, 'Failed to load station managers');
    }
};

// POST /admin/station-managers — account + station assignments in one transaction.
const createStationManager = async (req, res) => {
    const check = validate(createSchema, req.body);
    if (check.errors) return sendValidationErrors(res, check.errors);

    const { name, email, password, stationIds } = check.value;
    let session = null;
    let result = null;

    try {
        session = await mongoose.startSession();

        await session.withTransaction(async () => {
            result = null;

            if (await User.findOne({ email }).select('_id').session(session)) {
                throw new ManagerRejection(409, 'A user with this email already exists');
            }

            const missing = await missingStations(stationIds, session);
            if (missing.length) {
                throw new ManagerRejection(400, 'One or more stations were not found', 'stationIds');
            }

            const [user] = await User.create([{
                name,
                email,
                password, // hashed by the User pre-save hook
                accountType: 'STATION',
                status: 'ACTIVE',
                companyId: null,
                // Admin chose this password: the manager must replace it.
                mustChangePassword: true,
            }], { session });

            if (stationIds.length) {
                await Station.updateMany(
                    { _id: { $in: stationIds } },
                    { $addToSet: { managerIds: user._id } },
                    { session }
                );
            }

            result = user;
        }, {
            readConcern: { level: 'snapshot' },
            writeConcern: { w: 'majority' },
        });
    } catch (error) {
        return respondError(res, error, 'Failed to create station manager');
    } finally {
        if (session) await session.endSession().catch(() => {});
    }

    await audit(req, 'UPDATE_USER', 'USER', result._id, { event: 'CREATE_STATION_MANAGER', stations: stationIds.length });

    const stations = stationIds.length ? await Station.find({ _id: { $in: stationIds } }).select('name type managerIds') : [];
    await notifyStationManagerCreated(result, stations);
    return res.status(201).json({
        success: true,
        message: 'Station manager created',
        data: publicManager(result, stations),
    });
};

// PATCH /admin/station-managers/:id — rename, suspend/reactivate, replace assignments.
const updateStationManager = async (req, res) => {
    try {
        if (!OBJECT_ID.test(String(req.params.id))) {
            return res.status(400).json({ success: false, message: 'Invalid station manager ID' });
        }
        const user = await User.findOne({ _id: req.params.id, accountType: 'STATION' });
        if (!user) return res.status(404).json({ success: false, message: 'Station manager not found' });

        const check = validate(updateSchema, req.body);
        if (check.errors) return sendValidationErrors(res, check.errors);
        const { name, status, stationIds } = check.value;

        if (stationIds) {
            const missing = await missingStations(stationIds);
            if (missing.length) {
                return sendValidationErrors(res, [fieldError('stationIds', 'One or more stations were not found')]);
            }
        }

        if (name !== undefined) user.name = name;
        if (status !== undefined && status !== user.status) {
            user.status = status;
            // Suspending ends every session at once.
            if (status === 'SUSPENDED') user.tokenVersion = (user.tokenVersion || 0) + 1;
        }
        await user.save();

        if (stationIds) {
            await Station.updateMany({ managerIds: user._id, _id: { $nin: stationIds } }, { $pull: { managerIds: user._id } });
            if (stationIds.length) {
                await Station.updateMany({ _id: { $in: stationIds } }, { $addToSet: { managerIds: user._id } });
            }
        }

        await audit(req, status === 'SUSPENDED' ? 'SUSPEND_USER' : 'UPDATE_USER', 'USER', user._id, {
            event: 'UPDATE_STATION_MANAGER',
            fields: Object.keys(check.value),
        });

        const stations = await Station.find({ managerIds: user._id }).select('name type managerIds');
        return res.json({ success: true, message: 'Station manager updated', data: publicManager(user, stations) });
    } catch (error) {
        return respondError(res, error, 'Failed to update station manager');
    }
};

// PUT /admin/stations/:id/managers — set exactly who runs this station.
const setStationManagers = async (req, res) => {
    try {
        if (!OBJECT_ID.test(String(req.params.id))) {
            return res.status(400).json({ success: false, message: 'Invalid station ID' });
        }
        const check = validate(Joi.object({ managerIds: stationIdList.required().messages({ 'any.required': 'managerIds is required' }) }).unknown(false), req.body);
        if (check.errors) return sendValidationErrors(res, check.errors);

        const station = await Station.findById(req.params.id);
        if (!station) return res.status(404).json({ success: false, message: 'Station not found' });

        const ids = check.value.managerIds;
        if (ids.length) {
            const managers = await User.find({ _id: { $in: ids }, accountType: 'STATION' }).select('_id');
            if (managers.length !== ids.length) {
                return sendValidationErrors(res, [fieldError('managerIds', 'Every manager must be an existing station manager account')]);
            }
        }

        station.managerIds = ids;
        await station.save();

        await audit(req, 'UPDATE_STATION', 'STATION', station._id, { event: 'SET_STATION_MANAGERS', managers: ids.length });

        return res.json({ success: true, message: 'Station managers updated', data: { _id: station._id, managerIds: station.managerIds } });
    } catch (error) {
        return respondError(res, error, 'Failed to update station managers');
    }
};

module.exports = {
    listStationManagers,
    createStationManager,
    updateStationManager,
    setStationManagers,
};
