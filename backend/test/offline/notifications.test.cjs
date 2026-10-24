// Notifications verification harness — offline: email delivery (mailer → Resend API, faked), password reset and
// invitation emails, booking notifications (checkout, station actions, resubmit, cancellation), account emails.
// Same in-memory harness as mvp-checkout. Real app/routes/controllers/models; fetch to the email API is faked and
// any other non-loopback request is blocked and reported. No database, no real email, no real payment.
'use strict';
process.env.JWT_SECRET = 'notif-harness-dummy-secret';
process.env.JWT_EXPIRE = '5m';
process.env.SUBSCRIPTION_REQUIRED = 'false'; // subscription gating is covered by subscriptions.test.cjs
delete process.env.ALLOW_DIRECT_BOOKING;
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
const mailer = src('utils/mailer');
const crypto = require('crypto');

// ── Email: a fake Resend endpoint. Every other fetch must be this loopback test server. ──
const KEY = 're_test_not_a_real_key_123', FROM = 'Media Masters <no-reply@example.test>';
const configure = (on) => {
    if (on) { process.env.RESEND_API_KEY = KEY; process.env.MAIL_FROM = FROM; } else { delete process.env.RESEND_API_KEY; delete process.env.MAIL_FROM; }
    process.env.APP_URL = 'https://app.example.test/';
};
const realFetch = global.fetch;
const sent = [], outbound = [], strayHosts = [];
let providerMode = 'ok';
global.fetch = async (url, opts = {}) => {
    const u = new URL(String(url));
    if (u.hostname === '127.0.0.1') return realFetch(url, opts);
    if (u.href !== 'https://api.resend.com/emails') { strayHosts.push(u.hostname); throw new TypeError('blocked by test'); }
    outbound.push({ url: u.href, method: opts.method, auth: opts.headers && opts.headers.Authorization, hasSignal: !!opts.signal });
    if (providerMode === 'throw') throw new TypeError('fetch failed');
    if (providerMode === 'http500') return new Response('{}', { status: 500 });
    sent.push(JSON.parse(opts.body));
    return new Response(JSON.stringify({ id: 'email_' + sent.length }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

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
    for (const [k, v] of Object.entries(u.$addToSet || {})) { o[k] = o[k] || []; if (!o[k].some((z) => eq(z, v))) o[k].push(v); }
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
    M.updateMany = async (f, u) => { const os = db[c].filter((d) => matches(d, f)); os.forEach((o) => applyUpdate(o, u)); return { matchedCount: os.length, modifiedCount: os.length }; };
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
const U = { indiv: OID(), indiv2: OID(), ownerA: OID(), staffA: OID(), ownerM: OID(), admin: OID(), station: OID(), suspendedMgr: OID() };
const PENDING_CO = OID();
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
            u(U.staffA, 'EMPLOYEE', A, 'staff-a@example.com'), u(U.ownerM, 'COMPANY', M, 'owner-m@example.com'), u(U.admin, 'ADMIN', null, 'admin@example.com'), u(U.station, 'STATION', null, 'st@example.com'), { ...u(U.suspendedMgr, 'STATION', null, 'suspended-mgr@example.com'), status: 'SUSPENDED' }],
        employees: [{ _id: OID(), userId: U.ownerA, companyId: A, position: 'Company Owner', permissions: ['ALL_ACCESS'], isActive: true },
            { _id: OID(), userId: U.staffA, companyId: A, position: 'Viewer', permissions: ['BOOKING_VIEW', 'CAMPAIGN_VIEW'], isActive: true },
            { _id: OID(), userId: U.ownerM, companyId: M, position: 'Company Owner', permissions: ['ALL_ACCESS'], isActive: true }],
        companies: [{ _id: A, name: 'Advertiser Co', email: 'advertiser-co@example.com', status: 'APPROVED' }, { _id: M, name: 'Media Co', email: 'media-co@example.com', status: 'APPROVED' }],
        stations: [st('fm1', { managerIds: [U.station, U.suspendedMgr] }), st('fm2', { pricing: { amount: 30000, currency: 'NGN', unit: 'SPOT' } }), st('usd', { pricing: { amount: 100, currency: 'USD', unit: 'SPOT' } }),
            st('pending', { approvalStatus: 'PENDING' }), st('unpriced', { pricing: { amount: 0, currency: 'NGN', unit: 'SPOT' } })],
        campaigns: [cp('ivy', { name: '<b>ivy</b>' }), cp('ivyClosed', { status: 'CANCELLED' }), cp('ivyRanged', { startDate: new Date(`${day(5)}T00:00:00Z`), endDate: new Date(`${day(8)}T00:00:00Z`) }),
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
    const to = (addr) => sent.filter((m) => m.to.includes(addr));
    const reset = () => { sent.length = 0; outbound.length = 0; providerMode = 'ok'; };
    const NAIRA = (n) => new RegExp(`(₦|NGN)\\s?${n.replace(/[.,]/g, (c) => `\\${c}`)}`);

    // ── M: mailer basics ──
    configure(false); reset();
    let okSend = await mailer.sendEmail({ to: 'x@example.com', subject: 's', text: 't', html: '<p>t</p>' });
    check('M1  Not configured → sendEmail returns false, nothing leaves the process', okSend === false && outbound.length === 0);
    process.env.RESEND_API_KEY = KEY; delete process.env.MAIL_FROM;
    okSend = await mailer.sendEmail({ to: 'x@example.com', subject: 's', text: 't' });
    check('M2  API key without MAIL_FROM → still off', okSend === false && outbound.length === 0);
    configure(true); reset();
    okSend = await mailer.sendEmail({ to: 'x@example.com', subject: 'Hello', text: 't', html: '<p>t</p>' });
    const o = outbound[0] || {};
    check('M3  Configured → one POST to the Resend API with Bearer key, from, to[], subject, text, html and a timeout; returns true',
        okSend === true && outbound.length === 1 && o.url === 'https://api.resend.com/emails' && o.method === 'POST' && o.auth === `Bearer ${KEY}`
        && sent[0].from === FROM && JSON.stringify(sent[0].to) === '["x@example.com"]' && sent[0].subject === 'Hello' && sent[0].text === 't' && sent[0].html === '<p>t</p>' && o.hasSignal);
    reset(); okSend = await mailer.sendEmail({ to: ['not-an-address', ''], subject: 's', text: 't' });
    check('M4  No valid recipient → false, nothing sent', okSend === false && outbound.length === 0);
    reset(); providerMode = 'http500'; logs.length = 0;
    okSend = await mailer.sendEmail({ to: 'x@example.com', subject: 's', text: 't' });
    check('M5  Provider error (500) → false, no throw; log has the status only (no key, no address)', okSend === false && logs.some((l) => /provider returned 500/.test(l)) && !logs.some((l) => l.includes(KEY) || l.includes('x@example.com')));
    reset(); providerMode = 'throw'; logs.length = 0;
    okSend = await mailer.sendEmail({ to: 'x@example.com', subject: 's', text: 't' });
    check('M6  Network failure → false, no throw; logs the error name only', okSend === false && logs.some((l) => /Email not sent: TypeError/.test(l)) && !logs.some((l) => l.includes(KEY)));
    const r0 = mailer.renderEmail({ heading: '<b>Hi</b>', paragraphs: ['a & "b"'], action: { label: 'Go', url: 'https://x.test/?a=1&b=2' } });
    check('M7  renderEmail escapes HTML in heading, text and link; the text version keeps plain values', r0.html.includes('&lt;b&gt;Hi&lt;/b&gt;') && r0.html.includes('a &amp; &quot;b&quot;') && r0.html.includes('href="https://x.test/?a=1&amp;b=2"') && !r0.html.includes('<b>Hi') && r0.text.includes('<b>Hi</b>') && r0.text.includes('Go: https://x.test/?a=1&b=2'));
    check('M8  appUrl uses APP_URL without a trailing slash', mailer.appUrl('/login') === 'https://app.example.test/login');

    // ── P: password reset email ──
    reset(); logs.length = 0;
    let r = await call(null, 'POST', '/api/v1/auth/forgot-password', { email: 'ivy@example.com' });
    const resetMail = to('ivy@example.com')[0];
    const link = (resetMail?.text || '').match(/https:\/\/app\.example\.test\/reset-password#token=([A-Za-z0-9%._~-]+)/);
    const stored = db.users.find((u) => eq(u._id, U.indiv)).passwordResetTokenHash;
    const hash = link ? crypto.createHash('sha256').update(decodeURIComponent(link[1])).digest('hex') : null;
    check('P1  Forgot password → 200 and a reset email whose link (#token= fragment) matches the stored token hash', r.code === 200 && !!resetMail && !!link && !!stored && hash === stored, `${r.code} mails=${sent.length} ${stored ? 'stored' : 'no hash'}`);
    check('P2  Reset email: subject, expiry sentence, HTML button with the same link', resetMail?.subject === 'Reset your Media Masters password' && /expires in \d+ (minutes|hours)/.test(resetMail?.text || '') && (resetMail?.html || '').includes('/reset-password#token='));
    check('P3  The token never appears in logs', !!link && !logs.some((l) => l.includes(decodeURIComponent(link[1]))));
    reset();
    r = await call(null, 'POST', '/api/v1/auth/forgot-password', { email: 'nobody@example.com' });
    check('P4  Unknown email → same 200 response, no email sent', r.code === 200 && sent.length === 0);
    const sameMsg = r.body.message;
    reset(); providerMode = 'http500';
    r = await call(null, 'POST', '/api/v1/auth/forgot-password', { email: 'ian@example.com' });
    check('P5  Provider failing → still the same 200 response (reveals nothing)', r.code === 200 && r.body.message === sameMsg);

    // ── C: checkout notifications ──
    reset();
    r = await pay(U.indiv, 'ivy', [item('fm1'), item('fm1', { time: '09:00' }), item('fm2')]);
    const bks = db.bookings.slice();
    const receipt = to('ivy@example.com')[0];
    const fm1Mail = to('st@example.com')[0];
    const fm2Mail = to('media-co@example.com')[0];
    check('C1  Checkout → 201 and exactly three emails: advertiser receipt, fm1 managers, fm2 (no managers → its company)', r.code === 201 && sent.length === 3 && !!receipt && !!fm1Mail && !!fm2Mail, `${r.code} ${sent.map((x) => x.to.join()).join(' | ')}`);
    check('C2  Receipt lists every booking reference, the amount and payment reference; links to /bookings for an individual',
        !!receipt && bks.every((b) => receipt.text.includes(b.bookingReference)) && receipt.text.includes(db.payments[0].reference) && NAIRA('130,000.00').test(receipt.text) && receipt.text.includes('https://app.example.test/bookings'), (receipt?.text || '').split('\n').slice(2, 4).join(' / '));
    check('C3  fm1 email lists only fm1\'s two requests; fm2 only its one; both link to /station/requests',
        !!fm1Mail && !!fm2Mail && fm1Mail.text.includes(bks[0].bookingReference) && fm1Mail.text.includes(bks[1].bookingReference) && !fm1Mail.text.includes(bks[2].bookingReference)
        && fm2Mail.text.includes(bks[2].bookingReference) && !fm2Mail.text.includes(bks[0].bookingReference) && fm1Mail.text.includes('/station/requests') && /2 new requests/.test(fm1Mail.text));
    check('C4  A suspended station manager is not emailed', to('suspended-mgr@example.com').length === 0);
    check('C5  Campaign name with HTML is escaped in the HTML version', !!receipt && receipt.html.includes('&lt;b&gt;ivy&lt;/b&gt;') && !receipt.html.includes('<b>ivy</b>'));

    // ── S: station actions → advertiser ──
    reset();
    r = await call(U.station, 'PATCH', `/api/v1/bookings/${bks[0]._id}/accept`, { note: 'See you on air' });
    let m = to('ivy@example.com')[0];
    check('S1  Station accepts → advertiser emailed "accepted" with the station note', r.code === 200 && sent.length === 1 && !!m && /accepted/.test(m.subject) && m.text.includes('See you on air') && m.text.includes('Station fm1'), `${r.code} ${m?.subject}`);
    reset();
    r = await call(U.station, 'PATCH', `/api/v1/bookings/${bks[1]._id}/reject`, { note: 'Slot taken' });
    m = to('ivy@example.com')[0];
    check('S2  Station declines a paid booking → advertiser told it was declined and refunded in full', r.code === 200 && !!m && /declined/.test(m.subject) && NAIRA('50,000.00').test(m.text) && /has been refunded/.test(m.text), `${r.code} ${(m?.text || '').split('\n').slice(-5).join(' / ')}`);
    reset();
    r = await call(U.station, 'PATCH', `/api/v1/bookings/${bks[0]._id}/schedule`, {});
    check('S3  Station schedules → advertiser emailed "scheduled"', r.code === 200 && /scheduled/.test(to('ivy@example.com')[0]?.subject || ''), `${r.code}`);

    // ── R: changes requested → resubmit goes back to the station ──
    reset();
    r = await call(U.ownerM, 'PATCH', `/api/v1/bookings/${bks[2]._id}/request-changes`, { note: 'Shorter script please' });
    check('R1  Changes requested → advertiser emailed with the note', r.code === 200 && /needs changes/.test(to('ivy@example.com')[0]?.subject || '') && to('ivy@example.com')[0].text.includes('Shorter script please'), `${r.code} ${r.body.message}`);
    reset();
    r = await call(U.indiv, 'PATCH', `/api/v1/bookings/${bks[2]._id}/resubmit`, {});
    check('R2  Advertiser resubmits → the station (company fallback) is emailed, not the advertiser', r.code === 200 && sent.length === 1 && !!to('media-co@example.com')[0] && /resubmitted/.test(to('media-co@example.com')[0].subject), `${r.code} ${sent.length}`);

    // ── X: advertiser cancels ──
    reset();
    r = await call(U.indiv, 'POST', `/api/v1/bookings/${bks[2]._id}/cancel`);
    const cx = to('ivy@example.com')[0], cs = to('media-co@example.com')[0];
    check('X1  Advertiser cancels → receipt to them (with the refund) and a heads-up to the station', r.code === 200 && !!cx && !!cs && /cancelled/.test(cx.subject) && /refunded/.test(cx.text) && /cancelled by the advertiser/.test(cs.subject), `${r.code} ${sent.length} ${r.body.message}`);

    // ── F: failures never break the request ──
    reset(); providerMode = 'throw';
    r = await pay(U.indiv, 'ivy', [item('fm1', { time: '11:00' })]);
    check('F1  Email provider down → checkout still 201', r.code === 201, `${r.code} ${r.body.message}`);
    const bk = db.bookings[db.bookings.length - 1];
    const realFindById = User.findById;
    // Fail only the notification lookup (it selects accountType); auth middleware lookups still work.
    User.findById = (id) => { const qq = realFindById(id); const sel = qq.select; qq.select = (s) => { if (/accountType/.test(s) && /email/.test(s)) throw new Error('boom'); return sel(s); }; return qq; };
    reset(); logs.length = 0;
    r = await call(U.station, 'PATCH', `/api/v1/bookings/${bk._id}/accept`, {});
    User.findById = realFindById;
    check('F2  Notification lookup throwing → station accept still 200; error name logged and swallowed', r.code === 200 && logs.some((l) => /Notification \(booking status\) failed: Error/.test(l)), `${r.code}`);

    // ── A: accounts ──
    reset();
    db.companies.push({ _id: PENDING_CO, name: 'Pending Co', email: 'pending-co@example.com', slug: 'pending-co', status: 'PENDING' });
    db.users.push({ _id: OID(), email: 'pending-owner@example.com', name: 'Pat', accountType: 'COMPANY', status: 'PENDING', companyId: PENDING_CO, tokenVersion: 0 });
    r = await call(U.admin, 'PATCH', `/api/v1/admin/companies/${PENDING_CO}/verification`, { status: 'APPROVED' });
    check('A1  Admin approves a company → its owner is emailed "approved" with a sign-in link', r.code === 200 && /approved/.test(to('pending-owner@example.com')[0]?.subject || '') && to('pending-owner@example.com')[0].text.includes('https://app.example.test/login'), `${r.code} ${r.body.message} ${sent.length}`);
    reset();
    r = await call(U.admin, 'PATCH', `/api/v1/admin/companies/${PENDING_CO}/verification`, { status: 'REJECTED' });
    check('A2  Rejecting sends no "approved" email', r.code === 200 && sent.length === 0, `${r.code} ${sent.length}`);
    reset();
    r = await call(U.admin, 'POST', '/api/v1/admin/station-managers', { name: 'Nia', email: 'nia@example.com', password: 'Temp-Pass-123', stationIds: [String(S.fm2._id)] });
    m = to('nia@example.com')[0];
    check('A3  Admin creates a station manager → welcome email naming the station; the password is NOT in it', r.code === 201 && !!m && m.text.includes('Station fm2') && !m.text.includes('Temp-Pass-123') && !m.html.includes('Temp-Pass-123'), `${r.code} ${r.body.message}`);
    reset();
    r = await call(U.ownerA, 'POST', '/api/v1/company/team/invite', { email: 'new-hire@example.com', name: 'Nora', position: 'Media Buyer', permissions: ['CAMPAIGN_VIEW'] });
    m = to('new-hire@example.com')[0];
    const inviteLink = (m?.text || '').match(/https:\/\/app\.example\.test\/accept-invite#token=([A-Za-z0-9%._~-]+)/);
    check('A4  Owner invites a team member → invitation email with an #token= accept link; response says emailSent', r.code === 201 && r.body.emailSent === true && /emailed/.test(r.body.message) && !!inviteLink && decodeURIComponent(inviteLink[1]) === r.body.data?.invitation?.token && (m?.subject || '').includes('Advertiser Co'), `${r.code} ${r.body.message}`);

    // ── U: email not configured → nothing sent anywhere, everything still works ──
    configure(false); reset();
    r = await pay(U.indiv, 'ivy', [item('fm1', { time: '13:00' })]);
    const r2 = await call(null, 'POST', '/api/v1/auth/forgot-password', { email: 'ivy@example.com' });
    const r3 = await call(U.ownerA, 'POST', '/api/v1/company/team/invite', { email: 'second-hire@example.com', name: 'Sam' });
    check('U1  Unconfigured: checkout 201, forgot 200, invite 201 with emailSent false and the original message; zero outbound requests',
        r.code === 201 && r2.code === 200 && r3.code === 201 && r3.body.emailSent === false && r3.body.message === 'Invitation created. Share the invitation with the team member so they can set their own password.' && outbound.length === 0, `${r.code}/${r2.code}/${r3.code} out=${outbound.length} ${r3.body.message}`);
    check('U2  No request ever left for a host other than the (faked) email API or this loopback server', strayHosts.length === 0, strayHosts.join(','));

    const passed = results.filter(Boolean).length;
    out(`\n${passed}/${results.length} passed`);
    process.exitCode = passed === results.length ? 0 : 1;
    // Graceful shutdown: wait for the server and its keep-alive sockets to close, then let Node exit on its own.
    await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
        server.closeAllConnections();
    });
})().catch((e) => { out('HARNESS CRASH ' + e.stack); process.exitCode = 1; });
