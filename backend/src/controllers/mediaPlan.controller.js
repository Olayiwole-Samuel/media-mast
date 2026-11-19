const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Campaign = require('../models/Campaign');
const Station = require('../models/Station');
const Payment = require('../models/Payment');
const Creative = require('../models/Creative');
const Company = require('../models/Company');
const AuditLog = require('../models/AuditLog');
const VolumeAgreement = require('../models/VolumeAgreement');
const PlanDraft = require('../models/PlanDraft');
const { buildPlan, readSpotsByDay } = require('../utils/mediaPlan');
const { walletProvider, getOrCreateWallet, round2 } = require('../utils/wallet');
const { generatePaymentReference } = require('../utils/payments');
const { advertiserScope, advertiserOwner } = require('../utils/advertiser');
const { campaignStatusAfterCheckout, canCampaignRequestBookings } = require('../utils/campaignStatus');
const { ownsStation } = require('../utils/stationOperator');
const { airTimeOf } = require('../utils/cancellationPolicy');
const uploads = require('../utils/fileUploads');
const escrow = require('../utils/escrow');
const { notifyPlanBooked, notifyPlanStatus } = require('../utils/notifications');
const { bookingHelpers } = require('./booking.controller');

const { rateBookingFields, generateBookingReference } = bookingHelpers;
const isId = (v) => mongoose.isValidObjectId(v);
const fmt = (n) => `₦${Number(n || 0).toLocaleString('en-NG', { maximumFractionDigits: 2 })}`;

// ── Shared: load the campaign, the media houses and price the plan ──
const preparePlan = async (req, given = null) => {
    const { campaignId, lines } = given || req.body || {};
    if (!isId(campaignId)) return { status: 400, body: { success: false, message: 'Choose the campaign' } };
    const campaign = await Campaign.findOne({ _id: campaignId, ...advertiserScope(req) });
    if (!campaign) return { status: 404, body: { success: false, message: 'Campaign not found' } };
    if (!canCampaignRequestBookings(campaign.status)) return { status: 400, body: { success: false, message: 'This campaign can no longer take new bookings' } };

    const stationIds = [...new Set((Array.isArray(lines) ? lines : []).map((l) => String(l?.stationId)).filter(isId))];
    const stations = stationIds.length ? await Station.find({ _id: { $in: stationIds } }) : [];
    const byId = new Map(stations.map((s) => [String(s._id), s]));

    // Agency commission: media agencies only.
    const owner = advertiserOwner(req);
    const company = owner.companyId ? await Company.findById(owner.companyId).select('companyType') : null;
    const isAgency = company?.companyType === 'AGENCY';

    // The agency's volume discount agreements with these media houses.
    const agreements = new Map();
    if (isAgency && stationIds.length) {
        for (const a of await VolumeAgreement.find({ companyId: owner.companyId, stationId: { $in: stationIds } })) agreements.set(String(a.stationId), a);
    }

    const plan = buildPlan({ campaign, rawLines: lines, stations: byId, isAgency, rateFields: rateBookingFields, agreements });
    return { campaign, plan, byId, owner, isAgency };
};

const publicLine = (l) => ({
    index: l.index,
    station: l.station,
    rate: l.rate,
    days: l.days,
    spotsByDay: l.spotsByDay,
    volumeDiscountStatus: l.volumeDiscountStatus,
    from: l.from,
    to: l.to,
    airingDays: l.dates.length,
    firstDate: l.dates[0],
    lastDate: l.dates[l.dates.length - 1],
    skipped: l.skipped.slice(0, 20),
    skippedCount: l.skipped.length,
    spots: l.spots,
    unit: l.unit,
    totals: l.totals,
});

// POST /plans/quote — price a plan without booking it.
const quotePlan = async (req, res) => {
    try {
        const ctx = await preparePlan(req);
        if (ctx.status) return res.status(ctx.status).json(ctx.body);
        const wallet = await getOrCreateWallet(ctx.owner);
        const total = ctx.plan.totals?.total || 0;
        return res.json({
            success: true,
            data: {
                lines: ctx.plan.lines.map(publicLine),
                totals: ctx.plan.totals,
                errors: ctx.plan.errors,
                isAgency: ctx.isAgency,
                wallet: { balance: round2(wallet.balance || 0), shortfall: round2(Math.max(0, total - (wallet.balance || 0))) },
            },
        });
    } catch (error) {
        console.error('❌ Plan quote error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to price the plan' });
    }
};

