// Media Masters — READ-ONLY production MongoDB audit (manual, opt-in, never run by tests or the server).
//
// Reports: server version + topology + transaction support; whether the collections the app's transactions
// write to exist; the actual indexes against all nine unique indexes the models declare (incl. the compound
// departments {companyId, name}); duplicate/missing values that would block a missing unique index; and
// worker permission risks (owner markers, ALL_ACCESS) from before the worker fixes.
//
// SAFETY
//  • Raw MongoDB driver only — never Mongoose or the app's models, so nothing can trigger autoIndex/createIndex.
//  • Never loads .env. The URI comes only from MM_AUDIT_MONGODB_URI, set by the operator for this one command.
//  • Refuses unless MM_RUN_PRODUCTION_READONLY_AUDIT=1, the URI names a database, and both the hosts and the
//    database match MM_AUDIT_EXPECTED_HOSTS / MM_AUDIT_EXPECTED_DB (typed from the provider dashboard).
//  • Refuses if MM_AUDIT_MONGODB_URI equals MONGODB_URI (the app's read-write credentials).
//  • After connecting, refuses before reading any data unless connectionStatus proves the user holds NO write,
//    index, schema, user-admin or config privileges anywhere (a "read" role on the target database suffices).
//  • Only hello / buildInfo / connectionStatus / listCollections / listIndexes / find(projection) are reachable
//    (guarded handle). No insert/update/delete/drop/index creation; no aggregation stages that write.
//  • Statuses: PASS · NOTE (informational, not a failure) · ISSUE · NOT_COMPLETED (never counted as a pass).
//  • Output: record ids, counts and statuses only — never the URI, hosts, usernames, passwords, hashes, tokens,
//    emails, names or phone numbers. Errors are reported by name/code only.
//
// USAGE (only after explicit approval; see the task report for the full procedure)
//   MM_RUN_PRODUCTION_READONLY_AUDIT=1 \
//   MM_AUDIT_MONGODB_URI='<read-only user URI incl. /<database>>' \
//   MM_AUDIT_EXPECTED_HOSTS='<host[,host…]> exactly as the dashboard shows' \
//   MM_AUDIT_EXPECTED_DB='<database name>' \
//   node test/audit/production-readonly-audit.cjs > audit-report.json
//
// EXIT CODES  0 all checks completed, no issues · 1 completed, issues found · 4 some checks not completed
//             2 refused: opt-in missing · 3 refused: unsafe or unconfirmed target/privileges · 5 fatal error
'use strict';

const crypto = require('crypto');

// ── Collections ──
// Written inside a MongoDB transaction by the app. On MongoDB < 4.4 a
// transaction cannot create a collection, so these must exist first:
//   createCompany        → companies, users, employees
//   createCompanyWorker  → users, employees
//   checkout             → payments, bookings, campaigns
//   createStationManager → users, stations
const TRANSACTION_COLLECTIONS = ['companies', 'users', 'employees', 'payments', 'bookings', 'campaigns', 'stations'];
// Read but never written inside a transaction (departments: read by
// createCompanyWorker) or not used by the server at all (admins).
const OTHER_COLLECTIONS = ['departments', 'admins'];

