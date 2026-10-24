const Joi = require('joi');

const Plan = require('../models/Plan');
const Subscription = require('../models/Subscription');
const Campaign = require('../models/Campaign');
const User = require('../models/User');
const Company = require('../models/Company');
const AuditLog = require('../models/AuditLog');
const { getPaymentProvider, generatePaymentReference } = require('../utils/payments');
const { getDiscountTiers } = require('../utils/discounts');
const { advertiserScope } = require('../utils/advertiser');
const {
    listPlans,
    ensureDefaultPlans,
    subscriptionOwner,
    getAccess,
    addPeriod,
    publicPlan,
    publicSubscription,
    isSubscriptionRequired,
    ACTIVE_CAMPAIGN_STATUSES,
} = require('../utils/subscriptions');
const documentStorage = require('../utils/documentStorage');
const { sendValidationErrors, joiFieldErrors, fieldError } = require('../utils/validationResponse');

const audit = async (req, action, entityId, metadata) => {
    try {
        await AuditLog.create({
            userId: req.user.id,
            companyId: req.user.companyId || null,
            action,
            entityType: 'SUBSCRIPTION',
            entityId,
            metadata,
        });
    } catch (error) {
        console.error('⚠️ Audit log error:', error.name, error.message);
    }
};

// ── PUBLIC: plans + checkout discount tiers (pricing page) ──
const getPlans = async (req, res) => {
    try {
        const plans = await listPlans();
        return res.json({
            success: true,
            data: {
                plans: plans.map(publicPlan),
                discountTiers: getDiscountTiers(),
                subscriptionRequired: isSubscriptionRequired(),
            },
        });
    } catch (error) {
        console.error('❌ Get plans error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to load plans' });
    }
};

// ── ADVERTISER: current subscription, its plan and usage ──
const getMySubscription = async (req, res) => {
    try {
        const owner = subscriptionOwner(req);
        const { subscription, plan } = await getAccess(owner);
        const [activeCampaigns, storageBytes, history] = await Promise.all([
            Campaign.find({ ...advertiserScope(req), status: { $in: ACTIVE_CAMPAIGN_STATUSES } }).select('_id'),
            documentStorage.storageUsedBytes(owner),
            Subscription.find(owner),
        ]);
        return res.json({
            success: true,
            data: {
                subscription: publicSubscription(subscription),
                plan: plan ? publicPlan(plan) : null,
                usage: {
                    activeCampaigns: activeCampaigns.length,
                    storageUsedBytes: storageBytes,
                },
                history: history
                    .sort((a, b) => new Date(b.currentPeriodStart) - new Date(a.currentPeriodStart))
                    .slice(0, 12)
                    .map(publicSubscription),
                subscriptionRequired: isSubscriptionRequired(),
            },
        });
    } catch (error) {
        console.error('❌ Get subscription error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to load your subscription' });
    }
};

const subscribeSchema = Joi.object({
    planCode: Joi.string().trim().uppercase().max(30).required().messages({ 'any.required': 'Choose a plan' }),
    interval: Joi.string().trim().uppercase().valid('MONTHLY', 'ANNUAL').required().messages({
        'any.required': 'Choose monthly or annual billing',
        'any.only': 'Billing must be monthly or annual',
    }),
}).unknown(false);

