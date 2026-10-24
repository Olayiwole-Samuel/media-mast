// Admin worker creation (POST /api/v1/admin/companies/:id/workers) verification harness — offline.
// Real app/routes/middleware/controller/validators/models/password hook. Store: real Mongoose filter casting,
// real schema validation + pre-save hooks on create, unique User.email and Employee.userId enforced like
// MongoDB (E11000), failure injection at every step. WORKER_SRC_ROOT points it at an older copy of src/.
'use strict';
process.env.JWT_SECRET = 'worker-harness-dummy-secret';
process.env.JWT_EXPIRE = '5m';
delete process.env.VERCEL;

const path = require('path');
const crypto = require('crypto');
const BACKEND = path.resolve(__dirname, '..', '..'); // backend/ (this file: backend/test/offline/)
const SRC_ROOT = process.env.WORKER_SRC_ROOT || path.join(BACKEND, 'src');
const mongoose = require(path.join(BACKEND, 'node_modules', 'mongoose'));
const jwt = require(path.join(BACKEND, 'node_modules', 'jsonwebtoken'));
const bcrypt = require(path.join(BACKEND, 'node_modules', 'bcryptjs'));
mongoose.set('bufferCommands', false); // any un-faked DB call fails instead of reaching a real DB
const src = (p) => require(path.join(SRC_ROOT, p));
const User = src('models/User'), Employee = src('models/Employee'), Company = src('models/Company');
const Department = src('models/Department'), AuditLog = src('models/AuditLog');

