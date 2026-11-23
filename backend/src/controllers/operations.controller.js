const crypto = require('crypto');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const Booking = require('../models/Booking');
const Campaign = require('../models/Campaign');
const Station = require('../models/Station');
const Payment = require('../models/Payment');
const Company = require('../models/Company');
const User = require('../models/User');
const Verification = require('../models/Verification');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const PlanDraft = require('../models/PlanDraft');
const PlanShare = require('../models/PlanShare');
const VolumeAgreement = require('../models/VolumeAgreement');
const PayoutRequest = require('../models/PayoutRequest');
const Creative = require('../models/Creative');
const AuditLog = require('../models/AuditLog');
const { advertiserScope, advertiserOwner } = require('../utils/advertiser');
const { ownsStation } = require('../utils/stationOperator');
const { airTimeOf } = require('../utils/cancellationPolicy');
const { getSettlementSettings } = require('../utils/escrow');
const { getOrCreateWallet, round2 } = require('../utils/wallet');
const { buildXlsx } = require('../utils/xlsx');
const { weekOf } = require('../utils/mediaPlan');
const { getVatPercent } = require('../utils/payments');
const { checkStationCalendar } = require('../utils/stationCalendar');
const { bookingHelpers } = require('./booking.controller');
const plans = require('./mediaPlan.controller');
const { notifyBulkToStations, notifyPlanStatus, notifyPlanShareResponse } = require('../utils/notifications');

// ─────────────────────────────────────────────────────────────
// Day-to-day tools around media plans:
//   bulk actions (agency: cancel / move spots; media house: decline /
//   reschedule), dashboard summary, plan export (.xlsx), client approval
//   links, invoices & receipts, proof-of-airing report, copying a plan,
//   admin money overview, read-only support view, getting-started steps.
// ─────────────────────────────────────────────────────────────

const isId = (v) => mongoose.isValidObjectId(v);
const dateOnly = (d) => new Date(d).toISOString().slice(0, 10);
const todayLagos = () => new Date(Date.now() + 3600000).toISOString().slice(0, 10); // Lagos = UTC+1
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const perDayText = (spotsByDay) => [1, 2, 3, 4, 5, 6, 0].filter((d) => (spotsByDay || [])[d] > 0).map((d) => `${DAY[d]} ${spotsByDay[d]}`).join(', ');
const LIVE = ['PENDING', 'ACCEPTED', 'SCHEDULED', 'CHANGES_REQUESTED'];
const { transitionOne, cancelBookingAsCustomer, spotHasAired } = bookingHelpers;

