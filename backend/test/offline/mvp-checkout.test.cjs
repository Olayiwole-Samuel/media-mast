// MVP verification harness — offline: individual advertisers, multi-station checkout (stub payment), refunds.
// Real app/routes/middleware/controllers/validators/models. In-memory store with atomic single-document updates,
// fake transactions (an abort removes this session's inserts and restores its campaign updates), station locks
// through the real stationBookingLock code, failure injection. No database, no real payment.
'use strict';
process.env.JWT_SECRET = 'mvp-harness-dummy-secret';
process.env.JWT_EXPIRE = '5m';
process.env.SUBSCRIPTION_REQUIRED = 'false'; // subscription gating is covered by subscriptions.test.cjs
process.env.ALLOW_DIRECT_BOOKING = 'true'; // these checks exercise the direct (unpaid) booking route
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
    const pay = (who, campaignKey, items) => call(who, 'POST', '/api/v1/payments/checkout', { campaignId: String(CP[campaignKey]._id), items });

    // ── I: individuals advertise on their own ──
    let r = await call(U.indiv, 'POST', '/api/v1/campaigns', { name: 'Ivy launch', budget: 250000 });
    const newCamp = db.campaigns.find((c) => c.name === 'Ivy launch');
    check('I1  Individual creates a campaign → 201, owned by them, no company', r.code === 201 && !!newCamp && eq(newCamp.userId, U.indiv) && newCamp.companyId == null, `${r.code} ${r.body.message}`);
    r = await call(U.indiv, 'GET', '/api/v1/campaigns');
    const names = (r.body.data || []).map((c) => c.name).sort();
    check('I2  Individual lists ONLY their own campaigns (not another individual\'s, not a company\'s)', r.code === 200 && JSON.stringify(names) === JSON.stringify(['Ivy launch', 'ivy', 'ivyClosed', 'ivyRanged']), JSON.stringify(names));
    r = await call(U.indiv, 'GET', `/api/v1/campaigns/${CP.ian._id}`);
    const r2 = await call(U.indiv, 'GET', `/api/v1/campaigns/${CP.companyA._id}`);
    check('I3  Another individual\'s / a company\'s campaign → 404', r.code === 404 && r2.code === 404, `${r.code}/${r2.code}`);
    r = await call(U.indiv, 'PUT', `/api/v1/campaigns/${CP.ian._id}`, { name: 'hijack' });
    check('I4  Cannot edit another individual\'s campaign → 404, unchanged', r.code === 404 && CP.ian.name === 'ian' && db.campaigns.find((c) => eq(c._id, CP.ian._id)).name === 'ian', `${r.code}`);
    r = await call(U.indiv, 'PUT', `/api/v1/campaigns/${CP.ivy._id}`, { name: 'ivy renamed' });
    check('I5  Edits own campaign → 200', r.code === 200 && db.campaigns.find((c) => eq(c._id, CP.ivy._id)).name === 'ivy renamed', `${r.code} ${logs.filter((l) => /Update campaign error/.test(l)).slice(-1)[0] || ''}`);
    r = await call(U.indiv, 'POST', '/api/v1/creatives', { campaignId: String(CP.ivy._id), name: 'Jingle', type: 'AUDIO', url: 'https://cdn.example.com/j.mp3' });
    const r3 = await call(U.indiv, 'POST', '/api/v1/creatives', { campaignId: String(CP.ian._id), name: 'X', type: 'AUDIO', url: 'https://cdn.example.com/x.mp3' });
    check('I6  Uploads a creative to own campaign → 201; to another\'s → 404', r.code === 201 && r3.code === 404 && db.creatives.length === 1, `${r.code}/${r3.code} ${r.body.message || ''}`);
    r = await call(U.indiv, 'GET', `/api/v1/creatives/campaign/${CP.ivy._id}`);
    check('I7  Lists own campaign\'s creatives', r.code === 200 && r.body.data?.length === 1, `${r.code}`);
    delete process.env.ALLOW_DIRECT_BOOKING;
    r = await call(U.indiv, 'POST', '/api/v1/bookings', { campaignId: String(CP.ivy._id), stationId: String(S.fm1._id), slot: 'MORNING', date: D11, time: '06:00', duration: 15 });
    const gated = r;
    const r0 = await call(null, 'POST', '/api/v1/bookings', {});
    process.env.ALLOW_DIRECT_BOOKING = 'false';
    const rF = await call(U.indiv, 'POST', '/api/v1/bookings', { campaignId: String(CP.ivy._id), stationId: String(S.fm1._id), slot: 'MORNING', date: D11, time: '06:00', duration: 15 });
    check('I8a Direct (unpaid) booking is off by default → 410 pointing to checkout, nothing stored; "false" also off; unauthenticated still 401', gated.code === 410 && /checkout/i.test(gated.body.message || '') && rF.code === 410 && r0.code === 401 && db.bookings.length === 0, `${gated.code}/${rF.code}/${r0.code} ${db.bookings.length}`);
    process.env.ALLOW_DIRECT_BOOKING = 'true';
    r = await call(U.indiv, 'POST', '/api/v1/bookings', { campaignId: String(CP.ivy._id), stationId: String(S.fm1._id), slot: 'MORNING', date: D11, time: '06:00', duration: 15 });
    const direct = db.bookings[0];
    check('I8  Direct booking by an individual → 201, no company, UNPAID', r.code === 201 && !!direct && direct.companyId == null && eq(direct.userId, U.indiv) && direct.paymentStatus === 'UNPAID', `${r.code} ${r.body.message}`);
    r = await call(U.indiv2, 'GET', '/api/v1/bookings');
    const r4 = await call(U.indiv2, 'GET', `/api/v1/bookings/${direct?._id}`);
    check('I9  Another individual sees none of them (list empty, detail 404)', r.code === 200 && r.body.data?.length === 0 && r4.code === 404, `${r.code} ${r.body.data?.length}/${r4.code}`);
    r = await call(U.indiv, 'GET', '/api/v1/bookings/station');
    const r5 = await call(U.indiv, 'PATCH', `/api/v1/bookings/${direct?._id}/accept`, {});
    check('I10 Station routes stay company-only: individual → 403', r.code === 403 && r5.code === 403 && db.bookings[0].status === 'PENDING', `${r.code}/${r5.code}`);
    r = await call(U.admin, 'GET', '/api/v1/campaigns');
    const r6 = await call(U.station, 'GET', '/api/v1/campaigns');
    check('I11 Admin / STATION accounts are not advertisers → 403', r.code === 403 && r6.code === 403 && /Advertiser account required/.test(r.body.message || ''), `${r.code}/${r6.code}`);
    r = await call(U.staffA, 'POST', '/api/v1/campaigns', { name: 'nope', budget: 1 });
    check('I12 Company permissions unchanged: employee without CAMPAIGN_CREATE → 403', r.code === 403, `${r.code}`);

    // ── C: checkout ──
    seed();
    r = await pay(U.indiv, 'ivy', [item('fm1'), item('fm2', { time: '09:00', slot: 'MORNING' })]);
    const p = db.payments[0];
    check('C1  Two stations, one checkout → 201, message, test mode', r.code === 201 && r.body.success === true && /booking requests have been sent/.test(r.body.message) && r.body.data?.testMode === true, `${r.code} ${r.body.message}`);
    check('C2  One STUB payment: SUCCESSFUL, amount = sum of station prices (80,000), fee 0, refundAmount 0', !!p && p.status === 'SUCCESSFUL' && p.provider === 'STUB' && p.amount === 80000 && p.subtotal === 80000 && p.platformFee === 0 && p.refundAmount === 0 && p.companyId == null && eq(p.userId, U.indiv));
    check('C3  Two PENDING bookings, PAID, linked to the payment, server prices', db.bookings.length === 2 && db.bookings.every((b) => b.status === 'PENDING' && b.paymentStatus === 'PAID' && eq(b.paymentId, p?._id) && b.companyId == null) && db.bookings.map((b) => b.price).sort().join() === '30000,50000');
    check('C4  Campaign moved DRAFT → BOOKING_REQUESTS_SENT', db.campaigns.find((c) => eq(c._id, CP.ivy._id)).status === 'BOOKING_REQUESTS_SENT' && r.body.data?.campaign?.status === 'BOOKING_REQUESTS_SENT');
    const s1 = sessions[0];
    check('C5  One transaction (snapshot + majority), session ended, all station locks released', sessions.length === 1 && s1.options?.readConcern?.level === 'snapshot' && s1.options?.writeConcern?.w === 'majority' && s1.ended && db.stations.every((s) => s.bookingLockUntil == null));
    check('C6  Conflict re-check ran inside the transaction (session reads)', sessionUse.withSession >= 2, `${sessionUse.withSession}`);
    check('C7  Provider charged once with the server total; response has no providerData', providerCalls.charge.length === 1 && providerCalls.charge[0].amount === 80000 && providerCalls.charge[0].currency === 'NGN' && !/providerData/.test(r.text));
    check('C8  Audit: CREATE_PAYMENT + 2 CREATE_BOOKING', db.audit.filter((a) => a.action === 'CREATE_PAYMENT').length === 1 && db.audit.filter((a) => a.action === 'CREATE_BOOKING').length === 2);

    const INVALID = () => [
        ['client-sent price', [item('fm1', { price: 1 })], 'items.0.price'],
        ['client-sent currency', [item('fm1', { currency: 'USD' })], 'items.0.currency'],
        ['empty cart', [], 'items'],
        ['21 items', Array.from({ length: 21 }, (_, i) => item('fm1', { time: `${String(i).padStart(2, '0')}:00`, duration: 10 })), 'items'],
        ['bad station id', [item('fm1', { stationId: 'abc' })], 'items.0.stationId'],
        ['bad time', [item('fm1', { time: '25:00' })], 'items.0.time'],
        ['duration 0', [item('fm1', { duration: 0 })], 'items.0.duration'],
        ['duration text', [item('fm1', { duration: 'long' })], 'items.0.duration'],
        ['past date', [item('fm1', { date: day(-1) })], 'items.0'],
        ['beyond midnight', [item('fm1', { time: '23:50', duration: 30 })], 'items.0'],
        ['station not approved', [item('pending')], 'items.0'],
        ['station unpriced', [item('unpriced')], 'items.0'],
        ['mixed currencies', [item('fm1'), item('usd', { time: '10:00' })], 'items'],
        ['items overlap each other', [item('fm1'), item('fm1', { time: '08:15' })], 'items.1'],
    ];
    for (let i = 0; i < INVALID().length; i++) {
        seed();
        const [label, items, field] = INVALID()[i];
        r = await pay(U.indiv, 'ivy', items);
        check(`C9  ${label} → 400 on ${field}, nothing written, not charged`, isContract(r, field) && counts() === '0/0' && providerCalls.charge.length === 0, `${r.code} ${r.body.message || ''}`);
    }
    seed();
    r = await pay(U.indiv, 'ivy', [item('fm1', { date: day(-2) })]);
    check('C10 Item errors are numbered ("Item 1: Booking date cannot be in the past")', r.body.message === 'Item 1: Booking date cannot be in the past', r.body.message);
    seed();
    r = await call(U.indiv, 'POST', '/api/v1/payments/checkout', { campaignId: String(CP.ivy._id), items: [item('fm1')], amount: 1 });
    check('C11 Unknown top-level key (amount) → 400, nothing written', isContract(r, 'amount') && counts() === '0/0', `${r.code}`);
    seed();
    r = await pay(U.indiv, 'ivy', [{ ...item('fm1'), stationId: String(OID()) }]);
    check('C12 Unknown station → 404, nothing written', r.code === 404 && /Item 1: Station not found/.test(r.body.message || '') && counts() === '0/0', `${r.code} ${r.body.message}`);
    seed();
    r = await pay(U.indiv, 'ian', [item('fm1')]);
    check('C13 Another individual\'s campaign → 404, nothing written', r.code === 404 && counts() === '0/0', `${r.code}`);
    seed();
    r = await pay(U.indiv, 'ivyClosed', [item('fm1')]);
    check('C14 Closed campaign → 400, nothing written', r.code === 400 && /can no longer take new bookings/.test(r.body.message || '') && counts() === '0/0', `${r.code} ${r.body.message}`);
    seed();
    r = await pay(U.indiv, 'ivyRanged', [item('fm1', { date: D10 })]);
    check('C15 Date outside the campaign dates → 400', r.code === 400 && /within the campaign dates/.test(r.body.message || ''), `${r.code} ${r.body.message}`);
    seed();
    db.bookings.push({ _id: OID(), bookingReference: 'BK-EXISTING', campaignId: CP.ian._id, stationId: S.fm2._id, userId: U.indiv2, companyId: null, slot: 'x', date: new Date(`${D10}T00:00:00.000Z`), time: '09:10', duration: 30, price: 1, currency: 'NGN', status: 'ACCEPTED', paymentStatus: 'PAID' });
    r = await pay(U.indiv, 'ivy', [item('fm1'), item('fm2', { time: '09:00' })]);
    check('C16 Conflict with an existing booking → 409 naming item 2, nothing written, not charged, campaign unchanged', r.code === 409 && /Item 2/.test(r.body.message || '') && counts() === '0/1' && providerCalls.charge.length === 0 && db.campaigns.find((c) => eq(c._id, CP.ivy._id)).status === 'DRAFT' && db.stations.every((s) => s.bookingLockUntil == null), `${r.code} ${r.body.message}`);
    seed();
    fail['bookings.create'] = Object.assign(new Error('simulated write failure'), { name: 'MongoServerError' });
    r = await pay(U.indiv, 'ivy', [item('fm1'), item('fm2', { time: '09:00' })]);
    check('C17 Write fails mid-transaction → 500 "not charged", nothing left, compensation refund, locks released', r.code === 500 && /not been charged/.test(r.body.message || '') && counts() === '0/0' && providerCalls.refund.length === 1 && providerCalls.refund[0].amount === 80000 && db.stations.every((s) => s.bookingLockUntil == null) && db.campaigns.find((c) => eq(c._id, CP.ivy._id)).status === 'DRAFT', `${r.code} ${counts()} refunds=${providerCalls.refund.length}`);
    seed();
    before['bookings.create'] = () => { db.bookings.push({ _id: OID(), bookingReference: 'BK-RACE', campaignId: CP.ian._id, stationId: S.fm1._id, userId: U.indiv2, companyId: null, slot: 'x', date: new Date(`${D10}T00:00:00.000Z`), time: '08:10', duration: 10, price: 1, currency: 'NGN', status: 'PENDING', paymentStatus: 'UNPAID' }); };
    r = await pay(U.indiv, 'ivy', [item('fm1')]);
    check('C18 Concurrent booking lands mid-checkout → in-transaction re-check → 409, rolled back, compensated', r.code === 409 && db.payments.length === 0 && db.bookings.length === 1 && db.bookings[0].bookingReference === 'BK-RACE' && providerCalls.refund.length === 1, `${r.code} ${counts()}`);
    seed();
    db.stations.find((s) => eq(s._id, S.fm1._id)).bookingLockUntil = new Date(Date.now() + 60000);
    r = await pay(U.indiv, 'ivy', [item('fm2'), item('fm1', { time: '10:00' })]);
    check('C19 A station locked by another checkout → 409 "try again", nothing written, our other lock released', r.code === 409 && /another booking right now/.test(r.body.message || '') && counts() === '0/0' && db.stations.find((s) => eq(s._id, S.fm2._id)).bookingLockUntil == null, `${r.code}`);
    seed();
    chargeFails = true;
    r = await pay(U.indiv, 'ivy', [item('fm1')]);
    check('C20 Payment not completed → 402, nothing written', r.code === 402 && counts() === '0/0', `${r.code}`);
    seed();
    payments.setPaymentProviderForTests(null);
    process.env.PAYMENT_PROVIDER = 'paypal-unknown';
    r = await pay(U.indiv, 'ivy', [item('fm1')]);
    delete process.env.PAYMENT_PROVIDER;
    payments.setPaymentProviderForTests(spyProvider);
    check('C21 Unknown PAYMENT_PROVIDER → 503 (fails closed), nothing written', r.code === 503 && counts() === '0/0', `${r.code}`);
    seed();
    process.env.PLATFORM_FEE_PERCENT = '10';
    r = await pay(U.indiv, 'ivy', [item('fm1'), item('fm2', { time: '09:00' })]);
    check('C22 Platform fee 10% → amount 88,000 (subtotal 80,000 + fee 8,000)', r.code === 201 && db.payments[0]?.amount === 88000 && db.payments[0]?.subtotal === 80000 && db.payments[0]?.platformFee === 8000, `${r.code} ${db.payments[0]?.amount}`);
    seed();
    r = await pay(U.ownerA, 'companyA', [item('fm1')]);
    check('C23 Company checkout → 201, payment + booking carry the company; SUBMITTED → BOOKING_REQUESTS_SENT', r.code === 201 && eq(db.payments[0]?.companyId, A) && eq(db.bookings[0]?.companyId, A) && db.campaigns.find((c) => eq(c._id, CP.companyA._id)).status === 'BOOKING_REQUESTS_SENT', `${r.code} ${r.body.message}`);
    seed();
    r = await pay(U.staffA, 'companyA', [item('fm1')]);
    check('C24 Employee without BOOKING_CREATE → 403, nothing written', r.code === 403 && counts() === '0/0', `${r.code}`);
    r = await pay(null, 'ivy', [item('fm1')]);
    check('C25 No token → 401', r.code === 401, `${r.code}`);

    // ── P: payments view + station inbox ──
    seed();
    await pay(U.indiv, 'ivy', [item('fm1'), item('fm2', { time: '09:00' })]);
    await pay(U.indiv2, 'ian', [item('fm1', { time: '12:00' })]);
    const ivyPay = db.payments.find((x) => eq(x.userId, U.indiv));
    const ianPay = db.payments.find((x) => eq(x.userId, U.indiv2));
    r = await call(U.indiv, 'GET', '/api/v1/payments');
    check('P1  Individual lists only their own payments', r.code === 200 && r.body.data?.length === 1 && eq(r.body.data[0]._id, ivyPay._id) && !/providerData/.test(r.text), `${r.code} ${r.body.data?.length}`);
    r = await call(U.indiv, 'GET', `/api/v1/payments/${ivyPay._id}`);
    check('P2  Own payment detail includes its 2 bookings with station names', r.code === 200 && r.body.data?.bookings?.length === 2 && r.body.data.bookings.every((b) => b.stationId?.name), `${r.code}`);
    r = await call(U.indiv, 'GET', `/api/v1/payments/${ianPay._id}`);
    const r7 = await call(U.indiv, 'GET', '/api/v1/payments/not-an-id');
    check('P3  Another advertiser\'s payment → 404; malformed id → 400', r.code === 404 && r7.code === 400, `${r.code}/${r7.code}`);
    r = await call(U.ownerM, 'GET', '/api/v1/bookings/station');
    check('P4  Station company sees all 3 paid requests, with payment provider/status and advertiser name', r.code === 200 && r.body.data?.length === 3 && r.body.data.every((b) => b.paymentStatus === 'PAID' && b.paymentId?.provider === 'STUB' && b.userId?.name), `${r.code} ${r.body.data?.length}`);

    // ── R: refunds ──
    const [bk1, bk2] = db.bookings.filter((b) => eq(b.paymentId, ivyPay._id));
    r = await call(U.ownerM, 'PATCH', `/api/v1/bookings/${bk1._id}/reject`, { note: 'Fully booked' });
    let payNow = db.payments.find((x) => eq(x._id, ivyPay._id));
    check('R1  Station rejects a paid booking → REJECTED + REFUNDED; payment partly refunded (still SUCCESSFUL)', r.code === 200 && db.bookings.find((b) => eq(b._id, bk1._id)).paymentStatus === 'REFUNDED' && db.bookings.find((b) => eq(b._id, bk1._id)).status === 'REJECTED' && payNow.refundAmount === bk1.price && payNow.status === 'SUCCESSFUL', `${r.code} refund=${payNow.refundAmount}`);
    check('R2  Refund went through the provider and was audited (REFUND_PAYMENT)', providerCalls.refund.some((x) => x.amount === bk1.price) && db.audit.some((a) => a.action === 'REFUND_PAYMENT'));
    r = await call(U.indiv, 'POST', `/api/v1/bookings/${bk2._id}/cancel`);
    payNow = db.payments.find((x) => eq(x._id, ivyPay._id));
    check('R3  Customer cancels the other → CANCELLED + REFUNDED; payment fully refunded → REFUNDED', r.code === 200 && db.bookings.find((b) => eq(b._id, bk2._id)).paymentStatus === 'REFUNDED' && payNow.refundAmount === 80000 && payNow.status === 'REFUNDED', `${r.code} refund=${payNow.refundAmount} ${payNow.status}`);
    r = await call(U.indiv, 'POST', `/api/v1/bookings/${bk2._id}/cancel`);
    payNow = db.payments.find((x) => eq(x._id, ivyPay._id));
    check('R4  Cancelling again → refused, refund not doubled', r.code === 403 && payNow.refundAmount === 80000, `${r.code} ${payNow.refundAmount}`);
    r = await call(U.indiv2, 'POST', `/api/v1/bookings/${bk1._id}/cancel`);
    check('R5  Another individual cannot cancel it → 404', r.code === 404, `${r.code}`);
    seed();
    await call(U.indiv, 'POST', '/api/v1/bookings', { campaignId: String(CP.ivy._id), stationId: String(S.fm1._id), slot: 'MORNING', date: D11, time: '06:00', duration: 15 });
    const before0 = providerCalls.refund.length;
    r = await call(U.indiv, 'POST', `/api/v1/bookings/${db.bookings[0]._id}/cancel`);
    check('R6  Cancelling an UNPAID booking → CANCELLED, no refund', r.code === 200 && db.bookings[0].paymentStatus === 'UNPAID' && providerCalls.refund.length === before0, `${r.code}`);
    seed();
    process.env.PLATFORM_FEE_PERCENT = '10';
    await pay(U.indiv, 'ivy', [item('fm1'), item('fm2', { time: '09:00' })]);
    const fb = db.bookings.find((b) => b.price === 50000);
    r = await call(U.ownerM, 'PATCH', `/api/v1/bookings/${fb._id}/reject`, {});
    check('R7  With a fee, the refund includes that booking\'s share of the fee (50,000 + 5,000)', r.code === 200 && db.payments[0].refundAmount === 55000, `${r.code} ${db.payments[0].refundAmount}`);
    seed();
    await pay(U.indiv, 'ivy', [item('fm1')]);
    const ab = db.bookings[0];
    await call(U.ownerM, 'PATCH', `/api/v1/bookings/${ab._id}/accept`, {});
    r = await call(U.ownerM, 'PATCH', `/api/v1/bookings/${ab._id}/schedule`, {});
    check('R8  Accept + schedule keep the booking PAID (no refund)', r.code === 200 && db.bookings[0].status === 'SCHEDULED' && db.bookings[0].paymentStatus === 'PAID' && db.payments[0].refundAmount === 0, `${r.code}`);

    // ── AP: admin payments view ──
    seed();
    await pay(U.indiv, 'ivy', [item('fm1'), item('fm2')]);                  // 80,000
    await pay(U.ownerA, 'companyA', [item('fm1', { time: '12:00' })]);      // 50,000
    db.payments[0].providerData = { secret: 'provider-raw-data' };
    const fmb = db.bookings.find((b) => eq(b.stationId, S.fm2._id));
    await call(U.ownerM, 'PATCH', `/api/v1/bookings/${fmb._id}/reject`, {}); // refunds 30,000 of payment 0
    r = await call(U.admin, 'GET', '/api/v1/admin/payments');
    const tot = r.body.totals?.NGN;
    const apIvy = (r.body.data || []).find((p) => eq(p._id, db.payments[0]._id)), apCo = (r.body.data || []).find((p) => eq(p._id, db.payments[1]._id));
    // (Order isn't checked: this harness's sort() is a no-op; the controller sorts by createdAt desc.)
    check('AP1 Admin lists every payment with payer, campaign and NGN totals: collected 130,000, refunded 30,000, net 100,000', r.code === 200 && r.body.data?.length === 2 && apIvy?.userId?.email === 'ivy@example.com' && apIvy?.campaignId?.name === 'ivy' && apIvy?.companyId == null && apCo?.companyId?.name === 'Advertiser Co'
        && tot?.collected === 130000 && tot?.refunded === 30000 && tot?.net === 100000 && tot?.count === 2, `${r.code} ${JSON.stringify(r.body.totals)}`);
    check('AP2 No providerData in the admin list', !/providerData|provider-raw-data/.test(r.text));
    r = await call(U.admin, 'GET', '/api/v1/admin/payments?status=refunded');
    const apBad = await call(U.admin, 'GET', '/api/v1/admin/payments?status=BOGUS');
    check('AP3 status filter (case-insensitive) → only matching; unknown status → 400', r.code === 200 && r.body.data?.length === 0 && apBad.code === 400, `${r.code} ${r.body.data?.length} / ${apBad.code}`);
    r = await call(U.admin, 'GET', `/api/v1/admin/payments/${db.payments[0]._id}`);
    const det = r.body.data;
    check('AP4 Admin payment detail lists its bookings with station, status and refund; no providerData', r.code === 200 && det?.bookings?.length === 2 && det.bookings.some((b) => b.status === 'REJECTED' && b.refundAmount === 30000 && b.stationId?.name === 'Station fm2') && !/providerData|provider-raw-data/.test(r.text), `${r.code} ${det?.bookings?.length}`);
    r = await call(U.admin, 'GET', '/api/v1/admin/payments/not-an-id');
    const apMissing = await call(U.admin, 'GET', `/api/v1/admin/payments/${OID()}`);
    check('AP5 Invalid id → 400; unknown id → 404', r.code === 400 && apMissing.code === 404, `${r.code}/${apMissing.code}`);
    const nonAdmin = await Promise.all([U.indiv, U.ownerA, U.ownerM, U.station].map((w) => call(w, 'GET', '/api/v1/admin/payments')));
    const anon = await call(null, 'GET', '/api/v1/admin/payments');
    check('AP6 Not an admin → 403 (individual, company owner, media company, station manager); signed out → 401', nonAdmin.every((x) => x.code === 403) && anon.code === 401, nonAdmin.map((x) => x.code).join(',') + '/' + anon.code);

    // ── L: logging ──
    check('L1  No password hash or JWT in any log line', !logs.some((l) => /\$2[aby]\$|eyJ[A-Za-z0-9_-]+\./.test(l)));

    const passed = results.filter(Boolean).length;
    out(`\n${passed}/${results.length} passed`);
    process.exitCode = passed === results.length ? 0 : 1;
    await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
        server.closeAllConnections();
    });
})().catch((e) => { out('HARNESS CRASH ' + e.stack); process.exitCode = 1; });