const OID = () => new mongoose.Types.ObjectId();
let db;
const clone = (o) => mongoose.mongo.BSON.deserialize(mongoose.mongo.BSON.serialize(o), { promoteValues: true });
const eq = (a, b) => (a == null && b == null) || (a != null && b != null && String(a) === String(b));
const matches = (d, f = {}) => Object.entries(f).every(([k, v]) => eq(d[k], v));
const C = { users: User, employees: Employee, companies: Company, departments: Department };
const UNIQUE = { users: ['email'], employees: ['userId'] };
const fail = {};   // e.g. fail['employees.create'] = Error
const before = {}; // hooks run right before a create persists (simulate a concurrent writer)
const dup = (c, field, value) => { const e = new Error(`E11000 duplicate key error collection: mm.${c} index: ${field}_1 dup key: { ${field}: "${value}" }`); e.code = 11000; e.keyPattern = { [field]: 1 }; e.keyValue = { [field]: value }; return e; };
const persist = (c, plain) => {
    for (const field of UNIQUE[c] || []) if (db[c].some((x) => !eq(x._id, plain._id) && plain[field] != null && eq(x[field], plain[field]))) throw dup(c, field, plain[field]);
    db[c].push(plain);
};
const runHooks = async (M, d) => { await d.validate(); const r = M.schema.s.hooks.execPre('save', d, [{}]); if (r && r.then) await r; };
const sessionUse = { reads: 0, readsWithSession: 0 };
const q = (M, c, getter, f) => {
    let withSession = false;
    const x = { select: () => x, populate: () => x, lean: () => x, session: (s) => { withSession = !!s; return x; },
        then: (r, j) => Promise.resolve().then(() => {
            sessionUse.reads++; if (withSession) sessionUse.readsWithSession++;
            M.where().cast(M, f || {}); const v = getter(); return v ? M.hydrate(clone(v)) : null;
        }).then(r, j) };
    return x;
};
let deleteCalls = 0;
for (const [c, M] of Object.entries(C)) {
    M.findOne = (f) => q(M, c, () => db[c].find((d) => matches(d, f)) || null, f);
    M.findById = (id) => q(M, c, () => db[c].find((d) => eq(d._id, id)) || null, { _id: id });
    M.create = async (data, options) => {
        if (Array.isArray(data)) { const out = []; for (const d of data) out.push(await M.create(d, options)); return out; }
        if (fail[`${c}.create`]) { const e = fail[`${c}.create`]; delete fail[`${c}.create`]; throw e; }
        const d = new M(data); await runHooks(M, d);
        if (before[c]) { const h = before[c]; delete before[c]; h(); }
        persist(c, d.toObject());
        if (options && options.session && options.session.inserted) options.session.inserted.push([c, d._id]);
        else creates.withoutSession.push(c);
        return M.hydrate(clone(d.toObject()));
    };
    M.findByIdAndDelete = async (id) => {
        deleteCalls++;
        if (fail[`${c}.delete`]) { const e = fail[`${c}.delete`]; delete fail[`${c}.delete`]; throw e; }
        db[c] = db[c].filter((d) => !eq(d._id, id)); return null;
    };
}
const creates = { withoutSession: [] };
// Response population: Employee.findById(id).populate(path, select)….lean() → plain populated object.
const REFS = { userId: 'users', departmentId: 'departments', invitedBy: 'users' };
Employee.findById = (id) => {
    const pops = [];
    const x = { populate: (p, sel) => { pops.push([p, sel]); return x; }, select: () => x, lean: () => x, session: () => x,
        then: (r, j) => Promise.resolve().then(() => {
            if (fail['employees.findById']) { const e = fail['employees.findById']; delete fail['employees.findById']; throw e; }
            const doc = db.employees.find((d) => eq(d._id, id)); if (!doc) return null;
            const outDoc = clone(doc);
            for (const [p, sel] of pops) {
                const ref = db[REFS[p]].find((d) => eq(d._id, outDoc[p]));
                outDoc[p] = ref ? Object.fromEntries([['_id', ref._id], ...sel.split(' ').filter((k) => k in ref).map((k) => [k, ref[k]])]) : null;
            }
            return outDoc;
        }).then(r, j) };
    return x;
};
// Transaction plumbing: an aborted transaction removes exactly the documents inserted with that session
// (other requests' writes stay), the way a real abort only discards its own writes. Real MongoDB atomicity is
// not proven here — see the limitations in the task report.
const sessions = [];
mongoose.startSession = async () => {
    const s = {
        ended: false, inserted: [], options: null,
        async withTransaction(fn, options) {
            s.inserted = []; s.options = options;
            try { await fn(); } catch (e) {
                for (const [c, id] of s.inserted) db[c] = db[c].filter((d) => !eq(d._id, id));
                throw e;
            }
        },
        async endSession() { s.ended = true; },
    };
    sessions.push(s);
    return s;
};
AuditLog.create = async (data) => { if (fail['audit.create']) { const e = fail['audit.create']; delete fail['audit.create']; throw e; } const a = new AuditLog(data); await a.validate(); db.audit.push(a.toObject()); return a; };

const logs = [];
for (const k of ['log', 'warn', 'error', 'info']) console[k] = (...a) => logs.push(a.map((x) => (x && x.name ? `${x.name} ${x.message} ${x.stack || ''}` : typeof x === 'string' ? x : (() => { try { return JSON.stringify(x); } catch { return String(x); } })())).join(' '));
const out = (s) => process.stdout.write(s + '\n');