// ═════════════ Agency: bulk actions on a campaign's spots ═════════════
// POST /campaigns/:id/bulk
//   cancel: { action = CANCEL, bookingIds? | fromDate?, stationId? }
//   move:   { action = MOVE, bookingIds, toDate }
const bulkCampaign = async (req, res) => {
    try {
        if (!isId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid campaign' });
        if (req.user.accountType === 'EMPLOYEE') return res.status(403).json({ success: false, message: 'Only the account owner can change booked spots.' });
        const campaign = await Campaign.findOne({ _id: req.params.id, ...advertiserScope(req) });
        if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
        const { action } = req.body || {};
        const ids = Array.isArray(req.body?.bookingIds) ? req.body.bookingIds.filter(isId) : null;
        const filter = { campaignId: campaign._id, status: { $in: LIVE }, ...advertiserScope(req) };
        if (ids && ids.length) filter._id = { $in: ids };
        if (isId(req.body?.stationId)) filter.stationId = req.body.stationId;
        let targets = await Booking.find(filter);
        if (req.body?.fromDate) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(req.body.fromDate)) return res.status(400).json({ success: false, message: 'Choose the date as YYYY-MM-DD' });
            targets = targets.filter((b) => dateOnly(b.date) >= req.body.fromDate);
        }
        if (!(ids && ids.length) && !req.body?.fromDate && !req.body?.stationId) return res.status(400).json({ success: false, message: 'Choose the spots, a station, or a date to start from' });
        if (!targets.length) return res.status(400).json({ success: false, message: 'No upcoming spots match' });
        if (targets.length > 2000) return res.status(400).json({ success: false, message: 'Too many spots at once (2,000 max)' });

        const done = [];
        const skipped = [];
        if (action === 'CANCEL') {
            let refunded = 0;
            for (const b of targets) {
                const r = await cancelBookingAsCustomer(req, b, { quiet: true });
                if (r.status === 200) { done.push(r.body.data); refunded += Number(r.body.cancellation?.refundAmount || 0); } else skipped.push({ bookingReference: b.bookingReference, reason: r.body.message });
            }
            await notifyBulkToStations(done, { kind: 'CANCELLED' });
            return res.json({ success: true, message: `${done.length} spot${done.length === 1 ? '' : 's'} cancelled; ₦${round2(refunded).toLocaleString()} back in your wallet${skipped.length ? `; ${skipped.length} couldn't be cancelled` : ''}`, data: { cancelled: done.length, refunded: round2(refunded), skipped } });
        }

        if (action === 'MOVE') {
            const toDate = String(req.body?.toDate || '');
            if (!/^\d{4}-\d{2}-\d{2}$/.test(toDate)) return res.status(400).json({ success: false, message: 'Choose the new date' });
            if (toDate <= dateOnly(new Date())) return res.status(400).json({ success: false, message: 'The new date must be after today' });
            const problem = bookingHelpers.checkCampaignForBooking(campaign, toDate);
            if (problem) return res.status(400).json({ success: false, message: problem });
            const stations = new Map((await Station.find({ _id: { $in: [...new Set(targets.map((b) => String(b.stationId)))] } })).map((s) => [String(s._id), s]));
            const weekday = new Date(`${toDate}T00:00:00Z`).getUTCDay();
            for (const b of targets) {
                const st = stations.get(String(b.stationId));
                const rate = (st?.rateCard || []).find((r) => r && String(r._id) === String(b.rateId));
                if (rate?.days?.length && !rate.days.includes(weekday)) { skipped.push({ bookingReference: b.bookingReference, reason: `${rate.name} isn't sold on ${DAY[weekday]}` }); continue; }
                const [h, m] = String(b.time || '00:00').split(':').map(Number);
                const start = h * 60 + m;
                const cal = st ? checkStationCalendar(st, toDate, start, start + Number(b.duration || 0)) : null;
                if (cal) { skipped.push({ bookingReference: b.bookingReference, reason: cal }); continue; }
                const updated = await Booking.findOneAndUpdate(
                    { _id: b._id, status: b.status },
                    { $set: { date: new Date(`${toDate}T00:00:00.000Z`), status: 'PENDING', proposedDate: null, reminder24SentAt: null, reminder1SentAt: null } },
                    { returnDocument: 'after' }
                );
                if (updated) done.push(updated); else skipped.push({ bookingReference: b.bookingReference, reason: 'Changed meanwhile' });
            }
            await notifyBulkToStations(done, { kind: 'MOVED', date: toDate });
            return res.json({ success: true, message: `${done.length} spot${done.length === 1 ? '' : 's'} moved to ${toDate} and sent back to the media house to confirm${skipped.length ? `; ${skipped.length} couldn't move` : ''}`, data: { moved: done.length, skipped } });
        }
        return res.status(400).json({ success: false, message: 'Choose cancel or move' });
    } catch (error) {
        console.error('❌ Bulk campaign error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to update the spots' });
    }
};

// ═════════════ Media house: decline / reschedule many spots ═════════════
// PATCH /station-portal/bulk { action = DECLINE or RESCHEDULE, bookingIds, note, proposedDate? }
const bulkStation = async (req, res) => {
    try {
        const ids = Array.isArray(req.body?.bookingIds) ? req.body.bookingIds.filter(isId) : [];
        if (!ids.length) return res.status(400).json({ success: false, message: 'Choose the spots' });
        if (ids.length > 2000) return res.status(400).json({ success: false, message: 'Too many spots at once (2,000 max)' });
        const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 1000) : '';
        if (!note) return res.status(400).json({ success: false, message: 'Add a reason the advertiser will see' });
        const action = String(req.body?.action || '').toUpperCase();
        let proposedDate = null;
        if (action === 'RESCHEDULE' && req.body?.proposedDate) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(req.body.proposedDate) || req.body.proposedDate <= dateOnly(new Date())) return res.status(400).json({ success: false, message: 'The suggested date must be after today' });
            proposedDate = new Date(`${req.body.proposedDate}T00:00:00.000Z`);
        }
        if (!['DECLINE', 'RESCHEDULE'].includes(action)) return res.status(400).json({ success: false, message: 'Choose decline or reschedule' });

        const bookings = await Booking.find({ _id: { $in: ids } });
        const stations = new Map((await Station.find({ _id: { $in: [...new Set(bookings.map((b) => String(b.stationId)))] } }).select('managerIds companyId')).map((s) => [String(s._id), s]));
        const done = [];
        const skipped = [];
        for (const b of bookings) {
            const st = stations.get(String(b.stationId));
            if (!st || !ownsStation(req, st)) { skipped.push({ bookingReference: b.bookingReference, reason: 'Not your media house' }); continue; }
            const toStatus = action === 'DECLINE' ? 'REJECTED' : 'CHANGES_REQUESTED';
            const r = await transitionOne(req, b, {
                actor: 'STATION', toStatus, auditAction: action === 'DECLINE' ? 'REJECT_BOOKING' : 'UPDATE_BOOKING', auditCompanyId: st.companyId,
                set: { stationNote: note, ...(action === 'RESCHEDULE' ? { proposedDate } : {}) },
            });
            if (r.ok) done.push(r.booking); else skipped.push({ bookingReference: b.bookingReference, reason: r.reason });
        }
        await notifyPlanStatus(done, { kind: action === 'DECLINE' ? 'DECLINED' : 'RESCHEDULE', note, date: proposedDate });
        const verb = action === 'DECLINE' ? 'declined (refunded to the advertiser)' : 'sent back to the advertiser to pick new dates';
        return res.json({ success: true, message: `${done.length} spot${done.length === 1 ? '' : 's'} ${verb}${skipped.length ? `; ${skipped.length} skipped` : ''}`, data: { done: done.length, skipped } });
    } catch (error) {
        console.error('❌ Bulk station error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to update the spots' });
    }
};

// ═════════════ Agency dashboard: today, next 7 days, waiting ═════════════
const getPlanSummary = async (req, res) => {
    try {
        const scope = advertiserScope(req);
        const bookings = await Booking.find({ ...scope, status: { $in: ['PENDING', 'ACCEPTED', 'SCHEDULED', 'COMPLETED', 'CHANGES_REQUESTED'] } }).populate('stationId', 'name');
        const today = todayLagos();
        const in7 = dateOnly(new Date(Date.now() + 7 * 864e5));
        const now = new Date();
        const out = { today: 0, todayByStation: {}, next7: 0, awaitingMediaHouse: 0, toCheck: 0, toReschedule: 0, liveCampaigns: new Set() };
        for (const b of bookings) {
            const d = dateOnly(b.date);
            if (b.status !== 'COMPLETED' && d >= today) out.liveCampaigns.add(String(b.campaignId));
            if (d === today && b.status !== 'COMPLETED') { out.today += 1; const n = b.stationId?.name || 'Media house'; out.todayByStation[n] = (out.todayByStation[n] || 0) + 1; }
            if (d > today && d <= in7 && LIVE.includes(b.status)) out.next7 += 1;
            if (['ACCEPTED', 'SCHEDULED'].includes(b.status) && spotHasAired(b, now)) out.awaitingMediaHouse += 1;
            if (b.escrow?.status === 'AIRED') out.toCheck += 1;
            if (b.status === 'CHANGES_REQUESTED') out.toReschedule += 1;
        }
        const wallet = await getOrCreateWallet(advertiserOwner(req));
        return res.json({ success: true, data: { ...out, liveCampaigns: out.liveCampaigns.size, held: round2(wallet.held || 0), available: round2(wallet.balance || 0) } });
    } catch (error) {
        console.error('❌ Plan summary error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to load the summary' });
    }
};

