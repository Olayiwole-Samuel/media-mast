// Company owner record check/repair harness — offline: diagnosis of every case, safe repairs only (create or
// reactivate), transaction + rollback, audit entry, idempotence, access control. Same in-memory harness as
// mvp-checkout. Real app/routes/middleware/controllers/models. No database.
'use strict';
process.env.JWT_SECRET = 'owner-repair-harness-dummy-secret';
process.env.JWT_EXPIRE = '5m';
delete process.env.ALLOW_DIRECT_BOOKING;
delete process.env.RESEND_API_KEY;
delete process.env.VERCEL;
delete process.env.PAYMENT_PROVIDER;
delete process.env.PLATFORM_FEE_PERCENT;

const path = require('path');
const BACKEND = path.resolve(__dirname, '..', '..'); // backend/ (this file: backend/test/offline/)
const mongoose = require(path.join(BACKEND, 'node_modules', 'mongoose'));
const jwt = require(path.join(BACKEND, 'node_modules', 'jsonwebtoken'));
mongoose.set('bufferCommands', false); // any un-faked DB call fails instead of reaching a real DB

const src = (p) => require(path.join(BACKEND, 'src', p));
const User = src('models/User'), Employee = src('models/Employee'), Company = src('models/Company'), AuditLog = src('models/AuditLog');
const Campaign = src('models/Campaign'), Station = src('models/Station'), Booking = src('models/Booking');
const Payment = src('models/Payment'), Creative = src('models/Creative');
const payments = src('utils/payments');

