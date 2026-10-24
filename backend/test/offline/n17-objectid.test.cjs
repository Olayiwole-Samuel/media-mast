// N17 verification harness — offline. Real app/routes/middleware/controllers/models. In-memory store whose
// queries are cast by REAL Mongoose (Query.prototype.cast) — so a malformed id throws the same CastError it
// would against MongoDB. Black-box HTTP tests + DB-unchanged checks.
process.env.JWT_SECRET = 'n17-harness-dummy-secret';
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
const Department = src('models/Department'), Payment = src('models/Payment');

const OID = () => new mongoose.Types.ObjectId();
let db;
const C = { users: User, employees: Employee, companies: Company, campaigns: Campaign, stations: Station, bookings: Booking, creatives: Creative, departments: Department, payments: Payment };
const clone = (o) => mongoose.mongo.BSON.deserialize(mongoose.mongo.BSON.serialize(o), { promoteValues: true });
const eq = (a, b) => (a == null && b == null) || (a != null && b != null && String(a) === String(b));
const realCast = (M, f) => { M.where().cast(M, f || {}); }; // throws CastError exactly like Mongoose
const matches = (d, f = {}) => Object.entries(f).every(([k, v]) => {
    if (k === '$or') return v.some((g) => matches(d, g));
    const x = d[k];
    if (v && typeof v === 'object' && !(v instanceof mongoose.Types.ObjectId) && !(v instanceof Date) && !Array.isArray(v)) {
        if ('$regex' in v) return typeof x === 'string' && v.$regex.test(x);
        if ('$in' in v) return v.$in.some((y) => eq(x, y));
        if ('$nin' in v) return !v.$nin.some((y) => eq(x, y));
        if ('$ne' in v) return !eq(x, v.$ne);
        if ('$lte' in v) return x != null && x <= v.$lte;
        if ('$gt' in v) return x != null && x > v.$gt;
        return true;
    }
    return eq(x, v);
});
const toDoc = (M, c, o) => {
    if (!o) return null;
    const d = M.hydrate(clone(o));
    d.save = async () => { await d.validate(); const plain = d.toObject(); const i = db[c].findIndex((x) => eq(x._id, plain._id)); if (i >= 0) db[c][i] = plain; return d; };
    d.deleteOne = async () => { db[c] = db[c].filter((x) => !eq(x._id, d._id)); return {}; };
    return d;
};
const q = (M, c, getter, filter) => {
    const x = {
        select: () => x, populate: () => x, lean: () => x, sort: () => x, limit: () => x, skip: () => x,
        then: (r, j) => Promise.resolve().then(() => { realCast(M, filter); const v = getter(); return Array.isArray(v) ? v.map((o) => toDoc(M, c, o)) : toDoc(M, c, v); }).then(r, j),
    };
    return x;
};
for (const [c, M] of Object.entries(C)) {
    M.find = (f) => q(M, c, () => db[c].filter((d) => matches(d, f)), f);
    M.findOne = (f) => q(M, c, () => db[c].find((d) => matches(d, f)) || null, f);
    M.findById = (id) => q(M, c, () => db[c].find((d) => eq(d._id, id)) || null, { _id: id });
    M.countDocuments = async (f) => { realCast(M, f); return db[c].filter((d) => matches(d, f)).length; };
    M.exists = async (f) => { realCast(M, f); return db[c].some((d) => matches(d, f)) ? { _id: 1 } : null; };
    M.findOneAndUpdate = (f, u) => q(M, c, () => { const o = db[c].find((d) => matches(d, f)); if (!o) return null; Object.assign(o, (u && u.$set) || {}); return o; }, f);
    M.updateOne = async (f, u) => { realCast(M, f); const o = db[c].find((d) => matches(d, f)); if (o) Object.assign(o, (u && u.$set) || u); return { matchedCount: o ? 1 : 0 }; };
    M.updateMany = async (f, u) => { realCast(M, f); db[c].filter((d) => matches(d, f)).forEach((o) => Object.assign(o, (u && u.$set) || u)); return {}; };
    M.deleteOne = async (f) => { realCast(M, f); db[c] = db[c].filter((d) => !matches(d, f)); return {}; };
    M.deleteMany = async (f) => { realCast(M, f); db[c] = db[c].filter((d) => !matches(d, f)); return {}; };
    M.findByIdAndDelete = async (id) => { realCast(M, { _id: id }); db[c] = db[c].filter((d) => !eq(d._id, id)); return null; };
    M.create = async (data) => { const d = new M(data); await d.validate(); db[c].push(d.toObject()); return toDoc(M, c, d.toObject()); };
    M.aggregate = async () => [];
}
AuditLog.create = async (data) => { const a = new AuditLog(data); await a.validate(); db.audit.push(a.toObject()); return a; };
AuditLog.find = () => q(AuditLog, 'audit', () => [], {});