// ═════════════ Plan export (.xlsx, agency layout) ═════════════
// Lines from a booked campaign: one per media house + rate.
const linesFromBookings = (bookings) => {
    const map = new Map();
    for (const b of bookings) {
        if (['REJECTED', 'CANCELLED', 'NOT_AIRED'].includes(b.status)) continue;
        const key = `${b.stationId?._id || b.stationId}|${b.rateId}`;
        if (!map.has(key)) map.set(key, { station: b.stationId?.name || 'Media house', stationId: String(b.stationId?._id || b.stationId), rateId: String(b.rateId), programme: b.rateName || b.slot, time: b.time, spotSeconds: b.spotSeconds, unit: b.pricing || { gross: b.price, volumeDiscountPercent: 0, agencyCommissionPercent: 0, net: b.price, vat: 0, total: b.escrow?.amount || b.price }, byDate: new Map() });
        const l = map.get(key);
        const d = dateOnly(b.date);
        l.byDate.set(d, (l.byDate.get(d) || 0) + 1);
    }
    return [...map.values()].map((l) => {
        const spotsByDay = [0, 0, 0, 0, 0, 0, 0];
        for (const [d, n] of l.byDate) { const wd = new Date(`${d}T00:00:00Z`).getUTCDay(); spotsByDay[wd] = Math.max(spotsByDay[wd], n); }
        return { ...l, spotsByDay, spots: [...l.byDate.values()].reduce((t, n) => t + n, 0) };
    });
};

// Lines from a saved (unpaid) plan, priced now.
const linesFromQuote = (quote) => quote.lines.map((l) => {
    const byDate = new Map();
    (l.dates || []).forEach((d, i) => byDate.set(d, (l.spotsOn || [])[i] || 0));
    return { station: l.station.name, stationId: String(l.station._id), rateId: String(l.rate._id), programme: l.rate.name, time: l.rate.startTime ? `${l.rate.startTime}–${l.rate.endTime}` : 'In programme', spotSeconds: l.rate.spotSeconds, unit: l.unit, byDate, spotsByDay: l.spotsByDay, spots: l.spots };
});

const planWorkbook = ({ title, owner, campaign, lines, status }) => {
    const allDates = lines.flatMap((l) => [...l.byDate.keys()]).sort();
    const weeks = [];
    if (allDates.length) {
        for (let w = weekOf(allDates[0]); w <= allDates[allDates.length - 1]; w = dateOnly(new Date(new Date(`${w}T00:00:00Z`).getTime() + 7 * 864e5))) weeks.push(w);
    }
    const wkLabel = (w) => new Date(`${w}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
    const head = ['Media house', 'Programme / belt', 'Time', 'Length', 'Days', 'Rate card (₦)', 'Vol. disc. %', 'Agency comm. %', 'Net rate (₦)', 'Spots', 'Gross value (₦)', 'Net value (₦)', 'VAT (₦)', 'Total (₦)'];
    const rows = [
        [{ v: title, s: 'title' }],
        [{ v: 'Client', s: 'bold' }, owner],
        [{ v: 'Campaign', s: 'bold' }, campaign.name],
        [{ v: 'Period', s: 'bold' }, `${campaign.startDate ? dateOnly(campaign.startDate) : ''} to ${campaign.endDate ? dateOnly(campaign.endDate) : ''}`],
        [{ v: 'Status', s: 'bold' }, status],
        [],
        [...head, ...weeks.map((w) => `Wk ${wkLabel(w)}`)].map((v) => ({ v, s: 'header' })),
    ];
    const t = { gross: 0, net: 0, vat: 0, total: 0, spots: 0, vol: 0, ac: 0 };
    for (const l of lines) {
        const u = l.unit || {};
        const gross = round2((u.gross || 0) * l.spots), net = round2((u.net || 0) * l.spots), vat = round2((u.vat || 0) * l.spots), total = round2((u.total || 0) * l.spots);
        t.gross += gross; t.net += net; t.vat += vat; t.total += total; t.spots += l.spots;
        t.vol += round2((u.volumeDiscount || 0) * l.spots); t.ac += round2((u.agencyCommission || 0) * l.spots);
        const perWeek = weeks.map((w) => { let n = 0; for (const [d, c] of l.byDate) if (weekOf(d) === w) n += c; return n || ''; });
        rows.push([l.station, l.programme, l.time || '', l.spotSeconds ? `${l.spotSeconds}s` : '', perDayText(l.spotsByDay), { v: u.gross || 0, s: 'money' }, { v: u.volumeDiscountPercent || 0, s: 'percent' }, { v: u.agencyCommissionPercent || 0, s: 'percent' }, { v: u.net || 0, s: 'money' }, l.spots, { v: gross, s: 'money' }, { v: net, s: 'money' }, { v: vat, s: 'money' }, { v: total, s: 'money' }, ...perWeek]);
    }
    rows.push([{ v: 'Total', s: 'bold' }, '', '', '', '', '', '', '', '', { v: t.spots, s: 'bold' }, { v: round2(t.gross), s: 'moneyBold' }, { v: round2(t.net), s: 'moneyBold' }, { v: round2(t.vat), s: 'moneyBold' }, { v: round2(t.total), s: 'moneyBold' }]);
    const summary = [
        [{ v: 'Cost summary', s: 'title' }],
        [{ v: 'Item', s: 'header' }, { v: 'Amount (₦)', s: 'header' }],
        ['Gross (rate card)', { v: round2(t.gross), s: 'money' }],
        ['Volume discount', { v: -round2(t.vol), s: 'money' }],
        ['Agency commission', { v: -round2(t.ac), s: 'money' }],
        ['Net', { v: round2(t.net), s: 'money' }],
        [`VAT ${getVatPercent()}%`, { v: round2(t.vat), s: 'money' }],
        [{ v: 'Total', s: 'bold' }, { v: round2(t.total), s: 'moneyBold' }],
        ['Savings', { v: round2(t.vol + t.ac), s: 'money' }],
        [],
        ['Media house', 'Spots', 'Net (₦)', 'Total (₦)'].map((v) => ({ v, s: 'header' })),
        ...Object.values(lines.reduce((a, l) => {
            const k = l.station; a[k] = a[k] || { name: k, spots: 0, net: 0, total: 0 };
            a[k].spots += l.spots; a[k].net += (l.unit?.net || 0) * l.spots; a[k].total += (l.unit?.total || 0) * l.spots; return a;
        }, {})).map((r) => [r.name, r.spots, { v: round2(r.net), s: 'money' }, { v: round2(r.total), s: 'money' }]),
    ];
    return buildXlsx([
        { name: 'Media plan', rows, widths: [24, 24, 14, 8, 20, 14, 10, 12, 14, 8, 16, 16, 14, 16, ...weeks.map(() => 9)] },
        { name: 'Cost summary', rows: summary, widths: [24, 16, 16, 16] },
    ]);
};

const sendXlsx = (res, name, buf) => {
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${name.replace(/[^\w.-]+/g, '-')}"`);
    res.setHeader('Cache-Control', 'no-store');
    return res.end(buf);
};

