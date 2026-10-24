// D7 verification harness — offline, in-memory fakes only. No real DB, no real secret.
process.env.JWT_SECRET = 'd7-harness-dummy-secret';
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

// ── Generic in-memory collections ──
let seq = 0;
const newId = () => (++seq).toString(16).padStart(24, '0');
const db = { users: [], employees: [], companies: [], audit: [] };
const fieldMatch = (actual, cond) => {
    if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
        if ('$ne' in cond) return String(actual) !== String(cond.$ne);
        if ('$in' in cond) return cond.$in.map(String).includes(String(actual));
    }
    return String(actual) === String(cond);
};
const matches = (doc, filter) => Object.entries(filter).every(([k, v]) => fieldMatch(doc[k], v));
const asDoc = (doc) => doc && Object.assign(doc, { save: async () => doc, toObject: () => ({ ...doc }) });
const q = (value) => {
    const query = { select: () => query, populate: () => query, lean: () => query, sort: () => query, session: () => query,
        then: (res, rej) => Promise.resolve(value).then(res, rej) };
    return query;
};
const fakeModel = (Model, coll, defaults = {}) => {
    Model.findOne = (f) => q(asDoc(db[coll].find((d) => matches(d, f)) || null));
    Model.findById = (id) => q(asDoc(db[coll].find((d) => String(d._id) === String(id)) || null));
    Model.exists = (f) => q(db[coll].some((d) => matches(d, f)) ? { _id: 'x' } : null);
    Model.countDocuments = async (f = {}) => db[coll].filter((d) => matches(d, f)).length;
    Model.findByIdAndDelete = async (id) => { const i = db[coll].findIndex((d) => String(d._id) === String(id)); return i >= 0 ? db[coll].splice(i, 1)[0] : null; };
    Model.updateOne = async (f, u) => { const d = db[coll].find((x) => matches(x, f)); if (d) Object.assign(d, u); return { matchedCount: d ? 1 : 0 }; };
    Model.create = async (data, options) => {
        // Transaction plumbing: create([doc], { session }) returns an array.
        if (Array.isArray(data)) { const out = []; for (const d of data) out.push(await Model.create(d, options)); return out; }
        if (Model.__failNextCreate) { Model.__failNextCreate = false; throw new Error('simulated create failure'); }
        if (coll === 'employees' && db.employees.some((e) => String(e.userId) === String(data.userId))) {
            const e = new Error('E11000 duplicate key'); e.code = 11000; throw e; // unique userId index
        }
        const doc = asDoc({ ...defaults, ...data, _id: newId() });
        doc.id = doc._id;
        db[coll].push(doc);
        if (options && options.session && options.session.inserted) options.session.inserted.push([coll, doc._id]);
        return doc;
    };
};
fakeModel(User, 'users', { status: 'ACTIVE', companyId: null });
fakeModel(Employee, 'employees', { permissions: [], isActive: true, position: 'Team Member' });
fakeModel(Company, 'companies', { status: 'PENDING' });
User.findByIdAndUpdate = async () => { throw new Error('unconditional findByIdAndUpdate must not be used'); };
AuditLog.create = async (d) => { db.audit.push(d); return d; };
// Transaction plumbing: createCompany runs in session.withTransaction(). This offline fake models an aborted
// transaction by removing exactly the documents inserted with that session (no compensating deletes).
mongoose.startSession = async () => {
    const s = {
        ended: false,
        inserted: [],
        async withTransaction(fn) {
            s.inserted = [];
            try { await fn(); } catch (e) {
                for (const [coll, id] of s.inserted) { const i = db[coll].findIndex((d) => String(d._id) === String(id)); if (i >= 0) db[coll].splice(i, 1); }
                throw e;
            }
        },
        async endSession() { s.ended = true; },
    };
    return s;
};

const { ensureCompanyOwnerEmployee } = src('controllers/admin.controller');
const app = src('app');

const admin = { _id: newId(), accountType: 'ADMIN', status: 'ACTIVE', companyId: null, email: 'admin@test.local' };
admin.id = admin._id;
db.users.push(admin);
const tok = (u) => jwt.sign({ id: u._id }, process.env.JWT_SECRET, { expiresIn: '5m' });

