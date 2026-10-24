// D1 verification harness — offline. No real DB, dummy JWT secret.
process.env.JWT_SECRET = 'd1-harness-dummy-secret';
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
const Booking = src('models/Booking');
const Station = src('models/Station');
const AuditLog = src('models/AuditLog');

// ── Part 1: real Mongoose query construction (no DB needed to build a query) ──
const realCampaignFind = Campaign.find; // captured before the fakes below replace it
const realQueryPopulate = (fields) => {
    const query = realCampaignFind.call(Campaign, { userId: new mongoose.Types.ObjectId() }).populate(fields);
    return query._mongooseOptions.populate;
};

// ── In-memory data (fake bcrypt-format strings only; not real hashes) ──
const FAKE_HASH = '$2b$10$' + 'x'.repeat(53);
const oid = (n) => n.toString(16).padStart(24, '0');
const db = {
    users: [
        { _id: oid(1), name: 'Platform Admin', email: 'admin@test.local', password: FAKE_HASH, accountType: 'ADMIN', status: 'ACTIVE', companyId: null },
        { _id: oid(2), name: 'Ivy Individual', email: 'ivy@test.local', password: FAKE_HASH, accountType: 'INDIVIDUAL', status: 'ACTIVE', companyId: null, loginCount: 3 },
        { _id: oid(3), name: 'Owner', email: 'owner@test.local', password: FAKE_HASH, accountType: 'COMPANY', status: 'ACTIVE', companyId: oid(100) },
        { _id: oid(4), name: 'Staff', email: 'staff@test.local', password: FAKE_HASH, accountType: 'EMPLOYEE', status: 'ACTIVE', companyId: oid(100) },
    ],
    companies: [{ _id: oid(100), name: 'Test Co', status: 'APPROVED' }],
    employees: [
        { _id: oid(200), userId: oid(3), companyId: oid(100), position: 'Company Owner', permissions: ['ALL_ACCESS'], isActive: true },
        { _id: oid(201), userId: oid(4), companyId: oid(100), position: 'Team Member', permissions: [], isActive: true },
    ],
    campaigns: [
        { _id: oid(300), name: 'Ivy Launch', status: 'DRAFT', budget: 1000, userId: oid(2), companyId: null, createdAt: new Date() },
        { _id: oid(301), name: 'Ivy Promo', status: 'DRAFT', budget: 500, userId: oid(2), companyId: oid(100), createdAt: new Date() },
    ],
    bookings: [{ _id: oid(400), campaignId: oid(300), stationId: oid(500), userId: oid(2), companyId: oid(100), price: 10, createdAt: new Date() }],
    stations: [{ _id: oid(500), name: 'Test FM', type: 'RADIO', adminId: oid(1) }],
    auditlogs: [],
};
db.users.forEach((u) => { u.id = u._id; });
const refColl = { userId: 'users', companyId: 'companies', campaignId: 'campaigns', stationId: 'stations' };

// Mimics Mongoose projection semantics: 'a b' = include (+_id), '-a' = exclude, none = whole doc.
const project = (doc, select) => {
    if (!doc) return doc;
    const copy = JSON.parse(JSON.stringify(doc));
    if (!select) return copy;
    const parts = select.split(/\s+/).filter(Boolean);
    if (parts.every((p) => p.startsWith('-'))) { parts.forEach((p) => delete copy[p.slice(1)]); return copy; }
    const out = { _id: copy._id };
    parts.forEach((p) => { if (p in copy) out[p] = copy[p]; });
    return out;
};
const matches = (doc, f) => Object.entries(f).every(([k, v]) => String(doc[k]) === String(v));
const fakeQuery = (getDocs, single) => {
    let sel = null; const pops = [];
    const qy = {
        select: (s) => { sel = s; return qy; },
        // Supports populate('path'), populate('path', 'fields'), populate({ path, select }) and arrays — as Mongoose does
        populate: (arg, select2) => { (Array.isArray(arg) ? arg : [arg]).forEach((p) => pops.push(typeof p === 'string' ? { path: p, select: select2 } : p)); return qy; },
        sort: () => qy, lean: () => qy, limit: () => qy,
        then: (res, rej) => Promise.resolve().then(() => {
            const docs = getDocs().map((d) => {
                const out = project(d, sel);
                pops.forEach(({ path: p, select }) => {
                    if (out[p] == null) return;
                    const ref = db[refColl[p]].find((r) => String(r._id) === String(out[p]));
                    out[p] = ref ? project(ref, select) : null;
                });
                // Mongoose documents expose .id; keep for middleware that reads req.user.id
                if (out._id && !out.id) Object.defineProperty(out, 'id', { value: out._id, enumerable: false });
                return out;
            });
            return single ? docs[0] || null : docs;
        }).then(res, rej),
    };
    return qy;
};
const fake = (Model, coll) => {
    Model.find = (f = {}) => fakeQuery(() => db[coll].filter((d) => matches(d, f)), false);
    Model.findOne = (f) => fakeQuery(() => db[coll].filter((d) => matches(d, f)).slice(0, 1), true);
    Model.findById = (id) => fakeQuery(() => db[coll].filter((d) => String(d._id) === String(id)), true);
};
fake(User, 'users'); fake(Employee, 'employees'); fake(Company, 'companies');
fake(Campaign, 'campaigns'); fake(Booking, 'bookings'); fake(Station, 'stations'); fake(AuditLog, 'auditlogs');

const app = src('app');
const tok = (n) => jwt.sign({ id: oid(n) }, process.env.JWT_SECRET, { expiresIn: '5m' });