const ownerName = async (req) => {
    const owner = advertiserOwner(req);
    if (owner.companyId) return (await Company.findById(owner.companyId).select('name'))?.name || 'Company';
    return req.user.name || 'Advertiser';
};

// GET /campaigns/:id/plan.xlsx — the booked plan.
const exportCampaignPlan = async (req, res) => {
    try {
        if (!isId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid campaign' });
        const campaign = await Campaign.findOne({ _id: req.params.id, ...advertiserScope(req) });
        if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
        const bookings = await Booking.find({ campaignId: campaign._id }).populate('stationId', 'name');
        const lines = linesFromBookings(bookings);
        if (!lines.length) return res.status(404).json({ success: false, message: 'Nothing booked on this campaign yet' });
        return sendXlsx(res, `${campaign.name}-media-plan.xlsx`, planWorkbook({ title: 'Media plan', owner: await ownerName(req), campaign, lines, status: 'Booked' }));
    } catch (error) {
        console.error('❌ Plan export error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to export the plan' });
    }
};

// GET /media-plans/drafts/:campaignId/export — the saved (unpaid) plan.
const exportDraftPlan = async (req, res) => {
    try {
        const ctx = await draftQuote(req, req.params.campaignId);
        if (ctx.error) return res.status(ctx.status).json({ success: false, message: ctx.error });
        return sendXlsx(res, `${ctx.campaign.name}-media-plan.xlsx`, planWorkbook({ title: 'Media plan (proposal)', owner: await ownerName(req), campaign: ctx.campaign, lines: linesFromQuote(ctx.quote), status: 'Proposal, not booked' }));
    } catch (error) {
        console.error('❌ Draft export error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to export the plan' });
    }
};

// Price a saved draft (shared by export and share links).
const draftQuote = async (req, campaignId, draftDoc = null) => {
    if (!isId(campaignId)) return { status: 400, error: 'Invalid campaign' };
    const owner = advertiserOwner(req);
    const scope = owner.companyId ? { companyId: owner.companyId } : { companyId: null, userId: owner.userId };
    const draft = draftDoc || await PlanDraft.findOne({ ...scope, campaignId });
    if (!draft || !draft.lines.length) return { status: 404, error: 'This plan is not in your cart' };
    const campaign = await Campaign.findById(draft.campaignId);
    const ctx = await plans.preparePlanFor(req, { campaignId: String(draft.campaignId), creativeId: draft.creativeId ? String(draft.creativeId) : undefined, lines: draft.lines.map((l) => ({ stationId: String(l.stationId), rateId: String(l.rateId), spotsByDay: [...l.spotsByDay], startDate: l.startDate || undefined, endDate: l.endDate || undefined, offWeeks: [...(l.offWeeks || [])] })) });
    if (ctx.status) return { status: ctx.status, error: ctx.body.message };
    return { draft, campaign, quote: { lines: ctx.plan.lines, totals: ctx.plan.totals, errors: ctx.plan.errors } };
};

// ═════════════ Client approval link ═════════════
const shareUrl = (token) => `/plan-review/${token}`;

// POST /media-plans/drafts/:campaignId/share — a link the client can open without an account.
const shareDraft = async (req, res) => {
    try {
        const ctx = await draftQuote(req, req.params.campaignId);
        if (ctx.error) return res.status(ctx.status).json({ success: false, message: ctx.error });
        let share = await PlanShare.findOne({ draftId: ctx.draft._id });
        if (!share) {
            share = await PlanShare.create({ token: crypto.randomBytes(24).toString('base64url'), draftId: ctx.draft._id, campaignId: ctx.draft.campaignId, companyId: ctx.draft.companyId || null, userId: advertiserOwner(req).userId, createdBy: req.user._id });
        }
        return res.json({ success: true, data: { token: share.token, path: shareUrl(share.token), status: shareStatus(share, ctx.draft) } });
    } catch (error) {
        console.error('❌ Share error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to create the link' });
    }
};

