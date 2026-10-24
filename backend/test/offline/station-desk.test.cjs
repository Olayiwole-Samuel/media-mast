// Station desk verification harness — offline: station managers (admin-created, assigned stations), station
// calendar (weekly airtime, blocked dates, affected bookings), cancellation policy (free before start, none
// within 2h of airing, 10–20% progress fee, campaign cancel, station-caused full refunds).
// Real app/routes/middleware/controllers/validators/models/password hook. In-memory store, no database.
'use strict';
process.env.JWT_SECRET = 'station-desk-harness-dummy-secret';
process.env.JWT_EXPIRE = '5m';
process.env.SUBSCRIPTION_REQUIRED = 'false'; // subscription gating is covered by subscriptions.test.cjs
process.env.ALLOW_DIRECT_BOOKING = 'true'; // these checks exercise the direct (unpaid) booking route
delete process.env.VERCEL;
delete process.env.PLATFORM_FEE_PERCENT;

const path = require('path');
const BACKEND = path.resolve(__dirname, '..', '..'); // backend/ (this file: backend/test/offline/)
const mongoose = require(path.join(BACKEND, 'node_modules', 'mongoose'));
const jwt = require(path.join(BACKEND, 'node_modules', 'jsonwebtoken'));
mongoose.set('bufferCommands', false); // any un-faked DB call fails instead of reaching a real DB

const src = (p) => require(path.join(BACKEND, 'src', p));
const User = src('models/User'), Employee = src('models/Employee'), Company = src('models/Company'), AuditLog = src('models/AuditLog');
const Campaign = src('models/Campaign'), Station = src('models/Station'), Booking = src('models/Booking'), Payment = src('models/Payment');
const policy = src('utils/cancellationPolicy');
const payments = src('utils/payments');

