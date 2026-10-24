// C3/N12 verification harness — offline. Real Station/Booking/AuditLog schemas, in-memory persistence, dummy JWT secret.
process.env.JWT_SECRET = 'c3n12-harness-dummy-secret';
process.env.JWT_EXPIRE = '5m';
process.env.ALLOW_DIRECT_BOOKING = 'true'; // these checks exercise the direct (unpaid) booking route

const path = require('path');
const BACKEND = path.resolve(__dirname, '..', '..'); // backend/ (this file: backend/test/offline/)
const mongoose = require(path.join(BACKEND, 'node_modules', 'mongoose'));
const jwt = require(path.join(BACKEND, 'node_modules', 'jsonwebtoken'));
mongoose.set('bufferCommands', false);

const src = (p) => require(path.join(BACKEND, 'src', p));
const User = src('models/User'), Employee = src('models/Employee'), Company = src('models/Company');
const Campaign = src('models/Campaign'), Booking = src('models/Booking'), Station = src('models/Station');
const Payment = src('models/Payment'), AuditLog = src('models/AuditLog');

const OID = () => new mongoose.Types.ObjectId();
const CO = OID(), MEDIA = OID(), CAMP = OID();
const U = { admin: OID(), owner: OID(), staff: OID(), indiv: OID(), stationUser: OID() };
let db, audit;

const mkStation = (name, overrides) => new Station({
    name, slug: name.toLowerCase().replace(/\s+/g, '-'), type: 'RADIO', companyId: MEDIA, adminId: U.admin,
    phone: '+2348000000000', email: 'desk@station.test', website: 'https://station.test',
    pricing: { amount: 50000, currency: 'NGN', unit: 'SPOT' }, reach: '2M', ...overrides,
});
const seed = () => {
    audit = [];
    db = {
        users: [
            { _id: U.admin, accountType: 'ADMIN', status: 'ACTIVE', companyId: null },
            { _id: U.owner, accountType: 'COMPANY', status: 'ACTIVE', companyId: CO },
            { _id: U.staff, accountType: 'EMPLOYEE', status: 'ACTIVE', companyId: CO },
            { _id: U.indiv, accountType: 'INDIVIDUAL', status: 'ACTIVE', companyId: null },
            { _id: U.stationUser, accountType: 'STATION', status: 'ACTIVE', companyId: null },
        ],
        employees: [
            { _id: OID(), userId: U.owner, companyId: CO, position: 'Company Owner', permissions: ['ALL_ACCESS'], isActive: true },
            { _id: OID(), userId: U.staff, companyId: CO, position: 'Manager', permissions: ['ALL_ACCESS'], isActive: true },
        ],
        companies: [{ _id: CO, name: 'Buyer', status: 'APPROVED' }, { _id: MEDIA, name: 'Media Co', status: 'APPROVED', email: 'm@m.test' }],
        campaigns: [{ _id: CAMP, name: 'Launch', companyId: CO, userId: U.owner, status: 'DRAFT', budget: 1 }],
        stations: [
            mkStation('Live FM', { approvalStatus: 'APPROVED', isActive: true }),
            mkStation('Paused FM', { approvalStatus: 'APPROVED', isActive: false }),
            mkStation('Pending FM', { approvalStatus: 'PENDING', isActive: true }), // schema default isActive=true
            mkStation('Rejected FM', { approvalStatus: 'REJECTED', isActive: false }),
            mkStation('Live TV', { approvalStatus: 'APPROVED', isActive: true, type: 'TV' }),
        ],
        bookings: [],
    };
    db.users.forEach((u) => { u.id = String(u._id); });
};
const st = (name) => db.stations.find((s) => s.name === name);