// Approved, but the plan changed afterwards → needs approving again.
const shareStatus = (share, draft) => {
    if (!share) return null;
    const changed = share.respondedAt && draft && new Date(draft.changedAt || draft.updatedAt) > new Date(share.respondedAt);
    return { decision: share.decision || 'WAITING', respondedAt: share.respondedAt || null, name: share.responderName || null, comment: share.comment || null, changedSince: !!changed, path: shareUrl(share.token) };
};

const loadShare = async (token) => {
    if (typeof token !== 'string' || token.length < 20 || token.length > 64) return null;
    const share = await PlanShare.findOne({ token });
    if (!share) return null;
    const draft = await PlanDraft.findById(share.draftId);
    return { share, draft };
};

// GET /public/plan-shares/:token — read-only plan for the client (no login).
const viewShare = async (req, res) => {
    try {
        const found = await loadShare(req.params.token);
        if (!found || !found.draft) return res.status(404).json({ success: false, message: 'This link is no longer active (the plan may have been booked or removed).' });
        const { share, draft } = found;
        const fakeReq = { advertiser: draft.companyId ? { kind: 'COMPANY', companyId: draft.companyId } : { kind: 'INDIVIDUAL', userId: draft.userId, companyId: null }, user: { _id: draft.userId } };
        const ctx = await draftQuote(fakeReq, String(draft.campaignId), draft);
        if (ctx.error) return res.status(ctx.status).json({ success: false, message: ctx.error });
        const agency = draft.companyId ? (await Company.findById(draft.companyId).select('name'))?.name : (await User.findById(draft.userId).select('name'))?.name;
        return res.json({
            success: true,
            data: {
                agency: agency || 'Your agency',
                campaign: { name: ctx.campaign.name, startDate: ctx.campaign.startDate, endDate: ctx.campaign.endDate, clientBrand: ctx.campaign.clientBrand || null },
                lines: ctx.quote.lines.map((l) => ({ station: l.station.name, programme: l.rate.name, time: l.rate.startTime ? `${l.rate.startTime}–${l.rate.endTime}` : null, spotSeconds: l.rate.spotSeconds, days: perDayText(l.spotsByDay), spots: l.spots, firstDate: l.dates[0], lastDate: l.dates[l.dates.length - 1], unit: l.unit, totals: l.totals })),
                totals: ctx.quote.totals,
                status: shareStatus(share, draft),
            },
        });
    } catch (error) {
        console.error('❌ View share error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Could not load the plan' });
    }
};

// POST /public/plan-shares/:token/respond { name, decision: APPROVE | CHANGES, comment }
const respondShare = async (req, res) => {
    try {
        const found = await loadShare(req.params.token);
        if (!found || !found.draft) return res.status(404).json({ success: false, message: 'This link is no longer active.' });
        const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 80) : '';
        const comment = typeof req.body?.comment === 'string' ? req.body.comment.trim().slice(0, 1000) : '';
        const decision = String(req.body?.decision || '').toUpperCase();
        if (!name) return res.status(400).json({ success: false, message: 'Enter your name' });
        if (!['APPROVE', 'CHANGES'].includes(decision)) return res.status(400).json({ success: false, message: 'Approve it or ask for changes' });
        if (decision === 'CHANGES' && !comment) return res.status(400).json({ success: false, message: 'Say what you would like changed' });
        const share = await PlanShare.findOneAndUpdate(
            { _id: found.share._id },
            { $set: { decision: decision === 'APPROVE' ? 'APPROVED' : 'CHANGES_REQUESTED', responderName: name, comment: comment || null, respondedAt: new Date() }, $push: { history: { decision, name, comment: comment || null, at: new Date() } } },
            { returnDocument: 'after' }
        );
        await notifyPlanShareResponse(share, found.draft);
        return res.json({ success: true, message: decision === 'APPROVE' ? 'Thank you. The plan is approved.' : 'Thank you. Your comments have been sent.', data: shareStatus(share, found.draft) });
    } catch (error) {
        console.error('❌ Respond share error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Could not save your response' });
    }
};

// ═════════════ Invoices, receipts, credit notes ═════════════
const sellerDetails = () => ({
    name: process.env.INVOICE_LEGAL_NAME || 'Media Masters',
    address: process.env.INVOICE_ADDRESS || 'Lagos, Nigeria',
    tin: process.env.INVOICE_TIN || null,
    email: process.env.INVOICE_EMAIL || null,
});

const billedTo = async (req) => {
    const owner = advertiserOwner(req);
    const v = await Verification.findOne(owner.companyId ? { companyId: owner.companyId } : { userId: owner.userId });
    const company = owner.companyId ? await Company.findById(owner.companyId).select('name') : null;
    return { name: v?.businessName || company?.name || req.user.name || 'Customer', address: v?.address || null, tin: v?.taxId || null, rcNumber: v?.registrationNumber || null, email: req.user.email || null };
};

// GET /invoices — every document for this account.
const listInvoices = async (req, res) => {
    try {
        const owner = advertiserOwner(req);
        const wallet = await getOrCreateWallet(owner);
        const [payments, txs] = await Promise.all([
            Payment.find({ ...advertiserScope(req), status: { $in: ['SUCCESSFUL', 'REFUNDED'] } }),
            WalletTransaction.find({ walletId: wallet._id, type: { $in: ['FUND', 'REFUND'] } }),
        ]);
        const campaigns = new Map((await Campaign.find({ _id: { $in: [...new Set(payments.map((p) => String(p.campaignId)))] } }).select('name')).map((c) => [String(c._id), c.name]));
        const docs = [
            ...payments.map((p) => ({ kind: 'invoice', id: p._id, number: `INV-${p.reference}`, date: p.createdAt, title: `Airtime: ${campaigns.get(String(p.campaignId)) || 'campaign'}`, amount: round2(p.amount), vat: round2(p.vat || 0) })),
            ...txs.filter((t) => t.type === 'FUND').map((t) => ({ kind: 'receipt', id: t._id, number: `RCT-${t.reference || String(t._id).slice(-8)}`, date: t.createdAt, title: 'Wallet top-up', amount: round2(t.amount), vat: 0 })),
            ...txs.filter((t) => t.type === 'REFUND').map((t) => ({ kind: 'credit', id: t._id, number: `CRN-${t.reference || String(t._id).slice(-8)}`, date: t.createdAt, title: t.note || 'Refund to wallet', amount: round2(t.amount), vat: 0 })),
        ].sort((a, b) => new Date(b.date) - new Date(a.date));
        return res.json({ success: true, data: docs });
    } catch (error) {
        console.error('❌ Invoices error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to load invoices' });
    }
};

