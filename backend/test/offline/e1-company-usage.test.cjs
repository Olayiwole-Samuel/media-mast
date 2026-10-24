// E1 verification harness — offline. Real app/routes/middleware/models, in-memory data, dummy JWT secret.
process.env.JWT_SECRET = 'e1-harness-dummy-secret';
process.env.JWT_EXPIRE = '5m';

const path = require('path');
const BACKEND = path.resolve(__dirname, '..', '..'); // backend/ (this file: backend/test/offline/)
const mongoose = require(path.join(BACKEND, 'node_modules', 'mongoose'));
const jwt = require(path.join(BACKEND, 'node_modules', 'jsonwebtoken'));
mongoose.set('bufferCommands', false);

const src = (p) => require(path.join(BACKEND, 'src', p));
const User = src('models/User'), Employee = src('models/Employee'), Company = src('models/Company');
const Campaign = src('models/Campaign'), Booking = src('models/Booking'), Creative = src('models/Creative');

const OID = () => new mongoose.Types.ObjectId();
const A = OID(), B = OID(), C = OID();
const U = { ownerA: OID(), analyst: OID(), none: OID(), team: OID(), gone: OID(), ownerB: OID(), ownerC: OID(), indiv: OID() };
let db, lastPipeline;

const seed = () => {
    const u = (id, accountType, companyId) => ({ _id: id, id: String(id), accountType, status: 'ACTIVE', companyId });
    const e = (userId, companyId, position, permissions, isActive = true) => ({ _id: OID(), userId, companyId, position, permissions, isActive });
    const camps = (companyId, n) => Array.from({ length: n }, () => ({ _id: OID(), companyId, userId: OID(), name: 'c', status: 'DRAFT' }));
    const campsA = camps(A, 2), campsB = camps(B, 10), indivCamp = { _id: OID(), companyId: null, userId: U.indiv, name: 'ind', status: 'DRAFT' };
    const bookings = (companyId, list, n) => Array.from({ length: n }, (_, i) => ({ _id: OID(), companyId, campaignId: list[i % list.length]._id }));
    db = {
        users: [u(U.ownerA, 'COMPANY', A), u(U.analyst, 'EMPLOYEE', A), u(U.none, 'EMPLOYEE', A), u(U.team, 'EMPLOYEE', A), u(U.gone, 'EMPLOYEE', A),
            u(U.ownerB, 'COMPANY', B), u(U.ownerC, 'COMPANY', C), u(U.indiv, 'INDIVIDUAL', null)],
        employees: [
            e(U.ownerA, A, 'Company Owner', ['ALL_ACCESS']), e(U.analyst, A, 'Analyst', ['ANALYTICS_VIEW']),
            e(U.none, A, 'Intern', []), e(U.team, A, 'HR', ['TEAM_VIEW']), e(U.gone, A, 'Former', ['ANALYTICS_VIEW'], false),
            e(U.ownerB, B, 'Company Owner', ['ALL_ACCESS']), ...Array.from({ length: 6 }, () => e(OID(), B, 'Staff', [])),
            e(U.ownerC, C, 'Company Owner', ['ALL_ACCESS']),
        ],
        companies: [A, B, C].map((id) => ({ _id: id, name: 'co', status: 'APPROVED' })),
        campaigns: [...campsA, ...campsB, indivCamp],
        bookings: [...bookings(A, campsA, 3), ...bookings(B, campsB, 20)],
        creatives: [
            { _id: OID(), campaignId: campsA[0]._id, size: 1048576 },  // 1 MB
            { _id: OID(), campaignId: campsA[1]._id, size: 524288 },   // 0.5 MB
            { _id: OID(), campaignId: campsA[1]._id, size: null },     // no size recorded
            { _id: OID(), campaignId: campsB[0]._id, size: 52428800 }, // 50 MB, Company B
            { _id: OID(), campaignId: indivCamp._id, size: 9999999 },  // individual campaign
            { _id: OID(), campaignId: OID(), size: 7777777 },          // orphan (campaign deleted)
        ],
    };
};

const matches = (d, f) => Object.entries(f).every(([k, v]) => String(d[k]) === String(v));
const q = (getter) => { const x = { select: () => x, populate: () => x, lean: () => x, then: (r, j) => Promise.resolve().then(getter).then(r, j) }; return x; };
for (const [M, c] of [[User, 'users'], [Employee, 'employees'], [Company, 'companies'], [Campaign, 'campaigns'], [Booking, 'bookings']]) {
    M.findById = (id) => q(() => db[c].find((d) => String(d._id) === String(id)) || null);
    M.findOne = (f) => q(() => db[c].find((d) => matches(d, f)) || null);
    M.countDocuments = async (f = {}) => {
        if (!('companyId' in f)) throw new Error(`harness: unscoped ${M.modelName}.countDocuments(${JSON.stringify(f)})`);
        return db[c].filter((d) => matches(d, f)).length;
    };
}
// Minimal interpreter for exactly the stages the usage pipeline uses.
Creative.aggregate = async (pipeline) => {
    lastPipeline = pipeline;
    let rows = db.creatives.map((x) => ({ ...x }));
    for (const stage of pipeline) {
        if (stage.$lookup) {
            const { from, localField, foreignField, as } = stage.$lookup;
            if (from !== 'campaigns') throw new Error('unexpected $lookup');
            rows = rows.map((r) => ({ ...r, [as]: db.campaigns.filter((k) => String(k[foreignField]) === String(r[localField])) }));
        } else if (stage.$unwind) {
            const f = stage.$unwind.slice(1);
            rows = rows.flatMap((r) => r[f].map((v) => ({ ...r, [f]: v })));
        } else if (stage.$match) {
            const [[key, val]] = Object.entries(stage.$match);
            if (!(val instanceof mongoose.Types.ObjectId)) throw new Error(`harness: $match ${key} is not an ObjectId (MongoDB would match nothing)`);
            const [a, b] = key.split('.');
            rows = rows.filter((r) => r[a] && String(r[a][b]) === String(val));
        } else if (stage.$group) {
            rows = rows.length ? [{ _id: null, totalBytes: rows.reduce((s, r) => s + (r.size ?? 0), 0) }] : [];
        } else throw new Error('unexpected stage ' + Object.keys(stage));
    }
    return rows;
};

