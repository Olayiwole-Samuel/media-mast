// D4 verification harness — offline. Real Campaign/AuditLog schemas, in-memory persistence, dummy JWT secret.
process.env.JWT_SECRET = 'd4-harness-dummy-secret';
process.env.JWT_EXPIRE = '5m';

const path = require('path');
const BACKEND = path.resolve(__dirname, '..', '..'); // backend/ (this file: backend/test/offline/)
const mongoose = require(path.join(BACKEND, 'node_modules', 'mongoose'));
const jwt = require(path.join(BACKEND, 'node_modules', 'jsonwebtoken'));
mongoose.set('bufferCommands', false);

const src = (p) => require(path.join(BACKEND, 'src', p));
const User = src('models/User');
const Employee = src('models/Employee');
const Company = src('models/Company');
const Campaign = src('models/Campaign');
const Booking = src('models/Booking');
const Creative = src('models/Creative');
const AuditLog = src('models/AuditLog');

const OID = () => new mongoose.Types.ObjectId();
const CO = OID(), CO2 = OID();
const U = { admin: OID(), owner: OID(), editor: OID(), submitter: OID(), owner2: OID(), indiv: OID() };

let db, audit, raceStatus;
const seed = () => {
    audit = []; raceStatus = null;
    db = {
        users: [
            { _id: U.admin, accountType: 'ADMIN', status: 'ACTIVE', companyId: null, name: 'Admin', email: 'a@t.local' },
            { _id: U.owner, accountType: 'COMPANY', status: 'ACTIVE', companyId: CO, name: 'Owner A', email: 'oa@t.local' },
            { _id: U.editor, accountType: 'EMPLOYEE', status: 'ACTIVE', companyId: CO, name: 'Editor', email: 'e@t.local' },
            { _id: U.submitter, accountType: 'EMPLOYEE', status: 'ACTIVE', companyId: CO, name: 'Submitter', email: 's@t.local' },
            { _id: U.owner2, accountType: 'COMPANY', status: 'ACTIVE', companyId: CO2, name: 'Owner B', email: 'ob@t.local' },
            { _id: U.indiv, accountType: 'INDIVIDUAL', status: 'ACTIVE', companyId: null, name: 'Ivy', email: 'i@t.local' },
        ],
        employees: [
            { _id: OID(), userId: U.owner, companyId: CO, position: 'Company Owner', permissions: ['ALL_ACCESS'], isActive: true },
            { _id: OID(), userId: U.editor, companyId: CO, position: 'Editor', permissions: ['CAMPAIGN_VIEW', 'CAMPAIGN_EDIT'], isActive: true },
            { _id: OID(), userId: U.submitter, companyId: CO, position: 'Submitter', permissions: ['CAMPAIGN_VIEW', 'CAMPAIGN_SUBMIT'], isActive: true },
            { _id: OID(), userId: U.owner2, companyId: CO2, position: 'Company Owner', permissions: ['ALL_ACCESS'], isActive: true },
        ],
        companies: [{ _id: CO, name: 'A Co', status: 'APPROVED' }, { _id: CO2, name: 'B Co', status: 'APPROVED' }],
        campaigns: [], bookings: [], creatives: [],
    };
    db.users.forEach((u) => { u.id = String(u._id); });
};
const mkCampaign = (status, owner = { companyId: CO, userId: U.owner }) => {
    const c = new Campaign({ name: `C-${status}`, objective: 'BRAND_AWARENESS', budget: 1000, status, ...owner });
    db.campaigns.push(c);
    return c;
};
const getC = (id) => db.campaigns.find((c) => String(c._id) === String(id));

