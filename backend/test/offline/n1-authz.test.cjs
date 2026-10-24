// N1 verification harness — offline, in-memory fakes only. No real DB, no real secret.
process.env.JWT_SECRET = 'n1-harness-dummy-secret';
process.env.JWT_EXPIRE = '5m';

const path = require('path');
const BACKEND = path.resolve(__dirname, '..', '..'); // backend/ (this file: backend/test/offline/)
const req_ = (p) => require(path.join(BACKEND, 'node_modules', p));
const mongoose = req_('mongoose');
const jwt = req_('jsonwebtoken');
mongoose.set('bufferCommands', false); // any un-faked DB call fails instead of reaching a real DB

const src = (p) => require(path.join(BACKEND, 'src', p));
const User = src('models/User');
const Employee = src('models/Employee');
const Company = src('models/Company');
const AuditLog = src('models/AuditLog');

// ── In-memory data ──
const C1 = 'c00000000000000000000001';
const users = {
    owner:     { _id: 'a00000000000000000000001', accountType: 'COMPANY',  status: 'ACTIVE', companyId: C1 },
    emp:       { _id: 'a00000000000000000000002', accountType: 'EMPLOYEE', status: 'ACTIVE', companyId: C1 },
    allAccess: { _id: 'a00000000000000000000003', accountType: 'EMPLOYEE', status: 'ACTIVE', companyId: C1 },
    target:    { _id: 'a00000000000000000000004', accountType: 'EMPLOYEE', status: 'ACTIVE', companyId: C1 },
    indiv:     { _id: 'a00000000000000000000005', accountType: 'INDIVIDUAL', status: 'ACTIVE', companyId: null },
};
Object.values(users).forEach((u) => { u.id = u._id; });

const seedEmployees = () => [
    { _id: 'e00000000000000000000001', userId: users.owner._id,     companyId: C1, position: 'Company Owner', permissions: ['ALL_ACCESS'], isActive: true },
    { _id: 'e00000000000000000000002', userId: users.emp._id,       companyId: C1, position: 'Team Member',   permissions: [], isActive: true },
    { _id: 'e00000000000000000000003', userId: users.allAccess._id, companyId: C1, position: 'Manager',       permissions: ['ALL_ACCESS'], isActive: true },
    { _id: 'e00000000000000000000004', userId: users.target._id,    companyId: C1, position: 'Team Member',   permissions: [], isActive: true },
];
let employees = seedEmployees();
const TARGET = 'e00000000000000000000004';

// ── Fake query helpers ──
const q = (value) => {
    const query = {
        select: () => query,
        populate: () => query,
        lean: () => query,
        then: (res, rej) => Promise.resolve(value).then(res, rej),
    };
    return query;
};
const matches = (doc, filter) => Object.entries(filter).every(([k, v]) => String(doc[k]) === String(v));
const withSave = (doc) => doc && Object.assign(doc, { save: async () => doc, toObject: () => ({ ...doc }) });

User.findById = (id) => q(Object.values(users).find((u) => String(u._id) === String(id)) || null);
User.findByIdAndUpdate = async () => null;
User.updateOne = async (filter, update) => { const u = Object.values(users).find((x) => String(x._id) === String(filter._id)); if (u) Object.assign(u, update); return { matchedCount: u ? 1 : 0 }; };
Employee.findOne = (filter) => q(withSave(employees.find((e) => matches(e, filter)) || null));
Company.findById = (id) => q(String(id) === C1 ? { _id: C1, name: 'Test Co', status: 'APPROVED' } : null);
AuditLog.create = async () => ({});

const app = src('app');
const tokenFor = (u) => jwt.sign({ id: u._id }, process.env.JWT_SECRET, { expiresIn: '5m' });

const cases = [
    // [label, user, method, path, body, expected status]
    ['Owner      PUT  permissions', 'owner', 'PUT',   `/api/v1/employees/${TARGET}/permissions`, { permissions: ['CAMPAIGN_VIEW'] }, 200],
    ['Owner      PATCH deactivate', 'owner', 'PATCH', `/api/v1/employees/${TARGET}/deactivate`, null, 200],
    ['Owner      PATCH activate  ', 'owner', 'PATCH', `/api/v1/employees/${TARGET}/activate`, null, 200],
    ['Employee   PUT  permissions', 'emp', 'PUT',   `/api/v1/employees/${TARGET}/permissions`, { permissions: ['CAMPAIGN_VIEW'] }, 403],
    ['Employee   PATCH activate  ', 'emp', 'PATCH', `/api/v1/employees/${TARGET}/activate`, null, 403],
    ['Employee   PATCH deactivate', 'emp', 'PATCH', `/api/v1/employees/${TARGET}/deactivate`, null, 403],
    ['ALL_ACCESS PUT  permissions', 'allAccess', 'PUT',   `/api/v1/employees/${TARGET}/permissions`, { permissions: ['CAMPAIGN_VIEW'] }, 403],
    ['ALL_ACCESS PATCH activate  ', 'allAccess', 'PATCH', `/api/v1/employees/${TARGET}/activate`, null, 403],
    ['ALL_ACCESS PATCH deactivate', 'allAccess', 'PATCH', `/api/v1/employees/${TARGET}/deactivate`, null, 403],
    ['Individual PUT  permissions', 'indiv', 'PUT',   `/api/v1/employees/${TARGET}/permissions`, { permissions: ['CAMPAIGN_VIEW'] }, 403],
    ['No token   PUT  permissions', null, 'PUT',   `/api/v1/employees/${TARGET}/permissions`, { permissions: ['CAMPAIGN_VIEW'] }, 401],
    // Regression: read routes keep current behaviour (any active company member)
    ['Employee   GET  templates  ', 'emp', 'GET', '/api/v1/employees/templates', null, 200],
    ['Employee   GET  permissions (no TEAM_VIEW → 403 since N6)', 'emp', 'GET', `/api/v1/employees/${TARGET}/permissions`, null, 403],
    ['Owner      GET  permissions', 'owner', 'GET', `/api/v1/employees/${TARGET}/permissions`, null, 200],
];

(async () => {
    const server = app.listen(0, '127.0.0.1'); // loopback only
    await new Promise((resolve, reject) => server.once('listening', resolve).once('error', reject)); // address() is null until bound
    const port = server.address().port;
    let pass = 0;
    for (const [label, who, method, url, body, expected] of cases) {
        employees = seedEmployees(); // fresh state per case
        const headers = { 'Content-Type': 'application/json' };
        if (who) headers.Authorization = `Bearer ${tokenFor(users[who])}`;
        const r = await fetch(`http://127.0.0.1:${port}${url}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
        const j = await r.json().catch(() => ({}));
        const ok = r.status === expected;
        if (ok) pass++;
        console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  → ${r.status} (expected ${expected})  ${j.message || ''}`);
    }
    console.log(`\n${pass}/${cases.length} passed`);
    process.exitCode = pass === cases.length ? 0 : 1;
    // Graceful shutdown: wait for the server and its keep-alive sockets to close, then let Node exit on its own.
    await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
        server.closeAllConnections();
    });
})();
