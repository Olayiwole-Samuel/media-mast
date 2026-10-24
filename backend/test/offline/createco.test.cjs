// Admin company creation (POST /api/v1/admin/companies) verification harness — offline.
// Real app/routes/middleware/controller/validators/models/password hook. Store: real Mongoose filter casting,
// real schema validation + pre-save hooks on create, unique Company.email/slug, User.email and Employee.userId
// enforced like MongoDB (E11000). Failure injection at every step, including during rollback.
process.env.JWT_SECRET = 'createco-harness-dummy-secret';
process.env.JWT_EXPIRE = '5m';
delete process.env.VERCEL;

const path = require('path');
const crypto = require('crypto');
const BACKEND = path.resolve(__dirname, '..', '..'); // backend/ (this file: backend/test/offline/)
const SRC_ROOT = process.env.CREATECO_SRC_ROOT || path.join(BACKEND, 'src');
const mongoose = require(path.join(BACKEND, 'node_modules', 'mongoose'));
const jwt = require(path.join(BACKEND, 'node_modules', 'jsonwebtoken'));
mongoose.set('bufferCommands', false);
const src = (p) => require(path.join(SRC_ROOT, p));
const User = src('models/User'), Employee = src('models/Employee'), Company = src('models/Company'), AuditLog = src('models/AuditLog');

const OID = () => new mongoose.Types.ObjectId();
let db;
let IO_DELAY = 0;
const io = () => (IO_DELAY ? new Promise((r) => setTimeout(r, IO_DELAY)) : Promise.resolve());
const clone = (o) => mongoose.mongo.BSON.deserialize(mongoose.mongo.BSON.serialize(o), { promoteValues: true });
const eq = (a, b) => (a == null && b == null) || (a != null && b != null && String(a) === String(b));
const matches = (d, f = {}) => Object.entries(f).every(([k, v]) => {
    const x = d[k];
    if (v && typeof v === 'object' && !(v instanceof mongoose.Types.ObjectId) && !(v instanceof Date) && !Array.isArray(v)) {
        if ('$ne' in v) return !eq(x, v.$ne);
        return true;
    }
    return eq(x, v);
});
const C = { users: User, employees: Employee, companies: Company };
const UNIQUE = { companies: ['email', 'slug'], users: ['email'], employees: ['userId'] };
const fail = {};   // e.g. fail['companies.create'] = Error ; fail['companies.delete'] = Error
const before = {}; // hooks run right before a create persists (simulate a concurrent writer)
const dup = (c, field, value) => { const e = new Error(`E11000 duplicate key error collection: mm.${c} index: ${field}_1 dup key: { ${field}: "${value}" }`); e.code = 11000; e.keyPattern = { [field]: 1 }; e.keyValue = { [field]: value }; return e; };
const persist = (c, plain) => {
    for (const field of UNIQUE[c] || []) if (db[c].some((x) => !eq(x._id, plain._id) && plain[field] != null && eq(x[field], plain[field]))) throw dup(c, field, plain[field]);
    db[c].push(plain);
};
const runHooks = async (M, d) => { await d.validate(); const r = M.schema.s.hooks.execPre('save', d, [{}]); if (r && r.then) await r; };
const q = (M, c, getter, f) => { const x = { select: () => x, populate: () => x, lean: () => x, session: () => x, then: (r, j) => io().then(() => { M.where().cast(M, f || {}); const v = getter(); return v ? M.hydrate(clone(v)) : null; }).then(r, j) }; return x; };
const thenable = (fn) => { const x = { session: () => x, then: (r, j) => Promise.resolve().then(fn).then(r, j) }; return x; };
for (const [c, M] of Object.entries(C)) {
    M.findOne = (f) => q(M, c, () => db[c].find((d) => matches(d, f)) || null, f);
    M.findById = (id) => q(M, c, () => db[c].find((d) => eq(d._id, id)) || null, { _id: id });
    M.exists = (f) => thenable(async () => { await io(); return db[c].some((d) => matches(d, f)) ? { _id: 1 } : null; });
    M.countDocuments = async (f) => db[c].filter((d) => matches(d, f)).length;
    M.create = async (data, options) => {
        // Transaction plumbing: create([doc], { session }) returns an array.
        if (Array.isArray(data)) { const out = []; for (const d of data) out.push(await M.create(d, options)); return out; }
        if (fail[`${c}.create`]) { const e = fail[`${c}.create`]; delete fail[`${c}.create`]; throw e; }
        const d = new M(data); await runHooks(M, d); await io();
        if (before[c]) { const h = before[c]; delete before[c]; h(); }
        persist(c, d.toObject());
        if (options && options.session && options.session.inserted) options.session.inserted.push([c, d._id]);
        return M.hydrate(clone(d.toObject()));
    };
    M.findByIdAndDelete = async (id) => {
        deleteCalls++;
        if (fail[`${c}.delete`]) { const e = fail[`${c}.delete`]; delete fail[`${c}.delete`]; throw e; }
        await io(); db[c] = db[c].filter((d) => !eq(d._id, id)); return null;
    };
}
// Transaction plumbing: createCompany runs in session.withTransaction(). This offline fake models an aborted
// transaction by removing exactly the documents inserted with that session (other requests' writes stay), the
// way a real abort only discards its own writes. Real atomicity is proven against the isolated Atlas cluster
// (txn-integration-harness.cjs).
let deleteCalls = 0;
const sessions = [];
mongoose.startSession = async () => {
    const s = {
        ended: false,
        inserted: [],
        async withTransaction(fn) {
            s.inserted = [];
            try { await fn(); } catch (e) {
                for (const [c, id] of s.inserted) db[c] = db[c].filter((d) => !eq(d._id, id));
                throw e;
            }
        },
        async endSession() { this.ended = true; },
    };
    sessions.push(s);
    return s;
};
AuditLog.create = async (data) => { if (fail['audit.create']) { const e = fail['audit.create']; delete fail['audit.create']; throw e; } const a = new AuditLog(data); await a.validate(); db.audit.push(a.toObject()); return a; };

