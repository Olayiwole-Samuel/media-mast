const mongoose = require('mongoose');

const Booking = require('../models/Booking');
const Campaign = require('../models/Campaign');
const Station = require('../models/Station');
const Payment = require('../models/Payment');
const AuditLog = require('../models/AuditLog');
const { bookingHelpers } = require('./booking.controller');
const { advertiserScope, advertiserOwner } = require('../utils/advertiser');
const { campaignStatusAfterCheckout } = require('../utils/campaignStatus');
const {
    getPaymentProvider,
    generatePaymentReference,
    getPlatformFeePercent,
} = require('../utils/payments');
const {
    acquireStationBookingLock,
    releaseStationBookingLock,
} = require('../utils/stationBookingLock');
const { validateCheckout } = require('../validators/payment.validator');
const { checkStationCalendar } = require('../utils/stationCalendar');
const { notifyCheckout } = require('../utils/notifications');
const { discountFor } = require('../utils/discounts');
const {
    isSubscriptionRequired,
    getAccess,
    subscriptionOwner,
    ACTIVE_CAMPAIGN_STATUSES,
} = require('../utils/subscriptions');
const {
    fieldError,
    sendValidationErrors,
    mongooseFieldErrors,
} = require('../utils/validationResponse');

const {
    validateBookingFields,
    checkCampaignForBooking,
    checkStationForBooking,
    takesExclusiveTime,
    getBookingRange,
    findConflictingBooking,
    generateBookingReference,
    writeAuditLog,
} = bookingHelpers;

const round2 = (n) => Math.round(n * 100) / 100;

// Raised inside the checkout transaction (aborts it).
class CheckoutConflict extends Error {
    constructor(index, booking) {
        super('checkout conflict');
        this.name = 'CheckoutConflict';
        this.index = index;
        this.booking = booking;
    }
}

const conflictResponse = (res, index, booking) =>
    res.status(409).json({
        success: false,
        message: `Item ${index + 1}: the station is already booked for this time`,
        data: booking
            ? { item: index + 1, bookingReference: booking.bookingReference, status: booking.status }
            : { item: index + 1 },
    });

// Payment fields safe to return (no providerData).
const publicPayment = (payment) => ({
    _id: payment._id,
    reference: payment.reference,
    campaignId: payment.campaignId,
    amount: payment.amount,
    subtotal: payment.subtotal,
    platformFee: payment.platformFee,
    discount: payment.discount || 0,
    discountPercent: payment.discountPercent || 0,
    currency: payment.currency,
    status: payment.status,
    provider: payment.provider,
    refundAmount: payment.refundAmount || 0,
    refundedAt: payment.refundedAt,
    verifiedAt: payment.verifiedAt,
    createdAt: payment.createdAt,
});

// ─────────────────────────────────────────────
// CHECKOUT
// One payment for a cart of spots across many stations. Every item is
// checked with the same rules as a single booking; then all stations are
// locked, conflicts re-checked, the payment taken (stub provider: no money
// moves) and the Payment + all Bookings written in ONE transaction — all
// of them or none. Stations only ever see paid requests.
// ─────────────────────────────────────────────