const matches = (d, f) => Object.entries(f).every(([k, v]) => String(d[k]) === String(v));
const asDoc = (d) => d && (typeof d.save === 'function' ? d : Object.assign(d, { save: async () => d, toObject: () => ({ ...d }) }));
const q = (v) => { const x = { select: () => x, populate: () => x, lean: () => x, sort: () => x, then: (r, j) => Promise.resolve(v).then(r, j) }; return x; };
const fake = (M, c) => {
    M.findById = (id) => q(asDoc(db[c].find((d) => String(d._id) === String(id)) || null));
    M.findOne = (f) => q(asDoc(db[c].find((d) => matches(d, f)) || null));
    M.find = (f = {}) => q(db[c].filter((d) => matches(d, f)));
    M.deleteMany = async (f) => { const before = db[c].length; db[c] = db[c].filter((d) => !matches(d, f)); return { deletedCount: before - db[c].length }; };
};
fake(User, 'users'); fake(Employee, 'employees'); fake(Company, 'companies');
fake(Campaign, 'campaigns'); fake(Booking, 'bookings'); fake(Creative, 'creatives');
// Real-schema persistence for campaigns
Campaign.create = async (data) => { const c = new Campaign(data); await c.validate(); db.campaigns.push(c); return c; };
Campaign.prototype.save = async function () { await this.validate(); return this; };
Campaign.prototype.deleteOne = async function () { db.campaigns = db.campaigns.filter((c) => c !== this); return {}; };
Campaign.findOneAndUpdate = (filter, update) => q((async () => {
    if (raceStatus) { const t = db.campaigns.find((c) => String(c._id) === String(filter._id)); if (t) t.status = raceStatus; raceStatus = null; } // concurrent writer
    const doc = db.campaigns.find((c) => matches(c, filter));
    if (!doc) return null;
    Object.assign(doc, update.$set);
    await doc.validate();
    return doc;
})());
AuditLog.create = async (data) => { const a = new AuditLog(data); await a.validate(); audit.push(a.toObject()); return a; };

