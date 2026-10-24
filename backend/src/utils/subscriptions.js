// ─────────────────────────────────────────────────────────────
// SUBSCRIPTIONS
//
// Media Manager is sold as a monthly or annual subscription. A subscription
// is needed to book (checkout); browsing stations and drafting campaigns
// stay open. Each plan sets limits: active campaigns, document storage,
// an extra checkout discount and team seats.
//
// SUBSCRIPTION_REQUIRED=false switches the booking requirement off (e.g. a
// free pilot); it is on by default.
// ─────────────────────────────────────────────────────────────

const Plan = require('../models/Plan');
const Subscription = require('../models/Subscription');

// The homepage plans, as defaults (admins can change them afterwards).
const DEFAULT_PLANS = [
    {
        code: 'STARTER',
        name: 'Starter',
        description: 'For small businesses launching their first advertising campaigns.',
        monthlyPrice: 20000,
        annualPrice: 192000,
        maxActiveCampaigns: 2,
        storageMB: 1024,
        discountPercent: 0,
        teamSeats: 3,
        highlighted: false,
        sortOrder: 1,
    },
    {
        code: 'PROFESSIONAL',
        name: 'Professional',
        description: 'For growing brands running several campaigns at once.',
        monthlyPrice: 50000,
        annualPrice: 480000,
        maxActiveCampaigns: null,
        storageMB: 5120,
        discountPercent: 2,
        teamSeats: 10,
        highlighted: true,
        sortOrder: 2,
    },
    {
        code: 'ENTERPRISE',
        name: 'Enterprise',
        description: 'For agencies and enterprises booking nationwide. Priced on request.',
        monthlyPrice: null,
        annualPrice: null,
        maxActiveCampaigns: null,
        storageMB: 51200,
        discountPercent: 5,
        teamSeats: null,
        highlighted: false,
        sortOrder: 3,
    },
];

// Campaign statuses that count towards a plan's "active campaigns" limit:
// a campaign is active once it has paid bookings and until it closes.
const ACTIVE_CAMPAIGN_STATUSES = [
    'PAYMENT_SUCCESSFUL', 'BOOKING_REQUESTS_SENT', 'MEDIA_REVIEW', 'ACCEPTED',
    'REVISION_REQUESTED', 'CREATIVE_APPROVED', 'SCHEDULED', 'LIVE',
];

const isSubscriptionRequired = () => String(process.env.SUBSCRIPTION_REQUIRED ?? 'true').trim().toLowerCase() !== 'false';

// Creates any missing default plan (never overwrites an admin's edits).
const ensureDefaultPlans = async () => {
    const existing = await Plan.find({}).select('code');
    const have = new Set(existing.map((p) => p.code));
    for (const plan of DEFAULT_PLANS) {
        if (!have.has(plan.code)) {
            try {
                await Plan.create(plan);
            } catch (error) {
                if (error.code !== 11000) throw error; // created concurrently
            }
        }
    }
};

const listPlans = async ({ includeInactive = false } = {}) => {
    await ensureDefaultPlans();
    const plans = await Plan.find(includeInactive ? {} : { isActive: true });
    return plans.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
};

// The subscription owner for the signed-in advertiser (company or individual).
const subscriptionOwner = (req) =>
    req.user.companyId
        ? { companyId: req.user.companyId }
        : { userId: req.user.id, companyId: null };

const isActive = (sub, now = new Date()) =>
    !!sub && sub.status === 'ACTIVE' && new Date(sub.currentPeriodEnd) > now;

// The owner's current subscription (ACTIVE and in period), or null.
const getActiveSubscription = async (owner, now = new Date()) => {
    const subs = await Subscription.find({ ...owner, status: 'ACTIVE' });
    const current = subs
        .filter((s) => isActive(s, now))
        .sort((a, b) => new Date(b.currentPeriodEnd) - new Date(a.currentPeriodEnd));
    return current[0] || null;
};

// { subscription, plan } for an owner; plan is null without a subscription.
const getAccess = async (owner, now = new Date()) => {
    const subscription = await getActiveSubscription(owner, now);
    if (!subscription) return { subscription: null, plan: null };
    await ensureDefaultPlans();
    const plan = await Plan.findOne({ code: subscription.planCode });
    return { subscription, plan };
};

const addPeriod = (start, interval) => {
    const end = new Date(start);
    if (interval === 'ANNUAL') end.setUTCFullYear(end.getUTCFullYear() + 1);
    else end.setUTCMonth(end.getUTCMonth() + 1);
    return end;
};

// Safe to return to the advertiser.
const publicPlan = (p) => ({
    code: p.code,
    name: p.name,
    description: p.description,
    monthlyPrice: p.monthlyPrice,
    annualPrice: p.annualPrice,
    currency: p.currency,
    maxActiveCampaigns: p.maxActiveCampaigns,
    storageMB: p.storageMB,
    discountPercent: p.discountPercent,
    teamSeats: p.teamSeats,
    highlighted: !!p.highlighted,
    priceOnRequest: p.monthlyPrice == null && p.annualPrice == null,
});

const publicSubscription = (s) => s && ({
    _id: s._id,
    planCode: s.planCode,
    planName: s.planName,
    interval: s.interval,
    price: s.price,
    currency: s.currency,
    status: s.status,
    currentPeriodStart: s.currentPeriodStart,
    currentPeriodEnd: s.currentPeriodEnd,
    cancelAtPeriodEnd: !!s.cancelAtPeriodEnd,
    reference: s.reference,
    assignedByAdmin: !!s.assignedBy,
});

module.exports = {
    DEFAULT_PLANS,
    ACTIVE_CAMPAIGN_STATUSES,
    isSubscriptionRequired,
    ensureDefaultPlans,
    listPlans,
    subscriptionOwner,
    isActive,
    getActiveSubscription,
    getAccess,
    addPeriod,
    publicPlan,
    publicSubscription,
};
