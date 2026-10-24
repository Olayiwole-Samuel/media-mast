// Safeguards of test/audit/production-readonly-audit.cjs — offline. Every database client is a fake; the real
// MongoClient.connect is patched to refuse, and no URI used here resolves anywhere (.invalid hosts).
'use strict';
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const BACKEND = path.resolve(__dirname, '..', '..'); // backend/ (this file: backend/test/offline/)
const SCRIPT = path.join(BACKEND, 'test', 'audit', 'production-readonly-audit.cjs');

// ── Global tripwire: no real connection may be attempted by anything in this process ──
const { MongoClient } = require(path.join(BACKEND, 'node_modules', 'mongodb'));
let realConnectAttempts = 0;
MongoClient.prototype.connect = async function () { realConnectAttempts++; throw new Error('tripwire: real connect attempted'); };

const audit = require(SCRIPT);
const { runAudit, isWriteAction } = audit;

const results = [];
const check = (label, ok, detail = '') => { results.push(ok); process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== '' ? '  — ' + detail : ''}\n`); };

const SECRET_USER = 'auditUserX7', SECRET_PASS = 'S3cr3t-P4ss-Z9';
const HOST = 'cluster0.prodfake.invalid';
const DB = 'mm_prod_fake';
const URI = `mongodb+srv://${SECRET_USER}:${SECRET_PASS}@${HOST}/${DB}?retryWrites=true`;
const baseEnv = () => ({ MM_RUN_PRODUCTION_READONLY_AUDIT: '1', MM_AUDIT_MONGODB_URI: URI, MM_AUDIT_EXPECTED_HOSTS: HOST, MM_AUDIT_EXPECTED_DB: DB });
const SENSITIVE = [SECRET_USER, SECRET_PASS, HOST, 'mongodb+srv://', 'prodfake'];

const READ_ROLE = [{ resource: { db: DB, collection: '' }, actions: ['changeStream', 'collStats', 'dbHash', 'dbStats', 'find', 'killCursors', 'listCollections', 'listIndexes', 'listSearchIndexes', 'planCacheRead'] }];
const READWRITE_ROLE = [{ resource: { db: DB, collection: '' }, actions: ['find', 'insert', 'update', 'remove', 'createIndex', 'dropIndex', 'listIndexes'] }];

const ix = (key, extra = {}) => ({ v: 2, key, name: Object.keys(key).map((k) => `${k}_1`).join('_'), ...extra });
const GOOD_INDEXES = () => ({
    companies: [ix({ _id: 1 }), ix({ email: 1 }, { unique: true }), ix({ slug: 1 }, { unique: true })],
    users: [ix({ _id: 1 }), ix({ email: 1 }, { unique: true })],
    employees: [ix({ _id: 1 }), ix({ userId: 1 }, { unique: true }), ix({ companyId: 1, isActive: 1 })],
    bookings: [ix({ _id: 1 }), ix({ bookingReference: 1 }, { unique: true }), ix({ stationId: 1 })],
    payments: [ix({ _id: 1 }), ix({ reference: 1 }, { unique: true }), ix({ campaignId: 1 })],
    stations: [ix({ _id: 1 }), ix({ slug: 1 }, { unique: true }), ix({ companyId: 1 })],
    departments: [ix({ _id: 1 }), ix({ companyId: 1, name: 1 }, { unique: true }), ix({ companyId: 1, isActive: 1 })],
    admins: [ix({ _id: 1 }), ix({ userId: 1 }, { unique: true })],
    campaigns: [ix({ _id: 1 })],
});
const ALL_COLLECTION_NAMES = ['companies', 'users', 'employees', 'payments', 'bookings', 'campaigns', 'stations', 'departments', 'admins', 'auditlogs'];
const C1 = 'c00000000000000000000001', C2 = 'c00000000000000000000002';
const GOOD_DATA = () => ({
    companies: [{ _id: C1, email: 'contact-one@example.com', slug: 'one', status: 'APPROVED', name: 'Secret Co One' }, { _id: C2, email: 'contact-two@example.com', slug: 'two', status: 'APPROVED', name: 'Secret Co Two' }],
    users: [{ _id: 'u1', email: 'owner.one@example.com', accountType: 'COMPANY', companyId: C1, name: 'Olu Owner', password: '$2b$10$' + 'h'.repeat(53), phone: '+2348000000001' },
        { _id: 'u2', email: 'owner.two@example.com', accountType: 'COMPANY', companyId: C2, name: 'Tola Owner', password: '$2b$10$' + 'h'.repeat(53) },
        { _id: 'u3', email: 'worker.one@example.com', accountType: 'EMPLOYEE', companyId: C1, name: 'Wale Worker', password: '$2b$10$' + 'h'.repeat(53) }],
    employees: [{ _id: 'e1', userId: 'u1', companyId: C1, position: 'Company Owner', permissions: ['ALL_ACCESS'], isActive: true, inviteTokenHash: 'tokhash-secret' },
        { _id: 'e2', userId: 'u2', companyId: C2, position: 'Company Owner', permissions: ['ALL_ACCESS'], isActive: true },
        { _id: 'e3', userId: 'u3', companyId: C1, position: 'Media Buyer', permissions: ['CAMPAIGN_VIEW'], isActive: true }],
    bookings: [{ _id: 'b1', bookingReference: 'BK-SECRET-REF-1' }, { _id: 'b2', bookingReference: 'BK-SECRET-REF-2' }],
    payments: [{ _id: 'p1', reference: 'PAY-SECRET-1' }],
    stations: [{ _id: 's1', slug: 'cool-fm-secret' }, { _id: 's2', slug: 'wazobia-secret' }],
    departments: [{ _id: 'd1', companyId: C1, name: 'Sales Secret' }, { _id: 'd2', companyId: C1, name: 'Ops Secret' }],
    admins: [{ _id: 'a1', userId: 'u9' }],
});

