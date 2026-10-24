// D8 verification harness — offline. Real app/routes/middleware/models, in-memory data, dummy JWT secret.
// Test passwords are generated per run and never printed.
process.env.JWT_SECRET = 'd8-harness-dummy-secret';
process.env.JWT_EXPIRE = '5m';
delete process.env.VERCEL;

const path = require('path');
const crypto = require('crypto');
const BACKEND = path.resolve(__dirname, '..', '..'); // backend/ (this file: backend/test/offline/)
const mongoose = require(path.join(BACKEND, 'node_modules', 'mongoose'));
const jwt = require(path.join(BACKEND, 'node_modules', 'jsonwebtoken'));
const bcrypt = require(path.join(BACKEND, 'node_modules', 'bcryptjs'));
mongoose.set('bufferCommands', false);

const src = (p) => require(path.join(BACKEND, 'src', p));
const User = src('models/User'), Employee = src('models/Employee'), Company = src('models/Company');
const Campaign = src('models/Campaign'), Booking = src('models/Booking'), Creative = src('models/Creative');
const Station = src('models/Station'), Payment = src('models/Payment'), AuditLog = src('models/AuditLog');
const { loginLimiter, registerLimiter } = src('middleware/rateLimit');

const OID = () => new mongoose.Types.ObjectId();
const CO = OID();
const PASSWORD = 'Aa1!' + crypto.randomBytes(12).toString('base64url');
const EMAIL = 'd8-valid@example.com';
const ids = { valid: OID(), owner: OID(), admin: OID(), indiv: OID() };
let db;

const seed = () => {
    const hash = bcrypt.hashSync(PASSWORD, 4);
    const u = (id, email, accountType, companyId) => ({ _id: id, id: String(id), email, name: 'n', password: hash, accountType, status: 'ACTIVE', companyId });
    db = {
        users: [u(ids.valid, EMAIL, 'INDIVIDUAL', null), u(ids.owner, 'owner@example.com', 'COMPANY', CO),
            u(ids.admin, 'admin@example.com', 'ADMIN', null), u(ids.indiv, 'indiv@example.com', 'INDIVIDUAL', null)],
        employees: [{ _id: OID(), userId: ids.owner, companyId: CO, position: 'Company Owner', permissions: ['ALL_ACCESS'], isActive: true }],
        companies: [{ _id: CO, name: 'co', status: 'APPROVED' }],
        stations: [{ _id: OID(), name: 'Radio One', approvalStatus: 'APPROVED', isActive: true }],
        audits: [],
    };
};

const matches = (d, f) => Object.entries(f || {}).every(([k, v]) => (v && typeof v === 'object' && !(v instanceof mongoose.Types.ObjectId)) ? true : String(d[k]) === String(v));
const q = (getter) => { const x = { select: () => x, populate: () => x, lean: () => x, sort: () => x, limit: () => x, skip: () => x, then: (r, j) => Promise.resolve().then(getter).then(r, j) }; return x; };
const asDoc = (M, raw) => { if (!raw) return null; const d = M.hydrate({ ...raw }); d.save = async () => d; return d; };
for (const [M, c] of [[User, 'users'], [Employee, 'employees'], [Company, 'companies'], [Station, 'stations']]) {
    M.findById = (id) => q(() => asDoc(M, db[c].find((d) => String(d._id) === String(id))));
    M.findOne = (f) => q(() => asDoc(M, db[c].find((d) => matches(d, f))));
    M.find = (f) => q(() => db[c].filter((d) => matches(d, f)));
    M.countDocuments = async (f) => db[c].filter((d) => matches(d, f)).length;
}
for (const M of [Campaign, Booking, Payment]) { M.countDocuments = async () => 0; M.find = () => q(() => []); }
Creative.aggregate = async () => [];
AuditLog.find = () => q(() => []);
AuditLog.create = async (doc) => { db.audits.push(doc); return doc; };
User.create = async () => { throw new Error('harness: register must not reach User.create'); };