const OID = () => new mongoose.Types.ObjectId();
let db;
const clone = (o) => mongoose.mongo.BSON.deserialize(mongoose.mongo.BSON.serialize(o), { promoteValues: true });
const eq = (a, b) => (a == null && b == null) || (a != null && b != null && String(a) === String(b));
const cmp = (x, y) => (x instanceof Date ? x.getTime() : x) - (y instanceof Date ? y.getTime() : y);
const has = (x, y) => (Array.isArray(x) ? x.some((z) => eq(z, y)) : eq(x, y));
const matches = (d, f = {}) => Object.entries(f).every(([k, v]) => {
    if (k === '$or') return v.some((g) => matches(d, g));
    const x = d[k];
    if (v && typeof v === 'object' && !(v instanceof mongoose.Types.ObjectId) && !(v instanceof Date) && !Array.isArray(v)) {
        if ('$in' in v) return v.$in.some((y) => has(x, y));
        if ('$nin' in v) return !v.$nin.some((y) => has(x, y));
        if ('$ne' in v) return !has(x, v.$ne);
        if ('$lte' in v) return x != null && cmp(x, v.$lte) <= 0;
        return true;
    }
    if (v instanceof Date) return x instanceof Date && x.getTime() === v.getTime();
    return has(x, v);
});
// Projection for hydrate, so unselected paths get no defaults (as with a real .select()).
// Inclusive selections keep _id, exactly like MongoDB (hydrate itself would drop it).
const toProjection = (sel) => {
    if (!sel || typeof sel !== 'string') return undefined;
    const proj = Object.fromEntries(sel.split(/\s+/).filter(Boolean).map((p) => (p.startsWith('-') ? [p.slice(1), 0] : [p.replace(/^\+/, ''), 1])));
    if (Object.values(proj).some((v) => v === 1) && !('_id' in proj)) proj._id = 1;
    return proj;
};
const project = (o, sel) => {
    if (!o || !sel || typeof sel !== 'string') return o;
    const parts = sel.split(/\s+/).filter(Boolean);
    if (parts.every((p) => p.startsWith('-') || p.startsWith('+'))) {
        const copy = { ...o }; parts.filter((p) => p.startsWith('-')).forEach((p) => delete copy[p.slice(1)]); return copy;
    }
    const out = { _id: o._id }; parts.forEach((k) => { if (k in o) out[k] = o[k]; }); return out;
};
const REFS = { campaignId: 'campaigns', stationId: 'stations', userId: 'users', companyId: 'companies', paymentId: 'payments' };
let sessionReads = 0;
const q = (M, getter) => {
    let sel = null; const pops = [];
    const x = {
        select: (s) => { sel = s; return x; }, lean: () => x, sort: () => x,
        session: (s) => { if (s) sessionReads++; return x; },
        populate: (p, s) => { pops.push([p, s]); return x; },
        then: (r, j) => Promise.resolve().then(() => {
            const conv = (o) => {
                if (!o) return null;
                const plain = clone(project(o, sel));
                if (!pops.length) return M.hydrate(plain, toProjection(sel));
                for (const [p, s] of pops) {
                    const ref = db[REFS[p]] && db[REFS[p]].find((d) => eq(d._id, o[p]));
                    plain[p] = ref ? project(clone(ref), s) : null;
                }
                Object.defineProperty(plain, 'toObject', { value: () => ({ ...plain }), enumerable: false });
                return plain;
            };
            const v = getter();
            return Array.isArray(v) ? v.map(conv) : conv(v);
        }).then(r, j),
    };
    return x;
};
const fail = {};
const applyUpdate = (o, u) => {
    Object.assign(o, u.$set || {});
    for (const [k, n] of Object.entries(u.$inc || {})) o[k] = (o[k] || 0) + n;
    for (const [k, v] of Object.entries(u.$addToSet || {})) { o[k] = o[k] || []; if (!o[k].some((z) => eq(z, v))) o[k].push(v); }
    for (const [k, v] of Object.entries(u.$pull || {})) { o[k] = (o[k] || []).filter((z) => !eq(z, v)); }
};
const C = { users: User, employees: Employee, companies: Company, campaigns: Campaign, stations: Station, bookings: Booking, payments: Payment };
for (const [c, M] of Object.entries(C)) {
    M.find = (f) => q(M, () => db[c].filter((d) => matches(d, f)));
    M.findOne = (f) => q(M, () => db[c].find((d) => matches(d, f)) || null);
    M.findById = (id) => q(M, () => db[c].find((d) => eq(d._id, id)) || null);
    M.findOneAndUpdate = (f, u, opts = {}) => q(M, () => {
        const o = db[c].find((d) => matches(d, f)); if (!o) return null;
        const prior = { ...o }; applyUpdate(o, u);
        return opts.returnDocument === 'after' || opts.new ? o : prior;
    });
    M.updateOne = async (f, u) => { const o = db[c].find((d) => matches(d, f)); if (!o) return { matchedCount: 0, modifiedCount: 0 }; applyUpdate(o, u); return { matchedCount: 1, modifiedCount: 1 }; };
    M.updateMany = async (f, u) => { const os = db[c].filter((d) => matches(d, f)); os.forEach((o) => applyUpdate(o, u)); return { matchedCount: os.length, modifiedCount: os.length }; };
    M.create = async (data, opts) => {
        if (Array.isArray(data)) { const outs = []; for (const d of data) outs.push(await M.create(d, opts)); return outs; }
        if (fail[`${c}.create`]) { const e = fail[`${c}.create`]; delete fail[`${c}.create`]; throw e; }
        const d = new M(data); await d.validate();
        const r = M.schema.s.hooks.execPre('save', d, [{}]); if (r && r.then) await r;
        db[c].push(d.toObject());
        if (opts && opts.session && opts.session.inserted) opts.session.inserted.push([c, d._id]);
        return M.hydrate(clone(d.toObject()));
    };
    M.prototype.save = async function save() {
        await this.validate();
        const r = M.schema.s.hooks.execPre('save', this, [{}]); if (r && r.then) await r;
        const plain = this.toObject();
        if (db[c].some((x) => eq(x._id, plain._id))) db[c] = db[c].map((x) => (eq(x._id, plain._id) ? plain : x)); else db[c].push(plain);
        return this;
    };
}
const sessions = [];
mongoose.startSession = async () => {
    const s = {
        ended: false, inserted: [], options: null,
        async withTransaction(fn, options) {
            s.inserted = []; s.options = options;
            try { await fn(); } catch (e) { for (const [c, id] of s.inserted) db[c] = db[c].filter((d) => !eq(d._id, id)); throw e; }
        },
        async endSession() { s.ended = true; },
    };
    sessions.push(s);
    return s;
};
AuditLog.create = async (data) => { const a = new AuditLog(data); await a.validate(); db.audit.push(a.toObject()); return a; };
const refunds = [];
const realStub = payments.getPaymentProvider();
payments.setPaymentProviderForTests({ name: 'STUB', isTestMode: true, charge: (a) => realStub.charge(a), refund: async (a) => { refunds.push(a.amount); return realStub.refund(a); } });

