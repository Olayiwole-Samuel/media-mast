// N10 verification harness — offline. Real app/routes/validators/controller/models/hooks, in-memory store that
// enforces the real unique indexes (E11000 like MongoDB), failure injection per step. Passwords generated per run.
process.env.JWT_SECRET = 'n10-harness-dummy-secret';
process.env.JWT_EXPIRE = '5m';
delete process.env.VERCEL;

const path = require('path');
const crypto = require('crypto');
const BACKEND = path.resolve(__dirname, '..', '..'); // backend/ (this file: backend/test/offline/)
const mongoose = require(path.join(BACKEND, 'node_modules', 'mongoose'));
mongoose.set('bufferCommands', false);

const src = (p) => require(path.join(BACKEND, 'src', p));
const User = src('models/User'), Employee = src('models/Employee'), Company = src('models/Company'), AuditLog = src('models/AuditLog');
const { registerLimiter } = src('middleware/rateLimit');

let db;
let IO_DELAY = 0;
const io = () => (IO_DELAY ? new Promise((r) => setTimeout(r, IO_DELAY)) : Promise.resolve());
const eq = (a, b) => (a == null && b == null) || (a != null && b != null && String(a) === String(b));
const matches = (d, f = {}) => Object.entries(f).every(([k, v]) => eq(d[k], v));
const UNIQUE = { users: ['email'], companies: ['email', 'slug'], employees: ['userId'] };
const fail = {}; // e.g. fail['employees.create'] = new Error('boom')
const dup = (c, field, value) => { const e = new Error(`E11000 duplicate key error collection: mm.${c} index: ${field}_1 dup key: { ${field}: "${value}" }`); e.code = 11000; e.keyPattern = { [field]: 1 }; e.keyValue = { [field]: value }; return e; };
const runSaveHooks = async (M, d) => { await d.validate(); const r = M.schema.s.hooks.execPre('save', d, [{}]); if (r && r.then) await r; };
const persist = (c, plain) => {
    for (const field of UNIQUE[c] || []) {
        const clash = db[c].find((x) => !eq(x._id, plain._id) && plain[field] != null && eq(x[field], plain[field]));
        if (clash) throw dup(c, field, plain[field]);
    }
    const i = db[c].findIndex((x) => eq(x._id, plain._id));
    if (i >= 0) db[c][i] = plain; else db[c].push(plain);
};
const toDoc = (M, c, o) => {
    if (!o) return null;
    const d = M.hydrate({ ...o });
    d.save = async () => { if (fail[`${c}.save`]) throw fail[`${c}.save`]; await runSaveHooks(M, d); await io(); persist(c, d.toObject()); return d; };
    return d;
};
const q = (M, c, getter) => { const x = { select: () => x, populate: () => x, lean: () => x, then: (r, j) => io().then(getter).then((v) => toDoc(M, c, v)).then(r, j) }; return x; };
for (const [M, c] of [[User, 'users'], [Employee, 'employees'], [Company, 'companies']]) {
    M.findOne = (f) => q(M, c, () => db[c].find((d) => matches(d, f)) || null);
    M.findById = (id) => q(M, c, () => db[c].find((d) => eq(d._id, id)) || null);
    M.create = async (data) => {
        if (fail[`${c}.create`]) throw fail[`${c}.create`];
        const d = new M(data); await runSaveHooks(M, d); await io(); persist(c, d.toObject());
        return toDoc(M, c, d.toObject());
    };
    M.findByIdAndDelete = async (id) => { const o = db[c].find((d) => eq(d._id, id)); db[c] = db[c].filter((d) => !eq(d._id, id)); return o || null; };
}
AuditLog.create = async (data) => { if (fail['audit.create']) throw fail['audit.create']; const a = new AuditLog(data); await a.validate(); db.audit.push(a.toObject()); return a; };

const logs = [];
for (const k of ['log', 'warn', 'error', 'info']) console[k] = (...a) => logs.push(a.map((x) => (x instanceof Error ? `${x.message} ${x.stack}` : typeof x === 'string' ? x : (() => { try { return JSON.stringify(x); } catch { return String(x); } })())).join(' '));
const out = (s) => process.stdout.write(s + '\n');
const seed = () => { db = { users: [], employees: [], companies: [], audit: [] }; for (const k of Object.keys(fail)) delete fail[k]; };
const counts = () => `${db.companies.length}/${db.users.length}/${db.employees.length}`;
const PW = () => 'Aa1!' + crypto.randomBytes(9).toString('base64url');

