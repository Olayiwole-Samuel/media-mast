// N3/D6 verification harness — offline, in-memory fakes only. No real DB, no real secret.
process.env.JWT_SECRET = 'n3-harness-dummy-secret';
process.env.JWT_EXPIRE = '5m';

const path = require('path');
const BACKEND = path.resolve(__dirname, '..', '..'); // backend/ (this file: backend/test/offline/)
const mongoose = require(path.join(BACKEND, 'node_modules', 'mongoose'));
const jwt = require(path.join(BACKEND, 'node_modules', 'jsonwebtoken'));
mongoose.set('bufferCommands', false); // any un-faked DB call fails instead of reaching a real DB

const src = (p) => require(path.join(BACKEND, 'src', p));
const User = src('models/User');
const Employee = src('models/Employee');
const Company = src('models/Company');
const AuditLog = src('models/AuditLog');

const C1 = 'c00000000000000000000001';
const ID = {
    owner: 'a00000000000000000000001', emp: 'a00000000000000000000002',
    allAccess: 'a00000000000000000000003', target: 'a00000000000000000000004',
    indiv: 'a00000000000000000000005',
};
const TARGET_EMP = 'e00000000000000000000004';

let users, employees, raceSuspend;
const seed = (targetStatus, targetActive) => {
    raceSuspend = false;
    const u = (id, accountType, status, companyId = C1) => ({ _id: id, id, accountType, status, companyId });
    users = [
        u(ID.owner, 'COMPANY', 'ACTIVE'), u(ID.emp, 'EMPLOYEE', 'ACTIVE'),
        u(ID.allAccess, 'EMPLOYEE', 'ACTIVE'), u(ID.target, 'EMPLOYEE', targetStatus),
        u(ID.indiv, 'INDIVIDUAL', 'ACTIVE', null),
    ];
    const e = (_id, userId, position, permissions, isActive) => ({ _id, userId, companyId: C1, position, permissions, isActive });
    employees = [
        e('e00000000000000000000001', ID.owner, 'Company Owner', ['ALL_ACCESS'], true),
        e('e00000000000000000000002', ID.emp, 'Team Member', [], true),
        e('e00000000000000000000003', ID.allAccess, 'Manager', ['ALL_ACCESS'], true),
        e(TARGET_EMP, ID.target, 'Team Member', [], targetActive),
    ];
};

// ── Fakes ──
const q = (value) => {
    const query = { select: () => query, populate: () => query, lean: () => query,
        then: (res, rej) => Promise.resolve(value).then(res, rej) };
    return query;
};
const fieldMatch = (actual, cond) =>
    cond && typeof cond === 'object' && Array.isArray(cond.$in)
        ? cond.$in.map(String).includes(String(actual))
        : String(actual) === String(cond);
const matches = (doc, filter) => Object.entries(filter).every(([k, v]) => fieldMatch(doc[k], v));
const withSave = (doc) => doc && Object.assign(doc, { save: async () => doc, toObject: () => ({ ...doc }) });

User.findById = (id) => q(users.find((u) => String(u._id) === String(id)) || null);
User.updateOne = async (filter, update) => {
    if (raceSuspend) users.find((u) => u._id === ID.target).status = 'SUSPENDED'; // simulate concurrent admin suspension
    const doc = users.find((u) => matches(u, filter));
    if (doc) Object.assign(doc, update);
    return { matchedCount: doc ? 1 : 0, modifiedCount: doc ? 1 : 0 };
};
User.findByIdAndUpdate = async () => { throw new Error('unconditional findByIdAndUpdate must not be used for lifecycle'); };
Employee.findOne = (filter) => q(withSave(employees.find((e) => matches(e, filter)) || null));
Company.findById = (id) => q(String(id) === C1 ? { _id: C1, name: 'Test Co', status: 'APPROVED' } : null);
AuditLog.create = async () => ({});

const app = src('app');
const tok = (who) => jwt.sign({ id: ID[who] }, process.env.JWT_SECRET, { expiresIn: '5m' });
const state = () => {
    const u = users.find((x) => x._id === ID.target), e = employees.find((x) => x._id === TARGET_EMP);
    return { status: u.status, isActive: e.isActive };
};

