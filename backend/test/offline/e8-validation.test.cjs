// E8 verification harness — offline. Real app/routes/middleware/models, in-memory store, dummy JWT secret.
process.env.JWT_SECRET = 'e8-harness-dummy-secret';
process.env.JWT_EXPIRE = '5m';
process.env.ALLOW_DIRECT_BOOKING = 'true'; // these checks exercise the direct (unpaid) booking route
delete process.env.VERCEL;

const path = require('path');
const BACKEND = path.resolve(__dirname, '..', '..'); // backend/ (this file: backend/test/offline/)
const mongoose = require(path.join(BACKEND, 'node_modules', 'mongoose'));
const jwt = require(path.join(BACKEND, 'node_modules', 'jsonwebtoken'));
mongoose.set('bufferCommands', false);

const src = (p) => require(path.join(BACKEND, 'src', p));
const User = src('models/User'), Employee = src('models/Employee'), Company = src('models/Company'), AuditLog = src('models/AuditLog');
const Campaign = src('models/Campaign'), Station = src('models/Station'), Booking = src('models/Booking'), Creative = src('models/Creative');
const Payment = src('models/Payment'), Department = src('models/Department');

const OID = () => new mongoose.Types.ObjectId();
let db;
const regexLog = []; // every $regex the controllers send to the (fake) DB
const C = { users: User, employees: Employee, companies: Company, campaigns: Campaign, stations: Station, bookings: Booking, creatives: Creative, payments: Payment, departments: Department };
const clone = (o) => mongoose.mongo.BSON.deserialize(mongoose.mongo.BSON.serialize(o), { promoteValues: true });
const eq = (a, b) => (a == null && b == null) || (a != null && b != null && String(a) === String(b));
const cmp = (x, y) => (x instanceof Date ? x.getTime() : x) - (y instanceof Date ? y.getTime() : y);
const isId = (v) => /^[0-9a-fA-F]{24}$/.test(String(v));
const matches = (d, f = {}) => Object.entries(f).every(([k, v]) => {
    if (k === '$or') return v.some((g) => matches(d, g));
    const x = d[k];
    if (v && typeof v === 'object' && !(v instanceof mongoose.Types.ObjectId) && !(v instanceof Date) && !Array.isArray(v)) {
        if ('$regex' in v) { regexLog.push(v.$regex); return typeof x === 'string' && v.$regex.test(x); }
        if ('$in' in v) return v.$in.some((y) => eq(x, y));
        if ('$nin' in v) return !v.$nin.some((y) => eq(x, y));
        if ('$ne' in v) return !eq(x, v.$ne);
        if ('$lte' in v) return x != null && cmp(x, v.$lte) <= 0;
        if ('$gt' in v) return x != null && cmp(x, v.$gt) > 0;
        return true;
    }
    if (v instanceof Date) return x instanceof Date && x.getTime() === v.getTime();
    return eq(x, v);
});
const castCheck = (f) => { if (f && f._id !== undefined && typeof f._id !== 'object' && !isId(f._id)) throw new mongoose.Error.CastError('ObjectId', f._id, '_id'); };
const project = (o, sel) => {
    if (!o || !sel) return o;
    const parts = sel.split(/\s+/).filter(Boolean);
    if (parts.every((p) => p.startsWith('-') || p.startsWith('+'))) return o;
    const out = { _id: o._id }; parts.forEach((k) => { if (k in o) out[k] = o[k]; }); return out;
};
const toDoc = (M, c, o) => {
    if (!o) return null;
    const d = M.hydrate(clone(o));
    d.save = async () => { await d.validate(); const plain = d.toObject(); const i = db[c].findIndex((x) => eq(x._id, plain._id)); if (i >= 0) db[c][i] = plain; return d; };
    d.deleteOne = async () => { db[c] = db[c].filter((x) => !eq(x._id, d._id)); return { deletedCount: 1 }; };
    return d;
};
const q = (M, c, getter) => {
    let sel = null;
    const x = {
        select: (s) => { sel = s; return x; }, populate: () => x, lean: () => x, sort: () => x, limit: () => x, skip: () => x,
        then: (r, j) => Promise.resolve().then(() => { const v = getter(); return Array.isArray(v) ? v.map((o) => toDoc(M, c, project(o, sel))) : toDoc(M, c, project(v, sel)); }).then(r, j),
    };
    return x;
};
const hooks = { bookingFindOne: null };
for (const [c, M] of Object.entries(C)) {
    db = db || {};
    M.find = (f) => q(M, c, () => db[c].filter((d) => matches(d, f)));
    M.findOne = (f) => q(M, c, () => { castCheck(f); if (c === 'bookings' && hooks.bookingFindOne) hooks.bookingFindOne(f); return db[c].find((d) => matches(d, f)) || null; });
    M.findById = (id) => q(M, c, () => { castCheck({ _id: id }); return db[c].find((d) => eq(d._id, id)) || null; });
    M.countDocuments = async (f) => db[c].filter((d) => matches(d, f)).length;
    M.exists = async (f) => (db[c].some((d) => matches(d, f)) ? { _id: 1 } : null);
    M.findOneAndUpdate = (f, u) => q(M, c, () => { const o = db[c].find((d) => matches(d, f)); if (!o) return null; const before = { ...o }; Object.assign(o, u.$set || {}); return before; });
    M.updateOne = async (f, u) => { const o = db[c].find((d) => matches(d, f)); if (o) Object.assign(o, u.$set || u); return { matchedCount: o ? 1 : 0, modifiedCount: o ? 1 : 0 }; };
    M.updateMany = async (f, u) => { const list = db[c].filter((d) => matches(d, f)); list.forEach((o) => Object.assign(o, u.$set || u)); return { matchedCount: list.length }; };
    M.deleteOne = async (f) => { const n = db[c].length; db[c] = db[c].filter((d) => !matches(d, f)); return { deletedCount: n - db[c].length }; };
    M.deleteMany = async (f) => { const n = db[c].length; db[c] = db[c].filter((d) => !matches(d, f)); return { deletedCount: n - db[c].length }; };
    M.findByIdAndDelete = async (id) => { const o = db[c].find((d) => eq(d._id, id)); db[c] = db[c].filter((d) => !eq(d._id, id)); return o || null; };
    M.create = async (data) => { const d = new M(data); await d.validate(); db[c].push(d.toObject()); return toDoc(M, c, d.toObject()); };
}
AuditLog.create = async (data) => { const a = new AuditLog(data); await a.validate(); db.audit.push(a.toObject()); return a; };
AuditLog.find = () => q(AuditLog, 'audit', () => []);

