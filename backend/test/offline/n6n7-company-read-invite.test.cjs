// N6/N7 verification harness — offline. Real app/routes/middleware, real User/Employee/AuditLog schema validation,
// in-memory persistence, dummy JWT secret.
process.env.JWT_SECRET = 'n6n7-harness-dummy-secret';
process.env.JWT_EXPIRE = '5m';

const path = require('path');
const BACKEND = path.resolve(__dirname, '..', '..'); // backend/ (this file: backend/test/offline/)
const mongoose = require(path.join(BACKEND, 'node_modules', 'mongoose'));
const jwt = require(path.join(BACKEND, 'node_modules', 'jsonwebtoken'));
mongoose.set('bufferCommands', false);

const src = (p) => require(path.join(BACKEND, 'src', p));
const User = src('models/User'), Employee = src('models/Employee'), Company = src('models/Company');
const Campaign = src('models/Campaign'), Booking = src('models/Booking'), Creative = src('models/Creative');
const Department = src('models/Department'), AuditLog = src('models/AuditLog');

const OID = () => new mongoose.Types.ObjectId();
const A = OID(), B = OID();
const U = { ownerA: OID(), none: OID(), team: OID(), analytics: OID(), campaignOnly: OID(), ownerB: OID(), staffB: OID(), indiv: OID() };
const EMP = { ownerA: OID(), none: OID(), team: OID(), analytics: OID(), campaignOnly: OID(), ownerB: OID(), staffB: OID() };
const DEPT_A = OID(), DEPT_B = OID();
let db, audit;

const seed = () => {
    audit = [];
    const u = (id, accountType, companyId, name) => ({ _id: id, id: String(id), accountType, status: 'ACTIVE', companyId, name, email: `${name.toLowerCase().replace(/\s+/g, '.')}@t.local` });
    const e = (id, userId, companyId, position, permissions) => ({ _id: id, userId, companyId, position, permissions, isActive: true, departmentId: null });
    db = {
        users: [
            u(U.ownerA, 'COMPANY', A, 'Owner A'), u(U.none, 'EMPLOYEE', A, 'No Perms'), u(U.team, 'EMPLOYEE', A, 'Team Viewer'),
            u(U.analytics, 'EMPLOYEE', A, 'Analyst'), u(U.campaignOnly, 'EMPLOYEE', A, 'Campaigner'),
            u(U.ownerB, 'COMPANY', B, 'Owner B'), u(U.staffB, 'EMPLOYEE', B, 'Staff B'), u(U.indiv, 'INDIVIDUAL', null, 'Ivy'),
        ],
        employees: [
            e(EMP.ownerA, U.ownerA, A, 'Company Owner', ['ALL_ACCESS']), e(EMP.none, U.none, A, 'Intern', []),
            e(EMP.team, U.team, A, 'HR', ['TEAM_VIEW']), e(EMP.analytics, U.analytics, A, 'Analyst', ['ANALYTICS_VIEW']),
            e(EMP.campaignOnly, U.campaignOnly, A, 'Planner', ['CAMPAIGN_VIEW', 'CAMPAIGN_CREATE']),
            e(EMP.ownerB, U.ownerB, B, 'Company Owner', ['ALL_ACCESS']), e(EMP.staffB, U.staffB, B, 'Secret Agent B', ['TEAM_VIEW']),
        ],
        companies: [
            { _id: A, name: 'A Co', slug: 'a-co', email: 'a@co.test', status: 'APPROVED', timezone: 'Africa/Lagos', currency: 'NGN' },
            { _id: B, name: 'B Co', slug: 'b-co', email: 'b@co.test', status: 'APPROVED', timezone: 'Africa/Lagos', currency: 'NGN' },
        ],
        departments: [
            { _id: DEPT_A, name: 'Marketing A', companyId: A, isActive: true, managerId: null },
            { _id: DEPT_B, name: 'Covert Ops B', companyId: B, isActive: true, managerId: null },
        ],
        campaigns: [], bookings: [], creatives: [], audit: [],
    };
};

