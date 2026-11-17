// Media plan harness — offline: long campaigns booked as a plan (days of the week x spots per day over the
// campaign period), priced like an agency plan (rate card - volume discount - 15% agency commission + VAT),
// the whole plan held in the wallet, media houses accepting whole orders and confirming a day at a time,
// daily payment as spots air, the campaign tracker. Same in-memory harness as features.test.cjs. No database.
'use strict';
process.env.JWT_SECRET = 'features-harness-dummy-secret';
process.env.JWT_EXPIRE = '5m';
process.env.SUBSCRIPTION_REQUIRED = 'false'; // booking needs no plan
process.env.WALLET_PAYMENTS = 'true'; // checkout pays from the wallet (the default)
process.env.TEAM_ACCOUNTS_ENABLED = 'false'; // team logins off (the default)
process.env.REQUIRE_CREATIVE = 'false'; // advert + ARCON requirement is covered by verification-creatives.test.cjs
process.env.VAT_PERCENT = '0'; // VAT is covered by verification-creatives.test.cjs; amounts here are pre-VAT
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
const Verification = src('models/Verification');
const Wallet = src('models/Wallet'), WalletTransaction = src('models/WalletTransaction');
const PlatformSetting = src('models/PlatformSetting'), PayoutRequest = src('models/PayoutRequest');
const documentStorage = src('utils/documentStorage');
const { Readable } = require('stream');
const payments = src('utils/payments');
const fileUploads = src('utils/fileUploads');
const uploadsStore = new Map();
const makeUpload = (owner, purpose, contentType = 'application/pdf') => {
    const id = String(new mongoose.Types.ObjectId());
    uploadsStore.set(id, { owner: String(owner), purpose, contentType, claimed: false, fileId: new mongoose.Types.ObjectId(), name: purpose === 'PROOF_CLIP' ? 'clip.mp4' : 'txlog.pdf' });
    return id;
};
fileUploads.claimUpload = async (user, uploadId, purpose) => {
    const u = uploadsStore.get(String(uploadId));
    if (!u || u.owner !== String(user._id || user.id) || u.purpose !== purpose || u.claimed) return { error: 'That file upload was not found or is already in use. Upload it again.' };
    u.claimed = true;
    return { file: { uploadId, fileId: u.fileId, name: u.name, contentType: u.contentType, size: 2048, purpose } };
};
fileUploads.sendFile = async (res, bucket, fileId) => res.json({ served: String(fileId), bucket });