// POST /plans/checkout — hold the whole plan in the wallet and send each
// media house its order (one booking per spot).
const checkoutPlan = async (req, res, given = null, { onBooked } = {}) => {
    if (req.user.accountType === 'EMPLOYEE') {
        return res.status(403).json({ success: false, code: 'OWNER_ONLY', message: 'Only the account owner can book and pay from the wallet.' });
    }
    let held = null;
    try {
        const ctx = await preparePlan(req, given);
        if (ctx.status) return res.status(ctx.status).json(ctx.body);
        const { campaign, plan, owner } = ctx;
        if (plan.errors.length) {
            const first = plan.errors[0];
            return res.status(400).json({ success: false, message: first.line == null ? first.message : `Line ${first.line + 1}: ${first.message}`, errors: plan.errors });
        }

        // The advert (approved, with its ARCON certificate) for each line.
        const defaultCreative = (given || req.body).creativeId;
        const creativeIds = [...new Set(plan.lines.map((l) => String(l.creativeId || defaultCreative || '')).filter(isId))];
        const creatives = creativeIds.length ? await Creative.find({ _id: { $in: creativeIds }, campaignId: campaign._id }) : [];
        const okCreative = new Map(creatives.filter((c) => c.status === 'APPROVED' && c.fileId && c.arcon?.fileId).map((c) => [String(c._id), c]));
        for (const l of plan.lines) {
            const id = String(l.creativeId || defaultCreative || '');
            if (!okCreative.has(id)) {
                return res.status(400).json({ success: false, message: `Line ${l.index + 1}: choose an approved advert with its ARCON certificate` });
            }
            l.creative = okCreative.get(id);
        }

        // Hold the whole plan in the wallet (never below zero).
        const reference = generatePaymentReference();
        const total = plan.totals.total;
        const charged = await walletProvider.charge({ amount: total, currency: plan.totals.currencies[0], reference, payer: owner, campaignId: campaign._id, actorId: req.user._id });
        if (charged.status === 'INSUFFICIENT_FUNDS') {
            return res.status(402).json({
                success: false,
                code: 'WALLET_INSUFFICIENT',
                message: `This plan costs ${fmt(charged.needed)} and your wallet has ${fmt(charged.balance)}. Fund your wallet with at least ${fmt(charged.shortfall)} to book it. You have not been charged.`,
                data: { balance: charged.balance, needed: charged.needed, shortfall: charged.shortfall },
            });
        }
        held = { amount: total, owner, reference };

        const payment = await Payment.create({
            campaignId: campaign._id,
            companyId: owner.companyId || null,
            userId: owner.userId,
            amount: total,
            subtotal: plan.totals.gross,
            discount: plan.totals.savings,
            discountPercent: plan.totals.gross > 0 ? round2(plan.totals.savings / plan.totals.gross * 100) : 0,
            platformFee: 0,
            vat: plan.totals.vat,
            vatPercent: plan.totals.vatPercent,
            currency: plan.totals.currencies[0],
            reference,
            status: 'SUCCESSFUL',
            provider: 'WALLET',
            providerReference: charged.providerReference,
            verifiedAt: new Date(),
            refundAmount: 0,
            description: `Media plan: ${plan.totals.spots} spots on ${plan.totals.stations} media house(s), ${plan.totals.firstDate} to ${plan.totals.lastDate}`,
        });
        held.paymentId = payment._id;

        const docs = [];
        for (const l of plan.lines) {
            for (const [di, d] of l.dates.entries()) {
                for (let k = 0; k < l.spotsOn[di]; k += 1) {
                    docs.push({
                        bookingReference: generateBookingReference(),
                        campaignId: campaign._id,
                        stationId: l.station._id,
                        userId: owner.userId,
                        companyId: owner.companyId || null,
                        slot: l.fields.slot,
                        date: new Date(`${d}T00:00:00.000Z`),
                        time: l.fields.time,
                        duration: l.fields.duration,
                        price: l.unit.gross,
                        currency: l.station.currency,
                        rateId: l.rate._id,
                        rateName: l.rate.name,
                        spotSeconds: l.rate.spotSeconds,
                        creativeId: l.creative._id,
                        status: 'PENDING',
                        paymentId: payment._id,
                        paymentStatus: 'PAID',
                        pricing: { ...l.unit, planLine: l.index },
                        escrow: { status: 'HELD', amount: l.unit.total, vat: l.unit.vat, refunded: 0, released: 0, stationAmount: 0, commission: 0 },
                    });
                }
            }
        }
        const bookings = await Booking.insertMany(docs, { ordered: true });

        const nextStatus = campaignStatusAfterCheckout(campaign.status);
        if (nextStatus) await Campaign.updateOne({ _id: campaign._id, status: campaign.status }, { $set: { status: nextStatus } });

        await AuditLog.create({
            userId: req.user._id, companyId: owner.companyId || null, action: 'CREATE_PAYMENT', entityType: 'PAYMENT', entityId: payment._id,
            metadata: { event: 'MEDIA_PLAN', spots: plan.totals.spots, stations: plan.totals.stations, total },
        }).catch(() => {});
        if (onBooked) await Promise.resolve(onBooked()).catch(() => {});
        await notifyPlanBooked({ payment, campaign, lines: plan.lines, totals: plan.totals });

        return res.status(201).json({
            success: true,
            message: `Plan booked: ${plan.totals.spots} spots on ${plan.totals.stations} media house${plan.totals.stations === 1 ? '' : 's'}. ${fmt(total)} is on hold and paid to each media house as its spots air.`,
            data: { payment: { _id: payment._id, reference, amount: total }, spots: bookings.length, totals: plan.totals, walletBalance: charged.walletBalance },
        });
    } catch (error) {
        console.error('❌ Plan checkout error:', error.name, error.message);
        if (held) {
            // Nothing (or not everything) was booked: release the hold.
            try {
                if (held.paymentId) {
                    await Booking.deleteMany({ paymentId: held.paymentId }).catch(() => {});
                    await Payment.deleteOne({ _id: held.paymentId }).catch(() => {});
                }
                await walletProvider.refund({ payer: held.owner, amount: held.amount, reason: 'Plan could not be booked' });
            } catch (refundError) {
                console.error('❌ Plan compensation refund failed:', refundError.name, refundError.message);
            }
        }
        return res.status(500).json({ success: false, message: 'The plan could not be booked. You have not been charged.' });
    }
};