let port;
const call = async (u, method, url, body) => {
    const headers = { 'Content-Type': 'application/json' };
    if (u) headers.Authorization = `Bearer ${tok(u)}`;
    const r = await fetch(`http://127.0.0.1:${port}${url}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    return { code: r.status, msg: j.message || '', data: j.data };
};

const results = [];
const check = (label, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`); };
const addMember = (companyId, { position = 'Team Member', permissions = [], isActive = true, status = 'ACTIVE' } = {}) => {
    const u = asDoc({ _id: newId(), accountType: 'EMPLOYEE', status, companyId }); u.id = u._id; db.users.push(u);
    const e = asDoc({ _id: newId(), userId: u._id, companyId, position, permissions, isActive }); db.employees.push(e);
    return { u, e };
};
const OWNER_PROBE = (companyId) => `/api/v1/company/team/${'f'.repeat(24)}`; // owner-only route; 404 = owner guard passed

(async () => {
    const server = app.listen(0, '127.0.0.1'); // loopback only
    await new Promise((resolve, reject) => server.once('listening', resolve).once('error', reject)); // address() is null until bound
    port = server.address().port;
    const pw = 'Harness#Pass1';

    // ── Test 1: admin creates company → owner User + owner Employee ──
    const created = await call(admin, 'POST', '/api/v1/admin/companies', { name: 'Acme Media', email: 'owner@acme.example.com', password: pw });
    const co = db.companies.find((c) => c.email === 'owner@acme.example.com');
    const owner = db.users.find((u) => u.email === 'owner@acme.example.com');
    const ownerEmps = co ? db.employees.filter((e) => String(e.companyId) === String(co._id)) : [];
    const oe = ownerEmps[0];
    check('T1  Admin creates company → 201', created.code === 201, `${created.code} ${created.msg}`);
    check('T1  Owner User exists (COMPANY, linked)', !!owner && owner.accountType === 'COMPANY' && String(owner.companyId) === String(co?._id));
    check('T1  Exactly one owner Employee, fields correct', ownerEmps.length === 1 && String(oe.userId) === String(owner._id)
        && String(oe.companyId) === String(co._id) && oe.position === 'Company Owner' && oe.isActive === true,
        oe ? `position=${oe.position} isActive=${oe.isActive} perms=${JSON.stringify(oe.permissions)}` : 'missing');
    check('T1  Audit log records owner ids', db.audit.some((a) => a.action === 'CREATE_COMPANY' && a.metadata?.ownerEmployeeId === String(oe?._id)));

    // ── Test 2: owner authorization blocked while PENDING, works once APPROVED ──
    let r = await call(owner, 'PUT', OWNER_PROBE(co._id), { position: 'X' });
    check('T2  Owner of PENDING company blocked', r.code === 403, `${r.code} ${r.msg}`);
    r = await call(admin, 'PATCH', `/api/v1/admin/companies/${co._id}/verification`, { status: 'APPROVED' });
    check('T2  Admin approves company', r.code === 200 && co.status === 'APPROVED' && owner.status === 'ACTIVE', `${r.code} company=${co.status} owner=${owner.status}`);
    r = await call(owner, 'PUT', OWNER_PROBE(co._id), { position: 'X' });
    check('T2  requireCompanyOwner passes after approval (404 from controller, not 403)', r.code === 404, `${r.code} ${r.msg}`);

    // ── Test 3: duplicate owner protection ──
    const again = await ensureCompanyOwnerEmployee({ companyId: co._id, userId: owner._id });
    const ownerCount = db.employees.filter((e) => String(e.companyId) === String(co._id) && e.position === 'Company Owner').length;
    check('T3  Second ensureCompanyOwnerEmployee reuses record', again.created === false && String(again.employee._id) === String(oe._id) && ownerCount === 1, `created=${again.created} owners=${ownerCount}`);
    const { u: someone } = addMember(co._id);
    let conflict = null;
    try { await ensureCompanyOwnerEmployee({ companyId: co._id, userId: someone._id }); } catch (e) { conflict = e.code; }
    check('T3  Existing non-owner employee is not overwritten → conflict', conflict === 'OWNER_EMPLOYEE_CONFLICT' && db.employees.find((e) => String(e.userId) === String(someone._id)).position === 'Team Member');
    const stranger = asDoc({ _id: newId(), accountType: 'COMPANY', status: 'ACTIVE', companyId: co._id }); db.users.push(stranger);
    conflict = null;
    try { await ensureCompanyOwnerEmployee({ companyId: co._id, userId: stranger._id }); } catch (e) { conflict = e.code; }
    check('T3  Second different owner for same company refused', conflict === 'OWNER_EMPLOYEE_CONFLICT' && db.employees.filter((e) => String(e.companyId) === String(co._id) && e.position === 'Company Owner').length === 1);
    db.users.splice(db.users.indexOf(stranger), 1);
    r = await call(admin, 'POST', '/api/v1/admin/companies', { name: 'Acme Again', email: 'owner@acme.example.com', password: pw });
    check('T3  Re-creating with same owner email → 409, no extra records', r.code === 409 && db.companies.length === 1 && db.employees.filter((e) => e.position === 'Company Owner').length === 1, `${r.code} ${r.msg}`);

    // ── N1 / N3 regression on this company ──
    const normal = addMember(co._id);
    const allAcc = addMember(co._id, { position: 'Manager', permissions: ['ALL_ACCESS'] });
    const target = addMember(co._id);
    const suspended = addMember(co._id, { isActive: false, status: 'SUSPENDED' });
    r = await call(normal.u, 'PATCH', `/api/v1/employees/${target.e._id}/deactivate`);
    check('T10 N1: normal employee → employee management 403', r.code === 403, `${r.code} ${r.msg}`);
    r = await call(allAcc.u, 'PATCH', `/api/v1/employees/${target.e._id}/deactivate`);
    check('T10 N1: ALL_ACCESS employee → employee management 403', r.code === 403, `${r.code} ${r.msg}`);
    r = await call(owner, 'PATCH', `/api/v1/employees/${target.e._id}/deactivate`);
    check('T10 N1: admin-created owner → employee management allowed', r.code === 200 && target.e.isActive === false, `${r.code} ${r.msg}`);
    r = await call(owner, 'PATCH', `/api/v1/employees/${suspended.e._id}/activate`);
    check('T11 N3: owner activates SUSPENDED employee → 403, stays SUSPENDED', r.code === 403 && suspended.u.status === 'SUSPENDED' && suspended.e.isActive === false, `${r.code} user=${suspended.u.status}`);

    // ── Test 4 / 9 / 7: suspend approved → blocked → reactivate ──
    r = await call(admin, 'PATCH', `/api/v1/admin/companies/${co._id}/suspend`);
    check('T4  APPROVED → SUSPENDED allowed', r.code === 200 && co.status === 'SUSPENDED', `${r.code} company=${co.status}`);
    r = await call(admin, 'PATCH', `/api/v1/admin/companies/${co._id}/suspend`);
    check('T4  SUSPENDED → SUSPENDED blocked', r.code === 400, `${r.code} ${r.msg}`);
    r = await call(owner, 'PUT', OWNER_PROBE(co._id), { position: 'X' });
    check('T9  Owner of SUSPENDED company blocked', r.code === 403, `${r.code} ${r.msg}`);
    r = await call(normal.u, 'GET', '/api/v1/employees/templates');
    check('T9  Employee of SUSPENDED company blocked by requireCompany', r.code === 403 && /suspended/i.test(r.msg), `${r.code} ${r.msg}`);
    check('T9  Owner Employee record untouched by suspension', oe.isActive === true && oe.position === 'Company Owner');
    r = await call(admin, 'PATCH', `/api/v1/admin/companies/${co._id}/reactivate`);
    check('T7  SUSPENDED → APPROVED via reactivate', r.code === 200 && co.status === 'APPROVED' && owner.status === 'ACTIVE', `${r.code} company=${co.status}`);
    r = await call(owner, 'PUT', OWNER_PROBE(co._id), { position: 'X' });
    check('T7  Owner access restored after reactivation', r.code === 404, `${r.code} ${r.msg}`);
    r = await call(admin, 'PATCH', `/api/v1/admin/companies/${co._id}/reactivate`);
    check('T8b APPROVED → reactivate blocked', r.code === 400, `${r.code} ${r.msg}`);

    // ── Tests 5 / 6 / 8: PENDING and REJECTED cannot be suspended or reactivated ──
    await call(admin, 'POST', '/api/v1/admin/companies', { name: 'Beta Media', email: 'owner@beta.example.com', password: pw });
    const co2 = db.companies.find((c) => c.email === 'owner@beta.example.com');
    r = await call(admin, 'PATCH', `/api/v1/admin/companies/${co2._id}/suspend`);
    check('T5  PENDING → SUSPENDED blocked', r.code === 400 && co2.status === 'PENDING', `${r.code} ${r.msg}`);
    r = await call(admin, 'PATCH', `/api/v1/admin/companies/${co2._id}/reactivate`);
    check('T8c PENDING → reactivate blocked', r.code === 400 && co2.status === 'PENDING', `${r.code} ${r.msg}`);
    r = await call(admin, 'PATCH', `/api/v1/admin/companies/${co2._id}/verification`, { status: 'REJECTED' });
    check('    (setup) Admin rejects company', r.code === 200 && co2.status === 'REJECTED', `${r.code}`);
    r = await call(admin, 'PATCH', `/api/v1/admin/companies/${co2._id}/suspend`);
    check('T6  REJECTED → SUSPENDED blocked', r.code === 400 && co2.status === 'REJECTED', `${r.code} ${r.msg}`);
    r = await call(admin, 'PATCH', `/api/v1/admin/companies/${co2._id}/reactivate`);
    check('T8  REJECTED → APPROVED via reactivate blocked', r.code === 400 && co2.status === 'REJECTED', `${r.code} ${r.msg}`);

    // ── Rollback: owner Employee creation failure leaves nothing behind ──
    const before = { c: db.companies.length, u: db.users.length, e: db.employees.length };
    Employee.__failNextCreate = true;
    r = await call(admin, 'POST', '/api/v1/admin/companies', { name: 'Gamma Media', email: 'owner@gamma.example.com', password: pw });
    check('RB  Employee create fails → 500, Company + User rolled back', r.code === 500 && db.companies.length === before.c && db.users.length === before.u && db.employees.length === before.e
        && !db.users.some((u) => u.email === 'owner@gamma.example.com'), `${r.code} companies ${before.c}->${db.companies.length} users ${before.u}->${db.users.length}`);

    // ── Admin authorization unchanged ──
    r = await call(owner, 'POST', '/api/v1/admin/companies', { name: 'Evil', email: 'e@evil.example.com', password: pw });
    check('AZ  Company owner cannot use admin create endpoint', r.code === 403, `${r.code} ${r.msg}`);

    // ── Legacy state (what the backfill would fix): owner User, no Employee ──
    const legacyCo = asDoc({ _id: newId(), name: 'Legacy', email: 'legacy@test', status: 'APPROVED' }); db.companies.push(legacyCo);
    const legacyOwner = asDoc({ _id: newId(), accountType: 'COMPANY', status: 'ACTIVE', companyId: legacyCo._id }); legacyOwner.id = legacyOwner._id; db.users.push(legacyOwner);
    r = await call(legacyOwner, 'PUT', OWNER_PROBE(legacyCo._id), { position: 'X' });
    check('LG  Pre-existing owner without Employee still 403 (needs backfill)', r.code === 403, `${r.code} ${r.msg}`);

    const passed = results.filter(Boolean).length;
    console.log(`\n${passed}/${results.length} passed`);
    process.exitCode = passed === results.length ? 0 : 1;
    // Graceful shutdown: wait for the server and its keep-alive sockets to close, then let Node exit on its own.
    await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
        server.closeAllConnections();
    });
})().catch((e) => { console.log('HARNESS CRASH ' + e.stack); process.exitCode = 1; });
