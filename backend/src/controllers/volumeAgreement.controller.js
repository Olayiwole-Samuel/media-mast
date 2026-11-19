const mongoose = require('mongoose');
const VolumeAgreement = require('../models/VolumeAgreement');
const Station = require('../models/Station');
const Company = require('../models/Company');
const AuditLog = require('../models/AuditLog');
const { programmeKey } = require('../utils/mediaPlan');
const { advertiserOwner } = require('../utils/advertiser');
const { ownsStation, stationOwnerFilter } = require('../utils/stationOperator');
const { notifyAgreementRequested, notifyAgreementDecided } = require('../utils/notifications');

// ─────────────────────────────────────────────────────────────
// Volume discounts come from the existing agreement between a media agency
// and a media house. The agency enters the % (for the media house, and per
// programme where it differs); the media house confirms it. Only a
// confirmed (APPROVED) agreement is used to price the agency's plans.
// ─────────────────────────────────────────────────────────────

const isId = (v) => mongoose.isValidObjectId(v);
const pct = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n <= 90 ? Math.round(n * 100) / 100 : NaN; };

const programmesOf = (station) => {
    const map = new Map();
    for (const r of station.rateCard || []) {
        if (!r || r.isActive === false) continue;
        const key = programmeKey(r);
        if (!map.has(key)) map.set(key, { key, name: r.name, startTime: r.startTime || null, endTime: r.endTime || null, size: r.size || null, lengths: [] });
        if (r.spotSeconds) map.get(key).lengths.push(r.spotSeconds);
    }
    return [...map.values()].map((p) => ({ ...p, lengths: [...new Set(p.lengths)].sort((a, b) => b - a) }));
};

const publicAgreement = (a, extra = {}) => ({
    _id: a._id, stationId: a.stationId, companyId: a.companyId, percent: a.percent, programmes: a.programmes || [],
    status: a.status, agencyNote: a.agencyNote, stationNote: a.stationNote, decidedAt: a.decidedAt, updatedAt: a.updatedAt, ...extra,
});

const agencyOf = async (req) => {
    const owner = advertiserOwner(req);
    const company = owner.companyId ? await Company.findById(owner.companyId).select('name companyType') : null;
    return company && company.companyType === 'AGENCY' ? company : null;
};

// ── Agency ──

// GET /volume-agreements — every live media house, with this agency's agreement (if any).
const getMyAgreements = async (req, res) => {
    try {
        const agency = await agencyOf(req);
        if (!agency) return res.status(403).json({ success: false, code: 'AGENCY_ONLY', message: 'Volume discounts are for media agencies.' });
        const [stations, mine] = await Promise.all([
            Station.find({ isActive: true, approvalStatus: 'APPROVED' }).select('name type location rateCard'),
            VolumeAgreement.find({ companyId: agency._id }),
        ]);
        const byStation = new Map(mine.map((a) => [String(a.stationId), a]));
        const data = stations.map((s) => ({
            station: { _id: s._id, name: s.name, type: s.type, state: s.location?.state || null },
            programmes: programmesOf(s),
            agreement: byStation.has(String(s._id)) ? publicAgreement(byStation.get(String(s._id))) : null,
        })).sort((a, b) => (b.agreement ? 1 : 0) - (a.agreement ? 1 : 0) || a.station.name.localeCompare(b.station.name));
        return res.json({ success: true, data });
    } catch (error) {
        console.error('❌ Agreements error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to load volume discounts' });
    }
};

// PUT /volume-agreements/:stationId { percent, programmes:[{key, percent}], note }
// Any change goes back to the media house to confirm.
const saveMyAgreement = async (req, res) => {
    try {
        const agency = await agencyOf(req);
        if (!agency) return res.status(403).json({ success: false, code: 'AGENCY_ONLY', message: 'Volume discounts are for media agencies.' });
        if (req.user.accountType === 'EMPLOYEE') return res.status(403).json({ success: false, message: 'Only the account owner can set volume discounts.' });
        if (!isId(req.params.stationId)) return res.status(400).json({ success: false, message: 'Invalid media house' });
        const station = await Station.findOne({ _id: req.params.stationId, isActive: true, approvalStatus: 'APPROVED' }).select('name rateCard');
        if (!station) return res.status(404).json({ success: false, message: 'Media house not found' });

        const percent = pct(req.body?.percent ?? 0);
        if (Number.isNaN(percent)) return res.status(400).json({ success: false, message: 'Volume discount must be 0 to 90%' });
        const known = new Map(programmesOf(station).map((p) => [p.key, p.name]));
        const programmes = [];
        for (const p of Array.isArray(req.body?.programmes) ? req.body.programmes : []) {
            if (!p || p.percent === null || p.percent === '' || p.percent === undefined) continue;
            if (!known.has(p.key)) return res.status(400).json({ success: false, message: 'Unknown programme on this rate card' });
            const v = pct(p.percent);
            if (Number.isNaN(v)) return res.status(400).json({ success: false, message: 'Volume discount must be 0 to 90%' });
            programmes.push({ key: p.key, name: known.get(p.key), percent: v });
        }
        if (percent === 0 && !programmes.length) return res.status(400).json({ success: false, message: 'Enter the discount you have with this media house' });
        const agencyNote = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 500) || null : null;

        const set = { percent, programmes, agencyNote, status: 'PENDING', stationNote: null, decidedBy: null, decidedAt: null, requestedBy: req.user._id };
        const existing = await VolumeAgreement.findOne({ companyId: agency._id, stationId: station._id });
        const agreement = existing
            ? await VolumeAgreement.findOneAndUpdate({ _id: existing._id }, { $set: set }, { returnDocument: 'after' })
            : await VolumeAgreement.create({ companyId: agency._id, stationId: station._id, ...set });
        await AuditLog.create({ userId: req.user._id, companyId: agency._id, action: 'UPDATE_STATION', entityType: 'STATION', entityId: station._id, metadata: { event: 'VOLUME_AGREEMENT_REQUESTED', percent, programmes: programmes.length } }).catch(() => {});
        await notifyAgreementRequested(agreement, { agencyName: agency.name, station });
        return res.json({ success: true, message: `Sent to ${station.name} to confirm. It applies to your plans once they confirm it.`, data: publicAgreement(agreement) });
    } catch (error) {
        console.error('❌ Save agreement error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to save the volume discount' });
    }
};