// ── Unique indexes declared in the models ──
// normalize: how the app stores the value, used to spot variants that a
// case- or space-sensitive unique index would treat as different:
//   'lower'  trimmed + lowercased (lowercase: true, trim: true)
//   'trim'   trimmed, case kept (trim: true)
//   'exact'  stored as given (ObjectIds, references without trim)
// requiredByApp: false = declared, but the server never loads the model, so
// Mongoose never builds the index on startup; reported as a NOTE.
const EXPECTED_UNIQUE = [
    { collection: 'companies', key: { email: 1 }, normalize: { email: 'lower' }, source: 'models/Company.js email: unique, lowercase, trim', requiredByApp: true },
    { collection: 'companies', key: { slug: 1 }, normalize: { slug: 'lower' }, source: 'models/Company.js slug: unique, lowercase, trim', requiredByApp: true },
    { collection: 'users', key: { email: 1 }, normalize: { email: 'lower' }, source: 'models/User.js email: unique, lowercase, trim', requiredByApp: true },
    { collection: 'employees', key: { userId: 1 }, normalize: { userId: 'exact' }, source: 'models/Employee.js userId: unique', requiredByApp: true },
    { collection: 'bookings', key: { bookingReference: 1 }, normalize: { bookingReference: 'trim' }, source: 'models/Booking.js bookingReference: unique, trim', requiredByApp: true },
    { collection: 'payments', key: { reference: 1 }, normalize: { reference: 'exact' }, source: 'models/Payment.js reference: unique', requiredByApp: true },
    { collection: 'stations', key: { slug: 1 }, normalize: { slug: 'lower' }, source: 'models/Station.js slug: unique, lowercase, trim', requiredByApp: true },
    { collection: 'departments', key: { companyId: 1, name: 1 }, normalize: { companyId: 'exact', name: 'trim' }, source: 'models/Department.js index({ companyId: 1, name: 1 }, { unique: true }); name: trim', requiredByApp: true },
    {
        collection: 'admins', key: { userId: 1 }, normalize: { userId: 'exact' }, source: 'models/Admin.js userId: unique', requiredByApp: false,
        note: 'The Admin model is only loaded by scripts/createAdmin.js, not by the server, so this index exists only if that script has run.',
    },
];
// Kept for callers/tests that import the old name.
const REQUIRED_UNIQUE = EXPECTED_UNIQUE;
// Declared non-unique index (Employee.js) — reported, not required for correctness.
const DECLARED_OTHER = [{ collection: 'employees', key: { companyId: 1, isActive: 1 } }];

const keyLabel = (key) => `${Object.keys(key).join('+')}`;
// For the report: e.g. "departments.companyId+name"
const indexLabel = (spec) => `${spec.collection}.${keyLabel(spec.key)}`;

const OWNER_POSITION = 'Company Owner';
const SAMPLE_LIMIT = 50;

// Privilege actions that can change data, indexes, schema, users/roles or server configuration.
const WRITE_ACTIONS = new Set([
    'insert', 'update', 'remove', 'bypassDocumentValidation', 'createCollection', 'createIndex', 'dropCollection',
    'dropIndex', 'dropDatabase', 'renameCollection', 'renameCollectionSameDB', 'collMod', 'convertToCapped',
    'compact', 'reIndex', 'emptycapped', 'enableSharding', 'shardCollection', 'moveChunk', 'splitChunk',
    'refineCollectionShardKey', 'reshardCollection', 'applyOps', 'createSearchIndexes', 'dropSearchIndex',
    'updateSearchIndex', 'createUser', 'dropUser', 'grantRole', 'revokeRole', 'createRole', 'dropRole',
    'updateRole', 'changePassword', 'changeCustomData', 'changeOwnPassword', 'changeOwnCustomData',
    'setAuthenticationRestriction', 'grantRolesToUser', 'revokeRolesFromUser', 'fsync', 'shutdown',
    'setParameter', 'replSetConfigure', 'resync', 'internal', 'anyAction', 'setFeatureCompatibilityVersion',
    'cleanupOrphaned', 'clearJumboFlag', 'analyzeShardKey', 'configureQueryAnalyzer', 'dropConnections',
    'killAnyCursor', 'killAnySession', 'killop', 'unlock', 'logRotate', 'flushRouterConfig', 'invalidateUserCache',
]);
// Prefix net for actions added in later server versions. Not "kill": killCursors is part of the read role
// (killAnyCursor / killAnySession / killop are listed explicitly above).
const WRITE_PREFIX = /^(insert|update|remove|delete|drop|create|rename|grant|revoke|set|shard|move|split|apply|reshard|enable|clear|refine)/i;
const isWriteAction = (action) => WRITE_ACTIONS.has(action) || WRITE_PREFIX.test(action);

const ALLOWED_COMMANDS = new Set(['hello', 'buildInfo', 'connectionStatus']);

class Refusal extends Error {
    constructor(exitCode, message) { super(message); this.name = 'Refusal'; this.exitCode = exitCode; }
}

// Errors by name/code only: driver messages can include hosts or command text.
const safeError = (error) => [error && error.name, error && (error.codeName || error.code)].filter(Boolean).join(' ') || 'Error';
const idStr = (v) => (v == null ? null : String(v));
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');
const normalize = (value, how) => {
    if (value == null) return null;
    const s = String(value);
    return how === 'email' || how === 'lower' ? s.trim().toLowerCase() : s;
};

