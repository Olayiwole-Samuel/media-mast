// Admin company update (PATCH /api/v1/admin/companies/:id) verification harness — offline.
// Real app/routes/middleware/controller/validators/models. Store: filters cast by real Mongoose, documents
// validated by the real schema on save, unique Company.email/slug and User.email enforced like MongoDB (E11000).
process.env.JWT_SECRET = 'adminco-harness-dummy-secret';
process.env.JWT_EXPIRE = '5m';
delete process.env.VERCEL;

const path = require('path');
const BACKEND = path.resolve(__dirname, '..', '..'); // backend/ (this file: backend/test/offline/)
const SRC_ROOT = process.env.ADMINCO_SRC_ROOT || path.join(BACKEND, 'src');
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
        return true;
    }
    return eq(x, v);
});
const hooks = { beforeCompanySave: null, beforeUserSave: null, companySaveThrows: null };
const UNIQUE = { companies: ['email', 'slug'], users: ['email'] };
const dup = (c, field, value) => { const e = new Error(`E11000 duplicate key error collection: mm.${c} index: ${field}_1 dup key: { ${field}: "${value}" }`); e.code = 11000; e.keyValue = { [field]: value }; return e; };
const persist = (c, plain) => {
    for (const field of UNIQUE[c] || []) if (db[c].some((x) => !eq(x._id, plain._id) && eq(x[field], plain[field]))) throw dup(c, field, plain[field]);
    const i = db[c].findIndex((x) => eq(x._id, plain._id));
    if (i >= 0) db[c][i] = plain; else db[c].push(plain);
};
const toDoc = (M, c, o) => {
    if (!o) return null;
    const d = M.hydrate(clone(o));
    d.save = async () => {
        if (c === 'companies' && hooks.companySaveThrows) { const e = hooks.companySaveThrows; hooks.companySaveThrows = null; throw e; }
        if (c === 'companies' && hooks.beforeCompanySave) { const h = hooks.beforeCompanySave; hooks.beforeCompanySave = null; h(); }
        if (c === 'users' && hooks.beforeUserSave) { const h = hooks.beforeUserSave; hooks.beforeUserSave = null; h(); }
        await d.validate();
        persist(c, d.toObject());
        return d;
    };
    return d;
};
const q = (M, c, getter, filter) => { const x = { select: () => x, populate: () => x, lean: () => x, sort: () => x, then: (r, j) => Promise.resolve().then(() => { M.where().cast(M, filter || {}); return toDoc(M, c, getter()); }).then(r, j) }; return x; };
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
const U = { admin: OID(), ownerA: OID(), staffA: OID(), ownerB: OID(), indiv: OID(), other: OID() };
const COMPANY_A = () => ({ _id: A, name: 'Acme Media', slug: 'acme-media', email: 'info@acme.example.com', phone: '+234 803 123 4567', logo: 'https://cdn.example.com/acme.png', website: 'https://acme.example.com',
    description: 'We buy airtime.', address: '1 Marina', city: 'Lagos', state: 'Lagos', country: 'Nigeria', status: 'APPROVED', subscriptionId: 'sub_a', timezone: 'Africa/Lagos', currency: 'NGN',
    createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01') });
const seed = () => {
    const u = (id, accountType, companyId, email) => ({ _id: id, email: email || `${String(id).slice(-6)}@example.com`, name: 'n', accountType, status: 'ACTIVE', companyId, tokenVersion: 0 });
    db = {
        users: [u(U.admin, 'ADMIN', null), { ...u(U.ownerA, 'COMPANY', A, 'info@acme.example.com'), name: 'Acme Media' }, u(U.staffA, 'EMPLOYEE', A), u(U.ownerB, 'COMPANY', B, 'hello@beta.example.com'),
            u(U.indiv, 'INDIVIDUAL', null), u(U.other, 'INDIVIDUAL', null, 'taken@example.com')],
        employees: [{ _id: OID(), userId: U.ownerA, companyId: A, position: 'Company Owner', permissions: ['ALL_ACCESS'], isActive: true },
            { _id: OID(), userId: U.staffA, companyId: A, position: 'Staff', permissions: ['TEAM_VIEW'], isActive: true },
            { _id: OID(), userId: U.ownerB, companyId: B, position: 'Company Owner', permissions: ['ALL_ACCESS'], isActive: true }],
        companies: [COMPANY_A(), { _id: B, name: 'Beta', slug: 'beta', email: 'hello@beta.example.com', status: 'APPROVED', timezone: 'Africa/Lagos', currency: 'NGN', country: 'Nigeria', createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01') }],
        audit: [],
    };
};
const coA = () => db.companies.find((c) => eq(c._id, A));
const ownerA = () => db.users.find((x) => eq(x._id, U.ownerA));
const frontendPayload = (over = {}) => { const c = COMPANY_A(); return { name: c.name, slug: c.slug, email: c.email, phone: c.phone, logo: c.logo, website: c.website, description: c.description, address: c.address, city: c.city, state: c.state, country: c.country, timezone: c.timezone, currency: c.currency, ...over }; };

const app = src('app');
const tok = (id) => jwt.sign({ id: String(id), tokenVersion: 0 }, process.env.JWT_SECRET, { expiresIn: '5m' });
const results = [];
const check = (label, ok, detail = '') => { results.push(ok); out(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== '' ? '  — ' + detail : ''}`); };
const isContract = (r, field) => {
    const b = r.body;
    return r.code === 400 && b.success === false && typeof b.message === 'string' && b.message.length > 0 && Array.isArray(b.errors) && b.errors.every((e) => typeof e === 'string')
        && b.message === b.errors[0] && Array.isArray(b.fieldErrors) && b.fieldErrors.length === b.errors.length && (!field || b.fieldErrors.some((f) => f.field === field));
};

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
    const patch = (body, id = A, who = U.admin) => call(who, 'PATCH', `/api/v1/admin/companies/${id}`, body);
    const snap = () => JSON.stringify([db.companies, db.users]);
    const rejects = async (label, body, { code = 400, field, msg, raw = false, contract = true } = {}) => {
        seed(); const before = snap(); const a = db.audit.length;
        const r = raw ? await call(U.admin, 'PATCH', `/api/v1/admin/companies/${A}`, undefined, body) : await patch(body);
        const ok = r.code === code && snap() === before && db.audit.length === a && (code !== 400 || !contract || isContract(r, field)) && (!msg || r.body.message === msg);
        check(label, ok, `${r.code} ${r.body.message || ''}`);
        return r;
    };

    // ════════ Auth / IDs ════════
    seed();
    let r = await call(null, 'PATCH', `/api/v1/admin/companies/${A}`, { city: 'Abuja' });
    check('Z1  No token → 401', r.code === 401 && coA().city === 'Lagos', `${r.code}`);
    for (const [who, lbl] of [[U.ownerA, 'company owner'], [U.staffA, 'employee'], [U.indiv, 'individual']]) {
        r = await patch({ city: 'Abuja' }, A, who);
        check(`Z2  ${lbl} → 403 "Access denied. Admin account required.", unchanged`, r.code === 403 && coA().city === 'Lagos', `${r.code}`);
    }
    const idCodes = [];
    for (const bad of ['abc', '123', 'not-an-id', 'aaaaaaaaaaaa']) idCodes.push((await patch({ city: 'Abuja' }, bad)).code);
    check('Z3  Malformed company id → 400 "Invalid company ID" before any lookup', idCodes.every((c) => c === 400), idCodes.join(','));
    r = await patch({ city: 'Abuja' }, String(new mongoose.Types.ObjectId()));
    check('Z4  Valid but missing company id → 404 "Company not found"', r.code === 404 && r.body.message === 'Company not found', `${r.code}`);

    // ════════ Valid updates ════════
    seed();
    r = await patch(frontendPayload({ name: '  Acme Media Group ', slug: 'Acme-Media-Group', email: ' New@ACME.example.com ', phone: '08031234567', website: 'https://www.acme.example.com', currency: 'usd', timezone: 'Europe/London' }));
    check('V1  Admin full form payload (all 13 fields, as the admin UI sends) → 200 "Company updated successfully"', r.code === 200 && r.body.message === 'Company updated successfully', `${r.code} ${r.body.message || ''}`);
    check('V2  Normalised: trimmed name, lowercased slug/email, uppercased currency', coA().name === 'Acme Media Group' && coA().slug === 'acme-media-group' && coA().email === 'new@acme.example.com' && coA().currency === 'USD' && coA().timezone === 'Europe/London');
    check('V3  Owner user email + name kept in step (existing sync)', ownerA().email === 'new@acme.example.com' && ownerA().name === 'Acme Media Group');
    check('V4  UPDATE_COMPANY audit records changes', db.audit.some((x) => x.action === 'UPDATE_COMPANY' && x.changes?.email?.to === 'new@acme.example.com'));
    seed();
    r = await patch(frontendPayload({ city: 'Abuja' }));
    check('V5  Legacy stored phone "+234 803 123 4567" sent back unchanged does not block an unrelated edit', r.code === 200 && coA().city === 'Abuja' && coA().phone === '+234 803 123 4567', `${r.code} ${r.body.message || ''}`);
    seed();
    r = await patch({ city: 'Abuja' });
    check('V6  Partial update (city only) → 200, other fields untouched', r.code === 200 && coA().city === 'Abuja' && coA().email === 'info@acme.example.com' && coA().subscriptionId === 'sub_a', `${r.code}`);
    seed();
    r = await patch({ timezone: null, currency: null, phone: null, website: '' });
    check('V7  Admin can still clear timezone/currency/phone/website (existing admin behaviour)', r.code === 200 && coA().timezone === null && coA().currency === null && coA().phone === null && coA().website === null, `${r.code}`);
    await rejects('V8  {} → 400 "No changes were provided" (existing non-validation response, unchanged)', {}, { msg: 'No changes were provided', contract: false });
    seed(); const b8 = snap();
    r = await patch(frontendPayload());
    check('V9  Payload identical to stored record → 400 "No changes were provided", nothing written', r.code === 400 && r.body.message === 'No changes were provided' && snap() === b8, `${r.code}`);

    // ════════ Invalid values per field ════════
    const INVALID = {
        name: ['', '   ', null, {}, ['A'], 42, true, 'x'.repeat(101), 'Acme\nMedia'],
        slug: ['', null, 'acme media', 'acme--media', '-acme', 'acme_media', 'ac/me', {}, 5, 'x'.repeat(101)],
        email: ['not-an-email', 'a@b', '', null, {}, ['a@b.co'], 7],
        phone: ['abc', '123', {}, [], 8031234567],
        website: ['javascript:alert(1)', 'data:text/html,hi', 'ftp://acme.example.com', 'https://user:pass@acme.example.com', 'acme.example.com', 'not a url', `https://acme.example.com/${'a'.repeat(2100)}`, {}],
        logo: ['javascript:alert(1)', 'vbscript:x', 'https://u:p@cdn.example.com/a.png', '/relative.png', {}],
        description: [{}, [], 'x'.repeat(2001), 'bad\u0007bell'],
        address: [{}, 'x'.repeat(201), 'a\nb'], city: [{}, 'x'.repeat(101), 'Lag\u0000os'], state: [[], 'x'.repeat(101)], country: [{}, 'x'.repeat(101)],
        timezone: ['Mars/Base', 'GMT+99', '', {}, 1], currency: ['XYZ', 'NG', 'NAIRA', '', {}, 566],
    };
    for (const [field, values] of Object.entries(INVALID)) {
        seed(); const before = snap();
        const results2 = [];
        for (const v of values) { const x = await patch({ [field]: v }); results2.push(x.code === 400 && isContract(x, field) ? 400 : `${x.code}!`); }
        check(`F   ${field.padEnd(11)} ${values.length} invalid values → 400 E13 contract (field "${field}"), company + owner unchanged`, results2.every((c) => c === 400) && snap() === before && db.audit.length === 0, results2.join(','));
    }
    await rejects('F2  Invalid email no longer saves the company while the owner sync fails (was a partial update)', { email: 'not-an-email' }, { field: 'email' });
    await rejects('F3  One invalid field inside the full admin form → 400, nothing applied', frontendPayload({ city: 'Abuja', website: 'javascript:alert(1)' }), { field: 'website' });

    // ════════ Unknown / protected / dangerous ════════
    for (const [lbl, body] of [['status (different value)', { status: 'SUSPENDED' }], ['status (same value as stored)', { status: 'APPROVED' }], ['subscriptionId', { subscriptionId: 'sub_free' }],
        ['_id', { _id: String(B) }], ['createdAt', { createdAt: '2000-01-01' }], ['updatedAt', { updatedAt: '2000-01-01' }], ['ownerId', { ownerId: String(U.ownerB) }],
        ['companyId', { companyId: String(B) }], ['isApproved', { isApproved: true }], ['verificationStatus', { verificationStatus: 'VERIFIED' }], ['status alongside a valid field', { city: 'Abuja', status: 'REJECTED' }]]) {
        await rejects(`P   ${lbl} → 400 "… cannot be changed through this endpoint", unchanged`, body, { field: Object.keys(body).find((k) => k !== 'city') });
    }
    for (const [lbl, raw] of [['name {$ne:null}', '{"name":{"$ne":null}}'], ['email {$regex}', '{"email":{"$regex":".*"}}'], ['$set', '{"$set":{"status":"SUSPENDED"}}'], ['$unset', '{"$unset":{"email":1}}'],
        ['$rename', '{"$rename":{"status":"x"}}'], ['dotted path', '{"status.x":"y"}'], ['__proto__', '{"__proto__":{"status":"SUSPENDED","polluted":true}}'],
        ['constructor', '{"constructor":{"prototype":{"polluted":true}}}'], ['prototype', '{"prototype":{"x":1}}'], ['array body', '[{"name":"x"}]']]) {
        await rejects(`O   ${lbl} → 400, unchanged`, raw, { raw: true });
    }
    await rejects('O   JSON null body → 400 "Invalid JSON in request body" (body-parser, D8), unchanged', 'null', { raw: true, contract: false, msg: 'Invalid JSON in request body' });
    check('O2  Object.prototype not polluted', ({}).polluted === undefined && ({}).status === undefined);

    // ════════ Conflicts ════════
    await rejects('C1  Email of another company (any case) → 409 "A company with this email already exists" (pre-check)', { email: 'HELLO@beta.example.com' }, { code: 409, msg: 'A company with this email already exists' });
    await rejects('C2  Email of another user → 409 "A user with this email already exists" (existing)', { email: 'taken@example.com' }, { code: 409, msg: 'A user with this email already exists' });
    await rejects('C3  Slug of another company → 409 "A company with this slug already exists" (existing)', { slug: 'beta' }, { code: 409, msg: 'A company with this slug already exists' });
    seed(); let before = snap();
    hooks.beforeCompanySave = () => { db.companies.find((c) => eq(c._id, B)).email = 'race@acme.example.com'; };
    r = await patch({ email: 'race@acme.example.com' });
    const bNow = db.companies.find((c) => eq(c._id, B));
    check('C4  Race on Company.email unique index at save → 409, Company A + owner unchanged', r.code === 409 && coA().email === 'info@acme.example.com' && ownerA().email === 'info@acme.example.com' && bNow.email === 'race@acme.example.com', `${r.code} ${r.body.message || ''}`);
    seed(); before = snap();
    hooks.beforeUserSave = () => { db.users.find((x) => eq(x._id, U.other)).email = 'late@acme.example.com'; };
    r = await patch({ email: 'late@acme.example.com', name: 'Acme Renamed' });
    check('C5  Race on owner User.email during the sync → 409, company reverted (company and owner stay in step)', r.code === 409 && coA().email === 'info@acme.example.com' && coA().name === 'Acme Media' && ownerA().email === 'info@acme.example.com', `${r.code} company=${coA().email}/${coA().name} owner=${ownerA().email}`);

    // ════════ Unexpected failure ════════
    seed();
    hooks.companySaveThrows = new Error('connection to mongodb://u:p@db-host:27017 lost INTERNAL_X');
    r = await patch({ city: 'Abuja' });
    check('E1  Unexpected failure → safe 500 "Failed to update company", no internals', r.code === 500 && r.body.message === 'Failed to update company' && !/INTERNAL_X|mongodb|db-host/.test(r.text), `${r.code} ${r.body.message}`);

    check('X1  No unexpected 500 in the run (only E1)', all.filter((x) => x.code === 500).length === 1, `${all.filter((x) => x.code === 500).length}`);
    check('X2  No response leaked Mongoose/driver text', !all.some((x) => /validation failed|Path `|Cast to|E11000|dup key/.test(x.text)));

    server.close();
    const passed = results.filter(Boolean).length;
    out(`\nADMIN-COMPANY: ${passed}/${results.length} passed`);
    process.exitCode = passed === results.length ? 0 : 1;
})().catch((e) => { out('HARNESS CRASH ' + e.stack); process.exitCode = 1; process.exit(1); });
