// N8 verification harness (setup reused from D5) — offline. Real ObjectIds everywhere, real Creative/AuditLog schema validation, dummy JWT secret.
process.env.JWT_SECRET = 'n8-harness-dummy-secret';
process.env.JWT_EXPIRE = '5m';

const path = require('path');
const BACKEND = path.resolve(__dirname, '..', '..'); // backend/ (this file: backend/test/offline/)
const mongoose = require(path.join(BACKEND, 'node_modules', 'mongoose'));
const jwt = require(path.join(BACKEND, 'node_modules', 'jsonwebtoken'));
mongoose.set('bufferCommands', false);

const src = (p) => require(path.join(BACKEND, 'src', p));
const User = src('models/User');
const Employee = src('models/Employee');
const Company = src('models/Company');
const Campaign = src('models/Campaign');
const Creative = src('models/Creative');
const AuditLog = src('models/AuditLog');

const OID = () => new mongoose.Types.ObjectId();
const CO_A = OID(), CO_B = OID();
const U = { ownerA: OID(), ownerB: OID(), viewer: OID(), indiv: OID(), uploader: OID(), approver: OID() };
const CAMP_A = OID(), CAMP_IND = OID(), CAMP_GONE = OID();
const CR = { a: OID(), orphan: OID(), indiv: OID() };

let db, audit;
const seed = () => {
    audit = [];
    db = {
        users: [ // companyId stored as a real ObjectId, as on a User document (this is what triggered D5)
            { _id: U.ownerA, accountType: 'COMPANY', status: 'ACTIVE', companyId: CO_A },
            { _id: U.ownerB, accountType: 'COMPANY', status: 'ACTIVE', companyId: CO_B },
            { _id: U.viewer, accountType: 'EMPLOYEE', status: 'ACTIVE', companyId: CO_A },
            { _id: U.indiv, accountType: 'INDIVIDUAL', status: 'ACTIVE', companyId: null },
            { _id: U.uploader, accountType: 'EMPLOYEE', status: 'ACTIVE', companyId: CO_A },
            { _id: U.approver, accountType: 'EMPLOYEE', status: 'ACTIVE', companyId: CO_A },
        ],
        employees: [
            { _id: OID(), userId: U.ownerA, companyId: CO_A, position: 'Company Owner', permissions: ['ALL_ACCESS'], isActive: true },
            { _id: OID(), userId: U.ownerB, companyId: CO_B, position: 'Company Owner', permissions: ['ALL_ACCESS'], isActive: true },
            { _id: OID(), userId: U.viewer, companyId: CO_A, position: 'Viewer', permissions: ['CREATIVE_VIEW'], isActive: true },
            { _id: OID(), userId: U.uploader, companyId: CO_A, position: 'Uploader', permissions: ['CREATIVE_VIEW', 'CREATIVE_UPLOAD'], isActive: true },
            { _id: OID(), userId: U.approver, companyId: CO_A, position: 'Approver', permissions: ['CREATIVE_VIEW', 'CREATIVE_APPROVE'], isActive: true },
        ],
        companies: [{ _id: CO_A, name: 'A', status: 'APPROVED' }, { _id: CO_B, name: 'B', status: 'APPROVED' }],
        campaigns: [
            { _id: CAMP_A, name: 'Campaign A', companyId: CO_A, userId: U.ownerA, status: 'DRAFT' },
            { _id: CAMP_IND, name: 'Individual campaign', companyId: null, userId: U.indiv, status: 'DRAFT' },
            // CAMP_GONE intentionally absent (deleted campaign)
        ],
        creatives: [
            { _id: CR.a, campaignId: CAMP_A, name: 'Spot A', type: 'AUDIO', url: 'https://cdn.example/a.mp3', status: 'PENDING', uploadedBy: String(U.ownerA) },
            { _id: CR.orphan, campaignId: CAMP_GONE, name: 'Orphan', type: 'IMAGE', url: 'https://cdn.example/o.png', status: 'PENDING', uploadedBy: String(U.ownerA) },
            { _id: CR.indiv, campaignId: CAMP_IND, name: 'Ind', type: 'IMAGE', url: 'https://cdn.example/i.png', status: 'PENDING', uploadedBy: String(U.indiv) },
        ],
    };
    db.users.forEach((u) => { u.id = String(u._id); });
};
const snapshot = () => JSON.stringify({ c: db.creatives.map(({ save, deleteOne, ...r }) => r), k: db.campaigns });