// ── Campaign tracker: planned / aired / pending, money held / spent ──
const getCampaignTracker = async (req, res) => {
    try {
        if (!isId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid campaign ID' });
        const campaign = await Campaign.findOne({ _id: req.params.id, ...advertiserScope(req) }).select('name startDate endDate status');
        if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
        const bookings = await Booking.find({ campaignId: campaign._id }).populate('stationId', 'name type');
        const today = new Date().toISOString().slice(0, 10);
        const rows = new Map();
        const blank = (station) => ({ station, planned: 0, aired: 0, toConfirm: 0, upcoming: 0, notAired: 0, disputed: 0, cancelled: 0, booked: 0, held: 0, spent: 0, refunded: 0, nextDate: null });
        for (const b of bookings) {
            const key = String(b.stationId?._id || b.stationId);
            if (!rows.has(key)) rows.set(key, blank(b.stationId?.name ? { _id: b.stationId._id, name: b.stationId.name, type: b.stationId.type } : { _id: b.stationId }));
            const r = rows.get(key);
            const d = new Date(b.date).toISOString().slice(0, 10);
            r.planned += 1;
            const e = b.escrow || {};
            r.booked += e.amount || 0;
            r.refunded += e.refunded || 0;
            r.spent += e.released || 0;
            if (['HELD', 'AIRED', 'DISPUTED'].includes(e.status)) r.held += Math.max(0, (e.amount || 0) - (e.refunded || 0) - (e.released || 0));
            if (['REJECTED', 'CANCELLED'].includes(b.status)) r.cancelled += 1;
            else if (b.status === 'NOT_AIRED') r.notAired += 1;
            else if (e.status === 'DISPUTED') r.disputed += 1;
            else if (b.status === 'COMPLETED') r.aired += 1;
            else if (d < today) r.toConfirm += 1;
            else { r.upcoming += 1; if (!r.nextDate || d < r.nextDate) r.nextDate = d; }
        }
        const list = [...rows.values()].map((r) => ({ ...r, booked: round2(r.booked), held: round2(r.held), spent: round2(r.spent), refunded: round2(r.refunded) }))
            .sort((a, b) => b.booked - a.booked);
        const sum = (k) => round2(list.reduce((t, r) => t + r[k], 0));
        return res.json({
            success: true,
            data: {
                campaign,
                stations: list,
                totals: { planned: sum('planned'), aired: sum('aired'), toConfirm: sum('toConfirm'), upcoming: sum('upcoming'), notAired: sum('notAired'), disputed: sum('disputed'), cancelled: sum('cancelled'), booked: sum('booked'), held: sum('held'), spent: sum('spent'), refunded: sum('refunded') },
            },
        });
    } catch (error) {
        console.error('❌ Tracker error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to load the campaign tracker' });
    }
};

