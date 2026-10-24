// Media Masters — REAL MongoDB transaction integration test for POST /api/v1/admin/companies.
// Runs against the isolated Atlas test cluster ONLY (MONGODB_TEST_URI → database mm_txn_test).
// Separate from the offline suites; never reads or connects to MONGODB_URI's database.
'use strict';
// ── Explicit opt-in (checked before ANY .env read, module load or database work) ──
// This test WRITES to the isolated Atlas test database (MONGODB_TEST_URI → mm_txn_test).
// It refuses to run unless MM_RUN_TXN_INTEGRATION=1 is set for this command.
if (process.env.MM_RUN_TXN_INTEGRATION !== '1') {
    process.stdout.write('REFUSED (nothing loaded, no connection): set MM_RUN_TXN_INTEGRATION=1 to run the real-Atlas transaction test.\n');
    process.exit(2);
}
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const BACKEND = path.resolve(__dirname, '..', '..'); // backend/ (this file: backend/test/integration/)
const req = (p) => require(path.join(BACKEND, 'node_modules', p));
const out = (s) => process.stdout.write(s + '\n');
const abort = (why) => { out('ABORT (no connection made): ' + why); process.exit(2); };

// ── 1. Safety guard — before ANY connection ──
const dotenv = req('dotenv');
const { ConnectionString } = req('mongodb-connection-string-url');
const fileEnv = dotenv.parse(fs.readFileSync(path.join(BACKEND, '.env')));   // in memory; never printed
const TEST = fileEnv.MONGODB_TEST_URI;
const MAIN = fileEnv.MONGODB_URI;
if (!TEST) abort('MONGODB_TEST_URI missing');
let testCs;
try { testCs = new ConnectionString(TEST); } catch { abort('MONGODB_TEST_URI does not parse'); }
if (testCs.pathname !== '/mm_txn_test') abort('MONGODB_TEST_URI must select exactly mm_txn_test');
if (TEST === MAIN) abort('MONGODB_TEST_URI equals MONGODB_URI');
const hostsOf = (cs) => cs.hosts.map((h) => h.toLowerCase().replace(/:\d+$/, ''));
const clusterKey = (h) => h.split('.').slice(-3).join('.');
if (MAIN) {
    let mainCs; try { mainCs = new ConnectionString(MAIN); } catch { mainCs = null; }
    if (mainCs) {
        const mh = hostsOf(mainCs);
        if (hostsOf(testCs).some((h) => mh.includes(h) || mh.map(clusterKey).includes(clusterKey(h)))) abort('test cluster host matches the MONGODB_URI cluster');
    }
}
out('guard: MONGODB_TEST_URI present, parses, selects mm_txn_test, separate cluster from MONGODB_URI');

// ── 2. Load the app with test-only secrets; lock connections to TEST ──
process.env.JWT_SECRET = 'txn-it-' + crypto.randomBytes(16).toString('hex');
process.env.JWT_EXPIRE = '10m';
delete process.env.VERCEL;
const mongoose = req('mongoose');
const jwt = req('jsonwebtoken');
const realConnect = mongoose.connect.bind(mongoose);
mongoose.connect = (uri, ...rest) => { if (uri !== TEST) throw new Error('BLOCKED: only MONGODB_TEST_URI may be used'); return realConnect(uri, ...rest); };
mongoose.createConnection = () => { throw new Error('BLOCKED: createConnection not allowed in this test'); };
const src = (p) => require(path.join(BACKEND, 'src', p));
const app = src('app');                          // app.js runs dotenv.config(): drop DB URIs it may have set
delete process.env.MONGODB_URI; delete process.env.MONGODB_TEST_URI;
const User = src('models/User'), Company = src('models/Company'), Employee = src('models/Employee'), AuditLog = src('models/AuditLog');

