// D2 verification harness — offline. Real AuditLog schema validation, fake persistence, dummy JWT secret.
process.env.JWT_SECRET = 'd2-harness-dummy-secret';
process.env.JWT_EXPIRE = '5m';

const fs = require('fs');
const path = require('path');
const BACKEND = path.resolve(__dirname, '..', '..'); // backend/ (this file: backend/test/offline/)
const mongoose = require(path.join(BACKEND, 'node_modules', 'mongoose'));
const jwt = require(path.join(BACKEND, 'node_modules', 'jsonwebtoken'));
mongoose.set('bufferCommands', false);

const src = (p) => require(path.join(BACKEND, 'src', p));
const User = src('models/User');
const Employee = src('models/Employee');
const Company = src('models/Company');
const Station = src('models/Station');
const AuditLog = src('models/AuditLog');

const results = [];
const check = (label, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`); };
const validates = async (action) => { try { await new AuditLog({ action, entityType: 'STATION' }).validate(); return null; } catch (e) { return e.errors?.action?.kind || e.name; } };

// ── Data ──
const oid = (n) => n.toString(16).padStart(24, '0');
const CO = oid(100);
let db;
const seed = () => {
    db = {
        users: [
            { _id: oid(1), accountType: 'ADMIN', status: 'ACTIVE', companyId: null },
            { _id: oid(2), accountType: 'COMPANY', status: 'ACTIVE', companyId: CO },
            { _id: oid(3), accountType: 'EMPLOYEE', status: 'ACTIVE', companyId: CO },
            { _id: oid(4), accountType: 'INDIVIDUAL', status: 'ACTIVE', companyId: null },
        ],
        employees: [
            { _id: oid(200), userId: oid(2), companyId: CO, position: 'Company Owner', permissions: ['ALL_ACCESS'], isActive: true },
            { _id: oid(201), userId: oid(3), companyId: CO, position: 'Manager', permissions: ['ALL_ACCESS'], isActive: true },
        ],
        companies: [{ _id: CO, name: 'Test Co', status: 'APPROVED', logo: 'https://old.example/logo.png' }],
        stations: [{ _id: oid(500), name: 'Test FM', companyId: CO, approvalStatus: 'APPROVED', isActive: false, inventoryStatus: 'UNAVAILABLE' }],
    };
    db.users.forEach((u) => { u.id = u._id; });
};
const audit = [];
let failAudit = false;

const asDoc = (d) => d && Object.assign(d, { save: async () => d, toObject: () => ({ ...d }) });
const matches = (d, f) => Object.entries(f).every(([k, v]) => String(d[k]) === String(v));
const q = (v) => { const x = { select: () => x, populate: () => x, lean: () => x, then: (r, j) => Promise.resolve(v).then(r, j) }; return x; };
const fake = (M, c) => {
    M.findById = (id) => q(asDoc(db[c].find((d) => String(d._id) === String(id)) || null));
    M.findOne = (f) => q(asDoc(db[c].find((d) => matches(d, f)) || null));
};
fake(User, 'users'); fake(Employee, 'employees'); fake(Company, 'companies'); fake(Station, 'stations');
// Real schema validation (incl. the action enum), in-memory persistence only.
AuditLog.create = async (data) => {
    if (failAudit) throw new Error('simulated audit store failure');
    const doc = new AuditLog(data);
    await doc.validate();
    audit.push(doc.toObject());
    return doc;
};

const app = src('app');
const tok = (n) => jwt.sign({ id: oid(n) }, process.env.JWT_SECRET, { expiresIn: '5m' });

(async () => {
    // ── Enum validation (real schema) ──
    for (const a of ['ACTIVATE_STATION', 'DEACTIVATE_STATION', 'UPDATE_COMPANY_LOGO']) {
        const err = await validates(a);
        check(`E   ${a} accepted by schema`, err === null, err || 'ok');
    }
    const bad = await validates('THIS_IS_NOT_A_REAL_ACTION');
    check('E   THIS_IS_NOT_A_REAL_ACTION still rejected', bad === 'enum', bad || 'accepted!');
    check('E   action path is still enum-restricted String', AuditLog.schema.path('action').instance === 'String' && AuditLog.schema.path('action').enumValues.length > 0,
        `${AuditLog.schema.path('action').enumValues.length} values`);

    // ── Every literal action used in controllers/middleware is in the enum ──
    const enumSet = new Set(AuditLog.schema.path('action').enumValues);
    const used = new Set();
    const walk = (d) => fs.readdirSync(d).forEach((f) => {
        const p = path.join(d, f);
        if (fs.statSync(p).isDirectory()) return walk(p);
        if (!p.endsWith('.js') || p.includes(`${path.sep}models${path.sep}`)) return;
        const s = fs.readFileSync(p, 'utf8');
        for (const m of s.matchAll(/\baction\s*:\s*['"]([A-Z_]+)['"]/g)) used.add(m[1]);
        for (const m of s.matchAll(/\b(?:action|activate|reactivate|deactivate)\s*:\s*\n\s*['"]([A-Z_]+)['"]/g)) used.add(m[1]);
        for (const m of s.matchAll(/\?\s*['"]([A-Z_]+_USER)['"]\s*:\s*['"]([A-Z_]+_USER)['"]/g)) { used.add(m[1]); used.add(m[2]); }
    });
    walk(path.join(BACKEND, 'src'));
    ['SUSPEND_USER', 'ACTIVATE_USER'].forEach((a) => used.add(a)); // resolved values of `${status.toUpperCase()}_USER`
    const missing = [...used].filter((a) => !enumSet.has(a));
    check(`R   All ${used.size} action strings used in code exist in enum`, missing.length === 0, missing.join(', ') || 'none missing');

    const server = app.listen(0, '127.0.0.1'); // loopback only
    await new Promise((resolve, reject) => server.once('listening', resolve).once('error', reject)); // address() is null until bound
    const port = server.address().port;
    const call = async (n, method, url, body) => {
        const headers = { 'Content-Type': 'application/json' };
        if (n) headers.Authorization = `Bearer ${tok(n)}`;
        const r = await fetch(`http://127.0.0.1:${port}${url}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
        return { code: r.status, body: await r.json().catch(() => ({})) };
    };
    const ACT = `/api/v1/admin/stations/${oid(500)}/activate`;
    const DEACT = `/api/v1/admin/stations/${oid(500)}/deactivate`;
    const LOGO = '/api/v1/settings/logo';
    const NEW_LOGO = 'https://new.example/logo.png';

    // ── Success paths: business change + exactly one valid audit record ──
    seed(); audit.length = 0;
    let r = await call(1, 'PATCH', ACT);
    let st = db.stations[0];
    check('S1  Admin activates station → 200, isActive true', r.code === 200 && st.isActive === true && st.inventoryStatus === 'AVAILABLE', `${r.code} ${r.body.message}`);
    check('S1  Exactly one ACTIVATE_STATION audit, actor = admin', audit.length === 1 && audit[0].action === 'ACTIVATE_STATION' && String(audit[0].userId) === oid(1)
        && audit[0].entityType === 'STATION' && audit[0].entityId === oid(500), `${audit.length} record(s)`);

    audit.length = 0;
    r = await call(1, 'PATCH', DEACT);
    check('S2  Admin deactivates station → 200, isActive false', r.code === 200 && st.isActive === false && st.inventoryStatus === 'UNAVAILABLE', `${r.code} ${r.body.message}`);
    check('S2  Exactly one DEACTIVATE_STATION audit, actor = admin', audit.length === 1 && audit[0].action === 'DEACTIVATE_STATION' && String(audit[0].userId) === oid(1), `${audit.length} record(s)`);

    audit.length = 0;
    r = await call(2, 'PATCH', LOGO, { logo: NEW_LOGO });
    check('L1  Owner updates logo → 200, logo changed', r.code === 200 && db.companies[0].logo === NEW_LOGO && r.body.data?.logo === NEW_LOGO, `${r.code} ${r.body.message}`);
    check('L1  Exactly one UPDATE_COMPANY_LOGO audit, actor = owner', audit.length === 1 && audit[0].action === 'UPDATE_COMPANY_LOGO' && String(audit[0].userId) === oid(2)
        && String(audit[0].companyId) === CO && audit[0].metadata?.newLogo === NEW_LOGO, `${audit.length} record(s)`);

    // ── Audit store failure must not turn a completed operation into 500 ──
    seed(); audit.length = 0; failAudit = true;
    r = await call(1, 'PATCH', ACT);
    check('F1  Activate with failing audit → still 200, station active', r.code === 200 && db.stations[0].isActive === true, `${r.code}`);
    r = await call(1, 'PATCH', DEACT);
    check('F2  Deactivate with failing audit → still 200, station inactive', r.code === 200 && db.stations[0].isActive === false, `${r.code}`);
    r = await call(2, 'PATCH', LOGO, { logo: NEW_LOGO });
    check('F3  Logo update with failing audit → still 200, logo saved', r.code === 200 && db.companies[0].logo === NEW_LOGO, `${r.code}`);
    check('F   No audit records written while store failing', audit.length === 0);
    failAudit = false;

    // ── Authorization unchanged ──
    seed();
    const authz = [
        ['A1  No token → activate station', null, 'PATCH', ACT, 401],
        ['A2  Company owner → activate station', 2, 'PATCH', ACT, 403],
        ['A3  Company employee → deactivate station', 3, 'PATCH', DEACT, 403],
        ['A4  Individual → activate station', 4, 'PATCH', ACT, 403],
        ['A5  No token → logo', null, 'PATCH', LOGO, 401],
        ['A6  ALL_ACCESS employee (not owner) → logo', 3, 'PATCH', LOGO, 403],
        ['A7  Individual → logo', 4, 'PATCH', LOGO, 403],
        ['A8  Admin (no company) → logo', 1, 'PATCH', LOGO, 403],
    ];
    for (const [label, n, m, url, exp] of authz) {
        const before = JSON.stringify(db);
        r = await call(n, m, url, { logo: 'https://evil.example/x.png' });
        check(`${label} → ${exp}, nothing changed`, r.code === exp && JSON.stringify(db) === before, `${r.code} ${r.body.message || ''}`);
    }

    const passed = results.filter(Boolean).length;
    console.log(`\n${passed}/${results.length} passed`);
    process.exitCode = passed === results.length ? 0 : 1;
    // Graceful shutdown: wait for the server and its keep-alive sockets to close, then let Node exit on its own.
    await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
        server.closeAllConnections();
    });
})();