const checkout = async (req, res) => {
    const check = validateCheckout(req.body);

    if (check.errors) {
        return sendValidationErrors(res, check.errors);
    }

    const { campaignId, items } = check.value;
    const owner = advertiserOwner(req);
    const itemError = (index, message) =>
        sendValidationErrors(res, [fieldError(`items.${index}`, `Item ${index + 1}: ${message}`)]);

    let provider;
    try {
        provider = getPaymentProvider();
    } catch (error) {
        console.error('❌ Payment provider unavailable:', error.code || error.name);
        return res.status(503).json({
            success: false,
            message: 'Payments are not available right now. Please try again later.',
        });
    }

    let locks = [];
    let session = null;
    let charged = null;
    let chargedAmount = null;
    let chargedCurrency = null;
    let result = null;
    let lockedOut = false;
    let conflict = null;

    try {
        const campaign = await Campaign.findOne({ _id: campaignId, ...advertiserScope(req) });

        if (!campaign) {
            return res.status(404).json({ success: false, message: 'Campaign not found' });
        }

        // ── Subscription: needed to book; its plan sets limits and a discount ──
        let planPercent = 0;
        if (isSubscriptionRequired()) {
            const { subscription, plan } = await getAccess(subscriptionOwner(req));
            if (!subscription) {
                return res.status(403).json({
                    success: false,
                    code: 'SUBSCRIPTION_REQUIRED',
                    message: 'Subscribe to a plan to book airtime. Browsing stations and planning campaigns are free.',
                });
            }
            planPercent = Number(plan?.discountPercent) || 0;

            const limit = plan?.maxActiveCampaigns;
            if (limit && !ACTIVE_CAMPAIGN_STATUSES.includes(campaign.status)) {
                const activeCount = (await Campaign.find({
                    ...advertiserScope(req),
                    status: { $in: ACTIVE_CAMPAIGN_STATUSES },
                }).select('_id')).length;
                if (activeCount >= limit) {
                    return res.status(403).json({
                        success: false,
                        code: 'PLAN_LIMIT',
                        message: `Your ${plan.name} plan allows ${limit} active campaign${limit === 1 ? '' : 's'}. Finish or cancel one, or upgrade your plan, to book another.`,
                    });
                }
            }
        }

        // ── Per-item booking rules (same as createBooking) ──
        const prepared = [];

        for (const [index, item] of items.entries()) {
            const fields = validateBookingFields({ ...item, campaignId });
            if (fields.error) return itemError(index, fields.error);

            const campaignProblem = checkCampaignForBooking(campaign, fields.value.dateOnly);
            if (campaignProblem) return itemError(index, campaignProblem);

            prepared.push({ ...fields.value, rateId: item.rateId || null });
        }

        const stationIds = [...new Set(prepared.map((p) => String(p.stationId)))].sort();
        const stations = await Station.find({ _id: { $in: stationIds } });
        const stationById = new Map(stations.map((s) => [String(s._id), s]));

        for (const [index, item] of prepared.entries()) {
            const station = stationById.get(String(item.stationId));

            if (!station) {
                return res.status(404).json({ success: false, message: `Item ${index + 1}: Station not found` });
            }

            const stationCheck = checkStationForBooking(station, { rateId: item.rateId || null, time: item.time });
            if (stationCheck.error) return itemError(index, stationCheck.error);

            const range = getBookingRange(item.time, item.duration);
            if (range.error) return itemError(index, range.error);

            const calendarProblem = checkStationCalendar(station, item.dateOnly, range.start, range.end);
            if (calendarProblem) return itemError(index, calendarProblem);

            Object.assign(item, {
                station,
                price: stationCheck.price,
                currency: stationCheck.currency,
                rate: stationCheck.rate,
                start: range.start,
                end: range.end,
            });
        }

        const currencies = [...new Set(prepared.map((p) => p.currency))];

        if (currencies.length > 1) {
            return sendValidationErrors(res, [fieldError('items', 'All items in one checkout must use the same currency')]);
        }

        // ── Items in the cart must not overlap each other ──
        for (let a = 0; a < prepared.length; a++) {
            for (let b = a + 1; b < prepared.length; b++) {
                const x = prepared[a], y = prepared[b];
                if (
                    takesExclusiveTime(x.station) &&
                    String(x.stationId) === String(y.stationId) &&
                    x.dateOnly === y.dateOnly &&
                    x.start < y.end && x.end > y.start
                ) {
                    return sendValidationErrors(res, [fieldError(`items.${b}`, `Items ${a + 1} and ${b + 1} overlap on the same station`)]);
                }
            }
        }

        const currency = currencies[0];
        const subtotal = round2(prepared.reduce((sum, p) => sum + p.price, 0));
        // Discount: several stations in one checkout, plus the plan's own.
        const discount = discountFor({ subtotal, stationCount: stationIds.length, planPercent });
        const net = round2(subtotal - discount.amount);
        const platformFee = round2(net * (getPlatformFeePercent() / 100));
        const amount = round2(net + platformFee);

        // ── Lock every station (sorted, so concurrent checkouts can't deadlock) ──
        for (const stationId of stationIds) {
            const lock = await acquireStationBookingLock(stationId);
            if (!lock) { lockedOut = true; break; }
            locks.push([stationId, lock]);
        }

        if (!lockedOut) {
            for (const [index, item] of prepared.entries()) {
                if (!takesExclusiveTime(item.station)) continue;
                const existing = await findConflictingBooking({
                    stationId: item.station._id,
                    bookingDate: item.bookingDate,
                    start: item.start,
                    end: item.end,
                });
                if (existing) { conflict = { index, booking: existing }; break; }
            }
        }

        if (!lockedOut && !conflict) {
            const reference = generatePaymentReference();
            charged = await provider.charge({ amount, currency, reference });
            chargedAmount = amount;
            chargedCurrency = currency;

            if (!charged || charged.status !== 'SUCCESSFUL') {
                charged = null;
                return res.status(402).json({
                    success: false,
                    message: 'The payment was not completed. You have not been charged.',
                });
            }

            session = await mongoose.startSession();

            await session.withTransaction(async () => {
                result = null;

                const [payment] = await Payment.create([{
                    campaignId: campaign._id,
                    companyId: owner.companyId,
                    userId: owner.userId,
                    amount,
                    subtotal,
                    platformFee,
                    discount: discount.amount,
                    discountPercent: discount.percent,
                    currency,
                    reference,
                    status: 'SUCCESSFUL',
                    provider: provider.name,
                    providerReference: charged.providerReference,
                    verifiedAt: new Date(),
                    refundAmount: 0,
                    description: `Checkout: ${prepared.length} booking request(s)`,
                }], { session });

                const bookings = await Booking.create(prepared.map((item) => ({
                    bookingReference: generateBookingReference(),
                    campaignId: campaign._id,
                    stationId: item.station._id,
                    userId: owner.userId,
                    companyId: owner.companyId,
                    slot: item.slot,
                    date: item.bookingDate,
                    time: item.time,
                    duration: item.duration,
                    price: item.price,
                    currency: item.currency,
                    rateId: item.rate ? item.rate._id : null,
                    rateName: item.rate ? item.rate.name : null,
                    status: 'PENDING',
                    paymentId: payment._id,
                    paymentStatus: 'PAID',
                })), { session, ordered: true });

                // Defence in depth (a lock that expired mid-request): re-check
                // inside the transaction, which also sees our own inserts.
                const ownIds = bookings.map((b) => b._id);
                for (const [index, item] of prepared.entries()) {
                    if (!takesExclusiveTime(item.station)) continue;
                    const clash = await findConflictingBooking({
                        stationId: item.station._id,
                        bookingDate: item.bookingDate,
                        start: item.start,
                        end: item.end,
                        excludeIds: ownIds,
                        session,
                    });
                    if (clash) throw new CheckoutConflict(index, clash);
                }

                const nextStatus = campaignStatusAfterCheckout(campaign.status);
                if (nextStatus) {
                    await Campaign.updateOne(
                        { _id: campaign._id, status: campaign.status },
                        { $set: { status: nextStatus } },
                        { session }
                    );
                }

                result = { payment, bookings, campaignStatus: nextStatus || campaign.status };
            }, {
                readConcern: { level: 'snapshot' },
                writeConcern: { w: 'majority' },
            });
        }
    } catch (error) {
        // Nothing was written; give back anything already charged.
        if (charged && !result) {
            try {
                await provider.refund({ amount: chargedAmount, currency: chargedCurrency, providerReference: charged.providerReference, reason: 'Checkout could not be completed' });
            } catch (refundError) {
                console.error('❌ Checkout compensation refund failed:', refundError.name, refundError.message);
            }
        }

        if (error instanceof CheckoutConflict) {
            conflict = { index: error.index, booking: error.booking };
        } else {
            console.error('❌ Checkout error:', error.name, error.code || error.message);

            if (error.code === 11000) {
                return res.status(409).json({ success: false, message: 'A reference conflict occurred. Please try again. You have not been charged.' });
            }

            if (error.name === 'ValidationError') {
                return sendValidationErrors(res, mongooseFieldErrors(error));
            }

            return res.status(500).json({ success: false, message: 'Checkout failed. You have not been charged.' });
        }
    } finally {
        for (const [stationId, lock] of locks) {
            await releaseStationBookingLock(stationId, lock).catch(() => {});
        }
        if (session) await session.endSession().catch(() => {});
    }

    if (lockedOut) {
        return res.status(409).json({
            success: false,
            message: 'One of these stations is taking another booking right now. Please try again.',
        });
    }

    if (conflict) {
        return conflictResponse(res, conflict.index, conflict.booking);
    }

    if (!result) {
        // A return inside try already answered (e.g. 404/400/402).
        return undefined;
    }

    // ── Post-commit: audit (never turns success into an error) ──
    const { payment, bookings, campaignStatus } = result;

    try {
        await AuditLog.create({
            userId: req.user.id,
            companyId: owner.companyId,
            action: 'CREATE_PAYMENT',
            entityType: 'PAYMENT',
            entityId: payment._id,
            metadata: {
                reference: payment.reference,
                amount: payment.amount,
                currency: payment.currency,
                provider: payment.provider,
                bookings: bookings.length,
            },
        });
    } catch (auditError) {
        console.error('⚠️ Audit log error:', auditError.name, auditError.message);
    }

    for (const booking of bookings) {
        await writeAuditLog({
            userId: req.user.id,
            companyId: owner.companyId,
            action: 'CREATE_BOOKING',
            entityId: booking._id,
            metadata: {
                bookingReference: booking.bookingReference,
                campaignId: String(booking.campaignId),
                stationId: String(booking.stationId),
                price: booking.price,
                currency: booking.currency,
                paymentReference: payment.reference,
            },
        });
    }

    await notifyCheckout({ payment, bookings });

    return res.status(201).json({
        success: true,
        message: 'Payment received. Your booking requests have been sent to the stations.',
        data: {
            payment: publicPayment(payment),
            bookings,
            campaign: { _id: payment.campaignId, status: campaignStatus },
            testMode: provider.isTestMode === true,
        },
    });
};

