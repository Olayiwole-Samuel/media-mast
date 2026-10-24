// New features harness — offline: subscriptions (plans, gate, limits, cancel, admin), station rate cards
// (time belts, placements, press without clashes), multi-station discount (and refunds after a discount),
// client documents (quota, types, scoping; storage layer stubbed), in-app notifications, slot reminders,
// new-station alerts, reminder job auth, spend insights. Same in-memory harness as mvp-checkout. No database.
'use strict';
process.env.JWT_SECRET = 'features-harness-dummy-secret';
process.env.JWT_EXPIRE = '5m';
delete process.env.SUBSCRIPTION_REQUIRED; // on by default: this suite tests the gate
delete process.env.ALLOW_DIRECT_BOOKING;
delete process.env.MULTI_STATION_DISCOUNTS;
delete process.env.CRON_SECRET;
delete process.env.RESEND_API_KEY;
delete process.env.TERMII_API_KEY;
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
const Plan = src('models/Plan'), Subscription = src('models/Subscription'), Notification = src('models/Notification');
const documentStorage = src('utils/documentStorage');
const { Readable } = require('stream');
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
        if ('$gte' in v && !(x != null && cmp(x, v.$gte) >= 0)) return false;
        if ('$lte' in v) return x != null && cmp(x, v.$lte) <= 0;
        if ('$gte' in v) return true;
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
        select: (s) => { sel = s; return x; }, lean: () => x, sort: () => x, limit: () => x,
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
    for (const [k, v] of Object.entries(u.$addToSet || {})) { o[k] = o[k] || []; if (!o[k].some((z) => eq(z, v))) o[k].push(v); }
    for (const [k, n] of Object.entries(u.$inc || {})) {
        if (o[k] != null && typeof o[k] !== 'number') throw new Error(`Cannot apply $inc to a value of non-numeric type (${k})`);
        if (o[k] === null) throw Object.assign(new Error(`Cannot apply $inc to a value of non-numeric type null (${k})`), { name: 'MongoServerError' });
        o[k] = (o[k] || 0) + n;
    }
};
const C = { users: User, employees: Employee, companies: Company, campaigns: Campaign, stations: Station, bookings: Booking, payments: Payment, creatives: Creative, plans: Plan, subscriptions: Subscription, notifications: Notification };
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
    M.updateMany = async (f, u) => { const os = db[c].filter((d) => matches(d, f)); os.forEach((o) => applyUpdate(o, u)); return { matchedCount: os.length, modifiedCount: os.length }; };
    M.countDocuments = async (f) => db[c].filter((d) => matches(d, f)).length;
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