const logs = [];
for (const k of ['log', 'warn', 'error', 'info']) console[k] = (...a) => logs.push(a.map((x) => (x && x.name ? `${x.name} ${x.message} ${x.stack || ''}` : typeof x === 'string' ? x : (() => { try { return JSON.stringify(x); } catch { return String(x); } })())).join(' '));
const out = (s) => process.stdout.write(s + '\n');

const U = { admin: OID(), owner: OID(), staff: OID(), indiv: OID() };
const EXIST = OID();
const seed = () => {
    for (const k of Object.keys(fail)) delete fail[k];
    for (const k of Object.keys(before)) delete before[k];
    const u = (id, accountType, companyId, email) => ({ _id: id, email: email || `${String(id).slice(-6)}@example.com`, name: 'n', accountType, status: 'ACTIVE', companyId, tokenVersion: 0 });
    db = {
        users: [u(U.admin, 'ADMIN', null), u(U.owner, 'COMPANY', EXIST, 'existing-owner@example.com'), u(U.staff, 'EMPLOYEE', EXIST), u(U.indiv, 'INDIVIDUAL', null, 'taken@example.com')],
        employees: [{ _id: OID(), userId: U.owner, companyId: EXIST, position: 'Company Owner', permissions: ['ALL_ACCESS'], isActive: true },
            { _id: OID(), userId: U.staff, companyId: EXIST, position: 'Staff', permissions: [], isActive: true }],
        companies: [{ _id: EXIST, name: 'Existing Co', slug: 'existing-co', email: 'contact@existing.example.com', status: 'APPROVED', timezone: 'Africa/Lagos', currency: 'NGN', country: 'Nigeria' }],
        audit: [],
    };
};
const counts = () => `${db.companies.length}/${db.users.length}/${db.employees.length}`;
const BASE_COUNTS = '1/4/2';
const PASSWORDS = new Set();
const pw = () => { const p = 'Aa1!' + crypto.randomBytes(9).toString('base64url'); PASSWORDS.add(p); return p; };
// Exactly what the admin create page sends
const formPayload = (over = {}) => ({ name: 'Acme Media', email: 'owner@acme.example.com', password: pw(), phone: null, website: null, description: null, address: null, city: null, state: null, country: '', timezone: 'Africa/Lagos', currency: 'NGN', ...over });