// ─────────────────────────────────────────────
// PAYMENTS (advertiser's own)
// ─────────────────────────────────────────────

const getPayments = async (req, res) => {
    try {
        const payments = await Payment.find(advertiserScope(req))
            .sort({ createdAt: -1 })
            .populate('campaignId', 'name status');

        return res.json({
            success: true,
            data: payments.map((p) => ({ ...publicPayment(p), campaignId: p.campaignId })),
        });
    } catch (error) {
        console.error('❌ Get payments error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to load payments' });
    }
};

const getPayment = async (req, res) => {
    try {
        const scope = advertiserScope(req);
        const payment = await Payment.findOne({ _id: req.params.id, ...scope })
            .populate('campaignId', 'name status');

        if (!payment) {
            return res.status(404).json({ success: false, message: 'Payment not found' });
        }

        const bookings = await Booking.find({ paymentId: payment._id, ...scope })
            .sort({ date: 1, time: 1 })
            .populate('stationId', 'name type location');

        return res.json({
            success: true,
            data: { ...publicPayment(payment), campaignId: payment.campaignId, bookings },
        });
    } catch (error) {
        console.error('❌ Get payment error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to load payment' });
    }
};

// ─────────────────────────────────────────────
// PAYMENTS (admin: every payment, with totals)
// ─────────────────────────────────────────────