// Fake client: records every call; every write/index/aggregate method throws and is recorded.
const FORBIDDEN = ['insertOne', 'insertMany', 'updateOne', 'updateMany', 'replaceOne', 'deleteOne', 'deleteMany', 'bulkWrite', 'createIndex', 'createIndexes', 'dropIndex', 'dropIndexes', 'drop', 'rename', 'findOneAndUpdate', 'findOneAndDelete', 'findOneAndReplace', 'aggregate', 'createCollection', 'dropDatabase'];
const makeClient = (cfg = {}) => {
    const st = { calls: [], writes: [], commands: [], connects: 0, closes: 0, creates: 0 };
    const forbidden = Object.fromEntries(FORBIDDEN.map((n) => [n, (...a) => { st.writes.push(n); throw new Error(`write attempted: ${n}`); }]));
    const hello = cfg.hello || { isWritablePrimary: true, setName: 'atlas-rs0', hosts: ['a', 'b', 'c'], logicalSessionTimeoutMinutes: 30 };
    const db = (name) => ({
        ...forbidden,
        command: async (cmd) => {
            const n = Object.keys(cmd)[0]; st.commands.push(`${name}.${n}`);
            if (n === 'connectionStatus') {
                if (cfg.statusError) throw cfg.statusError;
                return { authInfo: { authenticatedUsers: [{ user: SECRET_USER, db: 'admin' }], authenticatedUserRoles: [{ role: cfg.privileges === READWRITE_ROLE ? 'readWrite' : 'read', db: DB }], authenticatedUserPrivileges: cfg.privileges === undefined ? READ_ROLE : cfg.privileges } };
            }
            if (n === 'hello') return hello;
            if (n === 'buildInfo') return { version: cfg.version || '8.0.4' };
            throw new Error(`unexpected command ${n}`);
        },
        listCollections: () => ({ toArray: async () => { st.calls.push(['listCollections', name]); return (cfg.collections || ALL_COLLECTION_NAMES).map((c) => ({ name: c })); } }),
        collection: (c) => ({
            ...forbidden,
            listIndexes: () => ({ toArray: async () => {
                st.calls.push(['listIndexes', c]);
                if (cfg.indexError && cfg.indexError[c]) throw cfg.indexError[c];
                // Like MongoDB: listIndexes on a collection that doesn't exist → NamespaceNotFound.
                if (!(cfg.collections || ALL_COLLECTION_NAMES).includes(c)) throw Object.assign(new Error(`ns does not exist: ${c}`), { name: 'MongoServerError', code: 26, codeName: 'NamespaceNotFound' });
                return (cfg.indexes || GOOD_INDEXES())[c] || [];
            } }),
            find: (filter, opts) => ({ toArray: async () => {
                st.calls.push(['find', c, JSON.stringify(filter), JSON.stringify(opts && opts.projection)]);
                const proj = opts && opts.projection;
                // Like MongoDB: find on a missing collection returns nothing.
                if (!(cfg.collections || ALL_COLLECTION_NAMES).includes(c)) return [];
                return ((cfg.data || GOOD_DATA())[c] || []).map((d) => (proj ? Object.fromEntries(Object.keys(proj).filter((k) => k in d).map((k) => [k, d[k]])) : d));
            } }),
        }),
    });
    const client = { connect: async () => { st.connects++; if (cfg.connectError) throw cfg.connectError; }, db, close: async () => { st.closes++; if (cfg.closeError) throw cfg.closeError; } };
    return { client, st };
};

const go = async (env, cfg) => {
    const { client, st } = makeClient(cfg);
    let output = '';
    const code = await runAudit({ env, deps: { createClient: () => { st.creates++; return client; } }, write: (s) => { output += s; } });
    let report = null; try { report = JSON.parse(output); } catch { report = null; }
    return { code, st, output, report };
};
const leaks = (text, extra = []) => [...SENSITIVE, ...extra].filter((s) => text.includes(s));
const DATA_SECRETS = ['@example.com', 'Olu Owner', 'Wale Worker', 'Secret Co', '$2b$10$', 'tokhash-secret', '+2348000000001'];