const app = src('app');
const tok = (id) => jwt.sign({ id: String(id), tokenVersion: 0 }, process.env.JWT_SECRET, { expiresIn: '5m' });
const results = [];
const check = (label, ok, detail = '') => { results.push(ok); out(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== '' ? '  — ' + detail : ''}`); };
const isContract = (r, field) => r.code === 400 && r.body.success === false && typeof r.body.message === 'string' && r.body.message === r.body.errors?.[0]
    && Array.isArray(r.body.errors) && r.body.errors.every((e) => typeof e === 'string') && Array.isArray(r.body.fieldErrors) && r.body.fieldErrors.length === r.body.errors.length
    && (!field || r.body.fieldErrors.some((f) => f.field === field));

(async () => {
    seed();
    const server = app.listen(0, '127.0.0.1'); // loopback only
    await new Promise((resolve, reject) => server.once('listening', resolve).once('error', reject)); // address() is null until bound
    const base = `http://127.0.0.1:${server.address().port}`;
    const all = [];
    const call = async (who, body, raw) => {
        const h = {};
        if (who) h.Authorization = `Bearer ${tok(who)}`;
        if (body !== undefined || raw !== undefined) h['Content-Type'] = 'application/json';
        const r = await fetch(`${base}/api/v1/admin/companies`, { method: 'POST', headers: h, body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined });
        const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* */ }
        const res = { code: r.status, body: json || {}, text };
        all.push(res);
        return res;
    };
    const rejects = async (label, body, { field, raw = false, code = 400, msg, contract = true } = {}) => {
        seed(); const a = db.audit.length;
        const r = raw ? await call(U.admin, undefined, body) : await call(U.admin, body);
        const pwLeak = body && typeof body === 'object' && typeof body.password === 'string' && body.password.length > 3 && r.text.includes(body.password);
        const ok = r.code === code && counts() === BASE_COUNTS && db.audit.length === a && (code !== 400 || !contract || isContract(r, field)) && (!msg || r.body.message === msg) && !pwLeak;
        check(label, ok, `${r.code} ${r.body.message || ''} counts=${counts()}`);
        return r;
    };

    // ════════ Auth ════════
    let r = await call(null, formPayload());
    check('Z1  No token → 401, nothing created', r.code === 401 && counts() === BASE_COUNTS, `${r.code}`);
    for (const [who, lbl] of [[U.owner, 'company owner'], [U.staff, 'employee'], [U.indiv, 'individual']]) {
        r = await call(who, formPayload());
        check(`Z2  ${lbl} → 403, nothing created`, r.code === 403 && counts() === BASE_COUNTS, `${r.code}`);
    }

    // ════════ Valid creation ════════
    seed();
    const goodPw = pw();
    r = await call(U.admin, formPayload({ name: '  Acme Media  ', email: ' Owner@ACME.example.com ', password: goodPw, website: 'https://acme.example.com', phone: '08031234567', city: 'Lagos' }));
    const co = db.companies.find((c) => c.email === 'owner@acme.example.com');
    const ou = db.users.find((u) => u.email === 'owner@acme.example.com');
    const oe = ou && db.employees.find((e) => eq(e.userId, ou._id));
    check('V1  Admin form payload → 201 "Company created successfully"', r.code === 201 && r.body.message === 'Company created successfully', `${r.code} ${r.body.message || ''}`);
    check('V2  Company: trimmed name, lowercased email, generated slug, PENDING, defaults (country "" → Nigeria)', co?.name === 'Acme Media' && co?.slug === 'acme-media' && co?.status === 'PENDING' && co?.country === 'Nigeria'
        && co?.timezone === 'Africa/Lagos' && co?.currency === 'NGN' && co?.website === 'https://acme.example.com', JSON.stringify({ slug: co?.slug, country: co?.country }));
    check('V3  Owner User: COMPANY, PENDING, linked, mustChangePassword, password bcrypt-hashed (never plaintext)', ou?.accountType === 'COMPANY' && ou?.status === 'PENDING' && eq(ou?.companyId, co?._id)
        && ou?.mustChangePassword === true && typeof ou?.password === 'string' && ou.password.startsWith('$2') && ou.password !== goodPw);
    check('V4  Owner Employee: Company Owner, [ALL_ACCESS], active, invitedBy admin, linked to company + user', oe?.position === 'Company Owner' && oe?.permissions.join() === 'ALL_ACCESS' && oe?.isActive === true
        && eq(oe?.invitedBy, U.admin) && eq(oe?.companyId, co?._id) && counts() === '2/5/3');
    const aud = db.audit.find((x) => x.action === 'CREATE_COMPANY');
    check('V5  CREATE_COMPANY audit with owner ids; no password or hash anywhere in it', aud && aud.metadata?.ownerUserId === String(ou?._id) && aud.metadata?.ownerEmployeeId === String(oe?._id)
        && !JSON.stringify(aud).includes(goodPw) && !/\$2[aby]\$/.test(JSON.stringify(aud)));
    check('V6  Response carries no password or hash', !r.text.includes(goodPw) && !/\$2[aby]\$|"password"/.test(r.text));
    r = await call(U.admin, formPayload({ email: 'second@acme.example.com', name: 'Acme Media' }));
    check('V7  Same company name again → slug "acme-media-1" (existing generator)', r.code === 201 && db.companies.some((c) => c.slug === 'acme-media-1'), `${r.code}`);

    // ════════ Validation before any write ════════
    await rejects('F1  Missing name → 400 "Company name is required", nothing created', formPayload({ name: undefined }), { field: 'name' });
    await rejects('F2  Missing email → 400 "Company email is required"', formPayload({ email: undefined }), { field: 'email' });
    await rejects('F3  Missing password → 400 "Password is required"', formPayload({ password: undefined }), { field: 'password' });
    for (const weak of ['short1!', 'alllowercase1!', 'ALLUPPERCASE1!', 'NoDigitsHere!', 'NoSpecial123', '12345678']) {
        await rejects(`F4  Weak password "${weak.replace(/./g, '*')}" → 400 (registration rule), not echoed`, formPayload({ password: weak }), { field: 'password' });
    }
    const INVALID = {
        name: ['', '   ', null, {}, ['Acme'], 42, true, 'x'.repeat(101), 'Acme\nMedia'],
        email: ['not-an-email', 'a@b', '', null, {}, ['a@b.co'], 7, 'owner@acme.test'],
        password: [{}, ['Aa1!aaaaaa'], 12345678, true, null],
        phone: ['abc', '123', {}, [], 8031234567],
        website: ['javascript:alert(1)', 'data:text/html,hi', 'ftp://a.example.com', 'https://u:p@a.example.com', 'a.example.com', {}],
        logo: ['javascript:alert(1)', 'https://u:p@cdn.example.com/l.png', '/x.png', {}],
        description: [{}, 'x'.repeat(2001), 'bad\u0007bell'], address: [{}, 'x'.repeat(201)], city: [{}, 'Lag\u0000os'], state: [[], 'x'.repeat(101)], country: [{}, 'x'.repeat(101)],
        timezone: ['Mars/Base', {}, 1], currency: ['XYZ', 'NAIRA', {}, 566],
    };
    for (const [field, values] of Object.entries(INVALID)) {
        seed(); const res = [];
        for (const v of values) { const x = await call(U.admin, formPayload({ [field]: v })); res.push(isContract(x, field) ? 400 : `${x.code}!`); }
        check(`F5  ${field.padEnd(11)} ${values.length} invalid values → 400 E13 contract (field "${field}"), nothing created`, res.every((c) => c === 400) && counts() === BASE_COUNTS && db.audit.length === 0, res.join(','));
    }
    for (const [lbl, extra] of [['status', { status: 'APPROVED' }], ['slug', { slug: 'chosen-slug' }], ['subscriptionId', { subscriptionId: 'sub_enterprise' }], ['companyId', { companyId: String(EXIST) }],
        ['ownerId', { ownerId: String(U.indiv) }], ['accountType', { accountType: 'ADMIN' }], ['permissions', { permissions: ['ALL_ACCESS'] }], ['role', { role: 'ADMIN' }], ['_id', { _id: String(OID()) }],
        ['mustChangePassword', { mustChangePassword: false }], ['createdAt', { createdAt: '2000-01-01' }]]) {
        await rejects(`P   Protected/unknown "${lbl}" → 400 "… cannot be set when creating a company", nothing created`, formPayload(extra), { field: Object.keys(extra)[0] });
    }
    for (const [lbl, raw] of [['name {$ne:null}', JSON.stringify({ ...formPayload(), name: { $ne: null } })], ['email {$regex}', JSON.stringify({ ...formPayload(), email: { $regex: '.*' } })],
        ['$set', JSON.stringify({ ...formPayload(), $set: { status: 'APPROVED' } })], ['dotted path', JSON.stringify({ ...formPayload(), 'owner.role': 'ADMIN' })],
        ['__proto__', `{"name":"Acme","email":"o@acme.example.com","password":"${pw()}","__proto__":{"status":"APPROVED","polluted":true}}`],
        ['constructor', `{"name":"Acme","email":"o@acme.example.com","password":"${pw()}","constructor":{"prototype":{"polluted":true}}}`], ['array body', '[{"name":"Acme"}]']]) {
        await rejects(`O   ${lbl} → 400, nothing created`, raw, { raw: true });
    }
    await rejects('O2  JSON null body → 400 "Invalid JSON in request body" (D8), nothing created', 'null', { raw: true, msg: 'Invalid JSON in request body', contract: false });
    check('O3  Object.prototype not polluted', ({}).polluted === undefined && ({}).status === undefined);

    // ════════ Conflicts and races ════════
    await rejects('C1  Owner email already a user → 409 "A user with this email already exists"', formPayload({ email: 'TAKEN@example.com' }), { code: 409, msg: 'A user with this email already exists' });
    await rejects('C2  Email already used by a company (no user with it) → 409 "A company with this email already exists"', formPayload({ email: 'contact@existing.example.com' }), { code: 409, msg: 'A company with this email already exists' });
    seed(); before.companies = () => db.companies.push({ _id: OID(), name: 'Racer', slug: 'racer', email: 'owner@acme.example.com', status: 'PENDING' });
    r = await call(U.admin, formPayload());
    check('C3  Race on Company.email at insert → 409, nothing of ours left', r.code === 409 && r.body.message === 'A company with this email already exists' && counts() === '2/4/2' && !/E11000|dup key/.test(r.text), `${r.code} ${r.body.message} ${counts()}`);
    seed(); before.companies = () => db.companies.push({ _id: OID(), name: 'Racer', slug: 'acme-media', email: 'racer@example.com', status: 'PENDING' });
    r = await call(U.admin, formPayload());
    check('C4  Race on slug at insert → 409 "A company with this slug already exists", nothing of ours left', r.code === 409 && r.body.message === 'A company with this slug already exists' && counts() === '2/4/2', `${r.code} ${r.body.message} ${counts()}`);
    seed(); before.users = () => db.users.push({ _id: OID(), email: 'owner@acme.example.com', name: 'racer', accountType: 'INDIVIDUAL', status: 'ACTIVE' });
    r = await call(U.admin, formPayload());
    check('C5  Race on owner User.email after Company created → 409 "A user with this email already exists", Company rolled back', r.code === 409 && r.body.message === 'A user with this email already exists'
        && !db.companies.some((c) => c.email === 'owner@acme.example.com') && counts() === '1/5/2', `${r.code} ${r.body.message} ${counts()}`);
    seed(); IO_DELAY = 10;
    const pair = await Promise.all([call(U.admin, formPayload()), call(U.admin, formPayload())]);
    IO_DELAY = 0;
    const pc = pair.map((x) => x.code).sort().join();
    check('C6  Two identical concurrent creates → one 201, one 409; exactly 1 company + 1 owner + 1 employee added', pc === '201,409' && counts() === '2/5/3', `${pc} ${counts()}`);

    // ════════ Failure after each step ════════
    const failCase = async (label, key, expectCode, expectMsg) => {
        seed(); fail[key] = new Error(`INTERNAL_CREATECO mongodb://u:p@db-host/x ${key}`);
        const x = await call(U.admin, formPayload());
        check(label, x.code === expectCode && counts() === BASE_COUNTS && (!expectMsg || x.body.message === expectMsg) && !/INTERNAL_CREATECO|mongodb|db-host/.test(x.text), `${x.code} ${x.body.message || ''} counts=${counts()}`);
    };
    await failCase('R1  Company insert fails → 500 "Failed to create company", nothing left', 'companies.create', 500, 'Failed to create company');
    await failCase('R2  Owner User insert fails after Company → 500, Company rolled back', 'users.create', 500, 'Failed to create company');
    await failCase('R3  Owner Employee insert fails after Company + User → 500, both rolled back', 'employees.create', 500, 'Failed to create company');
    seed(); db.employees.push({ _id: OID(), userId: OID(), companyId: OID(), position: 'Company Owner', permissions: ['ALL_ACCESS'], isActive: true });
    const realEnsureFind = Employee.findOne;
    Employee.findOne = (f) => (f && f.position === 'Company Owner' && f.userId && f.userId.$ne ? q(Employee, 'employees', () => ({ _id: OID() }), {}) : realEnsureFind(f));
    r = await call(U.admin, formPayload());
    Employee.findOne = realEnsureFind;
    check('R4  Owner-employee conflict (OWNER_EMPLOYEE_CONFLICT) → 409, Company + User rolled back', r.code === 409 && counts() === '1/4/3', `${r.code} ${r.body.message || ''} ${counts()}`);
    seed(); fail['audit.create'] = new Error('audit store down');
    r = await call(U.admin, formPayload());
    check('R5  Audit write fails after all three records → still 201 (non-fatal), records complete', r.code === 201 && counts() === '2/5/3', `${r.code} ${counts()}`);
    // R6 previously asserted the compensating-rollback design ("rollback (company)" failure logged, a PENDING owner-less
    // company left behind). With the transaction there are no compensating deletes: the abort removes everything.
    seed(); fail['employees.create'] = new Error('employee insert failed'); fail['companies.delete'] = new Error('delete failed INTERNAL_RB');
    const deletesBefore = deleteCalls;
    r = await call(U.admin, formPayload());
    check('R6  Employee insert fails (deletes broken too) → safe 500, NOTHING left, no compensating delete attempted', r.code === 500 && r.body.message === 'Failed to create company' && !r.text.includes('INTERNAL_RB')
        && counts() === BASE_COUNTS && deleteCalls === deletesBefore, `${r.code} ${counts()} deletes=${deleteCalls - deletesBefore}`);
    check('R7  Every session started by a create was ended (success and failure paths)', sessions.length > 0 && sessions.every((s) => s.ended), `${sessions.length} sessions`);

    // ════════ Credentials never logged / returned ════════
    const allLogs = logs.join('\n');
    check('S1  No submitted password appears in any log line', [...PASSWORDS].every((p) => !allLogs.includes(p)), `${PASSWORDS.size} passwords checked`);
    check('S2  No bcrypt hash appears in any log line or response', !/\$2[aby]\$/.test(allLogs) && !all.some((x) => /\$2[aby]\$/.test(x.text)));
    check('S3  No response leaked Mongoose/driver text', !all.some((x) => /validation failed|Path `|Cast to|E11000|dup key/.test(x.text)));

    server.close();
    const passed = results.filter(Boolean).length;
    out(`\nCREATE-COMPANY: ${passed}/${results.length} passed`);
    process.exitCode = passed === results.length ? 0 : 1;
})().catch((e) => { out('HARNESS CRASH ' + e.stack); process.exitCode = 1; process.exit(1); });
