// E12 verification harness — offline. Real app + real middleware chain + real global error handler.
// Test-only routes are added to the real /api/v1 router INSIDE THIS PROCESS ONLY (never in production code).
process.env.JWT_SECRET = 'e12-harness-dummy-secret';
process.env.JWT_EXPIRE = '5m';
delete process.env.VERCEL;

const path = require('path');
const BACKEND = path.resolve(__dirname, '..', '..'); // backend/ (this file: backend/test/offline/)
const SRC_ROOT = process.env.E12_SRC_ROOT || path.join(BACKEND, 'src');
const mongoose = require(path.join(BACKEND, 'node_modules', 'mongoose'));
const jwt = require(path.join(BACKEND, 'node_modules', 'jsonwebtoken'));
mongoose.set('bufferCommands', false);
const src = (p) => require(path.join(SRC_ROOT, p));
const User = src('models/User'), Employee = src('models/Employee'), Company = src('models/Company'), AuditLog = src('models/AuditLog'), Campaign = src('models/Campaign');
const { registerLimiter, loginLimiter } = src('middleware/rateLimit');

// ── minimal store (real Mongoose casting on filters, unique Company.email) ──
const OID = () => new mongoose.Types.ObjectId();
let db;
const clone = (o) => mongoose.mongo.BSON.deserialize(mongoose.mongo.BSON.serialize(o), { promoteValues: true });
const eq = (a, b) => (a == null && b == null) || (a != null && b != null && String(a) === String(b));
const matches = (d, f = {}) => Object.entries(f).every(([k, v]) => (v && typeof v === 'object' && !(v instanceof mongoose.Types.ObjectId) && '$ne' in v ? !eq(d[k], v.$ne) : eq(d[k], v)));
const toDoc = (M, c, o) => { if (!o) return null; const d = M.hydrate(clone(o)); d.save = async () => { await d.validate(); const p = d.toObject(); const i = db[c].findIndex((x) => eq(x._id, p._id)); db[c][i] = p; return d; }; return d; };
const q = (M, c, getter, f) => { const x = { select: () => x, populate: () => x, lean: () => x, sort: () => x, then: (r, j) => Promise.resolve().then(() => { M.where().cast(M, f || {}); const v = getter(); return Array.isArray(v) ? v.map((o) => toDoc(M, c, o)) : toDoc(M, c, v); }).then(r, j) }; return x; };
for (const [c, M] of [['users', User], ['employees', Employee], ['companies', Company], ['campaigns', Campaign]]) {
    M.findOne = (f) => q(M, c, () => db[c].find((d) => matches(d, f)) || null, f);
    M.findById = (id) => q(M, c, () => db[c].find((d) => eq(d._id, id)) || null, { _id: id });
    M.find = (f) => q(M, c, () => db[c].filter((d) => matches(d, f)), f);
    M.countDocuments = async (f) => db[c].filter((d) => matches(d, f)).length;
}
AuditLog.create = async (data) => data;

const logs = [];
for (const k of ['log', 'warn', 'error', 'info']) console[k] = (...a) => logs.push(a.map((x) => (typeof x === 'string' ? x : x && x.message ? `${x.name}: ${x.message}` : JSON.stringify(x))).join(' '));
const out = (s) => process.stdout.write(s + '\n');

const A = OID(), B = OID();
const U = { ownerA: OID(), staffA: OID(), indiv: OID() };
const seed = () => {
    const u = (id, accountType, companyId) => ({ _id: id, email: `${String(id).slice(-6)}@example.com`, name: 'n', accountType, status: 'ACTIVE', companyId, tokenVersion: 0 });
    db = {
        users: [u(U.ownerA, 'COMPANY', A), u(U.staffA, 'EMPLOYEE', A), u(U.indiv, 'INDIVIDUAL', null)],
        employees: [{ _id: OID(), userId: U.ownerA, companyId: A, position: 'Company Owner', permissions: ['ALL_ACCESS'], isActive: true },
            { _id: OID(), userId: U.staffA, companyId: A, position: 'Staff', permissions: [], isActive: true }],
        companies: [{ _id: A, name: 'Acme', slug: 'acme', email: 'info@acme.example.com', status: 'APPROVED', timezone: 'Africa/Lagos', currency: 'NGN', country: 'Nigeria', createdAt: new Date(), updatedAt: new Date() },
            { _id: B, name: 'Beta', slug: 'beta', email: 'hello@beta.example.com', status: 'APPROVED', timezone: 'Africa/Lagos', currency: 'NGN', country: 'Nigeria', createdAt: new Date(), updatedAt: new Date() }],
        campaigns: [],
    };
};