(async () => {
    let r;
    // ── S: opt-in and target confirmation (no client is ever created) ──
    r = await go({ ...baseEnv(), MM_RUN_PRODUCTION_READONLY_AUDIT: undefined });
    check('S1  No opt-in flag → exit 2, refused, no client created', r.code === 2 && /set MM_RUN_PRODUCTION_READONLY_AUDIT=1/.test(r.report?.refused || '') && r.st.creates === 0, `${r.code}`);
    for (const v of ['0', 'true', 'yes', ' 1']) {
        r = await go({ ...baseEnv(), MM_RUN_PRODUCTION_READONLY_AUDIT: v });
        check(`S2  Flag "${v}" (not exactly "1") → exit 2, no client`, r.code === 2 && r.st.creates === 0, `${r.code}`);
    }
    for (const k of ['MM_AUDIT_MONGODB_URI', 'MM_AUDIT_EXPECTED_HOSTS', 'MM_AUDIT_EXPECTED_DB']) {
        r = await go({ ...baseEnv(), [k]: undefined });
        check(`S3  Missing ${k} → exit 3, names the variable, no client`, r.code === 3 && (r.report?.refused || '').includes(k) && r.st.creates === 0, `${r.code}`);
    }
    r = await go({ ...baseEnv(), MM_AUDIT_MONGODB_URI: `mongodb+srv://${SECRET_USER}:${SECRET_PASS}@${HOST}/?retryWrites=true` });
    check('S4  URI without a database name → exit 3, no client', r.code === 3 && /must name the database/.test(r.report?.refused || '') && r.st.creates === 0, `${r.code}`);
    r = await go({ ...baseEnv(), MM_AUDIT_EXPECTED_DB: 'mm_txn_test' });
    check('S5  Database mismatch → exit 3, no client', r.code === 3 && /database does not match/.test(r.report?.refused || '') && r.st.creates === 0, `${r.code}`);
    r = await go({ ...baseEnv(), MM_AUDIT_EXPECTED_HOSTS: 'cluster0.other.invalid' });
    check('S6  Host mismatch → exit 3, no client', r.code === 3 && /hosts do not match/.test(r.report?.refused || '') && r.st.creates === 0, `${r.code}`);
    const multi = `mongodb://${SECRET_USER}:${SECRET_PASS}@h1.prodfake.invalid:27017,h2.prodfake.invalid:27017/${DB}?replicaSet=rs0`;
    r = await go({ ...baseEnv(), MM_AUDIT_MONGODB_URI: multi, MM_AUDIT_EXPECTED_HOSTS: 'H2.prodfake.invalid:27017, h1.prodfake.invalid:27017' });
    check('S7  Multi-host URI: hosts matched as a set (order/case-insensitive) → proceeds', r.code === 0 && r.st.creates === 1, `${r.code} ${r.report?.refused || ''}`);
    r = await go({ ...baseEnv(), MM_AUDIT_MONGODB_URI: multi, MM_AUDIT_EXPECTED_HOSTS: 'h1.prodfake.invalid:27017' });
    check('S8  Multi-host URI with only some hosts confirmed → exit 3', r.code === 3 && r.st.creates === 0, `${r.code}`);
    r = await go({ ...baseEnv(), MONGODB_URI: URI });
    check('S9  Audit URI equals the app MONGODB_URI → exit 3 (use a read-only user), no client', r.code === 3 && /read-only database user/.test(r.report?.refused || '') && r.st.creates === 0, `${r.code}`);
    r = await go({ ...baseEnv(), MM_AUDIT_MONGODB_URI: `http://${SECRET_USER}:${SECRET_PASS}@${HOST}/${DB}` });
    check('S10 Unparseable/non-MongoDB URI → exit 3, no client', r.code === 3 && /not a valid MongoDB connection string/.test(r.report?.refused || '') && r.st.creates === 0, `${r.code}`);
    let refusalLeaks = [];
    for (const env of [{ ...baseEnv(), MM_AUDIT_EXPECTED_DB: 'x' }, { ...baseEnv(), MM_AUDIT_EXPECTED_HOSTS: 'x' }, { ...baseEnv(), MM_AUDIT_MONGODB_URI: 'mongodb://' + SECRET_USER + ':' + SECRET_PASS + '@%%%' }]) {
        refusalLeaks = refusalLeaks.concat(leaks((await go(env)).output));
    }
    check('S11 Refusal output never contains the URI, host, username or password', refusalLeaks.length === 0, refusalLeaks.join(', ') || 'clean');

    // ── P: read-only privilege proof (after connect, before any data read) ──
    r = await go(baseEnv(), { privileges: READWRITE_ROLE });
    check('P1  readWrite user → exit 3 refused, names write actions', r.code === 3 && /can modify data/.test(r.report?.refused || '') && /insert/.test(r.report?.refused || ''), `${r.code}`);
    check('P2  …no data read (no listCollections/listIndexes/find), connection closed', r.st.calls.length === 0 && r.st.closes === 1 && r.report?.connectionClosed === true, `${r.st.calls.length} calls, ${r.st.closes} close`);
    r = await go(baseEnv(), { statusError: Object.assign(new Error(`not authorized on admin ${URI}`), { name: 'MongoServerError', codeName: 'Unauthorized' }) });
    check('P3  connectionStatus fails → exit 3, no data read, closed, no secret in output', r.code === 3 && r.st.calls.length === 0 && r.st.closes === 1 && leaks(r.output).length === 0, `${r.code} ${leaks(r.output)}`);
    r = await go(baseEnv(), { privileges: [] });
    check('P4  No privilege info → exit 3 (read-only cannot be proven), closed', r.code === 3 && r.st.calls.length === 0 && r.st.closes === 1, `${r.code}`);
    r = await go(baseEnv(), { privileges: [{ resource: { db: 'other', collection: '' }, actions: ['insert'] }, ...READ_ROLE] });
    check('P5  Write privilege on ANY database → refused (strict)', r.code === 3 && r.st.calls.length === 0, `${r.code}`);
    check('P6  isWriteAction: write/index/admin actions flagged', ['insert', 'update', 'remove', 'createIndex', 'dropIndex', 'dropDatabase', 'collMod', 'createUser', 'grantRole', 'anyAction', 'createFutureThing', 'dropFutureThing'].every(isWriteAction));
    check('P7  isWriteAction: read-role actions (incl. killCursors) not flagged', READ_ROLE[0].actions.every((a) => !isWriteAction(a)), READ_ROLE[0].actions.filter(isWriteAction).join(',') || 'none');

    // ── H: healthy deployment ──
    r = await go(baseEnv());
    const ck = r.report?.checks || {};
    check('H1  Healthy replica set → exit 0, all checks PASS', r.code === 0 && Object.values(ck).length === 5 && Object.values(ck).every((c) => c.status === 'PASS'), `${r.code} ${JSON.stringify(Object.fromEntries(Object.entries(ck).map(([k, v]) => [k, v.status])))}`);
    check('H2  Deployment: REPLICA_SET, version, transactions supported, member count only', ck.deployment?.topology === 'REPLICA_SET' && ck.deployment?.version === '8.0.4' && ck.deployment?.transactionsSupported === true && ck.deployment?.replicaSetMembers === 3);
    check('H3  All nine expected unique indexes PASS with names', (ck.indexes?.required || []).length === 9 && ck.indexes.required.every((x) => x.status === 'PASS' && x.indexName));
    check('H4  Actual indexes listed per collection (keys + options)', Array.isArray(ck.indexes?.collections?.users) && ck.indexes.collections.users.some((i) => i.unique && i.key.email === 1));
    check('H5  Worker risks: 2 designated owners, nothing anomalous', ck.workerPermissionRisks?.designatedOwners === 2 && ck.workerPermissionRisks?.anomalousOwnerMarkerCount === 0 && ck.workerPermissionRisks?.allAccessOnNonOwnerCount === 0);
    check('H6  Connection closed exactly once, reported', r.st.closes === 1 && r.report?.connectionClosed === true);
    check('H7  No write/index/aggregate method was called', r.st.writes.length === 0, r.st.writes.join(',') || 'none');
    check('H8  Only allowed commands (admin.connectionStatus, hello, buildInfo)', r.st.commands.every((c) => /\.(connectionStatus|hello|buildInfo)$/.test(c)) && r.st.commands.includes('admin.connectionStatus'), r.st.commands.join(','));
    check('H9  Every find has an empty filter and an explicit projection', r.st.calls.filter((c) => c[0] === 'find').every((c) => c[2] === '{}' && c[3] && c[3] !== '{}'));
    check('H10 Reads of users/employees never project name, password, phone or tokens; only companies + users read email', r.st.calls.filter((c) => c[0] === 'find' && ['users', 'employees'].includes(c[1])).every((c) => !/password|name|phone|inviteToken|tokenVersion/.test(c[3])) && r.st.calls.filter((c) => c[0] === 'find' && /email/.test(c[3])).map((c) => c[1]).sort().join() === 'companies,users');
    check('H11 Report contains no URI/host/user/password and no emails, names, hashes, tokens or phones', leaks(r.output, DATA_SECRETS).length === 0, leaks(r.output, DATA_SECRETS).join(', ') || 'clean');
    check('H12 Report states the confirmed database name only (hosts not printed)', r.report?.target?.database === DB && r.report?.target?.hostsConfirmed === true);

    // ── IX: all nine expected unique indexes (incl. compound departments) ──
    r = await go(baseEnv());
    const req9 = r.report?.checks?.indexes?.required || [];
    const labels = req9.map((x) => x.index).sort();
    check('IX1 Exactly the nine declared unique indexes are checked', JSON.stringify(labels) === JSON.stringify(['admins.userId', 'bookings.bookingReference', 'companies.email', 'companies.slug', 'departments.companyId+name', 'employees.userId', 'payments.reference', 'stations.slug', 'users.email']), labels.join(','));
    check('IX2 Each entry names its model source; only admins.userId is not required by the app', req9.every((x) => typeof x.source === 'string' && x.source.startsWith('models/')) && req9.filter((x) => x.requiredByApp === false).map((x) => x.index).join() === 'admins.userId');
    check('IX3 Compound departments index matched on the exact key { companyId: 1, name: 1 }', JSON.stringify(req9.find((x) => x.collection === 'departments')?.key) === '{"companyId":1,"name":1}' && req9.find((x) => x.collection === 'departments')?.status === 'PASS');

    const MISSING_CASES = [
        ['companies', { email: 1 }], ['companies', { slug: 1 }], ['users', { email: 1 }], ['employees', { userId: 1 }],
        ['bookings', { bookingReference: 1 }], ['payments', { reference: 1 }], ['stations', { slug: 1 }],
        ['departments', { companyId: 1, name: 1 }], ['admins', { userId: 1 }],
    ];
    for (const [coll, key] of MISSING_CASES) {
        const idx = GOOD_INDEXES();
        idx[coll] = idx[coll].filter((i) => JSON.stringify(i.key) !== JSON.stringify(key));
        r = await go(baseEnv(), { indexes: idx });
        const e = (r.report?.checks?.indexes?.required || []).find((x) => x.collection === coll && JSON.stringify(x.key) === JSON.stringify(key));
        const required = coll !== 'admins';
        check(`IX4 Missing ${coll}.${Object.keys(key).join('+')} → ${required ? 'ISSUE, exit 1' : 'NOTE only, exit 0 (declared, not used by the server)'}`,
            e?.reason === 'missing' && e?.status === (required ? 'ISSUE' : 'NOTE') && r.code === (required ? 1 : 0), `${e?.status} ${e?.reason} exit=${r.code}`);
    }

    let idx2 = GOOD_INDEXES(); idx2.departments = [ix({ _id: 1 }), ix({ name: 1, companyId: 1 }, { unique: true }), ix({ companyId: 1, isActive: 1 })];
    r = await go(baseEnv(), { indexes: idx2 });
    let dep = (r.report?.checks?.indexes?.required || []).find((x) => x.collection === 'departments');
    check('IX5 Departments unique on { name, companyId } (wrong order) → ISSUE "different key definition", not a match', dep?.status === 'ISSUE' && /different key definition/.test(dep?.reason || ''), `${dep?.status} ${dep?.reason}`);
    idx2 = GOOD_INDEXES(); idx2.departments = [ix({ _id: 1 }), ix({ companyId: 1, name: 1 }), ix({ companyId: 1, isActive: 1 })];
    r = await go(baseEnv(), { indexes: idx2 });
    dep = (r.report?.checks?.indexes?.required || []).find((x) => x.collection === 'departments');
    check('IX6 Departments { companyId, name } present but not unique → ISSUE "exists but not unique"', dep?.status === 'ISSUE' && dep?.reason === 'exists but not unique', `${dep?.status} ${dep?.reason}`);
    idx2 = GOOD_INDEXES(); idx2.departments = [ix({ _id: 1 }), ix({ companyId: 1 }, { unique: true }), ix({ companyId: 1, isActive: 1 })];
    r = await go(baseEnv(), { indexes: idx2 });
    dep = (r.report?.checks?.indexes?.required || []).find((x) => x.collection === 'departments');
    check('IX7 Unique on { companyId } alone does not satisfy { companyId, name } → ISSUE missing', dep?.status === 'ISSUE' && dep?.reason === 'missing', `${dep?.status} ${dep?.reason}`);
    idx2 = GOOD_INDEXES(); idx2.bookings = [ix({ _id: 1 }), ix({ bookingReference: 1 }, { unique: true, partialFilterExpression: { bookingReference: { $type: 'string' } } })];
    r = await go(baseEnv(), { indexes: idx2 });
    const bkIx = (r.report?.checks?.indexes?.required || []).find((x) => x.collection === 'bookings');
    check('IX8 Partial unique bookings.bookingReference → ISSUE (does not cover every document)', bkIx?.status === 'ISSUE' && /partial/.test(bkIx?.reason || ''), `${bkIx?.status} ${bkIx?.reason}`);
    idx2 = GOOD_INDEXES(); idx2.payments = [ix({ _id: 1 }), ix({ reference: -1 }, { unique: true })];
    r = await go(baseEnv(), { indexes: idx2 });
    const pIx = (r.report?.checks?.indexes?.required || []).find((x) => x.collection === 'payments');
    check('IX9 payments.reference unique but descending (-1) → reported as a different key definition', pIx?.status === 'ISSUE' && /different key definition/.test(pIx?.reason || ''), `${pIx?.status} ${pIx?.reason}`);
    idx2 = GOOD_INDEXES(); idx2.stations = [ix({ _id: 1 }), ix({ slug: 1 }, { unique: true, sparse: true })];
    r = await go(baseEnv(), { indexes: idx2 });
    const sIx = (r.report?.checks?.indexes?.required || []).find((x) => x.collection === 'stations');
    check('IX10 Sparse unique stations.slug → ISSUE', sIx?.status === 'ISSUE' && /sparse/.test(sIx?.reason || ''), `${sIx?.status} ${sIx?.reason}`);

    // ── CL: collections the transactions write to ──
    const ALL_COLLECTIONS = ['companies', 'users', 'employees', 'payments', 'bookings', 'campaigns', 'stations', 'departments', 'admins'];
    r = await go(baseEnv());
    const cp = r.report?.checks?.collectionsPresent || {};
    check('CL1 All nine collections reported; the seven written in transactions listed', JSON.stringify(Object.keys(cp.present || {}).sort()) === JSON.stringify([...ALL_COLLECTIONS].sort()) && JSON.stringify(cp.transactionCollections) === JSON.stringify(['companies', 'users', 'employees', 'payments', 'bookings', 'campaigns', 'stations']) && cp.status === 'PASS', JSON.stringify(cp.missingTransactional));
    const noPayments = ALL_COLLECTIONS.filter((c) => c !== 'payments' && c !== 'bookings');
    r = await go(baseEnv(), { collections: noPayments, version: '4.2.21' });
    let c2 = r.report?.checks?.collectionsPresent;
    check('CL2 MongoDB 4.2 with payments/bookings missing → ISSUE (a transaction cannot create them)', c2?.status === 'ISSUE' && JSON.stringify(c2.missingTransactional) === '["payments","bookings"]' && r.code === 1, `${c2?.status} ${JSON.stringify(c2?.missingTransactional)}`);
    r = await go(baseEnv(), { collections: noPayments, version: '8.0.4' });
    c2 = r.report?.checks?.collectionsPresent;
    const pMiss = (r.report?.checks?.indexes?.required || []).find((x) => x.collection === 'payments');
    check('CL3 MongoDB 8.0 with them missing → collections NOTE (first write creates them), but their unique indexes are reported missing (ISSUE)', c2?.status === 'NOTE' && pMiss?.status === 'ISSUE' && /collection does not exist/.test(pMiss?.reason || ''), `${c2?.status} ${pMiss?.status} ${pMiss?.reason}`);
    r = await go(baseEnv(), { collections: ALL_COLLECTIONS.filter((c) => c !== 'admins' && c !== 'departments') });
    c2 = r.report?.checks?.collectionsPresent;
    check('CL4 departments/admins missing → informational only (collections PASS); admins index NOTE; departments index ISSUE', c2?.status === 'PASS' && JSON.stringify(c2.missingOther) === '["departments","admins"]'
        && (r.report.checks.indexes.required.find((x) => x.collection === 'admins')?.status === 'NOTE') && (r.report.checks.indexes.required.find((x) => x.collection === 'departments')?.status === 'ISSUE'), `${c2?.status}`);

    // ── DX: duplicates for the new indexes (values never printed) ──
    const dx = GOOD_DATA();
    dx.bookings.push({ _id: 'b9', bookingReference: 'BK-SECRET-REF-1' }); // exact duplicate of b1
    dx.payments.push({ _id: 'p8' }, { _id: 'p9', reference: '' }); // two missing references
    dx.stations.push({ _id: 's9', slug: 'Cool-FM-Secret ' }); // case/space variant of s1
    dx.departments.push({ _id: 'd9', companyId: C1, name: 'Sales Secret' }, { _id: 'd10', companyId: C2, name: 'Sales Secret' }); // dup within C1 only
    dx.admins.push({ _id: 'a9', userId: 'u9' }); // duplicate userId (declared-only index)
    r = await go(baseEnv(), { data: dx });
    const f = (coll) => (r.report?.checks?.duplicatesBlockingUniqueIndexes?.fields || []).find((x) => x.collection === coll);
    check('DX1 bookings.bookingReference exact duplicate → 1 group with both ids, ISSUE', f('bookings')?.exactDuplicateGroups === 1 && JSON.stringify([...(f('bookings').exactDuplicateIds[0] || [])].sort()) === '["b1","b9"]' && f('bookings').status === 'ISSUE');
    check('DX2 payments.reference missing on 2 records → missingOrEmpty 2, ISSUE', f('payments')?.missingOrEmpty === 2 && f('payments').status === 'ISSUE');
    check('DX3 stations.slug case/space variant → case/space group + not normalised, ISSUE', f('stations')?.caseOrSpaceDuplicateGroups === 1 && f('stations').notNormalised === 1 && f('stations').status === 'ISSUE');
    check('DX4 departments: same name in the same company → 1 compound group; same name in another company is fine', f('departments')?.exactDuplicateGroups === 1 && JSON.stringify([...(f('departments').exactDuplicateIds[0] || [])].sort()) === '["d1","d9"]' && JSON.stringify(f('departments').fields) === '["companyId","name"]');
    check('DX5 admins.userId duplicate → NOTE (declared-only index), not ISSUE', f('admins')?.exactDuplicateGroups === 1 && f('admins').status === 'NOTE');
    check('DX6 No reference, slug or department name values in the output', !/BK-SECRET-REF|Cool-FM|cool-fm|Sales Secret/i.test(r.output) && leaks(r.output, DATA_SECRETS).length === 0, leaks(r.output, DATA_SECRETS).join(', ') || 'clean');
    check('DX7 Duplicate reads project only _id + the indexed fields', r.st.calls.filter((c) => c[0] === 'find' && ['bookings', 'payments', 'stations', 'departments', 'admins'].includes(c[1])).every((c) => {
        const p = Object.keys(JSON.parse(c[3])).sort().join();
        return ({ bookings: '_id,bookingReference', payments: '_id,reference', stations: '_id,slug', departments: '_id,companyId,name', admins: '_id,userId' })[c[1]] === p;
    }));
    check('DX8 Still read-only: no write/index/aggregate method called across these runs', r.st.writes.length === 0);

    // ── T: topology / version ──
    r = await go(baseEnv(), { hello: { isWritablePrimary: true, logicalSessionTimeoutMinutes: 30 } });
    check('T1  Standalone → deployment ISSUE, transactions unsupported, exit 1', r.code === 1 && r.report.checks.deployment.topology === 'STANDALONE' && r.report.checks.deployment.transactionsSupported === false && r.report.checks.deployment.status === 'ISSUE', `${r.code}`);
    r = await go(baseEnv(), { hello: { msg: 'isdbgrid', isWritablePrimary: true, logicalSessionTimeoutMinutes: 30 }, version: '7.0.2' });
    check('T2  Sharded (mongos) 7.0 → SHARDED, supported', r.report?.checks?.deployment?.topology === 'SHARDED' && r.report.checks.deployment.transactionsSupported === true);
    r = await go(baseEnv(), { hello: { setName: 'rs', hosts: ['a'], logicalSessionTimeoutMinutes: 30 }, version: '4.2.8' });
    check('T3  Replica set 4.2 → supported, with the <4.4 collection-creation note', r.report?.checks?.deployment?.transactionsSupported === true && r.report.checks.deployment.notes.some((n) => /4\.4/.test(n)));
    r = await go(baseEnv(), { hello: { setName: 'rs', hosts: ['a'], logicalSessionTimeoutMinutes: null }, version: '8.0.1' });
    check('T4  No logical sessions → transactions unsupported (ISSUE)', r.report?.checks?.deployment?.transactionsSupported === false && r.report.checks.deployment.status === 'ISSUE');

    // ── I: index problems ──
    let idx = GOOD_INDEXES(); idx.users = [ix({ _id: 1 }), ix({ email: 1 })];
    r = await go(baseEnv(), { indexes: idx });
    check('I1  users.email index not unique → ISSUE "exists but not unique", exit 1', r.code === 1 && r.report.checks.indexes.required.find((x) => x.collection === 'users').reason === 'exists but not unique');
    idx = GOOD_INDEXES(); idx.companies = [ix({ _id: 1 }), ix({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string' } } })];
    r = await go(baseEnv(), { indexes: idx });
    const reqC = r.report?.checks?.indexes?.required || [];
    check('I2  Partial unique companies.email → ISSUE; missing companies.slug → ISSUE "missing"', reqC.find((x) => x.field === undefined && x.key.email && x.collection === 'companies')?.status === 'ISSUE' && reqC.find((x) => x.key.slug)?.reason === 'missing');
    idx = GOOD_INDEXES(); idx.employees = [ix({ _id: 1 }), ix({ userId: 1, companyId: 1 }, { unique: true })];
    r = await go(baseEnv(), { indexes: idx });
    check('I3  Compound unique {userId,companyId} does not satisfy {userId} → ISSUE; declared {companyId,isActive} missing → ISSUE', r.report?.checks?.indexes?.required.find((x) => x.key.userId)?.status === 'ISSUE' && r.report.checks.indexes.declaredOther[0].status === 'ISSUE');

    // ── D: duplicates that would block a unique index (values never printed) ──
    const dd = GOOD_DATA();
    dd.users.push({ _id: 'u4', email: 'owner.one@example.com', accountType: 'INDIVIDUAL' }, { _id: 'u5', email: 'Worker.One@Example.com ', accountType: 'INDIVIDUAL' }, { _id: 'u6', accountType: 'INDIVIDUAL' }, { _id: 'u7', email: '', accountType: 'INDIVIDUAL' });
    r = await go(baseEnv(), { data: dd });
    const du = r.report?.checks?.duplicatesBlockingUniqueIndexes?.fields.find((f) => f.collection === 'users');
    check('D1  Exact duplicate email → 1 group with both ids', du?.exactDuplicateGroups === 1 && Array.isArray(du.exactDuplicateIds?.[0]) && JSON.stringify([...du.exactDuplicateIds[0]].sort()) === '["u1","u4"]', `${du?.exactDuplicateIds?.length} group(s)`);
    check('D2  Case/space variant → counted as duplicate group and not-normalised', du?.caseOrSpaceDuplicateGroups === 2 && du?.notNormalised === 1);
    check('D3  Two missing/empty emails → missingOrEmpty 2 (blocks a non-sparse unique index), ISSUE', du?.missingOrEmpty === 2 && du?.status === 'ISSUE');
    check('D4  Duplicate report contains no email values', leaks(r.output, DATA_SECRETS).length === 0, leaks(r.output, DATA_SECRETS).join(', ') || 'clean');

    // ── W: worker permission risks ──
    const wd = GOOD_DATA();
    wd.users.push({ _id: 'u8', email: 'legacy@example.com', accountType: 'EMPLOYEE', companyId: C1, name: 'Legacy Person' }, { _id: 'u9', email: 'lc@example.com', accountType: 'EMPLOYEE', companyId: C2 }, { _id: 'u10', email: 'aa@example.com', accountType: 'EMPLOYEE', companyId: C2 });
    wd.employees.push({ _id: 'e8', userId: 'u8', companyId: C1, position: 'Company Owner', permissions: ['ALL_ACCESS'], isActive: true },
        { _id: 'e9', userId: 'u9', companyId: C2, position: 'company owner', permissions: [], isActive: true },
        { _id: 'e10', userId: 'u10', companyId: C2, position: 'Analyst', permissions: ['ALL_ACCESS', 'TEAM_VIEW', 'TEAM_VIEW'], isActive: true });
    wd.companies.push({ _id: 'c3', email: 'c3@example.com', slug: 'three', status: 'PENDING' });
    r = await go(baseEnv(), { data: wd });
    const w = r.report?.checks?.workerPermissionRisks || {};
    check('W1  EMPLOYEE account holding "Company Owner" → anomalous marker (account type reason)', (w.anomalousOwnerMarkers || []).some((m) => m.employeeId === 'e8' && m.accountType === 'EMPLOYEE' && m.reasons.some((x) => /account type EMPLOYEE/.test(x))));
    check('W2  Lowercase "company owner" → anomalous marker (case reason)', (w.anomalousOwnerMarkers || []).some((m) => m.employeeId === 'e9' && m.reasons.some((x) => /case/.test(x))));
    check('W3  ALL_ACCESS on non-designated records listed (e8 legacy, e10 worker); owners e1/e2 not', JSON.stringify((w.allAccessOnNonOwner || []).map((x) => x.employeeId).sort()) === '["e10","e8"]');
    check('W4  Company with two active exact owner markers flagged', (w.companiesWithMultipleActiveOwners || []).some((c) => c.companyId === C1 && c.ownerEmployeeIds.length === 2));
    check('W5  Duplicate permissions record flagged; company without owner marker reported (informational)', (w.duplicatePermissionEmployeeIds || []).includes('e10') && (w.companiesWithoutActiveOwnerMarker || []).some((c) => c.companyId === 'c3'));
    check('W6  Risks → status ISSUE, exit 1; ids only, no names/emails/hashes in output', w.status === 'ISSUE' && r.code === 1 && leaks(r.output, [...DATA_SECRETS, 'Legacy Person']).length === 0, leaks(r.output, DATA_SECRETS).join(', ') || 'clean');

    // ── N: insufficient permission on one check, connect failure, close failure ──
    r = await go(baseEnv(), { indexError: { users: Object.assign(new Error(`not authorized on ${DB} to execute command listIndexes ${URI}`), { name: 'MongoServerError', codeName: 'Unauthorized' }) } });
    check('N1  listIndexes unauthorized on users → indexes NOT_COMPLETED (not PASS), exit 4', r.code === 4 && r.report.checks.indexes.status === 'NOT_COMPLETED' && r.report.checks.indexes.required.find((x) => x.collection === 'users').status === 'NOT_COMPLETED', `${r.code}`);
    check('N2  …other checks still ran, connection closed, error by name/code only', r.report.checks.workerPermissionRisks?.status === 'PASS' && r.st.closes === 1 && /MongoServerError Unauthorized/.test(JSON.stringify(r.report.checks.indexes.collections.users)) && leaks(r.output).length === 0);
    r = await go(baseEnv(), { connectError: Object.assign(new Error(`bad auth : Authentication failed. ${URI}`), { name: 'MongoServerSelectionError' }) });
    check('N3  Connect failure → exit 5 fatal, close still attempted, no secrets in output', r.code === 5 && /Audit stopped: MongoServerSelectionError/.test(r.report?.fatal || '') && r.st.closes === 1 && leaks(r.output).length === 0, `${r.code} ${leaks(r.output)}`);
    r = await go(baseEnv(), { closeError: new Error('close failed') });
    check('N4  Close failure is reported (connectionClosed false), audit result kept', r.code === 0 && r.report.connectionClosed === false);

    // ── G: static guarantees ──
    const source = fs.readFileSync(SCRIPT, 'utf8');
    const callsForbidden = FORBIDDEN.concat(['syncIndexes', 'ensureIndexes', 'createIndexes', 'init']).filter((m) => new RegExp(`\\.${m}\\(`).test(source));
    check('G1  Script source never calls a write/index/aggregate method or syncIndexes/ensureIndexes/init', callsForbidden.length === 0, callsForbidden.join(',') || 'none');
    const requires = [...source.matchAll(/require\(['"]([^'"]+)['"]\)/g)].map((m) => m[1]).sort();
    check('G2  Script requires only crypto, mongodb and its URI parser (no dotenv, Mongoose, app code or models)', JSON.stringify(requires) === JSON.stringify(['crypto', 'mongodb', 'mongodb-connection-string-url']), requires.join(','));
    const appUriReads = source.match(/env\.MONGODB_URI\b/g) || [];
    check('G3  Script reads its URI only from MM_AUDIT_MONGODB_URI (env.MONGODB_URI only in the equality refusal)', /const uri = env\.MM_AUDIT_MONGODB_URI;/.test(source) && appUriReads.length === 2 && /env\.MONGODB_URI && env\.MONGODB_URI === uri/.test(source), `${appUriReads.length} read(s)`);
    const runner = fs.readFileSync(path.join(BACKEND, 'test', 'run-offline.cjs'), 'utf8');
    check('G4  Offline runner only runs test/offline/*.test.cjs (audit script is in test/audit/)', /path\.join\(__dirname, 'offline'\)/.test(runner) && /\.test\.cjs/.test(runner) && !fs.existsSync(path.join(BACKEND, 'test', 'offline', 'production-readonly-audit.cjs')));
    const pkg = JSON.parse(fs.readFileSync(path.join(BACKEND, 'package.json'), 'utf8'));
    check('G5  No npm script or server code references the audit', !JSON.stringify(pkg.scripts).includes('audit') && !fs.readFileSync(path.join(BACKEND, 'server.js'), 'utf8').includes('audit'));
    check('G6  Requiring the module did not connect (tripwire untouched)', realConnectAttempts === 0, `${realConnectAttempts}`);

    // ── X: the script as a process (no target confirmed → never connects) ──
    const childEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^MM_|^MONGODB/.test(k)));
    let p = spawnSync(process.execPath, [SCRIPT], { cwd: BACKEND, env: childEnv, encoding: 'utf8', timeout: 30000 });
    check('X1  `node production-readonly-audit.cjs` without opt-in → exit 2, refusal message', p.status === 2 && /Refused: set MM_RUN_PRODUCTION_READONLY_AUDIT=1/.test(p.stdout), `${p.status}`);
    p = spawnSync(process.execPath, [SCRIPT], { cwd: BACKEND, env: { ...childEnv, MM_RUN_PRODUCTION_READONLY_AUDIT: '1' }, encoding: 'utf8', timeout: 30000 });
    check('X2  Opt-in but no target configured → exit 3, no connection attempted', p.status === 3 && /missing MM_AUDIT_MONGODB_URI/.test(p.stdout) && /No connection attempted/.test(p.stdout), `${p.status}`);
    p = spawnSync(process.execPath, [SCRIPT], { cwd: BACKEND, env: { ...childEnv, MM_RUN_PRODUCTION_READONLY_AUDIT: '1', MM_AUDIT_MONGODB_URI: URI, MM_AUDIT_EXPECTED_HOSTS: 'cluster0.wrong.invalid', MM_AUDIT_EXPECTED_DB: DB }, encoding: 'utf8', timeout: 30000 });
    check('X3  Opt-in with unconfirmed host → exit 3 before connecting, no secrets printed', p.status === 3 && /hosts do not match/.test(p.stdout) && leaks(p.stdout + p.stderr).length === 0, `${p.status}`);
    check('X4  Script never wrote a report file (stdout only)', !fs.readdirSync(path.join(BACKEND, 'test', 'audit')).some((f) => f !== 'production-readonly-audit.cjs'));

    const passed = results.filter(Boolean).length;
    process.stdout.write(`\n${passed}/${results.length} passed\n`);
    process.exitCode = passed === results.length ? 0 : 1;
})().catch((e) => { process.stdout.write('HARNESS CRASH ' + e.stack + '\n'); process.exitCode = 1; });