// ── Media house: accept a whole order (every new spot of one plan) ──
const acceptOrder = async (req, res) => {
    try {
        if (!isId(req.params.paymentId)) return res.status(400).json({ success: false, message: 'Invalid order' });
        const pending = await Booking.find({ paymentId: req.params.paymentId, status: 'PENDING' });
        const stationIds = [...new Set(pending.map((b) => String(b.stationId)))];
        const stations = stationIds.length ? await Station.find({ _id: { $in: stationIds } }).select('name managerIds companyId approvalStatus isActive') : [];
        const mine = new Set(stations.filter((s) => ownsStation(req, s) && s.approvalStatus === 'APPROVED' && s.isActive !== false).map((s) => String(s._id)));
        const ids = pending.filter((b) => mine.has(String(b.stationId))).map((b) => b._id);
        if (!ids.length) return res.status(404).json({ success: false, message: 'No new spots in this order for your media house' });
        const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 1000) : '';
        const result = await Booking.updateMany({ _id: { $in: ids }, status: 'PENDING' }, { $set: { status: 'ACCEPTED', ...(note ? { stationNote: note } : {}) } });
        const accepted = await Booking.find({ _id: { $in: ids } });
        await AuditLog.create({ userId: req.user._id, action: 'ACCEPT_BOOKING', entityType: 'BOOKING', entityId: ids[0], metadata: { event: 'ACCEPT_ORDER', count: ids.length, paymentId: req.params.paymentId } }).catch(() => {});
        await notifyPlanStatus(accepted, { kind: 'ACCEPTED', note });
        return res.json({ success: true, message: `Accepted ${result.modifiedCount ?? ids.length} spots`, data: { accepted: ids.length } });
    } catch (error) {
        console.error('❌ Accept order error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to accept the order' });
    }
};

// ── Media house: schedule every accepted spot at once ──
// Optional: stationId (one media house) or bookingIds (just these).
const scheduleAll = async (req, res) => {
    try {
        const stations = await Station.find({}).select('name managerIds companyId');
        let mine = stations.filter((s) => ownsStation(req, s)).map((s) => String(s._id));
        if (req.body?.stationId) mine = mine.filter((id) => id === String(req.body.stationId));
        if (!mine.length) return res.status(404).json({ success: false, message: 'No media house found' });
        const only = Array.isArray(req.body?.bookingIds) && req.body.bookingIds.length ? req.body.bookingIds.filter(isId) : null;
        const filter = { stationId: { $in: mine }, status: 'ACCEPTED', ...(only ? { _id: { $in: only } } : {}) };
        const targets = await Booking.find(filter).select('_id');
        if (!targets.length) return res.status(400).json({ success: false, message: 'No accepted spots to schedule' });
        const ids = targets.map((b) => b._id);
        await Booking.updateMany({ _id: { $in: ids }, status: 'ACCEPTED' }, { $set: { status: 'SCHEDULED' } });
        const updated = await Booking.find({ _id: { $in: ids } });
        await AuditLog.create({ userId: req.user._id, action: 'SCHEDULE_BOOKING', entityType: 'BOOKING', entityId: ids[0], metadata: { event: 'SCHEDULE_ALL', count: ids.length } }).catch(() => {});
        await notifyPlanStatus(updated, { kind: 'SCHEDULED' });
        return res.json({ success: true, message: `${ids.length} spot${ids.length === 1 ? '' : 's'} scheduled`, data: { scheduled: ids.length } });
    } catch (error) {
        console.error('❌ Schedule all error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to schedule the spots' });
    }
};