// ── ADVERTISER: subscribe, or switch plan (takes effect now) ──
const subscribe = async (req, res) => {
    const { error, value } = subscribeSchema.validate(req.body || {}, { abortEarly: false });
    if (error) return sendValidationErrors(res, joiFieldErrors(error));

    try {
        await ensureDefaultPlans();
        const plan = await Plan.findOne({ code: value.planCode, isActive: true });
        if (!plan) return sendValidationErrors(res, [fieldError('planCode', 'That plan is not available')]);

        const price = value.interval === 'ANNUAL' ? plan.annualPrice : plan.monthlyPrice;
        if (price == null) {
            return res.status(400).json({
                success: false,
                code: 'PRICE_ON_REQUEST',
                message: `${plan.name} is priced on request. Contact Media Masters and we'll set it up for you.`,
            });
        }

        const owner = subscriptionOwner(req);
        const { subscription: current } = await getAccess(owner);
        if (current && current.planCode === plan.code && current.interval === value.interval && !current.cancelAtPeriodEnd) {
            return res.status(409).json({ success: false, message: `You're already on ${plan.name} (${value.interval.toLowerCase()}).` });
        }

        let provider;
        try {
            provider = getPaymentProvider();
        } catch (providerError) {
            console.error('❌ Payment provider unavailable:', providerError.code || providerError.name);
            return res.status(503).json({ success: false, message: 'Payments are not available right now. Please try again later.' });
        }

        const reference = generatePaymentReference();
        const charged = await provider.charge({ amount: price, currency: plan.currency, reference });
        if (!charged || charged.status !== 'SUCCESSFUL') {
            return res.status(402).json({ success: false, message: 'The payment was not completed. You have not been charged.' });
        }

        const now = new Date();
        let created;
        try {
            created = await Subscription.create({
                ...owner,
                planCode: plan.code,
                planName: plan.name,
                interval: value.interval,
                price,
                currency: plan.currency,
                status: 'ACTIVE',
                currentPeriodStart: now,
                currentPeriodEnd: addPeriod(now, value.interval),
                provider: provider.name,
                reference,
                providerReference: charged.providerReference || null,
                createdBy: req.user.id,
            });
        } catch (createError) {
            // Nothing saved: give the money back.
            try {
                await provider.refund({ amount: price, currency: plan.currency, providerReference: charged.providerReference, reason: 'Subscription could not be saved' });
            } catch (refundError) {
                console.error('❌ Subscription compensation refund failed:', refundError.name, refundError.message);
            }
            throw createError;
        }

        // A plan change replaces the previous subscription straight away.
        if (current) {
            await Subscription.updateOne({ _id: current._id, status: 'ACTIVE' }, { $set: { status: 'REPLACED', cancelledAt: now } });
        }

        await audit(req, 'CREATE_SUBSCRIPTION', created._id, {
            plan: plan.code, interval: value.interval, price, reference, replaced: current ? String(current._id) : null,
        });

        return res.status(201).json({
            success: true,
            message: current
                ? `You're now on ${plan.name}. It takes effect straight away.`
                : `Welcome to ${plan.name}. You can now book airtime.`,
            data: { subscription: publicSubscription(created), plan: publicPlan(plan), testMode: provider.isTestMode === true },
        });
    } catch (err) {
        console.error('❌ Subscribe error:', err.name, err.message);
        return res.status(500).json({ success: false, message: 'Subscription failed. You have not been charged.' });
    }
};

// ── ADVERTISER: stop renewal (access continues to the period end) ──
const cancelMySubscription = async (req, res) => {
    try {
        const { subscription } = await getAccess(subscriptionOwner(req));
        if (!subscription) return res.status(404).json({ success: false, message: 'You have no active subscription' });
        if (subscription.cancelAtPeriodEnd) {
            return res.status(409).json({ success: false, message: 'Your subscription is already set to end' });
        }
        await Subscription.updateOne({ _id: subscription._id }, { $set: { cancelAtPeriodEnd: true, cancelledAt: new Date() } });
        await audit(req, 'CANCEL_SUBSCRIPTION', subscription._id, { plan: subscription.planCode });
        return res.json({
            success: true,
            message: `Your ${subscription.planName} plan won't renew. You keep access until ${new Date(subscription.currentPeriodEnd).toDateString()}.`,
        });
    } catch (error) {
        console.error('❌ Cancel subscription error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to cancel your subscription' });
    }
};

// ── ADMIN: all subscriptions, with revenue ──
const getAdminSubscriptions = async (req, res) => {
    try {
        const subs = await Subscription.find({})
            .sort({ createdAt: -1 })
            .populate('userId', 'name email accountType')
            .populate('companyId', 'name email');
        const now = new Date();
        const revenue = {};
        for (const s of subs) {
            revenue[s.currency] = Math.round(((revenue[s.currency] || 0) + (Number(s.price) || 0)) * 100) / 100;
        }
        return res.json({
            success: true,
            data: subs.map((s) => ({
                ...publicSubscription(s),
                userId: s.userId,
                companyId: s.companyId,
                activeNow: s.status === 'ACTIVE' && new Date(s.currentPeriodEnd) > now,
                createdAt: s.createdAt,
            })),
            totals: {
                active: subs.filter((s) => s.status === 'ACTIVE' && new Date(s.currentPeriodEnd) > now).length,
                revenue,
            },
        });
    } catch (error) {
        console.error('❌ Admin subscriptions error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to load subscriptions' });
    }
};

const assignSchema = Joi.object({
    email: Joi.string().trim().lowercase().email().required().messages({ 'any.required': 'Enter the account email' }),
    planCode: Joi.string().trim().uppercase().max(30).required(),
    interval: Joi.string().trim().uppercase().valid('MONTHLY', 'ANNUAL').required(),
    price: Joi.number().min(0).required().messages({ 'any.required': 'Enter the agreed price' }),
    months: Joi.number().integer().min(1).max(36).optional(),
}).unknown(false);