// GET /invoices/:kind/:id — one document, ready to print.
const getInvoice = async (req, res) => {
    try {
        const { kind, id } = req.params;
        if (!isId(id) || !['invoice', 'receipt', 'credit'].includes(kind)) return res.status(400).json({ success: false, message: 'Invalid document' });
        const base = { seller: sellerDetails(), billedTo: await billedTo(req), vatPercent: getVatPercent() };
        if (kind === 'invoice') {
            const p = await Payment.findOne({ _id: id, ...advertiserScope(req) });
            if (!p) return res.status(404).json({ success: false, message: 'Not found' });
            const campaign = await Campaign.findById(p.campaignId).select('name clientBrand');
            const bookings = await Booking.find({ paymentId: p._id }).populate('stationId', 'name');
            const groups = new Map();
            for (const b of bookings) {
                const k = `${b.stationId?._id || b.stationId}|${b.rateId}`;
                if (!groups.has(k)) groups.set(k, { description: `${b.stationId?.name || 'Media house'} · ${b.rateName || b.slot}${b.spotSeconds ? ` · ${b.spotSeconds}s` : ''}`, qty: 0, gross: b.pricing?.gross ?? b.price, unitNet: b.pricing?.net ?? null, unitVat: b.pricing?.vat ?? null, first: dateOnly(b.date), last: dateOnly(b.date) });
                const g = groups.get(k);
                g.qty += 1;
                const d = dateOnly(b.date);
                if (d < g.first) g.first = d;
                if (d > g.last) g.last = d;
            }
            const items = [...groups.values()].map((g) => ({ ...g, net: g.unitNet != null ? round2(g.unitNet * g.qty) : null, vat: g.unitVat != null ? round2(g.unitVat * g.qty) : null }));
            return res.json({ success: true, data: { ...base, kind, title: 'Tax invoice', number: `INV-${p.reference}`, date: p.createdAt, campaign: campaign ? { name: campaign.name, clientBrand: campaign.clientBrand || null } : null, items, totals: { gross: round2(p.subtotal || 0), discount: round2(p.discount || 0), net: round2((p.amount || 0) - (p.vat || 0) - (p.platformFee || 0)), platformFee: round2(p.platformFee || 0), vat: round2(p.vat || 0), total: round2(p.amount || 0), refunded: round2(p.refundAmount || 0) }, paidWith: p.provider === 'WALLET' ? 'Wallet (held until each spot airs)' : p.provider } });
        }
        const wallet = await getOrCreateWallet(advertiserOwner(req));
        const t = await WalletTransaction.findOne({ _id: id, walletId: wallet._id, type: kind === 'receipt' ? 'FUND' : 'REFUND' });
        if (!t) return res.status(404).json({ success: false, message: 'Not found' });
        return res.json({ success: true, data: { ...base, kind, title: kind === 'receipt' ? 'Receipt' : 'Credit note', number: `${kind === 'receipt' ? 'RCT' : 'CRN'}-${t.reference || String(t._id).slice(-8)}`, date: t.createdAt, items: [{ description: kind === 'receipt' ? `Wallet top-up${t.method === 'TEST' ? ' (test mode)' : ''}` : (t.note || 'Refund to wallet'), qty: 1, net: round2(t.amount), vat: 0 }], totals: { total: round2(t.amount) } } });
    } catch (error) {
        console.error('❌ Invoice error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to load the document' });
    }
};

// ═════════════ Proof-of-airing report ═════════════
const getCampaignReport = async (req, res) => {
    try {
        if (!isId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid campaign' });
        const campaign = await Campaign.findOne({ _id: req.params.id, ...advertiserScope(req) }).select('name clientBrand startDate endDate status');
        if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
        const bookings = (await Booking.find({ campaignId: campaign._id }).populate('stationId', 'name type'))
            .sort((a, b) => dateOnly(a.date).localeCompare(dateOnly(b.date)) || String(a.time).localeCompare(String(b.time)));
        const byStation = new Map();
        for (const b of bookings) {
            const k = String(b.stationId?._id || b.stationId);
            if (!byStation.has(k)) byStation.set(k, { station: b.stationId?.name || 'Media house', planned: 0, aired: 0, notAired: 0, cancelled: 0, disputed: 0, upcoming: 0, spent: 0 });
            const r = byStation.get(k);
            r.planned += 1;
            if (b.status === 'COMPLETED') r.aired += 1;
            else if (b.status === 'NOT_AIRED') r.notAired += 1;
            else if (['REJECTED', 'CANCELLED'].includes(b.status)) r.cancelled += 1;
            else r.upcoming += 1;
            if (b.escrow?.status === 'DISPUTED') r.disputed += 1;
            r.spent = round2(r.spent + (b.escrow?.released || 0));
        }
        const spots = bookings.filter((b) => ['COMPLETED', 'NOT_AIRED'].includes(b.status)).map((b) => ({
            _id: b._id, bookingReference: b.bookingReference, station: b.stationId?.name || 'Media house', date: b.date, time: b.time, programme: b.rateName || b.slot, spotSeconds: b.spotSeconds,
            status: b.status, airedAt: b.escrow?.airedAt || null, hasLog: !!b.escrow?.proof?.logFileId, hasClip: !!b.escrow?.proof?.clipFileId, note: b.escrow?.proof?.note || b.stationNote || null, payment: b.escrow?.status || null,
        }));
        return res.json({ success: true, data: { campaign, owner: await ownerName(req), generatedAt: new Date(), stations: [...byStation.values()], spots } });
    } catch (error) {
        console.error('❌ Report error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to build the report' });
    }
};