// Recursive scan: any key that looks like a password field, any bcrypt-format string.
const SENSITIVE_KEY = /^(password|passwordHash|hash|salt)$/i;
const BCRYPT = /\$2[aby]\$\d{2}\$/;
const scan = (node, at = '$', found = []) => {
    if (Array.isArray(node)) node.forEach((v, i) => scan(v, `${at}[${i}]`, found));
    else if (node && typeof node === 'object') Object.entries(node).forEach(([k, v]) => { if (SENSITIVE_KEY.test(k)) found.push(`key ${at}.${k}`); scan(v, `${at}.${k}`, found); });
    else if (typeof node === 'string' && BCRYPT.test(node)) found.push(`bcrypt string at ${at}`);
    return found;
};

const results = [];
const check = (label, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`); };

(async () => {
    const server = app.listen(0, '127.0.0.1'); // loopback only
    await new Promise((resolve, reject) => server.once('listening', resolve).once('error', reject)); // address() is null until bound
    const port = server.address().port;
    const get = async (n, url) => {
        const headers = n ? { Authorization: `Bearer ${tok(n)}` } : {};
        const r = await fetch(`http://127.0.0.1:${port}${url}`, { headers });
        return { code: r.status, body: await r.json().catch(() => ({})) };
    };
    const IND = oid(2);

    // Real-Mongoose check of what the controller now passes
    const fixedFields = ['companyId', { path: 'userId', select: 'name email accountType status' }];
    const pop = realQueryPopulate(fixedFields);
    check('M1  Real Mongoose: userId populate carries explicit select', pop?.userId?.select === 'name email accountType status', JSON.stringify(pop?.userId?.select));
    const src_ = require('fs').readFileSync(path.join(BACKEND, 'src/controllers/admin.controller.js'), 'utf8');
    const block = src_.slice(src_.indexOf('const getIndividualCampaigns'), src_.indexOf('const getIndividualBookings'));
    check('M2  Controller source: getIndividualCampaigns has no bare \'userId\' populate', /path:\s*'userId'[\s\S]*select:\s*'name email accountType status'/.test(block) && !block.replace(/path:\s*'userId'/g, '').includes("'userId'"));

    // Baseline: prove the scanner catches the old behaviour
    const oldPop = []; const qOld = fakeQuery(() => db.campaigns.filter((c) => c.userId === IND), false).populate(['companyId', 'userId']);
    const leaked = scan(await qOld);
    check('B0  Baseline: OLD populate([\'companyId\',\'userId\']) leaks the hash (scanner works)', leaked.length > 0, leaked.slice(0, 2).join('; '));

    // Test 1–3: actual route, admin context
    const r = await get(1, `/api/v1/admin/individuals/${IND}/campaigns`);
    check('T1  Admin GET /admin/individuals/:id/campaigns → 200', r.code === 200, `${r.code}`);
    const campaigns = r.body?.data?.campaigns || [];
    check('T1  No password key anywhere in response', scan(r.body).filter((f) => f.startsWith('key')).length === 0, scan(r.body).join('; ') || 'clean');
    check('T2  No bcrypt-format string anywhere in response', scan(r.body).filter((f) => f.startsWith('bcrypt')).length === 0);
    check('T2  Every populated userId lacks password', campaigns.length === 2 && campaigns.every((c) => c.userId && !('password' in c.userId)));
    check('T3  Useful user fields kept (_id, name, email, accountType, status)', campaigns.every((c) => c.userId._id === IND && c.userId.name === 'Ivy Individual'
        && c.userId.email === 'ivy@test.local' && c.userId.accountType === 'INDIVIDUAL' && c.userId.status === 'ACTIVE'),
        JSON.stringify(Object.keys(campaigns[0]?.userId || {})));
    check('T3  Response shape kept (individual, total, campaigns, companyId populated)', r.body?.data?.individual?._id === IND && r.body?.data?.total === 2
        && campaigns[1].companyId?.name === 'Test Co' && campaigns[0].companyId === null);

    // Test 4: authorization unchanged
    for (const [n, who, exp] of [[3, 'Company owner', 403], [4, 'Company employee', 403], [2, 'Individual', 403], [null, 'No token', 401]]) {
        const x = await get(n, `/api/v1/admin/individuals/${IND}/campaigns`);
        check(`T4  ${who} → ${exp}`, x.code === exp && !x.body?.data, `${x.code} ${x.body?.message || ''}`);
    }

    // Test 5: regression on sibling admin individual endpoints
    const b = await get(1, `/api/v1/admin/individuals/${IND}/bookings`);
    check('T5  GET /individuals/:id/bookings still 200 with bookings populated', b.code === 200 && b.body?.data?.bookings?.[0]?.stationId?.name === 'Test FM' && b.body?.data?.bookings?.[0]?.campaignId?.name === 'Ivy Launch', `${b.code}`);
    check('T5  Bookings response contains no password/hash', scan(b.body).length === 0, scan(b.body).join('; ') || 'clean');
    const one = await get(1, `/api/v1/admin/individuals/${IND}`);
    check('T5  GET /individuals/:id still 200, no password', one.code === 200 && one.body?.data?.email === 'ivy@test.local' && scan(one.body).length === 0, `${one.code}`);
    const single = await get(1, `/api/v1/admin/individuals/${IND}/campaigns/${oid(300)}`);
    check('T5  GET /individuals/:id/campaigns/:campaignId still 200, no password', single.code === 200 && single.body?.data?.campaign?.name === 'Ivy Launch' && scan(single.body).length === 0, `${single.code}`);

    const passed = results.filter(Boolean).length;
    console.log(`\n${passed}/${results.length} passed`);
    process.exitCode = passed === results.length ? 0 : 1;
    // Graceful shutdown: wait for the server and its keep-alive sockets to close, then let Node exit on its own.
    await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
        server.closeAllConnections();
    });
})();