const pick = (doc, fields) => { if (!doc) return null; const o = { _id: doc._id }; fields.split(/\s+/).forEach((f) => { o[f] = doc[f]; }); return o; };
const matches = (d, f) => Object.entries(f).every(([k, v]) => String(d[k]) === String(v));
const q = (resolve) => {
    let pop = null;
    const x = { select: () => x, lean: () => x, sort: () => x,
        populate: (p, fields) => { pop = { p, fields }; return x; },
        then: (r, j) => Promise.resolve().then(() => resolve(pop)).then(r, j) };
    return x;
};
const asDoc = (d) => d && Object.assign(d, { save: async () => d, toObject: () => ({ ...d }) });
const fake = (M, c) => {
    M.findById = (id) => q(() => asDoc(db[c].find((d) => String(d._id) === String(id)) || null));
    M.findOne = (f) => q(() => asDoc(db[c].find((d) => matches(d, f)) || null));
    M.find = (f = {}) => q(() => db[c].filter((d) => matches(d, f)));
};
fake(User, 'users'); fake(Employee, 'employees'); fake(Company, 'companies'); fake(Campaign, 'campaigns');
// Creative: real ObjectIds; populate('campaignId', fields) resolves like Mongoose (null when the ref is gone)
const creativeDoc = (raw, pop) => {
    const view = { ...raw };
    if (pop?.p === 'campaignId') view.campaignId = pick(db.campaigns.find((k) => String(k._id) === String(raw.campaignId)), pop.fields);
    view.save = async () => { // persist only scalar changes, validated by the real Creative schema
        const { save, deleteOne, campaignId, ...changes } = view;
        await new Creative({ ...raw, ...changes, campaignId: raw.campaignId }).validate();
        Object.assign(raw, changes);
        return view;
    };
    view.deleteOne = async () => { db.creatives = db.creatives.filter((c) => c !== raw); return {}; };
    return view;
};
Creative.findById = (id) => {
    if (!mongoose.isValidObjectId(id)) throw new Error('harness: controller passed an invalid ObjectId to findById'); // would be a CastError
    return q((pop) => { const raw = db.creatives.find((c) => String(c._id) === String(id)); return raw ? creativeDoc(raw, pop) : null; });
};
Creative.find = (f = {}) => q(() => db.creatives.filter((c) => matches(c, f)));
Creative.create = async (data) => { const c = new Creative(data); await c.validate(); const raw = c.toObject(); db.creatives.push(raw); return c; };
AuditLog.create = async (data) => { const a = new AuditLog(data); await a.validate(); audit.push(a.toObject()); return a; };

