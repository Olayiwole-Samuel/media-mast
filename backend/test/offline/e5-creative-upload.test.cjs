// E5 (adverts) harness — offline: adverts are uploaded files that carry their ARCON certificate; links are refused.
// Real app/routes/middleware/models/controllers, in-memory store; upload storage stubbed with the same claim rules.
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

// ── Upload storage (GridFS) stand-in: same rules as utils/fileUploads.claimUpload ──
// A finished upload belongs to the user who made it, has one purpose, and is attached once.
const fileUploads = src('utils/fileUploads');
const uploadsStore = new Map();
const deleted = [];
const makeUpload = (owner, purpose, contentType = purpose === 'ARCON' ? 'application/pdf' : 'video/mp4', done = true) => {
    const id = String(OID());
    uploadsStore.set(id, { owner: String(owner), purpose, contentType, done, claimed: false, fileId: OID(), name: purpose === 'ARCON' ? 'arcon.pdf' : 'advert.mp4' });
    return id;
};
fileUploads.claimUpload = async (user, uploadId, purpose) => {
    const u = uploadsStore.get(String(uploadId));
    if (!u || u.owner !== String(user._id || user.id) || u.purpose !== purpose || !u.done || u.claimed) {
        return { error: 'That file upload was not found or is already in use. Upload it again.' };
    }
    u.claimed = true;
    return { file: { uploadId, fileId: u.fileId, name: u.name, contentType: u.contentType, size: 2048, purpose } };
};
fileUploads.deleteFile = async (bucket, fileId) => { deleted.push(String(fileId)); };
fileUploads.sendFile = async (res, bucket, fileId) => res.json({ served: String(fileId), bucket });

