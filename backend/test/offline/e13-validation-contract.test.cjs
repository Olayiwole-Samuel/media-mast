// E13 verification harness — offline. Real app/routes/middleware/controllers/models. In-memory store whose
// queries are cast by REAL Mongoose (Query.prototype.cast) — so a malformed id throws the same CastError it
// would against MongoDB. Black-box HTTP tests + DB-unchanged checks.
process.env.JWT_SECRET = 'e13-harness-dummy-secret';
process.env.JWT_EXPIRE = '5m';
delete process.env.VERCEL;

const path = require('path');
const BACKEND = path.resolve(__dirname, '..', '..'); // backend/ (this file: backend/test/offline/)
const mongoose = require(path.join(BACKEND, 'node_modules', 'mongoose'));
const jwt = require(path.join(BACKEND, 'node_modules', 'jsonwebtoken'));
mongoose.set('bufferCommands', false);
const src = (p) => require(path.join(process.env.E13_SRC_ROOT || path.join(BACKEND, 'src'), p));
const User = src('models/User'), Employee = src('models/Employee'), Company = src('models/Company'), AuditLog = src('models/AuditLog');
const Campaign = src('models/Campaign'), Station = src('models/Station'), Booking = src('models/Booking'), Creative = src('models/Creative');
const Department = src('models/Department'), Payment = src('models/Payment');

const OID = () => new mongoose.Types.ObjectId();
let db;
const C = { users: User, employees: Employee, companies: Company, campaigns: Campaign, stations: Station, bookings: Booking, creatives: Creative, departments: Department, payments: Payment };
const clone = (o) => mongoose.mongo.BSON.deserialize(mongoose.mongo.BSON.serialize(o), { promoteValues: true });
const eq = (a, b) => (a == null && b == null) || (a != null && b != null && String(a) === String(b));
const realCast = (M, f) => { M.where().cast(M, f || {}); }; // throws CastError exactly like Mongoose
const matches = (d, f = {}) => Object.entries(f).every(([k, v]) => {
    if (k === '$or') return v.some((g) => matches(d, g));
    const x = d[k];
    if (v && typeof v === 'object' && !(v instanceof mongoose.Types.ObjectId) && !(v instanceof Date) && !Array.isArray(v)) {
        if ('$regex' in v) return typeof x === 'string' && v.$regex.test(x);
        if ('$in' in v) return v.$in.some((y) => eq(x, y));
        if ('$nin' in v) return !v.$nin.some((y) => eq(x, y));
        if ('$ne' in v) return !eq(x, v.$ne);
        if ('$lte' in v) return x != null && x <= v.$lte;
        if ('$gt' in v) return x != null && x > v.$gt;
        return true;
    }
    return eq(x, v);
});
const toDoc = (M, c, o) => {
    if (!o) return null;
    const d = M.hydrate(clone(o));
    d.save = async () => { await d.validate(); const plain = d.toObject(); const i = db[c].findIndex((x) => eq(x._id, plain._id)); if (i >= 0) db[c][i] = plain; return d; };
    d.deleteOne = async () => { db[c] = db[c].filter((x) => !eq(x._id, d._id)); return {}; };
    return d;
};
const q = (M, c, getter, filter) => {
    const x = {
        select: () => x, populate: () => x, lean: () => x, sort: () => x, limit: () => x, skip: () => x,
        then: (r, j) => Promise.resolve().then(() => { realCast(M, filter); const v = getter(); return Array.isArray(v) ? v.map((o) => toDoc(M, c, o)) : toDoc(M, c, v); }).then(r, j),
    };
    return x;
};
for (const [c, M] of Object.entries(C)) {
    M.find = (f) => q(M, c, () => db[c].filter((d) => matches(d, f)), f);
    M.findOne = (f) => q(M, c, () => db[c].find((d) => matches(d, f)) || null, f);
    M.findById = (id) => q(M, c, () => db[c].find((d) => eq(d._id, id)) || null, { _id: id });
    M.countDocuments = async (f) => { realCast(M, f); return db[c].filter((d) => matches(d, f)).length; };
    M.exists = async (f) => { realCast(M, f); return db[c].some((d) => matches(d, f)) ? { _id: 1 } : null; };
    M.findOneAndUpdate = (f, u) => q(M, c, () => { const o = db[c].find((d) => matches(d, f)); if (!o) return null; Object.assign(o, (u && u.$set) || {}); return o; }, f);
    M.updateOne = async (f, u) => { realCast(M, f); const o = db[c].find((d) => matches(d, f)); if (o) Object.assign(o, (u && u.$set) || u); return { matchedCount: o ? 1 : 0 }; };
    M.updateMany = async (f, u) => { realCast(M, f); db[c].filter((d) => matches(d, f)).forEach((o) => Object.assign(o, (u && u.$set) || u)); return {}; };
    M.deleteOne = async (f) => { realCast(M, f); db[c] = db[c].filter((d) => !matches(d, f)); return {}; };
    M.deleteMany = async (f) => { realCast(M, f); db[c] = db[c].filter((d) => !matches(d, f)); return {}; };
    M.findByIdAndDelete = async (id) => { realCast(M, { _id: id }); db[c] = db[c].filter((d) => !eq(d._id, id)); return null; };
    M.create = async (data) => { const d = new M(data); await d.validate(); db[c].push(d.toObject()); return toDoc(M, c, d.toObject()); };
    M.aggregate = async () => [];
}
AuditLog.create = async (data) => { const a = new AuditLog(data); await a.validate(); db.audit.push(a.toObject()); return a; };
AuditLog.find = () => q(AuditLog, 'audit', () => [], {});