// ── Media house: one day's spots aired, with one TX log and one clip ──
const markDayAired = async (req, res) => {
    try {
        if (!isId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid station ID' });
        const station = await Station.findById(req.params.id).select('name managerIds companyId');
        if (!station || !ownsStation(req, station)) return res.status(404).json({ success: false, message: 'Station not found' });
        const date = String(req.body?.date || '');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ success: false, message: 'Choose the day (YYYY-MM-DD)' });
        const day = new Date(`${date}T00:00:00.000Z`);
        const all = await Booking.find({ stationId: station._id, date: day, status: { $in: ['ACCEPTED', 'SCHEDULED'] } });
        const now = Date.now();
        const due = all.filter((b) => airTimeOf(b).getTime() + (Number(b.duration) || 0) * 60000 <= now);
        const only = Array.isArray(req.body?.bookingIds) && req.body.bookingIds.length ? new Set(req.body.bookingIds.map(String)) : null;
        const targets = due.filter((b) => !only || only.has(String(b._id)));
        if (!targets.length) return res.status(400).json({ success: false, message: all.length ? 'Those spots have not finished airing yet' : 'No accepted spots on that day' });

        const needsProof = targets.some((b) => b.escrow?.status === 'HELD');
        let proof = null;
        if (needsProof) {
            const { logUploadId, clipUploadId } = req.body || {};
            if (!logUploadId || !clipUploadId) return res.status(400).json({ success: false, code: 'PROOF_REQUIRED', message: "Upload the day's TX log and a clip to mark these spots aired." });
            const log = await uploads.claimUpload(req.user, logUploadId, 'PROOF_LOG');
            if (log.error) return res.status(400).json({ success: false, message: `TX log: ${log.error}` });
            const clip = await uploads.claimUpload(req.user, clipUploadId, 'PROOF_CLIP');
            if (clip.error) return res.status(400).json({ success: false, message: `Clip: ${clip.error}` });
            const note = typeof req.body.note === 'string' ? req.body.note.trim().slice(0, 1000) || null : null;
            proof = { logFileId: log.file.fileId, logName: log.file.name, clipFileId: clip.file.fileId, clipName: clip.file.name, note };
        }
        for (const b of targets) if (b.escrow?.status === 'HELD') await escrow.markAired(b, proof);
        await Booking.updateMany({ _id: { $in: targets.map((b) => b._id) }, status: { $in: ['ACCEPTED', 'SCHEDULED'] } }, { $set: { status: 'COMPLETED' } });
        const updated = await Booking.find({ _id: { $in: targets.map((b) => b._id) } });
        await AuditLog.create({ userId: req.user._id, action: 'COMPLETE_BOOKING', entityType: 'BOOKING', entityId: targets[0]._id, metadata: { event: 'DAY_AIRED', date, count: targets.length, station: station.name } }).catch(() => {});
        await notifyPlanStatus(updated, { kind: 'AIRED', date });
        return res.json({ success: true, message: `${targets.length} spot${targets.length === 1 ? '' : 's'} on ${date} marked aired`, data: { aired: targets.length } });
    } catch (error) {
        console.error('❌ Day aired error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to mark the day aired' });
    }
};

// ── The plan cart: drafts saved as they are built ──
const draftScope = (req) => {
    const owner = advertiserOwner(req);
    return owner.companyId ? { companyId: owner.companyId } : { companyId: null, userId: owner.userId };
};

const cleanLines = (lines) => (Array.isArray(lines) ? lines : []).slice(0, 300)
    .filter((l) => l && isId(l.stationId) && isId(l.rateId))
    .map((l) => ({
        stationId: l.stationId,
        rateId: l.rateId,
        spotsByDay: readSpotsByDay(l).map((n) => (Number.isInteger(n) && n >= 0 && n <= 20 ? n : 0)),
        startDate: typeof l.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(l.startDate) ? l.startDate : null,
        endDate: typeof l.endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(l.endDate) ? l.endDate : null,
    }));

const draftBody = (d) => ({
    campaignId: String(d.campaignId),
    creativeId: d.creativeId ? String(d.creativeId) : undefined,
    lines: (d.lines || []).map((l) => ({ stationId: String(l.stationId), rateId: String(l.rateId), spotsByDay: [...l.spotsByDay], startDate: l.startDate || undefined, endDate: l.endDate || undefined })),
});

