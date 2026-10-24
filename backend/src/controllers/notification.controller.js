const crypto = require('crypto');
const Joi = require('joi');
const mongoose = require('mongoose');

const Notification = require('../models/Notification');
const User = require('../models/User');
const { runReminders } = require('../utils/reminders');
const { sendValidationErrors, joiFieldErrors } = require('../utils/validationResponse');

// The 36 states and the FCT (for "new station in my area" alerts).
const NIGERIAN_STATES = [
    'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno', 'Cross River',
    'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano',
    'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo',
    'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara',
];

// ── The signed-in user's notifications (newest first) + unread count ──
const getMyNotifications = async (req, res) => {
    try {
        const userId = req.user._id || req.user.id;
        const [items, unread] = await Promise.all([
            Notification.find({ userId }).sort({ createdAt: -1 }).limit(30),
            Notification.countDocuments({ userId, readAt: null }),
        ]);
        return res.json({ success: true, data: items, unread });
    } catch (error) {
        console.error('❌ Get notifications error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to load notifications' });
    }
};

const markRead = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid notification ID' });
        const userId = req.user._id || req.user.id;
        const result = await Notification.updateOne({ _id: req.params.id, userId, readAt: null }, { $set: { readAt: new Date() } });
        if (!result.matchedCount) {
            const exists = await Notification.findOne({ _id: req.params.id, userId }).select('_id');
            if (!exists) return res.status(404).json({ success: false, message: 'Notification not found' });
        }
        return res.json({ success: true });
    } catch (error) {
        console.error('❌ Mark read error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to update the notification' });
    }
};

const markAllRead = async (req, res) => {
    try {
        const userId = req.user._id || req.user.id;
        await Notification.updateMany({ userId, readAt: null }, { $set: { readAt: new Date() } });
        return res.json({ success: true });
    } catch (error) {
        console.error('❌ Mark all read error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to update notifications' });
    }
};

// ── "Tell me about new stations" preferences ──
const getPreferences = async (req, res) => {
    try {
        const user = await User.findById(req.user._id || req.user.id).select('notifyNewStations notifyStates');
        return res.json({
            success: true,
            data: { notifyNewStations: !!user?.notifyNewStations, notifyStates: user?.notifyStates || [], states: NIGERIAN_STATES },
        });
    } catch (error) {
        console.error('❌ Get preferences error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to load preferences' });
    }
};

const prefSchema = Joi.object({
    notifyNewStations: Joi.boolean().required(),
    notifyStates: Joi.array().items(Joi.string().valid(...NIGERIAN_STATES)).max(NIGERIAN_STATES.length).unique().default([])
        .messages({ 'any.only': 'Choose states from the list' }),
}).unknown(false);

const updatePreferences = async (req, res) => {
    const { error, value } = prefSchema.validate(req.body || {}, { abortEarly: false });
    if (error) return sendValidationErrors(res, joiFieldErrors(error));
    try {
        await User.updateOne({ _id: req.user._id || req.user.id }, { $set: value });
        return res.json({ success: true, message: 'Preferences saved', data: value });
    } catch (err) {
        console.error('❌ Update preferences error:', err.name, err.message);
        return res.status(500).json({ success: false, message: 'Failed to save preferences' });
    }
};

// ── Cron: send due slot reminders. Authorization: Bearer <CRON_SECRET> ──
const runReminderJob = async (req, res) => {
    const secret = process.env.CRON_SECRET || '';
    const given = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const ok = secret.length >= 16
        && given.length === secret.length
        && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(secret));
    if (!ok) return res.status(401).json({ success: false, message: 'Not authorised' });
    try {
        const result = await runReminders();
        return res.json({ success: true, data: result });
    } catch (error) {
        console.error('❌ Reminder job error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Reminder job failed' });
    }
};

module.exports = {
    NIGERIAN_STATES,
    getMyNotifications,
    markRead,
    markAllRead,
    getPreferences,
    updatePreferences,
    runReminderJob,
};
