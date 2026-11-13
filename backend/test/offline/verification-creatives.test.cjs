// Verification + adverts harness — offline: sign-up as media client / agency / media house, verification
// (CAC number, TIN, documents, a media house's rates), admin approve/reject, checkout priced from the rate card
// with an ARCON-cleared advert on every spot and VAT, the media house viewing the advert, Enterprise requests.
// Same in-memory harness as features.test.cjs; upload storage stubbed with the real claim rules. No database.
'use strict';
process.env.JWT_SECRET = 'features-harness-dummy-secret';
process.env.JWT_EXPIRE = '5m';
// The defaults, set explicitly so a local .env cannot change them:
process.env.SUBSCRIPTION_REQUIRED = 'false'; // booking needs no plan
process.env.REQUIRE_CREATIVE = 'true'; // every spot needs an ARCON-cleared advert
process.env.VAT_PERCENT = '7.5'; // VAT
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
const documentStorage = src('utils/documentStorage');
const { Readable } = require('stream');
const payments = src('utils/payments');

// ── Upload storage (GridFS) stand-in: same rules as utils/fileUploads.claimUpload ──
const fileUploads = src('utils/fileUploads');
const uploadsStore = new Map();
const deleted = [];
const makeUpload = (owner, purpose, contentType = purpose === 'VIDEO' ? 'video/mp4' : 'application/pdf') => {
    const id = String(new mongoose.Types.ObjectId());
    uploadsStore.set(id, { owner: String(owner), purpose, contentType, claimed: false, fileId: new mongoose.Types.ObjectId(), name: 'file.pdf' });
    return id;
};
fileUploads.claimUpload = async (user, uploadId, purpose) => {
    const u = uploadsStore.get(String(uploadId));
    if (!u || u.owner !== String(user._id || user.id) || u.purpose !== purpose || u.claimed) return { error: 'That file upload was not found or is already in use. Upload it again.' };
    u.claimed = true;
    return { file: { uploadId, fileId: u.fileId, name: u.name, contentType: u.contentType, size: 2048, purpose } };
};
fileUploads.deleteFile = async (bucket, fileId) => { deleted.push(String(fileId)); };
fileUploads.sendFile = async (res, bucket, fileId) => res.json({ served: String(fileId), bucket });
// Status counts for the admin queue (group by status).
const VerificationModel = src('models/Verification');
// Enterprise requests are read back from the audit log.
src('models/AuditLog').find = (f) => q(src('models/AuditLog'), () => db.audit.filter((r) => r.action === f.action).reverse());
VerificationModel.aggregate = async () => Object.entries(db.verifications.reduce((t, v) => ({ ...t, [v.status]: (t[v.status] || 0) + 1 }), {})).map(([_id, n]) => ({ _id, n }));

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
const C = { users: User, employees: Employee, companies: Company, campaigns: Campaign, stations: Station, bookings: Booking, payments: Payment, creatives: Creative, plans: Plan, subscriptions: Subscription, notifications: Notification, verifications: Verification };
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
    M.exists = async (f) => (db[c].some((d) => matches(d, f)) ? { _id: true } : null);
    M.findByIdAndDelete = async (id) => { const o = db[c].find((d) => eq(d._id, id)); db[c] = db[c].filter((d) => !eq(d._id, id)); return o || null; };
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
        bookings: [], payments: [], creatives: [], audit: [], plans: [], subscriptions: [], notifications: [], verifications: [],
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

    const { registerLimiter, loginLimiter } = src('middleware/rateLimit');
    const register = (body) => { registerLimiter.reset(); return call(null, 'POST', '/api/v1/auth/register', body); };
    const login = (email, password) => { loginLimiter?.reset?.(); return call(null, 'POST', '/api/v1/auth/login', { email, password }); };
    const PW = 'Media-Pass-2026!';
    const userBy = (email) => db.users.find((x) => x.email === email);
    const verOf = (email) => db.verifications.find((v) => eq(v.userId, userBy(email)?._id));
    const auth = (email) => ({ Authorization: `Bearer ${tok(userBy(email)._id)}` });
    const as = (email, method, url, body) => call(null, method, url, body, auth(email));
    const goodDetails = { businessName: 'Sunrise Foods Ltd', registrationNumber: 'RC 1234567', taxId: '12345678-0001', address: '1 Allen Avenue, Ikeja' };

    // ── R: sign-up as media client / agency / media house ──
    let r = await register({ accountType: 'client', companyName: 'Sunrise Foods Ltd', name: 'Ada Okafor', email: 'ada@sunrise.example.com', password: PW });
    const ada = userBy('ada@sunrise.example.com');
    const adaCo = db.companies.find((c) => eq(c._id, ada?.companyId));
    check('R1  Media client signs up → 201 with a token; company CLIENT, owner PENDING, verification DRAFT', r.code === 201 && !!r.body.token && r.body.data.user.status === 'PENDING' && adaCo?.companyType === 'CLIENT' && adaCo.status === 'PENDING' && verOf(ada.email)?.status === 'DRAFT' && verOf(ada.email).accountKind === 'CLIENT', `${r.code} ${r.body.message}`);
    r = await register({ accountType: 'agency', companyName: 'Bluewave Media', name: 'Tunde Bello', email: 'tunde@bluewave.example.com', password: PW });
    const tundeCo = db.companies.find((c) => eq(c._id, userBy('tunde@bluewave.example.com')?.companyId));
    check('R2  Media agency signs up → company AGENCY, verification AGENCY', r.code === 201 && tundeCo?.companyType === 'AGENCY' && verOf('tunde@bluewave.example.com')?.accountKind === 'AGENCY', `${r.code}`);
    r = await register({ accountType: 'media_house', companyName: 'Wave TV', name: 'Kemi Ade', email: 'kemi@wavetv.example.com', password: PW, mediaType: 'tv', state: 'Lagos', city: 'Lekki' });
    const kemi = userBy('kemi@wavetv.example.com');
    const waveTv = db.stations.find((x) => x.name === 'Wave TV');
    check('R3  Media house signs up → STATION account PENDING; its station PENDING, inactive, managed by it; verification MEDIA_HOUSE', r.code === 201 && kemi?.accountType === 'STATION' && kemi.status === 'PENDING' && waveTv?.approvalStatus === 'PENDING' && waveTv.isActive === false && waveTv.type === 'TV' && waveTv.managerIds.some((m) => eq(m, kemi._id)) && eq(verOf(kemi.email)?.stationId, waveTv._id), `${r.code} ${r.body.message}`);
    r = await register({ accountType: 'media_house', companyName: 'No Type FM', name: 'X', email: 'x@notype.example.com', password: PW });
    check('R4  Media house without what it runs → 400, nothing created', r.code === 400 && !userBy('x@notype.example.com'), `${r.code}`);
    r = await register({ accountType: 'client', companyName: 'Other', name: 'Y', email: 'y@other.example.com', password: PW, mediaType: 'TV' });
    check('R5  mediaType is refused for a non-media-house sign-up → 400', r.code === 400, `${r.code}`);

    // ── L: a business awaiting approval signs in only to its verification ──
    // (the in-memory store skips the password-hashing save hook, so hash it here as the real model would)
    userBy('ada@sunrise.example.com').password = require(path.join(BACKEND, 'node_modules', 'bcryptjs')).hashSync(PW, 4);
    r = await login('ada@sunrise.example.com', PW);
    check('L1  Pending business signs in → 200, status PENDING (lands on /verify)', r.code === 200 && r.body.data.user.status === 'PENDING' && !!r.body.token, `${r.code} ${r.body.message}`);
    r = await as(ada.email, 'GET', '/api/v1/campaigns');
    check('L2  …but other routes answer 403 VERIFICATION_REQUIRED', r.code === 403 && r.body.code === 'VERIFICATION_REQUIRED', `${r.code} ${r.body.code}`);
    r = await as(ada.email, 'GET', '/api/v1/auth/me');
    check('L3  Its profile (/auth/me) is available', r.code === 200, `${r.code}`);
    r = await as(ada.email, 'POST', '/api/v1/uploads', { purpose: 'CREATIVE', name: 'ad.mp4', contentType: 'video/mp4', size: 1000 });
    check('L4  It cannot start an advert upload while pending → 403', r.code === 403, `${r.code}`);

    // ── V: the verification itself ──
    r = await as(ada.email, 'GET', '/api/v1/verification');
    check('V1  Verification lists what is still needed (CAC number, TIN, certificate)', r.code === 200 && r.body.data.missing.includes('CAC registration number') && r.body.data.missing.includes('Tax Identification Number (TIN)') && r.body.data.missing.includes('CAC certificate'), `${r.code} ${JSON.stringify(r.body.data?.missing)}`);
    r = await as(ada.email, 'PUT', '/api/v1/verification', { ...goodDetails, registrationNumber: 'ABC' });
    check('V2  A malformed CAC number → 400 on registrationNumber', isContract(r, 'registrationNumber'), `${r.code}`);
    r = await as(ada.email, 'PUT', '/api/v1/verification', { ...goodDetails, taxId: '12' });
    check('V3  A malformed TIN → 400 on taxId', isContract(r, 'taxId'), `${r.code}`);
    r = await as(ada.email, 'PUT', '/api/v1/verification', { ...goodDetails, status: 'APPROVED' });
    check('V4  The status cannot be set by the business → 400', r.code === 400 && verOf(ada.email).status === 'DRAFT', `${r.code}`);
    r = await as(ada.email, 'PUT', '/api/v1/verification', goodDetails);
    check('V5  Valid details saved (CAC number upper-cased)', r.code === 200 && verOf(ada.email).registrationNumber === 'RC 1234567' && verOf(ada.email).taxId === '12345678-0001', `${r.code} ${r.body.message}`);
    r = await as(ada.email, 'POST', '/api/v1/verification/submit');
    check('V6  Submit without the CAC certificate → 400 "Still needed: CAC certificate", stays DRAFT', r.code === 400 && /CAC certificate/.test(r.body.message) && verOf(ada.email).status === 'DRAFT', `${r.code} ${r.body.message}`);
    r = await as(ada.email, 'POST', '/api/v1/verification/documents', { kind: 'CAC_CERTIFICATE', uploadId: makeUpload(U.indiv, 'VERIFICATION') });
    check("V7  Someone else's upload cannot be attached → 400", r.code === 400, `${r.code}`);
    r = await as(ada.email, 'POST', '/api/v1/verification/documents', { kind: 'PASSPORT_PHOTO', uploadId: makeUpload(ada._id, 'VERIFICATION') });
    check('V8  Unknown document kind → 400', r.code === 400, `${r.code}`);
    const cert1 = makeUpload(ada._id, 'VERIFICATION');
    r = await as(ada.email, 'POST', '/api/v1/verification/documents', { kind: 'CAC_CERTIFICATE', uploadId: cert1 });
    check('V9  CAC certificate attached → 201', r.code === 201 && verOf(ada.email).documents.length === 1, `${r.code} ${r.body.message}`);
    deleted.length = 0;
    r = await as(ada.email, 'POST', '/api/v1/verification/documents', { kind: 'CAC_CERTIFICATE', uploadId: makeUpload(ada._id, 'VERIFICATION') });
    check('V10 A new CAC certificate replaces the old one (old file removed)', r.code === 201 && verOf(ada.email).documents.length === 1 && deleted.includes(String(uploadsStore.get(cert1).fileId)), `${r.code}`);
    const adminsBefore = db.notifications.filter((n) => eq(n.userId, U.admin)).length;
    r = await as(ada.email, 'POST', '/api/v1/verification/submit');
    check('V11 Submit → SUBMITTED, admins notified, SUBMIT_VERIFICATION audited', r.code === 200 && verOf(ada.email).status === 'SUBMITTED' && db.notifications.filter((n) => eq(n.userId, U.admin)).length === adminsBefore + 1 && db.audit.some((a) => a.action === 'SUBMIT_VERIFICATION'), `${r.code} ${r.body.message}`);
    r = await as(ada.email, 'PUT', '/api/v1/verification', goodDetails);
    check('V12 While under review the details are locked → 409', r.code === 409, `${r.code}`);

    // A company that signed up before verification existed (no record yet) gets one on its first visit.
    const legacyCo = OID(), legacyUser = OID();
    db.companies.push({ _id: legacyCo, name: 'Old Agency Ltd', slug: 'old-agency', email: 'old@agency.example.com', companyType: 'AGENCY', status: 'PENDING' });
    db.users.push({ _id: legacyUser, email: 'old@agency.example.com', name: 'Old Owner', accountType: 'COMPANY', status: 'PENDING', companyId: legacyCo, tokenVersion: 0 });
    r = await call(legacyUser, 'GET', '/api/v1/verification');
    check('V13 An older pending company with no record gets one on its first visit (no dead end)', r.code === 200 && r.body.data.accountKind === 'AGENCY' && r.body.data.businessName === 'Old Agency Ltd' && r.body.data.status === 'DRAFT', `${r.code} ${r.body.message || ''}`);

    // ── A: admin review ──
    r = await as('ivy@example.com', 'GET', '/api/v1/admin/verifications');
    check('A1  Non-admin cannot list verifications → 403', r.code === 403, `${r.code}`);
    r = await call(U.admin, 'GET', '/api/v1/admin/verifications');
    check('A2  Admin queue (SUBMITTED) shows the media client with its CAC number', r.code === 200 && r.body.data.some((v) => v.businessName === 'Sunrise Foods Ltd' && v.registrationNumber === 'RC 1234567') && r.body.counts.SUBMITTED === 1, `${r.code}`);
    const adaVer = verOf(ada.email);
    r = await call(U.admin, 'GET', `/api/v1/admin/verifications/${adaVer._id}`);
    check('A3  Admin opens the record: details, documents, account and company', r.code === 200 && r.body.data.documents.length === 1 && r.body.data.user.email === ada.email && r.body.data.company?.companyType === 'CLIENT', `${r.code}`);
    r = await call(U.admin, 'GET', `/api/v1/admin/verifications/${adaVer._id}/documents/${adaVer.documents[0]._id}/file`);
    check('A4  Admin opens the CAC certificate (served from the verification store)', r.code === 200 && r.body.bucket === 'verification', `${r.code}`);
    r = await call(U.admin, 'POST', `/api/v1/admin/verifications/${adaVer._id}/reject`, { reason: 'no' });
    check('A5  Reject without a real reason → 400', r.code === 400 && verOf(ada.email).status === 'SUBMITTED', `${r.code}`);
    r = await call(U.admin, 'POST', `/api/v1/admin/verifications/${adaVer._id}/reject`, { reason: 'The CAC certificate is unreadable; please upload a clear scan.' });
    check('A6  Reject with a reason → REJECTED; the account stays PENDING; the business is told why', r.code === 200 && verOf(ada.email).status === 'REJECTED' && userBy(ada.email).status === 'PENDING' && db.notifications.some((n) => eq(n.userId, ada._id) && /unreadable/.test(n.body)), `${r.code}`);
    r = await as(ada.email, 'POST', '/api/v1/verification/documents', { kind: 'CAC_CERTIFICATE', uploadId: makeUpload(ada._id, 'VERIFICATION') });
    const resub = await as(ada.email, 'POST', '/api/v1/verification/submit');
    check('A7  After a rejection it can fix and submit again (no dead end)', r.code === 201 && resub.code === 200 && verOf(ada.email).status === 'SUBMITTED', `${r.code}/${resub.code}`);
    r = await call(U.admin, 'POST', `/api/v1/admin/verifications/${adaVer._id}/approve`);
    check('A8  Approve → APPROVED; company APPROVED; owner ACTIVE; owner notified', r.code === 200 && verOf(ada.email).status === 'APPROVED' && db.companies.find((c) => eq(c._id, ada.companyId)).status === 'APPROVED' && userBy(ada.email).status === 'ACTIVE' && db.notifications.some((n) => eq(n.userId, ada._id) && /verified/.test(n.title)), `${r.code} ${r.body.message}`);
    const adaAlerts = db.notifications.filter((n) => n.ref === `verification:${adaVer._id}`);
    check('A8b The admins "please verify" alerts for this business are marked read (bell count drops)', adaAlerts.length >= 1 && adaAlerts.every((n) => n.readAt), `${adaAlerts.length} alerts`);
    r = await call(U.admin, 'POST', `/api/v1/admin/verifications/${adaVer._id}/approve`);
    check('A9  Approving twice → 409', r.code === 409, `${r.code}`);
    r = await as(ada.email, 'GET', '/api/v1/campaigns');
    check('A10 The approved client now uses the platform (campaigns → 200)', r.code === 200, `${r.code} ${r.body.message}`);

    // ── M: media house verification (rates entered on the platform) ──
    await as(kemi.email, 'PUT', '/api/v1/verification', { ...goodDetails, businessName: 'Wave TV Ltd' });
    await as(kemi.email, 'POST', '/api/v1/verification/documents', { kind: 'CAC_CERTIFICATE', uploadId: makeUpload(kemi._id, 'VERIFICATION') });
    r = await as(kemi.email, 'POST', '/api/v1/verification/submit');
    check('M1  Media house cannot submit without its rate card document and its rates', r.code === 400 && /Rate card document/.test(r.body.message) && /rates/.test(r.body.message), `${r.code} ${r.body.message}`);
    r = await as(kemi.email, 'PUT', '/api/v1/verification/rate-card', { rates: [
        { name: 'Prime (AAA)', kind: 'TIME_BELT', code: 'AAA', startTime: '19:00', endTime: '22:00', spotSeconds: 60, price: 90000 },
        { name: 'Prime (AAA)', kind: 'TIME_BELT', code: 'AAA', startTime: '19:00', endTime: '22:00', spotSeconds: 30, price: 50000 },
    ] });
    check('M2  It enters its rates while pending: one belt in two spot lengths (60s, 30s)', r.code === 200 && db.stations.find((x) => eq(x._id, waveTv._id)).rateCard.length === 2, `${r.code} ${r.body.message}`);
    r = await as(kemi.email, 'PUT', '/api/v1/verification/rate-card', { rates: [
        { name: 'Prime (AAA)', kind: 'TIME_BELT', startTime: '19:00', endTime: '22:00', spotSeconds: 30, price: 1 },
        { name: 'Prime (AAA)', kind: 'TIME_BELT', startTime: '19:00', endTime: '22:00', spotSeconds: 30, price: 2 },
    ] });
    check('M3  The same belt and length twice → 400', r.code === 400 && /listed twice/.test(r.body.message), `${r.code} ${r.body.message}`);
    await as(kemi.email, 'POST', '/api/v1/verification/documents', { kind: 'RATE_CARD', uploadId: makeUpload(kemi._id, 'VERIFICATION') });
    r = await as(kemi.email, 'POST', '/api/v1/verification/submit');
    check('M4  With CAC number, TIN, certificate, rate card and rates → SUBMITTED', r.code === 200 && verOf(kemi.email).status === 'SUBMITTED', `${r.code} ${r.body.message}`);
    r = await as(kemi.email, 'GET', '/api/v1/station-portal/stations');
    check('M5  Before approval the station desk is closed → 403 VERIFICATION_REQUIRED', r.code === 403 && r.body.code === 'VERIFICATION_REQUIRED', `${r.code}`);
    r = await call(U.admin, 'POST', `/api/v1/admin/verifications/${verOf(kemi.email)._id}/approve`);
    const waveAfter = db.stations.find((x) => eq(x._id, waveTv._id));
    check('M6  Approve → station APPROVED and live; media house account ACTIVE', r.code === 200 && waveAfter.approvalStatus === 'APPROVED' && waveAfter.isActive === true && userBy(kemi.email).status === 'ACTIVE', `${r.code} ${r.body.message}`);
    r = await as(kemi.email, 'GET', '/api/v1/station-portal/stations');
    check('M7  The approved media house runs its own station desk', r.code === 200 && (r.body.data || []).some((x) => eq(x._id, waveTv._id)), `${r.code}`);

    // ── C: checkout — rate card price, ARCON-cleared advert, VAT ──
    const fm1 = db.stations.find((x) => eq(x._id, S.fm1._id));
    fm1.managerIds = [U.station];
    fm1.rateCard = [
        { _id: OID(), name: 'Run of spot (7pm–12am)', kind: 'TIME_BELT', code: 'ROS', startTime: '19:00', endTime: '00:00', spotSeconds: 30, price: 80000, isActive: true },
        { _id: OID(), name: 'Within Your View', kind: 'PLACEMENT', code: 'PROG', spotSeconds: 15, price: 125000, isActive: true },
    ];
    const [ros30, yourView15] = fm1.rateCard;
    const creative = (over = {}) => { const c = { _id: OID(), campaignId: CP.ivy._id, name: 'Launch spot', type: 'VIDEO', fileId: OID(), status: 'APPROVED', uploadedBy: String(U.indiv), arcon: { certificateNumber: 'ARCON/2026/7', fileId: OID(), fileName: 'arcon.pdf' }, ...over }; db.creatives.push(c); return c; };
    const ok = creative();
    const rateItem = (rate, over = {}) => ({ stationId: String(S.fm1._id), slot: 'X', date: D10, rateId: String(rate._id), creativeId: String(ok._id), ...over });

    r = await pay(U.indiv, 'ivy', [rateItem(ros30, { creativeId: undefined })]);
    check('C1  No advert chosen → 400 "Choose the advert", nothing charged', isContract(r, 'items.0') && /Choose the advert/.test(r.body.message) && providerCalls.charge.length === 0, `${r.code} ${r.body.message}`);
    r = await pay(U.indiv, 'ivy', [rateItem(ros30, { creativeId: String(creative({ status: 'PENDING' })._id) })]);
    check('C2  Advert still waiting for team approval → 400', isContract(r, 'items.0') && /waiting for approval/.test(r.body.message), `${r.code} ${r.body.message}`);
    r = await pay(U.indiv, 'ivy', [rateItem(ros30, { creativeId: String(creative({ arcon: { certificateNumber: null, fileId: null } })._id) })]);
    check('C3  Advert without its ARCON certificate → 400', isContract(r, 'items.0') && /ARCON certificate/.test(r.body.message), `${r.code} ${r.body.message}`);
    r = await pay(U.indiv, 'ivy', [rateItem(ros30, { creativeId: String(creative({ campaignId: CP.ian._id })._id) })]);
    check("C4  Another campaign's advert → 400", isContract(r, 'items.0') && /not part of this campaign/.test(r.body.message), `${r.code} ${r.body.message}`);
    r = await pay(U.indiv, 'ivy', [rateItem(ros30, { time: '03:00', duration: 999 }), rateItem(yourView15)]);
    const [b1, b2] = db.bookings;
    const p = db.payments[0];
    check('C5  Checkout → 201 without any subscription (plans are optional now)', r.code === 201 && db.subscriptions.length === 0, `${r.code} ${r.body.message}`);
    check('C6  Belt spot: time and length come from the rate (19:00 to midnight, 30 s), not from the client', b1 && b1.time === '19:00' && b1.duration === 300 && b1.spotSeconds === 30 && b1.price === 80000 && b1.rateName === 'Run of spot (7pm–12am)', `${b1?.time}/${b1?.duration}/${b1?.spotSeconds}`);
    check('C7  In-programme spot booked for the day (placed by the station), 15 s at ₦125,000', b2 && b2.slot === 'PROGRAMME' && b2.spotSeconds === 15 && b2.price === 125000, `${b2?.slot}/${b2?.spotSeconds}`);
    check('C8  Each booking carries the advert to air', eq(b1?.creativeId, ok._id) && eq(b2?.creativeId, ok._id));
    check('C9  VAT 7.5% added: ₦205,000 + ₦15,375 = ₦220,375 charged (spot prices unchanged)', p && p.subtotal === 205000 && p.vatPercent === 7.5 && p.vat === 15375 && p.amount === 220375 && providerCalls.charge.at(-1).amount === 220375 && r.body.data.payment.vat === 15375, `${p?.subtotal}/${p?.vat}/${p?.amount}`);
    r = await pay(U.indiv, 'ivy', [rateItem(ros30)]);
    check('C10 Another advert in the same belt and day also books (spots share the belt)', r.code === 201 && db.bookings.length === 3, `${r.code} ${r.body.message}`);
    // Day rules: a weekday-only rate cannot be booked on a Sunday.
    const weekdayRate = { _id: OID(), name: 'Weekday breakfast', kind: 'TIME_BELT', startTime: '06:00', endTime: '10:00', spotSeconds: 30, days: [1, 2, 3, 4, 5], price: 10000, isActive: true };
    fm1.rateCard.push(weekdayRate);
    const nextDay = (wd) => { const d = new Date(Date.now() + 2 * 864e5); while (d.getUTCDay() !== wd) d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
    r = await pay(U.indiv, 'ivy', [rateItem(weekdayRate, { date: nextDay(0) })]);
    check('C10b A Mon–Fri rate on a Sunday → 400 "only sold on Monday–Friday"', isContract(r, 'items.0') && /only sold on Monday–Friday/.test(r.body.message), `${r.code} ${r.body.message}`);
    r = await pay(U.indiv, 'ivy', [rateItem(weekdayRate, { date: nextDay(1) })]);
    check('C10c …and books on a Monday', r.code === 201, `${r.code} ${r.body.message}`);
    process.env.VAT_PERCENT = '0';
    r = await pay(U.indiv, 'ivy', [rateItem(yourView15)]);
    check('C11 VAT_PERCENT=0 turns VAT off (₦125,000 charged)', r.code === 201 && db.payments.at(-1).vat === 0 && db.payments.at(-1).amount === 125000, `${r.code}`);
    process.env.VAT_PERCENT = '7.5';

    // ── S: the media house sees the advert and its ARCON certificate ──
    r = await call(U.station, 'GET', `/api/v1/bookings/${b1._id}/creative`);
    check('S1  Station manager plays the booked advert', r.code === 200 && r.body.served === String(ok.fileId) && r.body.bucket === 'creatives', `${r.code}`);
    r = await call(U.station, 'GET', `/api/v1/bookings/${b1._id}/creative?which=arcon`);
    check('S2  …and opens its ARCON certificate', r.code === 200 && r.body.served === String(ok.arcon.fileId), `${r.code}`);
    r = await as(kemi.email, 'GET', `/api/v1/bookings/${b1._id}/creative`);
    check("S3  Another media house cannot see this station's adverts → 404", r.code === 404 && !r.body.served, `${r.code}`);
    r = await call(U.indiv, 'GET', `/api/v1/bookings/${b1._id}/creative`);
    check('S4  An advertiser cannot use the station route → 403', r.code === 403, `${r.code}`);

    // ── RS: rescheduling — the station asks for another date; the advertiser moves the spot ──
    r = await call(U.station, 'PATCH', `/api/v1/bookings/${b2._id}/request-changes`, { note: 'That day is fully booked', proposedDate: D11 });
    const b2a = db.bookings.find((b) => eq(b._id, b2._id));
    check('RS1 Station asks to reschedule with a suggested date → CHANGES_REQUESTED, date suggested', r.code === 200 && b2a.status === 'CHANGES_REQUESTED' && b2a.proposedDate && new Date(b2a.proposedDate).toISOString().slice(0, 10) === D11, `${r.code} ${r.body.message}`);
    r = await call(U.station, 'PATCH', `/api/v1/bookings/${b1._id}/request-changes`, { proposedDate: '2000-01-01' });
    check('RS2 A suggested date in the past → 400', r.code === 400, `${r.code}`);
    r = await call(U.indiv, 'PATCH', `/api/v1/bookings/${b2._id}/resubmit`, { date: D11 });
    const b2b = db.bookings.find((b) => eq(b._id, b2._id));
    check('RS3 Advertiser resubmits on the new date → PENDING on that date, suggestion cleared', r.code === 200 && b2b.status === 'PENDING' && new Date(b2b.date).toISOString().slice(0, 10) === D11 && !b2b.proposedDate, `${r.code} ${r.body.message}`);

    // ── E: Enterprise request (the one plan offered in the dashboard) ──
    r = await call(U.indiv, 'POST', '/api/v1/subscriptions/enterprise-request', { message: 'hi' });
    check('E1  Too short a request → 400', r.code === 400, `${r.code}`);
    const adminNotes = db.notifications.filter((n) => eq(n.userId, U.admin)).length;
    r = await call(U.indiv, 'POST', '/api/v1/subscriptions/enterprise-request', { message: 'We plan national campaigns on 12 stations every quarter.', phone: '08030000000' });
    check('E2  Enterprise request → 201; admins notified with the contact; REQUEST_ENTERPRISE audited', r.code === 201 && db.notifications.filter((n) => eq(n.userId, U.admin)).length === adminNotes + 1 && db.audit.some((a) => a.action === 'REQUEST_ENTERPRISE'), `${r.code} ${r.body.message}`);
    r = await call(U.admin, 'GET', '/api/v1/admin/enterprise-requests');
    const req1 = (r.body.data || [])[0];
    check('E2b Admin sees the request with its message and contact, not yet handled', r.code === 200 && req1?.message?.includes('12 stations') && req1.phone === '08030000000' && req1.email === 'ivy@example.com' && !req1.handledAt, `${r.code}`);
    r = await call(U.admin, 'POST', '/api/v1/admin/subscriptions', { email: 'ivy@example.com', planCode: 'ENTERPRISE', interval: 'ANNUAL', price: 2500000 });
    const after = await call(U.admin, 'GET', '/api/v1/admin/enterprise-requests');
    const alerts = db.notifications.filter((n) => n.ref === `enterprise:${U.indiv}`);
    check('E2c Setting up Enterprise marks the request handled and clears the admin alerts', r.code === 201 && !!after.body.data[0].handledAt && alerts.length >= 1 && alerts.every((n) => n.readAt), `${r.code} ${r.body.message}`);
    r = await call(U.staffA, 'POST', '/api/v1/subscriptions/enterprise-request', { message: 'Please set up Enterprise for us.' });
    check('E3  A team member cannot request for the company (owner only) → 403', r.code === 403, `${r.code}`);
    r = await call(null, 'GET', '/api/v1/plans');
    check('E4  Plans report that a subscription is not required to book', r.code === 200 && r.body.data.subscriptionRequired === false, `${r.code}`);

    // ── D: documents work without a plan (free storage) ──
    r = await call(U.indiv, 'POST', '/api/v1/documents', Buffer.from('%PDF-1.4 brief'), { 'Content-Type': 'application/pdf', 'X-File-Name': 'brief.pdf' });
    check('D1  Document upload without a plan → 201 (1 GB free space)', r.code === 201, `${r.code} ${r.body.message}`);

    const serverErrors = logs.filter((l) => /❌/.test(l) && !/Validation errors/.test(l)); // refused input is logged as validation, by design
    check('L9  No unexpected server errors', serverErrors.length === 0, serverErrors.slice(0, 3).join(' | '));

    server.close();
    const passed = results.filter(Boolean).length;
    out(`\nVERIFICATION + ADVERTS: ${passed}/${results.length} passed`);
    process.exitCode = passed === results.length ? 0 : 1;
})().catch((e) => { out('HARNESS CRASH ' + e.stack); process.exitCode = 1; });