const logs = [];
for (const k of ["log", "warn", "error", "info"]) console[k] = (...a) => logs.push(a.map((x) => (x instanceof Error ? x.message : typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
const out = (s) => process.stdout.write(s + '\n');

// ── Fixture ──
const A = OID(), B = OID(), M = OID();
const U = { ownerA: OID(), ownerB: OID(), viewerA: OID() };
const ST = OID(), CA = OID();
const future = new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10);
const seed = () => {
    const u = (id, accountType, companyId) => ({ _id: id, email: `${String(id).slice(-6)}@example.com`, name: 'n', accountType, status: 'ACTIVE', companyId, tokenVersion: 0 });
    db = {
        users: [u(U.ownerA, 'COMPANY', A), u(U.ownerB, 'COMPANY', B), u(U.viewerA, 'EMPLOYEE', A)],
        employees: [
            { _id: OID(), userId: U.ownerA, companyId: A, position: 'Company Owner', permissions: ['ALL_ACCESS'], isActive: true },
            { _id: OID(), userId: U.ownerB, companyId: B, position: 'Company Owner', permissions: ['ALL_ACCESS'], isActive: true },
            { _id: OID(), userId: U.viewerA, companyId: A, position: 'Viewer', permissions: ['CAMPAIGN_VIEW'], isActive: true },
        ],
        companies: [A, B, M].map((id) => ({ _id: id, name: 'co', slug: `co-${id}`, email: `${String(id).slice(-6)}@co.example.com`, status: 'APPROVED' })),
        campaigns: [{ _id: CA, companyId: A, userId: U.ownerA, name: 'A', objective: 'Awareness', status: 'DRAFT', budget: 100, startDate: null, endDate: null }],
        stations: [{ _id: ST, name: 'S', slug: 's', type: 'RADIO', companyId: M, approvalStatus: 'APPROVED', isActive: true, inventoryStatus: 'AVAILABLE', pricing: { amount: 50000, currency: 'NGN', unit: 'DAY' }, bookingLockUntil: null }],
        bookings: [], creatives: [], payments: [],
        departments: [{ _id: OID(), companyId: B, name: 'Marketing', isActive: true }], // Company B's — must not clash with A
        audit: [],
    };
};
const get = (c, id) => db[c].find((d) => eq(d._id, id));
const app = src('app');
const tok = (id) => jwt.sign({ id: String(id), tokenVersion: 0 }, process.env.JWT_SECRET, { expiresIn: '5m' });
const results = [];
const check = (label, ok, detail = '') => { results.push(ok); out(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== '' ? '  — ' + detail : ''}`); };

(async () => {
    seed();
    const server = app.listen(0, '127.0.0.1'); // loopback only
    await new Promise((resolve, reject) => server.once('listening', resolve).once('error', reject)); // address() is null until bound
    const base = `http://127.0.0.1:${server.address().port}`;
    const call = async (who, method, p, body) => {
        const h = {};
        if (who) h.Authorization = `Bearer ${tok(who)}`;
        if (body !== undefined) h['Content-Type'] = 'application/json';
        const r = await fetch(base + p, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
        const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* */ }
        return { code: r.status, body: json || {}, text };
    };
    const no500 = [];
    const track = (r) => { no500.push(r.code); return r; };

    // ════════ Campaign budget ════════
    const create = (extra) => call(U.ownerA, 'POST', '/api/v1/campaigns', { name: 'Launch', ...extra }).then(track);
    const n0 = db.campaigns.length;
    let r = await create({ budget: 0 });
    check('B1  budget 0 → 201 (schema min 0; no longer rejected as "missing")', r.code === 201 && r.body.data?.budget === 0, `${r.code} ${r.body.message || ''}`);
    r = await create({ budget: 500000 });
    check('B2  positive integer → 201', r.code === 201 && r.body.data?.budget === 500000, `${r.code}`);
    r = await create({ budget: 1234.56 });
    check('B3  positive decimal → 201 (schema is a plain Number)', r.code === 201 && r.body.data?.budget === 1234.56, `${r.code}`);
    const created = db.campaigns.length - n0;
    for (const [lbl, b, re] of [['missing', undefined, /required/], ['null', null, /required/], ['negative', -1, /cannot be negative/], ['NaN (sent as string)', 'NaN', /must be a number/],
        ['"Infinity" string', 'Infinity', /must be a number/], ['1e309 (JSON → Infinity)', '__1e309__', /must be a number/], ['"10000" string', '10000', /must be a number/],
        ['object', { $gt: 0 }, /must be a number/], ['array', [100], /must be a number/], ['boolean true', true, /must be a number/], ['boolean false', false, /must be a number/], ['empty string', '', /must be a number/]]) {
        const before = db.campaigns.length;
        let x;
        if (b === '__1e309__') { // raw JSON number that parses to Infinity
            x = track(await fetch(`${base}/api/v1/campaigns`, { method: 'POST', headers: { Authorization: `Bearer ${tok(U.ownerA)}`, 'Content-Type': 'application/json' }, body: '{"name":"Launch","budget":1e309}' })
                .then(async (res) => ({ code: res.status, body: await res.json() })));
        } else x = await create(b === undefined ? {} : { budget: b });
        check(`B4  budget ${lbl} → 400 "${(x.body.message || '')}"`, x.code === 400 && re.test(x.body.message || '') && db.campaigns.length === before, `${x.code}`);
    }
    check('B5  Only the 3 valid creates were stored', created === 3 && db.campaigns.length === n0 + 3);
    const cid = db.campaigns[db.campaigns.length - 1]._id;
    r = track(await call(U.ownerA, 'PUT', `/api/v1/campaigns/${cid}`, { budget: 0 }));
    check('B6  Update budget → 0 → 200', r.code === 200 && get('campaigns', cid).budget === 0, `${r.code}`);
    const up = [];
    for (const b of [-5, '99', null, { x: 1 }, [1], true]) { const x = track(await call(U.ownerA, 'PUT', `/api/v1/campaigns/${cid}`, { budget: b })); up.push(x.code); }
    check('B7  Update with invalid budget (-5, "99", null, object, array, true) → 400 each, value unchanged (was a 500 cast error)', up.every((c) => c === 400) && get('campaigns', cid).budget === 0, up.join(','));
    r = track(await call(U.ownerA, 'PUT', `/api/v1/campaigns/${cid}`, { name: 'Renamed' }));
    check('B8  Update without budget unaffected → 200', r.code === 200 && get('campaigns', cid).name === 'Renamed', `${r.code}`);

    // ════════ Department names ════════
    const dept = (name, who = U.ownerA) => call(who, 'POST', '/api/v1/departments', name === undefined ? {} : { name }).then(track);
    for (const n of ['Marketing', 'Sales', 'Human Resources', 'Finance', 'Operations', 'Media & Communications', "R&D (Lagos) - Team #1", 'Café / Ventes', "O'Brien's Unit", 'Ops, Inc.']) {
        r = await dept(n);
        check(`D1  "${n}" → 201, stored as given`, r.code === 201 && db.departments.some((d) => eq(d.companyId, A) && d.name === n), `${r.code} ${r.body.message || ''}`);
    }
    r = await dept('  Logistics  ');
    check('D2  Surrounding spaces trimmed', r.code === 201 && db.departments.some((d) => d.name === 'Logistics'), `${r.code}`);
    r = await dept('marketing');
    check('D3  Case-insensitive duplicate still detected ("marketing" vs "Marketing") → 400', r.code === 400 && /already exists/.test(r.body.message || ''), `${r.code}`);
    r = await dept('MEDIA & COMMUNICATIONS');
    check('D3b Duplicate detection works for names with & and spaces', r.code === 400 && /already exists/.test(r.body.message || ''), `${r.code}`);
    // regex metacharacters: matched literally — no crash, no wildcard duplicate
    const metas = ['(', ')', '[', ']', '{', '}', '*', '+', '?', '.', '|', '^', '$', '\\', '.*', '(a+)+$', '[a-z', 'a{1,99999}', '^Marketing$', 'Mark.ting', 'Sales|Finance', '(?=x)'];
    const metaCodes = [];
    for (const n of metas) { const x = await dept(n); metaCodes.push(x.code); }
    check('D4  Regex metacharacter names never 500 and are stored literally (201)', metaCodes.every((c) => c === 201) && metas.every((n) => db.departments.some((d) => eq(d.companyId, A) && d.name === n)), metaCodes.join(','));
    check('D5  ".*", "^Marketing$", "Mark.ting", "Sales|Finance" were NOT treated as duplicates of existing names', ['.*', '^Marketing$', 'Mark.ting', 'Sales|Finance'].every((n) => db.departments.some((d) => d.name === n)));
    r = await dept('.*');
    check('D6  Exact duplicate of a metacharacter name (".*") → 400 (literal match)', r.code === 400 && /already exists/.test(r.body.message || ''), `${r.code}`);
    for (const [lbl, v, re] of [['missing', undefined, /required/], ['empty', '', /required/], ['whitespace', '    ', /required/], ['number', 42, /required/], ['object', { $regex: '.*' }, /required/],
        ['array', ['Sales'], /required/], ['boolean', true, /required/], ['null', null, /required/], ['51 chars', 'x'.repeat(51), /cannot exceed 50/], ['10 000 chars', 'a'.repeat(10000), /cannot exceed 50/],
        ['newline', 'Sales\nTeam', /invalid characters/], ['NUL byte', 'Sales\u0000', /invalid characters/], ['tab', 'Sales\tTeam', /invalid characters/]]) {
        const before = db.departments.length;
        const x = await dept(v);
        check(`D7  name ${lbl} → 400`, x.code === 400 && re.test(x.body.message || '') && db.departments.length === before, `${x.code} ${x.body.message || ''}`);
    }
    r = await dept('x'.repeat(50));
    check('D8  Exactly 50 characters → 201 (schema maxlength)', r.code === 201, `${r.code}`);
    r = await dept('Marketing', U.ownerB);
    check('D9  Company B duplicate check is per company (B already has Marketing → 400)', r.code === 400, `${r.code}`);
    const aMarketing = db.departments.find((d) => eq(d.companyId, A) && d.name === 'Finance');
    const upd = [];
    for (const n of ['(', '.*', 'a'.repeat(60), { $ne: 1 }, '', 'Sales\n']) { const x = track(await call(U.ownerA, 'PUT', `/api/v1/departments/${aMarketing._id}`, { name: n })); upd.push(x.code); }
    check('D10 Update with "(" → 400 duplicate (exists literally), ".*" → 400 duplicate, too long / object / empty / control → 400', upd.every((c) => c === 400) && get('departments', aMarketing._id).name === 'Finance', upd.join(','));
    r = track(await call(U.ownerA, 'PUT', `/api/v1/departments/${aMarketing._id}`, { name: 'Finance & Accounts' }));
    check('D11 Update to a normal new name → 200', r.code === 200 && get('departments', aMarketing._id).name === 'Finance & Accounts', `${r.code}`);
    r = track(await call(U.ownerA, 'PUT', `/api/v1/departments/${aMarketing._id}`, { description: 'Only description' }));
    check('D12 Update without name unaffected → 200', r.code === 200, `${r.code}`);
    // Each regex the controller sent must be anchored + case-insensitive and match its own input literally:
    // the ".*" lookup matched the stored ".*" name but never "Marketing"; "(a+)+$" matched only itself.
    const reFor = (n) => regexLog.filter((re) => re.test(n) && re.test(n.toUpperCase()));
    check('D13 DB regexes are escaped literals: anchored, case-insensitive, ".*" never matches "Marketing"', regexLog.length > 0
        && regexLog.every((re) => re.flags === 'i' && re.source.startsWith('^') && re.source.endsWith('$'))
        && metas.every((n) => reFor(n).length > 0)
        && regexLog.filter((re) => re.test('.*')).every((re) => !re.test('Marketing') && !re.test('Sales'))
        && regexLog.filter((re) => re.test('(a+)+$')).every((re) => !re.test('aaaa')), `${regexLog.length} regexes`);

    // ════════ Booking slot ════════
    let hour = 6;
    const book = (slot, omit = false) => {
        const body = { campaignId: String(CA), stationId: String(ST), date: future, time: `${String(hour++).padStart(2, '0')}:00`, duration: 30 };
        if (!omit) body.slot = slot;
        return call(U.ownerA, 'POST', '/api/v1/bookings', body).then(track);
    };
    r = await book('PRIME_TIME');
    check('S1  "PRIME_TIME" (what the frontend sends) → 201', r.code === 201 && r.body.data?.slot === 'PRIME_TIME', `${r.code} ${r.body.message || ''}`);
    r = await book('Morning drive (07:00–09:00)');
    check('S2  Free-text label (no enum imposed) → 201', r.code === 201, `${r.code}`);
    r = await book('  LATE_NIGHT  ');
    const lastAudit = db.audit.filter((a) => a.action === 'CREATE_BOOKING').pop();
    check('S3  Trimmed when stored and in the CREATE_BOOKING audit', r.code === 201 && r.body.data?.slot === 'LATE_NIGHT' && lastAudit?.metadata?.slot === 'LATE_NIGHT', `${r.code} audit=${lastAudit?.metadata?.slot}`);
    for (const [lbl, v, omit] of [['empty', ''], ['whitespace', '   '], ['51 chars', 'x'.repeat(51)], ['10 000 chars', 'x'.repeat(10000)], ['number', 7], ['boolean', true],
        ['object', { $gt: '' }], ['array', ['PRIME_TIME']], ['null', null], ['missing', undefined, true], ['newline', 'PRIME\nTIME'], ['NUL', 'PRIME\u0000'], ['DEL', 'PRIME\u007F']]) {
        const before = db.bookings.length;
        const x = await book(v, omit);
        check(`S4  slot ${lbl} → 400`, x.code === 400 && db.bookings.length === before, `${x.code} ${x.body.message || ''}`);
    }
    r = await book('x'.repeat(50));
    check('S5  Exactly 50 characters → 201', r.code === 201, `${r.code}`);
    check('S6  Legacy booking with an unusual stored slot still reads fine', await (async () => {
        db.bookings.push({ _id: OID(), bookingReference: 'BK-legacy', campaignId: CA, stationId: ST, userId: U.ownerA, companyId: A, slot: 'y'.repeat(300), date: new Date(), time: '01:00', duration: 10, price: 1, currency: 'NGN', status: 'COMPLETED' });
        const x = await call(U.ownerA, 'GET', '/api/v1/bookings');
        return x.code === 200 && x.body.data.some((b) => b.bookingReference === 'BK-legacy');
    })());

    // ════════ General ════════
    check('G1  No request in this run returned 500', !no500.includes(500), `${no500.filter((c) => c === 500).length} × 500`);
    check('G2  No server error logged', !logs.some((l) => /❌/.test(l)), logs.filter((l) => /❌/.test(l)).slice(0, 2).join(' | '));
    const deptSrc = require('fs').readFileSync(path.join(BACKEND, 'src/controllers/department.controller.js'), 'utf8');
    check('G3  department.controller has no unescaped new RegExp(`^${name}...`)', !/new RegExp\(`\^\$\{name\}/.test(deptSrc) && /escapeRegex\(name\)/.test(deptSrc));
    r = await call(U.viewerA, 'POST', '/api/v1/departments', { name: 'X' });
    const r2 = await call(null, 'POST', '/api/v1/campaigns', { name: 'X', budget: 1 });
    check('G4  Auth unchanged: non-owner department create → 403, no token → 401', r.code === 403 && r2.code === 401, `${r.code}/${r2.code}`);

    server.close();
    const passed = results.filter(Boolean).length;
    out(`\nE8: ${passed}/${results.length} passed`);
    process.exitCode = passed === results.length ? 0 : 1;
})().catch((e) => { out('HARNESS CRASH ' + e.stack); process.exitCode = 1; process.exit(1); });