// ═════════════ Copy a plan from another campaign ═════════════
// GET /media-plans/sources — campaigns with a saved or booked plan.
const listPlanSources = async (req, res) => {
    try {
        const scope = advertiserScope(req);
        const owner = advertiserOwner(req);
        const draftScope = owner.companyId ? { companyId: owner.companyId } : { companyId: null, userId: owner.userId };
        const [drafts, booked] = await Promise.all([PlanDraft.find(draftScope).select('campaignId lines'), Booking.find({ ...scope, rateId: { $ne: null } }).select('campaignId')]);
        const counts = new Map();
        drafts.forEach((d) => counts.set(String(d.campaignId), { saved: d.lines.length, booked: 0 }));
        booked.forEach((b) => { const k = String(b.campaignId); const c = counts.get(k) || { saved: 0, booked: 0 }; c.booked += 1; counts.set(k, c); });
        const campaigns = await Campaign.find({ _id: { $in: [...counts.keys()] }, ...scope }).select('name startDate endDate');
        return res.json({ success: true, data: campaigns.map((c) => ({ _id: c._id, name: c.name, startDate: c.startDate, endDate: c.endDate, savedLines: counts.get(String(c._id)).saved, bookedSpots: counts.get(String(c._id)).booked })) });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to load your plans' });
    }
};

// GET /media-plans/sources/:campaignId — its lines (station, rate, spots per day, weeks off).
const getPlanSource = async (req, res) => {
    try {
        if (!isId(req.params.campaignId)) return res.status(400).json({ success: false, message: 'Invalid campaign' });
        const owner = advertiserOwner(req);
        const draftScope = owner.companyId ? { companyId: owner.companyId } : { companyId: null, userId: owner.userId };
        const draft = await PlanDraft.findOne({ ...draftScope, campaignId: req.params.campaignId });
        if (draft && draft.lines.length) return res.json({ success: true, data: draft.lines.map((l) => ({ stationId: String(l.stationId), rateId: String(l.rateId), spotsByDay: [...l.spotsByDay] })) });
        const bookings = await Booking.find({ campaignId: req.params.campaignId, ...advertiserScope(req), rateId: { $ne: null } });
        return res.json({ success: true, data: linesFromBookings(bookings).map((l) => ({ stationId: l.stationId, rateId: l.rateId, spotsByDay: l.spotsByDay })) });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to load the plan' });
    }
};

// ═════════════ Admin: money and operations overview ═════════════
const getMoneyOverview = async (req, res) => {
    try {
        const { confirmHours } = await getSettlementSettings();
        const now = Date.now();
        const [wallets, live, disputes, pendingPayouts, pendingAgreements] = await Promise.all([
            Wallet.find({}),
            Booking.find({ 'escrow.status': { $in: ['HELD', 'AIRED', 'DISPUTED', 'RELEASED', 'REFUNDED', 'SPLIT'] } }).populate('stationId', 'name').populate('companyId', 'name'),
            Booking.countDocuments({ 'escrow.status': 'DISPUTED' }),
            PayoutRequest.countDocuments({ status: 'PENDING' }),
            VolumeAgreement.countDocuments({ status: 'PENDING' }),
        ]);
        const adv = wallets.filter((w) => !w.stationId);
        const st = wallets.filter((w) => w.stationId);
        const late = {};
        const agencies = {};
        const stations = {};
        let lateCount = 0;
        for (const b of live) {
            const slotEnd = airTimeOf(b).getTime() + (Number(b.duration) || 0) * 60000;
            if (['ACCEPTED', 'SCHEDULED'].includes(b.status) && b.escrow.status === 'HELD' && now > slotEnd + confirmHours * 3600000) {
                lateCount += 1; const n = b.stationId?.name || 'Media house'; late[n] = (late[n] || 0) + 1;
            }
            const a = b.companyId?.name || 'Individual';
            agencies[a] = round2((agencies[a] || 0) + (b.escrow.amount || 0) - (b.escrow.refunded || 0));
            const s = b.stationId?.name || 'Media house';
            stations[s] = round2((stations[s] || 0) + (b.escrow.stationAmount || 0));
        }
        const top = (o) => Object.entries(o).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([name, value]) => ({ name, value }));
        const sum = (arr, k) => round2(arr.reduce((t, w) => t + (w[k] || 0), 0));
        return res.json({
            success: true,
            data: {
                advertisers: { available: sum(adv, 'balance'), held: sum(adv, 'held'), spent: sum(adv, 'totalSpent'), refunded: sum(adv, 'totalRefunded'), funded: sum(adv, 'totalFunded') },
                mediaHouses: { earned: sum(st, 'totalEarned'), available: sum(st, 'balance'), paidOut: sum(st, 'totalPaidOut') },
                openDisputes: disputes, pendingPayouts, pendingAgreements,
                lateConfirmations: { count: lateCount, byStation: top(late) },
                topAgencies: top(agencies), topStations: top(stations),
            },
        });
    } catch (error) {
        console.error('❌ Money overview error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to load the overview' });
    }
};