const deleteMyAgreement = async (req, res) => {
    try {
        const agency = await agencyOf(req);
        if (!agency) return res.status(403).json({ success: false, code: 'AGENCY_ONLY', message: 'Volume discounts are for media agencies.' });
        if (!isId(req.params.stationId)) return res.status(400).json({ success: false, message: 'Invalid media house' });
        await VolumeAgreement.deleteOne({ companyId: agency._id, stationId: req.params.stationId });
        return res.json({ success: true, message: 'Volume discount removed' });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to remove the volume discount' });
    }
};

// ── Media house ──

// GET /station-portal/volume-agreements — agencies' discounts with my media houses.
const getStationAgreements = async (req, res) => {
    try {
        const stations = await Station.find(stationOwnerFilter(req)).select('name rateCard');
        const ids = stations.map((s) => s._id);
        const rows = ids.length ? await VolumeAgreement.find({ stationId: { $in: ids } }) : [];
        const companies = rows.length ? await Company.find({ _id: { $in: [...new Set(rows.map((r) => String(r.companyId)))] } }).select('name') : [];
        const names = new Map(companies.map((c) => [String(c._id), c.name]));
        const stationNames = new Map(stations.map((s) => [String(s._id), s.name]));
        const order = { PENDING: 0, APPROVED: 1, REJECTED: 2 };
        const data = rows.map((a) => publicAgreement(a, { agencyName: names.get(String(a.companyId)) || 'Agency', stationName: stationNames.get(String(a.stationId)) || 'Media house' }))
            .sort((a, b) => order[a.status] - order[b.status] || new Date(b.updatedAt) - new Date(a.updatedAt));
        return res.json({ success: true, data });
    } catch (error) {
        console.error('❌ Station agreements error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to load volume discounts' });
    }
};

// PATCH /station-portal/volume-agreements/:id { decision: APPROVE | REJECT, note }
const decideAgreement = async (req, res) => {
    try {
        if (!isId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid agreement' });
        const agreement = await VolumeAgreement.findById(req.params.id);
        const station = agreement ? await Station.findById(agreement.stationId).select('name managerIds companyId') : null;
        if (!agreement || !station || !ownsStation(req, station)) return res.status(404).json({ success: false, message: 'Not found' });
        const decision = String(req.body?.decision || '').toUpperCase();
        if (!['APPROVE', 'REJECT'].includes(decision)) return res.status(400).json({ success: false, message: 'Confirm or reject it' });
        const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 500) : '';
        if (decision === 'REJECT' && !note) return res.status(400).json({ success: false, message: "Say why, so the agency can correct it" });
        const updated = await VolumeAgreement.findOneAndUpdate(
            { _id: agreement._id, updatedAt: agreement.updatedAt },
            { $set: { status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED', stationNote: note || null, decidedBy: req.user._id, decidedAt: new Date() } },
            { returnDocument: 'after' }
        );
        if (!updated) return res.status(409).json({ success: false, message: 'The agency changed this discount; reload and check it again' });
        await AuditLog.create({ userId: req.user._id, action: 'UPDATE_STATION', entityType: 'STATION', entityId: station._id, metadata: { event: `VOLUME_AGREEMENT_${updated.status}`, percent: updated.percent } }).catch(() => {});
        await notifyAgreementDecided(updated, { station });
        return res.json({ success: true, message: decision === 'APPROVE' ? 'Confirmed. It now applies to this agency\'s plans.' : 'Rejected. The agency has been told.', data: publicAgreement(updated) });
    } catch (error) {
        console.error('❌ Decide agreement error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to update the volume discount' });
    }
};

// ── Admin: every agreement (read-only overview) ──
const getAdminAgreements = async (req, res) => {
    try {
        const rows = await VolumeAgreement.find({});
        const [companies, stations] = await Promise.all([
            Company.find({ _id: { $in: [...new Set(rows.map((r) => String(r.companyId)))] } }).select('name'),
            Station.find({ _id: { $in: [...new Set(rows.map((r) => String(r.stationId)))] } }).select('name'),
        ]);
        const cn = new Map(companies.map((c) => [String(c._id), c.name]));
        const sn = new Map(stations.map((s) => [String(s._id), s.name]));
        const data = rows.map((a) => publicAgreement(a, { agencyName: cn.get(String(a.companyId)) || 'Agency', stationName: sn.get(String(a.stationId)) || 'Media house' }))
            .sort((a, b) => a.stationName.localeCompare(b.stationName) || a.agencyName.localeCompare(b.agencyName));
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to load volume discounts' });
    }
};

module.exports = { getMyAgreements, saveMyAgreement, deleteMyAgreement, getStationAgreements, decideAgreement, getAdminAgreements };