// ── test-only routes on the real API router ──
const SECRET = 'INTERNAL_E12_TEST_SECRET database://e12user:e12pass@private-host:27017/path /srv/app/src/private.js';
const app = src('app');
const apiRouter = src('routes/index');
apiRouter.get('/__e12/sync-throw', () => { throw new Error(SECRET); });
apiRouter.get('/__e12/async-reject', async () => { await Promise.resolve(); throw new Error(SECRET); });
apiRouter.get('/__e12/next-error', (req, res, next) => next(new TypeError(SECRET)));
apiRouter.get('/__e12/mongo-driver', (req, res, next) => { const e = new Error(`connection <monitor> to 10.0.0.5:27017 closed ${SECRET}`); e.name = 'MongoNetworkError'; next(e); });
apiRouter.get('/__e12/validation-error', async (req, res, next) => { try { await new Campaign({}).validate(); } catch (e) { e.message += ` ${SECRET}`; next(e); } });
apiRouter.get('/__e12/duplicate-key', (req, res, next) => { const e = new Error(`E11000 duplicate key error collection: mm.users index: email_1 dup key: { email: "${SECRET}" }`); e.code = 11000; next(e); });
apiRouter.get('/__e12/cast-error', (req, res, next) => { try { Campaign.where().cast(Campaign, { _id: 'not-an-id' }); } catch (e) { next(e); } });
apiRouter.get('/__e12/status-error', (req, res, next) => { const e = new Error(SECRET); e.status = 418; e.statusCode = 418; e.expose = true; next(e); });
apiRouter.get('/__e12/after-headers', (req, res, next) => { res.status(200); res.write('partial-'); next(new Error(SECRET)); });
apiRouter.get('/__e12/bad-error', (req, res, next) => { const e = new Error('x'); Object.defineProperty(e, 'message', { get() { throw new Error(SECRET); } }); Object.defineProperty(e, 'stack', { get() { throw new Error(SECRET); } }); next(e); });
apiRouter.get('/__e12/throw-string', () => { throw `${SECRET}`; }); // eslint-disable-line no-throw-literal
apiRouter.get('/__e12/bearer-in-message', (req, res, next) => next(new Error(`upstream rejected Bearer abc.def.ghi and eyJhbGciOiJIUzI1NiJ9.eyJpZCI6IjEifQ.c2lnbmF0dXJlX2hlcmU ${SECRET}`)));