const U = { admin: OID(), owner: OID(), staff: OID(), indiv: OID() };
const CO = OID(), SUSP = OID(), REJ = OID(), PEND = OID(), OTHER = OID();
const DEPT = OID(), DEPT_INACTIVE = OID(), DEPT_OTHER = OID();
const seed = () => {
    for (const k of Object.keys(fail)) delete fail[k];
    for (const k of Object.keys(before)) delete before[k];
    sessions.length = 0; deleteCalls = 0; creates.withoutSession.length = 0; sessionUse.reads = 0; sessionUse.readsWithSession = 0;
    const u = (id, accountType, companyId, email) => ({ _id: id, email: email || `${String(id).slice(-6)}@example.com`, name: 'n', accountType, status: 'ACTIVE', companyId, tokenVersion: 0 });
    const co = (id, status) => ({ _id: id, name: `Co ${status}`, slug: `co-${String(id).slice(-6)}`, email: `${String(id).slice(-6)}@co.example.com`, status });
    db = {
        users: [u(U.admin, 'ADMIN', null, 'admin@example.com'), u(U.owner, 'COMPANY', CO, 'owner@example.com'), u(U.staff, 'EMPLOYEE', CO, 'staff@example.com'), u(U.indiv, 'INDIVIDUAL', null, 'taken@example.com')],
        employees: [{ _id: OID(), userId: U.owner, companyId: CO, position: 'Company Owner', permissions: ['ALL_ACCESS'], isActive: true },
            { _id: OID(), userId: U.staff, companyId: CO, position: 'Staff', permissions: [], isActive: true }],
        companies: [co(CO, 'APPROVED'), co(SUSP, 'SUSPENDED'), co(REJ, 'REJECTED'), co(PEND, 'PENDING'), co(OTHER, 'APPROVED')],
        departments: [{ _id: DEPT, name: 'Sales', description: 'Sales team', companyId: CO, isActive: true },
            { _id: DEPT_INACTIVE, name: 'Old', companyId: CO, isActive: false },
            { _id: DEPT_OTHER, name: 'Elsewhere', companyId: OTHER, isActive: true }],
        audit: [],
    };
};
const counts = () => `${db.users.length}/${db.employees.length}`;
const BASE_COUNTS = '4/2';
const PASSWORDS = new Set();
const pw = () => { const p = 'Aa1!' + crypto.randomBytes(9).toString('base64url'); PASSWORDS.add(p); return p; };
let n = 0;
// What the admin create page sends (name, email, password, position, optional phone/departmentId)
const payload = (over = {}) => ({ name: 'Ada Worker', email: `worker${++n}@example.com`, password: pw(), position: 'Media Buyer', ...over });