const matchVal = (a, c) => (c && typeof c === 'object' && '$nin' in c ? !c.$nin.includes(a) : c instanceof Date ? a instanceof Date && +a === +c : String(a) === String(c));
const matches = (d, f) => Object.entries(f).every(([k, v]) => matchVal(d[k], v));
const project = (doc, sel) => {
    if (!doc || !sel) return doc;
    const parts = sel.split(/\s+/).filter(Boolean);
    if (parts.every((p) => p.startsWith('-'))) return doc; // exclusion projections (e.g. '-password'): keep the live doc
    const o = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
    const out = { _id: o._id };
    parts.forEach((f) => { if (f in o) out[f] = o[f]; });
    return out;
};
const q = (getter) => {
    let sel = null;
    const x = { select: (s) => { sel = s; return x; }, populate: () => x, lean: () => x, sort: () => x, limit: () => x,
        then: (r, j) => Promise.resolve().then(() => { const v = getter(); return Array.isArray(v) ? v.map((d) => project(d, sel)) : project(v, sel); }).then(r, j) };
    return x;
};
const asDoc = (d) => d && (typeof d.save === 'function' ? d : Object.assign(d, { save: async () => d, toObject: () => ({ ...d }) }));
const fake = (M, c) => {
    M.find = (f = {}) => q(() => (db[c] || []).filter((d) => matches(d, f)));
    M.findOne = (f) => q(() => asDoc((db[c] || []).find((d) => matches(d, f)) || null));
    M.findById = (id) => q(() => asDoc((db[c] || []).find((d) => String(d._id) === String(id)) || null));
    M.exists = async (f) => ((db[c] || []).some((d) => matches(d, f)) ? { _id: 1 } : null);
    M.countDocuments = async (f = {}) => (db[c] || []).filter((d) => matches(d, f)).length;
};
fake(User, 'users'); fake(Employee, 'employees'); fake(Company, 'companies'); fake(Campaign, 'campaigns');
fake(Booking, 'bookings'); fake(Station, 'stations'); fake(Payment, 'payments'); fake(AuditLog, 'audit');
// N9 fixture plumbing: booking creation takes a per-station lock (Station.findOneAndUpdate / updateOne).
// These suites send requests one at a time, so the fake grants the lock; N9 tests the lock itself.
Station.findOneAndUpdate = async (f) => ({ _id: f._id });
Station.updateOne = async () => ({ matchedCount: 1 });

Station.prototype.save = async function () { await this.validate(); return this; };
Station.prototype.populate = async function () { return this; }; // admin handlers populate companyId for the response
Station.create = async (data) => { const s = new Station(data); await s.validate(); db.stations.push(s); return s; };
Booking.create = async (data) => { const b = new Booking(data); await b.validate(); db.bookings.push(b); return b; };
AuditLog.create = async (data) => { const a = new AuditLog(data); await a.validate(); audit.push(a.toObject()); return a; };

