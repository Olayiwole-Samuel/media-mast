// DB startup / readiness harness — offline. mongoose.connect is faked; no real database, no real URI.
'use strict';
// Set before anything loads dotenv (dotenv never overrides an existing value), so the real .env URI is never used.
process.env.MONGODB_URI = 'mongodb+srv://harness-user:harness-secret@fake-cluster.invalid/harness';
process.env.JWT_SECRET = 'dbstart-harness-dummy-secret';
process.env.JWT_EXPIRE = '5m';
delete process.env.VERCEL;

const http = require('http');
const path = require('path');
const BACKEND = path.resolve(__dirname, '..', '..'); // backend/ (this file: backend/test/offline/)
const mongoose = require('mongoose'); // same instance server.js / src resolve
mongoose.set('bufferCommands', false); // any un-faked DB call fails instead of reaching a real DB

const results = [];
const check = (label, ok, detail = '') => { results.push(ok); process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}\n`); }; // not console.log: that is captured during requests
const tick = () => new Promise((r) => setImmediate(r));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Fakes ──
let readyState = 0;
Object.defineProperty(mongoose.connection, 'readyState', { get: () => readyState, set: (v) => { readyState = v; }, configurable: true });

const connectCalls = [];
let connectImpl = null;
mongoose.connect = (uri) => { connectCalls.push(uri); return connectImpl(); };
const succeed = () => async () => { readyState = 1; return mongoose; };
const fail = () => async () => { readyState = 0; throw Object.assign(new Error('querySrv ENOTFOUND mongodb+srv://harness-user:harness-secret@fake-cluster.invalid'), { name: 'MongoServerSelectionError' }); };
const deferred = () => { let resolve; const p = new Promise((r) => { resolve = r; }); return { p, resolve }; };

const unhandled = [];
const EXIT = Symbol('exit');
process.on('unhandledRejection', (reason) => { if (!(reason && reason[EXIT])) unhandled.push(reason); });

const logs = [];
const realError = console.error, realLog = console.log;
const capture = () => {
    console.error = (...a) => logs.push(a.map(String).join(' '));
    console.log = (...a) => logs.push(a.map(String).join(' '));
};
const release = () => { console.error = realError; console.log = realLog; };

const app = require(path.join(BACKEND, 'src', 'app'));
const realListen = app.listen;
let listenCalls = 0;
app.listen = () => { listenCalls++; return { close() {} }; };

let exitCalls = [];
const realExit = process.exit;
process.exit = (code) => { exitCalls.push(code); throw Object.assign(new Error('exit stub'), { [EXIT]: true }); };

const SERVER = path.join(BACKEND, 'server.js');
const DB_UTIL = path.join(BACKEND, 'src', 'utils', 'database.js');
const loadServer = ({ vercel }) => {
    if (vercel) process.env.VERCEL = '1'; else delete process.env.VERCEL;
    delete require.cache[require.resolve(SERVER)];
    try { delete require.cache[require.resolve(DB_UTIL)]; } catch { /* old code has no database.js */ }
    app.set('databaseGate', undefined);
    connectCalls.length = 0; listenCalls = 0; exitCalls = []; unhandled.length = 0; logs.length = 0;
    capture();
    try { return require(SERVER); } finally { release(); }
};
const settle = async () => { capture(); for (let i = 0; i < 5; i++) await tick(); await wait(20); release(); };
const leaks = () => logs.filter((l) => l.includes('harness-secret') || l.includes('harness-user'));

(async () => {
    const server = http.createServer(app).listen(0, '127.0.0.1'); // loopback only
    await new Promise((resolve, reject) => server.once('listening', resolve).once('error', reject));
    const base = `http://127.0.0.1:${server.address().port}`;
    const call = async (method, url, opts = {}) => {
        capture();
        try {
            const r = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
            return { code: r.status, headers: r.headers, body: await r.json().catch(() => ({})) };
        } finally { release(); }
    };

    // ── V: Vercel, database unreachable at cold start ──
    connectImpl = fail();
    let exported = loadServer({ vercel: true });
    await settle();
    check('V1  Vercel: module exports the Express app', exported === app);
    check('V2  Vercel: connection attempted once at cold start, with MONGODB_URI', connectCalls.length === 1 && connectCalls[0] === process.env.MONGODB_URI, `${connectCalls.length} call(s)`);
    check('V3  Vercel: failed startup connect → no unhandled rejection', unhandled.length === 0, unhandled.map((e) => e && e.name).join(', ') || 'none');
    check('V4  Vercel: never calls app.listen or process.exit', listenCalls === 0 && exitCalls.length === 0, `listen=${listenCalls} exit=${exitCalls}`);
    check('V5  Startup failure is logged (error name present)', logs.some((l) => l.includes('MongoDB connection error') && l.includes('MongoServerSelectionError')));
    check('V6  Log never contains the credentials from the URI', leaks().length === 0, leaks()[0] || 'clean');

    let r = await call('GET', '/health');
    check('V7  /health while DB unreachable → 503, not "OK"', r.code === 503 && r.body.status !== 'OK', `${r.code} ${JSON.stringify(r.body)}`);
    check('V8  Next request retried the connection (instance not stuck)', connectCalls.length === 2, `${connectCalls.length} call(s)`);
    r = await call('POST', '/api/v1/auth/login', { body: { email: 'a@example.com', password: 'x' } });
    check('V9  API request while DB unreachable → 503 generic, route not reached', r.code === 503 && r.body.success === false && r.body.message === 'Service temporarily unavailable. Please try again later.', `${r.code} ${r.body.message}`);
    r = await call('GET', '/health', { headers: { Origin: 'http://localhost:3000' } });
    check('V10 503 still carries CORS header for the allowed origin (frontend can read it)', r.code === 503 && r.headers.get('access-control-allow-origin') === 'http://localhost:3000', `${r.code}`);
    check('V11 Request-time failures logged without credentials', leaks().length === 0 && logs.some((l) => l.includes('GET /health')), leaks()[0] || 'clean');
    check('V12 Still no unhandled rejection after failed requests', unhandled.length === 0);

    // ── R: database recovers — concurrent requests share ONE attempt ──
    const gate = deferred();
    connectImpl = async () => { await gate.p; readyState = 1; return mongoose; };
    const before = connectCalls.length;
    const pending = [call('GET', '/health'), call('GET', '/health'), call('GET', '/api/v1/nope')];
    await wait(80);
    check('R1  3 concurrent requests while connecting → 1 connect call', connectCalls.length - before === 1, `${connectCalls.length - before}`);
    gate.resolve();
    const [h1, h2, nf] = await Promise.all(pending);
    check('R2  Requests waited, then /health → 200 with the original body', h1.code === 200 && h2.code === 200 && h1.body.status === 'OK' && h1.body.message === 'Server is running', `${h1.code}/${h2.code}`);
    check('R3  Other routes pass through once ready (404 handler reached)', nf.code === 404 && nf.body.message === 'Route not found', `${nf.code}`);
    const settled = connectCalls.length;
    await call('GET', '/health'); await call('GET', '/health');
    check('R4  Once connected, no further connect calls (no per-request connection)', connectCalls.length === settled, `${connectCalls.length - settled} extra`);
    check('R5  Success logged once', logs.filter((l) => l.includes('Connected to MongoDB')).length <= 1);

    // ── D: connected once, then the connection drops at runtime ──
    readyState = 0;
    r = await call('GET', '/health');
    check('D1  Runtime disconnect → /health 503 "Database unavailable"', r.code === 503 && r.body.status === 'UNAVAILABLE' && r.body.message === 'Database unavailable', `${r.code} ${JSON.stringify(r.body)}`);
    check('D2  …without opening a duplicate connection (driver reconnects itself)', connectCalls.length === settled, `${connectCalls.length - settled} extra`);
    readyState = 1;
    r = await call('GET', '/health');
    check('D3  Connection back → /health 200 again', r.code === 200 && r.body.status === 'OK', `${r.code}`);

    // ── VS: Vercel, database reachable at cold start ──
    connectImpl = succeed();
    exported = loadServer({ vercel: true });
    await settle();
    r = await call('GET', '/health');
    check('VS1 Vercel success: exports app, no listen, /health 200', exported === app && listenCalls === 0 && r.code === 200 && r.body.status === 'OK', `listen=${listenCalls} ${r.code}`);
    check('VS2 Vercel success: exactly one connect across startup + request', connectCalls.length === 1, `${connectCalls.length}`);

    // ── S: standalone, database reachable ──
    const hold = deferred();
    connectImpl = async () => { await hold.p; readyState = 1; return mongoose; };
    readyState = 0;
    exported = loadServer({ vercel: false });
    await settle();
    check('S1  Standalone: does not listen before the database is connected', listenCalls === 0 && connectCalls.length === 1, `listen=${listenCalls}`);
    hold.resolve();
    await settle();
    check('S2  Standalone: listens exactly once after connect', listenCalls === 1, `listen=${listenCalls}`);
    check('S3  Standalone: no exit, no unhandled rejection, exports app', exitCalls.length === 0 && unhandled.length === 0 && exported === app);

    // ── SF: standalone, database unreachable ──
    connectImpl = fail();
    loadServer({ vercel: false });
    await settle();
    check('SF1 Standalone failure: process.exit(1), never listens', exitCalls.length === 1 && exitCalls[0] === 1 && listenCalls === 0, `exit=${exitCalls} listen=${listenCalls}`);
    check('SF2 Standalone failure: logged without credentials, no other unhandled rejection', logs.some((l) => l.includes('MongoDB connection error')) && leaks().length === 0 && unhandled.length === 0, leaks()[0] || `unhandled=${unhandled.length}`);

    // ── M: MONGODB_URI missing ──
    const savedUri = process.env.MONGODB_URI;
    process.env.MONGODB_URI = '';
    connectImpl = succeed();
    loadServer({ vercel: true });
    await settle();
    r = await call('GET', '/health');
    check('M1  Missing MONGODB_URI (Vercel): no connect attempt, 503, no unhandled rejection', connectCalls.length === 0 && r.code === 503 && unhandled.length === 0, `connect=${connectCalls.length} ${r.code}`);
    check('M2  Missing MONGODB_URI is logged as a configuration error', logs.some((l) => l.includes('ConfigurationError')));
    process.env.MONGODB_URI = savedUri;

    // ── G: the app used on its own (as all other offline suites do) stays ungated ──
    app.set('databaseGate', undefined);
    readyState = 0;
    const n = connectCalls.length;
    r = await call('GET', '/health');
    check('G1  App without server.js: /health 200 unchanged, no connect attempted', r.code === 200 && r.body.status === 'OK' && connectCalls.length === n, `${r.code}`);

    app.listen = realListen;
    process.exit = realExit;
    const passed = results.filter(Boolean).length;
    console.log(`\n${passed}/${results.length} passed`);
    process.exitCode = passed === results.length ? 0 : 1;
    await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
        server.closeAllConnections();
    });
})().catch((e) => { release(); console.log('HARNESS CRASH ' + e.stack); process.exitCode = 1; });