const app = src('app');
const tok = (id) => jwt.sign({ id: String(id) }, process.env.JWT_SECRET, { expiresIn: '5m' });
const results = [];
const check = (label, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`); };

(async () => {
    const server = app.listen(0, '127.0.0.1'); // loopback only
    await new Promise((resolve, reject) => server.once('listening', resolve).once('error', reject)); // address() is null until bound
    const port = server.address().port;
    const call = async (who, method, url, body) => {
        const headers = { 'Content-Type': 'application/json' };
        if (who) headers.Authorization = `Bearer ${tok(who)}`;
        const r = await fetch(`http://127.0.0.1:${port}${url}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
        return { code: r.status, body: await r.json().catch(() => ({})) };
    };
    const crA = () => db.creatives.find((c) => String(c._id) === String(CR.a));
    const put = (who, body, id = CR.a) => call(who, 'PUT', `/api/v1/creatives/${id}`, body);
    const STATUS_MSG = /status cannot be changed through this endpoint/i;
    const updAudits = () => audit.filter((a) => a.action === 'UPDATE_CREATIVE').length;
    let r;

    // ── A. normal update ──
    seed();
    r = await put(U.uploader, { name: 'Spot A v2', description: 'New copy' });
    check('A   CREATIVE_UPLOAD user updates name/description → 200', r.code === 200 && crA().name === 'Spot A v2' && crA().description === 'New copy', `${r.code} ${r.body.message}`);
    check('A   Status unchanged (PENDING), no approval metadata', crA().status === 'PENDING' && !crA().approvedBy && !crA().approvedAt);
    check('A   Exactly one UPDATE_CREATIVE audit for the legitimate update', updAudits() === 1);

    // ── B/C/D. every real Creative status via generic update ──
    const statuses = Creative.schema.path('status').enumValues;
    check('D   Creative status enum read from schema', statuses.join(',') === 'PENDING,APPROVED,REJECTED,REVISION_REQUESTED', statuses.join(','));
    for (const who of [['uploader', U.uploader], ['owner', U.ownerA]]) {
        for (const s of [...statuses, 'WHATEVER', null, '']) {
            seed();
            const before = snapshot();
            r = await put(who[1], { status: s });
            check(`B-D ${who[0]} PUT {status:${JSON.stringify(s)}} → 400, nothing changed, no audit`,
                r.code === 400 && STATUS_MSG.test(r.body.message) && snapshot() === before && audit.length === 0, `${r.code} ${r.body.message}`);
        }
    }

    // ── E. mixed legitimate field + malicious status → rejected atomically ──
    seed();
    let before = snapshot();
    r = await put(U.uploader, { name: 'Legitimate New Name', status: 'APPROVED' });
    check('E   {name, status:APPROVED} → 400; name AND status unchanged; no audit', r.code === 400 && crA().name === 'Spot A' && crA().status === 'PENDING'
        && !crA().approvedBy && !crA().approvedAt && snapshot() === before && audit.length === 0, `${r.code} name=${crA().name} status=${crA().status}`);
    r = await put(U.uploader, { description: 'x', status: 'REJECTED' });
    check('E   {description, status:REJECTED} → 400, unchanged', r.code === 400 && crA().description == null && crA().status === 'PENDING', `${r.code}`);

    // ── F/G/H. dedicated endpoints ──
    seed(); audit = [];
    r = await call(U.uploader, 'PATCH', `/api/v1/creatives/${CR.a}/approve`);
    check('G   CREATIVE_UPLOAD-only user on /approve → 403, unchanged', r.code === 403 && crA().status === 'PENDING' && !crA().approvedBy && !crA().approvedAt && audit.length === 0, `${r.code}`);
    r = await call(U.uploader, 'PATCH', `/api/v1/creatives/${CR.a}/reject`);
    check('G   CREATIVE_UPLOAD-only user on /reject → 403, unchanged', r.code === 403 && crA().status === 'PENDING' && audit.length === 0, `${r.code}`);
    r = await call(U.approver, 'PATCH', `/api/v1/creatives/${CR.a}/approve`);
    const ap = audit.filter((a) => a.action === 'APPROVE_CREATIVE');
    check('F   CREATIVE_APPROVE user approves → 200, APPROVED, approvedBy = approver, approvedAt set', r.code === 200 && crA().status === 'APPROVED'
        && crA().approvedBy === String(U.approver) && crA().approvedAt instanceof Date && r.body.data?.status === 'APPROVED', `${r.code} by=${crA().approvedBy}`);
    check('F   Exactly one APPROVE_CREATIVE audit, actor = approver', ap.length === 1 && String(ap[0].userId) === String(U.approver) && String(ap[0].companyId) === String(CO_A));
    const approvedAt = crA().approvedAt;
    r = await call(U.approver, 'PATCH', `/api/v1/creatives/${CR.a}/reject`);
    const rj = audit.filter((a) => a.action === 'REJECT_CREATIVE');
    check('H   CREATIVE_APPROVE user rejects → 200, REJECTED', r.code === 200 && crA().status === 'REJECTED' && r.body.data?.status === 'REJECTED', `${r.code}`);
    check('H   Existing reject design preserved (approvedBy/At not cleared) + one REJECT_CREATIVE audit',
        crA().approvedBy === String(U.approver) && crA().approvedAt === approvedAt && rj.length === 1 && String(rj[0].userId) === String(U.approver));
    r = await put(U.approver, { name: 'x' });
    check('    Approver without CREATIVE_UPLOAD cannot use generic update → 403 (route permission unchanged)', r.code === 403, `${r.code}`);

    // ── I. cross-company (D5 ownership intact) ──
    seed();
    before = snapshot();
    for (const [m, url, body] of [['PUT', `/api/v1/creatives/${CR.a}`, { name: 'Hijack' }], ['PUT', `/api/v1/creatives/${CR.a}`, { status: 'APPROVED' }],
        ['PATCH', `/api/v1/creatives/${CR.a}/approve`], ['PATCH', `/api/v1/creatives/${CR.a}/reject`], ['DELETE', `/api/v1/creatives/${CR.a}`]]) {
        r = await call(U.ownerB, m, url, body);
        check(`I   Company B ${m} ${url.replace(String(CR.a), ':id')}${body?.status ? ' {status}' : ''} → 403`, r.code === 403 && /access denied/i.test(r.body.message), `${r.code} ${r.body.message}`);
    }
    check('I   Company A creative untouched, no audit', snapshot() === before && audit.length === 0);

    // ── J. D5 id / relationship handling ──
    for (const [label, id, body, exp] of [
        ['malformed id', 'not-an-object-id', { name: 'x' }, 400], ['malformed id + status', 'not-an-object-id', { status: 'APPROVED' }, 400],
        ['nonexistent creative', OID(), { name: 'x' }, 404], ['orphaned campaign', CR.orphan, { status: 'APPROVED' }, 404],
        ['company-less campaign', CR.indiv, { status: 'APPROVED' }, 403]]) {
        seed(); before = snapshot();
        r = await put(U.ownerA, body, id);
        check(`J   PUT ${label} → ${exp}, nothing changed`, r.code === exp && snapshot() === before, `${r.code} ${r.body.message}`);
    }
    r = await call(U.ownerA, 'PATCH', `/api/v1/creatives/not-an-object-id/approve`);
    check('J   approve malformed id → 400', r.code === 400, `${r.code}`);

    // ── K. authentication ──
    for (const [m, url] of [['PUT', `/api/v1/creatives/${CR.a}`], ['PATCH', `/api/v1/creatives/${CR.a}/approve`], ['PATCH', `/api/v1/creatives/${CR.a}/reject`]]) {
        r = await call(null, m, url, { status: 'APPROVED' });
        check(`K   No token ${m} ${url.replace(String(CR.a), ':id')} → 401`, r.code === 401, `${r.code}`);
    }

    const passed = results.filter(Boolean).length;
    console.log(`\n${passed}/${results.length} passed`);
    process.exitCode = passed === results.length ? 0 : 1;
    // Graceful shutdown: wait for the server and its keep-alive sockets to close, then let Node exit on its own.
    await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
        server.closeAllConnections();
    });
})().catch((e) => { console.log('HARNESS CRASH ' + e.stack); process.exitCode = 1; });