const OID = () => new mongoose.Types.ObjectId();
let db;
const clone = (o) => mongoose.mongo.BSON.deserialize(mongoose.mongo.BSON.serialize(o), { promoteValues: true });
const eq = (a, b) => (a == null && b == null) || (a != null && b != null && String(a) === String(b));
const cmp = (x, y) => (x instanceof Date ? x.getTime() : x) - (y instanceof Date ? y.getTime() : y);
const matches = (d, f = {}) => Object.entries(f).every(([k, v]) => {
    if (k === '$or') return v.some((g) => matches(d, g));
    const x = d[k];
    if (v && typeof v === 'object' && !(v instanceof mongoose.Types.ObjectId) && !(v instanceof Date) && !Array.isArray(v)) {
        if ('$in' in v) return v.$in.some((y) => eq(x, y));
        if ('$nin' in v) return !v.$nin.some((y) => eq(x, y));
        if ('$ne' in v) return !eq(x, v.$ne);
        if ('$lte' in v) return x != null && cmp(x, v.$lte) <= 0;
        return true;
    }
    if (v instanceof Date) return x instanceof Date && x.getTime() === v.getTime();
    return eq(x, v);
});
const project = (o, sel) => {
    if (!o || !sel || typeof sel !== 'string') return o;
    const parts = sel.split(/\s+/).filter(Boolean);
    if (parts.every((p) => p.startsWith('-') || p.startsWith('+'))) return o;
    const out = { _id: o._id }; parts.forEach((k) => { if (k in o) out[k] = o[k]; }); return out;
};
const REFS = { campaignId: 'campaigns', stationId: 'stations', userId: 'users', companyId: 'companies', paymentId: 'payments' };
const sessionUse = { reads: 0, withSession: 0 };
const q = (M, getter) => {
    let sel = null, withSession = false; const pops = [];
    const x = {
        select: (s) => { sel = s; return x; }, lean: () => x, sort: () => x,
        session: (s) => { withSession = !!s; return x; },
        populate: (p, s) => { pops.push([p, s]); return x; },
        then: (r, j) => Promise.resolve().then(() => {
            sessionUse.reads++; if (withSession) sessionUse.withSession++;
            const conv = (o) => {
                if (!o) return null;
                const plain = clone(project(o, sel));
                if (!pops.length) return M.hydrate(plain);
                for (const [p, s] of pops) {
                    const ref = db[REFS[p]] && db[REFS[p]].find((d) => eq(d._id, o[p]));
                    plain[p] = ref ? project(clone(ref), s) : null;
                }
                Object.defineProperty(plain, "toObject", { value: () => ({ ...plain }), enumerable: false });
                return plain;
            };
            const v = getter();
            return Array.isArray(v) ? v.map(conv) : conv(v);
        }).then(r, j),
    };
    return x;
};
const fail = {};
const before = {};
const applyUpdate = (o, u) => {
    Object.assign(o, u.$set || {});
    for (const [k, n] of Object.entries(u.$inc || {})) {
        if (o[k] != null && typeof o[k] !== 'number') throw new Error(`Cannot apply $inc to a value of non-numeric type (${k})`);
        if (o[k] === null) throw Object.assign(new Error(`Cannot apply $inc to a value of non-numeric type null (${k})`), { name: 'MongoServerError' });
        o[k] = (o[k] || 0) + n;
    }
};
const C = { users: User, employees: Employee, companies: Company, campaigns: Campaign, stations: Station, bookings: Booking, payments: Payment, creatives: Creative };
for (const [c, M] of Object.entries(C)) {
    M.find = (f) => q(M, () => db[c].filter((d) => matches(d, f)));
    M.findOne = (f) => q(M, () => db[c].find((d) => matches(d, f)) || null);
    M.findById = (id) => q(M, () => db[c].find((d) => eq(d._id, id)) || null);
    M.findOneAndUpdate = (f, u, opts = {}) => q(M, () => {
        const o = db[c].find((d) => matches(d, f)); if (!o) return null;
        const prior = { ...o }; applyUpdate(o, u);
        return opts.returnDocument === 'after' || opts.new ? o : prior;
    });
    M.updateOne = async (f, u, opts = {}) => {
        const o = db[c].find((d) => matches(d, f)); if (!o) return { matchedCount: 0, modifiedCount: 0 };
        if (opts.session && opts.session.updates) opts.session.updates.push([c, o._id, { ...o }]);
        applyUpdate(o, u); return { matchedCount: 1, modifiedCount: 1 };
    };
    M.deleteOne = async (f) => { const i = db[c].findIndex((d) => matches(d, f)); if (i >= 0) db[c].splice(i, 1); return { deletedCount: i >= 0 ? 1 : 0 }; };
    M.create = async (data, opts) => {
        if (Array.isArray(data)) { const outs = []; for (const d of data) outs.push(await M.create(d, opts)); return outs; }
        if (fail[`${c}.create`]) { const e = fail[`${c}.create`]; delete fail[`${c}.create`]; throw e; }
        if (before[`${c}.create`]) { const h = before[`${c}.create`]; delete before[`${c}.create`]; h(); }
        const d = new M(data); await d.validate();
        db[c].push(d.toObject());
        if (opts && opts.session && opts.session.inserted) opts.session.inserted.push([c, d._id]);
        return M.hydrate(clone(d.toObject()));
    };
}
// Document save (e.g. updateCampaign): real validation, replace the stored copy.
for (const [c, M] of Object.entries(C)) {
    M.prototype.save = async function save() { await this.validate(); const plain = this.toObject(); db[c] = db[c].map((x) => (eq(x._id, plain._id) ? plain : x)); return this; };
}
const sessions = [];
mongoose.startSession = async () => {
    const s = {
        ended: false, inserted: [], updates: [], options: null,
        async withTransaction(fn, options) {
            s.inserted = []; s.updates = []; s.options = options;
            try { await fn(); } catch (e) {
                for (const [c, id] of s.inserted) db[c] = db[c].filter((d) => !eq(d._id, id));
                for (const [c, id, prior] of s.updates.reverse()) { const o = db[c].find((d) => eq(d._id, id)); if (o) { for (const k of Object.keys(o)) delete o[k]; Object.assign(o, prior); } }
                throw e;
            }
        },
        async endSession() { s.ended = true; },
    };
    sessions.push(s);
    return s;
};
// Spy on the stub provider (still the real stub underneath).
const providerCalls = { charge: [], refund: [] };
let chargeFails = false;
const realStub = payments.getPaymentProvider();
const spyProvider = {
    name: realStub.name, isTestMode: realStub.isTestMode,
    async charge(args) { providerCalls.charge.push(args); if (chargeFails) return { status: 'FAILED' }; return realStub.charge(args); },
    async refund(args) { providerCalls.refund.push(args); return realStub.refund(args); },
};
payments.setPaymentProviderForTests(spyProvider);