const app = src('app');
const tok = (id) => jwt.sign({ id: String(id) }, process.env.JWT_SECRET, { expiresIn: '5m' });
const results = [];
const check = (label, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`); };

(async () => {
    const server = app.listen(0, '127.0.0.1'); // loopback only
    await new Promise((resolve, reject) => server.once('listening', resolve).once('error', reject)); // address() is null until bound
    const port = server.address().port;
    const call = async (who, method, url, body) => {
        const headers = { 'Content-Type': 'application/json' };
        if (who) headers.Authorization = `Bearer ${tok(who)}`;
        const r = await fetch(`http://127.0.0.1:${port}${url}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
        return { code: r.status, body: await r.json().catch(() => ({})) };
    };
    const setStatus = (who, c, status) => call(who, 'PATCH', `/api/v1/campaigns/${c._id}/status`, { status });
    const adminStatus = (c, status, who = U.admin) => call(who, 'PATCH', `/api/v1/admin/individuals/${U.indiv}/campaigns/${c._id}/status`, { status });

    // ── T1 creation: server owns initial status ──
    seed();
    let r = await call(U.owner, 'POST', '/api/v1/campaigns', { name: 'New', budget: 500, status: 'COMPLETED' });
    check('T1  Create with client status COMPLETED → 201 DRAFT', r.code === 201 && r.body.data?.status === 'DRAFT' && getC(r.body.data?._id)?.status === 'DRAFT', `${r.code} ${r.body.data?.status}`);
    r = await call(U.owner, 'POST', '/api/v1/campaigns', { name: 'New2', budget: 500, status: 'PAYMENT_SUCCESSFUL' });
    check('T1  Create with client status PAYMENT_SUCCESSFUL → DRAFT', r.code === 201 && getC(r.body.data?._id)?.status === 'DRAFT', `${r.body.data?.status}`);

    // ── T2 generic update cannot change status ──
    seed();
    let c = mkCampaign('DRAFT');
    r = await call(U.owner, 'PUT', `/api/v1/campaigns/${c._id}`, { name: 'Updated Campaign', status: 'COMPLETED' });
    const upd = audit.find((a) => a.action === 'UPDATE_CAMPAIGN');
    check('T2  PUT {name, status:COMPLETED} → 200, name updated, still DRAFT', r.code === 200 && c.name === 'Updated Campaign' && c.status === 'DRAFT' && r.body.data?.status === 'DRAFT', `${r.code} name=${c.name} status=${c.status}`);
    check('T2  Audit records applied fields only (no status)', upd && upd.metadata.updates.name === 'Updated Campaign' && !('status' in upd.metadata.updates), JSON.stringify(upd?.metadata?.updates));
    for (const s of ['PAYMENT_SUCCESSFUL', 'REFUNDED', 'LIVE', 'CANCELLED']) {
        r = await call(U.owner, 'PUT', `/api/v1/campaigns/${c._id}`, { description: 'x', status: s });
        check(`T2  PUT with status:${s} ignored → still DRAFT`, r.code === 200 && c.status === 'DRAFT', `${r.code} ${c.status}`);
    }
    r = await call(U.owner, 'PUT', `/api/v1/campaigns/${c._id}`, { status: 'COMPLETED' });
    check('T2  PUT {status} alone → 400 no valid fields, still DRAFT', r.code === 400 && c.status === 'DRAFT', `${r.code} ${r.body.message}`);

    // ── T3–T6 invalid jumps via dedicated endpoint ──
    for (const s of ['COMPLETED', 'LIVE', 'PAYMENT_SUCCESSFUL', 'REFUNDED', 'PROOF_UPLOADED']) {
        r = await setStatus(U.owner, c, s);
        check(`T3-6 DRAFT → ${s} rejected 400, still DRAFT`, r.code === 400 && c.status === 'DRAFT' && /DRAFT → /.test(r.body.message), `${r.code} ${r.body.message}`);
    }

    // ── T8 unknown / junk status ──
    for (const s of ['WHATEVER', { $ne: null }, null, 42]) {
        r = await setStatus(U.owner, c, s);
        check(`T8  status ${JSON.stringify(s)} → 400, unchanged`, r.code === 400 && c.status === 'DRAFT', `${r.code} ${r.body.message}`);
    }

    // ── T7 valid transition DRAFT → SUBMITTED + audit ──
    audit = [];
    r = await setStatus(U.owner, c, 'SUBMITTED');
    const sa = audit.find((a) => a.action === 'UPDATE_CAMPAIGN_STATUS');
    check('T7  DRAFT → SUBMITTED → 200, persisted, response shows SUBMITTED', r.code === 200 && c.status === 'SUBMITTED' && r.body.data?.status === 'SUBMITTED', `${r.code} ${c.status}`);
    check('T7  Audit UPDATE_CAMPAIGN_STATUS DRAFT→SUBMITTED, actor + campaign', sa && sa.metadata.oldStatus === 'DRAFT' && sa.metadata.newStatus === 'SUBMITTED' && String(sa.userId) === String(U.owner) && sa.entityId === String(c._id));
    r = await setStatus(U.owner, c, 'SUBMITTED');
    check('T7  SUBMITTED → SUBMITTED (no-op) → 400', r.code === 400 && c.status === 'SUBMITTED', `${r.code}`);
    r = await setStatus(U.owner, c, 'ACCEPTED');
    check('T10 Customer cannot self-accept: SUBMITTED → ACCEPTED → 400', r.code === 400 && c.status === 'SUBMITTED', `${r.code}`);

    // ── T10 payment statuses unreachable for customers from any reachable state ──
    seed();
    for (const start of ['DRAFT', 'SUBMITTED', 'REVISION_REQUESTED']) {
        for (const s of ['PAYMENT_PENDING', 'PAYMENT_SUCCESSFUL', 'REFUNDED', 'DISPUTED', 'FAILED']) {
            const cc = mkCampaign(start);
            r = await setStatus(U.owner, cc, s);
            check(`T10 ${start} → ${s} rejected`, r.code === 400 && cc.status === start, `${r.code}`);
        }
    }

    // ── T9 cancellation ──
    seed();
    c = mkCampaign('SUBMITTED');
    r = await setStatus(U.owner, c, 'CANCELLED');
    check('T9  SUBMITTED → CANCELLED → 200', r.code === 200 && c.status === 'CANCELLED', `${r.code}`);
    for (const s of ['DRAFT', 'SUBMITTED', 'LIVE']) {
        r = await setStatus(U.owner, c, s);
        check(`T9  CANCELLED → ${s} rejected (no revival)`, r.code === 400 && c.status === 'CANCELLED', `${r.code}`);
    }
    const d = mkCampaign('DRAFT');
    r = await setStatus(U.owner, d, 'CANCELLED');
    check('T9  DRAFT → CANCELLED → 200', r.code === 200 && d.status === 'CANCELLED', `${r.code}`);
    const rv = mkCampaign('REVISION_REQUESTED');
    r = await setStatus(U.owner, rv, 'SUBMITTED');
    check('T7b REVISION_REQUESTED → SUBMITTED (resubmit) → 200', r.code === 200 && rv.status === 'SUBMITTED', `${r.code}`);

    // ── T11 authorization (company routes) ──
    seed();
    c = mkCampaign('DRAFT');
    r = await setStatus(null, c, 'SUBMITTED');
    check('T11 No token → 401, unchanged', r.code === 401 && c.status === 'DRAFT');
    r = await setStatus(U.indiv, c, 'SUBMITTED');
    check('T11 Individual on a company campaign → 404 (not theirs), unchanged', r.code === 404 && c.status === 'DRAFT', `${r.code} ${r.body.message}`);
    r = await setStatus(U.editor, c, 'SUBMITTED');
    check('T11 Employee with CAMPAIGN_EDIT only → 403 on status, unchanged', r.code === 403 && c.status === 'DRAFT', `${r.code}`);
    r = await setStatus(U.admin, c, 'SUBMITTED');
    check('T11 Admin on company route → 403 (no companyId)', r.code === 403 && c.status === 'DRAFT', `${r.code}`);
    r = await setStatus(U.submitter, c, 'COMPLETED');
    check('T11 Employee with CAMPAIGN_SUBMIT → invalid jump still 400', r.code === 400 && c.status === 'DRAFT', `${r.code}`);
    r = await setStatus(U.submitter, c, 'SUBMITTED');
    check('T11 Employee with CAMPAIGN_SUBMIT → DRAFT → SUBMITTED 200', r.code === 200 && c.status === 'SUBMITTED', `${r.code}`);

    // ── T12 ownership isolation ──
    seed();
    c = mkCampaign('DRAFT');
    r = await setStatus(U.owner2, c, 'SUBMITTED');
    check('T12 Company B → Company A status → 404, unchanged', r.code === 404 && c.status === 'DRAFT', `${r.code}`);
    r = await call(U.owner2, 'PUT', `/api/v1/campaigns/${c._id}`, { name: 'Hijack' });
    check('T12 Company B → Company A update → 404, unchanged', r.code === 404 && c.name === 'C-DRAFT', `${r.code}`);

    // ── T13 stale/concurrent transition ──
    seed();
    c = mkCampaign('DRAFT');
    raceStatus = 'CANCELLED'; // another request lands between validation and write
    r = await setStatus(U.owner, c, 'SUBMITTED');
    check('T13 Concurrent change between check and write → 409, newer state kept', r.code === 409 && c.status === 'CANCELLED', `${r.code} ${c.status}`);

    // ── Admin (individual campaigns) ──
    seed();
    const ind = { companyId: null, userId: U.indiv };
    let ic = mkCampaign('SUBMITTED', ind);
    audit = [];
    r = await adminStatus(ic, 'ACCEPTED');
    check('AD  Admin SUBMITTED → ACCEPTED → 200 + audit', r.code === 200 && ic.status === 'ACCEPTED' && audit.some((a) => a.action === 'UPDATE_CAMPAIGN_STATUS' && a.changes?.status?.from === 'SUBMITTED' && a.changes?.status?.to === 'ACCEPTED'), `${r.code}`);
    ic = mkCampaign('SUBMITTED', ind);
    r = await adminStatus(ic, 'REVISION_REQUESTED');
    check('AD  Admin SUBMITTED → REVISION_REQUESTED → 200', r.code === 200 && ic.status === 'REVISION_REQUESTED', `${r.code}`);
    ic = mkCampaign('SUBMITTED', ind);
    r = await adminStatus(ic, 'REJECTED');
    check('AD  Admin SUBMITTED → REJECTED → 200', r.code === 200 && ic.status === 'REJECTED', `${r.code}`);
    ic = mkCampaign('DRAFT', ind);
    for (const s of ['COMPLETED', 'LIVE', 'PAYMENT_SUCCESSFUL', 'REFUNDED', 'DISPUTED', 'ACCEPTED']) {
        r = await adminStatus(ic, s);
        check(`AD  Admin DRAFT → ${s} rejected`, r.code === 400 && ic.status === 'DRAFT', `${r.code}`);
    }
    r = await adminStatus(ic, 'DRAFT');
    check('AD  Admin same status → 400 (existing "already" message)', r.code === 400 && /already/i.test(r.body.message), `${r.body.message}`);
    const rej = mkCampaign('REJECTED', ind);
    r = await adminStatus(rej, 'ACCEPTED');
    check('AD  Admin REJECTED → ACCEPTED rejected (terminal)', r.code === 400 && rej.status === 'REJECTED', `${r.code}`);
    r = await adminStatus(ic, 'SUBMITTED', U.owner);
    check('AD  Company owner on admin status route → 403', r.code === 403 && ic.status === 'DRAFT', `${r.code}`);
    r = await call(U.admin, 'PUT', `/api/v1/admin/individuals/${U.indiv}/campaigns/${ic._id}`, { name: 'Renamed', status: 'COMPLETED' });
    check('AD  Admin generic individual update ignores status', r.code === 200 && ic.name === 'Renamed' && ic.status === 'DRAFT', `${r.code} ${ic.status}`);
    r = await call(U.admin, 'POST', `/api/v1/admin/individuals/${U.indiv}/campaigns`, { name: 'Admin-made', budget: 10, status: 'LIVE' });
    check('AD  Admin create for individual ignores status → DRAFT', r.code === 201 && db.campaigns.find((x) => x.name === 'Admin-made')?.status === 'DRAFT', `${r.code}`);

    // ── T14 CRUD ──
    seed();
    const keep = mkCampaign('DRAFT');
    const sub = mkCampaign('SUBMITTED');
    r = await call(U.owner, 'GET', '/api/v1/campaigns');
    check('T14 GET list → 200 with both campaigns', r.code === 200 && r.body.data?.length === 2, `${r.code} ${r.body.data?.length}`);
    r = await call(U.owner, 'GET', `/api/v1/campaigns/${keep._id}`);
    check('T14 GET one → 200', r.code === 200 && r.body.data?.name === 'C-DRAFT', `${r.code}`);
    r = await call(U.owner, 'PUT', `/api/v1/campaigns/${keep._id}`, { budget: 2500, endDate: '2027-01-01' });
    check('T14 Editable fields still update', r.code === 200 && keep.budget === 2500, `${r.code} ${keep.budget}`);
    r = await call(U.owner, 'DELETE', `/api/v1/campaigns/${sub._id}`);
    check('T14 DELETE SUBMITTED → 403 (existing rule)', r.code === 403 && !!getC(sub._id), `${r.code}`);
    r = await call(U.owner, 'DELETE', `/api/v1/campaigns/${keep._id}`);
    check('T14 DELETE DRAFT → 200, removed', r.code === 200 && !getC(keep._id), `${r.code}`);

    const passed = results.filter(Boolean).length;
    console.log(`\n${passed}/${results.length} passed`);
    process.exitCode = passed === results.length ? 0 : 1;
    // Graceful shutdown: wait for the server and its keep-alive sockets to close, then let Node exit on its own.
    await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
        server.closeAllConnections();
    });
})().catch((e) => { console.log('HARNESS CRASH ' + e.stack); process.exitCode = 1; });