const RUN = crypto.randomBytes(5).toString('hex');
const results = [];
const check = (label, ok, detail = '') => { results.push(ok); out(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== '' ? '  — ' + detail : ''}`); };
const safeErr = (e) => `${e && e.name} ${e && (e.code ?? '')} ${e && (e.codeName ?? '')}`.trim();

(async () => {
    let server = null;
    const created = { companies: new Set(), users: new Set() };
    try {
        await mongoose.connect(TEST, { serverSelectionTimeoutMS: 20000, appName: 'mm-txn-integration' });
        if (mongoose.connection.db.databaseName !== 'mm_txn_test') { out('ABORT: connected database is not mm_txn_test'); await mongoose.disconnect(); process.exit(2); }
        const hello = await mongoose.connection.db.admin().command({ hello: 1 });
        out(`connected: database mm_txn_test | replica set: ${!!hello.setName} | run id ${RUN}`);
        if (!hello.setName && hello.msg !== 'isdbgrid') { out('STOP: deployment does not support transactions'); return; }
        await Promise.all([Company.init(), User.init(), Employee.init(), AuditLog.init()]);   // unique indexes, test DB only

        // ── spies (test-process only) ──
        const sessions = [];
        const realStart = mongoose.startSession.bind(mongoose);
        mongoose.startSession = async (...a) => { const s = await realStart(...a); sessions.push(s); return s; };
        const auditCalls = [];
        const realAudit = AuditLog.create.bind(AuditLog);
        let auditFail = false;
        AuditLog.create = async (doc, ...rest) => {
            const committedAtAuditTime = !!(await Company.findOne({ _id: doc.entityId }).select('_id'));   // no session = committed data only
            auditCalls.push({ committedAtAuditTime, entityId: String(doc.entityId) });
            if (auditFail) throw new Error('INJECTED_AUDIT_FAILURE');
            return realAudit(doc, ...rest);
        };

        // ── admin actor in the test DB ──
        const admin = await User.create({ email: `txn-admin-${RUN}@example.com`, password: 'Aa1!' + crypto.randomBytes(9).toString('base64url'), name: 'Txn Admin', accountType: 'ADMIN', status: 'ACTIVE' });
        created.users.add(String(admin._id));
        const token = jwt.sign({ id: String(admin._id), tokenVersion: 0 }, process.env.JWT_SECRET, { expiresIn: '10m' });

        server = app.listen(0);
        const base = `http://127.0.0.1:${server.address().port}`;
        const post = async (body, auth = true) => {
            const r = await fetch(`${base}/api/v1/admin/companies`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
            const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* */ }
            return { code: r.status, body: json || {}, text };
        };
        let n = 0;
        const payload = (over = {}) => { n++; return { name: `Txn ${RUN} Co ${n}`, email: `txn-${RUN}-${n}@example.com`, password: 'Aa1!' + crypto.randomBytes(9).toString('base64url'), phone: null, website: null, description: null, address: null, city: null, state: null, country: '', timezone: 'Africa/Lagos', currency: 'NGN', ...over }; };
        const trio = async (email) => {
            const cos = await Company.find({ email }).lean();
            const users = await User.find({ email }).lean();
            const emps = cos.length ? await Employee.find({ companyId: { $in: cos.map((c) => c._id) } }).lean() : [];
            cos.forEach((c) => created.companies.add(String(c._id))); users.forEach((u) => created.users.add(String(u._id)));
            return { cos, users, emps };
        };
        const sessionsEndedSince = (mark) => sessions.slice(mark).length > 0 && sessions.slice(mark).every((s) => s.hasEnded === true);

        // ════════ 1. Successful creation ════════
        let mark = sessions.length;
        const p1 = payload();
        let r = await post(p1);
        let t = await trio(p1.email);
        check('S1  POST → 201 "Company created successfully"', r.code === 201 && r.body.message === 'Company created successfully', `${r.code} ${r.body.message || ''}`);
        check('S2  Exactly 1 Company, 1 owner User, 1 owner Employee committed', t.cos.length === 1 && t.users.length === 1 && t.emps.length === 1, `${t.cos.length}/${t.users.length}/${t.emps.length}`);
        const [c1] = t.cos, [u1] = t.users, [e1] = t.emps;
        check('S3  Employee belongs to the Company and the User; Company Owner, [ALL_ACCESS], active, invitedBy admin', e1 && String(e1.companyId) === String(c1._id) && String(e1.userId) === String(u1._id)
            && e1.position === 'Company Owner' && e1.permissions.join() === 'ALL_ACCESS' && e1.isActive === true && String(e1.invitedBy) === String(admin._id));
        check('S4  Defaults kept: Company PENDING, country Nigeria, slug generated; owner COMPANY/PENDING, mustChangePassword, bcrypt hash', c1 && c1.status === 'PENDING' && c1.country === 'Nigeria'
            && c1.slug === `txn-${RUN}-co-1` && u1.accountType === 'COMPANY' && u1.status === 'PENDING' && u1.mustChangePassword === true && /^\$2[aby]\$/.test(u1.password) && String(u1.companyId) === String(c1._id), c1 && c1.slug);
        check('S5  Response shape unchanged {success,message,data:{company,user:{id,name,email,accountType,status}}}, no password', JSON.stringify(Object.keys(r.body)) === '["success","message","data"]'
            && JSON.stringify(Object.keys(r.body.data || {})) === '["company","user"]' && JSON.stringify(Object.keys(r.body.data?.user || {})) === '["id","name","email","accountType","status"]' && !/password|\$2[aby]\$/.test(r.text));
        check('S6  Audit attempted once, after commit (company visible outside the transaction at audit time)', auditCalls.length === 1 && auditCalls[0].committedAtAuditTime === true && auditCalls[0].entityId === String(c1._id));
        check('S7  Session ended after success', sessionsEndedSince(mark), `${sessions.length - mark} session(s)`);

        // ════════ 2. Failure atomicity (injected after the insert, inside the transaction) ════════
        const inject = async (Model, label) => {
            const real = Model.create;
            const seen = {};
            Model.create = async function (docs, opts) {
                const res = await real.call(Model, docs, opts);
                if (opts && opts.session && !seen.done) {
                    seen.done = true;
                    const doc = Array.isArray(res) ? res[0] : res;
                    const email = doc.email || (await User.findById(doc.userId).session(opts.session).lean())?.email;
                    seen.visibleInsideTxn = !!(await Company.findOne({ email }).session(opts.session).lean());
                    seen.visibleOutsideTxn = !!(await Company.findOne({ email }).lean());
                    throw new Error(`INJECTED_TEST_FAILURE_${label}`);
                }
                return res;
            };
            return { seen, restore: () => { Model.create = real; } };
        };
        for (const [Model, label, step] of [[User, 'user', 'owner User creation'], [Employee, 'employee', 'owner Employee creation']]) {
            mark = sessions.length; const auditBefore = auditCalls.length;
            const pf = payload();
            const inj = await inject(Model, label);
            try { r = await post(pf); } finally { inj.restore(); }
            t = await trio(pf.email);
            check(`A${label === 'user' ? 1 : 2}  Failure during ${step} → 500 "Failed to create company"`, r.code === 500 && r.body.message === 'Failed to create company' && !/INJECTED/.test(r.text), `${r.code}`);
            check(`A${label === 'user' ? 1 : 2}b …the Company WAS written inside the transaction (visible in-session: ${inj.seen.visibleInsideTxn}) but not outside before commit (${inj.seen.visibleOutsideTxn})`, inj.seen.visibleInsideTxn === true && inj.seen.visibleOutsideTxn === false);
            check(`A${label === 'user' ? 1 : 2}c …after abort: 0 Company, 0 owner User, 0 Employee for this request`, t.cos.length === 0 && t.users.length === 0 && t.emps.length === 0, `${t.cos.length}/${t.users.length}/${t.emps.length}`);
            check(`A${label === 'user' ? 1 : 2}d …no audit entry attempted, session ended`, auditCalls.length === auditBefore && sessionsEndedSince(mark));
        }

        // ════════ 3. Duplicate + concurrent ════════
        r = await post(payload({ email: p1.email }));
        check('D1  Owner email already used → 409 "A user with this email already exists"', r.code === 409 && r.body.message === 'A user with this email already exists', `${r.code} ${r.body.message}`);
        const lone = await Company.create({ name: `Txn ${RUN} Lone`, slug: `txn-${RUN}-lone`, email: `txn-${RUN}-lone@example.com`, status: 'PENDING' });
        created.companies.add(String(lone._id));
        r = await post(payload({ email: lone.email }));
        t = await trio(lone.email);
        check('D2  Email used by a company only → 409 "A company with this email already exists", nothing added', r.code === 409 && r.body.message === 'A company with this email already exists' && t.cos.length === 1 && t.users.length === 0, `${r.code} ${r.body.message}`);
        mark = sessions.length;
        const same = payload();
        const rs = await Promise.all([1, 2, 3, 4, 5].map(() => post({ ...same, password: 'Aa1!' + crypto.randomBytes(9).toString('base64url') })));
        t = await trio(same.email);
        const codes = rs.map((x) => x.code).sort();
        check('D3  5 concurrent creates, same email → exactly one 201, the rest 409', codes.filter((c) => c === 201).length === 1 && codes.filter((c) => c === 409).length === 4, codes.join(','));
        check('D4  …exactly 1 Company, 1 User, 1 Employee for that email (no duplicates, no orphans)', t.cos.length === 1 && t.users.length === 1 && t.emps.length === 1 && String(t.emps[0].userId) === String(t.users[0]._id), `${t.cos.length}/${t.users.length}/${t.emps.length}`);
        check('D5  …all 5 sessions ended', sessionsEndedSince(mark) && sessions.length - mark === 5, `${sessions.length - mark}`);
        const sameName = `Txn ${RUN} Same Name`;
        const rn = await Promise.all([1, 2, 3, 4].map(() => post(payload({ name: sameName }))));
        const okEmails = rn.map((x, i) => [x, i]).filter(([x]) => x.code === 201).map(([x]) => x.body.data.company.email);
        const all4 = await Company.find({ name: sameName }).lean(); all4.forEach((c) => created.companies.add(String(c._id)));
        const orphan = [];
        for (const c of all4) { const o = await Employee.countDocuments({ companyId: c._id, position: 'Company Owner' }); const u = await User.countDocuments({ companyId: c._id }); if (o !== 1 || u !== 1) orphan.push(c.slug); }
        const slugs = all4.map((c) => c.slug);
        check('D6  4 concurrent creates with the same company name → no 500, unique slugs, every committed company has its owner (no orphans)', rn.every((x) => x.code === 201 || x.code === 409) && new Set(slugs).size === slugs.length
            && orphan.length === 0 && all4.length === okEmails.length, `codes ${rn.map((x) => x.code).join(',')} | slugs ${slugs.length}`);

        // ════════ 4. Audit failure after commit ════════
        auditFail = true; const pa = payload();
        try { r = await post(pa); } finally { auditFail = false; }
        t = await trio(pa.email);
        check('U1  Audit write fails after commit → still 201, records committed', r.code === 201 && t.cos.length === 1 && t.users.length === 1 && t.emps.length === 1, `${r.code} ${t.cos.length}/${t.users.length}/${t.emps.length}`);

        // ════════ 5. Validation / auth untouched, no session for rejected requests ════════
        mark = sessions.length;
        r = await post(payload({ password: 'weak' }));
        check('V1  Invalid input → 400 E13 shape, no transaction/session started', r.code === 400 && Array.isArray(r.body.fieldErrors) && sessions.length === mark, `${r.code}`);
        r = await post(payload(), false);
        check('V2  No token → 401', r.code === 401, `${r.code}`);
        check('X1  Every session started in this run has ended', sessions.every((s) => s.hasEnded === true), `${sessions.length} sessions`);
    } catch (e) {
        out('HARNESS ERROR: ' + safeErr(e));
        results.push(false);
    } finally {
        // ── 6. Cleanup: only this run's documents, only in mm_txn_test ──
        try {
            if (mongoose.connection.readyState === 1 && mongoose.connection.db.databaseName === 'mm_txn_test') {
                const runRe = new RegExp(`txn-(admin-)?${RUN}`);
                const cos = await Company.find({ $or: [{ email: runRe }, { _id: { $in: [...created.companies] } }] }).select('_id').lean();
                const us = await User.find({ $or: [{ email: runRe }, { _id: { $in: [...created.users] } }] }).select('_id').lean();
                const coIds = cos.map((c) => c._id), uIds = us.map((u) => u._id);
                const d1 = await Employee.deleteMany({ $or: [{ companyId: { $in: coIds } }, { userId: { $in: uIds } }] });
                const d2 = await AuditLog.deleteMany({ $or: [{ entityId: { $in: coIds } }, { userId: { $in: uIds } }] });
                const d3 = await User.deleteMany({ _id: { $in: uIds } });
                const d4 = await Company.deleteMany({ _id: { $in: coIds } });
                const left = (await Company.countDocuments({ email: runRe })) + (await User.countDocuments({ email: runRe }));
                out(`cleanup (mm_txn_test only, this run only): employees ${d1.deletedCount}, audit ${d2.deletedCount}, users ${d3.deletedCount}, companies ${d4.deletedCount} | remaining run docs: ${left}`);
                results.push(left === 0);
            }
        } catch (e) { out('CLEANUP ERROR: ' + safeErr(e)); results.push(false); }
        if (server) server.close();
        await mongoose.disconnect().catch(() => {});
        const passed = results.filter(Boolean).length;
        out(`\nTXN-INTEGRATION: ${passed}/${results.length} passed`);
        process.exitCode = passed === results.length ? 0 : 1;
    }
})();