const app = src('app');
const tok = (id) => jwt.sign({ id: String(id) }, process.env.JWT_SECRET, { expiresIn: '5m' });
const results = [];
const check = (label, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`); };
const PRIVATE = ['companyId', 'adminId', 'approvalStatus', 'isActive', 'phone', 'email', 'createdAt', 'updatedAt', '__v', 'status'];
const leaks = (obj) => PRIVATE.filter((k) => obj && k in obj);

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
    let r;

    // ── A. model ──
    const ap = Station.schema.path('approvalStatus');
    check('A   Authoritative field approvalStatus enum = PENDING,APPROVED,REJECTED (default PENDING)', ap.enumValues.join(',') === 'PENDING,APPROVED,REJECTED' && ap.defaultValue === 'PENDING');
    check('A   isActive is Boolean; no `status` path on Station', Station.schema.path('isActive').instance === 'Boolean' && !Station.schema.path('status'));
    for (const v of ['PENDING', 'APPROVED', 'REJECTED']) {
        let e = null; try { await mkStation(`V ${v}`, { approvalStatus: v }).validate(); } catch (x) { e = x; }
        check(`A   approvalStatus ${v} accepted`, !e);
    }
    for (const v of ['ACTIVE', 'INACTIVE', 'approved']) {
        let e = null; try { await mkStation(`X ${v}`, { approvalStatus: v }).validate(); } catch (x) { e = x; }
        check(`A   approvalStatus ${v} rejected by schema`, e?.errors?.approvalStatus?.kind === 'enum');
    }
    const strict = mkStation('Strict FM', { status: 'APPROVED' });
    check('A   Writing obsolete `status` is dropped by the schema (why legacy approve never worked)', strict.toObject().status === undefined);

    // ── D. public list ──
    seed();
    r = await call(null, 'GET', '/api/v1/stations');
    const names = (r.body.data || []).map((s) => s.name).sort();
    check('D   Public list (no auth) → 200, only APPROVED + active', r.code === 200 && names.join(',') === 'Live FM,Live TV', `${r.code} ${names.join(',')}`);
    check('D   Public list exposes no private/internal fields', (r.body.data || []).every((s) => leaks(s).length === 0), (r.body.data || []).map(leaks).flat().join(',') || 'clean');
    check('D   Public list keeps browse/book fields (name,type,location,pricing,reach,website)', (r.body.data || []).every((s) => s.name && s.type && s.location && s.pricing?.amount === 50000 && s.reach === '2M' && s.website));
    r = await call(U.owner, 'GET', '/api/v1/stations/type/radio');
    check('D   By-type (lowercase "radio") → only Live FM, no private fields', r.code === 200 && r.body.data?.map((s) => s.name).join(',') === 'Live FM' && leaks(r.body.data[0]).length === 0, `${r.code} ${r.body.data?.map((s) => s.name)}`);
    r = await call(null, 'GET', '/api/v1/stations/type/BILLBOARD');
    check('D   By-type with no matching public station → 200 []', r.code === 200 && r.body.data?.length === 0);

    // ── E. public detail ──
    r = await call(null, 'GET', `/api/v1/stations/${st('Live FM')._id}`);
    check('E   Public detail of live station → 200, safe fields only', r.code === 200 && r.body.data?.name === 'Live FM' && leaks(r.body.data).length === 0, `${r.code} leaks=${leaks(r.body.data)}`);
    for (const n of ['Paused FM', 'Pending FM', 'Rejected FM']) {
        r = await call(U.owner, 'GET', `/api/v1/stations/${st(n)._id}`);
        check(`E   Public detail of ${n} → 404`, r.code === 404 && r.body.message === 'Station not found', `${r.code}`);
    }
    r = await call(null, 'GET', `/api/v1/stations/${OID()}`);
    check('E   Nonexistent station → 404', r.code === 404);
    r = await call(null, 'GET', '/api/v1/stations/not-an-id');
    check('E   Malformed id → 404, no 500', r.code === 404);

    // ── B. admin lifecycle (canonical endpoints) ──
    seed();
    let s = st('Paused FM');
    r = await call(U.admin, 'PATCH', `/api/v1/admin/stations/${s._id}/activate`);
    let acts = audit.filter((a) => a.action === 'ACTIVATE_STATION');
    check('B   Admin activate APPROVED station → 200, isActive true, approvalStatus unchanged', r.code === 200 && s.isActive === true && s.approvalStatus === 'APPROVED', `${r.code}`);
    check('B   Exactly one ACTIVATE_STATION audit, actor admin, no `status` written', acts.length === 1 && String(acts[0].userId) === String(U.admin) && s.toObject().status === undefined);
    r = await call(null, 'GET', `/api/v1/stations/${s._id}`);
    check('B   …and it is now publicly visible', r.code === 200);
    r = await call(U.admin, 'PATCH', `/api/v1/admin/stations/${s._id}/deactivate`);
    acts = audit.filter((a) => a.action === 'DEACTIVATE_STATION');
    check('B   Admin deactivate → 200, isActive false, inventory UNAVAILABLE, one DEACTIVATE_STATION', r.code === 200 && s.isActive === false && s.inventoryStatus === 'UNAVAILABLE' && acts.length === 1 && String(acts[0].userId) === String(U.admin));
    r = await call(null, 'GET', `/api/v1/stations/${s._id}`);
    check('B   …and it is hidden publicly again', r.code === 404);
    const before = audit.length;
    r = await call(U.admin, 'PATCH', `/api/v1/admin/stations/${st('Pending FM')._id}/activate`);
    check('B   Admin activate PENDING station → 400, unchanged, no audit', r.code === 400 && st('Pending FM').approvalStatus === 'PENDING' && audit.length === before, `${r.code} ${r.body.message}`);
    r = await call(U.admin, 'PATCH', `/api/v1/admin/stations/${st('Pending FM')._id}/approve`);
    check('B   Admin approve PENDING → APPROVED + active + APPROVE_STATION', r.code === 200 && st('Pending FM').approvalStatus === 'APPROVED' && st('Pending FM').isActive && audit.some((a) => a.action === 'APPROVE_STATION'));
    r = await call(U.admin, 'PATCH', `/api/v1/admin/stations/${st('Live TV')._id}/reject`);
    check('B   Admin reject → REJECTED + inactive', r.code === 200 && st('Live TV').approvalStatus === 'REJECTED' && st('Live TV').isActive === false);
    r = await call(U.admin, 'GET', '/api/v1/admin/dashboard');
    check('B   Admin dashboard pendingStations counts approvalStatus (was always 0)', r.code === 200 && r.body.data?.stats?.pendingStations === 0
        && r.body.data?.stats?.totalStations === 5, `${r.code} pending=${r.body.data?.stats?.pendingStations}`);
    seed();
    r = await call(U.admin, 'GET', '/api/v1/admin/dashboard');
    check('B   …with one PENDING station seeded → pendingStations 1', r.body.data?.stats?.pendingStations === 1, `${r.body.data?.stats?.pendingStations}`);

    // ── C. non-admin protection (canonical + legacy write routes) ──
    seed();
    const P = String(st('Pending FM')._id), A = String(st('Paused FM')._id);
    const adminOps = [
        ['PATCH', `/api/v1/admin/stations/${A}/activate`], ['PATCH', `/api/v1/admin/stations/${A}/deactivate`],
        ['PATCH', `/api/v1/admin/stations/${P}/approve`], ['PATCH', `/api/v1/admin/stations/${P}/reject`],
        ['POST', '/api/v1/stations', { name: 'Rogue FM', type: 'RADIO', companyId: String(MEDIA) }],
        ['PATCH', `/api/v1/stations/${P}/approve`], ['PUT', `/api/v1/stations/${P}`, { name: 'Renamed' }], ['DELETE', `/api/v1/stations/${A}`],
    ];
    const snap = () => JSON.stringify(db.stations.map((x) => x.toObject()));
    const before2 = snap();
    for (const [who, label, exp] of [[U.owner, 'Company owner', 403], [U.staff, 'Employee (ALL_ACCESS)', 403], [U.indiv, 'Individual', 403], [U.stationUser, 'STATION account', 403], [null, 'No token', 401]]) {
        let ok = true; const codes = [];
        for (const [m, url, body] of adminOps) { const x = await call(who, m, url, body); codes.push(x.code); if (x.code !== exp) ok = false; }
        check(`C   ${label} on all 8 station write routes → ${exp}`, ok, codes.join(','));
    }
    check('C   No station changed, none created, no audit from non-admins', snap() === before2 && db.stations.length === 5 && audit.length === 0);

    // ── G. legacy write routes delegate to canonical admin handlers ──
    seed();
    r = await call(U.admin, 'POST', '/api/v1/stations', { name: 'Fresh FM', type: 'RADIO', companyId: String(MEDIA), status: 'APPROVED', price: 1 });
    const fresh = st('Fresh FM');
    check('G   Legacy POST /stations (admin) → 201 via canonical create: PENDING, inactive, no `status`/`price`', r.code === 201 && fresh?.approvalStatus === 'PENDING' && fresh?.isActive === false
        && fresh.toObject().status === undefined && fresh.toObject().price === undefined && audit.some((a) => a.action === 'CREATE_STATION'), `${r.code} ${r.body.message || ''}`);
    r = await call(U.admin, 'POST', '/api/v1/stations', { name: 'No Owner FM', type: 'RADIO' });
    check('G   Legacy POST without companyId → 201 (stations are run by Media Masters; a media company is optional)', r.code === 201, `${r.code} ${r.body.message}`);
    r = await call(U.admin, 'PUT', `/api/v1/stations/${fresh._id}`, { name: 'Fresh FM 2', approvalStatus: 'APPROVED', isActive: true, status: 'APPROVED' });
    check('G   Legacy PUT (admin) renames but CANNOT approve/activate (lifecycle not editable)', r.code === 200 && fresh.name === 'Fresh FM 2' && fresh.approvalStatus === 'PENDING' && fresh.isActive === false, `${r.code} ${fresh.approvalStatus}/${fresh.isActive}`);
    r = await call(U.admin, 'PATCH', `/api/v1/stations/${fresh._id}/approve`);
    check('G   Legacy PATCH approve (admin) now really approves (approvalStatus APPROVED, active) + APPROVE_STATION', r.code === 200 && fresh.approvalStatus === 'APPROVED' && fresh.isActive === true
        && audit.filter((a) => a.action === 'APPROVE_STATION').length === 1, `${r.code} ${fresh.approvalStatus}`);
    r = await call(null, 'GET', `/api/v1/stations/${fresh._id}`);
    check('G   …and the station is then publicly visible', r.code === 200);
    r = await call(U.admin, 'DELETE', `/api/v1/stations/${fresh._id}`);
    check('G   Legacy DELETE (admin) = soft deactivate: record kept, inactive, DEACTIVATE_STATION', r.code === 200 && !!st('Fresh FM 2') && fresh.isActive === false && audit.some((a) => a.action === 'DEACTIVATE_STATION'), `${r.code}`);
    r = await call(U.admin, 'PATCH', `/api/v1/stations/not-an-id/approve`);
    check('G   Legacy approve malformed id → 400, no 500', r.code === 400, `${r.code}`);

    // ── F. booking compatibility (D3 intact) ──
    seed();
    const future = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    let t = 8;
    const book = (stn, extra = {}) => call(U.owner, 'POST', '/api/v1/bookings', { campaignId: String(CAMP), stationId: String(stn._id), slot: 'PRIME', date: future, time: `${String(t++).padStart(2, '0')}:00`, duration: 30, ...extra });
    r = await book(st('Live FM'), { price: 1, currency: 'USD' });
    const b = db.bookings[0];
    check('F   Live station bookable; client price/currency ignored → 50000 NGN', r.code === 201 && b?.price === 50000 && b?.currency === 'NGN', `${r.code} ${b?.price} ${b?.currency}`);
    for (const n of ['Paused FM', 'Pending FM', 'Rejected FM']) {
        r = await book(st(n), { price: 1 });
        check(`F   ${n} not bookable → 400`, r.code === 400 && db.bookings.length === 1, `${r.code} ${r.body.message}`);
    }

    // ── H. ownership ──
    check('H   N/A: no station-manager/staff accounts or station-management routes exist yet (STATION account blocked from admin routes above)', true);

    const passed = results.filter(Boolean).length;
    console.log(`\n${passed}/${results.length} passed`);
    process.exitCode = passed === results.length ? 0 : 1;
    // Graceful shutdown: wait for the server and its keep-alive sockets to close, then let Node exit on its own.
    await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
        server.closeAllConnections();
    });
})().catch((e) => { console.log('HARNESS CRASH ' + e.stack); process.exitCode = 1; });
