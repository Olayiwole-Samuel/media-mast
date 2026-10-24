// Admin worker update (PATCH /api/v1/admin/companies/:id/workers/:workerId) verification harness — offline.
// Real app/routes/middleware/controller/validators/models. Store: real Mongoose filter casting, real schema
// validation + pre-save hooks on save, unique User.email enforced like MongoDB (E11000), failure injection.
// WORKER_UPDATE_SRC_ROOT points it at an older copy of src/.
'use strict';
process.env.JWT_SECRET = 'worker-update-harness-dummy-secret';
process.env.JWT_EXPIRE = '5m';
delete process.env.VERCEL;

const path = require('path');
const BACKEND = path.resolve(__dirname, '..', '..'); // backend/ (this file: backend/test/offline/)
const SRC_ROOT = process.env.WORKER_UPDATE_SRC_ROOT || path.join(BACKEND, 'src');
const mongoose = require(path.join(BACKEND, 'node_modules', 'mongoose'));
const jwt = require(path.join(BACKEND, 'node_modules', 'jsonwebtoken'));
mongoose.set('bufferCommands', false); // any un-faked DB call fails instead of reaching a real DB
const src = (p) => require(path.join(SRC_ROOT, p));
const User = src('models/User'), Employee = src('models/Employee'), Company = src('models/Company');
const Department = src('models/Department'), AuditLog = src('models/AuditLog');