// GET /media-plans/drafts — every plan in the cart, priced, with the wallet.
const getDrafts = async (req, res) => {
    try {
        const drafts = (await PlanDraft.find(draftScope(req))).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        const wallet = await getOrCreateWallet(advertiserOwner(req));
        const out = [];
        for (const d of drafts) {
            const campaign = await Campaign.findOne({ _id: d.campaignId, ...advertiserScope(req) }).select('name startDate endDate status');
            if (!campaign) continue;
            const ctx = d.lines.length ? await preparePlan(req, draftBody(d)) : null;
            out.push({
                _id: d._id,
                campaign: { _id: campaign._id, name: campaign.name, startDate: campaign.startDate, endDate: campaign.endDate, status: campaign.status },
                creativeId: d.creativeId,
                lines: draftBody(d).lines,
                updatedAt: d.updatedAt,
                quote: ctx && !ctx.status ? { lines: ctx.plan.lines.map(publicLine), totals: ctx.plan.totals, errors: ctx.plan.errors, isAgency: ctx.isAgency } : null,
            });
        }
        const needed = round2(out.reduce((t, d) => t + (d.quote?.totals?.total || 0), 0));
        return res.json({ success: true, data: { drafts: out, needed, wallet: { balance: round2(wallet.balance || 0), shortfall: round2(Math.max(0, needed - (wallet.balance || 0))) } } });
    } catch (error) {
        console.error('❌ Drafts error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to load your cart' });
    }
};

// GET /media-plans/drafts/:campaignId — one saved plan (to keep editing it).
const getDraft = async (req, res) => {
    try {
        if (!isId(req.params.campaignId)) return res.status(400).json({ success: false, message: 'Invalid campaign' });
        const d = await PlanDraft.findOne({ ...draftScope(req), campaignId: req.params.campaignId });
        return res.json({ success: true, data: d ? draftBody(d) : null });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to load the plan' });
    }
};

// PUT /media-plans/drafts/:campaignId — save the plan as it is built.
const saveDraft = async (req, res) => {
    try {
        if (!isId(req.params.campaignId)) return res.status(400).json({ success: false, message: 'Invalid campaign' });
        const campaign = await Campaign.findOne({ _id: req.params.campaignId, ...advertiserScope(req) }).select('_id');
        if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
        const lines = cleanLines(req.body?.lines);
        const creativeId = isId(req.body?.creativeId) ? req.body.creativeId : null;
        const scope = draftScope(req);
        const existing = await PlanDraft.findOne({ ...scope, campaignId: campaign._id });
        if (!lines.length) {
            if (existing) await PlanDraft.deleteOne({ _id: existing._id });
            return res.json({ success: true, message: 'Plan removed from the cart', data: null });
        }
        if (existing) {
            await PlanDraft.updateOne({ _id: existing._id }, { $set: { lines, creativeId } });
        } else {
            await PlanDraft.create({ ...scope, userId: advertiserOwner(req).userId, campaignId: campaign._id, lines, creativeId });
        }
        return res.json({ success: true, message: 'Saved to your cart', data: { lines: lines.length } });
    } catch (error) {
        console.error('❌ Save draft error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to save the plan' });
    }
};

const deleteDraft = async (req, res) => {
    try {
        if (!isId(req.params.campaignId)) return res.status(400).json({ success: false, message: 'Invalid campaign' });
        await PlanDraft.deleteMany({ ...draftScope(req), campaignId: req.params.campaignId });
        return res.json({ success: true, message: 'Plan removed from the cart' });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to remove the plan' });
    }
};

// POST /media-plans/drafts/:campaignId/checkout — book the saved plan.
const checkoutDraft = async (req, res) => {
    try {
        if (!isId(req.params.campaignId)) return res.status(400).json({ success: false, message: 'Invalid campaign' });
        const d = await PlanDraft.findOne({ ...draftScope(req), campaignId: req.params.campaignId });
        if (!d || !d.lines.length) return res.status(404).json({ success: false, message: 'This plan is not in your cart' });
        // Book it; once booked, the plan leaves the cart.
        return checkoutPlan(req, res, draftBody(d), { onBooked: () => PlanDraft.deleteOne({ _id: d._id }) });
    } catch (error) {
        console.error('❌ Draft checkout error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'The plan could not be booked. You have not been charged.' });
    }
};

module.exports = {
    quotePlan,
    checkoutPlan,
    getCampaignTracker,
    acceptOrder,
    scheduleAll,
    markDayAired,
    getDrafts,
    getDraft,
    saveDraft,
    deleteDraft,
    checkoutDraft,
};