let port;
const call = async (who, method, url, body) => {
    const headers = { 'Content-Type': 'application/json' };
    if (who) headers.Authorization = `Bearer ${tok(who)}`;
    const r = await fetch(`http://127.0.0.1:${port}${url}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    return { code: r.status, msg: j.message || '' };
};
const ACT = `/api/v1/employees/${TARGET_EMP}/activate`;
const DEACT = `/api/v1/employees/${TARGET_EMP}/deactivate`;
const PERMS = `/api/v1/employees/${TARGET_EMP}/permissions`;
const REMOVE = `/api/v1/company/team/${TARGET_EMP}`;

// [label, seed [status, isActive], steps [[who, method, url, body]], expected final code, expected end state | null, extra setup]
const cases = [
    ['1  Owner activates DEACTIVATED employee', ['DEACTIVATED', false], [['owner', 'PATCH', ACT]], 200, { status: 'ACTIVE', isActive: true }],
    ['2  Owner activates SUSPENDED (inactive) employee', ['SUSPENDED', false], [['owner', 'PATCH', ACT]], 403, { status: 'SUSPENDED', isActive: false }],
    ['2b Owner activates SUSPENDED (still active in co.)', ['SUSPENDED', true], [['owner', 'PATCH', ACT]], 403, { status: 'SUSPENDED', isActive: true }],
    ['2c Owner activates PENDING employee', ['PENDING', false], [['owner', 'PATCH', ACT]], 403, { status: 'PENDING', isActive: false }],
    ['3  Owner activates already-ACTIVE employee', ['ACTIVE', true], [['owner', 'PATCH', ACT]], 200, { status: 'ACTIVE', isActive: true }],
    ['4  Owner deactivates ACTIVE employee', ['ACTIVE', true], [['owner', 'PATCH', DEACT]], 200, { status: 'DEACTIVATED', isActive: false }],
    ['4b Owner deactivates SUSPENDED employee', ['SUSPENDED', true], [['owner', 'PATCH', DEACT]], 200, { status: 'SUSPENDED', isActive: false }],
    ['4c Bypass: deactivate SUSPENDED → then activate', ['SUSPENDED', true], [['owner', 'PATCH', DEACT], ['owner', 'PATCH', ACT]], 403, { status: 'SUSPENDED', isActive: false }],
    ['4d Bypass: team-remove SUSPENDED → then activate', ['SUSPENDED', true], [['owner', 'DELETE', REMOVE], ['owner', 'PATCH', ACT]], 403, { status: 'SUSPENDED', isActive: false }],
    ['4e Team-remove ACTIVE → activate (preserved)', ['ACTIVE', true], [['owner', 'DELETE', REMOVE], ['owner', 'PATCH', ACT]], 200, { status: 'ACTIVE', isActive: true }],
    ['4f Race: suspended mid-request → no mutation', ['DEACTIVATED', false], [['owner', 'PATCH', ACT]], 409, { status: 'SUSPENDED', isActive: false }, () => { raceSuspend = true; }],
    ['5  Normal employee activates employee', ['DEACTIVATED', false], [['emp', 'PATCH', ACT]], 403, { status: 'DEACTIVATED', isActive: false }],
    ['6  ALL_ACCESS employee activates employee', ['DEACTIVATED', false], [['allAccess', 'PATCH', ACT]], 403, { status: 'DEACTIVATED', isActive: false }],
    ['7  Individual activates employee', ['DEACTIVATED', false], [['indiv', 'PATCH', ACT]], 403, { status: 'DEACTIVATED', isActive: false }],
    // N1 regression
    ['R1 Normal employee deactivates', ['ACTIVE', true], [['emp', 'PATCH', DEACT]], 403, { status: 'ACTIVE', isActive: true }],
    ['R2 Normal employee updates permissions', ['ACTIVE', true], [['emp', 'PUT', PERMS, { permissions: ['CAMPAIGN_VIEW'] }]], 403, null],
    ['R3 ALL_ACCESS updates permissions', ['ACTIVE', true], [['allAccess', 'PUT', PERMS, { permissions: ['CAMPAIGN_VIEW'] }]], 403, null],
    ['R4 Owner updates permissions', ['ACTIVE', true], [['owner', 'PUT', PERMS, { permissions: ['CAMPAIGN_VIEW'] }]], 200, null],
    ['R5 Employee GET /templates (unchanged)', ['ACTIVE', true], [['emp', 'GET', '/api/v1/employees/templates']], 200, null],
    ['R6 Employee GET /:id/permissions (no TEAM_VIEW → 403 since N6)', ['ACTIVE', true], [['emp', 'GET', PERMS]], 403, null],
    ['R7 No token activate', ['DEACTIVATED', false], [[null, 'PATCH', ACT]], 401, { status: 'DEACTIVATED', isActive: false }],
];

(async () => {
    const server = app.listen(0, '127.0.0.1'); // loopback only
    await new Promise((resolve, reject) => server.once('listening', resolve).once('error', reject)); // address() is null until bound
    port = server.address().port;
    let pass = 0;
    for (const [label, [st, act], steps, expCode, expState, setup] of cases) {
        seed(st, act);
        if (setup) setup();
        let last;
        for (const [who, m, url, body] of steps) last = await call(who, m, url, body);
        const s = state();
        const stateOk = !expState || (s.status === expState.status && s.isActive === expState.isActive);
        const ok = last.code === expCode && stateOk;
        if (ok) pass++;
        console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(50)} → ${last.code} (exp ${expCode})  user=${s.status} empActive=${s.isActive}${expState && !stateOk ? `  EXPECTED user=${expState.status} empActive=${expState.isActive}` : ''}  ${last.msg}`);
    }
    console.log(`\n${pass}/${cases.length} passed`);
    process.exitCode = pass === cases.length ? 0 : 1;
    // Graceful shutdown: wait for the server and its keep-alive sockets to close, then let Node exit on its own.
    await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
        server.closeAllConnections();
    });
})().catch((e) => { console.log('HARNESS CRASH ' + e.stack); process.exitCode = 1; });