const tok = (id) => jwt.sign({ id: String(id), tokenVersion: 0 }, process.env.JWT_SECRET, { expiresIn: '5m' });
const results = [];
const check = (label, ok, detail = '') => { results.push(ok); out(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== '' ? '  — ' + detail : ''}`); };
const SAFE_500 = 'Internal server error. Please try again later.';
const leaks = (text) => /INTERNAL_E12_TEST_SECRET|e12pass|private-host|\/srv\/app|private\.js|10\.0\.0\.5|E11000|dup key|at Object\.|at Layer|node_modules|\.js:\d+|Cast to ObjectId|ValidatorError|Path `/.test(text);

(async () => {
    seed();
    const server = app.listen(0, '127.0.0.1'); // loopback only
    await new Promise((resolve, reject) => server.once('listening', resolve).once('error', reject)); // address() is null until bound
    const base = `http://127.0.0.1:${server.address().port}`;
    const call = async (method, p, { who, body, raw, headers = {} } = {}) => {
        const h = { ...headers };
        if (who) h.Authorization = `Bearer ${tok(who)}`;
        if (body !== undefined || raw !== undefined) h['Content-Type'] = h['Content-Type'] || 'application/json';
        try {
            const r = await fetch(base + p, { method, headers: h, body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined });
            const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* */ }
            return { code: r.status, body: json || {}, text };
        } catch (e) { return { code: 'NETWORK', body: {}, text: String(e && e.cause ? e.cause.code || e.cause.message : e) }; }
    };
    const unexpected = async (label, p, extra = '') => {
        const mark = logs.length;
        const r = await call('GET', p);
        check(`${label} → 500 safe envelope, no secret/stack/path/driver text${extra}`, r.code === 500 && r.body.success === false && r.body.message === SAFE_500
            && JSON.stringify(Object.keys(r.body)) === '["success","message"]' && !leaks(r.text), `${r.code} ${r.text.slice(0, 90)}`);
        return { r, logged: logs.slice(mark).join('\n') };
    };

    // ════════ Unexpected exceptions through the real chain ════════
    const s1 = await unexpected('U1  Sync throw in a route handler', '/api/v1/__e12/sync-throw');
    await unexpected('U2  Async rejection (Express 5 forwards it)', '/api/v1/__e12/async-reject');
    await unexpected('U3  next(TypeError)', '/api/v1/__e12/next-error');
    await unexpected('U4  MongoDB driver-style network error', '/api/v1/__e12/mongo-driver');
    await unexpected('U5  Mongoose ValidationError reaching the global handler (no global mapping → 500, not 400)', '/api/v1/__e12/validation-error');
    await unexpected('U6  Raw E11000 reaching the global handler (controllers own their 409s) → 500, no driver text', '/api/v1/__e12/duplicate-key');
    await unexpected('U7  Error with arbitrary status/expose flags → not trusted, 500', '/api/v1/__e12/status-error');
    await unexpected('U8  Error whose message/stack getters throw → still safe 500', '/api/v1/__e12/bad-error');
    await unexpected('U9  Non-Error thrown (string)', '/api/v1/__e12/throw-string');
    const s10 = await unexpected('U10 Message containing Bearer token and JWT', '/api/v1/__e12/bearer-in-message');
    check('L1  Diagnostics kept server-side: log has route + error name + message text', /Server error: GET \/api\/v1\/__e12\/sync-throw/.test(s1.logged) && /Error: INTERNAL_E12_TEST_SECRET/.test(s1.logged), s1.logged.slice(0, 100));
    check('L2  Log redacts URI credentials (e12user:e12pass) but keeps host for diagnosis', !/e12user|e12pass/.test(s1.logged) && /database:\/\/\[REDACTED\]@private-host/.test(s1.logged));
    check('L3  Log redacts Bearer tokens and JWTs', !/Bearer abc\.def\.ghi|eyJhbGciOiJIUzI1NiJ9\.eyJp/.test(s10.logged) && /Bearer \[REDACTED\]/.test(s10.logged) && /\[REDACTED_JWT\]/.test(s10.logged));
    check('L4  Each unexpected error logged once (single global log line)', (s1.logged.match(/Server error:/g) || []).length === 1);
    // headers already sent
    const hs = await call('GET', '/api/v1/__e12/after-headers');
    check('H1  Error after headers sent → no second response, partial body only, no secret', !/INTERNAL_E12_TEST_SECRET|"success"/.test(hs.text), `${hs.code} ${hs.text.slice(0, 40)}`);
    const alive = await call('GET', '/health');
    check('H2  Server still serves requests afterwards (/health 200)', alive.code === 200, `${alive.code}`);

    // ════════ Known client errors keep their status ════════
    const ce = await call('GET', '/api/v1/__e12/cast-error');
    check('K1  N17 safety net: real CastError → 400 "Invalid ID", no Mongoose text', ce.code === 400 && ce.body.message === 'Invalid ID' && !leaks(ce.text), `${ce.code}`);
    const rid = await call('GET', '/api/v1/campaigns/not-an-id', { who: U.ownerA });
    check('K2  N17 route validator still answers first: GET /campaigns/not-an-id → 400 "Invalid campaign ID"', rid.code === 400 && rid.body.message === 'Invalid campaign ID', `${rid.code} ${rid.body.message}`);
    const mj = await call('POST', '/api/v1/auth/login', { raw: '{"email":"a@b.co","password":Hunter2-secret}' });
    check('K3  Malformed JSON → 400 "Invalid JSON in request body", body not echoed', mj.code === 400 && mj.body.message === 'Invalid JSON in request body' && !/Hunter2/.test(mj.text), `${mj.code}`);
    const big = await call('POST', '/api/v1/auth/login', { raw: JSON.stringify({ email: 'a@b.co', password: 'x'.repeat(200 * 1024) }) });
    check('K4  Oversized JSON body → 413 "Request body is too large" (was 500 + parser text)', big.code === 413 && big.body.message === 'Request body is too large' && !/x{50}/.test(big.text), `${big.code} ${big.body.message}`);
    const cs = await call('POST', '/api/v1/auth/login', { raw: '{"email":"a@b.co"}', headers: { 'Content-Type': 'application/json; charset=klingon' } });
    check('K5  Unsupported charset → 415 controlled message', cs.code === 415 && cs.body.message === 'Unsupported request body charset', `${cs.code} ${cs.body.message}`);
    const cors = await call('GET', '/health', { headers: { Origin: 'https://evil.example.com' } });
    check('K6  Disallowed CORS origin → 403 "Not allowed by CORS" (was 500)', cors.code === 403 && cors.body.message === 'Not allowed by CORS', `${cors.code}`);
    const okOrigin = await call('GET', '/health', { headers: { Origin: 'http://localhost:3000' } });
    check('K7  Allowed origin unaffected → 200', okOrigin.code === 200, `${okOrigin.code}`);
    registerLimiter.reset();
    const joi = await call('POST', '/api/v1/auth/register', { body: { accountType: 'individual', email: 'bad', name: 'X', password: 'weak' } });
    check('K8  Joi validation → existing 400 with errors[] (unchanged)', joi.code === 400 && Array.isArray(joi.body.errors) && joi.body.errors.length > 0, `${joi.code}`);
    const n18 = await call('PUT', '/api/v1/settings', { who: U.ownerA, body: { website: 'javascript:alert(1)' } });
    check('K9  N18 settings validation → 400 with message + errors[] (unchanged)', n18.code === 400 && n18.body.message === 'website must be a valid http(s) link', `${n18.code} ${n18.body.message}`);
    const dupe = await call('PUT', '/api/v1/settings', { who: U.ownerA, body: { email: 'HELLO@beta.example.com' } });
    check('K10 Intentional 409 (N18 duplicate company email) unchanged', dupe.code === 409 && dupe.body.message === 'A company with this email already exists', `${dupe.code}`);
    const noTok = await call('GET', '/api/v1/campaigns');
    const badTok = await call('GET', '/api/v1/campaigns', { headers: { Authorization: 'Bearer not.a.jwt' } });
    check('K11 401s unchanged: no token "Not authorized, no token", bad token "Invalid token"', noTok.code === 401 && noTok.body.message === 'Not authorized, no token' && badTok.code === 401 && badTok.body.message === 'Invalid token', `${noTok.code}/${badTok.code}`);
    const ind = await call('GET', '/api/v1/campaigns', { who: U.indiv });
    const staff = await call('PUT', '/api/v1/settings', { who: U.staffA, body: { city: 'x' } });
    check('K12 Non-owner on settings → 403 unchanged; individual lists only their own campaigns (200, none)', ind.code === 200 && Array.isArray(ind.body.data) && ind.body.data.length === 0 && staff.code === 403, `${ind.code}/${staff.code}`);
    const nf = await call('GET', '/api/v1/definitely-not-a-route');
    check('K13 Unknown route → existing 404 {success:false, message:"Route not found", path}', nf.code === 404 && nf.body.message === 'Route not found' && nf.body.path === '/api/v1/definitely-not-a-route', `${nf.code}`);
    const miss = await call('GET', `/api/v1/campaigns/${new mongoose.Types.ObjectId()}`, { who: U.ownerA });
    check('K14 Missing resource → existing 404 "Campaign not found"', miss.code === 404 && miss.body.message === 'Campaign not found', `${miss.code}`);
    loginLimiter.reset();
    const lim = []; for (let i = 0; i < 11; i++) lim.push((await call('POST', '/api/v1/auth/login', { body: { email: 'nobody@example.com', password: 'Wrong-pass-1!' } })).code);
    check('K15 Rate limiting still 429 after 10 failures', lim[10] === 429 && lim.slice(0, 10).every((c) => c === 401), lim.join(','));
    // Controller-level 500s were already generic — confirm one through a real route
    const realFind = Campaign.find; Campaign.find = () => { throw new Error(SECRET); };
    const c500 = await call('GET', '/api/v1/campaigns', { who: U.ownerA });
    Campaign.find = realFind;
    check('K16 Controller-caught failure keeps its own safe 500 ("Failed to load campaigns"), no secret', c500.code === 500 && c500.body.message === 'Failed to load campaigns' && !leaks(c500.text), `${c500.code} ${c500.body.message}`);

    server.close();
    const passed = results.filter(Boolean).length;
    out(`\nE12: ${passed}/${results.length} passed`);
    process.exitCode = passed === results.length ? 0 : 1;
})().catch((e) => { out('HARNESS CRASH ' + e.stack); process.exitCode = 1; process.exit(1); });