// ── Target confirmation (no connection, nothing printed from the URI) ──
const confirmTarget = (env, parse) => {
    if (env.MM_RUN_PRODUCTION_READONLY_AUDIT !== '1') {
        throw new Refusal(2, 'Refused: set MM_RUN_PRODUCTION_READONLY_AUDIT=1 to run the read-only production audit. Nothing was loaded or connected.');
    }
    const uri = env.MM_AUDIT_MONGODB_URI;
    const missing = ['MM_AUDIT_MONGODB_URI', 'MM_AUDIT_EXPECTED_HOSTS', 'MM_AUDIT_EXPECTED_DB'].filter((k) => !env[k] || !String(env[k]).trim());
    if (missing.length) throw new Refusal(3, `Refused: missing ${missing.join(', ')}. No connection attempted.`);
    if (env.MONGODB_URI && env.MONGODB_URI === uri) {
        throw new Refusal(3, 'Refused: MM_AUDIT_MONGODB_URI is the application\'s MONGODB_URI. Use a dedicated read-only database user. No connection attempted.');
    }

    let parsed;
    try {
        parsed = parse(uri);
    } catch {
        throw new Refusal(3, 'Refused: MM_AUDIT_MONGODB_URI is not a valid MongoDB connection string. No connection attempted.');
    }
    const dbName = decodeURIComponent(String(parsed.pathname || '').replace(/^\//, ''));
    if (!dbName) throw new Refusal(3, 'Refused: MM_AUDIT_MONGODB_URI must name the database (…/<database>). No connection attempted.');
    if (dbName !== String(env.MM_AUDIT_EXPECTED_DB).trim()) {
        throw new Refusal(3, 'Refused: the URI\'s database does not match MM_AUDIT_EXPECTED_DB. No connection attempted.');
    }
    const norm = (hosts) => [...new Set(hosts.map((h) => String(h).trim().toLowerCase()).filter(Boolean))].sort().join(',');
    if (norm(parsed.hosts || []) !== norm(String(env.MM_AUDIT_EXPECTED_HOSTS).split(','))) {
        throw new Refusal(3, 'Refused: the URI\'s hosts do not match MM_AUDIT_EXPECTED_HOSTS. No connection attempted.');
    }
    return { uri, dbName };
};

// ── Read-only privilege proof (after connect, before any data read) ──
const assertReadOnly = async (admin) => {
    let status;
    try {
        status = await admin.command({ connectionStatus: 1, showPrivileges: true });
    } catch (error) {
        throw new Refusal(3, `Refused: could not read this user's privileges (${safeError(error)}), so read-only access cannot be proven. No data was read.`);
    }
    const privileges = status && status.authInfo && status.authInfo.authenticatedUserPrivileges;
    if (!Array.isArray(privileges) || privileges.length === 0) {
        throw new Refusal(3, 'Refused: no privilege information returned (unauthenticated or unsupported), so read-only access cannot be proven. No data was read.');
    }
    const writes = [...new Set(privileges.flatMap((p) => (Array.isArray(p.actions) ? p.actions : [])).filter(isWriteAction))].sort();
    if (writes.length) {
        throw new Refusal(3, `Refused: this database user can modify data or configuration (${writes.slice(0, 12).join(', ')}${writes.length > 12 ? ', …' : ''}). Use a user with only the "read" role on the target database. No data was read.`);
    }
    return { roles: (status.authInfo.authenticatedUserRoles || []).map((r) => `${r.role}@${r.db}`), writeActions: [] };
};

// ── Guarded, read-only handle: the only database surface the checks can reach ──
const guard = (db) => ({
    command: (cmd) => {
        const name = Object.keys(cmd)[0];
        if (!ALLOWED_COMMANDS.has(name)) throw new Error(`audit guard: command ${name} not allowed`);
        return db.command(cmd);
    },
    listCollectionNames: async () => (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name),
    listIndexes: (name) => db.collection(name).listIndexes().toArray(),
    findProjected: (name, projection) => {
        if (!projection || typeof projection !== 'object' || !Object.keys(projection).length) throw new Error('audit guard: projection required');
        return db.collection(name).find({}, { projection }).toArray();
    },
});

// ── Checks ──
const topologyOf = (hello) => {
    if (hello && hello.msg === 'isdbgrid') return 'SHARDED';
    if (hello && hello.setName) return 'REPLICA_SET';
    return 'STANDALONE';
};
const versionAtLeast = (version, major, minor = 0) => {
    const [a, b] = String(version || '0.0').split('.').map((x) => parseInt(x, 10) || 0);
    return a > major || (a === major && b >= minor);
};

const checkDeployment = async (g) => {
    const hello = await g.command({ hello: 1 });
    const build = await g.command({ buildInfo: 1 });
    const topology = topologyOf(hello);
    const version = build && build.version;
    const sessions = hello && hello.logicalSessionTimeoutMinutes != null;
    const minOk = topology === 'REPLICA_SET' ? versionAtLeast(version, 4, 0) : topology === 'SHARDED' ? versionAtLeast(version, 4, 2) : false;
    const supported = topology !== 'STANDALONE' && sessions && minOk;
    const notes = [];
    if (topology === 'STANDALONE') notes.push('Standalone servers do not support transactions: createCompany and createCompanyWorker would fail (500, nothing written).');
    if (supported && !versionAtLeast(version, 4, 4)) notes.push('MongoDB < 4.4: inserting into a collection that does not exist yet fails inside a transaction (see collectionsPresent).');
    return {
        status: supported ? 'PASS' : 'ISSUE',
        version: version || null,
        topology,
        replicaSetMembers: Array.isArray(hello && hello.hosts) ? hello.hosts.length : null, // count only
        logicalSessions: sessions,
        transactionsSupported: supported,
        notes,
    };
};

// Missing collections matter only where a transaction can't create one
// (MongoDB < 4.4). The deployment check runs first and supplies the version.
const checkCollections = async (g, ctx = {}) => {
    const names = new Set(await g.listCollectionNames());
    const present = Object.fromEntries([...TRANSACTION_COLLECTIONS, ...OTHER_COLLECTIONS].map((c) => [c, names.has(c)]));
    const missingTransactional = TRANSACTION_COLLECTIONS.filter((c) => !names.has(c));
    const missingOther = OTHER_COLLECTIONS.filter((c) => !names.has(c));
    const version = ctx.version || null;
    const canCreateInTransaction = version ? versionAtLeast(version, 4, 4) : false;

    let status = 'PASS';
    const notes = [];
    if (missingTransactional.length) {
        if (canCreateInTransaction) {
            status = 'NOTE';
            notes.push(`Not created yet: ${missingTransactional.join(', ')}. MongoDB ${version} creates a collection on its first write, even inside a transaction.`);
        } else {
            status = 'ISSUE';
            notes.push(`Missing: ${missingTransactional.join(', ')}. On MongoDB < 4.4${version ? '' : ' (version unknown)'} a transaction cannot create them, so those operations would fail.`);
        }
    }
    if (missingOther.length) notes.push(`Not present (informational): ${missingOther.join(', ')}.`);

    return {
        status,
        present,
        transactionCollections: TRANSACTION_COLLECTIONS,
        missingTransactional,
        missingOther,
        notes,
    };
};

const sameKey = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const isNamespaceMissing = (error) => error && (error.code === 26 || error.codeName === 'NamespaceNotFound');

const listCollectionIndexes = async (g, collection) => {
    try {
        return { list: await g.listIndexes(collection), missing: false };
    } catch (error) {
        if (isNamespaceMissing(error)) return { list: [], missing: true };
        return { error };
    }
};

const checkIndexes = async (g) => {
    const out = { status: 'PASS', collections: {}, required: [], declaredOther: [] };
    const byCollection = {};
    const collections = [...new Set([...EXPECTED_UNIQUE.map((s) => s.collection), ...DECLARED_OTHER.map((d) => d.collection)])];

    for (const c of collections) {
        const result = await listCollectionIndexes(g, c);
        if (result.error) {
            byCollection[c] = null;
            out.collections[c] = { status: 'NOT_COMPLETED', error: safeError(result.error) };
            continue;
        }
        byCollection[c] = result;
        out.collections[c] = result.missing
            ? { status: 'MISSING_COLLECTION' }
            : result.list.map((ix) => ({
                name: ix.name, key: ix.key, unique: ix.unique === true,
                ...(ix.sparse ? { sparse: true } : {}), ...(ix.partialFilterExpression ? { partial: true } : {}),
                ...(ix.collation ? { collation: { locale: ix.collation.locale, strength: ix.collation.strength } } : {}),
            }));
    }

    for (const spec of EXPECTED_UNIQUE) {
        const entry = {
            index: indexLabel(spec),
            collection: spec.collection,
            key: spec.key,
            source: spec.source,
            requiredByApp: spec.requiredByApp,
            ...(spec.note ? { note: spec.note } : {}),
        };
        const found = byCollection[spec.collection];
        const notOk = spec.requiredByApp ? 'ISSUE' : 'NOTE';

        if (!found) {
            out.required.push({ ...entry, status: 'NOT_COMPLETED' });
            continue;
        }
        if (found.missing) {
            out.required.push({ ...entry, status: notOk, reason: 'collection does not exist yet, so neither does the index' });
            continue;
        }

        // Exact key (fields and order), as the model declares it.
        const ix = found.list.find((i) => sameKey(i.key, spec.key));
        // Same fields in another order or with other directions: a mismatch, not a match.
        const sameFields = !ix && found.list.find((i) => i.key && Object.keys(i.key).sort().join() === Object.keys(spec.key).sort().join());

        let status = 'PASS', reason = null;
        if (!ix) { status = notOk; reason = sameFields ? `index on the same fields but a different key definition (${JSON.stringify(sameFields.key)})` : 'missing'; }
        else if (ix.unique !== true) { status = notOk; reason = 'exists but not unique'; }
        else if (ix.partialFilterExpression || ix.sparse) { status = notOk; reason = 'unique but partial/sparse (does not cover every document)'; }

        out.required.push({
            ...entry,
            status,
            ...(reason ? { reason } : {}),
            ...(ix ? { indexName: ix.name } : {}),
            ...(ix && ix.collation ? { collationNote: 'has a collation; uniqueness follows its comparison rules' } : {}),
        });
    }

    for (const d of DECLARED_OTHER) {
        const found = byCollection[d.collection];
        out.declaredOther.push({
            collection: d.collection,
            key: d.key,
            status: !found ? 'NOT_COMPLETED' : found.missing ? 'NOTE' : found.list.some((i) => sameKey(i.key, d.key)) ? 'PASS' : 'ISSUE',
        });
    }

    const statuses = [...out.required, ...out.declaredOther].map((r) => r.status);
    out.status = statuses.includes('NOT_COMPLETED') ? 'NOT_COMPLETED' : statuses.includes('ISSUE') ? 'ISSUE' : statuses.includes('NOTE') ? 'NOTE' : 'PASS';
    return out;
};

const foldValue = (value, how) => {
    const s = String(value);
    if (how === 'lower') return s.trim().toLowerCase();
    if (how === 'trim') return s.trim();
    return s;
};

// Values that would block (re)building a unique index, compared in memory by
// hash; values are never output — only record ids and counts.
const checkDuplicates = async (g) => {
    const out = { status: 'PASS', fields: [] };

    for (const spec of EXPECTED_UNIQUE) {
        const fields = Object.keys(spec.key);
        const folds = fields.some((f) => spec.normalize[f] !== 'exact');
        const entry = {
            index: indexLabel(spec),
            collection: spec.collection,
            ...(fields.length === 1 ? { field: fields[0] } : { fields }),
            requiredByApp: spec.requiredByApp,
        };
        const notOk = spec.requiredByApp ? 'ISSUE' : 'NOTE';

        try {
            const docs = await g.findProjected(spec.collection, Object.fromEntries([['_id', 1], ...fields.map((f) => [f, 1])]));
            const exact = new Map(), folded = new Map();
            let missing = 0, notNormalised = 0;

            for (const d of docs) {
                const raws = fields.map((f) => d[f]);
                // A missing field indexes as null: two such documents collide.
                if (raws.some((v) => v == null || v === '')) { missing++; continue; }
                const exactKey = raws.map((v) => String(v)).join('\u0000');
                const foldedKey = fields.map((f, i) => foldValue(raws[i], spec.normalize[f])).join('\u0000');
                if (foldedKey !== exactKey) notNormalised++;
                const ek = hash(exactKey), fk = hash(foldedKey);
                if (!exact.has(ek)) exact.set(ek, []); exact.get(ek).push(idStr(d._id));
                if (!folded.has(fk)) folded.set(fk, []); folded.get(fk).push(idStr(d._id));
            }

            const groups = (m) => [...m.values()].filter((ids) => ids.length > 1);
            const exactDup = groups(exact), foldedDup = groups(folded);
            Object.assign(entry, {
                documents: docs.length,
                exactDuplicateGroups: exactDup.length,
                exactDuplicateIds: exactDup.slice(0, SAMPLE_LIMIT),
                caseOrSpaceDuplicateGroups: folds ? foldedDup.length : 0,
                caseOrSpaceDuplicateIds: folds ? foldedDup.slice(0, SAMPLE_LIMIT) : [],
                missingOrEmpty: missing, // >1 blocks a non-sparse unique index
                notNormalised: folds ? notNormalised : 0,
            });
            entry.status = exactDup.length || missing > 1 || entry.caseOrSpaceDuplicateGroups || entry.notNormalised ? notOk : 'PASS';
        } catch (error) {
            Object.assign(entry, { status: 'NOT_COMPLETED', error: safeError(error) });
        }
        out.fields.push(entry);
    }

    const st = out.fields.map((f) => f.status);
    out.status = st.includes('NOT_COMPLETED') ? 'NOT_COMPLETED' : st.includes('ISSUE') ? 'ISSUE' : st.includes('NOTE') ? 'NOTE' : 'PASS';
    return out;
};

const checkWorkerRisks = async (g) => {
    let employees, users, companies;
    try {
        employees = await g.findProjected('employees', { _id: 1, userId: 1, companyId: 1, position: 1, permissions: 1, isActive: 1 });
        users = await g.findProjected('users', { _id: 1, accountType: 1, companyId: 1 });
        companies = await g.findProjected('companies', { _id: 1, status: 1 });
    } catch (error) {
        return { status: 'NOT_COMPLETED', error: safeError(error) };
    }
    const userById = new Map(users.map((u) => [idStr(u._id), u]));
    const isMarker = (e) => typeof e.position === 'string' && e.position.trim().toLowerCase() === 'company owner';
    const brief = (e, extra = {}) => {
        const u = userById.get(idStr(e.userId));
        return { employeeId: idStr(e._id), userId: idStr(e.userId), companyId: idStr(e.companyId), isActive: e.isActive === true, accountType: u ? u.accountType : null, ...extra };
    };
    const designated = (e) => {
        const u = userById.get(idStr(e.userId));
        return e.position === OWNER_POSITION && !!u && u.accountType === 'COMPANY' && idStr(u.companyId) === idStr(e.companyId);
    };

    const markers = employees.filter(isMarker);
    const anomalousMarkers = markers.filter((e) => !designated(e)).map((e) => {
        const u = userById.get(idStr(e.userId));
        const reasons = [];
        if (e.position !== OWNER_POSITION) reasons.push('position differs in case/spacing from "Company Owner"');
        if (!u) reasons.push('user record not found');
        else {
            if (u.accountType !== 'COMPANY') reasons.push(`account type ${u.accountType} (owner powers via requireCompanyOwner/requirePermission)`);
            if (idStr(u.companyId) !== idStr(e.companyId)) reasons.push('user.companyId differs from employee.companyId');
        }
        return brief(e, { reasons });
    });

    const activeExactByCompany = new Map();
    for (const e of markers) if (e.position === OWNER_POSITION && e.isActive === true) {
        const k = idStr(e.companyId); activeExactByCompany.set(k, (activeExactByCompany.get(k) || []).concat(idStr(e._id)));
    }
    const multipleOwnerCompanies = [...activeExactByCompany.entries()].filter(([, ids]) => ids.length > 1).map(([companyId, ids]) => ({ companyId, ownerEmployeeIds: ids }));
    const companiesWithoutOwner = companies.filter((c) => !activeExactByCompany.has(idStr(c._id))).map((c) => ({ companyId: idStr(c._id), status: c.status || null }));

    const allAccess = employees.filter((e) => Array.isArray(e.permissions) && e.permissions.includes('ALL_ACCESS'));
    const allAccessNonOwner = allAccess.filter((e) => !designated(e)).map((e) => brief(e, { position: e.position === OWNER_POSITION ? OWNER_POSITION : (isMarker(e) ? 'owner marker (other case)' : 'worker') }));
    const duplicatePermissionRecords = employees.filter((e) => Array.isArray(e.permissions) && new Set(e.permissions).size !== e.permissions.length).map((e) => idStr(e._id));

    const issues = anomalousMarkers.length + multipleOwnerCompanies.length + allAccessNonOwner.length + duplicatePermissionRecords.length;
    return {
        status: issues ? 'ISSUE' : 'PASS',
        employees: employees.length,
        ownerMarkers: markers.length,
        designatedOwners: markers.filter(designated).length,
        anomalousOwnerMarkers: anomalousMarkers.slice(0, SAMPLE_LIMIT), anomalousOwnerMarkerCount: anomalousMarkers.length,
        companiesWithMultipleActiveOwners: multipleOwnerCompanies.slice(0, SAMPLE_LIMIT),
        allAccessOnNonOwner: allAccessNonOwner.slice(0, SAMPLE_LIMIT), allAccessOnNonOwnerCount: allAccessNonOwner.length,
        duplicatePermissionEmployeeIds: duplicatePermissionRecords.slice(0, SAMPLE_LIMIT),
        // Informational: may be legitimate (e.g. PENDING/REJECTED) or need owner repair.
        companiesWithoutActiveOwnerMarker: companiesWithoutOwner.slice(0, SAMPLE_LIMIT), companiesWithoutActiveOwnerMarkerCount: companiesWithoutOwner.length,
    };
};

// ── Runner ──
const defaultDeps = () => ({
    parse: (uri) => new (require('mongodb-connection-string-url').ConnectionString)(uri),
    createClient: (uri) => new (require('mongodb').MongoClient)(uri, {
        appName: 'mm-readonly-audit', readPreference: 'secondaryPreferred', retryWrites: false,
        serverSelectionTimeoutMS: 15000, connectTimeoutMS: 15000,
    }),
});

const runAudit = async ({ env = process.env, deps = {}, write = (s) => process.stdout.write(s) } = {}) => {
    const { parse, createClient } = { ...defaultDeps(), ...deps };
    const report = { audit: 'media-masters-production-readonly', startedAt: new Date().toISOString(), readOnly: true, checks: {} };
    const emit = (exitCode) => { report.exitCode = exitCode; write(`${JSON.stringify(report, null, 2)}\n`); return exitCode; };

    let target;
    try {
        target = confirmTarget(env, parse);
    } catch (error) {
        report.refused = error instanceof Refusal ? error.message : 'Refused: target could not be confirmed.';
        return emit(error instanceof Refusal ? error.exitCode : 3);
    }
    report.target = { database: target.dbName, hostsConfirmed: true }; // operator-supplied name; hosts never printed

    let client = null;
    let exitCode = 5;
    try {
        client = createClient(target.uri);
        await client.connect();
        report.privileges = await assertReadOnly(client.db('admin'));
        const g = guard(client.db(target.dbName));
        const run = async (name, fn) => {
            try { report.checks[name] = await fn(g, { version: report.checks.deployment && report.checks.deployment.version }); } catch (error) { report.checks[name] = { status: 'NOT_COMPLETED', error: safeError(error) }; }
        };
        await run('deployment', checkDeployment);
        await run('collectionsPresent', checkCollections);
        await run('indexes', checkIndexes);
        await run('duplicatesBlockingUniqueIndexes', checkDuplicates);
        await run('workerPermissionRisks', checkWorkerRisks);
        const statuses = Object.values(report.checks).map((c) => c.status);
        exitCode = statuses.includes('NOT_COMPLETED') ? 4 : statuses.includes('ISSUE') ? 1 : 0;
    } catch (error) {
        if (error instanceof Refusal) { report.refused = error.message; exitCode = error.exitCode; }
        else { report.fatal = `Audit stopped: ${safeError(error)}. Checks not listed were not completed.`; exitCode = 5; }
    } finally {
        if (client) {
            try { await client.close(); report.connectionClosed = true; } catch { report.connectionClosed = false; }
        }
    }
    return emit(exitCode);
};

module.exports = { runAudit, confirmTarget, isWriteAction, REQUIRED_UNIQUE, EXPECTED_UNIQUE, TRANSACTION_COLLECTIONS, OTHER_COLLECTIONS };

if (require.main === module) {
    // Opt-in check before anything else is loaded or any variable is read further.
    if (process.env.MM_RUN_PRODUCTION_READONLY_AUDIT !== '1') {
        process.stdout.write('Refused: set MM_RUN_PRODUCTION_READONLY_AUDIT=1 to run the read-only production audit. Nothing was loaded or connected.\n');
        process.exit(2);
    }
    runAudit().then((code) => { process.exitCode = code; }, (error) => { process.stdout.write(`Audit stopped: ${safeError(error)}\n`); process.exitCode = 5; });
}
