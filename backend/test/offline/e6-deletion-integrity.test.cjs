// E6 verification harness — offline. Real app/routes/middleware/models, in-memory store, dummy JWT secret.
process.env.JWT_SECRET = 'e6-harness-dummy-secret';
process.env.JWT_EXPIRE = '5m';
delete process.env.VERCEL;

const path = require('path');
const BACKEND = path.resolve(__dirname, '..', '..'); // backend/ (this file: backend/test/offline/)
const mongoose = require(path.join(BACKEND, 'node_modules', 'mongoose'));
const jwt = require(path.join(BACKEND, 'node_modules', 'jsonwebtoken'));
mongoose.set('bufferCommands', false);

const src = (p) => require(path.join(BACKEND, 'src', p));
const User = src('models/User'), Employee = src('models/Employee'), Company = src('models/Company'), AuditLog = src('models/AuditLog');
const Campaign = src('models/Campaign'), Station = src('models/Station'), Booking = src('models/Booking'), Creative = src('models/Creative');
const Payment = src('models/Payment'), Department = src('models/Department');

const OID = () => new mongoose.Types.ObjectId();
let db;
const C = { users: User, employees: Employee, companies: Company, campaigns: Campaign, stations: Station, bookings: Booking, creatives: Creative, payments: Payment, departments: Department };
const clone = (o) => mongoose.mongo.BSON.deserialize(mongoose.mongo.BSON.serialize(o), { promoteValues: true });
const eq = (a, b) => (a == null && b == null) || (a != null && b != null && String(a) === String(b));
const cmp = (x, y) => (x instanceof Date ? x.getTime() : x) - (y instanceof Date ? y.getTime() : y);
const isId = (v) => /^[0-9a-fA-F]{24}$/.test(String(v));
const matches = (d, f = {}) => Object.entries(f).every(([k, v]) => {
    if (k === '$or') return v.some((g) => matches(d, g));
    const x = d[k];
    if (v && typeof v === 'object' && !(v instanceof mongoose.Types.ObjectId) && !(v instanceof Date) && !Array.isArray(v)) {
        if ('$in' in v) return v.$in.some((y) => eq(x, y));
        if ('$nin' in v) return !v.$nin.some((y) => eq(x, y));
        if ('$ne' in v) return !eq(x, v.$ne);
        if ('$lte' in v) return x != null && cmp(x, v.$lte) <= 0;
        if ('$gt' in v) return x != null && cmp(x, v.$gt) > 0;
        return true;
    }
    if (v instanceof Date) return x instanceof Date && x.getTime() === v.getTime();
    return eq(x, v);
});
const castCheck = (f) => { if (f && f._id !== undefined && typeof f._id !== 'object' && !isId(f._id)) throw new mongoose.Error.CastError('ObjectId', f._id, '_id'); };
const project = (o, sel) => {
    if (!o || !sel) return o;
    const parts = sel.split(/\s+/).filter(Boolean);
    if (parts.every((p) => p.startsWith('-') || p.startsWith('+'))) return o;
    const out = { _id: o._id }; parts.forEach((k) => { if (k in o) out[k] = o[k]; }); return out;
};
const toDoc = (M, c, o) => {
    if (!o) return null;
    const d = M.hydrate(clone(o));
    d.save = async () => { await d.validate(); const plain = d.toObject(); const i = db[c].findIndex((x) => eq(x._id, plain._id)); if (i >= 0) db[c][i] = plain; return d; };
    d.deleteOne = async () => { db[c] = db[c].filter((x) => !eq(x._id, d._id)); return { deletedCount: 1 }; };
    return d;
};
const q = (M, c, getter) => {
    let sel = null;
    const x = {
        select: (s) => { sel = s; return x; }, populate: () => x, lean: () => x, sort: () => x, limit: () => x, skip: () => x,
        then: (r, j) => Promise.resolve().then(() => { const v = getter(); return Array.isArray(v) ? v.map((o) => toDoc(M, c, project(o, sel))) : toDoc(M, c, project(v, sel)); }).then(r, j),
    };
    return x;
};
const hooks = { bookingFindOne: null };
for (const [c, M] of Object.entries(C)) {
    db = db || {};
    M.find = (f) => q(M, c, () => db[c].filter((d) => matches(d, f)));
    M.findOne = (f) => q(M, c, () => { castCheck(f); if (c === 'bookings' && hooks.bookingFindOne) hooks.bookingFindOne(f); return db[c].find((d) => matches(d, f)) || null; });
    M.findById = (id) => q(M, c, () => { castCheck({ _id: id }); return db[c].find((d) => eq(d._id, id)) || null; });
    M.countDocuments = async (f) => db[c].filter((d) => matches(d, f)).length;
    M.exists = async (f) => (db[c].some((d) => matches(d, f)) ? { _id: 1 } : null);
    M.findOneAndUpdate = (f, u) => q(M, c, () => { const o = db[c].find((d) => matches(d, f)); if (!o) return null; const before = { ...o }; Object.assign(o, u.$set || {}); return before; });
    M.updateOne = async (f, u) => { const o = db[c].find((d) => matches(d, f)); if (o) Object.assign(o, u.$set || u); return { matchedCount: o ? 1 : 0, modifiedCount: o ? 1 : 0 }; };
    M.updateMany = async (f, u) => { const list = db[c].filter((d) => matches(d, f)); list.forEach((o) => Object.assign(o, u.$set || u)); return { matchedCount: list.length }; };
    M.deleteOne = async (f) => { const n = db[c].length; db[c] = db[c].filter((d) => !matches(d, f)); return { deletedCount: n - db[c].length }; };
    M.deleteMany = async (f) => { const n = db[c].length; db[c] = db[c].filter((d) => !matches(d, f)); return { deletedCount: n - db[c].length }; };
    M.findByIdAndDelete = async (id) => { const o = db[c].find((d) => eq(d._id, id)); db[c] = db[c].filter((d) => !eq(d._id, id)); return o || null; };
    M.create = async (data) => { const d = new M(data); await d.validate(); db[c].push(d.toObject()); return toDoc(M, c, d.toObject()); };
}
AuditLog.create = async (data) => { const a = new AuditLog(data); await a.validate(); db.audit.push(a.toObject()); return a; };
AuditLog.find = () => q(AuditLog, 'audit', () => []);