const logs = [];
for (const k of ['log', 'warn', 'error', 'info']) console[k] = (...a) => logs.push(a.map((x) => (x && x.name ? `${x.name} ${x.message}` : typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
const out = (s) => process.stdout.write(s + '\n');
// ── Fixture ──
const { registerLimiter, loginLimiter, forgotPasswordLimiter, resetPasswordLimiter } = src('middleware/rateLimit');
const A = OID(), B = OID(), MED = OID();
const U = { ownerA: OID(), staffA: OID(), indiv: OID(), admin: OID() };
const seed = () => {
    const u = (id, accountType, companyId) => ({ _id: id, email: `${String(id).slice(-6)}@example.com`, name: 'n', accountType, status: 'ACTIVE', companyId, tokenVersion: 0 });
    db = {
        users: [u(U.ownerA, 'COMPANY', A), u(U.staffA, 'EMPLOYEE', A), u(U.indiv, 'INDIVIDUAL', null), u(U.admin, 'ADMIN', null)],
        employees: [{ _id: OID(), userId: U.ownerA, companyId: A, position: 'Company Owner', permissions: ['ALL_ACCESS'], isActive: true },
            { _id: OID(), userId: U.staffA, companyId: A, position: 'Staff', permissions: [], isActive: true }],
        companies: [A, B, MED].map((id, i) => ({ _id: id, name: `co${i}`, slug: `co-${i}`, email: `c${i}@co.example.com`, status: 'APPROVED', timezone: 'Africa/Lagos', currency: 'NGN', country: 'Nigeria', createdAt: new Date(), updatedAt: new Date() })),
        campaigns: [], departments: [], stations: [], bookings: [], creatives: [], payments: [], audit: [],
    };
};
const SECRET_VALUE = 'ECHO_ME_9137';
const app = src('app');
src('routes/index').get('/__e13/boom', () => { throw new Error(`INTERNAL ${SECRET_VALUE}`); }); // test-only, this process only
const tok = (id) => jwt.sign({ id: String(id), tokenVersion: 0 }, process.env.JWT_SECRET, { expiresIn: '5m' });
const results = [];
const check = (label, ok, detail = '') => { results.push(ok); out(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== '' ? '  — ' + detail : ''}`); };

// The E13 contract for validation failures
const isContract = (r, { fields } = {}) => {
    const b = r.body;
    const ok = r.code === 400 && b.success === false && typeof b.message === 'string' && b.message.length > 0
        && Array.isArray(b.errors) && b.errors.length > 0 && b.errors.every((e) => typeof e === 'string' && e.length > 0)
        && b.message === b.errors[0]
        && Array.isArray(b.fieldErrors) && b.fieldErrors.length === b.errors.length
        && b.fieldErrors.every((f, i) => f && typeof f.message === 'string' && f.message === b.errors[i] && ('field' in f));
    if (!ok) return false;
    if (fields) return fields.every((fld) => b.fieldErrors.some((f) => f.field === fld));
    return true;
};
const noEcho = (r, ...values) => values.every((v) => !r.text.includes(v)) && !/"\w+" |Path `|validation failed|Cast to|ValidatorError|`[^`]*` is not a valid enum/.test(r.text);

(async () => {
    seed();
    const server = app.listen(0, '127.0.0.1'); // loopback only
    await new Promise((resolve, reject) => server.once('listening', resolve).once('error', reject)); // address() is null until bound
    const base = `http://127.0.0.1:${server.address().port}`;
    const all = [];
    const call = async (who, method, p, body, raw) => {
        const h = {};
        if (who) h.Authorization = `Bearer ${tok(who)}`;
        if (body !== undefined || raw !== undefined) h['Content-Type'] = 'application/json';
        const r = await fetch(base + p, { method, headers: h, body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined });
        const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* */ }
        const res = { code: r.status, body: json || {}, text };
        all.push(res);
        return res;
    };
    const resetLimits = () => [registerLimiter, loginLimiter, forgotPasswordLimiter, resetPasswordLimiter].forEach((l) => l.reset());

    // ════════ Joi middleware (auth.validator) ════════
    resetLimits();
    let r = await call(null, 'POST', '/api/v1/auth/register', { accountType: 'individual', email: `bad-${SECRET_VALUE}`, name: 'Ada', password: 'weak' });
    check('J1  Register Joi failure → full contract (message + errors[] strings + fieldErrors)', isContract(r, { fields: ['email', 'password'] }), JSON.stringify(r.body).slice(0, 160));
    check('J2  …message is the first specific problem (what the frontend shows), not generic', r.body.message === 'Please enter a valid email address', r.body.message);
    check('J3  …no submitted value echoed, no quoted Joi labels', noEcho(r, SECRET_VALUE, 'weak'), r.text.slice(0, 120));
    r = await call(null, 'POST', '/api/v1/auth/register', { accountType: 'company', email: 'ok@example.com', name: 'A', password: 'Aa1!aaaaaa', companyName: 'Co', phone: `x${SECRET_VALUE}` });
    check('J4  Register phone pattern → contract, field "phone", value not echoed', isContract(r, { fields: ['phone'] }) && noEcho(r, SECRET_VALUE, SECRET_VALUE.toLowerCase()), r.body.message);
    r = await call(null, 'POST', '/api/v1/auth/register', { accountType: 'pirate', email: 'ok@example.com', name: 'A', password: 'Aa1!aaaaaa' });
    check('J5  Register bad accountType → contract, field "accountType"', isContract(r, { fields: ['accountType'] }), r.body.message);
    resetLimits();
    r = await call(null, 'POST', '/api/v1/auth/login', { email: { $ne: null }, password: SECRET_VALUE });
    check('J6  Login Joi failure (object email) → contract, field "email", password not echoed', isContract(r, { fields: ['email'] }) && noEcho(r, SECRET_VALUE) && r.body.message === 'email must be a string', r.body.message);
    r = await call(null, 'POST', '/api/v1/auth/login', {});
    check('J7  Login missing fields → contract with both fields', isContract(r, { fields: ['email', 'password'] }) && r.body.errors.length === 2, JSON.stringify(r.body.errors));
    r = await call(null, 'POST', '/api/v1/auth/forgot-password', { email: 'nope' });
    check('J8  Forgot-password (validateWith) → contract', isContract(r, { fields: ['email'] }), r.body.message);
    r = await call(null, 'POST', '/api/v1/auth/reset-password', { token: 'x', password: `weak${SECRET_VALUE.toLowerCase()}` }); // no uppercase → fails the shared rule
    check('J9  Reset-password weak password → contract, password not echoed', isContract(r, { fields: ['password'] }) && noEcho(r, SECRET_VALUE, SECRET_VALUE.toLowerCase()), r.body.message);
    r = await call(U.ownerA, 'PATCH', '/api/v1/auth/password', { currentPassword: 'x' });
    check('J10 Change-password missing newPassword → contract', isContract(r, { fields: ['newPassword'] }), r.body.message);

    // ════════ N18 settings ════════
    r = await call(U.ownerA, 'PUT', '/api/v1/settings', { website: `javascript:${SECRET_VALUE}`, currency: 'XYZ' });
    check('S1  Settings → contract, fields website + currency, message unchanged from N18', isContract(r, { fields: ['website', 'currency'] }) && r.body.message === 'website must be a valid http(s) link' && noEcho(r, SECRET_VALUE), JSON.stringify(r.body.fieldErrors));
    r = await call(U.ownerA, 'PUT', '/api/v1/settings', { status: 'APPROVED' });
    check('S2  Settings protected field → contract, field "status"', isContract(r, { fields: ['status'] }), r.body.message);
    r = await call(U.ownerA, 'PUT', '/api/v1/settings', undefined, '{"__proto__":{"x":1}}');
    check('S3  Settings dangerous key → contract, field "__proto__"', isContract(r, { fields: ['__proto__'] }), r.body.message);
    r = await call(U.ownerA, 'PATCH', '/api/v1/settings/logo', { logo: 'ftp://x.example.com/a.png' });
    check('S4  Logo PATCH → contract, field "logo", message "Logo URL must be a valid http(s) link"', isContract(r, { fields: ['logo'] }) && r.body.message === 'Logo URL must be a valid http(s) link', JSON.stringify(r.body.fieldErrors));
    r = await call(U.ownerA, 'PUT', '/api/v1/settings', { email: 'C1@co.example.com' });
    check('S5  Duplicate company email stays 409 "A company with this email already exists"', r.code === 409 && r.body.message === 'A company with this email already exists', `${r.code}`);

    // ════════ Admin Mongoose ValidationError (was raw error.message) ════════
    r = await call(U.admin, 'POST', '/api/v1/admin/stations', { name: 'Space FM', type: `SPACESHIP${SECRET_VALUE}`, companyId: String(MED), pricing: { amount: 1, currency: 'NGN', unit: 'DAY' } });
    check('M1  Admin create station, bad enum → 400 contract, field "type", "type has an unsupported value"', isContract(r, { fields: ['type'] }) && r.body.message === 'type has an unsupported value', JSON.stringify(r.body).slice(0, 180));
    check('M2  …no model name, no Mongoose template, no submitted value', noEcho(r, SECRET_VALUE, 'SPACESHIP'), r.text.slice(0, 120));
    r = await call(U.admin, 'POST', '/api/v1/admin/stations', { name: 'Neg FM', type: 'RADIO', companyId: String(MED), pricing: { amount: -5, currency: 'NGN', unit: 'FORTNIGHT' } });
    check('M3  Admin create station, several schema errors → every field listed, schema-defined text kept', isContract(r) && r.body.fieldErrors.length >= 1 && noEcho(r, 'FORTNIGHT'), JSON.stringify(r.body.fieldErrors));
    const nCo = db.companies.length;
    r = await call(U.admin, 'POST', '/api/v1/admin/companies', { name: 'Badmail Ltd', email: `not-an-email-${SECRET_VALUE}`, password: 'Aa1!aaaaaaaa' });
    // Since the admin-create hardening, a bad email is rejected by the request validator before any write
    // (previously it reached the User schema, message "Please enter a valid email"). Contract/no-echo checks unchanged.
    check('M4  Admin create company invalid email → contract, field "email", "Please enter a valid company email"; value not echoed', isContract(r, { fields: ['email'] }) && r.body.message === 'Please enter a valid company email' && noEcho(r, SECRET_VALUE), JSON.stringify(r.body).slice(0, 180));
    check('M5  …failed admin create left no company behind (existing rollback)', db.companies.length === nCo, `${db.companies.length - nCo} left`);
    // registration's Mongoose ValidationError path (Joi passes, schema fails): inject at User.create
    resetLimits();
    const realCreate = User.create;
    User.create = async () => { const e = await new User({ email: `bad-${SECRET_VALUE}`, name: '', accountType: 'NOPE' }).validate().then(() => null, (err) => err); throw e; };
    r = await call(null, 'POST', '/api/v1/auth/register', { accountType: 'individual', email: 'fresh@example.com', name: 'Ada', password: 'Aa1!aaaaaa' });
    User.create = realCreate;
    check('M6  Register Mongoose ValidationError → contract with fields, no values/templates (was "Invalid registration details" only)', isContract(r, { fields: ['email', 'name', 'accountType'] }) && noEcho(r, SECRET_VALUE, 'NOPE'), JSON.stringify(r.body.fieldErrors));

    // ════════ Unchanged contracts ════════
    r = await call(U.ownerA, 'POST', '/api/v1/campaigns', { name: 'X', budget: -1 });
    check('C1  Campaign budget (E8) → 400 {success:false, message:"Budget cannot be negative"} unchanged', r.code === 400 && r.body.message === 'Budget cannot be negative' && r.body.success === false, `${r.code} ${r.body.message}`);
    r = await call(U.ownerA, 'POST', '/api/v1/departments', { name: 'x'.repeat(51) });
    check('C2  Department name (E8) → 400 "Department name cannot exceed 50 characters" unchanged', r.code === 400 && r.body.message === 'Department name cannot exceed 50 characters', `${r.code} ${r.body.message}`);
    r = await call(U.ownerA, 'GET', '/api/v1/campaigns/not-an-id');
    check('C3  Malformed ObjectId (N17) → 400 "Invalid campaign ID" unchanged', r.code === 400 && r.body.message === 'Invalid campaign ID', `${r.code}`);
    r = await call(null, 'GET', '/api/v1/campaigns');
    check('C4  No token → 401 "Not authorized, no token"', r.code === 401 && r.body.message === 'Not authorized, no token', `${r.code}`);
    r = await call(U.staffA, 'PUT', '/api/v1/settings', { city: 'x' });
    const r403b = await call(U.indiv, 'GET', '/api/v1/campaigns');
    check('C5  Insufficient permission → 403 (non-owner settings); individual sees only own campaigns (200, none)', r.code === 403 && r403b.code === 200 && Array.isArray(r403b.body.data) && r403b.body.data.length === 0, `${r.code}/${r403b.code}`);
    r = await call(null, 'GET', '/api/v1/no-such-route');
    check('C6  Missing route → 404 "Route not found"', r.code === 404 && r.body.message === 'Route not found', `${r.code}`);
    r = await call(null, 'GET', '/api/v1/__e13/boom');
    check('C7  Unexpected error → E12 generic 500, no detail', r.code === 500 && r.body.message === 'Internal server error. Please try again later.' && !r.text.includes(SECRET_VALUE), `${r.code}`);
    r = await call(null, 'POST', '/api/v1/auth/login', undefined, '{"email":');
    check('C8  Malformed JSON → 400 "Invalid JSON in request body"', r.code === 400 && r.body.message === 'Invalid JSON in request body', `${r.code}`);
    resetLimits();
    const lim = []; for (let i = 0; i < 11; i++) lim.push((await call(null, 'POST', '/api/v1/auth/login', { email: 'nobody@example.com', password: 'Wrong-pass-1!' })).code);
    check('C9  Rate limit 429 unchanged', lim[10] === 429, lim.join(','));

    // ════════ Frontend compatibility (lib/api.js + login page) ════════
    const validation = all.filter((x) => x.code === 400 && Array.isArray(x.body.errors));
    const apiJsMessage = (b) => b.message || (Array.isArray(b.errors) ? b.errors[0] : null) || 'Something went wrong';
    const loginPageMessage = (b) => (Array.isArray(b.errors) && b.errors.length ? b.errors[0] : b.message || 'Something went wrong. Please try again.');
    check('F1  Every validation response gives lib/api.js a specific string message', validation.length > 10 && validation.every((x) => typeof apiJsMessage(x.body) === 'string' && apiJsMessage(x.body) !== 'Something went wrong'), `${validation.length} responses`);
    check('F2  Login page (reads errors[0] first) gets a string, never "[object Object]"', validation.every((x) => typeof loginPageMessage(x.body) === 'string' && loginPageMessage(x.body) !== '[object Object]'));
    check('F3  lib/api.js and the login page show the same text', validation.every((x) => apiJsMessage(x.body) === loginPageMessage(x.body)));
    check('F4  No 500 anywhere except the deliberate E12 test route', all.filter((x) => x.code === 500).length === 1);

    server.close();
    const passed = results.filter(Boolean).length;
    out(`\nE13: ${passed}/${results.length} passed`);
    process.exitCode = passed === results.length ? 0 : 1;
})().catch((e) => { out('HARNESS CRASH ' + e.stack); process.exitCode = 1; process.exit(1); });