const app = src('app');
const results = [];
const check = (label, ok, detail = '') => { results.push(ok); out(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== '' ? '  — ' + detail : ''}`); };

(async () => {
    const server = app.listen(0, '127.0.0.1'); // loopback only
    await new Promise((resolve, reject) => server.once('listening', resolve).once('error', reject)); // address() is null until bound
    const base = `http://127.0.0.1:${server.address().port}`;
    const reg = async (body) => {
        registerLimiter.reset();
        const r = await fetch(`${base}/api/v1/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* */ }
        return { code: r.status, body: json || {}, text };
    };
    const indiv = (extra = {}) => ({ accountType: 'individual', email: 'ada@example.com', name: 'Ada', password: PW(), ...extra });
    const comp = (extra = {}) => ({ accountType: 'company', email: 'owner@acme.example.com', name: 'Owner', companyName: 'Acme Media', password: PW(), ...extra });
    const PASSWORDS = [];
    const track = (b) => { PASSWORDS.push(b.password); return b; };

    // ── Happy paths + validated input ──
    seed();
    let body = track(indiv({ email: '  Ada.Lovelace@Example.COM  ', name: '  Ada  ', status: 'SUSPENDED', role: 'ADMIN', companyId: String(new mongoose.Types.ObjectId()) }));
    let r = await reg(body);
    const u = db.users[0];
    check('V1  Individual → 201 with token', r.code === 201 && typeof r.body.token === 'string' && r.body.data?.user?.accountType === 'INDIVIDUAL', `${r.code} ${r.body.message || ''}`);
    check('V2  Uses validated body: email lowercased + trimmed, name trimmed', u?.email === 'ada.lovelace@example.com' && u?.name === 'Ada', `${u?.email} / ${u?.name}`);
    check('V3  Unknown fields stripped (status/role/companyId in body have no effect)', u?.status === 'ACTIVE' && u?.companyId == null && u?.accountType === 'INDIVIDUAL');
    check('V4  REGISTER audit written; password stored as bcrypt hash', db.audit.some((a) => a.action === 'REGISTER' && eq(a.entityId, u._id)) && u.password.startsWith('$2') && u.password !== body.password);
    r = await reg(track(indiv({ email: 'ADA.LOVELACE@example.com' })));
    check('V5  Same email in different case → pre-check catches it: 400 "Email already registered" (was E11000 → 500)', r.code === 400 && r.body.message === 'Email already registered' && db.users.length === 1, `${r.code} ${r.body.message}`);
    seed();
    r = await reg(track(comp({ email: ' Owner@ACME.example.com ', companyName: '  Acme Media  ', status: 'APPROVED' })));
    check('V6  Company → 201: 1 Company + 1 User + 1 owner Employee, all PENDING / ALL_ACCESS', r.code === 201 && counts() === '1/1/1' && db.companies[0].status === 'PENDING' && db.users[0].status === 'PENDING'
        && db.employees[0].permissions.join() === 'ALL_ACCESS' && db.companies[0].email === 'owner@acme.example.com' && db.companies[0].name === 'Acme Media', `${r.code} ${counts()}`);
    r = await reg(track(comp({ email: 'OWNER@acme.example.com' })));
    check('V7  Duplicate company/user email (any case) → 400, nothing created', r.code === 400 && counts() === '1/1/1', `${r.code} ${r.body.message}`);
    r = await reg(track(comp({ email: 'second@acme.example.com', companyName: 'Acme Media' })));
    check('V8  Same company name → new unique slug (existing slug logic), 201', r.code === 201 && db.companies.map((c) => c.slug).join() === 'acme-media,acme-media-1', db.companies.map((c) => c.slug).join());

    // ── Orphans: every failure after a create is rolled back ──
    const failCase = async (label, key, payload, expectCounts = '0/0/0') => {
        seed(); fail[key] = new Error(`internal-detail-${key} mongodb://user:pw@cluster/db`);
        const x = await reg(track(payload));
        const leak = x.text.includes('internal-detail') || x.text.includes('mongodb://');
        check(label, x.code === 500 && counts() === expectCounts && x.body.message === 'Registration failed. Please try again.' && !leak, `${x.code} counts=${counts()} msg=${x.body.message}`);
    };
    await failCase('O1  Company: Employee.create fails → 500 generic, Company + User rolled back (no orphans)', 'employees.create', comp());
    await failCase('O2  Company: User.create fails → 500 generic, Company rolled back', 'users.create', comp());
    await failCase('O3  Company: Company.create fails → 500 generic, nothing left', 'companies.create', comp());
    await failCase('O4  Company: last-login save fails → 500, all three rolled back', 'users.save', comp());
    await failCase('O5  Individual: last-login save fails → 500, User rolled back', 'users.save', indiv());
    {
        seed();
        const secret = process.env.JWT_SECRET; delete process.env.JWT_SECRET;
        const x = await reg(track(comp()));
        process.env.JWT_SECRET = secret;
        check('O6  Token signing fails (no JWT_SECRET) → 500 generic, all rolled back, no internals', x.code === 500 && counts() === '0/0/0' && x.body.message === 'Registration failed. Please try again.' && !/secret|jsonwebtoken/i.test(x.text), `${x.code} ${counts()}`);
    }
    seed(); fail['audit.create'] = new Error('audit store down');
    r = await reg(track(comp()));
    check('O7  Audit write fails → still 201 (non-fatal, as elsewhere), records complete and consistent', r.code === 201 && counts() === '1/1/1' && typeof r.body.token === 'string', `${r.code} ${counts()}`);

    // ── Races on the unique indexes → 409, with rollback ──
    seed(); IO_DELAY = 10;
    const both = await Promise.all([reg(track(comp({ email: 'race@example.com', companyName: 'Race One' }))), reg(track(comp({ email: 'race@example.com', companyName: 'Race Two' })))]);
    IO_DELAY = 0;
    const codes = both.map((x) => x.code).sort().join();
    check('R1  Two simultaneous company registrations, same email → one 201, one 409', codes === '201,409', codes);
    check('R2  …the loser\'s Company was rolled back (exactly 1 company/user/employee, all linked)', counts() === '1/1/1' && eq(db.users[0].companyId, db.companies[0]._id) && eq(db.employees[0].userId, db.users[0]._id), counts());
    check('R3  …409 body is the normal envelope with a clear message, no E11000 text', both.some((x) => x.code === 409 && x.body.success === false && x.body.message === 'Email already registered' && !/E11000|dup key/.test(x.text)));
    seed(); IO_DELAY = 10;
    const ind = await Promise.all([1, 2, 3].map(() => reg(track(indiv({ email: 'same@example.com' })))));
    IO_DELAY = 0;
    check('R4  Three simultaneous individual registrations, same email → one 201, two 409, one user', ind.filter((x) => x.code === 201).length === 1 && ind.filter((x) => x.code === 409).length === 2 && db.users.length === 1, ind.map((x) => x.code).join());
    seed(); IO_DELAY = 10;
    const slugRace = await Promise.all([reg(track(comp({ email: 'a@slug.example.com', companyName: 'Same Name' }))), reg(track(comp({ email: 'b@slug.example.com', companyName: 'Same Name' })))]);
    IO_DELAY = 0;
    check('R5  Simultaneous same company name → slug clash is 409 "try again" (not 500), loser rolled back', slugRace.map((x) => x.code).sort().join() === '201,409' && counts() === '1/1/1'
        && slugRace.some((x) => x.code === 409 && /similar name/.test(x.body.message || '')), `${slugRace.map((x) => x.code).join()} ${counts()}`);

    // ── Existing validation contract unchanged ──
    seed();
    r = await reg({ accountType: 'individual', email: 'not-an-email', name: 'X', password: 'weak' });
    check('C1  Joi validation still 400 with errors[] (shape unchanged — E13 is separate)', r.code === 400 && Array.isArray(r.body.errors) && counts() === '0/0/0', `${r.code}`);
    r = await reg({ accountType: 'admin', email: 'x@example.com', name: 'X', password: PW() });
    check('C2  accountType outside individual/company → 400, nothing created', r.code === 400 && counts() === '0/0/0', `${r.code}`);
    for (const [lbl, b] of [['email object', { email: { $ne: null } }], ['email array', { email: ['a@b.co'] }], ['name null', { name: null }], ['password number', { password: 12345678 }], ['companyName object', { accountType: 'company', companyName: { $gt: '' } }]]) {
        const x = await reg({ ...comp(), ...b });
        check(`C3  Wrong type (${lbl}) → 400, nothing created`, x.code === 400 && counts() === '0/0/0', `${x.code}`);
    }

    // ── No internals / secrets ──
    const allLogs = logs.join('\n');
    check('S1  No submitted password appears in any log line', PASSWORDS.every((p) => p && !allLogs.includes(p)), `${PASSWORDS.length} passwords`);

    server.close();
    const passed = results.filter(Boolean).length;
    out(`\nN10: ${passed}/${results.length} passed`);
    process.exitCode = passed === results.length ? 0 : 1;
})().catch((e) => { out('HARNESS CRASH ' + e.stack); process.exitCode = 1; process.exit(1); });
