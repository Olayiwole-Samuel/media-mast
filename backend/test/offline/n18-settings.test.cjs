// N18 verification harness — offline. Real app/routes/middleware/controller/validator/models. In-memory store:
// filters cast by real Mongoose (Query.cast), documents validated by the real schema on save, unique
// Company.email enforced like MongoDB (E11000). Black-box HTTP tests with DB-unchanged checks.
process.env.JWT_SECRET = 'n18-harness-dummy-secret';
process.env.JWT_EXPIRE = '5m';
delete process.env.VERCEL;

const path = require('path');
const BACKEND = path.resolve(__dirname, '..', '..'); // backend/ (this file: backend/test/offline/)
const SRC_ROOT = process.env.N18_SRC_ROOT || path.join(BACKEND, 'src');
const mongoose = require(path.join(BACKEND, 'node_modules', 'mongoose'));
const jwt = require(path.join(BACKEND, 'node_modules', 'jsonwebtoken'));
mongoose.set('bufferCommands', false);
const src = (p) => require(path.join(SRC_ROOT, p));
const User = src('models/User'), Employee = src('models/Employee'), Company = src('models/Company'), AuditLog = src('models/AuditLog');

const OID = () => new mongoose.Types.ObjectId();
let db;
const clone = (o) => mongoose.mongo.BSON.deserialize(mongoose.mongo.BSON.serialize(o), { promoteValues: true });
const eq = (a, b) => (a == null && b == null) || (a != null && b != null && String(a) === String(b));
const matches = (d, f = {}) => Object.entries(f).every(([k, v]) => {
    const x = d[k];
    if (v && typeof v === 'object' && !(v instanceof mongoose.Types.ObjectId) && !(v instanceof Date) && !Array.isArray(v)) {
        if ('$ne' in v) return !eq(x, v.$ne);
        if ('$in' in v) return v.$in.some((y) => eq(x, y));
        return true;
    }
    return eq(x, v);
});
let beforeSaveHook = null;
const dup = (field, value) => { const e = new Error(`E11000 duplicate key error collection: mm.companies index: ${field}_1 dup key: { ${field}: "${value}" }`); e.code = 11000; e.keyValue = { [field]: value }; return e; };
const persist = (c, plain) => {
    if (c === 'companies') for (const field of ['email', 'slug']) {
        if (db.companies.some((x) => !eq(x._id, plain._id) && eq(x[field], plain[field]))) throw dup(field, plain[field]);
    }
    const i = db[c].findIndex((x) => eq(x._id, plain._id));
    if (i >= 0) db[c][i] = plain; else db[c].push(plain);
};
const toDoc = (M, c, o) => {
    if (!o) return null;
    const d = M.hydrate(clone(o));
    d.save = async () => { await d.validate(); if (beforeSaveHook) { const h = beforeSaveHook; beforeSaveHook = null; h(); } persist(c, d.toObject()); return d; };
    return d;
};
const q = (M, c, getter, filter) => {
    const x = { select: () => x, populate: () => x, lean: () => x, then: (r, j) => Promise.resolve().then(() => { M.where().cast(M, filter || {}); return toDoc(M, c, getter()); }).then(r, j) };
    return x;
};
for (const [c, M] of [['users', User], ['employees', Employee], ['companies', Company]]) {
    M.findOne = (f) => q(M, c, () => db[c].find((d) => matches(d, f)) || null, f);
    M.findById = (id) => q(M, c, () => db[c].find((d) => eq(d._id, id)) || null, { _id: id });
    M.countDocuments = async (f) => db[c].filter((d) => matches(d, f)).length;
}
AuditLog.create = async (data) => { const a = new AuditLog(data); await a.validate(); db.audit.push(a.toObject()); return a; };