(async () => {
    seed();
    const server = app.listen(0, '127.0.0.1'); // loopback only
    await new Promise((resolve, reject) => server.once('listening', resolve).once('error', reject));
    const base = `http://127.0.0.1:${server.address().port}`;
    const call = async (who, method, p, body, raw) => {
        const h = {};
        if (who) h.Authorization = `Bearer ${tok(who)}`;
        if (body !== undefined || raw !== undefined) h['Content-Type'] = 'application/json';
        const r = await fetch(base + p, { method, headers: h, body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined });
        const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* */ }
        return { code: r.status, body: json || {}, text };
    };
    const advert = (who = U.ownerA, extra = {}) => ({
        campaignId: String(CA),
        name: 'TV spot',
        description: 'Launch advert',
        uploadId: makeUpload(who, 'CREATIVE'),
        arconCertificateNumber: 'arcon/aapc/2026/0042',
        arconUploadId: makeUpload(who, 'ARCON'),
        ...extra,
    });
    const up = (who = U.ownerA, extra = {}) => call(who, 'POST', '/api/v1/creatives', advert(who, extra));
    const stored = (r) => db.creatives.find((c) => eq(c._id, r.body.data?._id));
    let r, s;

    // ── Happy path ──
    r = await up(U.ownerA, { durationSeconds: 30 });
    s = stored(r);
    check('1   Owner uploads an advert with its ARCON certificate → 201, ready (APPROVED)', r.code === 201 && s?.status === 'APPROVED' && s.approvedBy === String(U.ownerA), `${r.code} ${r.body.message}`);
    check('2   File stored by reference (fileId), type from the file (VIDEO), no link', s && s.fileId && s.type === 'VIDEO' && !s.url && s.mimeType === 'video/mp4');
    check('3   ARCON number (upper-cased) and certificate file stored on the advert', s && s.arcon?.certificateNumber === 'ARCON/AAPC/2026/0042' && s.arcon?.fileId && s.arcon?.fileName === 'arcon.pdf');
    check('4   Advert length stored (30 s)', s?.durationSeconds === 30);
    const auditUp = db.audit.filter((a) => a.action === 'UPLOAD_CREATIVE').pop();
    check('5   Audit UPLOAD_CREATIVE records name, type and ARCON number', auditUp && auditUp.metadata.arcon === 'ARCON/AAPC/2026/0042' && auditUp.metadata.type === 'VIDEO');

    r = await up(U.uploaderA);
    check('6   Team member with CREATIVE_UPLOAD only → 201, waits for approval (PENDING)', r.code === 201 && stored(r)?.status === 'PENDING', `${r.code}`);

    // ── Refusals ──
    const before = db.creatives.length;
    r = await call(U.ownerA, 'POST', '/api/v1/creatives', { ...advert(), url: 'https://cdn.example.com/spot.mp4' });
    check('7   A link (url) is refused → 400 "Links are not accepted", nothing stored', r.code === 400 && /Links are not accepted/.test(r.body.message) && db.creatives.length === before, `${r.code} ${r.body.message}`);
    r = await up(U.ownerA, { arconUploadId: undefined });
    check('8   No ARCON certificate file → 400', r.code === 400 && /ARCON/.test(r.body.message), `${r.code} ${r.body.message}`);
    r = await up(U.ownerA, { arconCertificateNumber: '' });
    check('9   No ARCON certificate number → 400', r.code === 400 && /ARCON/.test(r.body.message), `${r.code} ${r.body.message}`);
    r = await up(U.ownerA, { arconCertificateNumber: '<script>' });
    check('9b  Malformed ARCON number → 400', r.code === 400, `${r.code}`);
    r = await up(U.ownerA, { uploadId: undefined });
    check('10  No advert file → 400', r.code === 400 && /advert file/.test(r.body.message), `${r.code} ${r.body.message}`);
    r = await up(U.ownerA, { uploadId: makeUpload(U.ownerB, 'CREATIVE') });
    check("11  Someone else's upload cannot be attached → 400", r.code === 400 && /not found or is already in use/.test(r.body.message), `${r.code} ${r.body.message}`);
    const once = makeUpload(U.ownerA, 'CREATIVE');
    await up(U.ownerA, { uploadId: once });
    r = await up(U.ownerA, { uploadId: once });
    check('12  The same upload cannot be attached twice → 400', r.code === 400 && /already in use/.test(r.body.message), `${r.code}`);
    r = await up(U.ownerA, { uploadId: makeUpload(U.ownerA, 'ARCON') });
    check('13  A certificate upload cannot be used as the advert (purpose checked) → 400', r.code === 400, `${r.code}`);
    r = await up(U.ownerA, { uploadId: makeUpload(U.ownerA, 'CREATIVE', 'video/mp4', false) });
    check('14  An unfinished upload cannot be attached → 400', r.code === 400, `${r.code}`);
    const orphan = makeUpload(U.ownerA, 'CREATIVE');
    const orphanFile = uploadsStore.get(orphan).fileId;
    r = await up(U.ownerA, { uploadId: orphan, arconUploadId: makeUpload(U.ownerB, 'ARCON') });
    check('15  Bad certificate → 400 and the already-claimed advert file is removed (no orphan)', r.code === 400 && deleted.includes(String(orphanFile)), `${r.code}`);
    for (const field of ['status', 'fileId', 'arcon', 'approvedBy']) {
        r = await up(U.ownerA, { [field]: field === 'arcon' ? { certificateNumber: 'X' } : 'APPROVED' });
        check(`16  Server-owned field ${field} → 400`, r.code === 400 && /set by the server/.test(r.body.message), `${r.code}`);
    }
    r = await up(U.ownerA, { durationSeconds: 0 });
    check('17  Advert length 0 → 400', r.code === 400 && /length/.test(r.body.message), `${r.code}`);
    r = await up(U.ownerA, { campaignId: String(CB) });
    check("18  Another company's campaign → 404", r.code === 404, `${r.code}`);
    r = await up(U.ownerA, { campaignId: 'junk' });
    check('19  Malformed campaignId → 404, no 500', r.code === 404, `${r.code}`);
    r = await up(U.viewerA);
    check('20  CREATIVE_VIEW-only employee → 403', r.code === 403, `${r.code}`);
    r = await call(null, 'POST', '/api/v1/creatives', advert());
    check('21  No token → 401', r.code === 401, `${r.code}`);
    r = await call(U.ownerA, 'POST', '/api/v1/creatives', undefined, '{"campaignId":');
    check('22  Malformed JSON → 400, no 500', r.code === 400, `${r.code}`);

    // ── Files: play / download, scoped to the owner ──
    const first = db.creatives[0];
    r = await call(U.ownerA, 'GET', `/api/v1/creatives/${first._id}/file`);
    check('F1  Owner plays the advert → the advert file is served', r.code === 200 && r.body.served === String(first.fileId) && r.body.bucket === 'creatives', `${r.code}`);
    r = await call(U.viewerA, 'GET', `/api/v1/creatives/${first._id}/file?which=arcon`);
    check('F2  CREATIVE_VIEW team member opens the ARCON certificate → certificate served', r.code === 200 && r.body.served === String(first.arcon.fileId), `${r.code}`);
    r = await call(U.ownerB, 'GET', `/api/v1/creatives/${first._id}/file`);
    check('F3  Another company → 403, nothing served', r.code === 403 && !r.body.served, `${r.code}`);

    // ── Edits and deletes ──
    r = await call(U.ownerA, 'PUT', `/api/v1/creatives/${first._id}`, { fileId: String(OID()), arcon: { certificateNumber: 'X' }, name: 'TV spot v2' });
    const after = db.creatives.find((c) => eq(c._id, first._id));
    check('E1  Update renames only; file and ARCON certificate cannot be changed', r.code === 200 && after.name === 'TV spot v2' && eq(after.fileId, first.fileId) && after.arcon.certificateNumber === first.arcon.certificateNumber, `${r.code}`);
    db.bookings.push({ _id: OID(), creativeId: first._id, status: 'SCHEDULED' });
    r = await call(U.ownerA, 'DELETE', `/api/v1/creatives/${first._id}`);
    check('E2  Advert attached to a booked spot cannot be deleted → 409', r.code === 409 && db.creatives.some((c) => eq(c._id, first._id)), `${r.code}`);
    db.bookings[0].status = 'CANCELLED';
    deleted.length = 0;
    r = await call(U.ownerA, 'DELETE', `/api/v1/creatives/${first._id}`);
    check('E3  Once its spots are cancelled it can be deleted; advert and certificate files removed', r.code === 200 && !db.creatives.some((c) => eq(c._id, first._id)) && deleted.includes(String(first.fileId)) && deleted.includes(String(first.arcon.fileId)), `${r.code}`);
    check('L1  No 500 / stack trace during the run', !logs.some((l) => /Upload creative error|CastError|ValidationError/.test(l)), logs.filter((l) => /❌/.test(l)).slice(0, 2).join(' | '));

    server.close();
    const passed = results.filter(Boolean).length;
    out(`\nE5: ${passed}/${results.length} passed`);
    process.exitCode = passed === results.length ? 0 : 1;
})().catch((e) => { out('HARNESS CRASH ' + e.stack); process.exitCode = 1; });