const logs = [];
for (const k of ['log', 'warn', 'error', 'info']) console[k] = (...a) => logs.push(a.map((x) => (x instanceof Error ? `${x.name} ${x.message}` : typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
const out = (s) => process.stdout.write(s + '\n');

// ── Fixture ──
const A = OID(), M = OID();
const U = { indiv: OID(), indiv2: OID(), ownerA: OID(), staffA: OID(), ownerM: OID(), admin: OID(), station: OID() };
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const D10 = day(10), D11 = day(11);
const S = {}; const CP = {};
const seed = () => {
    for (const k of Object.keys(fail)) delete fail[k];
    for (const k of Object.keys(before)) delete before[k];
    providerCalls.charge.length = 0; providerCalls.refund.length = 0; chargeFails = false; sessions.length = 0;
    sessionUse.reads = 0; sessionUse.withSession = 0;
    delete process.env.PLATFORM_FEE_PERCENT;
    const u = (id, accountType, companyId, email) => ({ _id: id, email, name: `n-${email.split('@')[0]}`, accountType, status: 'ACTIVE', companyId, tokenVersion: 0 });
    const st = (key, extra = {}) => { const s = { _id: OID(), name: `Station ${key}`, type: 'RADIO', companyId: M, approvalStatus: 'APPROVED', isActive: true, inventoryStatus: 'AVAILABLE', pricing: { amount: 50000, currency: 'NGN', unit: 'SPOT' }, bookingLockUntil: null, ...extra }; S[key] = s; return s; };
    const cp = (key, extra = {}) => { const c = { _id: OID(), name: key, objective: 'BRAND_AWARENESS', budget: 1, currency: 'NGN', status: 'DRAFT', startDate: null, endDate: null, companyId: null, userId: U.indiv, ...extra }; CP[key] = c; return c; };
    db = {
        users: [u(U.indiv, 'INDIVIDUAL', null, 'ivy@example.com'), u(U.indiv2, 'INDIVIDUAL', null, 'ian@example.com'), u(U.ownerA, 'COMPANY', A, 'owner-a@example.com'),
            u(U.staffA, 'EMPLOYEE', A, 'staff-a@example.com'), u(U.ownerM, 'COMPANY', M, 'owner-m@example.com'), u(U.admin, 'ADMIN', null, 'admin@example.com'), u(U.station, 'STATION', null, 'st@example.com')],
        employees: [{ _id: OID(), userId: U.ownerA, companyId: A, position: 'Company Owner', permissions: ['ALL_ACCESS'], isActive: true },
            { _id: OID(), userId: U.staffA, companyId: A, position: 'Viewer', permissions: ['BOOKING_VIEW', 'CAMPAIGN_VIEW'], isActive: true },
            { _id: OID(), userId: U.ownerM, companyId: M, position: 'Company Owner', permissions: ['ALL_ACCESS'], isActive: true }],
        companies: [{ _id: A, name: 'Advertiser Co', status: 'APPROVED' }, { _id: M, name: 'Media Co', status: 'APPROVED' }],
        stations: [st('fm1'), st('fm2', { pricing: { amount: 30000, currency: 'NGN', unit: 'SPOT' } }), st('usd', { pricing: { amount: 100, currency: 'USD', unit: 'SPOT' } }),
            st('pending', { approvalStatus: 'PENDING' }), st('unpriced', { pricing: { amount: 0, currency: 'NGN', unit: 'SPOT' } })],
        campaigns: [cp('ivy'), cp('ivyClosed', { status: 'CANCELLED' }), cp('ivyRanged', { startDate: new Date(`${day(5)}T00:00:00Z`), endDate: new Date(`${day(8)}T00:00:00Z`) }),
            cp('ian', { userId: U.indiv2 }), cp('companyA', { companyId: A, userId: U.ownerA, status: 'SUBMITTED' })],
        bookings: [], payments: [], creatives: [], audit: [],
    };
};
AuditLog.create = async (data) => { const a = new AuditLog(data); await a.validate(); db.audit.push(a.toObject()); return a; };

const app = src('app');
const tok = (id) => jwt.sign({ id: String(id), tokenVersion: 0 }, process.env.JWT_SECRET, { expiresIn: '5m' });
const results = [];
const check = (label, ok, detail = '') => { results.push(ok); out(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== '' ? '  — ' + detail : ''}`); };
const isContract = (r, field) => r.code === 400 && r.body.success === false && r.body.message === r.body.errors?.[0] && Array.isArray(r.body.fieldErrors) && (!field || r.body.fieldErrors.some((f) => f.field === field));
const item = (station, over = {}) => ({ stationId: String(S[station]._id), slot: 'PRIME_TIME', date: D10, time: '08:00', duration: 30, ...over });
const counts = () => `${db.payments.length}/${db.bookings.length}`;

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
    const check2 = (id) => call(U.admin, 'GET', `/api/v1/admin/companies/${id}/owner-check`);
    const repair = (id) => call(U.admin, 'POST', `/api/v1/admin/companies/${id}/owner-repair`);
    const snapshot = () => JSON.stringify({ e: db.employees, a: db.audit.length });

    // Extra fixture companies, one per case.
    const X = { missing: OID(), inactive: OID(), noOwner: OID(), multi: OID(), conflict: OID(), other: OID() };
    const OU = { missing: OID(), inactive: OID(), multi1: OID(), multi2: OID(), conflict: OID(), other: OID(), otherStaff: OID() };
    const company = (id, name) => ({ _id: id, name, email: `${name.toLowerCase().replace(/\s+/g, '-')}@example.com`, slug: name.toLowerCase().replace(/\s+/g, '-'), status: 'APPROVED' });
    const owner = (id, companyId, email) => ({ _id: id, email, name: `n-${email.split('@')[0]}`, accountType: 'COMPANY', status: 'ACTIVE', companyId, tokenVersion: 0 });
    db.companies.push(company(X.missing, 'Missing Co'), company(X.inactive, 'Inactive Co'), company(X.noOwner, 'Ownerless Co'), company(X.multi, 'Multi Co'), company(X.conflict, 'Conflict Co'), company(X.other, 'Other Co'));
    db.users.push(owner(OU.missing, X.missing, 'missing-owner@example.com'), owner(OU.inactive, X.inactive, 'inactive-owner@example.com'),
        owner(OU.multi1, X.multi, 'multi1@example.com'), owner(OU.multi2, X.multi, 'multi2@example.com'),
        owner(OU.conflict, X.conflict, 'conflict-owner@example.com'), owner(OU.other, X.other, 'other-owner@example.com'),
        { _id: OU.otherStaff, email: 'other-staff@example.com', name: 'staff', accountType: 'EMPLOYEE', status: 'ACTIVE', companyId: X.other, tokenVersion: 0 });
    db.employees.push(
        { _id: OID(), userId: OU.inactive, companyId: X.inactive, position: 'Company Owner', permissions: ['ALL_ACCESS'], isActive: false },
        { _id: OID(), userId: OU.conflict, companyId: A, position: 'Viewer', permissions: ['CAMPAIGN_VIEW'], isActive: true },
        { _id: OID(), userId: OU.otherStaff, companyId: X.other, position: 'Company Owner', permissions: ['ALL_ACCESS'], isActive: true });

    // ── O: check ──
    let r = await check2(A);
    check('O1  Healthy company → OK, not repairable, owner shown (no password/tokens)', r.code === 200 && r.body.data?.status === 'OK' && r.body.data.repairable === false && r.body.data.owner?.email === 'owner-a@example.com' && r.body.data.ownerRecord?.isActive === true && !/password|tokenVersion/.test(r.text), `${r.code} ${r.body.data?.status}`);
    const before = snapshot();
    const checks = await Promise.all(Object.values(X).map((id) => check2(id)));
    const st = checks.map((x) => x.body.data?.status).join(',');
    check('O2  Each broken case is diagnosed correctly', st === 'MISSING_OWNER_RECORD,INACTIVE_OWNER_RECORD,NO_OWNER_ACCOUNT,MULTIPLE_OWNER_ACCOUNTS,OWNER_RECORD_CONFLICT,OTHER_OWNER_RECORD', st);
    check('O3  Only MISSING and INACTIVE are repairable; each has a description', checks.map((x) => x.body.data?.repairable).join() === 'true,true,false,false,false,false' && checks.every((x) => typeof x.body.data?.description === 'string' && x.body.data.description.length > 10));
    check('O4  The check is read only (no record or audit change)', snapshot() === before);

    // ── Owner blocked before the repair ──
    r = await call(OU.missing, 'POST', '/api/v1/company/team/invite', { email: 'hire-1@example.com', name: 'H' });
    check('O5  Before repair: the owner of the broken company is refused owner features (403)', r.code === 403, `${r.code} ${r.body.message}`);

    // ── R: repair ──
    sessions.length = 0;
    r = await repair(X.missing);
    const created = db.employees.find((e) => eq(e.userId, OU.missing));
    check('R1  Missing record → created: active Company Owner with ALL_ACCESS for this company; response says OK now', r.code === 200 && r.body.data?.result === 'CREATED_OWNER_RECORD' && r.body.data.status === 'OK' && !!created && created.isActive === true && created.position === 'Company Owner' && JSON.stringify(created.permissions) === '["ALL_ACCESS"]' && eq(created.companyId, X.missing), `${r.code} ${r.body.message}`);
    check('R2  Repair ran in a transaction (snapshot read, majority write) and the session was ended', sessions.length === 1 && sessions[0].options?.readConcern?.level === 'snapshot' && sessions[0].options?.writeConcern?.w === 'majority' && sessions[0].ended === true);
    const aud = db.audit.filter((a) => a.metadata?.event === 'REPAIR_OWNER_RECORD');
    check('R3  One audit entry (UPDATE_COMPANY / REPAIR_OWNER_RECORD) by the admin', aud.length === 1 && aud[0].action === 'UPDATE_COMPANY' && eq(aud[0].userId, U.admin) && eq(aud[0].companyId, X.missing) && aud[0].metadata.before === 'MISSING_OWNER_RECORD');
    r = await call(OU.missing, 'POST', '/api/v1/company/team/invite', { email: 'hire-2@example.com', name: 'H' });
    check('R4  After repair the owner can use owner features (invite → 201)', r.code === 201, `${r.code} ${r.body.message}`);
    const n = db.employees.length;
    r = await repair(X.missing);
    check('R5  Repeating the repair → "Nothing to repair", no new record or audit entry', r.code === 200 && r.body.data?.result === 'NONE' && /Nothing to repair/.test(r.body.message) && db.employees.length === n && db.audit.filter((a) => a.metadata?.event === 'REPAIR_OWNER_RECORD').length === 1);
    r = await repair(X.inactive);
    const re = db.employees.find((e) => eq(e.userId, OU.inactive));
    check('R6  Inactive record → reactivated (same record, no duplicate)', r.code === 200 && r.body.data?.result === 'REACTIVATED_OWNER_RECORD' && re.isActive === true && db.employees.filter((e) => eq(e.userId, OU.inactive)).length === 1, `${r.code}`);

    const frozen = snapshot();
    const refused = await Promise.all([X.noOwner, X.multi, X.conflict, X.other].map((id) => repair(id)));
    check('R7  No owner / several owners / conflicting record / another owner → 409 with the reason; nothing written', refused.every((x) => x.code === 409 && typeof x.body.message === 'string' && x.body.data?.repairable === false && x.body.data?.companyName) && snapshot() === frozen, refused.map((x) => `${x.code}:${x.body.data?.status}`).join(' '));
    check('R8  The conflicting record is left exactly as it was', (() => { const e = db.employees.find((x) => eq(x.userId, OU.conflict)); return e.position === 'Viewer' && eq(e.companyId, A); })());

    // ── F: failure inside the transaction ──
    const X2 = OID(), OU2 = OID();
    db.companies.push(company(X2, 'Fail Co')); db.users.push(owner(OU2, X2, 'fail-owner@example.com'));
    const pre = snapshot();
    fail['employees.create'] = Object.assign(new Error('write failed'), { name: 'MongoServerError' });
    r = await repair(X2);
    check('F1  A write failure → 500, rolled back: no record, no audit entry', r.code === 500 && snapshot() === pre && !db.employees.some((e) => eq(e.userId, OU2)), `${r.code}`);
    r = await repair(X2);
    check('F2  Retrying after the failure succeeds', r.code === 200 && r.body.data?.result === 'CREATED_OWNER_RECORD');

    // ── V: input and access ──
    r = await check2('not-an-id');
    const r2 = await repair(OID());
    check('V1  Invalid id → 400; unknown company → 404', r.code === 400 && r2.code === 404, `${r.code}/${r2.code}`);
    const denied = await Promise.all([U.indiv, U.ownerA, U.station].map((w) => call(w, 'POST', `/api/v1/admin/companies/${X.noOwner}/owner-repair`)));
    const anon = await call(null, 'GET', `/api/v1/admin/companies/${A}/owner-check`);
    check('V2  Not an admin → 403 (individual, company owner, station manager); signed out → 401', denied.every((x) => x.code === 403) && anon.code === 401, denied.map((x) => x.code).join(',') + '/' + anon.code);

    const passed = results.filter(Boolean).length;
    out(`\n${passed}/${results.length} passed`);
    process.exitCode = passed === results.length ? 0 : 1;
    // Graceful shutdown: wait for the server and its keep-alive sockets to close, then let Node exit on its own.
    await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
        server.closeAllConnections();
    });
})().catch((e) => { out('HARNESS CRASH ' + e.stack); process.exitCode = 1; });
