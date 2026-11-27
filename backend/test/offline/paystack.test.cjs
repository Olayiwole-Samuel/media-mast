// Paystack harness — offline, with a fake Paystack (nothing is sent anywhere): wallet top-ups (checkout,
// return page, webhook signatures, exactly-once crediting, amount checks, sweep), media house bank accounts,
// payouts by transfer (claims, retries, unknown results, approval codes), live/test separation. No database.
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
// Set (empty) so a real key in backend/.env is never loaded here.
process.env.PAYSTACK_SECRET_KEY = '';
process.env.PAYSTACK_WEBHOOK_SECRET = '';
process.env.PAYSTACK_REQUIRED = '';
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
const FundingIntent = src('models/FundingIntent');
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
const C = { users: User, employees: Employee, companies: Company, campaigns: Campaign, stations: Station, bookings: Booking, payments: Payment, creatives: Creative, plans: Plan, subscriptions: Subscription, notifications: Notification, verifications: Verification, wallets: Wallet, walletTransactions: WalletTransaction, platformSettings: PlatformSetting, payoutRequests: PayoutRequest, fundingIntents: FundingIntent };
for (const [c, M] of Object.entries(C)) {
    M.find = (f) => q(M, () => db[c].filter((d) => matches(d, f)));
    M.findOne = (f) => q(M, () => db[c].find((d) => matches(d, f)) || null);
    M.findById = (id) => q(M, () => db[c].find((d) => eq(d._id, id)) || null);
    M.findOneAndUpdate = (f, u, opts = {}) => q(M, () => {
        const o = db[c].find((d) => matches(d, f)); if (!o) return null;
        const prior = { ...o }; applyUpdate(o, u);
        if (opts.session && opts.session.updates) opts.session.updates.push([c, o._id, prior]);
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
        bookings: [], payments: [], creatives: [], audit: [], plans: [], subscriptions: [], notifications: [], verifications: [], wallets: [], walletTransactions: [], platformSettings: [], payoutRequests: [], fundingIntents: [],
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

    // The wallet is the checkout provider here (not the spy stub).
    payments.setPaymentProviderForTests(null);
    const crypto = require('crypto');
    const paystack = src('utils/paystack');
    const { sweepFunding } = src('utils/funding');
    const { sweepPayouts } = src('utils/payouts');
    const { notifyPayoutDecided } = src('utils/notifications');
    void notifyPayoutDecided;
    const KEY = `sk_${'test'}_${'x'.repeat(20)}`; // dummy, never a real key
    const LIVE = `sk_${'live'}_${'x'.repeat(20)}`;
    const HOOK_SECRET = 'whsec_dummy';

    // ── A fake Paystack ──
    const ps = { calls: [], tx: {}, transfers: {}, down: false, refuse: {}, bankName: 'STATION FM1 LTD', nextTransfer: 'success', swallowReply: false };
    const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
    const ok = (data, meta) => reply(200, { status: true, message: 'ok', data, meta });
    const no = (status, message) => reply(status, { status: false, message });
    paystack.setPaystackFetchForTests(async (url, opts) => {
        const p = url.replace('https://api.paystack.co', '');
        const body = opts.body ? JSON.parse(opts.body) : null;
        ps.calls.push({ method: opts.method, path: p, body, auth: opts.headers.Authorization });
        if (ps.down) throw new TypeError('fetch failed');
        for (const [prefix, r] of Object.entries(ps.refuse)) if (p.startsWith(prefix)) return no(r[0], r[1]);
        if (p === '/transaction/initialize') {
            ps.tx[body.reference] = { id: 4099260516, domain: 'test', status: 'abandoned', reference: body.reference, amount: Number(body.amount), requested_amount: Number(body.amount), currency: 'NGN', channel: 'card', fees: 150000, gateway_response: 'The transaction was not completed', paid_at: null };
            return ok({ authorization_url: 'https://checkout.paystack.com/abc123', access_code: 'abc123', reference: body.reference });
        }
        if (p.startsWith('/transaction/verify/')) { const t = ps.tx[decodeURIComponent(p.split('/').pop())]; return t ? ok(t) : no(400, 'Transaction reference not found.'); }
        if (p.startsWith('/bank/resolve')) return ok({ account_number: '0123456789', account_name: ps.bankName });
        if (p.startsWith('/bank?')) return p.includes('next=') ? ok([{ name: 'Zenith Bank', code: '057', active: true }], {}) : ok([{ name: 'Guaranty Trust Bank', code: '058', active: true }, { name: 'Old Bank', code: '999', active: false }], { next: 'cursor2' });
        if (p === '/transferrecipient') return ok({ recipient_code: 'RCP_1' });
        if (p === '/transfer') {
            if (ps.transfers[body.reference]) return no(400, 'Please provide a unique reference');
            const t = { reference: body.reference, amount: body.amount, status: ps.nextTransfer, transfer_code: `TRF_${Object.keys(ps.transfers).length + 1}` };
            ps.transfers[body.reference] = t;
            if (ps.swallowReply) throw new TypeError('socket hang up');
            return ok(t);
        }
        if (p === '/transfer/finalize_transfer') {
            const t = Object.values(ps.transfers).find((x) => x.transfer_code === body.transfer_code);
            if (body.otp !== '928783') return no(400, 'OTP is invalid');
            t.status = 'pending';
            return ok(t);
        }
        if (p.startsWith('/transfer/verify/')) { const t = ps.transfers[decodeURIComponent(p.split('/').pop())]; return t ? ok(t) : no(404, 'Transfer not found'); }
        if (p === '/balance') return ok([{ currency: 'NGN', balance: 123456700 }]);
        return no(404, `unfaked ${p}`);
    });
    const paid = (ref, over = {}) => Object.assign(ps.tx[ref], { status: 'success', gateway_response: 'Successful', paid_at: new Date().toISOString() }, over);

    const walletOf = (scope) => db.wallets.find((w) => (scope.companyId ? eq(w.companyId, scope.companyId) : (w.companyId == null && eq(w.userId, scope.userId))));
    const ivyWallet = () => walletOf({ userId: U.indiv });
    const funds = () => db.walletTransactions.filter((t) => t.type === 'FUND');
    const intentOf = (ref) => db.fundingIntents.find((i) => i.reference === ref);
    const start = async (who, amount, extra = {}, headers = { Origin: 'http://localhost:3000' }) => call(who, 'POST', '/api/v1/wallet/fund', { amount, ...extra }, headers);
    const hook = (event, data, { key = process.env.PAYSTACK_SECRET_KEY, headers, tamper } = {}) => {
        const raw = JSON.stringify({ event, data });
        const sig = crypto.createHmac('sha512', key).update(raw).digest('hex');
        return call(null, 'POST', '/api/v1/webhooks/paystack', Buffer.from(tamper ? raw.replace(tamper[0], tamper[1]) : raw), { 'Content-Type': 'application/json', ...(headers ? headers(raw) : { 'x-paystack-signature': sig }) });
    };
    db.stations.find((s) => eq(s._id, S.fm1._id)).managerIds = [U.station];

    // ── Without a key: as before ──
    let r = await call(U.indiv, 'GET', '/api/v1/wallet');
    check('P1  No key → instant test mode, as before', r.code === 200 && r.body.data.funding.provider === 'TEST' && r.body.data.funding.testMode === true, JSON.stringify(r.body.data?.funding));
    r = await hook('charge.success', { reference: 'x' }, { key: 'anything' });
    check('P2  No key → webhook refused (401)', r.code === 401, `${r.code}`);

    process.env.PAYSTACK_REQUIRED = 'true';
    r = await start(U.indiv, 5000);
    check('P3  PAYSTACK_REQUIRED with no key → 503, no free test money', r.code === 503 && funds().length === 0, `${r.code} ${r.body.message}`);
    process.env.PAYSTACK_REQUIRED = '';
    process.env.PAYSTACK_SECRET_KEY = 'pk_test_wrongkind';
    r = await start(U.indiv, 5000);
    check('P4  A public key pasted by mistake → 503, no free test money, Paystack not called', r.code === 503 && funds().length === 0 && ps.calls.length === 0, `${r.code}`);

    // ── Starting a top-up ──
    process.env.PAYSTACK_SECRET_KEY = KEY;
    r = await call(U.indiv, 'GET', '/api/v1/wallet');
    check('P5  Test key → provider PAYSTACK, test mode', r.body.data.funding.provider === 'PAYSTACK' && r.body.data.funding.testMode === true && r.body.data.funding.available === true, JSON.stringify(r.body.data?.funding));
    r = await start(U.indiv, 500);
    check('P6  Below ₦1,000 → 400, Paystack not called', r.code === 400 && ps.calls.length === 0, `${r.code}`);
    r = await start(U.staffA, 5000);
    check('P7  A team member cannot fund → 403', r.code === 403, `${r.code}`);
    r = await start(U.indiv, '120,000', { back: '/plan?x=1' });
    const ref1 = r.body.data?.reference;
    const init = ps.calls.find((c) => c.path === '/transaction/initialize');
    check('P8  Fund ₦120,000 → Paystack checkout address; nothing credited yet', r.code === 201 && r.body.data.authorizationUrl === 'https://checkout.paystack.com/abc123' && (ivyWallet()?.balance || 0) === 0 && funds().length === 0 && intentOf(ref1).status === 'PENDING', `${r.code} ${r.body.message}`);
    check('P9  Sent to Paystack in kobo with our reference, the payer\'s email and a return to their wallet page', init.body.amount === '12000000' && init.body.currency === 'NGN' && init.body.reference === ref1 && init.body.email === 'ivy@example.com' && init.body.callback_url === 'http://localhost:3000/wallet' && init.body.metadata.cancel_action === `http://localhost:3000/wallet?cancelled=${ref1}`, JSON.stringify(init.body));
    check('P10 The secret key goes to Paystack only: it is not in any reply or log', init.auth === `Bearer ${KEY}` && !r.text.includes(KEY) && !logs.join('\n').includes(KEY));
    r = await start(U.ownerA, 5000, {}, { Origin: 'https://evil.example' });
    check('P11 A foreign site cannot start a top-up (CORS 403)', r.code === 403, `${r.code}`);
    r = await start(U.indiv, 5000, { back: '//evil.example/x' });
    check('P12 A return path to another site is dropped', r.code === 201 && intentOf(r.body.data.reference).back === null);
    r = await start(U.indiv, 5000, { back: '/\\evil.example' });
    check('P13 …including a backslash one', r.code === 201 && intentOf(r.body.data.reference).back === null);

    // ── Coming back ──
    r = await call(U.indiv, 'GET', `/api/v1/wallet/fund/${ref1}`);
    check('P14 Back without paying → PENDING, not credited', r.code === 200 && r.body.data.status === 'PENDING' && (ivyWallet()?.balance || 0) === 0, `${r.code} ${r.body.data?.status}`);
    r = await call(U.indiv2, 'GET', `/api/v1/wallet/fund/${ref1}`);
    check('P15 Someone else\'s top-up → 404', r.code === 404, `${r.code}`);
    paid(ref1);
    ps.down = true;
    r = await call(U.indiv, 'GET', `/api/v1/wallet/fund/${ref1}`);
    check('P16 Paystack unreachable → still PENDING, not credited, not failed', r.code === 200 && r.body.data.status === 'PENDING' && funds().length === 0, `${r.code} ${r.body.data?.status}`);
    ps.down = false;
    r = await call(U.indiv, 'GET', `/api/v1/wallet/fund/${ref1}`);
    check('P17 Paid → ₦120,000 credited once, FUND via PAYSTACK_TEST, return path given back, owner told', r.code === 200 && r.body.data.status === 'PAID' && r.body.data.back === '/plan?x=1' && ivyWallet().balance === 120000 && ivyWallet().totalFunded === 120000 && funds().length === 1 && funds()[0].method === 'PAYSTACK_TEST' && funds()[0].reference === ref1 && intentOf(ref1).fee === 1500 && db.notifications.some((n) => eq(n.userId, U.indiv) && /Wallet funded/.test(n.title)), `${r.code} ${ivyWallet()?.balance}`);
    r = await call(U.indiv, 'GET', `/api/v1/wallet/fund/${ref1}`);
    let w = await hook('charge.success', { reference: ref1 });
    check('P18 Refreshing the page and a late webhook don\'t credit again', r.body.data.status === 'PAID' && w.code === 200 && ivyWallet().balance === 120000 && funds().length === 1, `${w.code} ${ivyWallet().balance}`);

    // ── Webhook ──
    r = await start(U.indiv, 50000);
    const ref2 = r.body.data.reference;
    paid(ref2);
    w = await hook('charge.success', { reference: ref2 }, { key: 'sk_test_wrong' });
    check('P19 Wrong signature → 401, nothing credited', w.code === 401 && ivyWallet().balance === 120000, `${w.code}`);
    w = await hook('charge.success', { reference: ref2, n: 'aaa' }, { tamper: ['aaa', 'bbb'] });
    check('P20 Body changed after signing → 401', w.code === 401 && ivyWallet().balance === 120000, `${w.code}`);
    w = await call(null, 'POST', '/api/v1/webhooks/paystack', { event: 'charge.success', data: { reference: ref2 } });
    check('P21 No signature → 401', w.code === 401, `${w.code}`);
    ps.down = true;
    w = await hook('charge.success', { reference: ref2 });
    check('P22 Can\'t confirm with Paystack → 500 so it is sent again; nothing credited on the webhook\'s word alone', w.code === 500 && ivyWallet().balance === 120000, `${w.code}`);
    ps.down = false;
    const both = await Promise.all([hook('charge.success', { reference: ref2 }), hook('charge.success', { reference: ref2 }), call(U.indiv, 'GET', `/api/v1/wallet/fund/${ref2}`)]);
    check('P23 Two webhooks and the return page at once → credited once', both.every((x) => x.code === 200) && ivyWallet().balance === 170000 && funds().length === 2, `${both.map((x) => x.code)} ${ivyWallet().balance}`);
    w = await hook('charge.success', { reference: 'NOT-OURS' });
    check('P24 A payment that isn\'t ours → 200, ignored', w.code === 200 && funds().length === 2, `${w.code}`);

    // New-style signature (whsec_)
    process.env.PAYSTACK_WEBHOOK_SECRET = `whsec_old, ${HOOK_SECRET}`;
    const signed = (t, secret) => (raw) => ({ 'paystack-signature': `t=${t},v1=whk_0:${'0'.repeat(128)},v1=whk_1:${crypto.createHmac('sha512', secret).update(`${t}.`).update(raw).digest('hex')},x=1` });
    const now = Math.floor(Date.now() / 1000);
    r = await start(U.indiv, 1000);
    paid(r.body.data.reference);
    w = await hook('charge.success', { reference: r.body.data.reference }, { headers: signed(now - 400, HOOK_SECRET) });
    check('P25 Paystack-Signature older than 5 minutes → 401 (replay)', w.code === 401 && funds().length === 2, `${w.code}`);
    w = await hook('charge.success', { reference: r.body.data.reference }, { headers: signed(now, 'whsec_wrong') });
    check('P26 …signed with another secret → 401', w.code === 401 && funds().length === 2, `${w.code}`);
    w = await hook('charge.success', { reference: r.body.data.reference }, { headers: signed(now, HOOK_SECRET) });
    check('P27 …valid → 200, credited (any listed secret, any v1)', w.code === 200 && ivyWallet().balance === 171000, `${w.code} ${ivyWallet().balance}`);
    process.env.PAYSTACK_WEBHOOK_SECRET = '';

    // ── Not what we asked for ──
    const tryWith = async (amount, over) => { const s = await start(U.indiv, amount); paid(s.body.data.reference, over); await hook('charge.success', { reference: s.body.data.reference }); return intentOf(s.body.data.reference); };
    const before1 = ivyWallet().balance;
    let i = await tryWith(50000, { amount: 100000, requested_amount: 5000000 });
    check('P28 Partly paid → MISMATCH, not credited, admins told', i.status === 'MISMATCH' && ivyWallet().balance === before1 && db.notifications.some((n) => eq(n.userId, U.admin) && /Check a Paystack top-up/.test(n.title)), i.status);
    i = await tryWith(50000, { currency: 'USD' });
    check('P29 Other currency → MISMATCH, not credited', i.status === 'MISMATCH' && ivyWallet().balance === before1, i.status);
    i = await tryWith(50000, { requested_amount: 100000, amount: 100000 });
    check('P30 Other amount → MISMATCH, not credited', i.status === 'MISMATCH' && ivyWallet().balance === before1, i.status);
    i = await tryWith(50000, { domain: 'live' });
    check('P31 Other mode → MISMATCH, not credited', i.status === 'MISMATCH' && ivyWallet().balance === before1, i.status);
    i = await tryWith(50000, { amount: 5085000, requested_amount: 5000000 });
    check('P32 Payer bore Paystack\'s fee → credited what they asked for, no more', i.status === 'PAID' && ivyWallet().balance === before1 + 50000, `${i.status} ${ivyWallet().balance}`);

    // ── Failures ──
    r = await start(U.indiv, 20000);
    const ref3 = r.body.data.reference;
    Object.assign(ps.tx[ref3], { status: 'failed', gateway_response: 'Declined' });
    r = await call(U.indiv, 'GET', `/api/v1/wallet/fund/${ref3}`);
    check('P33 Declined card → FAILED, not credited', r.body.data.status === 'FAILED' && /didn't go through/.test(r.body.message), r.body.message);
    paid(ref3);
    await hook('charge.success', { reference: ref3 });
    check('P34 …and retried on the same checkout → credited after all', intentOf(ref3).status === 'PAID' && ivyWallet().balance === before1 + 70000, `${intentOf(ref3).status}`);
    ps.refuse['/transaction/initialize'] = [400, 'Invalid key'];
    r = await start(U.indiv, 20000);
    check('P35 Paystack refuses the checkout → 502, plain message, intent FAILED', r.code === 502 && /not been charged/.test(r.body.message) && !/Invalid key/.test(r.body.message) && db.fundingIntents.at(-1).status === 'FAILED', `${r.code} ${r.body.message}`);
    delete ps.refuse['/transaction/initialize'];

    // All or nothing: the history entry can't be written → no money, intent still open.
    r = await start(U.indiv, 20000);
    const ref4 = r.body.data.reference;
    paid(ref4);
    fail['walletTransactions.create'] = new Error('disk full');
    const bal4 = ivyWallet().balance;
    w = await hook('charge.success', { reference: ref4 });
    check('P36 Crediting fails halfway → 500, balance unchanged, top-up still open', w.code === 500 && ivyWallet().balance === bal4 && intentOf(ref4).status === 'PENDING', `${w.code} ${ivyWallet().balance} ${intentOf(ref4).status}`);
    w = await hook('charge.success', { reference: ref4 });
    check('P37 …and the retry credits it', w.code === 200 && ivyWallet().balance === bal4 + 20000 && intentOf(ref4).status === 'PAID', `${w.code}`);

    // ── Nobody reported back: the sweep ──
    r = await start(U.ownerA, 30000);
    const ref5 = r.body.data.reference;
    paid(ref5, { channel: 'bank_transfer' });
    db.fundingIntents.forEach((x) => { x.createdAt = new Date(); }); // the harness does not stamp dates
    let s = await sweepFunding(new Date());
    check('P38 A brand-new top-up is left alone', intentOf(ref5).status === 'PENDING', JSON.stringify(s));
    s = await sweepFunding(new Date(Date.now() + 6 * 60000));
    check('P39 Minutes later the sweep finds it paid and credits the company wallet', intentOf(ref5).status === 'PAID' && walletOf({ companyId: A })?.balance === 30000 && s.credited === 1, `${JSON.stringify(s)} ${walletOf({ companyId: A })?.balance}`);
    const init5 = ps.calls.filter((c) => c.path === '/transaction/initialize').at(-1);
    check('P40 A company returns to its own wallet page', init5.body.callback_url === 'http://localhost:3000/company/wallet', init5.body.callback_url);
    r = await start(U.indiv, 3000);
    const refOld = r.body.data.reference;
    intentOf(refOld).createdAt = new Date();
    const asked = ps.calls.length;
    await sweepFunding(new Date(Date.now() + 864e5));
    const askedDay1 = ps.calls.filter((c) => c.path.endsWith(refOld)).length;
    const total = ps.calls.length;
    await sweepFunding(new Date(Date.now() + 5 * 864e5));
    check('P41 Days-old unfinished top-ups are no longer asked about (a day-old one still is)', askedDay1 === 1 && total > asked && ps.calls.length === total, `${asked} ${total} ${ps.calls.length}`);

    // ── Chargebacks and dashboard refunds ──
    const bal5 = ivyWallet().balance;
    const notesBefore = db.notifications.filter((n) => eq(n.userId, U.admin)).length;
    w = await hook('charge.dispute.create', { transaction: { reference: ref1 } });
    const w2 = await hook('refund.processed', { transaction_reference: ref1 });
    check('P42 Chargeback / refund on Paystack → admins told, wallet untouched', w.code === 200 && w2.code === 200 && ivyWallet().balance === bal5 && db.notifications.filter((n) => eq(n.userId, U.admin)).length >= notesBefore + 2);

    // ── Admin: connection and top-ups ──
    r = await call(U.admin, 'GET', '/api/v1/admin/paystack');
    check('P43 Admin sees the mode and Paystack balance, never the key', r.code === 200 && r.body.data.mode === 'TEST' && r.body.data.balance === 1234567 && !r.text.includes(KEY), r.text.slice(0, 160));
    r = await call(U.indiv, 'GET', '/api/v1/admin/paystack');
    check('P44 Only admins', r.code === 403, `${r.code}`);
    r = await call(U.admin, 'GET', '/api/v1/admin/paystack/top-ups?status=MISMATCH');
    check('P45 Admin lists top-ups by status', r.code === 200 && r.body.data.length === 4 && r.body.data[0].owner === 'n-ivy', `${r.code} ${r.body.data?.length}`);
    r = await start(U.indiv, 2000);
    const ref6 = r.body.data.reference;
    r = await call(U.admin, 'POST', `/api/v1/admin/paystack/top-ups/${ref6}/check`);
    const r6 = r.body.message;
    paid(ref6);
    r = await call(U.admin, 'POST', `/api/v1/admin/paystack/top-ups/${ref6}/check`);
    check('P46 "I paid but it\'s not there": admin checks again and it is credited', r6 === 'Not paid yet' && r.body.data.status === 'PAID' && /credited/.test(r.body.message), `${r6} / ${r.body.message}`);

    // ── Media house bank account ──
    const st1 = () => db.stations.find((x) => eq(x._id, S.fm1._id));
    r = await call(U.station, 'GET', '/api/v1/station-portal/banks');
    check('P47 Bank list: every page, inactive banks left out', r.code === 200 && r.body.data.map((b) => b.code).join() === '058,057', JSON.stringify(r.body.data));
    r = await call(U.station, 'POST', `/api/v1/station-portal/stations/${S.fm1._id}/resolve-account`, { bankCode: '058', accountNumber: '0123456789' });
    check('P48 The bank says whose account it is', r.code === 200 && r.body.data.accountName === 'STATION FM1 LTD', `${r.code}`);
    r = await call(U.station, 'PUT', `/api/v1/station-portal/stations/${S.fm1._id}/payout-account`, { bankCode: '058', accountNumber: '0123456789', accountName: 'Somebody Else' });
    check('P49 Saved with the bank\'s name for it, not the typed one', r.code === 200 && st1().payoutAccount.accountName === 'STATION FM1 LTD' && st1().payoutAccount.bankCode === '058' && st1().payoutAccount.verified === true, JSON.stringify(st1().payoutAccount));
    r = await call(U.station, 'PUT', `/api/v1/station-portal/stations/${S.fm1._id}/payout-account`, { bankCode: '123', accountNumber: '0123456789' });
    check('P50 A bank that isn\'t on the list → 400', r.code === 400, `${r.code}`);
    r = await call(U.station, 'PUT', `/api/v1/station-portal/stations/${S.fm1._id}/payout-account`, { bankCode: '058', accountNumber: '12345' });
    check('P51 Not 10 digits → 400', r.code === 400, `${r.code}`);
    ps.refuse['/bank/resolve'] = [422, 'Could not resolve account name'];
    r = await call(U.station, 'PUT', `/api/v1/station-portal/stations/${S.fm1._id}/payout-account`, { bankCode: '057', accountNumber: '1000000001' });
    check('P52 Test mode, bank can\'t confirm, no name typed → 400 asking for it', r.code === 400 && r.body.code === 'NEEDS_NAME', `${r.code}`);
    r = await call(U.station, 'PUT', `/api/v1/station-portal/stations/${S.fm1._id}/payout-account`, { bankCode: '057', accountNumber: '1000000001', accountName: 'Station fm1 Ltd' });
    check('P53 …with a typed name → saved as unconfirmed (test mode only)', r.code === 200 && st1().payoutAccount.verified === false, `${r.code}`);
    process.env.PAYSTACK_SECRET_KEY = LIVE;
    r = await call(U.station, 'PUT', `/api/v1/station-portal/stations/${S.fm1._id}/payout-account`, { bankCode: '057', accountNumber: '1000000002', accountName: 'Station fm1 Ltd' });
    check('P54 Live mode: an account the bank can\'t confirm is refused', r.code === 400 && st1().payoutAccount.accountNumber === '1000000001', `${r.code}`);
    process.env.PAYSTACK_SECRET_KEY = KEY;
    delete ps.refuse['/bank/resolve'];
    await call(U.station, 'PUT', `/api/v1/station-portal/stations/${S.fm1._id}/payout-account`, { bankCode: '058', accountNumber: '0123456789' });

    // ── Payouts ──
    const { creditStation } = src('utils/wallet');
    await creditStation(S.fm1._id, 500000, { note: 'earned' });
    const stWallet = () => db.wallets.find((x) => eq(x.stationId, S.fm1._id));
    const ask = async (amount) => (await call(U.station, 'POST', `/api/v1/station-portal/stations/${S.fm1._id}/payouts`, { amount })).body.data?._id;
    const payout = (id) => db.payoutRequests.find((x) => eq(x._id, id));
    const send = (id) => call(U.admin, 'POST', `/api/v1/admin/payouts/${id}/send`);

    let id = await ask(100000);
    r = await call(U.station, 'POST', `/api/v1/admin/payouts/${id}/send`);
    check('P55 Only an admin can send', r.code === 403, `${r.code}`);
    r = await send(id);
    const tr = ps.calls.filter((c) => c.path === '/transfer').at(-1);
    check('P56 Send ₦100,000 → transfer in kobo from the balance, valid reference; PAID, media house told', r.code === 200 && payout(id).status === 'PAID' && payout(id).provider === 'PAYSTACK' && payout(id).mode === 'TEST' && payout(id).reference === 'TRF_1' && tr.body.amount === 10000000 && tr.body.source === 'balance' && /^[a-z0-9_-]{16,50}$/.test(tr.body.reference) && db.notifications.some((n) => eq(n.userId, U.station) && /Payout sent/.test(n.title)), `${r.code} ${r.body.message}`);
    const rcp = ps.calls.filter((c) => c.path === '/transferrecipient').at(-1);
    check('P57 …to the account on the request', rcp.body.account_number === '0123456789' && rcp.body.bank_code === '058' && rcp.body.type === 'nuban', JSON.stringify(rcp.body));
    const sent = () => ps.calls.filter((c) => c.path === '/transfer').length;
    let n = sent();
    r = await send(id);
    check('P58 Sending a paid one again → 409, nothing sent', r.code === 409 && sent() === n, `${r.code}`);

    id = await ask(50000);
    n = sent();
    const two = await Promise.all([send(id), send(id)]);
    check('P59 Two clicks at once → one transfer', two.map((x) => x.code).sort().join() === '200,409' && sent() === n + 1, two.map((x) => x.code).join());

    ps.nextTransfer = 'pending';
    id = await ask(40000);
    r = await send(id);
    check('P60 Paystack still processing → PROCESSING', r.code === 200 && payout(id).status === 'PROCESSING', payout(id).status);
    const p1 = await call(U.admin, 'POST', `/api/v1/admin/payouts/${id}/paid`, { reference: 'GTB-1' });
    const p2 = await call(U.admin, 'POST', `/api/v1/admin/payouts/${id}/decline`, { note: 'no' });
    const p3 = await call(U.station, 'POST', `/api/v1/station-portal/stations/${S.fm1._id}/payouts`, { amount: 5000 });
    check('P61 While processing: can\'t be marked paid by hand, declined, or joined by another request', p1.code === 409 && p2.code === 409 && p3.code === 409, `${p1.code} ${p2.code} ${p3.code}`);
    w = await hook('transfer.success', { reference: payout(id).transferReference });
    check('P62 A "success" webhook Paystack\'s API doesn\'t back up changes nothing', w.code === 200 && payout(id).status === 'PROCESSING', payout(id).status);
    ps.transfers[payout(id).transferReference].status = 'success';
    w = await hook('transfer.success', { reference: payout(id).transferReference });
    check('P63 Confirmed by the API → PAID', w.code === 200 && payout(id).status === 'PAID', payout(id).status);

    id = await ask(30000);
    const earned = stWallet().balance;
    await send(id);
    const firstRef = payout(id).transferReference;
    ps.transfers[firstRef].status = 'failed';
    w = await hook('transfer.failed', { reference: firstRef });
    check('P64 Transfer failed → back to waiting with the reason; earnings unchanged; admins told', payout(id).status === 'PENDING' && /failed/.test(payout(id).failure) && stWallet().balance === earned && db.notifications.some((x) => eq(x.userId, U.admin) && /Payout not sent/.test(x.title)), `${payout(id).status} ${payout(id).failure}`);
    ps.nextTransfer = 'success';
    r = await send(id);
    check('P65 Sent again under a new reference → PAID', payout(id).status === 'PAID' && payout(id).transferReference !== firstRef && payout(id).failure === null, payout(id).transferReference);
    ps.transfers[payout(id).transferReference].status = 'reversed';
    w = await hook('transfer.reversed', { reference: payout(id).transferReference });
    check('P66 The bank returned it after "sent" → back to waiting', payout(id).status === 'PENDING' && /returned/.test(payout(id).failure), `${payout(id).status} ${payout(id).failure}`);
    r = await call(U.admin, 'POST', `/api/v1/admin/payouts/${id}/decline`, { note: 'Account closed' });
    check('P67 …and can be declined: the money is back in their earnings, once', r.code === 200 && stWallet().balance === earned + 30000, `${r.code} ${stWallet().balance}`);

    id = await ask(20000);
    ps.refuse['/transfer'] = [400, 'Your balance is not enough to fulfil this request'];
    r = await send(id);
    delete ps.refuse['/transfer'];
    check('P68 Not enough on the Paystack balance → says so; still waiting', r.code === 502 && /balance is not enough/.test(r.body.message) && payout(id).status === 'PENDING', `${r.code} ${r.body.message}`);

    // No answer in time, but Paystack did get it.
    ps.swallowReply = true;
    n = sent();
    r = await send(id);
    ps.swallowReply = false;
    const lostRef = payout(id).transferReference;
    check('P69 No answer from Paystack → PROCESSING, told not to pay it another way', r.code === 200 && payout(id).status === 'PROCESSING' && /do not pay it another way/.test(r.body.message), `${payout(id).status}`);
    r = await send(id);
    check('P70 …sending again is refused (no second transfer)', r.code === 409 && sent() === n + 1, `${r.code}`);
    await sweepPayouts(new Date());
    check('P71 …and the sweep finds it was sent', payout(id).status === 'PAID' && payout(id).transferReference === lostRef, payout(id).status);

    // No answer and it never arrived.
    id = await ask(20000);
    ps.refuse['/transfer/verify'] = [404, 'Transfer not found'];
    const realFetchDown = ps.refuse;
    paystack.setPaystackFetchForTests(((orig) => async (url, opts) => { if (url.endsWith('/transfer')) { throw new TypeError('fetch failed'); } return orig(url, opts); })(async (url) => (url.includes('/transferrecipient') ? ok({ recipient_code: 'RCP_1' }) : no(404, 'Transfer not found'))));
    void realFetchDown;
    await send(id);
    await sweepPayouts(new Date());
    const early = payout(id).status;
    const keptRef = payout(id).transferReference;
    await sweepPayouts(new Date(Date.now() + 31 * 60000));
    check('P72 Never reached Paystack → kept for 30 minutes, then back to waiting under the SAME reference', early === 'PROCESSING' && payout(id).status === 'PENDING' && payout(id).attempt === 1 && keptRef === `mm-payout-${id}-1`, `${early} ${payout(id).status} ${payout(id).attempt}`);

    // Approval code (OTP)
    ps.refuse = {};
    paystack.setPaystackFetchForTests(async (url, opts) => {
        const p = url.replace('https://api.paystack.co', '');
        const body = opts.body ? JSON.parse(opts.body) : null;
        if (p === '/transferrecipient') return ok({ recipient_code: 'RCP_1' });
        if (p === '/transfer') { ps.transfers[body.reference] = { reference: body.reference, amount: body.amount, status: 'otp', transfer_code: 'TRF_otp' }; return ok(ps.transfers[body.reference]); }
        if (p === '/transfer/finalize_transfer') { if (body.otp !== '928783') return no(400, 'OTP is invalid'); const t = Object.values(ps.transfers).find((x) => x.transfer_code === 'TRF_otp'); t.status = 'success'; return ok(t); }
        return no(404, 'x');
    });
    r = await send(id);
    check('P73 Paystack wants an approval code → PROCESSING (otp), says so', r.code === 200 && payout(id).transferStatus === 'otp' && /approval code/.test(r.body.message), `${payout(id).transferStatus}`);
    r = await call(U.admin, 'POST', `/api/v1/admin/payouts/${id}/otp`, { otp: '000000' });
    const badOtp = r.code;
    r = await call(U.admin, 'POST', `/api/v1/admin/payouts/${id}/otp`, { otp: '928783' });
    check('P74 Wrong code → 400; right code → PAID', badOtp === 400 && r.code === 200 && payout(id).status === 'PAID', `${badOtp} ${r.code} ${payout(id).status}`);

    // ── Pretend money never meets a live key ──
    process.env.PAYSTACK_SECRET_KEY = LIVE;
    id = await ask(10000);
    r = await send(id);
    check('P75 Live key on a database with test top-ups: payouts refused', r.code === 409 && r.body.code === 'TEST_MONEY' && payout(id).status === 'PENDING', `${r.code}`);
    r = await start(U.indiv, 5000);
    check('P76 …and so are live top-ups', r.code === 503, `${r.code}`);
    process.env.PAYSTACK_SECRET_KEY = '';

    server.close();
    const passed = results.filter(Boolean).length;
    out(`\nPAYSTACK: ${passed}/${results.length} passed`);
    process.exit(passed === results.length ? 0 : 1);
})().catch((e) => { out(`CRASH ${e.stack}`); out(logs.slice(-15).join('\n')); process.exit(1); });