const logs = [];
for (const k of ['log', 'warn', 'error', 'info']) console[k] = (...a) => logs.push(a.map((x) => (x instanceof Error ? `${x.name} ${x.message}` : typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
const out = (s) => process.stdout.write(s + '\n');

// ── Time helpers (Lagos = UTC+1) ──
const lagos = (ms) => { const d = new Date(ms + 3600000); return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16) }; };
const inHours = (h) => lagos(Date.now() + h * 3600000);
const dayOnly = (n) => lagos(Date.now() + n * 864e5).date;
const weekdayOf = (dateOnly) => ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'][new Date(`${dateOnly}T00:00:00Z`).getUTCDay()];

// ── Fixture ──
const A = OID();
const U = { admin: OID(), mgr1: OID(), mgr2: OID(), indiv: OID(), ownerA: OID() };
const S = {}; const CP = {}; const PAY = {};
const PW = 'Aa1!managerPass';
const seed = () => {
    for (const k of Object.keys(fail)) delete fail[k];
    refunds.length = 0; sessions.length = 0; sessionReads = 0;
    const u = (id, accountType, companyId, email, extra = {}) => ({ _id: id, email, name: `n-${email.split('@')[0]}`, accountType, status: 'ACTIVE', companyId, tokenVersion: 0, password: '$2b$10$' + 'x'.repeat(53), ...extra });
    const st = (key, extra = {}) => { const s = { _id: OID(), name: `Station ${key}`, slug: `st-${key.toLowerCase()}`, type: 'RADIO', approvalStatus: 'APPROVED', isActive: true, inventoryStatus: 'AVAILABLE', pricing: { amount: 40000, currency: 'NGN', unit: 'SPOT' }, companyId: null, managerIds: [], airtimeHours: {}, blackouts: [], bookingLockUntil: null, ...extra }; S[key] = s; return s; };
    const cp = (key, extra = {}) => { const c = { _id: OID(), name: key, objective: 'BRAND_AWARENESS', budget: 1, currency: 'NGN', status: 'BOOKING_REQUESTS_SENT', companyId: null, userId: U.indiv, startDate: null, endDate: null, ...extra }; CP[key] = c; return c; };
    db = {
        users: [u(U.admin, 'ADMIN', null, 'admin@example.com'), u(U.mgr1, 'STATION', null, 'mgr1@mm.example.com'), u(U.mgr2, 'STATION', null, 'mgr2@mm.example.com'),
            u(U.indiv, 'INDIVIDUAL', null, 'ivy@example.com'), u(U.ownerA, 'COMPANY', A, 'owner-a@example.com')],
        employees: [{ _id: OID(), userId: U.ownerA, companyId: A, position: 'Company Owner', permissions: ['ALL_ACCESS'], isActive: true }],
        companies: [{ _id: A, name: 'Advertiser Co', status: 'APPROVED' }],
        stations: [st('ONE', { managerIds: [U.mgr1] }), st('TWO', { managerIds: [U.mgr1, U.mgr2] }), st('THREE', { managerIds: [U.mgr2] }), st('FREE')],
        campaigns: [cp('upcoming'), cp('running'), cp('late')],
        bookings: [], payments: [], audit: [],
    };
    const pay = (key, campaign, amount) => { const p = { _id: OID(), campaignId: CP[campaign]._id, companyId: null, userId: U.indiv, amount, subtotal: amount, platformFee: 0, currency: 'NGN', reference: `PAY-${key}`, status: 'SUCCESSFUL', provider: 'STUB', refundAmount: 0 }; PAY[key] = p; db.payments.push(p); return p; };
    const bk = (station, campaign, when, status, extra = {}) => ({ _id: OID(), bookingReference: `BK-${Math.random().toString(36).slice(2, 8)}`, campaignId: CP[campaign]._id, stationId: S[station]._id, userId: U.indiv, companyId: null, slot: 'PRIME_TIME', date: new Date(`${when.date}T00:00:00.000Z`), time: when.time, duration: 30, price: 40000, currency: 'NGN', status, paymentStatus: 'PAID', ...extra });
    // upcoming: two future spots, not started → free cancellation
    pay('up', 'upcoming', 80000);
    db.bookings.push(bk('ONE', 'upcoming', inHours(24 * 5), 'ACCEPTED', { paymentId: PAY.up._id }), bk('TWO', 'upcoming', inHours(24 * 6), 'PENDING', { paymentId: PAY.up._id }));
    // running: one aired (completed 2 days ago), two future → 1/3 progress
    pay('run', 'running', 120000);
    db.bookings.push(bk('ONE', 'running', inHours(-48), 'COMPLETED', { paymentId: PAY.run._id }), bk('ONE', 'running', inHours(24 * 3), 'SCHEDULED', { paymentId: PAY.run._id }), bk('TWO', 'running', inHours(24 * 4), 'ACCEPTED', { paymentId: PAY.run._id }));
    // late: one spot airing in 5 hours (outside the 2h cutoff; campaign not started yet)
    // and one airing in 1 hour (inside the 2h cutoff: can no longer be cancelled)
    pay('late', 'late', 40000);
    pay('soon', 'late', 40000);
    db.bookings.push(bk('THREE', 'late', inHours(5), 'SCHEDULED', { paymentId: PAY.late._id }), bk('THREE', 'late', inHours(1), 'SCHEDULED', { paymentId: PAY.soon._id }));
};
const bks = (campaign) => db.bookings.filter((b) => eq(b.campaignId, CP[campaign]._id));

const app = src('app');
const tok = (id) => { const usr = db.users.find((x) => eq(x._id, id)); return jwt.sign({ id: String(id), tokenVersion: usr ? usr.tokenVersion || 0 : 0 }, process.env.JWT_SECRET, { expiresIn: '5m' }); };
const results = [];
const check = (label, ok, detail = '') => { results.push(ok); out(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== '' ? '  — ' + detail : ''}`); };
const isContract = (r, field) => r.code === 400 && r.body.success === false && r.body.message === r.body.errors?.[0] && Array.isArray(r.body.fieldErrors) && (!field || r.body.fieldErrors.some((f) => f.field === field));

(async () => {
    seed();
    const server = app.listen(0, '127.0.0.1'); // loopback only
    await new Promise((resolve, reject) => server.once('listening', resolve).once('error', reject)); // address() is null until bound
    const base = `http://127.0.0.1:${server.address().port}`;
    const call = async (who, method, url, body) => {
        const r = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(who ? { Authorization: `Bearer ${tok(who)}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
        const text = await r.text(); let parsed = {}; try { parsed = JSON.parse(text); } catch { parsed = {}; }
        return { code: r.status, body: parsed, text };
    };

    // ── U: policy unit rules ──
    check('U1  Fee is 10% at 0% progress, 15% at half, capped at 20%', policy.feePercentFor(0) === 10 && policy.feePercentFor(0.5) === 15 && policy.feePercentFor(1) === 20 && policy.feePercentFor(3) === 20);
    const t = policy.airTimeOf({ date: new Date('2030-01-10T00:00:00Z'), time: '08:00' });
    check('U2  Air time is Lagos time (08:00 WAT = 07:00 UTC)', t.toISOString() === '2030-01-10T07:00:00.000Z', t.toISOString());

    // ── M: station managers (admin) ──
    let r = await call(null, 'POST', '/api/v1/auth/register', { accountType: 'station', email: 'x@fm.example.com', password: PW, name: 'X', stationName: 'X FM', stationType: 'RADIO', state: 'Lagos' });
    check('M1  No public station sign-up any more → 400', r.code === 400 && !db.users.some((x) => x.email === 'x@fm.example.com'), `${r.code} ${r.body.message}`);
    r = await call(U.admin, 'POST', '/api/v1/admin/station-managers', { name: 'Tolu Desk', email: 'Tolu@MM.example.com', password: PW, stationIds: [String(S.ONE._id), String(S.FREE._id)] });
    const tolu = db.users.find((x) => x.email === 'tolu@mm.example.com');
    check('M2  Admin creates a manager → 201, STATION account, ACTIVE, must change password, hashed', r.code === 201 && !!tolu && tolu.accountType === 'STATION' && tolu.status === 'ACTIVE' && tolu.mustChangePassword === true && tolu.password !== PW, `${r.code} ${r.body.message}`);
    check('M3  …assigned to both stations in one transaction; response lists them, no password', S.ONE && db.stations.find((s) => eq(s._id, S.ONE._id)).managerIds.some((id) => eq(id, tolu?._id)) && db.stations.find((s) => eq(s._id, S.FREE._id)).managerIds.length === 1 && sessions.length === 1 && sessions[0].ended && r.body.data?.stations?.length === 2 && !/"password"/.test(r.text));
    const before = db.users.length;
    r = await call(U.admin, 'POST', '/api/v1/admin/station-managers', { name: 'Ghost', email: 'ghost@mm.example.com', password: PW, stationIds: [String(OID())] });
    check('M4  Unknown station → 400, nothing created (rolled back)', isContract(r, 'stationIds') && db.users.length === before, `${r.code}`);
    r = await call(U.admin, 'POST', '/api/v1/admin/station-managers', { name: 'Dup', email: 'mgr1@mm.example.com', password: PW });
    const r2 = await call(U.admin, 'POST', '/api/v1/admin/station-managers', { name: 'Weak', email: 'weak@mm.example.com', password: 'password' });
    const r3 = await call(U.admin, 'POST', '/api/v1/admin/station-managers', { name: 'Role', email: 'role@mm.example.com', password: PW, accountType: 'ADMIN' });
    check('M5  Duplicate email → 409; weak password → 400; extra field (accountType) → 400', r.code === 409 && isContract(r2, 'password') && isContract(r3, 'accountType'), `${r.code}/${r2.code}/${r3.code}`);
    r = await call(U.mgr1, 'POST', '/api/v1/admin/station-managers', { name: 'Self', email: 'self@mm.example.com', password: PW });
    const r4 = await call(U.ownerA, 'GET', '/api/v1/admin/station-managers');
    check('M6  Managers and companies cannot use admin manager endpoints → 403', r.code === 403 && r4.code === 403, `${r.code}/${r4.code}`);
    r = await call(U.admin, 'GET', '/api/v1/admin/station-managers');
    const mgr1Row = (r.body.data || []).find((m) => eq(m._id, U.mgr1));
    check('M7  List shows managers with their stations', r.code === 200 && mgr1Row?.stations?.length === 2 && !/"password"/.test(r.text), `${r.code}`);
    r = await call(U.admin, 'PATCH', `/api/v1/admin/station-managers/${U.mgr2}`, { stationIds: [String(S.THREE._id)] });
    check('M8  Reassign replaces assignments (mgr2: TWO+THREE → THREE)', r.code === 200 && !db.stations.find((s) => eq(s._id, S.TWO._id)).managerIds.some((id) => eq(id, U.mgr2)) && db.stations.find((s) => eq(s._id, S.THREE._id)).managerIds.some((id) => eq(id, U.mgr2)), `${r.code}`);
    r = await call(U.admin, 'PUT', `/api/v1/admin/stations/${S.FREE._id}/managers`, { managerIds: [String(U.mgr2)] });
    const r5 = await call(U.admin, 'PUT', `/api/v1/admin/stations/${S.FREE._id}/managers`, { managerIds: [String(U.indiv)] });
    check('M9  Set a station\'s managers; a non-manager account → 400', r.code === 200 && db.stations.find((s) => eq(s._id, S.FREE._id)).managerIds.length === 1 && eq(db.stations.find((s) => eq(s._id, S.FREE._id)).managerIds[0], U.mgr2) && isContract(r5, 'managerIds'), `${r.code}/${r5.code}`);
    r = await call(U.admin, 'PATCH', `/api/v1/admin/station-managers/${U.mgr2}`, { status: 'SUSPENDED' });
    const r6 = await call(U.mgr2, 'GET', '/api/v1/station-portal/summary');
    check('M10 Suspending a manager ends their access at once', r.code === 200 && db.users.find((x) => eq(x._id, U.mgr2)).status === 'SUSPENDED' && [401, 403].includes(r6.code), `${r.code}/${r6.code}`);
    r = await call(U.admin, 'PATCH', '/api/v1/admin/station-managers/not-an-id', { name: 'x' });
    const r7 = await call(U.admin, 'PATCH', `/api/v1/admin/station-managers/${U.indiv}`, { name: 'x' });
    check('M11 Malformed id → 400; a non-manager user → 404', r.code === 400 && r7.code === 404, `${r.code}/${r7.code}`);

    // ── D: the desk is scoped to assigned stations; admins see all ──
    seed();
    r = await call(U.mgr1, 'GET', '/api/v1/bookings/station');
    check('D1  Manager sees bookings of assigned stations only (ONE+TWO)', r.code === 200 && r.body.data.length === 5 && r.body.data.every((b) => [String(S.ONE._id), String(S.TWO._id)].includes(String(b.stationId?._id))), `${r.code} ${r.body.data?.length}`);
    const three = db.bookings.find((b) => eq(b.stationId, S.THREE._id));
    r = await call(U.mgr1, 'PATCH', `/api/v1/bookings/${three._id}/schedule`, {});
    check('D2  Manager on an unassigned station\'s booking → 404, unchanged', r.code === 404 && three.status === 'SCHEDULED', `${r.code}`);
    r = await call(U.admin, 'GET', '/api/v1/bookings/station');
    check('D3  Full admin sees every station\'s bookings', r.code === 200 && r.body.data.length === db.bookings.length, `${r.body.data?.length}/${db.bookings.length}`);
    r = await call(U.mgr1, 'GET', '/api/v1/station-portal/stations');
    check('D4  Manager\'s station list = assigned stations', r.code === 200 && r.body.data.length === 2, `${r.body.data?.length}`);

    // ── K: calendar ──
    seed();
    const target = dayOnly(9);
    const wd = weekdayOf(target);
    r = await call(U.mgr1, 'PUT', `/api/v1/station-portal/stations/${S.FREE._id}/airtime`, { airtimeHours: { [wd]: { start: '06:00', end: '20:00' } } });
    check('K1  Manager cannot set hours on an unassigned station → 404', r.code === 404, `${r.code}`);
    r = await call(U.mgr1, 'PUT', `/api/v1/station-portal/stations/${S.ONE._id}/airtime`, { airtimeHours: { [wd]: { start: '06:00', end: '20:00' }, ...(wd === 'SUNDAY' ? { MONDAY: null } : { SUNDAY: null }) } });
    check('K2  Set weekly airtime → 200', r.code === 200 && db.stations.find((s) => eq(s._id, S.ONE._id)).airtimeHours[wd].start === '06:00', `${r.code} ${r.body.message}`);
    for (const [label, body, field] of [['unknown weekday', { airtimeHours: { FUNDAY: null } }, 'airtimeHours.FUNDAY'], ['end before start', { airtimeHours: { [wd]: { start: '20:00', end: '06:00' } } }, null], ['bad time', { airtimeHours: { [wd]: { start: '6am', end: '20:00' } } }, null]]) {
        r = await call(U.mgr1, 'PUT', `/api/v1/station-portal/stations/${S.ONE._id}/airtime`, body);
        check(`K3  Airtime ${label} → 400`, r.code === 400 && (!field || r.body.fieldErrors?.some((f) => f.field === field)), `${r.code} ${r.body.message}`);
    }
    const directBook = (time) => call(U.indiv, 'POST', '/api/v1/bookings', { campaignId: String(CP.upcoming._id), stationId: String(S.ONE._id), slot: 'MORNING', date: target, time, duration: 30 });
    r = await directBook('21:00');
    check('K4  Booking outside airtime → 400 naming the window', r.code === 400 && /only takes bookings between 06:00 and 20:00/.test(r.body.message || ''), `${r.code} ${r.body.message}`);
    r = await directBook('07:00');
    check('K5  Booking inside airtime → 201', r.code === 201, `${r.code} ${r.body.message}`);
    const offDay = wd === 'SUNDAY' ? 'MONDAY' : 'SUNDAY';
    let offDate = dayOnly(3); for (let i = 3; i < 12; i++) { if (weekdayOf(dayOnly(i)) === offDay) { offDate = dayOnly(i); break; } }
    r = await call(U.indiv, 'POST', '/api/v1/bookings', { campaignId: String(CP.upcoming._id), stationId: String(S.ONE._id), slot: 'MORNING', date: offDate, time: '09:00', duration: 30 });
    check('K6  Booking on an off-air weekday → 400', r.code === 400 && /off air on/.test(r.body.message || ''), `${r.code} ${r.body.message}`);

    seed();
    const bDay = dayOnly(20);
    r = await call(U.mgr1, 'POST', `/api/v1/station-portal/stations/${S.ONE._id}/blackouts`, { startDate: bDay, reason: 'maintenance', note: 'Transmitter swap — internal' });
    check('K7  Block a free day → 201', r.code === 201 && db.stations.find((s) => eq(s._id, S.ONE._id)).blackouts.length === 1, `${r.code} ${r.body.message}`);
    r = await call(null, 'GET', `/api/v1/stations/${S.ONE._id}/availability`);
    check('K8  Public availability lists the blocked day without the internal note', r.code === 200 && r.body.data.blackouts.length === 1 && r.body.data.blackouts[0].startDate === bDay && r.body.data.blackouts[0].reason === 'MAINTENANCE' && !/Transmitter|createdBy|note/.test(r.text), `${r.code}`);
    r = await call(U.indiv, 'POST', '/api/v1/payments/checkout', { campaignId: String(CP.upcoming._id), items: [{ stationId: String(S.ONE._id), slot: 'MORNING', date: bDay, time: '10:00', duration: 30 }] });
    check('K9  Checkout on a blocked day → 400 on items.0, nothing charged', isContract(r, 'items.0') && /not available on/.test(r.body.message || '') && db.payments.length === 4, `${r.code} ${r.body.message}`);
    r = await call(U.mgr1, 'POST', `/api/v1/station-portal/stations/${S.ONE._id}/blackouts`, { startDate: dayOnly(30), endDate: dayOnly(30), startTime: '12:00', endTime: '14:00', reason: 'OFF_AIR' });
    const partial = r.body.data?.blackout;
    const ok1 = await call(U.indiv, 'POST', '/api/v1/bookings', { campaignId: String(CP.upcoming._id), stationId: String(S.ONE._id), slot: 'MORNING', date: dayOnly(30), time: '09:00', duration: 30 });
    const no1 = await call(U.indiv, 'POST', '/api/v1/bookings', { campaignId: String(CP.upcoming._id), stationId: String(S.ONE._id), slot: 'AFTERNOON', date: dayOnly(30), time: '13:30', duration: 60 });
    check('K10 Time-window block: 09:00 allowed, 13:30 refused', r.code === 201 && ok1.code === 201 && no1.code === 400, `${r.code}/${ok1.code}/${no1.code}`);
    for (const [label, body, field] of [['end before start', { startDate: dayOnly(10), endDate: dayOnly(9) }, 'endDate'], ['already over', { startDate: dayOnly(-5), endDate: dayOnly(-3) }, 'endDate'], ['only one time', { startDate: dayOnly(10), startTime: '10:00' }, null], ['bad reason', { startDate: dayOnly(10), reason: 'PARTY' }, 'reason'], ['not a date', { startDate: '2030-02-31' }, 'startDate']]) {
        r = await call(U.mgr1, 'POST', `/api/v1/station-portal/stations/${S.ONE._id}/blackouts`, body);
        check(`K11 Blocked period ${label} → 400`, isContract(r, field), `${r.code} ${r.body.message}`);
    }
    // affected bookings
    const upcomingOne = bks('upcoming').find((b) => eq(b.stationId, S.ONE._id));
    const affDay = upcomingOne.date.toISOString().slice(0, 10);
    r = await call(U.mgr1, 'POST', `/api/v1/station-portal/stations/${S.ONE._id}/blackouts`, { startDate: affDay, reason: 'HOLIDAY' });
    check('K12 Blocking a day with a booking → 409 listing it, nothing changed', r.code === 409 && r.body.data?.affected?.length === 1 && upcomingOne.status === 'ACCEPTED' && db.stations.find((s) => eq(s._id, S.ONE._id)).blackouts.length === 2, `${r.code} ${r.body.message}`);
    r = await call(U.mgr1, 'POST', `/api/v1/station-portal/stations/${S.ONE._id}/blackouts`, { startDate: affDay, reason: 'HOLIDAY', cancelAffected: true });
    check('K13 Confirmed → 201; the booking is cancelled by the STATION with a FULL refund (no fee)', r.code === 201 && upcomingOne.status === 'CANCELLED' && upcomingOne.cancelledBy === 'STATION' && upcomingOne.paymentStatus === 'REFUNDED' && upcomingOne.refundAmount === 40000 && upcomingOne.cancellationFee === 0 && refunds.includes(40000), `${r.code} ${upcomingOne.status} ${upcomingOne.refundAmount}`);
    r = await call(U.mgr1, 'DELETE', `/api/v1/station-portal/stations/${S.ONE._id}/blackouts/${partial?._id}`);
    const r8 = await call(U.mgr1, 'DELETE', `/api/v1/station-portal/stations/${S.ONE._id}/blackouts/${OID()}`);
    check('K14 Remove a blocked period → 200; unknown → 404', r.code === 200 && r8.code === 404 && !db.stations.find((s) => eq(s._id, S.ONE._id)).blackouts.some((b) => eq(b._id, partial?._id)), `${r.code}/${r8.code}`);

    // ── X: advertiser cancellation policy ──
    seed();
    let up = bks('upcoming')[0];
    r = await call(U.indiv, 'GET', `/api/v1/bookings/${up._id}/cancellation-quote`);
    check('X1  Quote before the campaign starts: free, full refund', r.code === 200 && r.body.data.rule === 'BEFORE_START' && r.body.data.refundAmount === 40000 && r.body.data.fee === 0 && r.body.data.cancellable === true, `${r.code} ${JSON.stringify(r.body.data)}`);
    r = await call(U.indiv, 'POST', `/api/v1/bookings/${up._id}/cancel`);
    check('X2  Cancel → CANCELLED, REFUNDED in full, payment refund recorded', r.code === 200 && up.status === 'CANCELLED' && up.paymentStatus === 'REFUNDED' && up.refundAmount === 40000 && up.cancelledBy === 'CUSTOMER' && db.payments.find((p) => eq(p._id, PAY.up._id)).refundAmount === 40000, `${r.code} ${up.refundAmount}`);
    const [lateB, soonB] = bks('late');
    r = await call(U.indiv, 'GET', `/api/v1/bookings/${soonB._id}/cancellation-quote`);
    const soonQuote = r;
    r = await call(U.indiv, 'POST', `/api/v1/bookings/${soonB._id}/cancel`);
    check('X3a Spot airing within 2h: quote says not cancellable (TOO_LATE); cancel → 400 "close 2 hours", unchanged', soonQuote.code === 200 && soonQuote.body.data.cancellable === false && soonQuote.body.data.rule === 'TOO_LATE' && r.code === 400 && /close 2 hours/.test(r.body.message || '') && soonB.status === 'SCHEDULED' && soonB.paymentStatus === 'PAID', `${soonQuote.body.data?.rule} ${r.code} ${r.body.message}`);
    r = await call(U.indiv, 'POST', `/api/v1/bookings/${lateB._id}/cancel`);
    check('X3  Spot airing in 5h (outside the 2h cutoff), campaign not started → cancelled with a full refund', r.code === 200 && lateB.status === 'CANCELLED' && lateB.paymentStatus === 'REFUNDED' && lateB.refundAmount === 40000 && r.body.cancellation?.rule === 'BEFORE_START' && db.payments.find((p) => eq(p._id, PAY.late._id)).refundAmount === 40000, `${r.code} ${lateB.paymentStatus} ${r.body.cancellation?.rule}`);
    const [aired, run1, run2] = bks('running');
    r = await call(U.indiv, 'POST', `/api/v1/bookings/${aired._id}/cancel`);
    check('X4  Already-aired (completed) spot → refused, unchanged', r.code === 403 && aired.status === 'COMPLETED', `${r.code}`);
    r = await call(U.indiv, 'GET', `/api/v1/bookings/${run1._id}/cancellation-quote`);
    check('X5  In progress (1 of 3 aired): fee 13.33% → fee 5,332, refund 34,668', r.code === 200 && r.body.data.rule === 'IN_PROGRESS' && r.body.data.feePercent === 13.33 && r.body.data.fee === 5332 && r.body.data.refundAmount === 34668, JSON.stringify(r.body.data));
    r = await call(U.indiv, 'POST', `/api/v1/bookings/${run1._id}/cancel`);
    check('X6  Cancel that SCHEDULED spot → refund 34,668, fee kept 5,332', r.code === 200 && run1.status === 'CANCELLED' && run1.refundAmount === 34668 && run1.cancellationFee === 5332 && refunds.includes(34668), `${r.code} ${run1.refundAmount}`);
    r = await call(U.ownerA, 'POST', `/api/v1/bookings/${run2._id}/cancel`);
    check('X7  Another advertiser cannot cancel it → 404', r.code === 404 && run2.status === 'ACCEPTED', `${r.code}`);
    run2.status = 'PENDING'; // stations decline new (PENDING) requests
    r = await call(U.mgr1, 'PATCH', `/api/v1/bookings/${run2._id}/reject`, { note: 'Off air that week' });
    check('X8  Station declines a paid spot mid-campaign → FULL refund (no fee)', r.code === 200 && run2.status === 'REJECTED' && run2.refundAmount === 40000 && run2.cancellationFee === 0 && run2.cancelledBy === 'STATION', `${r.code} ${run2.refundAmount}`);

    // ── Y: campaign cancellation ──
    seed();
    r = await call(U.indiv, 'GET', `/api/v1/campaigns/${CP.running._id}/cancellation-quote`);
    check('Y1  Campaign quote: 2 remaining spots at 13.33% → refund 69,336, fee 10,664, 1 aired', r.code === 200 && r.body.data.items.length === 2 && r.body.data.totals.refundAmount === 69336 && r.body.data.totals.fee === 10664 && r.body.data.spotsAlreadyAired === 1, `${r.code} ${JSON.stringify(r.body.data?.totals)}`);
    r = await call(U.indiv, 'POST', `/api/v1/campaigns/${CP.running._id}/cancel`);
    const runBks = bks('running');
    check('Y2  Cancel campaign → CANCELLED; remaining spots cancelled with the same fee; aired spot untouched', r.code === 200 && db.campaigns.find((c) => eq(c._id, CP.running._id)).status === 'CANCELLED' && runBks.filter((b) => b.status === 'CANCELLED').length === 2 && runBks.find((b) => b.status === 'COMPLETED') && r.body.data.refundAmount === 69336 && r.body.data.fee === 10664, `${r.code} ${r.body.message} ${r.body.data?.refundAmount}`);
    check('Y3  Payment refund total matches; payment stays SUCCESSFUL (aired spot + fees kept)', db.payments.find((p) => eq(p._id, PAY.run._id)).refundAmount === 69336 && db.payments.find((p) => eq(p._id, PAY.run._id)).status === 'SUCCESSFUL');
    r = await call(U.indiv, 'POST', `/api/v1/campaigns/${CP.running._id}/cancel`);
    check('Y4  Cancelling again → 400, nothing refunded twice', r.code === 400 && db.payments.find((p) => eq(p._id, PAY.run._id)).refundAmount === 69336, `${r.code}`);
    r = await call(U.indiv, 'POST', `/api/v1/campaigns/${CP.upcoming._id}/cancel`);
    check('Y5  Campaign not started → free: every spot refunded in full', r.code === 200 && r.body.data.refundAmount === 80000 && r.body.data.fee === 0 && bks('upcoming').every((b) => b.status === 'CANCELLED' && b.refundAmount === 40000), `${r.code} ${r.body.data?.refundAmount}`);
    r = await call(U.ownerA, 'POST', `/api/v1/campaigns/${CP.late._id}/cancel`);
    check('Y6  Another advertiser\'s campaign → 404', r.code === 404 && bks('late')[0].status === 'SCHEDULED', `${r.code}`);

    // ── S: station earnings include kept fees ──
    seed();
    await call(U.indiv, 'POST', `/api/v1/bookings/${bks('running')[1]._id}/cancel`);
    r = await call(U.mgr1, 'GET', '/api/v1/station-portal/summary');
    check('S1  Desk summary counts kept cancellation fees', r.code === 200 && r.body.data.earnings?.NGN?.cancellationFees === 5332, JSON.stringify(r.body.data?.earnings));

    if (process.env.DESK_DEBUG) out('DEBUG LOGS:\n' + logs.filter((l) => /error|Error/.test(l)).slice(0, 15).join('\n'));
    check('L1  No password or hash in any log line', !logs.some((l) => l.includes(PW) || /\$2[aby]\$\d\d\$/.test(l)));

    const passed = results.filter(Boolean).length;
    out(`\n${passed}/${results.length} passed`);
    process.exitCode = passed === results.length ? 0 : 1;
    await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
        server.closeAllConnections();
    });
})().catch((e) => { out('HARNESS CRASH ' + e.stack); process.exitCode = 1; });
