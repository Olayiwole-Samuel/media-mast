// E5 verification harness — offline. Real app/routes/middleware/models, in-memory store, dummy JWT secret.
process.env.JWT_SECRET = 'e5-harness-dummy-secret';
process.env.JWT_EXPIRE = '5m';
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
const C = { users: User, employees: Employee, companies: Company, campaigns: Campaign, stations: Station, bookings: Booking, creatives: Creative, payments: Payment, departments: Department };
const clone = (o) => mongoose.mongo.BSON.deserialize(mongoose.mongo.BSON.serialize(o), { promoteValues: true });
const eq = (a, b) => (a == null && b == null) || (a != null && b != null && String(a) === String(b));
const cmp = (x, y) => (x instanceof Date ? x.getTime() : x) - (y instanceof Date ? y.getTime() : y);
const isId = (v) => /^[0-9a-fA-F]{24}$/.test(String(v));
const matches = (d, f = {}) => Object.entries(f).every(([k, v]) => {
    if (k === '$or') return v.some((g) => matches(d, g));
    const x = d[k];
    if (v && typeof v === 'object' && !(v instanceof mongoose.Types.ObjectId) && !(v instanceof Date) && !Array.isArray(v)) {
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
    const pops = [];
    // populate('campaignId') → attach the referenced campaign document (enough for the creative ownership checks)
    const withPops = (d) => { if (d) pops.forEach((p) => { if (p === 'campaignId' && d.campaignId) { const camp = db.campaigns.find((k) => eq(k._id, d.campaignId)); if (camp) d.campaignId = Campaign.hydrate(clone(camp)); } }); return d; };
    const x = {
        select: (s) => { sel = s; return x; }, populate: (p) => { pops.push(typeof p === 'string' ? p : p?.path); return x; }, lean: () => x, sort: () => x, limit: () => x, skip: () => x,
        then: (r, j) => Promise.resolve().then(() => { const v = getter(); return Array.isArray(v) ? v.map((o) => withPops(toDoc(M, c, project(o, sel)))) : withPops(toDoc(M, c, project(v, sel))); }).then(r, j),
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
const A = OID(), B = OID();
const U = { ownerA: OID(), uploaderA: OID(), viewerA: OID(), ownerB: OID() };
const CA = OID(), CB = OID();
const seed = () => {
    const u = (id, accountType, companyId) => ({ _id: id, email: `${String(id).slice(-6)}@example.com`, name: 'n', accountType, status: 'ACTIVE', companyId, tokenVersion: 0 });
    db = {
        users: [u(U.ownerA, 'COMPANY', A), u(U.uploaderA, 'EMPLOYEE', A), u(U.viewerA, 'EMPLOYEE', A), u(U.ownerB, 'COMPANY', B)],
        employees: [
            { _id: OID(), userId: U.ownerA, companyId: A, position: 'Company Owner', permissions: ['ALL_ACCESS'], isActive: true },
            { _id: OID(), userId: U.uploaderA, companyId: A, position: 'Creative', permissions: ['CREATIVE_UPLOAD', 'CREATIVE_VIEW'], isActive: true },
            { _id: OID(), userId: U.viewerA, companyId: A, position: 'Viewer', permissions: ['CREATIVE_VIEW'], isActive: true },
            { _id: OID(), userId: U.ownerB, companyId: B, position: 'Company Owner', permissions: ['ALL_ACCESS'], isActive: true },
        ],
        companies: [A, B].map((id) => ({ _id: id, name: 'co', slug: `co-${String(id)}`, email: `${String(id).slice(-6)}@co.example.com`, status: 'APPROVED' })),
        campaigns: [
            { _id: CA, companyId: A, userId: U.ownerA, name: 'A', objective: 'Awareness', status: 'DRAFT', budget: 1 },
            { _id: CB, companyId: B, userId: U.ownerB, name: 'B', objective: 'Awareness', status: 'DRAFT', budget: 1 },
        ],
        stations: [], bookings: [], creatives: [], payments: [], departments: [], audit: [],
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
    const call = async (who, method, p, body, raw) => {
        const h = {};
        if (who) h.Authorization = `Bearer ${tok(who)}`;
        if (body !== undefined || raw !== undefined) h['Content-Type'] = 'application/json';
        const r = await fetch(base + p, { method, headers: h, body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined });
        const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* */ }
        return { code: r.status, body: json || {}, text };
    };
    const good = { campaignId: String(CA), name: 'Radio spot', type: 'AUDIO', url: 'https://cdn.example.com/spot.mp3', description: 'Morning drive' };
    const up = (extra = {}, who = U.ownerA) => call(who, 'POST', '/api/v1/creatives', { ...good, ...extra });
    const stored = (r) => db.creatives.find((c) => eq(c._id, r.body.data?._id));
    const rejects = async (label, extra, re, expCode = 400, who) => {
        const n = db.creatives.length; const a = db.audit.length;
        const r = await up(extra, who);
        check(label, r.code === expCode && db.creatives.length === n && db.audit.length === a && (!re || re.test(r.body.message || '')), `${r.code} ${r.body.message || ''}`);
    };

    // ── Valid links ──
    let r = await up();
    let s = stored(r);
    check('1   Valid https link → 201 PENDING, UPLOAD_CREATIVE audit', r.code === 201 && s?.status === 'PENDING' && s?.url === good.url && db.audit.some((a) => a.action === 'UPLOAD_CREATIVE'), `${r.code} ${r.body.message || ''}`);
    r = await up({ url: 'http://cdn.example.com/spot.mp3' });
    check('2   Valid http link → 201 (existing frontend allows http/https)', r.code === 201, `${r.code}`);
    r = await up({ url: '   https://cdn.example.com/padded.png  ', type: 'IMAGE', name: '  Banner  ' });
    s = stored(r);
    check('10  Surrounding whitespace trimmed on url and name', r.code === 201 && s?.url === 'https://cdn.example.com/padded.png' && s?.name === 'Banner', `${r.code} ${s?.url}`);
    let allTypes = true;
    for (const t of Creative.schema.path('type').enumValues) { const x = await up({ type: t }); allTypes = allTypes && x.code === 201 && stored(x)?.type === t; }
    check('11  Every schema type (IMAGE, VIDEO, AUDIO, DOCUMENT, OTHER) accepted', allTypes);
    r = await up({ type: undefined });
    check('11b Type omitted → existing default IMAGE', r.code === 201 && stored(r)?.type === 'IMAGE', `${r.code}`);
    r = await up({}, U.uploaderA);
    check('11c CREATIVE_UPLOAD employee → 201; uploadedBy is the caller', r.code === 201 && stored(r)?.uploadedBy === String(U.uploaderA), `${r.code}`);

    // ── Invalid links / fields ──
    await rejects('3   Missing URL → 400', { url: undefined }, /required/);
    await rejects('4   Empty URL "" → 400', { url: '' }, /required/);
    await rejects('4b  Whitespace-only URL → 400', { url: '   ' }, /valid http/);
    for (const [lbl, v] of [['number', 42], ['array', ['https://x.example.com']], ['object', { href: 'https://x.example.com' }], ['boolean', true]]) {
        await rejects(`5   Non-string URL (${lbl}) → 400`, { url: v }, /URL must be text/);
    }
    for (const [lbl, v] of [['no scheme', 'cdn.example.com/a.mp4'], ['garbage', 'not a url'], ['scheme only', 'https://'], ['relative', '/uploads/a.png']]) {
        await rejects(`6   Malformed URL (${lbl}) → 400`, { url: v }, /valid http/);
    }
    for (const [n, v] of [['7', 'javascript:alert(document.cookie)'], ['7b', 'JaVaScRiPt:alert(1)'], ['8', 'data:text/html;base64,PHNjcmlwdD4='], ['9', 'file:///etc/passwd'],
        ['9b', 'vbscript:msgbox(1)'], ['9c', 'ftp://files.example.com/a.mp4'], ['9d', 'blob:https://example.com/uuid']]) {
        await rejects(`${n.padEnd(3)} ${v.split(':')[0]}: URL → 400`, { url: v }, /valid http/);
    }
    await rejects('9e  URL with embedded credentials → 400', { url: 'https://admin:secret@cdn.example.com/a.png' }, /username or password/);
    await rejects('9f  URL longer than 2048 → 400', { url: 'https://cdn.example.com/' + 'a'.repeat(2100) }, /valid http/);
    for (const [lbl, v] of [['lowercase', 'video'], ['unknown', 'GIF'], ['number', 3], ['array', ['VIDEO']], ['null', null]]) {
        await rejects(`12  Invalid type (${lbl}) → 400`, { type: v }, /Type must be one of/);
    }
    for (const [lbl, v] of [['object', { $gt: '' }], ['number', 7], ['whitespace', '   '], ['too long', 'x'.repeat(201)]]) {
        await rejects(`12b Invalid name (${lbl}) → 400`, { name: v }, lbl === 'whitespace' ? /Name must be text/ : null);
    }
    await rejects('12c Invalid description (object) → 400', { description: { a: 1 } }, /Description/);

    // ── Client metadata is never trusted ──
    for (const [lbl, extra] of [['size 12', { size: 12 }], ['size 999999999', { size: 999999999 }], ['size -5', { size: -5 }], ['size NaN-string', { size: 'NaN' }],
        ['size array', { size: [1] }], ['size object', { size: { $gt: 0 } }], ['mimeType video/mp4', { mimeType: 'video/mp4' }], ['mimeType array', { mimeType: ['image/png'] }]]) {
        await rejects(`13/14 Client ${lbl} → 400, nothing stored`, extra, /size and MIME type cannot be supplied/);
    }
    r = await up({ size: null, mimeType: null });
    s = stored(r);
    check('13b size/mimeType null (or omitted) → accepted; stored size and mimeType are null (unknown)', r.code === 201 && s?.size === null && s?.mimeType === null, `${r.code}`);
    check('13c No creative in the store carries client-reported size or MIME type', db.creatives.every((c) => c.size === null && c.mimeType === null));
    for (const [n, field, v] of [['15', 'status', 'APPROVED'], ['15b', 'status', 'REJECTED'], ['16', 'approvedBy', String(U.ownerA)], ['16b', 'approvedAt', new Date().toISOString()],
        ['16c', 'uploadedBy', String(U.ownerB)], ['16d', 'uploadedAt', '2000-01-01'], ['16e', 'version', 99]]) {
        await rejects(`${n.padEnd(3)} Client-supplied ${field} → 400 (server-owned), nothing stored`, { [field]: v }, new RegExp(`set by the server.*${field}`));
    }
    check('15c Every stored creative is PENDING with no approval data', db.creatives.every((c) => c.status === 'PENDING' && c.approvedBy === null && c.approvedAt === null));

    // ── Ownership (D5 preserved) ──
    r = await up({ campaignId: String(CB) });
    check('18  Company A → Company B campaign → 404, nothing stored', r.code === 404 && !db.creatives.some((c) => eq(c.campaignId, CB)), `${r.code}`);
    r = await up({ campaignId: String(CA) }, U.ownerB);
    check('18b Company B → Company A campaign → 404', r.code === 404, `${r.code}`);
    r = await call(U.ownerA, 'POST', '/api/v1/creatives', { ...good, campaignId: String(CA), companyId: String(B) });
    s = stored(r);
    check('17  Stored campaignId is the verified campaign; extra companyId ignored (no such field)', r.code === 201 && eq(s?.campaignId, CA) && !('companyId' in (s || {})), `${r.code}`);
    await rejects('19  Malformed campaignId → 404 (D5 T7 behaviour preserved; see report)', { campaignId: 'junk' }, /Campaign not found/, 404);
    await rejects('19b Object campaignId → 404, no 500', { campaignId: { $ne: null } }, /Campaign not found/, 404);
    await rejects('20  Missing campaign → 404', { campaignId: String(OID()) }, /Campaign not found/, 404);
    await rejects('20b Missing campaignId → 400', { campaignId: undefined }, /required/);
    await rejects('20c CREATIVE_VIEW-only employee → 403', {}, /permission/, 403, U.viewerA);
    r = await call(null, 'POST', '/api/v1/creatives', good);
    check('20d No token → 401', r.code === 401, `${r.code}`);
    r = await call(U.ownerA, 'POST', '/api/v1/creatives', undefined, '{"campaignId":');
    check('20e Malformed JSON → 400 (D8 handler), no 500', r.code === 400, `${r.code}`);
    r = await call(U.ownerA, 'POST', '/api/v1/creatives', undefined, 'null');
    check('20f JSON null body → 400, no 500', r.code === 400, `${r.code}`);

    // ── Audit uses server values ──
    const last = db.audit.filter((a) => a.action === 'UPLOAD_CREATIVE').pop();
    check('A1  UPLOAD_CREATIVE metadata = server-validated name/type only', last && JSON.stringify(Object.keys(last.metadata).sort()) === '["name","type"]');
    // ── N8: update still limited to name/description ──
    const cid = db.creatives[0]._id;
    r = await call(U.ownerA, 'PUT', `/api/v1/creatives/${cid}`, { status: 'APPROVED' });
    check('N8  Generic update still refuses status → 400', r.code === 400 && get('creatives', cid).status === 'PENDING', `${r.code}`);
    r = await call(U.ownerA, 'PUT', `/api/v1/creatives/${cid}`, { url: 'javascript:alert(1)', size: 1 });
    check('N8b Generic update cannot change url/size (only name/description editable)', get('creatives', cid).url === good.url && get('creatives', cid).size === null, `${r.code}`);
    check('L1  No 500 / stack trace during the run', !logs.some((l) => /Upload creative error|CastError|ValidationError/.test(l)), logs.filter((l) => /❌/.test(l)).slice(0, 2).join(' | '));
    check('L2  Server never fetched a creative URL (no outbound request code path)', !/fetch\(|axios|http\.get|https\.get/.test(require('fs').readFileSync(path.join(BACKEND, 'src/controllers/creative.controller.js'), 'utf8')));

    server.close();
    const passed = results.filter(Boolean).length;
    out(`\nE5: ${passed}/${results.length} passed`);
    process.exitCode = passed === results.length ? 0 : 1;
})().catch((e) => { out('HARNESS CRASH ' + e.stack); process.exitCode = 1; });