// Capture all console output so we can assert nothing sensitive is logged.
const logs = [];
for (const k of ['log', 'warn', 'error', 'info']) {
    const orig = console[k].bind(console);
    console[k] = (...a) => { logs.push(a.map((x) => (x instanceof Error ? `${x.message} ${x.stack}` : typeof x === 'string' ? x : JSON.stringify(x))).join(' ')); if (k === '__never') orig(); };
}
const out = (s) => process.stdout.write(s + '\n');

const app = src('app');
const tok = (id) => jwt.sign({ id: String(id) }, process.env.JWT_SECRET, { expiresIn: '5m' });

const results = [];
const check = (label, ok, detail = '') => { results.push(ok); out(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`); };

(async () => {
    seed();
    const server = app.listen(0, '127.0.0.1'); // loopback only
    await new Promise((resolve, reject) => server.once('listening', resolve).once('error', reject)); // address() is null until bound
    const base = `http://127.0.0.1:${server.address().port}`;
    const call = async (method, p, { body, token, headers = {}, raw } = {}) => {
        const h = { ...headers };
        if (token) h.Authorization = `Bearer ${token}`;
        if (body !== undefined || raw !== undefined) h['Content-Type'] = 'application/json';
        const r = await fetch(base + p, { method, headers: h, body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined });
        const text = await r.text();
        let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
        return { code: r.status, headers: r.headers, text, body: json };
    };
    const login = (email, password, extra) => call('POST', '/api/v1/auth/login', { body: { email, password }, ...extra });
    const bad = (extra) => login('nobody@example.com', 'Wrong-pass-1!', extra);

    // ── H. Security headers ──
    let r = await call('GET', '/health');
    const h = r.headers;
    check('H1  /health → 200, JSON body unchanged', r.code === 200 && r.body?.status === 'OK' && r.body?.message === 'Server is running' && /application\/json/.test(h.get('content-type')), `${r.code}`);
    check('H2  X-Content-Type-Options: nosniff', h.get('x-content-type-options') === 'nosniff', h.get('x-content-type-options'));
    check('H3  X-Frame-Options: SAMEORIGIN', h.get('x-frame-options') === 'SAMEORIGIN', h.get('x-frame-options'));
    check('H4  Referrer-Policy: no-referrer', h.get('referrer-policy') === 'no-referrer', h.get('referrer-policy'));
    check('H5  Strict-Transport-Security set', /max-age=\d+/.test(h.get('strict-transport-security') || ''), h.get('strict-transport-security'));
    check('H6  Content-Security-Policy set (Helmet default; frame-ancestors \'self\')', /frame-ancestors 'self'/.test(h.get('content-security-policy') || ''));
    check('H7  Cross-Origin-Opener-Policy / X-DNS-Prefetch-Control / X-Permitted-Cross-Domain-Policies set',
        !!h.get('cross-origin-opener-policy') && h.get('x-dns-prefetch-control') === 'off' && h.get('x-permitted-cross-domain-policies') === 'none');
    check('H8  X-Powered-By removed', !h.get('x-powered-by'), String(h.get('x-powered-by')));
    r = await call('GET', '/api/v1/nope');
    check('H9  Headers also on API 404 JSON', r.code === 404 && r.body?.message === 'Route not found' && r.headers.get('x-content-type-options') === 'nosniff', `${r.code}`);
    r = await call('GET', '/api/v1/admin/dashboard');
    check('H10 Headers also on admin 401', r.code === 401 && r.headers.get('x-frame-options') === 'SAMEORIGIN', `${r.code}`);
    r = await call('OPTIONS', '/api/v1/auth/login', { headers: { Origin: 'http://localhost:3000', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,authorization' } });
    check('H11 CORS preflight from allowed origin unchanged', r.code === 204 && r.headers.get('access-control-allow-origin') === 'http://localhost:3000', `${r.code} ${r.headers.get('access-control-allow-origin')}`);

    // ── A. Authentication still works ──
    loginLimiter.reset();
    const logStart = logs.length;
    r = await login(EMAIL, PASSWORD);
    const tokenOk = typeof r.body?.token === 'string' && jwt.verify(r.body.token, process.env.JWT_SECRET).id === String(ids.valid);
    check('A1  Valid login → 200 with a working token', r.code === 200 && r.body?.success === true && tokenOk, `${r.code}`);
    check('A2  Login response has no password / hash', !/"password"\s*:/i.test(JSON.stringify(r.body?.data || {})) && !r.text.includes('$2'), Object.keys(r.body?.data?.user || {}).join(','));
    const goodToken = r.body?.token || '';
    r = await login(EMAIL, 'Wrong-pass-1!');
    check('A3  Wrong password → 401 "Invalid credentials"', r.code === 401 && r.body?.message === 'Invalid credentials', `${r.code}`);
    r = await bad();
    check('A4  Unknown email → same 401 "Invalid credentials"', r.code === 401 && r.body?.message === 'Invalid credentials', `${r.code}`);
    r = await call('GET', '/api/v1/auth/me', { token: goodToken });
    check('A5  Protected /auth/me with Bearer token → 200, no password', r.code === 200 && r.body?.data?.email === EMAIL && !('password' in (r.body?.data || {})), `${r.code}`);
    const authLogs = logs.slice(logStart).join('\n');
    check('L1  No password, hash, or token in logs during login flow',
        !authLogs.includes(PASSWORD) && !authLogs.includes('Wrong-pass-1!') && !authLogs.includes('$2') && !authLogs.includes(goodToken.split('.')[2]));
    check('L2  No password-check outcome / user-lookup debug lines logged',
        !/Password valid|comparison result|User not found|Hashing password|Password hashed/i.test(authLogs));

    // ── R. Login rate limiting ──
    loginLimiter.reset();
    const codes = [];
    for (let i = 0; i < 12; i++) codes.push((await bad()).code);
    check('R1  10 failed logins → 401 each, then 429', codes.slice(0, 10).every((c) => c === 401) && codes[10] === 429 && codes[11] === 429, codes.join(','));
    r = await bad();
    check('R2  429 body is JSON {success:false,message}', r.code === 429 && r.body?.success === false && /Too many sign-in attempts/.test(r.body?.message || ''), r.body?.message);
    check('R3  429 includes Retry-After (≤ 15 min)', Number(r.headers.get('retry-after')) > 0 && Number(r.headers.get('retry-after')) <= 900, r.headers.get('retry-after'));
    r = await login(EMAIL, PASSWORD);
    check('R4  While limited, even a correct password gets 429 (no oracle)', r.code === 429 && !r.body?.token, `${r.code}`);
    r = await bad({ headers: { 'X-Forwarded-For': '203.0.113.' + Math.floor(Math.random() * 250) } });
    check('R5  Spoofed X-Forwarded-For does not bypass limiter locally', r.code === 429, `${r.code}`);
    r = await call('GET', '/health');
    check('R6  /health not affected while login is limited', r.code === 200, `${r.code}`);
    r = await call('GET', '/api/v1/auth/me', { token: goodToken });
    check('R7  Other API routes not affected while login is limited', r.code === 200, `${r.code}`);
    r = await call('GET', '/api/v1/stations');
    check('R8  Public station catalogue not affected while login is limited', r.code === 200 && r.body?.success === true, `${r.code}`);

    loginLimiter.reset();
    const okCodes = [];
    for (let i = 0; i < 15; i++) okCodes.push((await login(EMAIL, PASSWORD)).code);
    check('R9  15 successful logins in a row are not limited', okCodes.every((c) => c === 200), okCodes.join(','));
    const after = [];
    for (let i = 0; i < 11; i++) after.push((await bad()).code);
    check('R10 Successes do not use up the allowance (10 failures still allowed, then 429)', after.slice(0, 10).every((c) => c === 401) && after[10] === 429, after.join(','));

    loginLimiter.reset();
    const burst = await Promise.all(Array.from({ length: 30 }, () => bad()));
    const n401 = burst.filter((x) => x.code === 401).length, n429 = burst.filter((x) => x.code === 429).length;
    check('R11 Parallel burst of 30 failures: at most 10 reach the password check', n401 <= 10 && n401 + n429 === 30, `401×${n401} 429×${n429}`);
    loginLimiter.reset();
    r = await login(EMAIL, PASSWORD);
    check('R12 After limiter window resets, login works again', r.code === 200, `${r.code}`);

    // ── G. Registration rate limiting (invalid bodies → no DB writes) ──
    registerLimiter.reset();
    const reg = [];
    for (let i = 0; i < 11; i++) reg.push((await call('POST', '/api/v1/auth/register', { body: { accountType: 'individual', email: 'bad' } })).code);
    check('G1  Register: 10 requests pass to validation (400), 11th → 429', reg.slice(0, 10).every((c) => c === 400) && reg[10] === 429, reg.join(','));
    registerLimiter.reset();
    r = await login(EMAIL, PASSWORD);
    check('G2  Register limiter is separate from login limiter', r.code === 200, `${r.code}`);

    // ── P. Malformed JSON never echoes or logs the body ──
    loginLimiter.reset();
    const secret = 'Zz9!' + crypto.randomBytes(8).toString('hex');
    const pStart = logs.length;
    r = await call('POST', '/api/v1/auth/login', { raw: `{"email":"x@y.z","password":${secret}}` });
    const pLogs = logs.slice(pStart).join('\n');
    check('P1  Malformed JSON login → 400 JSON "Invalid JSON in request body"', r.code === 400 && r.body?.success === false && r.body?.message === 'Invalid JSON in request body', `${r.code} ${r.body?.message}`);
    check('P2  Response does not echo the raw body', !r.text.includes(secret));
    check('P3  Logs do not contain the raw body', !pLogs.includes(secret) && /Invalid JSON body: POST \/api\/v1\/auth\/login/.test(pLogs));

    // ── Z. Authorization unchanged ──
    r = await call('GET', '/api/v1/settings/usage', { token: tok(ids.owner) });
    check('Z1  Company owner → company route 200', r.code === 200 && r.body?.success === true, `${r.code}`);
    r = await call('GET', '/api/v1/settings/usage', { token: tok(ids.indiv) });
    check('Z2  Individual → company route 403', r.code === 403, `${r.code}`);
    r = await call('GET', '/api/v1/admin/dashboard', { token: tok(ids.admin) });
    check('Z3  Admin → admin route 200', r.code === 200 && r.body?.success === true, `${r.code}`);
    r = await call('GET', '/api/v1/admin/dashboard', { token: tok(ids.owner) });
    check('Z4  Company owner → admin route 403', r.code === 403, `${r.code}`);
    r = await call('GET', '/api/v1/auth/me', { token: 'not.a.jwt' });
    check('Z5  Bad token → 401 and token not logged', r.code === 401 && !logs.join('\n').includes('not.a.jwt'), `${r.code}`);

    // ── T. trust proxy only on Vercel ──
    check('T1  Local app: trust proxy off', app.get('trust proxy') === false, String(app.get('trust proxy')));
    process.env.VERCEL = '1';
    delete require.cache[require.resolve(path.join(BACKEND, 'src', 'app'))];
    const vercelApp = src('app');
    delete process.env.VERCEL;
    check('T2  VERCEL set: trust proxy = 1 (single hop)', vercelApp.get('trust proxy') === 1, String(vercelApp.get('trust proxy')));

    server.close();
    const passed = results.filter(Boolean).length;
    out(`\nD8: ${passed}/${results.length} passed`);
    process.exitCode = passed === results.length ? 0 : 1;
})().catch((e) => { out('HARNESS CRASH ' + e.stack); process.exit(1); });