// ── ADMIN: assign a plan to an account (Enterprise or a custom deal) ──
const assignSubscription = async (req, res) => {
    const { error, value } = assignSchema.validate(req.body || {}, { abortEarly: false });
    if (error) return sendValidationErrors(res, joiFieldErrors(error));

    try {
        await ensureDefaultPlans();
        const plan = await Plan.findOne({ code: value.planCode });
        if (!plan) return sendValidationErrors(res, [fieldError('planCode', 'Unknown plan')]);

        const user = await User.findOne({ email: value.email }).select('_id accountType companyId status');
        if (!user || !['INDIVIDUAL', 'COMPANY'].includes(user.accountType)) {
            return sendValidationErrors(res, [fieldError('email', 'No individual or company owner account has that email')]);
        }
        const owner = user.accountType === 'COMPANY'
            ? { companyId: user.companyId }
            : { userId: user._id, companyId: null };
        if (owner.companyId && !(await Company.findById(owner.companyId).select('_id'))) {
            return sendValidationErrors(res, [fieldError('email', 'That company no longer exists')]);
        }

        const now = new Date();
        const end = value.months
            ? (() => { const d = new Date(now); d.setUTCMonth(d.getUTCMonth() + value.months); return d; })()
            : addPeriod(now, value.interval);
        const { subscription: current } = await getAccess(owner);

        const created = await Subscription.create({
            ...owner,
            planCode: plan.code,
            planName: plan.name,
            interval: value.interval,
            price: value.price,
            currency: plan.currency,
            status: 'ACTIVE',
            currentPeriodStart: now,
            currentPeriodEnd: end,
            provider: 'MANUAL',
            reference: `SUB-ADMIN-${Date.now()}`,
            assignedBy: req.user.id,
            createdBy: req.user.id,
        });
        if (current) {
            await Subscription.updateOne({ _id: current._id, status: 'ACTIVE' }, { $set: { status: 'REPLACED', cancelledAt: now } });
        }
        await audit(req, 'CREATE_SUBSCRIPTION', created._id, { plan: plan.code, assigned: true, email: value.email, price: value.price });

        return res.status(201).json({ success: true, message: `${plan.name} assigned to ${value.email}.`, data: publicSubscription(created) });
    } catch (err) {
        console.error('❌ Assign subscription error:', err.name, err.message);
        return res.status(500).json({ success: false, message: 'Failed to assign the plan' });
    }
};

const planUpdateSchema = Joi.object({
    name: Joi.string().trim().min(1).max(60),
    description: Joi.string().trim().allow('').max(300),
    monthlyPrice: Joi.number().min(0).allow(null),
    annualPrice: Joi.number().min(0).allow(null),
    maxActiveCampaigns: Joi.number().integer().min(1).allow(null),
    storageMB: Joi.number().integer().min(0).max(1024 * 1024),
    discountPercent: Joi.number().min(0).max(30),
    teamSeats: Joi.number().integer().min(1).allow(null),
    highlighted: Joi.boolean(),
    isActive: Joi.boolean(),
}).min(1).unknown(false);

// ── ADMIN: plans (including inactive), and edits ──
const getAdminPlans = async (req, res) => {
    try {
        const plans = await listPlans({ includeInactive: true });
        return res.json({ success: true, data: plans.map((p) => ({ ...publicPlan(p), isActive: p.isActive })) });
    } catch (error) {
        console.error('❌ Admin plans error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to load plans' });
    }
};

const updatePlan = async (req, res) => {
    const { error, value } = planUpdateSchema.validate(req.body || {}, { abortEarly: false });
    if (error) return sendValidationErrors(res, joiFieldErrors(error));
    try {
        await ensureDefaultPlans();
        const code = String(req.params.code || '').toUpperCase();
        const plan = await Plan.findOneAndUpdate({ code }, { $set: value }, { returnDocument: 'after', runValidators: true });
        if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });
        await audit(req, 'UPDATE_PLAN', plan._id, { code, changes: Object.keys(value) });
        return res.json({ success: true, message: `${plan.name} updated`, data: { ...publicPlan(plan), isActive: plan.isActive } });
    } catch (err) {
        console.error('❌ Update plan error:', err.name, err.message);
        return res.status(500).json({ success: false, message: 'Failed to update the plan' });
    }
};

module.exports = {
    getPlans,
    getMySubscription,
    subscribe,
    cancelMySubscription,
    getAdminSubscriptions,
    assignSubscription,
    getAdminPlans,
    updatePlan,
};