const ADMIN_PAYMENT_STATUSES = ['PENDING', 'SUCCESSFUL', 'FAILED', 'REFUNDED', 'DISPUTED'];

const getAdminPayments = async (req, res) => {
    try {
        const status = typeof req.query.status === 'string' ? req.query.status.trim().toUpperCase() : '';
        if (status && !ADMIN_PAYMENT_STATUSES.includes(status)) {
            return res.status(400).json({ success: false, message: `status must be one of ${ADMIN_PAYMENT_STATUSES.join(', ')}` });
        }

        const payments = await Payment.find(status ? { status } : {})
            .sort({ createdAt: -1 })
            .populate('campaignId', 'name status')
            .populate('userId', 'name email accountType')
            .populate('companyId', 'name email');

        // Totals per currency over the listed payments. Collected counts
        // money taken (SUCCESSFUL, plus REFUNDED ones before their refund).
        const totals = {};
        for (const p of payments) {
            const t = totals[p.currency] || (totals[p.currency] = { collected: 0, refunded: 0, platformFees: 0, net: 0, count: 0 });
            t.count += 1;
            if (p.status === 'SUCCESSFUL' || p.status === 'REFUNDED') {
                t.collected = round2(t.collected + (Number(p.amount) || 0));
                t.platformFees = round2(t.platformFees + (Number(p.platformFee) || 0));
            }
            t.refunded = round2(t.refunded + (Number(p.refundAmount) || 0));
            t.net = round2(t.collected - t.refunded);
        }

        return res.json({
            success: true,
            data: payments.map((p) => ({
                ...publicPayment(p),
                campaignId: p.campaignId,
                userId: p.userId,
                companyId: p.companyId,
            })),
            totals,
        });
    } catch (error) {
        console.error('❌ Admin get payments error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to load payments' });
    }
};

const getAdminPayment = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: 'Invalid payment ID' });
        }

        const payment = await Payment.findById(req.params.id)
            .populate('campaignId', 'name status')
            .populate('userId', 'name email accountType')
            .populate('companyId', 'name email');

        if (!payment) {
            return res.status(404).json({ success: false, message: 'Payment not found' });
        }

        const bookings = await Booking.find({ paymentId: payment._id })
            .sort({ date: 1, time: 1 })
            .select('bookingReference stationId status date time duration price currency paymentStatus refundAmount refundedAt cancellationFee cancelledBy cancellationReason')
            .populate('stationId', 'name type location');

        return res.json({
            success: true,
            data: {
                ...publicPayment(payment),
                campaignId: payment.campaignId,
                userId: payment.userId,
                companyId: payment.companyId,
                providerReference: payment.providerReference || null,
                bookings,
            },
        });
    } catch (error) {
        console.error('❌ Admin get payment error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to load payment' });
    }
};

module.exports = {
    checkout,
    getPayments,
    getPayment,
    getAdminPayments,
    getAdminPayment,
};