const app = src('app');
const tok = (id) => jwt.sign({ id: String(id), tokenVersion: 0 }, process.env.JWT_SECRET, { expiresIn: '5m' });
const results = [];
const check = (label, ok, detail = '') => { results.push(ok); out(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== '' ? '  — ' + detail : ''}`); };
const isContract = (r, field) => r.code === 400 && r.body.success === false && typeof r.body.message === 'string' && r.body.message === r.body.errors?.[0]
    && Array.isArray(r.body.errors) && r.body.errors.every((e) => typeof e === 'string') && Array.isArray(r.body.fieldErrors) && r.body.fieldErrors.length === r.body.errors.length
    && (!field || r.body.fieldErrors.some((f) => f.field === field));
const leaksSecret = (text) => [...PASSWORDS].some((p) => text.includes(p)) || /\$2[aby]\$\d\d\$/.test(text);

(async () => {
    seed();
    const server = app.listen(0, '127.0.0.1'); // loopback only
    await new Promise((resolve, reject) => server.once('listening', resolve).once('error', reject)); // address() is null until bound
    const base = `http://127.0.0.1:${server.address().port}`;
    const call = async (body, { company = CO, who = U.admin, raw } = {}) => {
        const r = await fetch(`${base}/api/v1/admin/companies/${company}/workers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(who ? { Authorization: `Bearer ${tok(who)}` } : {}) },
            body: raw !== undefined ? raw : JSON.stringify(body),
        });
        const text = await r.text();
        let parsed = {}; try { parsed = JSON.parse(text); } catch { parsed = {}; }
        return { code: r.status, body: parsed, text };
    };
    const lastSession = () => sessions[sessions.length - 1];

    // ── V: valid creation ──
    seed();
    let p = payload({ permissions: ['CAMPAIGN_VIEW', 'BOOKING_VIEW'], departmentId: String(DEPT), image: 'https://cdn.example.com/a.png', email: '  Ada.Worker@Example.COM ' });
    let r = await call(p);
    const nu = db.users.find((x) => x.email === 'ada.worker@example.com');
    const ne = nu && db.employees.find((x) => eq(x.userId, nu._id));
    check('V1  Valid worker → 201, same success message', r.code === 201 && r.body.success === true && r.body.message === 'Company worker created successfully', `${r.code} ${r.body.message}`);
    check('V2  One EMPLOYEE user: ACTIVE, linked to company, mustChangePassword, email normalised', !!nu && nu.accountType === 'EMPLOYEE' && nu.status === 'ACTIVE' && eq(nu.companyId, CO) && nu.mustChangePassword === true && counts() === '5/3', counts());
    check('V3  Password stored hashed (bcrypt), never plaintext', !!nu && nu.password !== p.password && bcrypt.compareSync(p.password, nu.password));
    check('V4  One Employee: linked user, position, permissions, department, invitedBy admin, active', !!ne && ne.position === 'Media Buyer' && JSON.stringify(ne.permissions) === '["CAMPAIGN_VIEW","BOOKING_VIEW"]' && eq(ne.departmentId, DEPT) && eq(ne.invitedBy, U.admin) && ne.isActive === true && ne.acceptedAt instanceof Date);
    check('V5  Response is the populated employee (user, department, invitedBy)', r.body.data?.userId?.email === 'ada.worker@example.com' && r.body.data?.departmentId?.name === 'Sales' && r.body.data?.invitedBy?.email === 'admin@example.com', JSON.stringify(r.body.data?.userId || {}).slice(0, 80));
    check('V6  Response never contains a password or hash', !leaksSecret(r.text) && !/"password"/.test(r.text));
    check('V7  CREATE_COMPANY_WORKER audit entry written after commit', db.audit.length === 1 && db.audit[0].action === 'CREATE_COMPANY_WORKER' && eq(db.audit[0].entityId, ne?._id));
    const s = lastSession();
    check('V8  Ran in one transaction: both inserts in the session, snapshot + majority, session ended', !!s && s.inserted.length === 2 && creates.withoutSession.length === 0 && s.options?.readConcern?.level === 'snapshot' && s.options?.writeConcern?.w === 'majority' && s.ended === true, s ? `${s.inserted.length} in session, ${creates.withoutSession.length} outside` : 'no session');
    check('V9  Pre-checks (department, email) read inside the session', sessionUse.readsWithSession >= 2, `${sessionUse.readsWithSession} session reads`);

    seed();
    r = await call({ name: 'Bo', email: 'bo@example.com', password: pw() });
    const be = db.employees.find((x) => eq(x.userId, db.users.find((y) => y.email === 'bo@example.com')?._id));
    check('V10 Defaults kept: position Team Member, no permissions, no department, image null', r.code === 201 && be?.position === 'Team Member' && be?.permissions.length === 0 && be?.departmentId == null && db.users.find((y) => y.email === 'bo@example.com')?.image === null, `${r.code}`);
    seed();
    r = await call(payload({ phone: '08012345678', departmentId: String(DEPT) }));
    check('V11 Exact admin-page payload (incl. phone) → 201; phone not stored, as before', r.code === 201 && !('phone' in (db.users[db.users.length - 1] || {})), `${r.code} ${r.body.message || ''}`);
    seed();
    r = await call(payload({ position: '', departmentId: '', image: '', permissions: [] }));
    check('V12 Empty optional fields fall back to defaults', r.code === 201 && db.employees[2]?.position === 'Team Member' && db.employees[2]?.departmentId == null, `${r.code} ${r.body.message || ''}`);
    seed();
    r = await call(payload({ permissions: ['ADMIN_ACCESS', 'TEAM_VIEW'] }));
    check('V13 Other known permissions still allowed (same set as the company side)', r.code === 201, `${r.code} ${r.body.message || ''}`);
    seed();
    r = await call(payload(), { company: PEND });
    check('V14 PENDING company still accepts workers (existing rule)', r.code === 201, `${r.code}`);

    // ── M: malformed input → 400 contract, never 500, nothing written ──
    const MALFORMED = [
        ['name missing', { name: undefined }, 'name'],
        ['name number', { name: 123 }, 'name'],
        ['name object', { name: { $gt: '' } }, 'name'],
        ['name blank', { name: '   ' }, 'name'],
        ['name too long', { name: 'x'.repeat(101) }, 'name'],
        ['name control chars', { name: 'Ada\u0000' }, 'name'],
        ['email missing', { email: undefined }, 'email'],
        ['email number', { email: 42 }, 'email'],
        ['email invalid', { email: 'not-an-email' }, 'email'],
        ['email operator', { email: { $ne: null } }, 'email'],
        ['password missing', { password: undefined }, 'password'],
        ['password array (len 8)', { password: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] }, 'password'],
        ['password number', { password: 12345678 }, 'password'],
        ['position number', { position: 7 }, 'position'],
        ['position too long', { position: 'p'.repeat(101) }, 'position'],
        ['departmentId invalid', { departmentId: 'abc' }, 'departmentId'],
        ['departmentId object', { departmentId: { $ne: null } }, 'departmentId'],
        ['permissions string', { permissions: 'CAMPAIGN_VIEW' }, 'permissions'],
        ['permission number', { permissions: [5] }, 'permissions.0'],
        ['permission unknown', { permissions: ['DELETE_EVERYTHING'] }, 'permissions.0'],
        ['image javascript:', { image: 'javascript:alert(1)' }, 'image'],
        ['image with credentials', { image: 'https://u:p@cdn.example.com/a.png' }, 'image'],
        ['image number', { image: 9 }, 'image'],
        ['phone invalid', { phone: 'call me' }, 'phone'],
        ['unknown key status', { status: 'SUSPENDED' }, 'status'],
        ['unknown key accountType', { accountType: 'ADMIN' }, 'accountType'],
        ['unknown key companyId', { companyId: String(OTHER) }, 'companyId'],
    ];
    let malformedOk = 0;
    for (const [label, over, field] of MALFORMED) {
        seed();
        const body = payload(over);
        for (const k of Object.keys(over)) if (over[k] === undefined) delete body[k];
        r = await call(body);
        const ok = isContract(r, field) && counts() === BASE_COUNTS && sessions.length === 0;
        if (ok) malformedOk++;
        check(`M   ${label} → 400 contract on ${field}, nothing written`, ok, `${r.code} ${r.body.message || ''}`);
    }
    seed();
    r = await call(null, { raw: '{"__proto__":{"admin":true},"name":"A","email":"a@example.com","password":"Aa1!aaaa"}' });
    check('M   __proto__ key → 400, nothing written', isContract(r, '__proto__') && counts() === BASE_COUNTS, `${r.code}`);
    seed();
    r = await call([payload()]);
    check('M   Array body → 400 contract, nothing written', isContract(r) && counts() === BASE_COUNTS, `${r.code}`);
    seed();
    r = await call(null, { raw: '{"name":' });
    check('M   Malformed JSON → 400, nothing written', r.code === 400 && counts() === BASE_COUNTS, `${r.code}`);

    // ── P: weak passwords ──
    for (const [label, weak] of [['too short', 'Aa1!a'], ['no uppercase', 'aa1!aaaa'], ['no lowercase', 'AA1!AAAA'], ['no number', 'Aa!aaaaa'], ['no special', 'Aa1aaaaa'], ['8 lowercase (old rule passed)', 'aaaaaaaa']]) {
        seed();
        PASSWORDS.add(weak);
        r = await call(payload({ password: weak }));
        check(`P   Weak password (${label}) → 400 on password, nothing written`, isContract(r, 'password') && counts() === BASE_COUNTS && !r.text.includes(weak), `${r.code} ${r.body.message || ''}`);
    }

    // ── D: duplicate permissions ──
    seed();
    r = await call(payload({ permissions: ['CAMPAIGN_VIEW', 'BOOKING_VIEW', 'CAMPAIGN_VIEW'] }));
    check('D1  Duplicate permissions → 400 "Duplicate permissions are not allowed", nothing written', isContract(r) && r.body.errors.includes('Duplicate permissions are not allowed') && counts() === BASE_COUNTS, `${r.code} ${r.body.message || ''}`);

    // ── A: ALL_ACCESS ──
    for (const [label, perms] of [['alone', ['ALL_ACCESS']], ['mixed with others', ['CAMPAIGN_VIEW', 'ALL_ACCESS']]]) {
        seed();
        r = await call(payload({ permissions: perms }));
        check(`A   ALL_ACCESS ${label} → 400 "ALL_ACCESS can only be assigned to the Company Owner", nothing written`, isContract(r) && r.body.errors.includes('ALL_ACCESS can only be assigned to the Company Owner') && counts() === BASE_COUNTS, `${r.code} ${r.body.message || ''}`);
    }

    // ── O: Company Owner position ──
    for (const position of ['Company Owner', '  company owner  ', 'COMPANY OWNER']) {
        seed();
        r = await call(payload({ position }));
        const owners = db.employees.filter((x) => eq(x.companyId, CO) && x.position === 'Company Owner').length;
        check(`O   Position "${position}" → 400 on position, still exactly one owner`, isContract(r, 'position') && r.body.message === 'Company Owner cannot be assigned to a worker' && owners === 1 && counts() === BASE_COUNTS, `${r.code} ${r.body.message || ''} owners=${owners}`);
    }

    // ── E: duplicate email ──
    for (const [label, email] of [['individual account', 'taken@example.com'], ['company owner account', 'owner@example.com'], ['different case/spaces', '  TAKEN@Example.com ']]) {
        seed();
        r = await call(payload({ email }));
        check(`E   Existing email (${label}) → 409, nothing written`, r.code === 409 && r.body.message === 'A user with this email already exists' && counts() === BASE_COUNTS, `${r.code} ${r.body.message || ''}`);
    }
    seed();
    p = payload({ email: 'race@example.com' });
    before.users = () => { db.users.push({ _id: OID(), email: 'race@example.com', name: 'r', accountType: 'INDIVIDUAL', status: 'ACTIVE', tokenVersion: 0 }); };
    r = await call(p);
    check('E   Concurrent create wins the email (unique index E11000) → 409, no employee, nothing of ours left', r.code === 409 && db.users.filter((x) => x.email === 'race@example.com').length === 1 && db.employees.length === 2, `${r.code} ${r.body.message || ''} ${counts()}`);

    // ── F: failure during creation → transaction aborted, nothing left, no compensating deletes ──
    seed();
    fail['employees.create'] = Object.assign(new Error('simulated employee write failure'), { name: 'MongoServerError' });
    r = await call(payload());
    let ss = lastSession();
    check('F1  Employee write fails → 500 "Failed to create company worker"', r.code === 500 && r.body.message === 'Failed to create company worker', `${r.code} ${r.body.message || ''}`);
    check('F2  …and the worker User is gone too (transaction aborted)', counts() === BASE_COUNTS, counts());
    check('F3  …without any compensating delete', deleteCalls === 0, `${deleteCalls} delete call(s)`);
    check('F4  …and the session was ended', !!ss && ss.ended === true);
    seed();
    before.employees = () => { db.employees.push({ _id: OID(), userId: db.users[db.users.length - 1]._id, companyId: OTHER, position: 'x', permissions: [], isActive: true }); };
    r = await call(payload());
    check('F5  Employee unique userId conflict (E11000) → 409, our User rolled back', r.code === 409 && db.users.length === 4, `${r.code} users=${db.users.length}`);
    seed();
    fail['users.create'] = Object.assign(new Error('simulated user write failure'), { name: 'MongoServerError' });
    r = await call(payload());
    check('F6  User write fails → 500, nothing written', r.code === 500 && counts() === BASE_COUNTS && deleteCalls === 0, `${r.code} ${counts()}`);
    seed();
    fail['audit.create'] = Object.assign(new Error('simulated audit failure'), { name: 'MongoServerError' });
    r = await call(payload());
    check('F7  Audit failure after commit → still 201, worker kept, logged', r.code === 201 && counts() === '5/3' && logs.some((l) => l.includes('Audit log error')), `${r.code} ${counts()}`);
    seed();
    fail['employees.findById'] = Object.assign(new Error('simulated read failure'), { name: 'MongoNetworkError' });
    r = await call(payload({ email: 'popfail@example.com', permissions: ['TEAM_VIEW'] }));
    check('F8  Population failure after commit → still 201 with committed data', r.code === 201 && counts() === '5/3' && r.body.data?.userId?.email === 'popfail@example.com' && JSON.stringify(r.body.data?.permissions) === '["TEAM_VIEW"]', `${r.code} ${r.body.message || ''}`);
    check('F9  Fallback response has no password, hash or invite token fields', r.code === 201 && !leaksSecret(r.text) && !/"password"|inviteTokenHash|inviteExpiresAt/.test(r.text));

    // ── R: existing rules unchanged ──
    seed();
    r = await call(payload(), { company: 'not-an-id' });
    check('R1  Invalid company id → 400 "Invalid company ID"', r.code === 400 && r.body.message === 'Invalid company ID', `${r.code}`);
    r = await call(payload(), { company: OID() });
    check('R2  Unknown company → 404 "Company not found"', r.code === 404 && r.body.message === 'Company not found', `${r.code}`);
    for (const [label, id] of [['SUSPENDED', SUSP], ['REJECTED', REJ]]) {
        r = await call(payload(), { company: id });
        check(`R3  ${label} company → 400, nothing written`, r.code === 400 && r.body.message === 'Cannot add workers to a suspended or rejected company' && counts() === BASE_COUNTS, `${r.code}`);
    }
    r = await call(payload({ name: 5 }), { company: SUSP });
    check('R4  Company checks still run before body validation', r.code === 400 && r.body.message === 'Cannot add workers to a suspended or rejected company', `${r.code} ${r.body.message || ''}`);
    for (const [label, d] of [['inactive', DEPT_INACTIVE], ['other company', DEPT_OTHER], ['unknown', OID()]]) {
        seed();
        r = await call(payload({ departmentId: String(d) }));
        check(`R5  Department ${label} → 400 "Department not found in this company", nothing written`, r.code === 400 && r.body.message === 'Department not found in this company' && counts() === BASE_COUNTS, `${r.code} ${r.body.message || ''}`);
    }
    seed();
    r = await call(payload(), { who: U.owner });
    check('R6  Company owner (non-admin) → 403, nothing written', r.code === 403 && counts() === BASE_COUNTS, `${r.code}`);
    r = await call(payload(), { who: null });
    check('R7  No token → 401, nothing written', r.code === 401 && counts() === BASE_COUNTS, `${r.code}`);

    // ── L: logging ──
    check('L1  No submitted password or bcrypt hash in any log line', !logs.some(leaksSecret), logs.find(leaksSecret)?.slice(0, 80) || 'clean');
    const workerErrors = logs.filter((l) => l.includes('Create company worker error'));
    check('L2  Worker error logs are name/message only (no stack, no submitted body)', workerErrors.length > 0 && workerErrors.every((l) => !/\n\s+at /.test(l) && !l.includes('Media Buyer')), `${workerErrors.length} line(s)`);

    const passed = results.filter(Boolean).length;
    out(`\n${passed}/${results.length} passed`);
    process.exitCode = passed === results.length ? 0 : 1;
    await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
        server.closeAllConnections();
    });
})().catch((e) => { out('HARNESS CRASH ' + e.stack); process.exitCode = 1; });