// ═════════════ Admin: read-only support view ═════════════
// POST /admin/support-view { userId } → a 30-minute token that can only read.
const startSupportView = async (req, res) => {
    try {
        if (!isId(req.body?.userId)) return res.status(400).json({ success: false, message: 'Choose the account' });
        const user = await User.findById(req.body.userId).select('name email accountType status companyId tokenVersion');
        if (!user || user.accountType === 'ADMIN') return res.status(404).json({ success: false, message: 'Account not found' });
        const token = jwt.sign({ id: user._id, tokenVersion: user.tokenVersion || 0, readOnly: true, supportBy: String(req.user._id) }, process.env.JWT_SECRET, { expiresIn: '30m' });
        await AuditLog.create({ userId: req.user._id, action: 'UPDATE_USER', entityType: 'USER', entityId: user._id, metadata: { event: 'SUPPORT_VIEW', target: user.email } }).catch(() => {});
        return res.json({ success: true, data: { token, user: { _id: user._id, name: user.name, email: user.email, accountType: user.accountType, status: user.status, companyId: user.companyId } } });
    } catch (error) {
        console.error('❌ Support view error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to open the support view' });
    }
};

// GET /admin/support-accounts?q= — accounts to view (owners and media house logins).
const listSupportAccounts = async (req, res) => {
    try {
        const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase().slice(0, 60) : '';
        const users = await User.find({ accountType: { $in: ['COMPANY', 'INDIVIDUAL', 'STATION'] } }).select('name email accountType status companyId');
        const companies = new Map((await Company.find({ _id: { $in: users.map((u) => u.companyId).filter(Boolean) } }).select('name companyType')).map((c) => [String(c._id), c]));
        const data = users.map((u) => ({ _id: u._id, name: u.name, email: u.email, accountType: u.accountType, status: u.status, company: u.companyId ? companies.get(String(u.companyId))?.name || null : null, companyType: u.companyId ? companies.get(String(u.companyId))?.companyType || null : null }))
            .filter((u) => !q || `${u.name} ${u.email} ${u.company || ''}`.toLowerCase().includes(q)).slice(0, 50);
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to load accounts' });
    }
};

// ═════════════ Getting started checklist ═════════════
const getOnboarding = async (req, res) => {
    try {
        const u = req.user;
        if (u.accountType === 'STATION') {
            const stations = await Station.find({ managerIds: u._id }).select('rateCard airtimeHours blackouts payoutAccount');
            const pendingAgreements = stations.length ? await VolumeAgreement.countDocuments({ stationId: { $in: stations.map((s) => s._id) }, status: 'PENDING' }) : 0;
            const steps = [
                { key: 'password', label: 'Set your own password', done: !u.mustChangePassword, href: '/change-password' },
                { key: 'rates', label: 'Check your rate card', done: stations.some((s) => (s.rateCard || []).length > 0), href: '/station/profile' },
                { key: 'calendar', label: 'Set your airtime hours and blocked dates', done: stations.some((s) => s.airtimeHours && Object.keys(s.airtimeHours).length > 0), href: '/station/calendar' },
                { key: 'payout', label: 'Add the bank account for payouts', done: stations.some((s) => s.payoutAccount?.accountNumber), href: '/station/earnings' },
                { key: 'discounts', label: pendingAgreements ? `Confirm ${pendingAgreements} agency volume discount${pendingAgreements === 1 ? '' : 's'}` : 'Agency volume discounts confirmed', done: pendingAgreements === 0, href: '/station/discounts' },
            ];
            return res.json({ success: true, data: { steps } });
        }
        if (!['COMPANY', 'INDIVIDUAL'].includes(u.accountType)) return res.json({ success: true, data: { steps: [] } });
        const scope = u.accountType === 'INDIVIDUAL' ? { userId: u._id, companyId: null } : { companyId: u.companyId };
        const base = u.accountType === 'INDIVIDUAL' ? '' : '/company';
        const company = u.companyId ? await Company.findById(u.companyId).select('companyType status') : null;
        const isAgency = company?.companyType === 'AGENCY';
        const [campaigns, wallet, plansBooked, agreements] = await Promise.all([
            Campaign.find(scope).select('_id'),
            Wallet.findOne(u.accountType === 'INDIVIDUAL' ? { companyId: null, stationId: null, userId: u._id } : { companyId: u.companyId }),
            Booking.countDocuments({ ...scope, rateId: { $ne: null } }),
            isAgency ? VolumeAgreement.countDocuments({ companyId: u.companyId }) : 0,
        ]);
        const adverts = campaigns.length ? await Creative.countDocuments({ campaignId: { $in: campaigns.map((c) => c._id) }, status: 'APPROVED', 'arcon.fileId': { $ne: null } }) : 0;
        const steps = [
            { key: 'verified', label: 'Get your account verified', done: u.status === 'ACTIVE' && (!company || company.status !== 'PENDING'), href: '/verify' },
            { key: 'campaign', label: 'Create a campaign (start and end dates)', done: campaigns.length > 0, href: `${base}/campaigns` },
            { key: 'advert', label: 'Upload an advert with its ARCON certificate', done: adverts > 0, href: `${base}/campaigns` },
            { key: 'wallet', label: 'Fund your wallet', done: (wallet?.totalFunded || 0) > 0, href: `${base}/wallet` },
            ...(isAgency ? [{ key: 'discounts', label: 'Enter your volume discounts with media houses', done: agreements > 0, href: `${base}/discounts` }] : []),
            { key: 'plan', label: 'Book your first media plan', done: plansBooked > 0, href: `${base}/book` },
        ];
        return res.json({ success: true, data: { steps } });
    } catch (error) {
        console.error('❌ Onboarding error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to load your checklist' });
    }
};

module.exports = {
    bulkCampaign,
    bulkStation,
    getPlanSummary,
    exportCampaignPlan,
    exportDraftPlan,
    shareDraft,
    shareStatus,
    viewShare,
    respondShare,
    listInvoices,
    getInvoice,
    getCampaignReport,
    listPlanSources,
    getPlanSource,
    getMoneyOverview,
    startSupportView,
    listSupportAccounts,
    getOnboarding,
};