const matches = (d, f) => Object.entries(f).every(([k, v]) => String(d[k]) === String(v));
const plain = (d) => (d && typeof d.toObject === 'function' ? d.toObject() : d);
const project = (doc, sel) => {
    if (!doc || !sel) return doc;
    const parts = sel.split(/\s+/).filter(Boolean);
    if (parts.every((p) => p.startsWith('-'))) return doc;
    const o = plain(doc), out = { _id: o._id };
    parts.forEach((f) => { if (f in o) out[f] = o[f]; });
    return out;
};
const asDoc = (d) => d && (typeof d.save === 'function' ? d : Object.assign(d, { save: async () => d, toObject() { const { save, toObject, ...r } = this; return r; } }));
const q = (getter) => {
    let sel = null;
    const x = { select: (s) => { sel = s; return x; }, populate: () => x, lean: () => x, sort: () => x, limit: () => x,
        then: (r, j) => Promise.resolve().then(() => { const v = getter(); return Array.isArray(v) ? v.map((d) => asDoc(project(d, sel))) : asDoc(project(v, sel)); }).then(r, j) };
    return x;
};
const fake = (M, c) => {
    M.find = (f = {}) => q(() => db[c].filter((d) => matches(d, f)));
    M.findOne = (f) => q(() => db[c].find((d) => matches(d, f)) || null);
    M.findById = (id) => q(() => db[c].find((d) => String(d._id) === String(id)) || null);
    M.countDocuments = async (f = {}) => db[c].filter((d) => matches(d, f)).length;
    M.aggregate = async () => [];
};
fake(User, 'users'); fake(Employee, 'employees'); fake(Company, 'companies'); fake(Department, 'departments');
fake(Campaign, 'campaigns'); fake(Booking, 'bookings'); fake(Creative, 'creatives'); fake(AuditLog, 'audit');
const createReal = (M, c) => async (data) => { const d = new M(data); await d.validate(); const o = d.toObject(); db[c].push(o); return d; };
User.create = createReal(User, 'users');            // real User schema validation (email match, accountType enum…)
Employee.create = createReal(Employee, 'employees');
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
        const r = await fetch(`http://127.0.0.1:${port}${url}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
        return { code: r.status, body: await r.json().catch(() => ({})) };
    };
    seed();
    const R = {
        dashboard: '/api/v1/company/dashboard', team: '/api/v1/company/team', departments: '/api/v1/departments',
        department: `/api/v1/departments/${DEPT_A}`, settings: '/api/v1/settings', usage: '/api/v1/settings/usage',
        empPerms: `/api/v1/employees/${EMP.team}/permissions`,
    };
    const N6 = [];
    const n6 = (label, ok, detail) => { N6.push(ok); check(label, ok, detail); };
    const noData = (r) => r.body.data === undefined;

    // ── N6-A zero permissions → 403, no data ──
    for (const [k, url] of Object.entries(R)) {
        const r = await call(U.none, 'GET', url);
        n6(`N6-A zero-permission employee GET ${k} → 403, no data`, r.code === 403 && noData(r), `${r.code} ${r.body.message}`);
    }
    // ── N6-B correct permission → allowed ──
    let r = await call(U.analytics, 'GET', R.dashboard);
    n6('N6-B ANALYTICS_VIEW → dashboard 200 with stats', r.code === 200 && r.body.data?.stats !== undefined, `${r.code}`);
    r = await call(U.team, 'GET', R.team);
    n6('N6-B TEAM_VIEW → team 200, only Company A members', r.code === 200 && r.body.data?.length === 5 && r.body.data.every((e) => String(e.userId) !== String(U.staffB)), `${r.code} n=${r.body.data?.length}`);
    r = await call(U.team, 'GET', R.departments);
    n6('N6-B TEAM_VIEW → departments 200, only Company A', r.code === 200 && r.body.data?.map((d) => d.name).join() === 'Marketing A', `${r.code} ${r.body.data?.map((d) => d.name)}`);
    r = await call(U.team, 'GET', R.department);
    n6('N6-B TEAM_VIEW → department detail 200', r.code === 200 && r.body.data?.name === 'Marketing A', `${r.code}`);
    r = await call(U.team, 'GET', R.empPerms);
    n6('N6-B TEAM_VIEW → employee permissions 200', r.code === 200 && r.body.data?.position === 'HR', `${r.code}`);
    r = await call(U.analytics, 'GET', R.usage);
    n6('N6-B ANALYTICS_VIEW → usage 200 (E1 fixed)', r.code === 200 && typeof r.body.data?.campaignCount === 'number', `${r.code} ${r.body.message || ''}`);
    // ── N6-C owner via ALL_ACCESS ──
    for (const [k, url] of Object.entries(R).filter(([k]) => k !== 'usage')) {
        r = await call(U.ownerA, 'GET', url);
        n6(`N6-C owner (ALL_ACCESS) GET ${k} → 200`, r.code === 200, `${r.code} ${r.body.message || ''}`);
    }
    r = await call(U.ownerA, 'GET', R.settings);
    n6('N6-C owner settings returns Company A only', r.body.data?.name === 'A Co' && String(r.body.data?.id) === String(A));
    // ── N6-D wrong permission → 403 ──
    for (const [who, label, urls] of [
        [U.team, 'TEAM_VIEW', ['dashboard', 'usage', 'settings']],
        [U.analytics, 'ANALYTICS_VIEW', ['team', 'departments', 'department', 'empPerms', 'settings']],
        [U.campaignOnly, 'CAMPAIGN_VIEW/CREATE', ['dashboard', 'team', 'departments', 'settings', 'usage', 'empPerms']],
    ]) {
        for (const k of urls) {
            r = await call(who, 'GET', R[k]);
            n6(`N6-D ${label} employee GET ${k} → 403`, r.code === 403 && noData(r), `${r.code}`);
        }
    }
    // ── N6-E individual / N6-F no token ──
    for (const [k, url] of Object.entries(R)) {
        const ri = await call(U.indiv, 'GET', url), rn = await call(null, 'GET', url);
        n6(`N6-E/F GET ${k}: individual 403, no token 401`, ri.code === 403 && rn.code === 401, `${ri.code}/${rn.code}`);
    }
    // ── N6-G company isolation ──
    r = await call(U.team, 'GET', `/api/v1/departments/${DEPT_B}`);
    n6('N6-G Company A TEAM_VIEW → Company B department → 404', r.code === 404 && noData(r), `${r.code}`);
    r = await call(U.team, 'GET', `/api/v1/employees/${EMP.staffB}/permissions`);
    n6('N6-G Company A TEAM_VIEW → Company B employee permissions → 404', r.code === 404, `${r.code}`);
    r = await call(U.ownerB, 'GET', R.team);
    n6('N6-G Company B owner team → only Company B members', r.code === 200 && r.body.data?.length === 2 && r.body.data.every((e) => String(e.userId) === String(U.ownerB) || String(e.userId) === String(U.staffB)));
    // ── N1 write protection intact ──
    r = await call(U.team, 'PUT', `/api/v1/employees/${EMP.none}/permissions`, { permissions: ['TEAM_VIEW'] });
    n6('N6   N1 intact: TEAM_VIEW employee cannot update permissions → 403', r.code === 403 && /owner only/i.test(r.body.message), `${r.code}`);

    // ── N7 invitation validation ──
    const N7 = [];
    const n7 = (label, ok, detail) => { N7.push(ok); check(label, ok, detail); };
    const base = { email: 'new.hire@t.local', name: 'New Hire' }; // E10/N11: no owner-chosen password
    const invite = (body, who = U.ownerA) => call(who, 'POST', '/api/v1/company/team/invite', body);
    const counts = () => `${db.users.length}/${db.employees.length}`;
    const rejected = async (label, body, msgRe) => {
        seed(); const before = counts();
        const x = await invite(body);
        n7(`${label} → 400, no User/Employee created`, x.code === 400 && counts() === before && audit.length === 0 && (!msgRe || msgRe.test(x.body.message)), `${x.code} ${x.body.message}`);
    };

    // N7-A valid + N7-I existing flow
    seed();
    r = await invite({ ...base, position: '  Media Buyer  ', permissions: ['TEAM_VIEW', 'CAMPAIGN_VIEW'], companyId: String(B) });
    const nu = db.users.find((x) => x.email === 'new.hire@t.local');
    const ne = nu && db.employees.find((x) => String(x.userId) === String(nu._id));
    n7('N7-A valid invite → 201', r.code === 201, `${r.code} ${r.body.message}`);
    n7('N7-I User: EMPLOYEE, PENDING (until invite accepted), no password, Company A (client companyId B ignored)', nu?.accountType === 'EMPLOYEE' && nu?.status === 'PENDING' && !nu?.password && String(nu?.companyId) === String(A));
    n7('N7-I Employee: trimmed position, permissions, active, invitedBy owner, Company A', ne?.position === 'Media Buyer' && ne?.permissions.join() === 'TEAM_VIEW,CAMPAIGN_VIEW'
        && ne?.isActive === true && String(ne?.invitedBy) === String(U.ownerA) && String(ne?.companyId) === String(A) && ne?.invitedAt && ne?.acceptedAt == null && typeof ne?.inviteTokenHash === 'string');
    n7('N7-I Response {id,name,email,position,permissions,isActive} + invitationPending, invitation', JSON.stringify(Object.keys(r.body.data || {})) === JSON.stringify(['id', 'name', 'email', 'position', 'permissions', 'isActive', 'invitationPending', 'invitation'])
        && /^Invitation created/.test(r.body.message));
    n7('N7-I One INVITE_EMPLOYEE audit (email, name, position)', audit.length === 1 && audit[0].action === 'INVITE_EMPLOYEE' && audit[0].metadata.position === 'Media Buyer' && audit[0].metadata.email === 'new.hire@t.local');
    // defaults (position omitted, permissions omitted)
    seed();
    r = await invite({ ...base });
    const de = db.employees.find((x) => String(x.userId) === String(db.users.find((y) => y.email === base.email)?._id));
    n7('N7-H defaults: position "Team Member", permissions [] (limited, never ALL_ACCESS)', r.code === 201 && de?.position === 'Team Member' && Array.isArray(de?.permissions) && de.permissions.length === 0);
    seed();
    r = await invite({ ...base, permissions: [] });
    n7('N7-H explicit permissions [] → 201 (zero-permission employee is valid)', r.code === 201 && db.employees.find((x) => String(x.companyId) === String(A) && x.position === 'Team Member' && x.permissions.length === 0 && String(x.userId) !== String(U.none)), `${r.code}`);

    // N7-B invalid position
    for (const [lbl, p] of [['empty', ''], ['whitespace', '   '], ['null', null], ['array', ['Manager']], ['object', { title: 'x' }], ['number', 7]]) {
        await rejected(`N7-B position ${lbl}`, { ...base, position: p }, /position must be a non-empty string/i);
    }
    // N7-C company owner
    for (const p of ['Company Owner', '  company owner ', 'COMPANY OWNER']) {
        await rejected(`N7-C position ${JSON.stringify(p)}`, { ...base, position: p }, /company owner cannot be assigned/i);
    }
    // N7-D unknown permissions
    for (const p of [['WHATEVER'], ['ADMIN'], ['ROOT'], ['SUPERUSER'], ['TEAM_VIEW', 'team_view'], [123], [null]]) {
        await rejected(`N7-D permissions ${JSON.stringify(p)}`, { ...base, permissions: p }, /permissions are invalid/i);
    }
    // N7-E / N7-F ALL_ACCESS
    await rejected('N7-E permissions ["ALL_ACCESS"]', { ...base, permissions: ['ALL_ACCESS'] }, /ALL_ACCESS can only be assigned/);
    await rejected('N7-F permissions ["TEAM_VIEW","ALL_ACCESS"]', { ...base, permissions: ['TEAM_VIEW', 'ALL_ACCESS'] }, /ALL_ACCESS can only be assigned/);
    await rejected('N7   duplicate permissions', { ...base, permissions: ['TEAM_VIEW', 'TEAM_VIEW'] }, /duplicate/i);
    // N7-G malformed types
    for (const [lbl, body, re] of [
        ['email 123', { ...base, email: 123 }, /must be text/], ['email {}', { ...base, email: {} }, /must be text/], ['email []', { ...base, email: ['a@b.co'] }, /must be text/],
        ['name {}', { ...base, name: {} }, /must be text/], ['name 42', { ...base, name: 42 }, /must be text/], ['password 12345678 (number) supplied', { ...base, password: 12345678 }, /chooses their own password/],
        ['permissions "TEAM_VIEW"', { ...base, permissions: 'TEAM_VIEW' }, /must be an array/], ['permissions {}', { ...base, permissions: {} }, /must be an array/],
        ['permissions null', { ...base, permissions: null }, /must be an array/], ['position []', { ...base, position: [] }, /position/i],
        ['email "not-an-email"', { ...base, email: 'not-an-email' }, /valid email/], ['name "   "', { ...base, name: '   ' }, /required/],
        ['missing email', { name: 'x' }, /required/], ['password "Str0ng!Pass" supplied', { ...base, password: 'Str0ng!Pass' }, /chooses their own password/],
    ]) {
        await rejected(`N7-G ${lbl}`, body, re);
    }
    seed();
    r = await call(U.ownerA, 'POST', '/api/v1/company/team/invite');
    n7('N7-G no body at all → 400, no 500', r.code === 400, `${r.code}`);
    // N7-I existing-user behaviour unchanged
    seed();
    r = await invite({ ...base, email: db.users.find((x) => String(x._id) === String(U.staffB)).email });
    n7('N7-I existing user (other company) → 409 unchanged, nothing created', r.code === 409 && db.users.length === 8, `${r.code} ${r.body.message}`);
    // N7-J authorization + isolation
    seed();
    for (const [who, lbl] of [[U.team, 'TEAM_VIEW employee'], [U.none, 'zero-permission employee'], [U.indiv, 'individual']]) {
        const x = await invite({ ...base }, who);
        n7(`N7-J ${lbl} cannot invite → 403, nothing created`, x.code === 403 && db.users.length === 8, `${x.code}`);
    }
    r = await call(null, 'POST', '/api/v1/company/team/invite', base);
    n7('N7-J no token → 401', r.code === 401);
    r = await invite({ ...base, email: 'b.hire@t.local', companyId: String(A) }, U.ownerB);
    n7('N7-J Company B owner invite lands in Company B even with companyId A in body', r.code === 201 && String(db.users.find((x) => x.email === 'b.hire@t.local')?.companyId) === String(B));

    console.log(`\nN6: ${N6.filter(Boolean).length}/${N6.length}   N7: ${N7.filter(Boolean).length}/${N7.length}`);
    const passed = results.filter(Boolean).length;
    console.log(`${passed}/${results.length} passed`);
    process.exitCode = passed === results.length ? 0 : 1;
    // Graceful shutdown: wait for the server and its keep-alive sockets to close, then let Node exit on its own.
    await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
        server.closeAllConnections();
    });
})().catch((e) => { console.log('HARNESS CRASH ' + e.stack); process.exitCode = 1; });