const OID = () => new mongoose.Types.ObjectId();
let db;
const clone = (o) => mongoose.mongo.BSON.deserialize(mongoose.mongo.BSON.serialize(o), { promoteValues: true });
const eq = (a, b) => (a == null && b == null) || (a != null && b != null && String(a) === String(b));
const cmp = (x, y) => (x instanceof Date ? x.getTime() : x) - (y instanceof Date ? y.getTime() : y);
const matches = (d, f = {}) => Object.entries(f).every(([k, v]) => {
    if (k === '$or') return v.some((g) => matches(d, g));
    const x = k.includes('.') ? k.split('.').reduce((o, p) => (o == null ? undefined : o[p]), d) : d[k];
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
    for (const [k, v] of Object.entries(u.$set || {})) {
        if (!k.includes('.')) { o[k] = v; continue; }
        const parts = k.split('.'); let t = o;
        for (const p of parts.slice(0, -1)) { if (t[p] == null || typeof t[p] !== 'object') t[p] = {}; t = t[p]; }
        t[parts.at(-1)] = v;
    }
    for (const [k, v] of Object.entries(u.$addToSet || {})) { o[k] = o[k] || []; if (!o[k].some((z) => eq(z, v))) o[k].push(v); }
    for (const [k, n] of Object.entries(u.$inc || {})) {
        if (o[k] != null && typeof o[k] !== 'number') throw new Error(`Cannot apply $inc to a value of non-numeric type (${k})`);
        if (o[k] === null) throw Object.assign(new Error(`Cannot apply $inc to a value of non-numeric type null (${k})`), { name: 'MongoServerError' });
        o[k] = (o[k] || 0) + n;
    }
};
const C = { users: User, employees: Employee, companies: Company, campaigns: Campaign, stations: Station, bookings: Booking, payments: Payment, creatives: Creative, plans: Plan, subscriptions: Subscription, notifications: Notification, verifications: Verification, wallets: Wallet, walletTransactions: WalletTransaction, platformSettings: PlatformSetting, payoutRequests: PayoutRequest };
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
for (const [c, M] of Object.entries(C)) {
    M.insertMany = async (arr) => { const outs = []; for (const d of arr) outs.push(await M.create(d)); return outs; };
    M.deleteMany = async (f) => { const n = db[c].length; db[c] = db[c].filter((d) => !matches(d, f)); return { deletedCount: n - db[c].length }; };
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
        bookings: [], payments: [], creatives: [], audit: [], plans: [], subscriptions: [], notifications: [], verifications: [], wallets: [], walletTransactions: [], platformSettings: [], payoutRequests: [],
    };
};
AuditLog.create = async (data) => { const a = new AuditLog(data); await a.validate(); db.audit.push(a.toObject()); return a; };
// Assigning a plan marks that account's Enterprise requests handled.
AuditLog.updateMany = async (f, u) => { const rows = db.audit.filter((r) => r.action === f.action && eq(r.userId, f.userId) && !r.metadata?.handledAt); rows.forEach((r) => { r.metadata = { ...(r.metadata || {}), handledAt: u.$set['metadata.handledAt'], handledPlan: u.$set['metadata.handledPlan'] }; }); return { modifiedCount: rows.length }; };

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

    // Plans pay from the wallet; VAT 7.5% as in Nigeria.
    payments.setPaymentProviderForTests(null);
    process.env.VAT_PERCENT = '7.5';
    delete process.env.AGENCY_COMMISSION_PERCENT;
    process.env.MULTI_STATION_DISCOUNTS_ENABLED = 'false'; // the default: volume discounts replace it
    const { runSettlementJob } = src('utils/reminders');
    const bk = (id) => db.bookings.find((b) => eq(b._id, id));
    const walletOf = (scope) => db.wallets.find((w) => (scope.stationId ? eq(w.stationId, scope.stationId) : scope.companyId ? eq(w.companyId, scope.companyId) : (w.companyId == null && w.stationId == null && eq(w.userId, scope.userId))));
    const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
    const r2 = (n) => Math.round(n * 100) / 100;

    // Agency A (a media agency) runs a 6-month campaign; Ivy is an individual brand.
    db.companies.find((c) => eq(c._id, A)).companyType = 'AGENCY';
    const campA = db.campaigns.find((c) => eq(c._id, CP.companyA._id));
    Object.assign(campA, { startDate: new Date(`${day(1)}T00:00:00Z`), endDate: new Date(`${day(182)}T00:00:00Z`) });
    Object.assign(db.campaigns.find((c) => eq(c._id, CP.ivy._id)), { startDate: new Date(`${day(1)}T00:00:00Z`), endDate: new Date(`${day(60)}T00:00:00Z`) });

    // Rate cards: TV news on Thursdays only (30s and 60s), and a radio breakfast belt.
    const fm1 = db.stations.find((s) => eq(s._id, S.fm1._id));
    const fm2 = db.stations.find((s) => eq(s._id, S.fm2._id));
    fm1.type = 'TV';
    fm1.managerIds = [U.station];
    fm1.rateCard = [
        { _id: OID(), name: 'Network News', kind: 'TIME_BELT', startTime: '21:00', endTime: '22:00', spotSeconds: 30, days: [4], price: 642000, isActive: true },
        { _id: OID(), name: 'Network News', kind: 'TIME_BELT', startTime: '21:00', endTime: '22:00', spotSeconds: 60, days: [4], price: 1000000, isActive: true },
    ];
    fm2.rateCard = [{ _id: OID(), name: 'Morning Drive', kind: 'TIME_BELT', startTime: '07:00', endTime: '10:00', spotSeconds: 30, price: 50000, isActive: true }];
    const [news30, news60] = fm1.rateCard;
    const [drive30] = fm2.rateCard;
    const advert = (campaignId) => { const c = { _id: OID(), campaignId, name: 'TV spot', type: 'VIDEO', fileId: OID(), status: 'APPROVED', uploadedBy: String(U.ownerA), arcon: { certificateNumber: 'ARCON/1', fileId: OID(), fileName: 'arcon.pdf' } }; db.creatives.push(c); return c; };
    const adA = advert(CP.companyA._id);
    const adIvy = advert(CP.ivy._id);
    const planOf = (key, lines, creativeId) => ({ campaignId: String(CP[key]._id), lines, creativeId: String(creativeId) });
    const countDays = (from, to, weekdays) => { let n = 0; for (let t = new Date(`${from}T00:00:00Z`).getTime(); t <= new Date(`${to}T00:00:00Z`).getTime(); t += 864e5) if (weekdays.includes(new Date(t).getUTCDay())) n += 1; return n; };

    // ── V: volume discounts (admin) ──
    let r = await call(U.ownerA, 'PUT', `/api/v1/admin/stations/${S.fm1._id}/volume-discount`, { percent: 10 });
    check('V1  Only admins set volume discounts → 403', r.code === 403, `${r.code}`);
    r = await call(U.admin, 'PUT', `/api/v1/admin/stations/${S.fm1._id}/volume-discount`, { percent: 95 });
    check('V2  Over 90% → 400', r.code === 400, `${r.code}`);
    r = await call(U.admin, 'PUT', `/api/v1/admin/stations/${S.fm1._id}/volume-discount`, { percent: 10 });
    check('V3  Admin sets 10% for the TV station', r.code === 200 && fm1.volumeDiscount?.percent === 10, `${r.code} ${r.body.message}`);
    r = await call(U.admin, 'GET', '/api/v1/admin/volume-discounts');
    const fm2Row = (r.body.data || []).find((s) => eq(s._id, S.fm2._id));
    const driveKey = fm2Row?.programmes?.[0]?.key;
    const newsRow = (r.body.data || []).find((s) => eq(s._id, S.fm1._id));
    check('V4  Discounts tab lists each media house with its programmes (all lengths of a programme together)', r.code === 200 && newsRow?.programmes.length === 1 && newsRow.programmes[0].lengths.join(',') === '60,30' && !!driveKey, `${r.code} ${JSON.stringify(newsRow?.programmes)}`);
    r = await call(U.admin, 'PUT', `/api/v1/admin/stations/${S.fm2._id}/volume-discount`, { percent: 5, programmes: [{ key: driveKey, name: 'Morning Drive', percent: 15 }] });
    check('V5  A programme can have its own discount (Morning Drive 15%, the station default 5%)', r.code === 200 && fm2.volumeDiscount.programmes[0].percent === 15 && fm2.volumeDiscount.percent === 5, `${r.code} ${r.body.message}`);
    r = await call(null, 'GET', '/api/v1/plans');
    check('V6  The old 3+ media house discount is off', r.code === 200 && Array.isArray(r.body.data.discountTiers) && r.body.data.discountTiers.length === 0, JSON.stringify(r.body.data?.discountTiers));

    // ── Q: pricing a 6-month plan ──
    const thursdays = countDays(day(1), day(182), [4]);
    const newsLine = { stationId: String(S.fm1._id), rateId: String(news30._id), days: [4], spotsPerDay: 1 };
    r = await call(U.ownerA, 'POST', '/api/v1/media-plans/quote', planOf('companyA', [newsLine], adA._id));
    const q1 = r.body.data?.lines?.[0];
    check(`Q1  Network News every Thursday for 6 months → ${thursdays} spots`, r.code === 200 && q1?.spots === thursdays && q1.airingDays === thursdays, `${r.code} ${q1?.spots}/${thursdays} ${JSON.stringify(r.body.data?.errors)}`);
    check('Q2  Priced like the Zebet plan: ₦642,000 − 10% volume = ₦577,800 − 15% agency = ₦491,130 net + VAT = ₦527,964.75', q1 && q1.unit.gross === 642000 && q1.unit.volumeDiscount === 64200 && q1.unit.agencyCommission === 86670 && q1.unit.net === 491130 && q1.unit.vat === 36834.75 && q1.unit.total === 527964.75 && r.body.data.isAgency === true, JSON.stringify(q1?.unit));
    check('Q3  Totals: gross, savings, net, VAT and total for the whole plan', r.body.data.totals.total === r2(527964.75 * thursdays) && r.body.data.totals.savings === r2((64200 + 86670) * thursdays) && r.body.data.wallet.shortfall === r2(527964.75 * thursdays), JSON.stringify(r.body.data.totals));
    r = await call(U.ownerA, 'POST', '/api/v1/media-plans/quote', planOf('companyA', [{ ...newsLine, days: [1] }], adA._id));
    check('Q4  A Thursday-only programme on Mondays → no dates, explained', r.code === 200 && r.body.data.errors.some((e) => e.line === 0 && /No Network News dates/.test(e.message)), JSON.stringify(r.body.data?.errors));
    r = await call(U.ownerA, 'POST', '/api/v1/media-plans/quote', planOf('companyA', [newsLine, { ...newsLine, rateId: String(news60._id) }], adA._id));
    check('Q5  30s and 60s of the same programme in one plan → refused (one length per programme)', r.code === 200 && r.body.data.errors.some((e) => e.line === 1 && /One spot length per programme/.test(e.message)), JSON.stringify(r.body.data?.errors));
    r = await call(U.indiv, 'POST', '/api/v1/media-plans/quote', planOf('ivy', [newsLine], adIvy._id));
    check('Q6  A brand (not an agency) pays no agency commission: net ₦577,800', r.code === 200 && r.body.data.isAgency === false && r.body.data.lines[0].unit.agencyCommission === 0 && r.body.data.lines[0].unit.net === 577800, JSON.stringify(r.body.data?.lines?.[0]?.unit));
    const driveLine = { stationId: String(S.fm2._id), rateId: String(drive30._id), days: [1, 2, 3, 4, 5], spotsPerDay: 2, startDate: day(8), endDate: day(35) };
    r = await call(U.ownerA, 'POST', '/api/v1/media-plans/quote', planOf('companyA', [{ ...driveLine, endDate: day(400) }], adA._id));
    check('Q7  Line dates outside the campaign → error', r.code === 200 && r.body.data.errors.some((e) => /inside the campaign/.test(e.message)), JSON.stringify(r.body.data?.errors));
    r = await call(U.ownerA, 'POST', '/api/v1/media-plans/quote', planOf('companyA', [newsLine, driveLine], adA._id));
    const weekdays = countDays(day(8), day(35), [1, 2, 3, 4, 5]);
    const q2 = r.body.data.lines[1];
    const planTotal = r.body.data.totals.total;
    check(`Q8  Radio weekdays, 2 a day for 4 weeks → ${weekdays * 2} spots at ₦50,000 − 15% (programme discount) − 15% + VAT`, q2?.spots === weekdays * 2 && q2.unit.volumeDiscountPercent === 15 && q2.unit.net === 36125 && q2.unit.total === 38834.38, JSON.stringify(q2?.unit));

    // ── C: checkout holds the whole plan ──
    r = await call(U.ownerA, 'POST', '/api/v1/media-plans/checkout', planOf('companyA', [newsLine, driveLine], adA._id));
    check('C1  Not enough in the wallet → 402 with the shortfall; nothing booked', r.code === 402 && r.body.code === 'WALLET_INSUFFICIENT' && r.body.data.shortfall === planTotal && db.bookings.length === 0, `${r.code} ${r.body.message}`);
    await call(U.ownerA, 'POST', '/api/v1/wallet/fund', { amount: Math.ceil(planTotal) + 100000 });
    r = await call(U.ownerA, 'POST', '/api/v1/media-plans/checkout', planOf('companyA', [newsLine, driveLine], 'x'));
    check('C2  An advert is required (approved, with ARCON) → 400, nothing held', r.code === 400 && walletOf({ companyId: A }).held === 0, `${r.code} ${r.body.message}`);
    r = await call(U.ownerA, 'POST', '/api/v1/media-plans/checkout', planOf('companyA', [newsLine, driveLine], adA._id));
    const wA = walletOf({ companyId: A });
    const planBookings = db.bookings.filter((b) => eq(b.campaignId, CP.companyA._id));
    const planPay = db.payments.find((p) => eq(p.campaignId, CP.companyA._id));
    check(`C3  Plan booked: ${thursdays + weekdays * 2} spots, the whole ₦${planTotal.toLocaleString()} on hold, ₦100,000 left to spend`, r.code === 201 && planBookings.length === thursdays + weekdays * 2 && wA.held === planTotal && r2(wA.balance) === r2(Math.ceil(planTotal) + 100000 - planTotal) && planPay?.provider === "WALLET" && planPay.amount === planTotal, `${r.code} ${r.body.message}`);
    const news = planBookings.filter((b) => eq(b.stationId, S.fm1._id)).sort((a, b) => a.date - b.date);
    check('C4  Every spot is its own booking on the right day and time, holding its exact price', news.every((b) => new Date(b.date).getUTCDay() === 4 && b.time === '21:00' && b.escrow.status === 'HELD' && b.escrow.amount === 527964.75 && b.pricing.net === 491130 && b.status === 'PENDING'), JSON.stringify(news[0]?.pricing));
    check('C5  Each media house gets one order message, not one per spot', db.notifications.filter((n) => eq(n.userId, U.station) && /New order/.test(n.title)).length === 1);

    // ── O: the media house accepts the whole order ──
    r = await call(U.station, 'PATCH', `/api/v1/station-portal/orders/${planPay._id}/accept`, { note: 'Confirmed for the whole run' });
    check(`O1  Media house accepts its whole order at once (${thursdays} spots); the radio station's spots are untouched`, r.code === 200 && r.body.data.accepted === thursdays && news.every((b) => bk(b._id).status === 'ACCEPTED') && planBookings.filter((b) => eq(b.stationId, S.fm2._id)).every((b) => bk(b._id).status === 'PENDING'), `${r.code} ${r.body.message}`);
    check('O2  The agency gets one "accepted" message', db.notifications.filter((n) => eq(n.userId, U.ownerA) && /accepted/.test(n.title)).length === 1);

    // ── D: daily confirmation and daily payment ──
    const past = new Date(Date.now() - 2 * 864e5);
    const pastDay = new Date(Date.UTC(past.getUTCFullYear(), past.getUTCMonth(), past.getUTCDate()));
    const pastStr = pastDay.toISOString().slice(0, 10);
    bk(news[0]._id).date = pastDay; // the first Thursday has aired
    r = await call(U.station, 'PATCH', `/api/v1/station-portal/stations/${S.fm1._id}/aired-day`, { date: pastStr });
    check("D1  Marking a day aired needs that day's TX log and clip → 400", r.code === 400 && r.body.code === 'PROOF_REQUIRED', `${r.code} ${r.body.message}`);
    r = await call(U.station, 'PATCH', `/api/v1/station-portal/stations/${S.fm1._id}/aired-day`, { date: day(30) });
    check('D2  A day that has not aired yet → 400', r.code === 400, `${r.code}`);
    r = await call(U.station, 'PATCH', `/api/v1/station-portal/stations/${S.fm1._id}/aired-day`, { date: pastStr, logUploadId: makeUpload(U.station, 'PROOF_LOG'), clipUploadId: makeUpload(U.station, 'PROOF_CLIP', 'video/mp4') });
    check('D3  One TX log + clip marks the day aired: the spot is AIRED, money still held during the check window', r.code === 200 && r.body.data.aired === 1 && bk(news[0]._id).status === 'COMPLETED' && bk(news[0]._id).escrow.status === 'AIRED' && walletOf({ companyId: A }).held === planTotal, `${r.code} ${r.body.message}`);
    check('D4  The agency is told that day aired and how long it has to check', db.notifications.some((n) => eq(n.userId, U.ownerA) && /aired/.test(n.title) && /dispute/i.test(n.body)));
    r = await runSettlementJob(new Date(Date.now() + 19 * 3600000));
    const earned = walletOf({ stationId: S.fm1._id });
    check("D5  After the 18-hour window that day's money moves: ₦527,964.75 spent from the agency, ₦491,130 (net) to the media house", r.released === 1 && bk(news[0]._id).escrow.status === 'RELEASED' && earned?.balance === 491130 && walletOf({ companyId: A }).totalSpent === 527964.75 && r2(walletOf({ companyId: A }).held) === r2(planTotal - 527964.75), `${JSON.stringify(r)} ${earned?.balance}`);

    // A declined radio spot is refunded at its exact plan price.
    const drive = planBookings.filter((b) => eq(b.stationId, S.fm2._id));
    const avail = walletOf({ companyId: A }).balance;
    r = await call(U.admin, 'PATCH', `/api/v1/bookings/${drive[0]._id}/reject`, { note: 'Belt sold out that day' });
    check('D6  A declined spot comes back at exactly what it cost in the plan (₦38,834.38)', r.code === 200 && r2(walletOf({ companyId: A }).balance - avail) === 38834.38 && bk(drive[0]._id).escrow.status === 'REFUNDED', `${r.code} ${r.body.message} ${r2(walletOf({ companyId: A }).balance - avail)}`);

    // ── T: campaign tracker ──
    r = await call(U.ownerA, 'GET', `/api/v1/campaigns/${CP.companyA._id}/tracker`);
    const tNews = (r.body.data?.stations || []).find((s) => eq(s.station._id, S.fm1._id));
    const tDrive = (r.body.data?.stations || []).find((s) => eq(s.station._id, S.fm2._id));
    check('T1  Tracker per media house: planned, aired, upcoming; money spent and still held', r.code === 200 && tNews?.planned === thursdays && tNews.aired === 1 && tNews.upcoming === thursdays - 1 && tNews.spent === 527964.75 && tDrive?.cancelled === 1 && tDrive.planned === weekdays * 2, `${r.code} ${JSON.stringify(tNews)}`);
    check('T2  Tracker totals add up: held + spent + refunded = what was booked', r2(r.body.data.totals.held + r.body.data.totals.spent + r.body.data.totals.refunded) === r2(r.body.data.totals.booked) && r2(r.body.data.totals.booked) === r2(planTotal), JSON.stringify(r.body.data?.totals));
    r = await call(U.indiv, 'GET', `/api/v1/campaigns/${CP.companyA._id}/tracker`);
    check("T3  Another advertiser can't see the tracker → 404", r.code === 404, `${r.code}`);

    server.close();
    const passed = results.filter(Boolean).length;
    out(`\nMEDIA PLAN: ${passed}/${results.length} passed`);
    process.exit(passed === results.length ? 0 : 1);
})().catch((e) => { out(`CRASH ${e.stack}`); out(logs.slice(-15).join('\n')); process.exit(1); });
