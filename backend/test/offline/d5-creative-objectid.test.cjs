// D5 verification harness — offline. Real ObjectIds everywhere, real Creative/AuditLog schema validation, dummy JWT secret.
process.env.JWT_SECRET = 'd5-harness-dummy-secret';
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
const U = { ownerA: OID(), ownerB: OID(), viewer: OID(), indiv: OID() };
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
        ],
        employees: [
            { _id: OID(), userId: U.ownerA, companyId: CO_A, position: 'Company Owner', permissions: ['ALL_ACCESS'], isActive: true },
            { _id: OID(), userId: U.ownerB, companyId: CO_B, position: 'Company Owner', permissions: ['ALL_ACCESS'], isActive: true },
            { _id: OID(), userId: U.viewer, companyId: CO_A, position: 'Viewer', permissions: ['CREATIVE_VIEW'], isActive: true },
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
    const ops = (id) => [
        ['GET', `/api/v1/creatives/${id}`],
        ['PUT', `/api/v1/creatives/${id}`, { name: 'Renamed' }],
        ['PATCH', `/api/v1/creatives/${id}/approve`],
        ['PATCH', `/api/v1/creatives/${id}/reject`],
        ['DELETE', `/api/v1/creatives/${id}`],
    ];

    // ── T1 ObjectId normalization (real values, same data the controller sees) ──
    seed();
    const ownerA = db.users[0];
    const campDoc = db.campaigns[0];
    check('T1  Fixture types: req.user.companyId and campaign.companyId are ObjectIds',
        ownerA.companyId instanceof mongoose.Types.ObjectId && campDoc.companyId instanceof mongoose.Types.ObjectId);
    check('B0  OLD check `campaign.companyId.toString() !== req.user.companyId` wrongly says "not owner"',
        (campDoc.companyId.toString() !== ownerA.companyId) === true);
    check('T1  NEW check String(a) === String(b) recognises the owner', String(campDoc.companyId) === String(ownerA.companyId));

    // ── T2 legitimate owner: every single-creative operation works ──
    seed(); let r;
    r = await call(U.ownerA, 'GET', `/api/v1/creatives/${CR.a}`);
    check('T2  Owner GET creative → 200, campaign name/companyId populated', r.code === 200 && r.body.data?.campaignId?.name === 'Campaign A', `${r.code} ${r.body.message || ''}`);
    r = await call(U.ownerA, 'PUT', `/api/v1/creatives/${CR.a}`, { name: 'Spot A v2' });
    check('T2  Owner PUT creative → 200, renamed', r.code === 200 && db.creatives[0].name === 'Spot A v2', `${r.code} ${r.body.message || ''}`);
    r = await call(U.ownerA, 'PATCH', `/api/v1/creatives/${CR.a}/approve`);
    check('T2  Owner approve → 200, APPROVED + approvedBy/At', r.code === 200 && db.creatives[0].status === 'APPROVED' && db.creatives[0].approvedBy === String(U.ownerA) && db.creatives[0].approvedAt, `${r.code}`);
    r = await call(U.ownerA, 'PATCH', `/api/v1/creatives/${CR.a}/reject`);
    check('T2  Owner reject → 200, REJECTED', r.code === 200 && db.creatives[0].status === 'REJECTED', `${r.code}`);
    r = await call(U.ownerA, 'DELETE', `/api/v1/creatives/${CR.a}`);
    check('T2  Owner delete → 200, removed', r.code === 200 && !db.creatives.some((c) => String(c._id) === String(CR.a)), `${r.code}`);
    const acts = audit.map((a) => a.action);
    check('T10 Audit: one each UPDATE/APPROVE/REJECT/DELETE_CREATIVE, companyId + entityId correct',
        ['UPDATE_CREATIVE', 'APPROVE_CREATIVE', 'REJECT_CREATIVE', 'DELETE_CREATIVE'].every((a) => acts.filter((x) => x === a).length === 1)
        && audit.every((a) => String(a.companyId) === String(CO_A) && a.entityId === String(CR.a) && String(a.userId) === String(U.ownerA)), acts.join(','));

    // ── T3 cross-company ──
    seed();
    let before = snapshot();
    for (const [m, url, body] of ops(CR.a)) {
        r = await call(U.ownerB, m, url, body);
        check(`T3  Company B ${m} ${url.replace(String(CR.a), ':id')} → 403`, r.code === 403, `${r.code} ${r.body.message}`);
    }
    check('T3  No creative/campaign mutation and no audit from Company B', snapshot() === before && audit.length === 0);

    // ── T4 individual: reads their own campaign's creative (MVP: individuals advertise) ──
    r = await call(U.indiv, 'GET', `/api/v1/creatives/${CR.indiv}`);
    check('T4  Individual → 200 on their own creative', r.code === 200 && r.body.data?.name === 'Ind', `${r.code} ${r.body.message}`);

    // ── T5 missing campaign / company-less campaign: clean 4xx, no 500 ──
    seed(); before = snapshot();
    for (const [m, url, body] of ops(CR.orphan)) {
        r = await call(U.ownerA, m, url, body);
        check(`T5  Orphan creative ${m} → 404`, r.code === 404 && /campaign not found/i.test(r.body.message), `${r.code} ${r.body.message}`);
    }
    for (const [m, url, body] of ops(CR.indiv)) {
        r = await call(U.ownerA, m, url, body);
        check(`T5b Creative of company-less campaign ${m} → 403 (owned by no company)`, r.code === 403, `${r.code} ${r.body.message}`);
    }
    check('T5  Nothing mutated', snapshot() === before && audit.length === 0);

    // ── T6 missing creative / T7 invalid ids ──
    const ghost = OID();
    for (const [m, url, body] of ops(ghost)) {
        r = await call(U.ownerA, m, url, body);
        check(`T6  Nonexistent creative ${m} → 404`, r.code === 404 && r.body.message === 'Creative not found', `${r.code}`);
    }
    for (const [m, url, body] of ops('not-an-object-id')) {
        r = await call(U.ownerA, m, url, body);
        check(`T7  Malformed creative id ${m} → 400`, r.code === 400 && r.body.message === 'Invalid creative ID', `${r.code} ${r.body.message}`);
    }
    r = await call(U.ownerA, 'GET', '/api/v1/creatives/campaign/not-an-object-id');
    check('T7  Malformed campaignId on list → 404, no 500', r.code === 404, `${r.code} ${r.body.message}`);
    r = await call(U.ownerA, 'POST', '/api/v1/creatives', { campaignId: 'junk', name: 'x', url: 'https://x' });
    check('T7  Malformed campaignId on upload → 404, no 500', r.code === 404, `${r.code} ${r.body.message}`);

    // ── T8 authorization ──
    seed();
    r = await call(null, 'GET', `/api/v1/creatives/${CR.a}`);
    check('T8  No token → 401', r.code === 401);
    r = await call(U.viewer, 'GET', `/api/v1/creatives/${CR.a}`);
    check('T8  CREATIVE_VIEW employee GET own-company creative → 200', r.code === 200, `${r.code}`);
    for (const [m, url, body] of ops(CR.a).slice(1)) {
        r = await call(U.viewer, m, url, body);
        check(`T8  CREATIVE_VIEW-only employee ${m} → 403 (permission)`, r.code === 403 && /permission/i.test(r.body.message), `${r.code}`);
    }

    // ── T9 create + list ──
    seed(); audit = [];
    r = await call(U.ownerA, 'POST', '/api/v1/creatives', { campaignId: String(CAMP_A), name: 'New spot', type: 'VIDEO', url: 'https://cdn.example/n.mp4' });
    check('T9  Owner upload → 201, PENDING, audit UPLOAD_CREATIVE', r.code === 201 && r.body.data?.status === 'PENDING' && audit.some((a) => a.action === 'UPLOAD_CREATIVE'), `${r.code} ${r.body.message || ''}`);
    r = await call(U.ownerA, 'GET', `/api/v1/creatives/campaign/${CAMP_A}`);
    check('T9  Owner list by campaign → 200 incl. new creative', r.code === 200 && r.body.data?.some((c) => c.name === 'New spot'), `${r.code} ${r.body.data?.length}`);
    r = await call(U.ownerB, 'GET', `/api/v1/creatives/campaign/${CAMP_A}`);
    check('T9  Company B list Company A campaign → 404', r.code === 404, `${r.code}`);

    const passed = results.filter(Boolean).length;
    console.log(`\n${passed}/${results.length} passed`);
    process.exitCode = passed === results.length ? 0 : 1;
    // Graceful shutdown: wait for the server and its keep-alive sockets to close, then let Node exit on its own.
    await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
        server.closeAllConnections();
    });
})().catch((e) => { console.log('HARNESS CRASH ' + e.stack); process.exitCode = 1; });