const logs = [];
for (const k of ['log', 'warn', 'error', 'info']) console[k] = (...a) => logs.push(a.map((x) => (x && x.name ? `${x.name} ${x.message}` : typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
const out = (s) => process.stdout.write(s + '\n');

const A = OID(), B = OID();
const U = { ownerA: OID(), staffA: OID(), ownerB: OID(), indiv: OID(), admin: OID() };
const COMPANY_A = () => ({ _id: A, name: 'Acme Media', slug: 'acme-media', email: 'info@acme.example.com', phone: '08031234567', logo: 'https://cdn.example.com/acme.png', website: 'https://acme.example.com',
    description: 'We buy airtime.', address: '1 Marina', city: 'Lagos', state: 'Lagos', country: 'Nigeria', status: 'APPROVED', subscriptionId: null, timezone: 'Africa/Lagos', currency: 'NGN', createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01') });
const seed = () => {
    const u = (id, accountType, companyId) => ({ _id: id, email: `${String(id).slice(-6)}@example.com`, name: 'n', accountType, status: 'ACTIVE', companyId, tokenVersion: 0 });
    db = {
        users: [u(U.ownerA, 'COMPANY', A), u(U.staffA, 'EMPLOYEE', A), u(U.ownerB, 'COMPANY', B), u(U.indiv, 'INDIVIDUAL', null), u(U.admin, 'ADMIN', null)],
        employees: [
            { _id: OID(), userId: U.ownerA, companyId: A, position: 'Company Owner', permissions: ['ALL_ACCESS'], isActive: true },
            // Every permission that exists — still not the owner.
            { _id: OID(), userId: U.staffA, companyId: A, position: 'Manager', permissions: ['TEAM_VIEW', 'TEAM_EDIT', 'TEAM_INVITE', 'ANALYTICS_VIEW', 'CAMPAIGN_EDIT', 'PAYMENTS_APPROVE'], isActive: true },
            { _id: OID(), userId: U.ownerB, companyId: B, position: 'Company Owner', permissions: ['ALL_ACCESS'], isActive: true },
        ],
        companies: [COMPANY_A(), { _id: B, name: 'Beta Radio Buyers', slug: 'beta', email: 'hello@beta.example.com', status: 'APPROVED', subscriptionId: 'sub_b', timezone: 'Africa/Lagos', currency: 'NGN', country: 'Nigeria', createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01') }],
        audit: [],
    };
};
const coA = () => db.companies.find((c) => eq(c._id, A));
const coB = () => db.companies.find((c) => eq(c._id, B));

const app = src('app');
const tok = (id) => jwt.sign({ id: String(id), tokenVersion: 0 }, process.env.JWT_SECRET, { expiresIn: '5m' });
const results = [];
const check = (label, ok, detail = '') => { results.push(ok); out(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== '' ? '  — ' + detail : ''}`); };

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
    const put = (body, who = U.ownerA) => call(who, 'PUT', '/api/v1/settings', body);
    const putRaw = (raw, who = U.ownerA) => call(who, 'PUT', '/api/v1/settings', undefined, raw);
    const snap = () => JSON.stringify(db.companies);
    const rejects = async (label, body, re, expCode = 400, raw = false) => {
        seed(); const before = snap(); const a = db.audit.length;
        const x = raw ? await putRaw(body) : await put(body);
        const okMsg = !re || re.test(JSON.stringify(x.body));
        check(label, x.code === expCode && snap() === before && db.audit.length === a && okMsg, `${x.code} ${x.body.message || ''}`);
    };

    // ════════ Authentication / authorization ════════
    let r = await call(null, 'PUT', '/api/v1/settings', { city: 'Abuja' });
    check('Z1  No token → 401', r.code === 401 && coA().city === 'Lagos', `${r.code}`);
    r = await put({ city: 'Abuja' }, U.staffA);
    check('Z2  Employee with every permission but not owner → 403, unchanged', r.code === 403 && coA().city === 'Lagos', `${r.code}`);
    r = await put({ city: 'Abuja' }, U.indiv);
    check('Z3  Individual → 403', r.code === 403, `${r.code}`);
    r = await put({ city: 'Abuja' }, U.admin);
    check('Z4  Admin → 403 here (no company; admins use /admin/companies/:id — existing behaviour)', r.code === 403, `${r.code}`);
    r = await call(U.staffA, 'PATCH', '/api/v1/settings/logo', { logo: 'https://cdn.example.com/x.png' });
    check('Z5  Employee → logo PATCH 403', r.code === 403 && coA().logo === 'https://cdn.example.com/acme.png', `${r.code}`);

    // ════════ Valid updates ════════
    seed();
    r = await put({ name: '  Acme Media Group  ', email: ' Contact@ACME.example.com ', phone: '+2348031234567', website: ' https://www.acme.example.com/about ', logo: 'https://cdn.example.com/new.png',
        description: 'Line one\nLine two', address: '  2 Broad St ', city: 'Abuja', state: 'FCT', country: 'Nigeria', timezone: 'Europe/London', currency: 'usd' });
    const a1 = coA();
    check('V1  Owner full update → 200 "Company settings updated successfully"', r.code === 200 && r.body.message === 'Company settings updated successfully', `${r.code} ${r.body.message || ''}`);
    check('V2  Stored normalised: trimmed text, email lowercased, currency uppercased, multi-line description kept', a1.name === 'Acme Media Group' && a1.email === 'contact@acme.example.com' && a1.website === 'https://www.acme.example.com/about'
        && a1.address === '2 Broad St' && a1.currency === 'USD' && a1.timezone === 'Europe/London' && a1.description === 'Line one\nLine two', JSON.stringify({ e: a1.email, c: a1.currency }));
    check('V3  Response shape unchanged and reflects stored values', r.body.data && r.body.data.email === 'contact@acme.example.com' && r.body.data.currency === 'USD' && 'status' in r.body.data && 'updatedAt' in r.body.data);
    check('V4  UPDATE_COMPANY audit with old/new for each changed field', db.audit.some((x) => x.action === 'UPDATE_COMPANY' && x.metadata?.changes?.email?.new === 'contact@acme.example.com'));
    seed();
    r = await put({ city: 'Abuja' });
    const keep = { ...COMPANY_A(), city: 'Abuja' };
    check('V5  Partial update (city only) → 200; every other field untouched', r.code === 200 && Object.keys(keep).every((k) => eq(coA()[k], keep[k])), `${r.code}`);
    seed();
    r = await put({ phone: null, website: '', description: '   ', logo: null });
    check('V6  Optional fields cleared with null / "" / whitespace → null', r.code === 200 && coA().phone === null && coA().website === null && coA().description === null && coA().logo === null, `${r.code}`);
    await rejects('V7  {} → 400 "No changes to update" (existing contract)', {}, /No changes to update/);
    await rejects('V8  Same values as stored → 400 "No changes to update"', { city: 'Lagos', currency: 'ngn' }, /No changes to update/);
    seed();
    r = await call(U.ownerA, 'PATCH', '/api/v1/settings/logo', { logo: ' https://cdn.example.com/brand.png ' });
    check('V9  Logo PATCH valid https link → 200, trimmed', r.code === 200 && coA().logo === 'https://cdn.example.com/brand.png', `${r.code}`);
    r = await call(U.ownerA, 'GET', '/api/v1/settings');
    check('V10 GET settings unchanged → 200 with company fields', r.code === 200 && r.body.data?.name === 'Acme Media', `${r.code}`);

    // ════════ Invalid values (per field) ════════
    const INVALID = {
        name: ['', '   ', null, {}, ['Acme'], 42, true, 'x'.repeat(101), 'Acme\nMedia', 'Acme\u0000'],
        email: ['not-an-email', 'a@b', '', '   ', null, {}, ['a@b.co'], 5, `${'a'.repeat(250)}@example.com`],
        phone: ['abc', '123', '+234 803 123 4567 890', {}, [], 8031234567, true],
        website: ['javascript:alert(1)', 'data:text/html,hi', 'ftp://acme.example.com', 'file:///etc/passwd', 'https://user:pass@acme.example.com', 'acme.example.com', 'not a url', `https://acme.example.com/${'a'.repeat(2100)}`, {}, 1],
        logo: ['javascript:alert(1)', 'vbscript:x', 'https://u:p@cdn.example.com/a.png', '/relative.png', {}, ['https://x.example.com']],
        description: [{}, [], 7, 'x'.repeat(2001), 'bad\u0007bell'],
        address: [{}, 'x'.repeat(201), 'a\nb'], city: [{}, 'x'.repeat(101), 'Lag\u0000os'], state: [[], 'x'.repeat(101)], country: [{}, 'x'.repeat(101)],
        timezone: ['Mars/Base', 'GMT+99', '', null, {}, 1], currency: ['XYZ', 'NG', 'NAIRA', '', null, {}, 566],
    };
    for (const [field, values] of Object.entries(INVALID)) {
        seed(); const before = snap();
        const codes = [];
        for (const v of values) { const x = await put({ [field]: v }); codes.push(x.code); }
        check(`F   ${field.padEnd(11)} ${values.length} invalid values → 400 each, company unchanged`, codes.every((c) => c === 400) && snap() === before && db.audit.length === 0, codes.join(','));
    }
    await rejects('F2  One invalid field in an otherwise valid body → 400, nothing applied (no partial write)', { city: 'Abuja', website: 'javascript:alert(1)' }, /website must be a valid http\(s\) link/);
    await rejects('F3  400 body has message + errors[] (existing envelope), no Mongoose text', { name: {}, currency: 'XYZ' }, /"success":false,"message":"name must be a string","errors":\["name must be a string","currency must be an ISO 4217/);
    for (const [lbl, v] of [['javascript:', 'javascript:alert(1)'], ['missing', undefined], ['object', { href: 'x' }], ['credentials', 'https://a:b@x.example.com/l.png']]) {
        seed(); const before = snap();
        const x = await call(U.ownerA, 'PATCH', '/api/v1/settings/logo', v === undefined ? {} : { logo: v });
        check(`F4  Logo PATCH ${lbl} → 400, unchanged`, x.code === 400 && snap() === before, `${x.code} ${x.body.message || ''}`);
    }

    // ════════ Protected / unknown fields ════════
    for (const [lbl, body] of [['status APPROVED→SUSPENDED', { status: 'SUSPENDED' }], ['slug', { slug: 'stolen' }], ['subscriptionId', { subscriptionId: 'sub_enterprise' }], ['_id', { _id: String(B) }],
        ['createdAt', { createdAt: '2000-01-01' }], ['updatedAt', { updatedAt: '2000-01-01' }], ['companyId → B', { companyId: String(B), city: 'Abuja' }], ['ownerId', { ownerId: String(U.ownerB) }],
        ['isApproved', { isApproved: true }], ['status alongside a valid field', { city: 'Abuja', status: 'APPROVED' }]]) {
        await rejects(`P   ${lbl} → 400 "cannot be changed through company settings", company unchanged`, body, /cannot be changed through company settings/);
    }

    // ════════ NoSQL operators / dangerous keys ════════
    for (const [lbl, raw] of [['name {$ne:null}', '{"name":{"$ne":null}}'], ['name {$regex:".*"}', '{"name":{"$regex":".*"}}'], ['email {$gt:""}', '{"email":{"$gt":""}}'],
        ['$set {status}', '{"$set":{"status":"APPROVED"}}'], ['$unset {email}', '{"$unset":{"email":1}}'], ['$rename', '{"$rename":{"status":"x"}}'], ['$where', '{"$where":"1==1"}'],
        ['dotted path', '{"status.x":"y"}'], ['__proto__', '{"__proto__":{"status":"APPROVED","polluted":true}}'], ['constructor.prototype', '{"constructor":{"prototype":{"polluted":true}}}'],
        ['prototype', '{"prototype":{"x":1}}'], ['array body', '[{"name":"x"}]'], ['JSON null', 'null']]) {
        await rejects(`O   ${lbl} → 400, company unchanged`, raw, null, 400, true);
    }
    check('O2  Object.prototype not polluted', ({}).polluted === undefined && ({}).status === undefined);

    // ════════ Company isolation / email uniqueness ════════
    seed();
    const bBefore = JSON.stringify(coB());
    r = await put({ email: 'HELLO@beta.example.com' });
    check('I1  Owner A sets email to Company B\'s (any case) → 409, nothing changed (was a 500)', r.code === 409 && r.body.message === 'A company with this email already exists' && coA().email === 'info@acme.example.com', `${r.code} ${r.body.message || ''}`);
    seed();
    beforeSaveHook = () => { coB().email = 'race@acme.example.com'; };
    r = await put({ email: 'race@acme.example.com' });
    check('I2  Lost race on the unique email index → 409 (not 500), A unchanged', r.code === 409 && coA().email === 'info@acme.example.com', `${r.code}`);
    seed();
    r = await put({ name: 'Renamed by A' });
    check('I3  Owner A updates only Company A; Company B untouched', r.code === 200 && coA().name === 'Renamed by A' && JSON.stringify(coB()) === bBefore, `${r.code}`);
    r = await put({ name: 'B renamed' }, U.ownerB);
    check('I4  Owner B updates only Company B', r.code === 200 && coB().name === 'B renamed' && coA().name === 'Renamed by A', `${r.code}`);
    check('I5  Company B protected fields intact after all attempts (status, slug, subscriptionId)', coB().status === 'APPROVED' && coB().slug === 'beta' && coB().subscriptionId === 'sub_b');

    // ════════ Run-wide ════════
    check('X1  No response in the whole run was a 500', !all.some((x) => x.code === 500), all.filter((x) => x.code === 500).length + ' × 500');
    check('X2  No response leaked Mongoose/Mongo internals (Cast to, ValidatorError, E11000)', !all.some((x) => /Cast to|ValidatorError|E11000|ValidationError/.test(x.text)));

    server.close();
    const passed = results.filter(Boolean).length;
    out(`\nN18: ${passed}/${results.length} passed`);
    process.exitCode = passed === results.length ? 0 : 1;
})().catch((e) => { out('HARNESS CRASH ' + e.stack); process.exitCode = 1; process.exit(1); });
