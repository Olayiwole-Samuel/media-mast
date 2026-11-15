// Wallet harness — offline: advertisers fund a wallet (test mode), checkout pays from it (never below zero,
// clear shortfall), low-balance alerts, refunds back into the wallet, spend per campaign, admin view and
// adjustments; team logins switched off (owner only). Same in-memory harness as features.test.cjs. No database.
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
const C = { users: User, employees: Employee, companies: Company, campaigns: Campaign, stations: Station, bookings: Booking, payments: Payment, creatives: Creative, plans: Plan, subscriptions: Subscription, notifications: Notification, verifications: Verification, wallets: Wallet, walletTransactions: WalletTransaction };
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
        bookings: [], payments: [], creatives: [], audit: [], plans: [], subscriptions: [], notifications: [], verifications: [], wallets: [], walletTransactions: [],
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
    const bcrypt = require(path.join(BACKEND, 'node_modules', 'bcryptjs'));
    const PW = 'Media-Pass-2026!';
    const walletOf = (scope) => db.wallets.find((w) => (scope.companyId ? eq(w.companyId, scope.companyId) : (w.companyId == null && eq(w.userId, scope.userId))));
    const txOf = (w) => db.walletTransactions.filter((t) => eq(t.walletId, w._id));
    const ivyWallet = () => walletOf({ userId: U.indiv });
    db.stations.find((s) => eq(s._id, S.fm2._id)).managerIds = [U.station];

    // ── W: wallet basics ──
    let r = await call(U.indiv, 'GET', '/api/v1/wallet');
    check('W1  GET /wallet → 200, an empty wallet is created (₦0), funding is test mode', r.code === 200 && r.body.data.wallet.balance === 0 && db.wallets.length === 1 && r.body.data.funding.testMode === true, `${r.code} ${r.body.message || ''}`);

    r = await pay(U.indiv, 'ivy', [item('fm1')]);
    check('W2  Checkout with an empty wallet → 402 WALLET_INSUFFICIENT with the shortfall, nothing booked', r.code === 402 && r.body.code === 'WALLET_INSUFFICIENT' && r.body.data.shortfall === 50000 && r.body.data.balance === 0 && counts() === '0/0', `${r.code} ${r.body.message}`);

    r = await call(U.indiv, 'POST', '/api/v1/wallet/fund', { amount: 500 });
    check('W3  Top-up below ₦1,000 → 400', r.code === 400 && ivyWallet().balance === 0, `${r.code}`);

    r = await call(U.indiv, 'POST', '/api/v1/wallet/fund', { amount: '120,000' });
    const fundTx = txOf(ivyWallet()).find((t) => t.type === 'FUND');
    check('W4  Fund ₦120,000 → 201 (test mode), balance and total funded ₦120,000, FUND entry via TEST, in-app notice', r.code === 201 && r.body.data.testMode === true && ivyWallet().balance === 120000 && ivyWallet().totalFunded === 120000 && fundTx?.method === 'TEST' && fundTx.balanceAfter === 120000 && db.notifications.some((n) => n.type === 'WALLET' && eq(n.userId, U.indiv) && /funded/i.test(n.title)), `${r.code} ${r.body.message}`);

    r = await pay(U.indiv, 'ivy', [item('fm1')]);
    const p1 = db.payments[0];
    const charge1 = txOf(ivyWallet()).find((t) => t.type === 'CHARGE');
    check('W5  Checkout pays from the wallet: 201, balance ₦70,000, payment provider WALLET, CHARGE entry for the campaign', r.code === 201 && ivyWallet().balance === 70000 && ivyWallet().totalSpent === 50000 && p1?.provider === 'WALLET' && r.body.data.walletBalance === 70000 && eq(charge1?.campaignId, CP.ivy._id) && charge1.amount === 50000, `${r.code} ${r.body.message} ${p1?.provider}`);

    r = await pay(U.indiv, 'ivy', [item('fm2', { time: '09:00' }), item('s3', { time: '09:00' })]);
    check('W6  ₦80,000 of spots with ₦70,000 left → 402, short by ₦10,000; balance unchanged, nothing booked', r.code === 402 && r.body.code === 'WALLET_INSUFFICIENT' && r.body.data.shortfall === 10000 && ivyWallet().balance === 70000 && counts() === '1/1' && /Fund your wallet with at least ₦10,000/.test(r.body.message), `${r.code} ${r.body.message}`);

    // ── Low-balance alert ──
    r = await call(U.indiv, 'PATCH', '/api/v1/wallet/settings', { lowBalanceThreshold: 50000 });
    check('W7  Owner sets a low-balance alert at ₦50,000', r.code === 200 && ivyWallet().lowBalanceThreshold === 50000, `${r.code}`);
    r = await pay(U.indiv, 'ivy', [item('fm2', { time: '10:00' })]);
    const lowNotes = () => db.notifications.filter((n) => n.type === 'WALLET' && /running low/i.test(n.title)).length;
    check('W8  A booking that takes the balance to ₦40,000 (below ₦50,000) → alert sent once', r.code === 201 && ivyWallet().balance === 40000 && lowNotes() === 1 && !!ivyWallet().lowBalanceAlertedAt, `${r.code} ${ivyWallet().balance} ${lowNotes()}`);

    // ── Refunds go back to the wallet ──
    const fm2Booking = db.bookings.find((b) => eq(b.stationId, S.fm2._id));
    r = await call(U.station, 'PATCH', `/api/v1/bookings/${fm2Booking._id}/reject`, { note: 'Fully booked' });
    const refundTx = txOf(ivyWallet()).find((t) => t.type === 'REFUND');
    check('W9  Media house declines the paid spot → ₦30,000 back in the wallet (REFUND entry), balance ₦70,000', r.code === 200 && ivyWallet().balance === 70000 && ivyWallet().totalRefunded === 30000 && refundTx?.amount === 30000 && eq(refundTx.paymentId, fm2Booking.paymentId), `${r.code} ${r.body.message} ${ivyWallet().balance}`);
    check('W10 Back above the alert line → the alert is re-armed', ivyWallet().lowBalanceAlertedAt == null);

    r = await call(U.indiv, 'GET', '/api/v1/wallet');
    const row = (r.body.data?.byCampaign || [])[0];
    check('W11 Dashboard figures: funded ₦120,000, spent ₦80,000, refunded ₦30,000; per campaign "ivy" net ₦50,000', r.code === 200 && r.body.data.wallet.totalFunded === 120000 && r.body.data.wallet.totalSpent === 80000 && r.body.data.wallet.totalRefunded === 30000 && row?.campaignName === 'ivy' && row.spent === 80000 && row.refunded === 30000 && row.net === 50000, JSON.stringify(row));
    r = await call(U.indiv, 'GET', '/api/v1/wallet/transactions');
    check('W12 History: 4 entries, newest first (refund, charge, charge, fund)', r.code === 200 && r.body.data.map((t) => t.type).join(',') === 'REFUND,CHARGE,CHARGE,FUND' && r.body.data[1].campaignName === 'ivy', `${r.code} ${(r.body.data || []).map((t) => t.type).join(',')}`);

    // A checkout that fails after the wallet was charged gives the money straight back.
    const beforeFail = ivyWallet().balance;
    fail['payments.create'] = new Error('simulated write failure');
    r = await pay(U.indiv, 'ivy', [item('s4', { time: '11:00' })]);
    const comp = txOf(ivyWallet()).filter((t) => t.type === 'REFUND').pop();
    check('W13 Checkout fails after charging → full amount back in the wallet, nothing booked', r.code >= 500 && ivyWallet().balance === beforeFail && /could not be completed/i.test(comp?.note || ''), `${r.code} ${ivyWallet().balance}/${beforeFail}`);

    // ── Company wallet: owner only; team logins are off ──
    r = await call(U.ownerA, 'POST', '/api/v1/wallet/fund', { amount: 200000 });
    const coWallet = walletOf({ companyId: A });
    check('W14 Company owner funds the company wallet (separate from individuals)', r.code === 201 && coWallet?.balance === 200000 && ivyWallet().balance === beforeFail, `${r.code} ${r.body.message}`);
    r = await call(U.staffA, 'GET', '/api/v1/wallet');
    check('W15 A team member (staff login) is refused everywhere → 403 TEAM_DISABLED', r.code === 403 && r.body.code === 'TEAM_DISABLED', `${r.code} ${r.body.code}`);
    db.users.find((x) => eq(x._id, U.staffA)).password = bcrypt.hashSync(PW, 4);
    src('middleware/rateLimit').loginLimiter?.reset?.();
    r = await call(null, 'POST', '/api/v1/auth/login', { email: 'staff-a@example.com', password: PW });
    check('W16 …and cannot sign in (403 TEAM_DISABLED, no token)', r.code === 403 && r.body.code === 'TEAM_DISABLED' && !r.body.token, `${r.code} ${r.body.message}`);
    r = await call(U.ownerA, 'GET', '/api/v1/company/team');
    const r2 = await call(U.ownerA, 'POST', '/api/v1/company/team/invite', { email: 'new@example.com', name: 'New' });
    const r3 = await call(U.ownerA, 'GET', '/api/v1/departments');
    const r4 = await call(null, 'POST', '/api/v1/auth/invite/accept', { token: 'x', password: PW });
    check('W17 Team pages, invites, departments and invite acceptance → 410 TEAM_DISABLED', [r, r2, r3, r4].every((x) => x.code === 410 && x.body.code === 'TEAM_DISABLED'), [r, r2, r3, r4].map((x) => x.code).join(','));

    // ── Admin ──
    r = await call(U.ownerA, 'GET', '/api/v1/admin/wallets');
    check('W18 Non-admin cannot list wallets → 403', r.code === 403, `${r.code}`);
    r = await call(U.admin, 'GET', '/api/v1/admin/wallets');
    const coRow = (r.body.data || []).find((w) => w.owner.kind === 'COMPANY');
    check('W19 Admin lists every wallet with its owner and totals', r.code === 200 && r.body.data.length === 2 && coRow?.owner.name === 'Advertiser Co' && coRow.balance === 200000 && r.body.totals.balance === 200000 + beforeFail, `${r.code} ${JSON.stringify(r.body.totals)}`);
    r = await call(U.admin, 'POST', `/api/v1/admin/wallets/${coWallet._id}/adjust`, { amount: 25000 });
    check('W20 Adjustment without a note → 400', r.code === 400 && coWallet.balance === 200000, `${r.code}`);
    r = await call(U.admin, 'POST', `/api/v1/admin/wallets/${coWallet._id}/adjust`, { amount: 25000, note: 'Bank transfer GTB-001' });
    const adj = txOf(coWallet).find((t) => t.type === 'ADJUSTMENT');
    check('W21 Admin credits a bank transfer: +₦25,000 (ADJUSTMENT by ADMIN), owner notified', r.code === 200 && coWallet.balance === 225000 && adj?.method === 'ADMIN' && adj.note === 'Bank transfer GTB-001' && db.notifications.some((n) => n.type === 'WALLET' && eq(n.userId, U.ownerA) && /adjusted/i.test(n.title)), `${r.code} ${r.body.message}`);
    r = await call(U.admin, 'POST', `/api/v1/admin/wallets/${coWallet._id}/adjust`, { amount: -999999, note: 'Correction' });
    check('W22 Removing more than the balance → 400, balance unchanged', r.code === 400 && coWallet.balance === 225000, `${r.code}`);
    r = await call(U.admin, 'GET', `/api/v1/admin/wallets/${coWallet._id}/transactions`);
    check('W23 Admin sees the wallet history', r.code === 200 && r.body.data.map((t) => t.type).join(',') === 'ADJUSTMENT,FUND', `${r.code}`);

    // ── WALLET_PAYMENTS=false falls back to the card provider ──
    process.env.WALLET_PAYMENTS = 'false';
    const ivyBefore = ivyWallet().balance;
    r = await pay(U.indiv, 'ivy', [item('s5', { time: '12:00' })]);
    check('W24 WALLET_PAYMENTS=false → checkout uses the card provider (STUB); wallet untouched', r.code === 201 && db.payments.at(-1).provider === 'STUB' && ivyWallet().balance === ivyBefore, `${r.code} ${db.payments.at(-1)?.provider}`);
    process.env.WALLET_PAYMENTS = 'true';

    server.close();
    const passed = results.filter(Boolean).length;
    out(`\nWALLET: ${passed}/${results.length} passed`);
    process.exit(passed === results.length ? 0 : 1);
})().catch((e) => { out(`CRASH ${e.stack}`); out(logs.slice(-15).join('\n')); process.exit(1); });