const OID = () => new mongoose.Types.ObjectId();
let db;
const clone = (o) => mongoose.mongo.BSON.deserialize(mongoose.mongo.BSON.serialize(o), { promoteValues: true });
const eq = (a, b) => (a == null && b == null) || (a != null && b != null && String(a) === String(b));
const matches = (d, f = {}) => Object.entries(f).every(([k, v]) => {
    if (v && typeof v === 'object' && !(v instanceof mongoose.Types.ObjectId) && !Array.isArray(v) && '$ne' in v) return !eq(d[k], v.$ne);
    return eq(d[k], v);
});
const C = { users: User, employees: Employee, companies: Company, departments: Department };
const UNIQUE = { users: ['email'], employees: ['userId'] };
const fail = {};   // e.g. fail['employees.save'] = Error
const before = {}; // hooks run right before a save persists (simulate a concurrent writer)
const dup = (c, field, value) => { const e = new Error(`E11000 duplicate key error collection: mm.${c} index: ${field}_1 dup key: { ${field}: "${value}" }`); e.code = 11000; e.keyPattern = { [field]: 1 }; e.keyValue = { [field]: value }; return e; };
const q = (M, c, getter, f) => { const x = { select: () => x, populate: () => x, lean: () => x, session: () => x, then: (r, j) => Promise.resolve().then(() => { M.where().cast(M, f || {}); const v = getter(); return v ? M.hydrate(clone(v)) : null; }).then(r, j) }; return x; };
for (const [c, M] of Object.entries(C)) {
    M.findOne = (f) => q(M, c, () => db[c].find((d) => matches(d, f)) || null, f);
    M.findById = (id) => q(M, c, () => db[c].find((d) => eq(d._id, id)) || null, { _id: id });
    // Document save: real validation + pre-save hooks, then replace the stored copy (unique indexes enforced).
    M.prototype.save = async function save() {
        if (fail[`${c}.save`]) { const e = fail[`${c}.save`]; delete fail[`${c}.save`]; throw e; }
        await this.validate();
        const r = M.schema.s.hooks.execPre('save', this, [{}]); if (r && r.then) await r;
        if (before[c]) { const h = before[c]; delete before[c]; h(); }
        const plain = this.toObject();
        for (const field of UNIQUE[c] || []) if (db[c].some((x) => !eq(x._id, plain._id) && plain[field] != null && eq(x[field], plain[field]))) throw dup(c, field, plain[field]);
        db[c] = db[c].map((x) => (eq(x._id, plain._id) ? plain : x));
        saves.push(c);
        return this;
    };
}
const saves = [];
const REFS = { userId: 'users', departmentId: 'departments', invitedBy: 'users' };
Employee.findById = (id) => {
    const pops = [];
    const x = { populate: (p, sel) => { pops.push([p, sel]); return x; }, select: () => x, lean: () => x, session: () => x,
        then: (r, j) => Promise.resolve().then(() => {
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
AuditLog.create = async (data) => { const a = new AuditLog(data); await a.validate(); db.audit.push(a.toObject()); return a; };

const logs = [];
for (const k of ['log', 'warn', 'error', 'info']) console[k] = (...a) => logs.push(a.map((x) => (x && x.name ? `${x.name} ${x.message} ${x.stack || ''}` : typeof x === 'string' ? x : (() => { try { return JSON.stringify(x); } catch { return String(x); } })())).join(' '));
const out = (s) => process.stdout.write(s + '\n');

const CO = OID(), OTHER = OID();
const U = { admin: OID(), owner: OID(), worker: OID(), worker2: OID(), legacy: OID(), legacyLc: OID(), otherWorker: OID(), indiv: OID() };
const E = { owner: OID(), worker: OID(), worker2: OID(), legacy: OID(), legacyLc: OID(), otherWorker: OID() };
const DEPT = OID(), DEPT2 = OID(), DEPT_INACTIVE = OID(), DEPT_OTHER = OID();
const seed = () => {
    for (const k of Object.keys(fail)) delete fail[k];
    for (const k of Object.keys(before)) delete before[k];
    saves.length = 0;
    const u = (id, accountType, companyId, email) => ({ _id: id, email, name: `name-${email.split('@')[0]}`, accountType, status: 'ACTIVE', companyId, tokenVersion: 0, password: '$2b$10$' + 'x'.repeat(53), image: null });
    const e = (id, userId, companyId, position, permissions, departmentId = null) => ({ _id: id, userId, companyId, position, permissions, departmentId, isActive: true, invitedBy: U.admin });
    db = {
        users: [u(U.admin, 'ADMIN', null, 'admin@example.com'), u(U.owner, 'COMPANY', CO, 'owner@example.com'),
            u(U.worker, 'EMPLOYEE', CO, 'worker@example.com'), u(U.worker2, 'EMPLOYEE', CO, 'worker2@example.com'),
            u(U.legacy, 'EMPLOYEE', CO, 'legacy@example.com'), u(U.legacyLc, 'EMPLOYEE', CO, 'legacylc@example.com'),
            u(U.otherWorker, 'EMPLOYEE', OTHER, 'other@example.com'), u(U.indiv, 'INDIVIDUAL', null, 'taken@example.com')],
        employees: [e(E.owner, U.owner, CO, 'Company Owner', ['ALL_ACCESS']),
            e(E.worker, U.worker, CO, 'Media Buyer', ['CAMPAIGN_VIEW'], DEPT),
            e(E.worker2, U.worker2, CO, 'Analyst', ['ANALYTICS_VIEW']),
            // Escalation artifacts (e.g. from the old createCompanyWorker): EMPLOYEE accounts holding the owner marker.
            e(E.legacy, U.legacy, CO, 'Company Owner', ['ALL_ACCESS']),
            e(E.legacyLc, U.legacyLc, CO, 'company owner', []),
            e(E.otherWorker, U.otherWorker, OTHER, 'Staff', [])],
        companies: [{ _id: CO, name: 'Co', slug: 'co', email: 'owner@example.com', status: 'APPROVED' }, { _id: OTHER, name: 'Other', slug: 'other', email: 'o@other.example.com', status: 'APPROVED' }],
        departments: [{ _id: DEPT, name: 'Sales', description: 'Sales team', companyId: CO, isActive: true },
            { _id: DEPT2, name: 'Ops', description: 'Operations', companyId: CO, isActive: true },
            { _id: DEPT_INACTIVE, name: 'Old', companyId: CO, isActive: false },
            { _id: DEPT_OTHER, name: 'Elsewhere', companyId: OTHER, isActive: true }],
        audit: [],
    };
};
const snapshot = () => JSON.stringify({ u: db.users, e: db.employees });
const emp = (id) => db.employees.find((x) => eq(x._id, id));
const usr = (id) => db.users.find((x) => eq(x._id, id));
const ownerMarkers = () => db.employees.filter((x) => eq(x.companyId, CO) && String(x.position).toLowerCase() === 'company owner').length;

const app = src('app');
const tok = (id) => jwt.sign({ id: String(id), tokenVersion: 0 }, process.env.JWT_SECRET, { expiresIn: '5m' });
const results = [];
const check = (label, ok, detail = '') => { results.push(ok); out(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== '' ? '  — ' + detail : ''}`); };
const isContract = (r, field) => r.code === 400 && r.body.success === false && typeof r.body.message === 'string' && r.body.message === r.body.errors?.[0]
    && Array.isArray(r.body.errors) && r.body.errors.every((x) => typeof x === 'string') && Array.isArray(r.body.fieldErrors) && r.body.fieldErrors.length === r.body.errors.length
    && (!field || r.body.fieldErrors.some((f) => f.field === field));

(async () => {
    seed();
    const server = app.listen(0, '127.0.0.1'); // loopback only
    await new Promise((resolve, reject) => server.once('listening', resolve).once('error', reject)); // address() is null until bound
    const base = `http://127.0.0.1:${server.address().port}`;
    const call = async (worker, body, { company = CO, who = U.admin, raw } = {}) => {
        const r = await fetch(`${base}/api/v1/admin/companies/${company}/workers/${worker}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...(who ? { Authorization: `Bearer ${tok(who)}` } : {}) },
            body: raw !== undefined ? raw : JSON.stringify(body),
        });
        const text = await r.text();
        let parsed = {}; try { parsed = JSON.parse(text); } catch { parsed = {}; }
        return { code: r.status, body: parsed, text };
    };

    // ── U: legitimate updates keep working ──
    seed();
    // Exactly what the admin edit page sends
    let r = await call(E.worker, { name: ' Ada Updated ', email: 'ADA.New@Example.com', phone: '', position: 'Senior Buyer', departmentId: String(DEPT2), permissions: ['CAMPAIGN_VIEW', 'BOOKING_VIEW'] });
    let w = emp(E.worker), wu = usr(U.worker);
    check('U1  Edit-page payload → 200, same success message', r.code === 200 && r.body.success === true && r.body.message === 'Company worker updated successfully', `${r.code} ${r.body.message}`);
    check('U2  User fields saved (trimmed name, normalised email)', wu.name === 'Ada Updated' && wu.email === 'ada.new@example.com');
    check('U3  Employee fields saved (position, department, permissions)', w.position === 'Senior Buyer' && eq(w.departmentId, DEPT2) && JSON.stringify(w.permissions) === '["CAMPAIGN_VIEW","BOOKING_VIEW"]');
    check('U4  Response is the populated worker, no password/hash', r.body.data?.userId?.email === 'ada.new@example.com' && r.body.data?.departmentId?.name === 'Ops' && !/"password"|\$2[aby]\$/.test(r.text));
    check('U5  UPDATE_COMPANY_WORKER audit with from/to changes', db.audit.length === 1 && db.audit[0].action === 'UPDATE_COMPANY_WORKER' && db.audit[0].changes?.position?.to === 'Senior Buyer');
    seed();
    r = await call(E.worker, { permissions: ['ADMIN_ACCESS', 'TEAM_VIEW'] });
    check('U6  Permissions-only update incl. ADMIN_ACCESS → 200 (same set as the company side)', r.code === 200 && JSON.stringify(emp(E.worker).permissions) === '["ADMIN_ACCESS","TEAM_VIEW"]', `${r.code} ${r.body.message}`);
    seed();
    r = await call(E.worker, { permissions: [] });
    check('U7  Clearing permissions with [] → 200', r.code === 200 && emp(E.worker).permissions.length === 0, `${r.code}`);
    for (const [label, val] of [['null', null], ['""', '']]) {
        seed();
        r = await call(E.worker, { departmentId: val });
        check(`U8  Clearing department with ${label} → 200, departmentId null`, r.code === 200 && emp(E.worker).departmentId == null, `${r.code} ${r.body.message}`);
    }
    seed();
    r = await call(E.worker, { image: 'https://cdn.example.com/p.png' });
    check('U9  Valid image URL → 200, saved', r.code === 200 && usr(U.worker).image === 'https://cdn.example.com/p.png', `${r.code}`);
    seed();
    r = await call(E.worker, { position: 'Media Buyer', permissions: ['CAMPAIGN_VIEW'] });
    check('U10 Same values → 400 "No changes were provided" (unchanged rule)', r.code === 400 && r.body.message === 'No changes were provided', `${r.code} ${r.body.message}`);
    r = await call(E.worker, {});
    check('U11 Empty body → 400 "No changes were provided"', r.code === 400 && r.body.message === 'No changes were provided', `${r.code}`);
    seed();
    r = await call(E.worker, { position: 'Owner Relations Lead' });
    check('U12 A position merely containing "Owner" is allowed', r.code === 200 && emp(E.worker).position === 'Owner Relations Lead', `${r.code} ${r.body.message}`);

    // ── O: "Company Owner" as position, any case ──
    for (const position of ['company owner', 'COMPANY OWNER', 'Company Owner', '  cOmPaNy OwNeR  ']) {
        seed();
        const before0 = snapshot(), markers = ownerMarkers();
        r = await call(E.worker, { position });
        check(`O   Position "${position}" → 400 on position, worker unchanged, no new owner marker`, isContract(r, 'position') && r.body.message === 'Company Owner cannot be assigned to a worker' && snapshot() === before0 && ownerMarkers() === markers, `${r.code} ${r.body.message} markers=${ownerMarkers()}`);
    }

    // ── A / P: ALL_ACCESS, duplicate and unknown permissions ──
    for (const [label, perms, msg] of [
        ['ALL_ACCESS alone', ['ALL_ACCESS'], 'ALL_ACCESS can only be assigned to the Company Owner'],
        ['ALL_ACCESS mixed', ['CAMPAIGN_VIEW', 'ALL_ACCESS'], 'ALL_ACCESS can only be assigned to the Company Owner'],
        ['duplicate', ['TEAM_VIEW', 'BOOKING_VIEW', 'TEAM_VIEW'], 'Duplicate permissions are not allowed'],
        ['unknown', ['CAMPAIGN_VIEW', 'SUPER_ADMIN'], 'One or more permissions are invalid'],
    ]) {
        seed();
        const before0 = snapshot();
        r = await call(E.worker, { permissions: perms });
        check(`P   Permissions ${label} → 400 "${msg}", nothing changed`, isContract(r) && r.body.errors.includes(msg) && snapshot() === before0, `${r.code} ${r.body.message}`);
    }

    // ── M: malformed types and unexpected fields → 4xx contract, never 500, nothing changed ──
    const MALFORMED = [
        ['name number', { name: 123 }, 'name'], ['name object', { name: { $gt: '' } }, 'name'], ['name empty', { name: '  ' }, 'name'],
        ['name too long', { name: 'x'.repeat(101) }, 'name'], ['name control chars', { name: 'A\u0007' }, 'name'],
        ['email number', { email: 7 }, 'email'], ['email invalid', { email: 'nope' }, 'email'], ['email operator', { email: { $ne: null } }, 'email'], ['email empty', { email: '' }, 'email'],
        ['position number', { position: 5 }, 'position'], ['position array', { position: ['Company Owner'] }, 'position'], ['position empty', { position: '' }, 'position'], ['position too long', { position: 'p'.repeat(101) }, 'position'],
        ['departmentId invalid', { departmentId: 'abc' }, 'departmentId'], ['departmentId object', { departmentId: { $ne: null } }, 'departmentId'],
        ['permissions string', { permissions: 'ALL_ACCESS' }, 'permissions'], ['permissions object', { permissions: { 0: 'ALL_ACCESS' } }, 'permissions'], ['permission number', { permissions: [1] }, 'permissions.0'],
        ['image javascript:', { image: 'javascript:alert(1)' }, 'image'], ['image with credentials', { image: 'https://u:p@cdn.example.com/x.png' }, 'image'], ['image number', { image: 3 }, 'image'],
        ['phone invalid', { phone: 'call me' }, 'phone'], ['phone number', { phone: 8012345678 }, 'phone'],
        ['unknown isActive', { isActive: false }, 'isActive'], ['unknown status', { status: 'SUSPENDED' }, 'status'],
        ['unknown accountType', { accountType: 'COMPANY' }, 'accountType'], ['unknown password', { password: 'Aa1!aaaa' }, 'password'],
        ['unknown companyId', { companyId: String(OTHER) }, 'companyId'], ['unknown userId', { userId: String(U.owner) }, 'userId'],
        ['unknown role', { role: 'OWNER' }, 'role'], ['unknown isOwner', { isOwner: true }, 'isOwner'], ['unknown mustChangePassword', { mustChangePassword: false }, 'mustChangePassword'],
    ];
    for (const [label, body, field] of MALFORMED) {
        seed();
        const before0 = snapshot();
        r = await call(E.worker, { name: 'Valid Name', ...body });
        check(`M   ${label} → 400 contract on ${field}, nothing changed`, isContract(r, field) && snapshot() === before0, `${r.code} ${r.body.message || ''}`);
    }
    seed();
    let before0 = snapshot();
    r = await call(E.worker, null, { raw: '{"__proto__":{"position":"Company Owner"},"name":"X"}' });
    check('M   __proto__ key → 400, nothing changed', isContract(r, '__proto__') && snapshot() === before0, `${r.code}`);
    r = await call(E.worker, [{ position: 'Company Owner' }]);
    check('M   Array body → 400 contract, nothing changed', isContract(r) && snapshot() === before0, `${r.code}`);
    r = await call(E.worker, null, { raw: '{"name":' });
    check('M   Malformed JSON → 400, nothing changed', r.code === 400 && snapshot() === before0, `${r.code}`);

    // ── D: the designated Company Owner (and any record holding the owner marker) by ID ──
    for (const [label, body] of [
        ['position change (demote)', { position: 'CEO' }],
        ['remove owner-level permissions', { permissions: [] }],
        ['replace ALL_ACCESS with a subset', { permissions: ['CAMPAIGN_VIEW'] }],
        ['name/email change', { name: 'Hijacked', email: 'attacker@example.com' }],
        ['department change', { departmentId: String(DEPT) }],
        ['empty body', {}],
        ['malformed body', { position: 5, isActive: false }],
    ]) {
        seed();
        before0 = snapshot();
        r = await call(E.owner, body);
        check(`D   Designated owner: ${label} → 403, owner record and login unchanged`, r.code === 403 && r.body.message === 'Cannot modify the company owner through worker management' && snapshot() === before0, `${r.code} ${r.body.message}`);
    }
    seed();
    before0 = snapshot();
    r = await call(E.owner, { position: 'CEO' });
    check('D   Designated owner is refused (any 4xx) and unchanged', r.code >= 400 && r.code < 500 && snapshot() === before0 && emp(E.owner).position === 'Company Owner' && JSON.stringify(emp(E.owner).permissions) === '["ALL_ACCESS"]', `${r.code}`);
    for (const [label, id] of [['EMPLOYEE account holding "Company Owner"', E.legacy], ['EMPLOYEE account holding "company owner" (lowercase)', E.legacyLc]]) {
        seed();
        before0 = snapshot();
        r = await call(id, { name: 'Anything' });
        check(`D   ${label} → 403, unchanged`, r.code === 403 && snapshot() === before0, `${r.code} ${r.body.message}`);
    }

    // ── X: alternate routes to owner powers or the owner's login ──
    seed();
    before0 = snapshot();
    r = await call(E.worker, { email: 'owner@example.com' });
    check('X1  Worker cannot take the owner\'s email → 409, nothing changed', r.code === 409 && snapshot() === before0, `${r.code} ${r.body.message}`);
    seed();
    before0 = snapshot();
    r = await call(E.worker, { position: 'Senior', permissions: ['ALL_ACCESS'], accountType: 'COMPANY' });
    check('X2  Combined escalation attempt (permissions + accountType) → 400, nothing changed', r.code === 400 && snapshot() === before0 && usr(U.worker).accountType === 'EMPLOYEE', `${r.code}`);
    for (const [label, d] of [['inactive', DEPT_INACTIVE], ['other company', DEPT_OTHER], ['unknown', OID()]]) {
        seed();
        before0 = snapshot();
        r = await call(E.worker, { departmentId: String(d) });
        check(`X3  Department ${label} → 400 "Department not found in this company", nothing changed`, r.code === 400 && r.body.message === 'Department not found in this company' && snapshot() === before0, `${r.code} ${r.body.message}`);
    }
    seed();
    before0 = snapshot();
    r = await call(E.worker, { email: 'taken@example.com' });
    check('X4  Email used by another account → 409, nothing changed', r.code === 409 && r.body.message === 'A user with this email already exists' && snapshot() === before0, `${r.code}`);

    // ── Z: authentication, authorization, ids ──
    seed();
    before0 = snapshot();
    r = await call(E.worker, { name: 'X' }, { who: null });
    check('Z1  No token → 401, nothing changed', r.code === 401 && snapshot() === before0, `${r.code}`);
    r = await call(E.worker, { name: 'X' }, { who: U.owner });
    check('Z2  Company owner (non-admin) → 403, nothing changed', r.code === 403 && snapshot() === before0, `${r.code}`);
    r = await call(E.worker, { permissions: ['TEAM_VIEW'] }, { who: U.worker });
    check('Z3  The worker itself (EMPLOYEE) → 403, nothing changed', r.code === 403 && snapshot() === before0, `${r.code}`);
    r = await call(E.worker, { name: 'X' }, { company: 'bad-id' });
    check('Z4  Invalid company id → 400 "Invalid company ID"', r.code === 400 && r.body.message === 'Invalid company ID', `${r.code}`);
    r = await call('bad-id', { name: 'X' });
    check('Z5  Invalid worker id → 400 "Invalid worker ID"', r.code === 400 && r.body.message === 'Invalid worker ID', `${r.code}`);
    r = await call(OID(), { name: 'X' });
    check('Z6  Unknown worker → 404 "Worker not found in this company"', r.code === 404 && r.body.message === 'Worker not found in this company', `${r.code}`);
    r = await call(E.otherWorker, { name: 'X' });
    check('Z7  Worker of another company → 404, nothing changed', r.code === 404 && snapshot() === before0, `${r.code}`);

    // ── F: failures ──
    seed();
    fail['users.save'] = Object.assign(new Error('simulated write failure'), { name: 'MongoServerError' });
    r = await call(E.worker, { name: 'Failing Save' });
    check('F1  Save failure → 500 "Failed to update company worker" (generic)', r.code === 500 && r.body.message === 'Failed to update company worker', `${r.code} ${r.body.message}`);
    seed();
    before.users = () => { db.users.push({ _id: OID(), email: 'race@example.com', name: 'r', accountType: 'INDIVIDUAL', status: 'ACTIVE', tokenVersion: 0 }); };
    r = await call(E.worker, { email: 'race@example.com' });
    check('F2  Concurrent claim of the new email (unique index E11000) → 409', r.code === 409 && r.body.message === 'A user with this email already exists' && usr(U.worker).email === 'worker@example.com', `${r.code}`);

    // ── L: logging ──
    const workerErrors = logs.filter((l) => l.includes('Update company worker error'));
    check('L1  Error logs are name/message only (no stack, no submitted values)', workerErrors.length > 0 && workerErrors.every((l) => !/\n\s+at /.test(l) && !l.includes('Failing Save')), `${workerErrors.length} line(s)`);
    check('L2  No password hash in any log line', !logs.some((l) => /\$2[aby]\$\d\d\$/.test(l)));

    const passed = results.filter(Boolean).length;
    out(`\n${passed}/${results.length} passed`);
    process.exitCode = passed === results.length ? 0 : 1;
    await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
        server.closeAllConnections();
    });
})().catch((e) => { out('HARNESS CRASH ' + e.stack); process.exitCode = 1; });