const logs = [];
for (const k of ["log", "warn", "error", "info"]) console[k] = (...a) => logs.push(a.map((x) => (x instanceof Error ? x.message : typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
const out = (s) => process.stdout.write(s + '\n');

// ── Fixture ──
const A = OID(), B = OID(), M = OID();
const U = { ownerA: OID(), staffA: OID(), suspA: OID(), ownerB: OID(), ownerM: OID(), admin: OID(), indivEmpty: OID(), indivHist: OID(), indivPay: OID() };
const seed = () => {
    const u = (id, accountType, companyId, status = 'ACTIVE') => ({ _id: id, email: `${String(id).slice(-6)}@example.com`, name: 'n', accountType, status, companyId, tokenVersion: 0 });
    db = {
        users: [u(U.ownerA, 'COMPANY', A), u(U.staffA, 'EMPLOYEE', A), u(U.suspA, 'EMPLOYEE', A, 'SUSPENDED'), u(U.ownerB, 'COMPANY', B), u(U.ownerM, 'COMPANY', M), u(U.admin, 'ADMIN', null),
            u(U.indivEmpty, 'INDIVIDUAL', null), u(U.indivHist, 'INDIVIDUAL', null), u(U.indivPay, 'INDIVIDUAL', null)],
        employees: [
            { _id: OID(), userId: U.ownerA, companyId: A, position: 'Company Owner', permissions: ['ALL_ACCESS'], isActive: true },
            { _id: OID(), userId: U.staffA, companyId: A, position: 'Buyer', permissions: ['CAMPAIGN_VIEW'], isActive: true },
            { _id: OID(), userId: U.suspA, companyId: A, position: 'Buyer', permissions: [], isActive: true },
            { _id: OID(), userId: U.ownerB, companyId: B, position: 'Company Owner', permissions: ['ALL_ACCESS'], isActive: true },
            { _id: OID(), userId: U.ownerM, companyId: M, position: 'Company Owner', permissions: ['ALL_ACCESS'], isActive: true },
        ],
        companies: [A, B, M].map((id) => ({ _id: id, name: `co-${String(id).slice(-4)}`, slug: `co-${String(id).slice(-4)}`, email: `${String(id).slice(-6)}@co.example.com`, status: 'APPROVED' })),
        campaigns: [], stations: [], bookings: [], creatives: [], payments: [], departments: [], audit: [],
    };
};
const mkStation = (extra = {}) => { const id = OID(); const s = { _id: id, name: 'S', slug: 's-' + String(id), type: 'RADIO', companyId: M, approvalStatus: 'APPROVED', isActive: true, inventoryStatus: 'AVAILABLE', pricing: { amount: 50000, currency: 'NGN', unit: 'DAY' }, bookingLockUntil: null, ...extra }; db.stations.push(s); return s; };
const mkCampaign = (status, extra = {}) => { const c = { _id: OID(), companyId: A, userId: U.ownerA, name: `C-${status}`, objective: 'Awareness', status, budget: 100, currency: 'NGN', startDate: null, endDate: null, ...extra }; db.campaigns.push(c); return c; };
const mkBooking = (campaign, station, status, extra = {}) => { const b = { _id: OID(), bookingReference: `BK-${Math.random().toString(36).slice(2, 10)}`, campaignId: campaign._id, stationId: station._id, userId: campaign.userId,
    companyId: campaign.companyId || A, slot: 'PRIME_TIME', date: new Date(Date.now() + 5 * 864e5), time: '10:00', duration: 30, price: 50000, currency: 'NGN', status, ...extra }; db.bookings.push(b); return b; };
const mkCreative = (campaign) => { const c = { _id: OID(), campaignId: campaign._id, name: 'ad', type: 'AUDIO', fileUrl: 'https://cdn.example.com/a.mp3', status: 'PENDING' }; db.creatives.push(c); return c; };
const has = (c, id) => db[c].some((d) => eq(d._id, id));
const get = (c, id) => db[c].find((d) => eq(d._id, id));

const app = src('app');
const tok = (id) => jwt.sign({ id: String(id), tokenVersion: 0 }, process.env.JWT_SECRET, { expiresIn: '5m' });
const results = [];
const check = (label, ok, detail = '') => { results.push(ok); out(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== '' ? '  — ' + detail : ''}`); };

(async () => {
    seed();
    const server = app.listen(0, '127.0.0.1'); // loopback only
    await new Promise((resolve, reject) => server.once('listening', resolve).once('error', reject)); // address() is null until bound
    const base = `http://127.0.0.1:${server.address().port}`;
    const call = async (who, method, p, body) => {
        const h = {};
        if (who) h.Authorization = `Bearer ${tok(who)}`;
        if (body !== undefined) h['Content-Type'] = 'application/json';
        const r = await fetch(base + p, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
        const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* */ }
        return { code: r.status, body: json || {}, text };
    };
    const delCampaign = (who, id) => call(who, 'DELETE', `/api/v1/campaigns/${id}`);
    const S = mkStation();

    // ── Campaign deletion ──
    let c = mkCampaign('DRAFT'); let cr = mkCreative(c);
    let r = await delCampaign(U.ownerA, c._id);
    check('1   DRAFT, no bookings → 200, campaign + its creatives removed, DELETE_CAMPAIGN audited', r.code === 200 && !has('campaigns', c._id) && !has('creatives', cr._id)
        && db.audit.some((a) => a.action === 'DELETE_CAMPAIGN' && eq(a.entityId, c._id)), `${r.code}`);
    c = mkCampaign('CANCELLED');
    r = await delCampaign(U.ownerA, c._id);
    check('2   CANCELLED, no bookings → 200 removed', r.code === 200 && !has('campaigns', c._id), `${r.code}`);
    const blocked = [];
    for (const [n, cs, bs] of [['3', 'DRAFT', 'PENDING'], ['4', 'DRAFT', 'ACCEPTED'], ['5', 'DRAFT', 'SCHEDULED'], ['6', 'DRAFT', 'COMPLETED'], ['7', 'CANCELLED', 'CANCELLED'],
        ['7b', 'CANCELLED', 'REJECTED'], ['7c', 'DRAFT', 'CHANGES_REQUESTED']]) {
        const camp = mkCampaign(cs); const bk = mkBooking(camp, S, bs); const crt = mkCreative(camp);
        const snap = JSON.stringify([get('campaigns', camp._id), get('bookings', bk._id), get('creatives', crt._id)]);
        const auditN = db.audit.length;
        const x = await delCampaign(U.ownerA, camp._id);
        const after = JSON.stringify([get('campaigns', camp._id), get('bookings', bk._id), get('creatives', crt._id)]);
        blocked.push({ n, cs, bs, x, same: snap === after, auditN, camp, bk, crt });
        check(`${n.padEnd(3)} ${cs} campaign with ${bs} booking → 409 "has booking history"`, x.code === 409 && /cannot be deleted because it has booking history/.test(x.body.message || ''), `${x.code}`);
    }
    check('8   Blocked deletions leave every campaign in place', blocked.every((b) => has('campaigns', b.camp._id)));
    check('9   …every booking unchanged', blocked.every((b) => has('bookings', b.bk._id) && b.same));
    check('10  …every creative unchanged', blocked.every((b) => has('creatives', b.crt._id)));
    check('11  No partial deletion and no DELETE_CAMPAIGN audit for refused requests', blocked.every((b) => b.same) && !db.audit.slice(blocked[0].auditN).some((a) => a.action === 'DELETE_CAMPAIGN'));
    // race: a booking appears between the preflight and the delete → campaign restored
    c = mkCampaign('DRAFT'); cr = mkCreative(c);
    // The preflight lookup (1st) sees nothing; a booking is created just before the post-delete re-check (2nd).
    hooks.bookingFindOne = (() => { let n = 0; return (f) => { if (eq(f.campaignId, c._id) && ++n === 2) mkBooking(c, S, 'PENDING'); }; })();
    r = await delCampaign(U.ownerA, c._id);
    hooks.bookingFindOne = null;
    check('11b Booking created mid-delete → 409, campaign restored, creatives kept, booking still points to it', r.code === 409 && has('campaigns', c._id) && has('creatives', cr._id)
        && db.bookings.some((b) => eq(b.campaignId, c._id)), `${r.code}`);
    const cB = mkCampaign('DRAFT', { companyId: B, userId: U.ownerB });
    r = await delCampaign(U.ownerA, cB._id);
    check('12  Company A cannot delete Company B campaign → 404, kept', r.code === 404 && has('campaigns', cB._id), `${r.code}`);
    r = await delCampaign(U.ownerA, mkCampaign('SUBMITTED')._id);
    check('12b Existing status rule kept: SUBMITTED → 403', r.code === 403, `${r.code}`);
    r = await delCampaign(U.staffA, mkCampaign('DRAFT')._id);
    check('12c Employee without CAMPAIGN_DELETE → 403', r.code === 403, `${r.code}`);
    // admin individual campaign delete path
    const ic = mkCampaign('DRAFT', { companyId: null, userId: U.indivHist });
    mkBooking(ic, S, 'COMPLETED', { companyId: A });
    r = await call(U.admin, 'DELETE', `/api/v1/admin/individuals/${U.indivHist}/campaigns/${ic._id}`);
    check('12d Admin delete of an individual campaign with bookings → 409, nothing removed', r.code === 409 && has('campaigns', ic._id) && db.bookings.some((b) => eq(b.campaignId, ic._id)), `${r.code} ${r.body.message || ''}`);
    const ic2 = mkCampaign('DRAFT', { companyId: null, userId: U.indivEmpty }); const icr = mkCreative(ic2);
    r = await call(U.admin, 'DELETE', `/api/v1/admin/individuals/${U.indivEmpty}/campaigns/${ic2._id}`);
    check('12e Admin delete of an individual campaign without bookings → 200 (existing behaviour)', r.code === 200 && !has('campaigns', ic2._id) && !has('creatives', icr._id), `${r.code}`);

    // ── Station deletion / deactivation ──
    const delStation = (id) => call(U.admin, 'DELETE', `/api/v1/admin/stations/${id}`);
    let st = mkStation({ isActive: false, inventoryStatus: 'UNAVAILABLE' });
    r = await delStation(st._id);
    check('13  Inactive station with no bookings → 200 hard delete (existing behaviour), DELETE_STATION', r.code === 200 && !has('stations', st._id) && db.audit.some((a) => a.action === 'DELETE_STATION'), `${r.code}`);
    r = await delStation(mkStation()._id);
    check('13b Active station → 400 (existing rule)', r.code === 400, `${r.code}`);
    for (const [n, bs] of [['14', 'PENDING'], ['15', 'ACCEPTED'], ['16', 'SCHEDULED'], ['17', 'COMPLETED'], ['18', 'CANCELLED'], ['18b', 'REJECTED']]) {
        st = mkStation({ isActive: false, inventoryStatus: 'UNAVAILABLE' });
        const camp = mkCampaign('ACCEPTED'); const bk = mkBooking(camp, st, bs);
        r = await delStation(st._id);
        check(`${n.padEnd(3)} Station with ${bs} booking → 409, station kept (deactivated), booking intact`, r.code === 409 && has('stations', st._id) && get('stations', st._id).isActive === false
            && eq(get('bookings', bk._id)?.stationId, st._id) && /booking history/.test(r.body.message || ''), `${r.code}`);
    }
    check('18c Station lock released after refused delete', db.stations.every((s) => s.bookingLockUntil == null));
    // deactivation keeps everything
    st = mkStation();
    const dc = mkCampaign('ACCEPTED');
    const live = ['PENDING', 'ACCEPTED', 'SCHEDULED', 'COMPLETED'].map((s) => mkBooking(dc, st, s));
    const nb = db.bookings.length, nc = db.campaigns.length;
    r = await call(U.admin, 'PATCH', `/api/v1/admin/stations/${st._id}/deactivate`);
    check('19  Admin deactivate → 200, no booking deleted', r.code === 200 && db.bookings.length === nb && get('stations', st._id).isActive === false, `${r.code}`);
    check('20  …no campaign deleted', db.campaigns.length === nc && has('campaigns', dc._id));
    check('21  …bookings still reference the station, statuses unchanged', live.every((b, i) => eq(get('bookings', b._id).stationId, st._id) && get('bookings', b._id).status === ['PENDING', 'ACCEPTED', 'SCHEDULED', 'COMPLETED'][i]));
    check('21b DEACTIVATE_STATION audit', db.audit.some((a) => a.action === 'DEACTIVATE_STATION' && eq(a.entityId, st._id)));
    const st2 = mkStation();
    r = await call(U.admin, 'DELETE', `/api/v1/stations/${st2._id}`);
    check('21c Legacy DELETE /stations/:id still soft-deactivates (record kept)', r.code === 200 && has('stations', st2._id) && get('stations', st2._id).isActive === false, `${r.code}`);
    const st3 = mkStation({ isActive: false });
    r = await call(U.ownerM, 'DELETE', `/api/v1/admin/stations/${st3._id}`);
    const r2 = await call(U.ownerA, 'PATCH', `/api/v1/admin/stations/${st3._id}/deactivate`);
    const r3 = await call(U.ownerM, 'DELETE', `/api/v1/stations/${st3._id}`);
    check('22  Company users (even the station\'s own media company) cannot delete/deactivate stations → 403', r.code === 403 && r2.code === 403 && r3.code === 403 && has('stations', st3._id), `${r.code}/${r2.code}/${r3.code}`);
    // booking lock serialises delete vs a concurrent booking
    const st4 = mkStation({ isActive: false, bookingLockUntil: new Date(Date.now() + 60_000) });
    r = await delStation(st4._id);
    check('22b Station busy with a booking (lock held) → 409, not deleted', r.code === 409 && has('stations', st4._id), `${r.code}`);

    // ── Company deletion ──
    check('23-26 N/A: no company delete endpoint exists (Company.findByIdAndDelete only rolls back a failed createCompany)', true);
    r = await call(U.admin, 'DELETE', `/api/v1/admin/companies/${A}`);
    check('26b DELETE /admin/companies/:id → 404 route not found; company kept', r.code === 404 && has('companies', A), `${r.code}`);

    // ── Employees / users ──
    const histCamp = mkCampaign('ACCEPTED', { userId: U.staffA }); const histBk = mkBooking(histCamp, S, 'COMPLETED', { userId: U.staffA });
    db.audit.push({ _id: OID(), userId: U.staffA, action: 'LOGIN', entityType: 'USER', entityId: U.staffA });
    const empStaff = db.employees.find((e) => eq(e.userId, U.staffA));
    r = await call(U.ownerA, 'DELETE', `/api/v1/company/team/${empStaff._id}`);
    check('27  Company team removal → 200, User kept (DEACTIVATED), Employee kept (inactive)', r.code === 200 && has('users', U.staffA) && get('users', U.staffA).status === 'DEACTIVATED'
        && get('employees', empStaff._id)?.isActive === false, `${r.code}`);
    check('28  …campaign, booking and audit references intact', eq(get('campaigns', histCamp._id).userId, U.staffA) && eq(get('bookings', histBk._id).userId, U.staffA) && db.audit.some((a) => eq(a.userId, U.staffA)));
    const empSusp = db.employees.find((e) => eq(e.userId, U.suspA));
    r = await call(U.ownerA, 'DELETE', `/api/v1/company/team/${empSusp._id}`);
    check('29  Removing a SUSPENDED employee keeps platform SUSPENDED (N3)', r.code === 200 && get('users', U.suspA).status === 'SUSPENDED', `${r.code} ${get('users', U.suspA).status}`);
    const empOwner = db.employees.find((e) => eq(e.userId, U.ownerA));
    r = await call(U.ownerA, 'DELETE', `/api/v1/company/team/${empOwner._id}`);
    check('30  Company owner cannot be removed → 403 (existing protection)', r.code === 403 && get('employees', empOwner._id).isActive === true, `${r.code}`);
    // admin worker removal: Employee link removed, User kept
    const empStaffB = { _id: OID(), userId: OID(), companyId: B, position: 'Buyer', permissions: [], isActive: true };
    db.users.push({ _id: empStaffB.userId, email: 'wb@example.com', name: 'wb', accountType: 'EMPLOYEE', status: 'ACTIVE', companyId: B, tokenVersion: 0 });
    db.employees.push(empStaffB);
    const wbCamp = mkCampaign('ACCEPTED', { companyId: B, userId: empStaffB.userId }); mkBooking(wbCamp, S, 'COMPLETED', { companyId: B, userId: empStaffB.userId });
    r = await call(U.admin, 'DELETE', `/api/v1/admin/companies/${B}/workers/${empStaffB._id}`);
    check('30b Admin worker removal → User record kept (DEACTIVATED), their campaign/booking intact', r.code === 200 && has('users', empStaffB.userId) && get('users', empStaffB.userId).status === 'DEACTIVATED'
        && db.bookings.some((b) => eq(b.userId, empStaffB.userId)), `${r.code} ${r.body.message || ''}`);
    // admin individual delete
    const pc = mkCampaign('DRAFT', { companyId: null, userId: U.indivPay });
    db.campaigns = db.campaigns.filter((x) => !eq(x._id, pc._id)); // payment only, no campaign left
    db.payments.push({ _id: OID(), campaignId: pc._id, companyId: A, userId: U.indivPay, amount: 1, status: 'SUCCESSFUL' });
    r = await call(U.admin, 'DELETE', `/api/v1/admin/individuals/${U.indivHist}`);
    const r4 = await call(U.admin, 'DELETE', `/api/v1/admin/individuals/${U.indivPay}`);
    check('30c Admin delete of an individual with campaigns/bookings or payments → 409, user kept', r.code === 409 && r4.code === 409 && has('users', U.indivHist) && has('users', U.indivPay)
        && !db.audit.some((a) => a.action === 'DELETE_USER'), `${r.code}/${r4.code}`);
    const fresh = OID(); db.users.push({ _id: fresh, email: 'fresh@example.com', name: 'f', accountType: 'INDIVIDUAL', status: 'ACTIVE', companyId: null, tokenVersion: 0 });
    r = await call(U.admin, 'DELETE', `/api/v1/admin/individuals/${fresh}`);
    check('30d Individual with no history → 200 deleted (existing behaviour), DELETE_USER', r.code === 200 && !has('users', fresh) && db.audit.some((a) => a.action === 'DELETE_USER'), `${r.code}`);

    // ── Malformed IDs ──
    const bad = [
        await delCampaign(U.ownerA, 'not-an-id'),
        await delStation('not-an-id'),
        await call(U.admin, 'PATCH', '/api/v1/admin/stations/not-an-id/deactivate'),
        await call(U.admin, 'DELETE', '/api/v1/admin/individuals/not-an-id'),
        await call(U.admin, 'DELETE', `/api/v1/admin/individuals/${U.indivHist}/campaigns/not-an-id`),
        await call(U.admin, 'DELETE', '/api/v1/admin/companies/not-an-id/workers/not-an-id'),
    ].map((x) => x.code);
    check('31  Invalid campaign ID → 400', bad[0] === 400, `${bad[0]}`);
    check('32  Invalid station ID → 400 (delete + deactivate)', bad[1] === 400 && bad[2] === 400, `${bad[1]}/${bad[2]}`);
    check('33  Invalid individual / company IDs → 400', bad[3] === 400 && bad[4] === 400 && bad[5] === 400, bad.slice(3).join(','));
    check('34  No malformed ID produced a 500', !bad.includes(500) && !logs.some((l) => /CastError/.test(l)), bad.join(','));
    r = await call(null, 'DELETE', `/api/v1/campaigns/${mkCampaign('DRAFT')._id}`);
    check('35  No auth → 401', r.code === 401, `${r.code}`);
    check('36  No booking was ever deleted by any request in this run', blocked.every((b) => has('bookings', b.bk._id)) && live.every((b) => has('bookings', b._id)));

    server.close();
    const passed = results.filter(Boolean).length;
    out(`\nE6: ${passed}/${results.length} passed`);
    if (process.env.E6_DEBUG) out(logs.filter((l) => l.includes('❌')).join('\n'));
    process.exitCode = passed === results.length ? 0 : 1;
})().catch((e) => { out('HARNESS CRASH ' + e.stack); process.exitCode = 1; });