const docStore = [];
const docUsed = { bytes: null };
const ownsDoc = (owner, d) => (owner.companyId ? eq(d.companyId, owner.companyId) : eq(d.userId, owner.userId) && d.companyId == null);
documentStorage.storageUsedBytes = async (owner) => docUsed.bytes ?? docStore.filter((d) => ownsDoc(owner, d)).reduce((t, d) => t + d.buffer.length, 0);
documentStorage.listDocuments = async (owner) => docStore.filter((d) => ownsDoc(owner, d)).map((d) => ({ _id: d._id, name: d.name, contentType: d.contentType, size: d.buffer.length }));
documentStorage.saveDocument = async (owner, { name, contentType, buffer }) => { const d = { _id: OID(), userId: owner.companyId ? null : owner.userId, companyId: owner.companyId || null, name: documentStorage.cleanName(name), contentType, buffer }; docStore.push(d); return { _id: d._id, name: d.name, contentType, size: buffer.length }; };
documentStorage.findDocument = async (owner, id) => { const d = docStore.find((x) => eq(x._id, id) && ownsDoc(owner, x)); return d ? { _id: d._id, filename: d.name, length: d.buffer.length, metadata: { name: d.name, contentType: d.contentType } } : null; };
documentStorage.openDownload = (id) => Readable.from([docStore.find((x) => eq(x._id, id)).buffer]);
documentStorage.deleteDocument = async (id) => { const i = docStore.findIndex((x) => eq(x._id, id)); if (i >= 0) docStore.splice(i, 1); };
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
    docStore.length = 0; docUsed.bytes = null;
    providerCalls.charge.length = 0; providerCalls.refund.length = 0; chargeFails = false; sessions.length = 0;
    sessionUse.reads = 0; sessionUse.withSession = 0;
    delete process.env.PLATFORM_FEE_PERCENT;
    const u = (id, accountType, companyId, email) => ({ _id: id, email, name: `n-${email.split('@')[0]}`, accountType, status: 'ACTIVE', companyId, tokenVersion: 0 });
    const st = (key, extra = {}) => { const s = { _id: OID(), name: `Station ${key}`, type: 'RADIO', slug: `station-${key}`, location: { state: 'Lagos', city: 'Ikeja' }, companyId: M, approvalStatus: 'APPROVED', isActive: true, inventoryStatus: 'AVAILABLE', pricing: { amount: 50000, currency: 'NGN', unit: 'SPOT' }, bookingLockUntil: null, ...extra }; S[key] = s; return s; };
    const cp = (key, extra = {}) => { const c = { _id: OID(), name: key, objective: 'BRAND_AWARENESS', budget: 1, currency: 'NGN', status: 'DRAFT', startDate: null, endDate: null, companyId: null, userId: U.indiv, ...extra }; CP[key] = c; return c; };
    db = {
        users: [u(U.indiv, 'INDIVIDUAL', null, 'ivy@example.com'), u(U.indiv2, 'INDIVIDUAL', null, 'ian@example.com'), u(U.ownerA, 'COMPANY', A, 'owner-a@example.com'),
            u(U.staffA, 'EMPLOYEE', A, 'staff-a@example.com'), u(U.ownerM, 'COMPANY', M, 'owner-m@example.com'), u(U.admin, 'ADMIN', null, 'admin@example.com'), u(U.station, 'STATION', null, 'st@example.com')],
        employees: [{ _id: OID(), userId: U.ownerA, companyId: A, position: 'Company Owner', permissions: ['ALL_ACCESS'], isActive: true },
            { _id: OID(), userId: U.staffA, companyId: A, position: 'Viewer', permissions: ['BOOKING_VIEW', 'CAMPAIGN_VIEW'], isActive: true },
            { _id: OID(), userId: U.ownerM, companyId: M, position: 'Company Owner', permissions: ['ALL_ACCESS'], isActive: true }],
        companies: [{ _id: A, name: 'Advertiser Co', status: 'APPROVED' }, { _id: M, name: 'Media Co', status: 'APPROVED' }],
        stations: [st('fm1'), st('fm2', { pricing: { amount: 30000, currency: 'NGN', unit: 'SPOT' } }), st('usd', { pricing: { amount: 100, currency: 'USD', unit: 'SPOT' } }),
            st('pending', { approvalStatus: 'PENDING' }), st('unpriced', { pricing: { amount: 0, currency: 'NGN', unit: 'SPOT' } }),
            st('s3'), st('s4'), st('s5'), st('press', { type: 'PRESS' })],
        campaigns: [cp('ivy'), cp('ivyClosed', { status: 'CANCELLED' }), cp('ivyRanged', { startDate: new Date(`${day(5)}T00:00:00Z`), endDate: new Date(`${day(8)}T00:00:00Z`) }),
            cp('ian', { userId: U.indiv2 }), cp('companyA', { companyId: A, userId: U.ownerA, status: 'SUBMITTED' })],
        bookings: [], payments: [], creatives: [], audit: [], plans: [], subscriptions: [], notifications: [],
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
    const call = async (who, method, url, body, headers = {}) => {
        const isRaw = Buffer.isBuffer(body);
        const r = await fetch(base + url, {
            method,
            headers: { ...(isRaw ? {} : { 'Content-Type': 'application/json' }), ...(who ? { Authorization: `Bearer ${tok(who)}` } : {}), ...headers },
            body: body === undefined ? undefined : (isRaw ? body : JSON.stringify(body)),
        });
        const text = await r.text(); let parsed = {}; try { parsed = JSON.parse(text); } catch { parsed = {}; }
        return { code: r.status, body: parsed, text, headers: r.headers };
    };
    const pay = (who, campaignKey, items) => call(who, 'POST', '/api/v1/payments/checkout', { campaignId: String(CP[campaignKey]._id), items });
    const subscribeNow = async (who, planCode = 'STARTER', interval = 'MONTHLY') => call(who, 'POST', '/api/v1/subscriptions', { planCode, interval });

    // ── PL: plans ──
    let r = await call(null, 'GET', '/api/v1/plans');
    const codes = (r.body.data?.plans || []).map((p) => p.code).join(',');
    check('PL1 Public plans: Starter, Professional, Enterprise (defaults created once), with discount tiers', r.code === 200 && codes === 'STARTER,PROFESSIONAL,ENTERPRISE' && db.plans.length === 3 && JSON.stringify(r.body.data.discountTiers) === '[{"minStations":3,"percent":5},{"minStations":5,"percent":10}]', `${r.code} ${codes}`);
    const starter = r.body.data.plans.find((p) => p.code === 'STARTER');
    const ent = r.body.data.plans.find((p) => p.code === 'ENTERPRISE');
    check('PL2 Starter ₦20,000/month, ₦192,000/year, 2 active campaigns, 1 GB; Enterprise priced on request', starter.monthlyPrice === 20000 && starter.annualPrice === 192000 && starter.maxActiveCampaigns === 2 && starter.storageMB === 1024 && ent.priceOnRequest === true);
    await call(null, 'GET', '/api/v1/plans');
    check('PL3 Defaults are not duplicated on later reads', db.plans.length === 3);

    // ── SB: subscription gate ──
    r = await pay(U.indiv, 'ivy', [item('fm1')]);
    check('SB1 No subscription → checkout 403 SUBSCRIPTION_REQUIRED, nothing charged', r.code === 403 && r.body.code === 'SUBSCRIPTION_REQUIRED' && db.payments.length === 0 && providerCalls.charge.length === 0, `${r.code} ${r.body.code}`);
    r = await call(U.indiv, 'GET', '/api/v1/subscriptions/me');
    check('SB2 /subscriptions/me without a plan → subscription null', r.code === 200 && r.body.data.subscription === null && r.body.data.subscriptionRequired === true);
    r = await subscribeNow(U.indiv, 'ENTERPRISE');
    check('SB3 Enterprise (priced on request) → 400 PRICE_ON_REQUEST, not charged', r.code === 400 && r.body.code === 'PRICE_ON_REQUEST' && providerCalls.charge.length === 0, `${r.code}`);
    r = await call(U.indiv, 'POST', '/api/v1/subscriptions', { planCode: 'STARTER', interval: 'WEEKLY' });
    check('SB4 Invalid interval → 400 validation contract', isContract(r, 'interval'), `${r.code}`);
    r = await subscribeNow(U.indiv, 'STARTER', 'MONTHLY');
    const sub = db.subscriptions[0];
    const days = sub ? Math.round((new Date(sub.currentPeriodEnd) - new Date(sub.currentPeriodStart)) / 864e5) : 0;
    check('SB5 Subscribe to Starter monthly → 201, charged ₦20,000, ACTIVE for about a month, owned by the individual', r.code === 201 && !!sub && sub.status === 'ACTIVE' && providerCalls.charge[0]?.amount === 20000 && days >= 28 && days <= 31 && eq(sub.userId, U.indiv) && sub.companyId == null, `${r.code} ${days}`);
    r = await subscribeNow(U.indiv, 'STARTER', 'MONTHLY');
    check('SB6 Same plan again → 409, not charged twice', r.code === 409 && providerCalls.charge.length === 1, `${r.code}`);
    r = await call(U.staffA, 'POST', '/api/v1/subscriptions', { planCode: 'STARTER', interval: 'MONTHLY' });
    check('SB7 A company team member cannot subscribe for the company → 403', r.code === 403, `${r.code}`);

    // ── RC: rate cards ──
    const mgrStation = S.fm1;
    r = await call(U.ownerM, 'PUT', `/api/v1/station-portal/stations/${mgrStation._id}/rate-card`, { rates: [
        { name: 'AAA prime 30s', kind: 'TIME_BELT', code: 'AAA', startTime: '19:00', endTime: '22:00', spotSeconds: 30, price: 90000 },
        { name: 'A daytime 30s', kind: 'TIME_BELT', code: 'A', startTime: '09:00', endTime: '16:00', spotSeconds: 30, price: 50000 },
        { name: 'Late night', kind: 'TIME_BELT', startTime: '22:00', endTime: '02:00', price: 30000 },
    ] });
    const card = db.stations.find((s) => eq(s._id, mgrStation._id)).rateCard || [];
    check('RC1 Station operator saves a 3-rate TV/radio card → 200, stored with ids', r.code === 200 && card.length === 3 && card.every((x) => x._id) && card[0].price === 90000, `${r.code} ${r.body.message}`);
    r = await call(U.ownerM, 'PUT', `/api/v1/station-portal/stations/${mgrStation._id}/rate-card`, { rates: [{ name: 'Bad', kind: 'TIME_BELT', price: 100 }] });
    const r2 = await call(U.ownerM, 'PUT', `/api/v1/station-portal/stations/${mgrStation._id}/rate-card`, { rates: [{ name: 'X', kind: 'PLACEMENT', price: 0 }] });
    const r3 = await call(U.ownerM, 'PUT', `/api/v1/station-portal/stations/${mgrStation._id}/rate-card`, { rates: [{ name: 'Dup', kind: 'PLACEMENT', price: 5 }, { name: 'dup', kind: 'PLACEMENT', price: 6 }] });
    check('RC2 Validation: time belt without times, zero price, duplicate names → 400 each, card unchanged', isContract(r) && isContract(r2) && isContract(r3) && (db.stations.find((s) => eq(s._id, mgrStation._id)).rateCard || []).length === 3, `${r.code}/${r2.code}/${r3.code}`);
    r = await call(U.indiv, 'PUT', `/api/v1/station-portal/stations/${mgrStation._id}/rate-card`, { rates: [] });
    check('RC3 An advertiser cannot edit a station rate card → 403', r.code === 403, `${r.code}`);
    r = await call(null, 'GET', '/api/v1/stations');
    check('RC4 Public station list includes the rate card', r.code === 200 && (r.body.data || []).some((s) => (s.rateCard || []).length === 3));

    const aaa = card[0], late = card[2];
    r = await pay(U.indiv, 'ivy', [item('fm1', { time: '20:00' })]);
    check('RC5 Station with a rate card: no rate chosen → 400 "Choose a rate", nothing charged', isContract(r, 'items.0') && /Choose a rate/.test(r.body.message) && db.payments.length === 0, `${r.code} ${r.body.message}`);
    r = await pay(U.indiv, 'ivy', [item('fm1', { time: '10:00', rateId: String(aaa._id) })]);
    check('RC6 AAA rate at 10:00 (outside 19:00–22:00) → 400 naming the belt', isContract(r, 'items.0') && /AAA prime 30s rate is for spots starting between 19:00 and 22:00/.test(r.body.message), `${r.message || r.body.message}`);
    r = await pay(U.indiv, 'ivy', [item('fm1', { time: '23:30', rateId: String(late._id) }), item('fm1', { time: '20:00', rateId: String(aaa._id) })]);
    const rb = db.bookings.filter((b) => eq(b.stationId, S.fm1._id));
    check('RC7 Late-night belt crossing midnight accepts 23:30; checkout charges rate prices (30,000 + 90,000) and records the rate on each booking', r.code === 201 && rb.length === 2 && rb.some((b) => b.price === 90000 && b.rateName === 'AAA prime 30s' && eq(b.rateId, aaa._id)) && rb.some((b) => b.price === 30000) && db.payments[0].amount === 120000, `${r.code} ${r.body.message} ${db.payments[0]?.amount}`);
    r = await pay(U.indiv, 'ivy', [item('fm2', { rateId: String(aaa._id) })]);
    check('RC8 A rateId on a station without a rate card → 400', isContract(r, 'items.0') && /no rate card/.test(r.body.message), `${r.body.message}`);

    // Press: placements don't block each other.
    r = await call(U.ownerM, 'PUT', `/api/v1/station-portal/stations/${S.press._id}/rate-card`, { rates: [
        { name: 'Full page colour', kind: 'PLACEMENT', size: 'FULL_PAGE', colour: 'COLOUR', price: 1500000 },
        { name: 'Quarter page B&W', kind: 'PLACEMENT', size: 'QUARTER_PAGE', colour: 'BLACK_WHITE', price: 300000 },
    ] });
    const pcard = db.stations.find((s) => eq(s._id, S.press._id)).rateCard;
    r = await pay(U.indiv, 'ivy', [item('press', { time: '06:00', rateId: String(pcard[1]._id) }), item('press', { time: '06:00', rateId: String(pcard[1]._id) })]);
    const r4 = await pay(U.indiv, 'ivy', [item('press', { time: '06:00', rateId: String(pcard[0]._id) })]);
    check('RC9 Press: two quarter pages and then a full page on the same day all book (no time clash for print)', r.code === 201 && r4.code === 201 && db.bookings.filter((b) => eq(b.stationId, S.press._id)).length === 3, `${r.code} ${r.body.message} / ${r4.code} ${r4.body.message}`);

    // ── DC: multi-station discount ──
    seed();
    await subscribeNow(U.indiv, 'PROFESSIONAL', 'MONTHLY'); // Professional adds 2%
    r = await pay(U.indiv, 'ivy', [item('fm1'), item('fm2'), item('s3')]);
    let p = db.payments[0];
    check('DC1 3 stations + Professional: 5% + 2% = 7% off ₦130,000 → ₦120,900 charged', r.code === 201 && p.subtotal === 130000 && p.discountPercent === 7 && p.discount === 9100 && p.amount === 120900 && providerCalls.charge.at(-1).amount === 120900, `${r.code} ${p?.discountPercent} ${p?.amount}`);
    check('DC2 Bookings keep list prices; the response shows the discount', db.bookings.map((b) => b.price).sort((a, b) => a - b).join() === '30000,50000,50000' && r.body.data.payment.discount === 9100);
    const fb = db.bookings.find((b) => b.price === 30000);
    r = await call(U.ownerM, 'PATCH', `/api/v1/bookings/${fb._id}/reject`, {});
    check('DC3 A declined spot refunds what was actually paid for it (30,000 × 93% = 27,900)', r.code === 200 && fb.refundAmount === 27900, `${r.code} ${fb.refundAmount}`);
    seed();
    await subscribeNow(U.indiv, 'STARTER', 'MONTHLY');
    r = await pay(U.indiv, 'ivy', [item('fm1'), item('fm2'), item('s3'), item('s4'), item('s5')]);
    p = db.payments[0];
    check('DC4 5 stations on Starter (no plan extra) → 10% off', r.code === 201 && p.discountPercent === 10 && p.amount === Math.round(p.subtotal * 0.9 * 100) / 100, `${r.code} ${r.body.message} ${p?.discountPercent}`);
    seed();
    await subscribeNow(U.indiv, 'STARTER', 'MONTHLY');
    r = await pay(U.indiv, 'ivy', [item('fm1'), item('fm1', { time: '09:00' })]);
    check('DC5 Two spots on one station → no multi-station discount', r.code === 201 && db.payments[0].discountPercent === 0 && db.payments[0].amount === 100000, `${r.code} ${db.payments[0]?.discountPercent}`);
    process.env.MULTI_STATION_DISCOUNTS = '2:3';
    seed();
    await subscribeNow(U.indiv, 'STARTER', 'MONTHLY');
    r = await pay(U.indiv, 'ivy', [item('fm1'), item('fm2')]);
    check('DC6 Tiers configurable (MULTI_STATION_DISCOUNTS=2:3) → 3% for two stations', r.code === 201 && db.payments[0].discountPercent === 3, `${r.code} ${db.payments[0]?.discountPercent}`);
    process.env.MULTI_STATION_DISCOUNTS = 'nonsense';
    seed();
    await subscribeNow(U.indiv, 'STARTER', 'MONTHLY');
    r = await pay(U.indiv, 'ivy', [item('fm1'), item('fm2'), item('s3')]);
    check('DC7 Invalid tier setting falls back to the defaults (5% for 3)', r.code === 201 && db.payments[0].discountPercent === 5, `${r.code} ${db.payments[0]?.discountPercent}`);
    delete process.env.MULTI_STATION_DISCOUNTS;

    // ── LM: plan limits ──
    seed();
    await subscribeNow(U.indiv, 'STARTER', 'MONTHLY'); // 2 active campaigns
    CP.ivyClosed.status = 'DRAFT';
    r = await pay(U.indiv, 'ivy', [item('fm1')]);
    const r5 = await pay(U.indiv, 'ivyRanged', [item('fm2', { date: day(6) })]);
    const r6 = await pay(U.indiv, 'ivyClosed', [item('s3')]);
    check('LM1 Starter allows 2 active campaigns: third campaign → 403 PLAN_LIMIT, not charged', r.code === 201 && r5.code === 201 && r6.code === 403 && r6.body.code === 'PLAN_LIMIT' && db.payments.length === 2, `${r.code}/${r5.code}/${r6.code} ${r6.body.message}`);
    r = await pay(U.indiv, 'ivy', [item('s4', { time: '11:00' })]);
    check('LM2 More spots on an already-active campaign are still allowed', r.code === 201, `${r.code} ${r.body.message}`);
    r = await subscribeNow(U.indiv, 'PROFESSIONAL', 'ANNUAL');
    const replaced = db.subscriptions.filter((s) => s.status === 'REPLACED').length;
    const r7 = await pay(U.indiv, 'ivyClosed', [item('s3')]);
    check('LM3 Upgrade to Professional annual: old plan REPLACED, charged ₦480,000, limit lifted', r.code === 201 && replaced === 1 && providerCalls.charge.some((c) => c.amount === 480000) && r7.code === 201, `${r.code} ${replaced} ${r7.code}`);

    // ── CN: cancel subscription ──
    r = await call(U.indiv, 'POST', '/api/v1/subscriptions/me/cancel');
    const active = db.subscriptions.find((s) => s.status === 'ACTIVE');
    const r8 = await pay(U.indiv, 'ivy', [item('s5', { time: '12:00' })]);
    check('CN1 Cancel → stops renewing but stays usable until the period ends', r.code === 200 && active.cancelAtPeriodEnd === true && r8.code === 201, `${r.code} ${r8.code}`);
    active.currentPeriodEnd = new Date(Date.now() - 1000);
    r = await pay(U.indiv, 'ivy', [item('s5', { time: '13:00' })]);
    check('CN2 After the period ends → checkout needs a subscription again', r.code === 403 && r.body.code === 'SUBSCRIPTION_REQUIRED', `${r.code}`);

    // ── CO: company subscription is shared by the team ──
    r = await subscribeNow(U.ownerA, 'STARTER', 'MONTHLY');
    const csub = db.subscriptions.find((s) => eq(s.companyId, A));
    r = await call(U.staffA, 'GET', '/api/v1/subscriptions/me');
    check('CO1 Company owner subscribes for the company; a team member sees the same plan', !!csub && r.code === 200 && r.body.data.subscription?.planCode === 'STARTER', `${r.code}`);

    // ── AD: admin ──
    r = await call(U.admin, 'POST', '/api/v1/admin/subscriptions', { email: 'ian@example.com', planCode: 'ENTERPRISE', interval: 'ANNUAL', price: 2500000 });
    const esub = db.subscriptions.find((s) => s.planCode === 'ENTERPRISE');
    check('AD1 Admin assigns Enterprise at a custom price → 201, active for the account, no charge', r.code === 201 && esub && eq(esub.userId, U.indiv2) && esub.price === 2500000 && esub.provider === 'MANUAL', `${r.code} ${r.body.message}`);
    r = await call(U.admin, 'PUT', '/api/v1/admin/plans/STARTER', { monthlyPrice: 25000, maxActiveCampaigns: 3 });
    const r9 = await call(null, 'GET', '/api/v1/plans');
    check('AD2 Admin edits a plan; the public list shows the new price', r.code === 200 && r9.body.data.plans.find((x) => x.code === 'STARTER').monthlyPrice === 25000, `${r.code}`);
    r = await call(U.admin, 'GET', '/api/v1/admin/subscriptions');
    check('AD3 Admin subscription list with active count and revenue', r.code === 200 && r.body.data.length === db.subscriptions.length && typeof r.body.totals.active === 'number' && r.body.totals.revenue.NGN > 0);
    const denied = await Promise.all([U.indiv, U.ownerA].map((w) => call(w, 'GET', '/api/v1/admin/subscriptions')));
    check('AD4 Non-admins → 403 on admin subscription routes', denied.every((x) => x.code === 403));

    // ── DO: documents (storage layer stubbed; quota and scoping are the controller's) ──
    r = await call(U.indiv2, 'POST', '/api/v1/documents', Buffer.from('%PDF-1.4 brief'), { 'Content-Type': 'application/pdf', 'X-File-Name': encodeURIComponent('Brief Q4.pdf') });
    check('DO1 Enterprise (assigned) account uploads a PDF → 201', r.code === 201 && docStore.length === 1 && docStore[0].name === 'Brief Q4.pdf', `${r.code} ${r.body.message}`);
    r = await call(U.indiv2, 'GET', '/api/v1/documents');
    check('DO2 Lists own documents with storage usage and the plan quota (50 GB)', r.code === 200 && r.body.data.length === 1 && r.body.storage.quotaBytes === 51200 * 1024 * 1024 && r.body.storage.usedBytes === 14);
    r = await call(U.indiv2, 'POST', '/api/v1/documents', Buffer.from('MZ'), { 'Content-Type': 'application/x-msdownload', 'X-File-Name': 'tool.exe' });
    const rA = await call(U.indiv2, 'POST', '/api/v1/documents', Buffer.from('x'), { 'Content-Type': 'application/pdf', 'X-File-Name': 'notpdf.exe' });
    check('DO3 Unsupported type and mismatched extension → 400', r.code === 400 && rA.code === 400 && docStore.length === 1, `${r.code}/${rA.code}`);
    seed(); // fresh: nobody subscribed
    r = await call(U.indiv, 'POST', '/api/v1/documents', Buffer.from('%PDF'), { 'Content-Type': 'application/pdf', 'X-File-Name': 'a.pdf' });
    check('DO4 No subscription → 403 SUBSCRIPTION_REQUIRED (storage comes with a plan)', r.code === 403 && r.body.code === 'SUBSCRIPTION_REQUIRED', `${r.code}`);
    await subscribeNow(U.indiv, 'STARTER', 'MONTHLY');
    docUsed.bytes = 1024 * 1024 * 1024 - 2; // Starter: 1 GB, 2 bytes free
    r = await call(U.indiv, 'POST', '/api/v1/documents', Buffer.from('%PDF'), { 'Content-Type': 'application/pdf', 'X-File-Name': 'a.pdf' });
    check('DO5 Quota full → 403 STORAGE_FULL', r.code === 403 && r.body.code === 'STORAGE_FULL', `${r.code} ${r.body.message}`);
    docUsed.bytes = null;
    r = await call(U.indiv, 'POST', '/api/v1/documents', Buffer.from('%PDF-1.4'), { 'Content-Type': 'application/pdf', 'X-File-Name': 'ok.pdf' });
    const mine = docStore.at(-1);
    const other = await call(U.indiv2, 'GET', `/api/v1/documents/${mine?._id}/download`);
    const del = await call(U.indiv2, 'DELETE', `/api/v1/documents/${mine?._id}`);
    check('DO6 Another account cannot download or delete my document → 404', r.code === 201 && other.code === 404 && del.code === 404 && docStore.includes(mine), `${r.code} ${other.code}/${del.code}`);
    const dl = await call(U.indiv, 'GET', `/api/v1/documents/${mine?._id}/download`);
    check('DO7 Owner downloads it as an attachment with the right type', dl.code === 200 && /attachment/.test(dl.headers.get('content-disposition') || '') && dl.headers.get('content-type') === 'application/pdf' && dl.text === '%PDF-1.4', `${dl.code}`);
    r = await call(U.indiv, 'DELETE', `/api/v1/documents/${mine?._id}`);
    check('DO8 Owner deletes it → 200, gone', r.code === 200 && !docStore.includes(mine), `${r.code}`);

    // ── NT: in-app notifications ──
    seed();
    await subscribeNow(U.indiv, 'STARTER', 'MONTHLY');
    await pay(U.indiv, 'ivy', [item('fm1')]);
    r = await call(U.indiv, 'GET', '/api/v1/notifications');
    const stationBell = await call(U.ownerM, 'GET', '/api/v1/notifications');
    check('NT1 Checkout → advertiser bell "Payment received"; the station (company fallback) gets "new booking request"', r.code === 200 && r.body.data.some((n) => n.type === 'PAYMENT_RECEIVED') && r.body.unread >= 1 && stationBell.body.data.some((n) => n.type === 'BOOKING_REQUEST'), `${r.body.unread} ${stationBell.body.data?.length}`);
    const nid = r.body.data[0]._id;
    const other2 = await call(U.indiv2, 'POST', `/api/v1/notifications/${nid}/read`);
    r = await call(U.indiv, 'POST', `/api/v1/notifications/${nid}/read`);
    check('NT2 Mark read: owner only (others → 404)', other2.code === 404 && r.code === 200 && db.notifications.find((n) => eq(n._id, nid)).readAt, `${other2.code}/${r.code}`);
    r = await call(U.indiv, 'POST', '/api/v1/notifications/read-all');
    const after = await call(U.indiv, 'GET', '/api/v1/notifications');
    check('NT3 Mark all read → unread 0', r.code === 200 && after.body.unread === 0);

    // ── RM: reminders ──
    seed();
    const reminders = src('utils/reminders');
    const now = new Date();
    const at = (ms) => { const t = new Date(now.getTime() + ms + 3600000); return { date: new Date(`${t.toISOString().slice(0, 10)}T00:00:00.000Z`), time: t.toISOString().slice(11, 16) }; }; // Lagos = UTC+1
    const mk = (status, when) => { const b = { _id: OID(), bookingReference: `BK-R-${Math.random().toString(36).slice(2, 7)}`, campaignId: CP.ivy._id, stationId: S.fm1._id, userId: U.indiv, companyId: null, slot: 'X', ...when, duration: 30, price: 1, currency: 'NGN', status, paymentStatus: 'PAID', reminder24SentAt: null, reminder1SentAt: null }; db.bookings.push(b); return b; };
    const soon = mk('SCHEDULED', at(40 * 60000));       // 40 min
    const tomorrow = mk('ACCEPTED', at(20 * 3600000));  // 20 h
    const far = mk('ACCEPTED', at(3 * 864e5));          // 3 days
    const pending = mk('PENDING', at(30 * 60000));      // not accepted yet
    let res1 = await reminders.runReminders(now);
    check('RM1 Run: 1-hour reminder for the spot in 40 min, 24-hour reminder for the one in 20 h; none for 3 days away or a pending request', soon.reminder1SentAt && tomorrow.reminder24SentAt && !tomorrow.reminder1SentAt && !far.reminder24SentAt && !pending.reminder1SentAt && res1.hour === 1 && res1.day === 1, JSON.stringify(res1));
    const bell = db.notifications.filter((n) => n.type === 'SLOT_REMINDER' && eq(n.userId, U.indiv)).length;
    res1 = await reminders.runReminders(now);
    check('RM2 Running again sends nothing twice (in-app reminders: 2)', res1.hour === 0 && res1.day === 0 && bell === 2 && db.notifications.filter((n) => n.type === 'SLOT_REMINDER').length === 2, JSON.stringify(res1));
    r = await call(null, 'POST', '/api/v1/jobs/reminders');
    process.env.CRON_SECRET = 'cron-secret-for-tests-0123456789';
    const rW = await call(null, 'POST', '/api/v1/jobs/reminders', undefined, { Authorization: 'Bearer wrong-secret-wrong-secret-xx' });
    const rOK = await call(null, 'POST', '/api/v1/jobs/reminders', undefined, { Authorization: 'Bearer cron-secret-for-tests-0123456789' });
    check('RM3 Job endpoint: no/wrong secret → 401; correct CRON_SECRET → 200 with a summary', r.code === 401 && rW.code === 401 && rOK.code === 200 && typeof rOK.body.data?.checked === 'number', `${r.code}/${rW.code}/${rOK.code}`);
    delete process.env.CRON_SECRET;

    // ── NS: new station alerts ──
    r = await call(U.indiv, 'PUT', '/api/v1/notifications/preferences', { notifyNewStations: true, notifyStates: ['Lagos'] });
    const rBad = await call(U.indiv, 'PUT', '/api/v1/notifications/preferences', { notifyNewStations: true, notifyStates: ['Atlantis'] });
    await call(U.indiv2, 'PUT', '/api/v1/notifications/preferences', { notifyNewStations: true, notifyStates: ['Kano'] });
    check('NS1 Save opt-in for Lagos; an unknown state → 400', r.code === 200 && rBad.code === 400 && db.users.find((u) => eq(u._id, U.indiv)).notifyStates.join() === 'Lagos', `${r.code}/${rBad.code}`);
    const newSt = { _id: OID(), name: 'Eko FM', slug: 'eko-fm', type: 'RADIO', companyId: null, approvalStatus: 'PENDING', isActive: true, inventoryStatus: 'AVAILABLE', pricing: { amount: 1000, currency: 'NGN', unit: 'SPOT' }, location: { state: 'Lagos', city: 'Ikeja' } };
    db.stations.push(newSt);
    r = await call(U.admin, 'PATCH', `/api/v1/admin/stations/${newSt._id}/approve`);
    const ivyAlert = db.notifications.find((n) => n.type === 'NEW_STATION' && eq(n.userId, U.indiv));
    const ianAlert = db.notifications.find((n) => n.type === 'NEW_STATION' && eq(n.userId, U.indiv2));
    check('NS2 Admin approves a Lagos station → Lagos subscriber alerted, Kano subscriber not', r.code === 200 && !!ivyAlert && /Eko FM/.test(ivyAlert.title) && !ianAlert, `${r.code} ${r.body.message}`);

    // ── IN: spend insights ──
    seed();
    await subscribeNow(U.indiv, 'STARTER', 'MONTHLY');
    await pay(U.indiv, 'ivy', [item('fm1'), item('fm2')]);
    r = await call(U.indiv, 'GET', '/api/v1/insights/spend');
    const plat = r.body.data?.platform;
    check('IN1 Insights: industry figures carry a source and link; platform spend by channel and top stations from paid bookings', r.code === 200 && r.body.data.industry.byMedium.every((m) => m.source && /^https:\/\//.test(m.url) && m.year) && plat.total === 80000 && plat.byChannel[0].type === 'RADIO' && plat.topStations.length === 2 && plat.topStations[0].amount === 50000, `${r.code} ${plat?.total}`);
    r = await call(null, 'GET', '/api/v1/insights/spend');
    check('IN2 Insights need a signed-in account → 401', r.code === 401);

    const passed = results.filter(Boolean).length;
    out(`\n${passed}/${results.length} passed`);
    process.exitCode = passed === results.length ? 0 : 1;
    // Graceful shutdown: wait for the server and its keep-alive sockets to close, then let Node exit on its own.
    await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
        server.closeAllConnections();
    });
})().catch((e) => { out('HARNESS CRASH ' + e.stack); process.exitCode = 1; });