const logs = [];
for (const k of ['log', 'warn', 'error', 'info']) console[k] = (...a) => logs.push(a.map((x) => (x && x.name ? `${x.name} ${x.message}` : typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
const out = (s) => process.stdout.write(s + '\n');

// ── Fixture ──
const A = OID(), B = OID(), MED = OID();
const U = { ownerA: OID(), viewerA: OID(), staffA: OID(), ownerB: OID(), admin: OID(), indiv: OID() };
const IDS = { campA: OID(), campB: OID(), deptA: OID(), deptB: OID(), empStaffA: OID(), empOwnerB: OID(), station: OID(), booking: OID(), creative: OID() };
const seed = () => {
    const u = (id, accountType, companyId) => ({ _id: id, email: `${String(id).slice(-6)}@example.com`, name: 'n', accountType, status: 'ACTIVE', companyId, tokenVersion: 0 });
    db = {
        users: [u(U.ownerA, 'COMPANY', A), u(U.viewerA, 'EMPLOYEE', A), u(U.staffA, 'EMPLOYEE', A), u(U.ownerB, 'COMPANY', B), u(U.admin, 'ADMIN', null), u(U.indiv, 'INDIVIDUAL', null)],
        employees: [
            { _id: OID(), userId: U.ownerA, companyId: A, position: 'Company Owner', permissions: ['ALL_ACCESS'], isActive: true },
            { _id: OID(), userId: U.viewerA, companyId: A, position: 'Viewer', permissions: ['BOOKING_VIEW'], isActive: true },
            { _id: IDS.empStaffA, userId: U.staffA, companyId: A, position: 'Staff', permissions: ['CAMPAIGN_VIEW'], isActive: true, departmentId: null },
            { _id: IDS.empOwnerB, userId: U.ownerB, companyId: B, position: 'Company Owner', permissions: ['ALL_ACCESS'], isActive: true },
        ],
        companies: [A, B, MED].map((id) => ({ _id: id, name: 'co', slug: `co-${id}`, email: `${String(id).slice(-6)}@co.example.com`, status: 'APPROVED' })),
        campaigns: [
            { _id: IDS.campA, companyId: A, userId: U.ownerA, name: 'A camp', objective: 'Awareness', status: 'DRAFT', budget: 100 },
            { _id: IDS.campB, companyId: B, userId: U.ownerB, name: 'B camp', objective: 'Awareness', status: 'DRAFT', budget: 100 },
        ],
        departments: [{ _id: IDS.deptA, companyId: A, name: 'Sales', isActive: true }, { _id: IDS.deptB, companyId: B, name: 'Ops', isActive: true }],
        stations: [{ _id: IDS.station, name: 'S', slug: 's', type: 'RADIO', companyId: MED, approvalStatus: 'APPROVED', isActive: true, inventoryStatus: 'AVAILABLE', pricing: { amount: 1, currency: 'NGN', unit: 'DAY' } }],
        bookings: [{ _id: IDS.booking, bookingReference: 'BK-1', campaignId: IDS.campA, stationId: IDS.station, userId: U.ownerA, companyId: A, slot: 'X', date: new Date(), time: '10:00', duration: 30, price: 1, currency: 'NGN', status: 'PENDING' }],
        creatives: [{ _id: IDS.creative, campaignId: IDS.campA, name: 'c', type: 'IMAGE', url: 'https://x.example.com/a.png', status: 'PENDING', uploadedBy: String(U.ownerA) }],
        payments: [], audit: [],
    };
};
const MALFORMED = ['abc', '123', 'not-an-id', '%20', 'aaaaaaaaaaaa', '507f1f77bcf86cd79943901', '507f1f77bcf86cd799439011z', 'zzzzzzzzzzzzzzzzzzzzzzzz'];
const MISSING = String(new mongoose.Types.ObjectId('507f1f77bcf86cd799439011'));

const app = src('app');
const tok = (id) => jwt.sign({ id: String(id), tokenVersion: 0 }, process.env.JWT_SECRET, { expiresIn: '5m' });
const results = [];
const check = (label, ok, detail = '') => { results.push(ok); out(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== '' ? '  — ' + detail : ''}`); };

(async () => {
    seed();
    const server = app.listen(0, '127.0.0.1'); // loopback only
    await new Promise((resolve, reject) => server.once('listening', resolve).once('error', reject)); // address() is null until bound
    const base = `http://127.0.0.1:${server.address().port}`;
    const all = [];
    const call = async (who, method, p, body) => {
        const h = {};
        if (who) h.Authorization = `Bearer ${tok(who)}`;
        if (body !== undefined) h['Content-Type'] = 'application/json';
        const r = await fetch(base + p, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
        const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* */ }
        const res = { code: r.status, body: json || {}, text };
        all.push({ p, ...res });
        return res;
    };
    const snapshot = () => JSON.stringify(db);
    // every malformed variant → 400 + message, nothing changed
    const malformed = async (label, who, method, tmpl, body, msg) => {
        const before = snapshot();
        const codes = [];
        let msgOk = true;
        for (const bad of MALFORMED) {
            const x = await call(who, method, tmpl.replace(/\{id\}/g, bad), body);
            codes.push(x.code);
            if (msg && x.body.message !== msg) msgOk = false;
        }
        check(`${label} → 400${msg ? ` "${msg}"` : ''} for all ${MALFORMED.length} malformed ids, DB unchanged`, codes.every((c) => c === 400) && msgOk && snapshot() === before, codes.join(','));
    };

    // ════════ Campaigns (company-scoped): full matrix ════════
    await malformed('C1  GET    /campaigns/:id', U.ownerA, 'GET', '/api/v1/campaigns/{id}', undefined, 'Invalid campaign ID');
    await malformed('C2  PUT    /campaigns/:id (valid body)', U.ownerA, 'PUT', '/api/v1/campaigns/{id}', { name: 'Renamed' }, 'Invalid campaign ID');
    await malformed('C3  PATCH  /campaigns/:id/status (valid body)', U.ownerA, 'PATCH', '/api/v1/campaigns/{id}/status', { status: 'SUBMITTED' }, 'Invalid campaign ID');
    await malformed('C4  DELETE /campaigns/:id', U.ownerA, 'DELETE', '/api/v1/campaigns/{id}', undefined, 'Invalid campaign ID');
    let r = await call(U.ownerA, 'GET', `/api/v1/campaigns/${MISSING}`);
    check('C5  Valid but nonexistent campaign id → 404 (not 400)', r.code === 404, `${r.code}`);
    r = await call(U.ownerA, 'GET', `/api/v1/campaigns/${IDS.campB}`);
    const r2 = await call(U.ownerA, 'PUT', `/api/v1/campaigns/${IDS.campB}`, { name: 'hijack' });
    check('C6  Company A → Company B campaign (valid id) → 404, unchanged (isolation intact)', r.code === 404 && r2.code === 404 && db.campaigns.find((c) => eq(c._id, IDS.campB)).name === 'B camp', `${r.code}/${r2.code}`);
    r = await call(U.ownerA, 'GET', `/api/v1/campaigns/${IDS.campA}`);
    check('C7  Own campaign → 200 with data', r.code === 200 && (r.body.data?.campaign?.name === 'A camp' || r.body.data?.name === 'A camp'), `${r.code}`);
    r = await call(null, 'GET', '/api/v1/campaigns/abc');
    check('C8  No token + malformed id → 401 (auth runs first)', r.code === 401, `${r.code}`);
    r = await call(U.viewerA, 'GET', `/api/v1/campaigns/${IDS.campA}`);
    check('C9  Employee without CAMPAIGN_VIEW, valid id → 403 (permissions intact)', r.code === 403, `${r.code}`);
    r = await call(U.indiv, 'GET', '/api/v1/campaigns/abc');
    check('C10 Individual + malformed id → 400 "Invalid campaign ID" (individuals may use campaigns)', r.code === 400 && r.body.message === 'Invalid campaign ID', `${r.code}`);

    // ════════ Bookings / creatives (already validated — unchanged) ════════
    await malformed('B1  GET    /bookings/:id', U.ownerA, 'GET', '/api/v1/bookings/{id}', undefined, 'Invalid booking ID');
    r = await call(U.ownerA, 'GET', `/api/v1/bookings/${MISSING}`);
    const rb = await call(U.ownerA, 'GET', `/api/v1/bookings/${IDS.booking}`);
    check('B2  Booking: missing → 404, own → 200', r.code === 404 && rb.code === 200, `${r.code}/${rb.code}`);
    await malformed('CR1 GET    /creatives/:id', U.ownerA, 'GET', '/api/v1/creatives/{id}', undefined, 'Invalid creative ID');
    r = await call(U.ownerA, 'GET', `/api/v1/creatives/${MISSING}`);
    check('CR2 Creative: missing → 404', r.code === 404, `${r.code}`);
    r = await call(U.ownerA, 'GET', '/api/v1/creatives/campaign/abc');
    check('CR3 Nested GET /creatives/campaign/:campaignId malformed → existing 404 (D5 contract), no 500', r.code === 404, `${r.code}`);

    // ════════ Employees ════════
    await malformed('E1  GET    /employees/:id/permissions', U.ownerA, 'GET', '/api/v1/employees/{id}/permissions', undefined, 'Invalid employee ID');
    await malformed('E2  PUT    /employees/:id/permissions (valid body)', U.ownerA, 'PUT', '/api/v1/employees/{id}/permissions', { permissions: ['TEAM_VIEW'] }, 'Invalid employee ID');
    await malformed('E3  PATCH  /employees/:id/activate', U.ownerA, 'PATCH', '/api/v1/employees/{id}/activate', {}, 'Invalid employee ID');
    await malformed('E4  PATCH  /employees/:id/deactivate', U.ownerA, 'PATCH', '/api/v1/employees/{id}/deactivate', {}, 'Invalid employee ID');
    r = await call(U.ownerA, 'GET', `/api/v1/employees/${MISSING}/permissions`);
    const re2 = await call(U.ownerA, 'GET', `/api/v1/employees/${IDS.empOwnerB}/permissions`);
    const re3 = await call(U.ownerA, 'GET', `/api/v1/employees/${IDS.empStaffA}/permissions`);
    check('E5  Employee: missing → 404, other company → 404, own → 200', r.code === 404 && re2.code === 404 && re3.code === 200, `${r.code}/${re2.code}/${re3.code}`);

    // ════════ Company team ════════
    await malformed('T1  DELETE /company/team/:id', U.ownerA, 'DELETE', '/api/v1/company/team/{id}', undefined, 'Invalid team member ID');
    await malformed('T2  PUT    /company/team/:id (valid body)', U.ownerA, 'PUT', '/api/v1/company/team/{id}', { position: 'Lead' }, 'Invalid team member ID');
    r = await call(U.ownerA, 'DELETE', `/api/v1/company/team/${MISSING}`);
    const rt2 = await call(U.ownerA, 'DELETE', `/api/v1/company/team/${IDS.empOwnerB}`);
    check('T3  Team: missing → 404, other company\'s member → 404 (not removed)', r.code === 404 && rt2.code === 404 && db.employees.find((e) => eq(e._id, IDS.empOwnerB)).isActive === true, `${r.code}/${rt2.code}`);

    // ════════ Departments (params + body ids) ════════
    await malformed('D1  GET    /departments/:id', U.ownerA, 'GET', '/api/v1/departments/{id}', undefined, 'Invalid department ID');
    await malformed('D2  PUT    /departments/:id (valid body)', U.ownerA, 'PUT', '/api/v1/departments/{id}', { name: 'New name' }, 'Invalid department ID');
    await malformed('D3  DELETE /departments/:id', U.ownerA, 'DELETE', '/api/v1/departments/{id}', undefined, 'Invalid department ID');
    r = await call(U.ownerA, 'GET', `/api/v1/departments/${MISSING}`);
    const rd2 = await call(U.ownerA, 'GET', `/api/v1/departments/${IDS.deptB}`);
    const rd3 = await call(U.ownerA, 'GET', `/api/v1/departments/${IDS.deptA}`);
    check('D4  Department: missing → 404, other company → 404, own → 200', r.code === 404 && rd2.code === 404 && rd3.code === 200, `${r.code}/${rd2.code}/${rd3.code}`);
    let before = snapshot();
    const bodyCodes = [];
    for (const bad of ['abc', '123', { $ne: null }, ['x'], 42, true]) bodyCodes.push((await call(U.ownerA, 'POST', '/api/v1/departments', { name: `Dept ${bodyCodes.length}`, managerId: bad })).code);
    check('D5  POST /departments body managerId malformed (string/object/array/number/bool) → 400, nothing created', bodyCodes.every((c) => c === 400) && snapshot() === before, bodyCodes.join(','));
    r = await call(U.ownerA, 'POST', '/api/v1/departments', { name: 'Ok dept', managerId: null });
    check('D6  POST /departments with managerId null → 201 (optional field preserved)', r.code === 201, `${r.code}`);
    before = snapshot();
    r = await call(U.ownerA, 'PUT', `/api/v1/departments/${IDS.deptA}`, { managerId: 'abc' });
    check('D7  PUT /departments/:id body managerId malformed → 400 "Invalid manager ID", unchanged', r.code === 400 && r.body.message === 'Invalid manager ID' && snapshot() === before, `${r.code} ${r.body.message}`);
    r = await call(U.ownerA, 'PUT', `/api/v1/departments/${IDS.deptA}`, { managerId: MISSING });
    check('D8  PUT with valid-but-unknown managerId → existing 400 "Manager must be an active employee"', r.code === 400 && /active employee/.test(r.body.message || ''), `${r.code}`);
    before = snapshot();
    const r3 = await call(U.ownerA, 'POST', '/api/v1/departments/assign', { employeeId: 'abc', departmentId: String(IDS.deptA) });
    const r4 = await call(U.ownerA, 'POST', '/api/v1/departments/assign', { employeeId: String(IDS.empStaffA), departmentId: 'abc' });
    const r5 = await call(U.ownerA, 'POST', '/api/v1/departments/assign', { employeeId: { $ne: null }, departmentId: String(IDS.deptA) });
    check('D9  POST /departments/assign malformed employeeId / departmentId / object → 400, employee unchanged', r3.code === 400 && r3.body.message === 'Invalid employee ID' && r4.code === 400 && r4.body.message === 'Invalid department ID' && r5.code === 400 && snapshot() === before, `${r3.code}/${r4.code}/${r5.code}`);
    r = await call(U.ownerA, 'POST', '/api/v1/departments/assign', { employeeId: String(IDS.empStaffA), departmentId: String(IDS.deptB) });
    check('D10 assign to another company\'s department (valid id) → 404', r.code === 404, `${r.code}`);
    r = await call(U.ownerA, 'POST', '/api/v1/departments/assign', { employeeId: String(IDS.empStaffA), departmentId: String(IDS.deptA) });
    check('D11 Valid assign → 200 and applied', r.code === 200 && eq(db.employees.find((e) => eq(e._id, IDS.empStaffA)).departmentId, IDS.deptA), `${r.code}`);
    r = await call(U.ownerA, 'POST', '/api/v1/departments/assign', { employeeId: String(IDS.empStaffA), departmentId: null });
    check('D12 Unassign with departmentId null → 200 (preserved)', r.code === 200 && db.employees.find((e) => eq(e._id, IDS.empStaffA)).departmentId == null, `${r.code}`);

    // ════════ Admin ════════
    await malformed('A1  GET    /admin/campaigns/:id', U.admin, 'GET', '/api/v1/admin/campaigns/{id}', undefined, 'Invalid campaign ID');
    r = await call(U.admin, 'GET', `/api/v1/admin/campaigns/${MISSING}`);
    const ra = await call(U.admin, 'GET', `/api/v1/admin/campaigns/${IDS.campB}`);
    check('A2  Admin campaign: missing → 404, existing → 200', r.code === 404 && ra.code === 200, `${r.code}/${ra.code}`);
    await malformed('A3  PATCH  /admin/stations/:id/deactivate (existing check)', U.admin, 'PATCH', '/api/v1/admin/stations/{id}/deactivate', {}, 'Invalid station ID');
    await malformed('A4  Nested /admin/companies/:id/workers/:workerId (both malformed)', U.admin, 'GET', '/api/v1/admin/companies/{id}/workers/{id}');
    before = snapshot();
    const wc = [];
    for (const bad of ['abc', '123', 'not-an-id']) wc.push((await call(U.admin, 'GET', `/api/v1/admin/companies/${A}/workers/${bad}`)).code);
    check('A5  Existing company + malformed workerId → 400 (the probe-masked path), unchanged', wc.every((c) => c === 400) && snapshot() === before, wc.join(','));
    await malformed('A6  Nested /admin/individuals/:id/campaigns/:campaignId (existing check)', U.admin, 'GET', `/api/v1/admin/individuals/${U.indiv}/campaigns/{id}`);
    before = snapshot();
    const sc = [];
    for (const bad of ['abc', '123', { $ne: null }]) sc.push((await call(U.admin, 'POST', '/api/v1/admin/stations', { name: 'New FM', type: 'RADIO', companyId: bad, pricing: { amount: 1, currency: 'NGN', unit: 'DAY' } })).code);
    check('A7  POST /admin/stations body companyId malformed → 400, no station created', sc.every((c) => c === 400) && snapshot() === before, sc.join(','));
    r = await call(U.admin, 'PATCH', '/api/v1/admin/stations/abc/deactivate');
    const r6 = await call(U.ownerA, 'PATCH', '/api/v1/admin/stations/abc/deactivate');
    check('A8  Admin route: non-admin with malformed id → 403 (admin check first), admin → 400', r.code === 400 && r6.code === 403, `${r.code}/${r6.code}`);
    r = await call(null, 'GET', '/api/v1/stations/abc');
    check('A9  Public GET /stations/:id malformed → existing 404 (C3/N12 contract)', r.code === 404, `${r.code}`);

    // ════════ Global safety net ════════
    const stack = (app.router || app._router).stack;
    const errLayer = [...stack].reverse().find((l) => l.handle && l.handle.length === 4);
    const fakeRes = () => { const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } }; return res; };
    let cast; try { Campaign.where().cast(Campaign, { _id: 'abc' }); } catch (e) { cast = e; }
    const res1 = fakeRes(); errLayer.handle(cast, { method: 'GET', path: '/x' }, res1, () => {});
    check('G1  Global handler: real Mongoose CastError → 400 {success:false, message:"Invalid ID"}, no Mongoose text', cast?.name === 'CastError' && res1.statusCode === 400 && res1.body?.message === 'Invalid ID' && !/Cast to ObjectId/.test(JSON.stringify(res1.body)), `${res1.statusCode}`);
    const res2 = fakeRes(); errLayer.handle(new Error('db exploded'), { method: 'GET', path: '/x' }, res2, () => {});
    let ve; try { await new Campaign({}).validate(); } catch (e) { ve = e; }
    const res3 = fakeRes(); errLayer.handle(ve, { method: 'GET', path: '/x' }, res3, () => {});
    check('G2  Global handler: unrelated errors (generic, ValidationError) stay 500 as before', res2.statusCode === 500 && res3.statusCode === 500, `${res2.statusCode}/${res3.statusCode}`);

    // ════════ Global properties of this run ════════
    check('X1  No response in the whole run was a 500', !all.some((x) => x.code === 500), all.filter((x) => x.code === 500).map((x) => x.p).slice(0, 3).join(' '));
    check('X2  No response leaked Mongoose cast text ("Cast to ObjectId" / "CastError")', !all.some((x) => /Cast to ObjectId|CastError/.test(x.text)));
    check('X3  No CastError reached any controller (none logged)', !logs.some((l) => /CastError|Cast to ObjectId/.test(l)), logs.filter((l) => /Cast/.test(l)).slice(0, 2).join(' | '));

    server.close();
    const passed = results.filter(Boolean).length;
    out(`\nN17: ${passed}/${results.length} passed`);
    process.exitCode = passed === results.length ? 0 : 1;
})().catch((e) => { out('HARNESS CRASH ' + e.stack); process.exitCode = 1; process.exit(1); });