const app = src('app');
const tok = (id) => jwt.sign({ id: String(id) }, process.env.JWT_SECRET, { expiresIn: '5m' });
const results = [];
const check = (label, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`); };

(async () => {
    const server = app.listen(0, '127.0.0.1'); // loopback only
    await new Promise((resolve, reject) => server.once('listening', resolve).once('error', reject)); // address() is null until bound
    const port = server.address().port;
    const get = async (who) => {
        const r = await fetch(`http://127.0.0.1:${port}/api/v1/settings/usage`, { headers: who ? { Authorization: `Bearer ${tok(who)}` } : {} });
        return { code: r.status, body: await r.json().catch(() => ({})) };
    };
    seed();
    const FIELDS = ['employeeCount', 'campaignCount', 'bookingCount', 'storageUsed', 'storageUsedBytes', 'storageLimit'];

    // A. owner
    let r = await get(U.ownerA);
    const d = r.body.data || {};
    check('A   Owner (ALL_ACCESS) → 200, no ReferenceError', r.code === 200 && r.body.success === true, `${r.code} ${r.body.message || ''}`);
    check('A   Response keeps existing fields (+ storageUsedBytes)', JSON.stringify(Object.keys(d)) === JSON.stringify(FIELDS), JSON.stringify(Object.keys(d)));
    // G/I. isolation + relationship paths (Company B has 10 campaigns, 20 bookings, 7 employees, 50 MB)
    check('G/I employeeCount = 4 (A active only: owner + 3; inactive and B excluded)', d.employeeCount === 4, `${d.employeeCount}`);
    check('G/I campaignCount = 2 (A only; not B\'s 10, not the individual campaign)', d.campaignCount === 2, `${d.campaignCount}`);
    check('G/I bookingCount = 3 (A only; not B\'s 20)', d.bookingCount === 3, `${d.bookingCount}`);
    // J. storage
    check('J   storageUsedBytes = 1572864 (A creatives via campaign; null size = 0; B, individual, orphan excluded)', d.storageUsedBytes === 1572864, `${d.storageUsedBytes}`);
    check('J   storageUsed = "1.5 MB" (computed, no longer hardcoded "0 MB")', d.storageUsed === '1.5 MB', `${d.storageUsed}`);
    check('J   Pipeline scopes by campaign.companyId with a real ObjectId', lastPipeline?.some((s) => s.$match && String(s.$match['campaign.companyId']) === String(A)));
    // B. permitted employee
    r = await get(U.analyst);
    check('B   ANALYTICS_VIEW employee → 200, same Company A figures', r.code === 200 && r.body.data?.campaignCount === 2 && r.body.data?.bookingCount === 3 && r.body.data?.storageUsedBytes === 1572864, `${r.code}`);
    // Company B sees its own figures
    r = await get(U.ownerB);
    check('G   Company B owner → its own figures (7 / 10 / 20 / 50 MB)', r.code === 200 && r.body.data?.employeeCount === 7 && r.body.data?.campaignCount === 10
        && r.body.data?.bookingCount === 20 && r.body.data?.storageUsed === '50 MB', JSON.stringify(r.body.data));
    // Spoofed company id in query string is ignored (req.user.companyId only)
    {
        const sr = await fetch(`http://127.0.0.1:${port}/api/v1/settings/usage?companyId=${B}`, {
            headers: { Authorization: `Bearer ${tok(U.ownerA)}` },
        });
        const sb = await sr.json().catch(() => ({}));
        check('G   Company A owner with ?companyId=<B> → still Company A figures', sr.status === 200 && sb.data?.campaignCount === 2 && sb.data?.bookingCount === 3
            && sb.data?.employeeCount === 4 && sb.data?.storageUsedBytes === 1572864, JSON.stringify(sb.data));
    }
    // H. empty company
    r = await get(U.ownerC);
    check('H   Empty company → 200 with 1 employee (owner) and zeros', r.code === 200 && r.body.data?.employeeCount === 1 && r.body.data?.campaignCount === 0
        && r.body.data?.bookingCount === 0 && r.body.data?.storageUsedBytes === 0 && r.body.data?.storageUsed === '0 MB', JSON.stringify(r.body.data));
    // C/D/E/F. authorization unchanged (N6)
    for (const [who, label, exp] of [[U.none, 'C   Zero-permission employee', 403], [U.team, 'D   TEAM_VIEW employee', 403], [U.gone, '    Deactivated ANALYTICS_VIEW employee', 403],
        [U.indiv, 'E   Individual', 403], [null, 'F   No token', 401]]) {
        r = await get(who);
        check(`${label} → ${exp}, no data`, r.code === exp && r.body.data === undefined, `${r.code} ${r.body.message}`);
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
