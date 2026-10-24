// E2 verification harness — offline. Real app/routes/middleware/controller, in-memory store, fixed clock,
// and a small interpreter for the aggregation stages the dashboard's monthly pipeline uses.
process.env.JWT_SECRET = 'e2-harness-dummy-secret';
process.env.JWT_EXPIRE = '5m';
delete process.env.VERCEL;

const path = require('path');
const BACKEND = path.resolve(__dirname, '..', '..'); // backend/ (this file: backend/test/offline/)
const mongoose = require(path.join(BACKEND, 'node_modules', 'mongoose'));
const jwt = require(path.join(BACKEND, 'node_modules', 'jsonwebtoken'));
mongoose.set('bufferCommands', false);

// ── Controllable clock: new Date() / Date.now() return CLOCK ──
const RealDate = Date;
let CLOCK = RealDate.UTC(2026, 8, 15, 12, 0, 0); // 15 Sep 2026
class FakeDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(CLOCK); else super(...a); }
    static now() { return CLOCK; }
}
// (installed after the models/app load — Mongoose resolves type: Date at schema creation)

const src = (p) => require(path.join(BACKEND, 'src', p));
const User = src('models/User'), Employee = src('models/Employee'), Company = src('models/Company'), AuditLog = src('models/AuditLog');
const Campaign = src('models/Campaign'), Booking = src('models/Booking'), Creative = src('models/Creative');

const OID = () => new mongoose.Types.ObjectId();
let db;
const eq = (a, b) => (a == null && b == null) || (a != null && b != null && String(a) === String(b));
const val = (x) => (x instanceof RealDate ? x.getTime() : x);
const matches = (d, f = {}) => Object.entries(f).every(([k, v]) => {
    const x = d[k];
    if (v && typeof v === 'object' && !(v instanceof mongoose.Types.ObjectId) && !(v instanceof RealDate) && !Array.isArray(v)) {
        if ('$in' in v && !v.$in.some((y) => eq(x, y))) return false;
        if ('$nin' in v && v.$nin.some((y) => eq(x, y))) return false;
        if ('$gte' in v && !(x != null && val(x) >= val(v.$gte))) return false;
        if ('$lt' in v && !(x != null && val(x) < val(v.$lt))) return false;
        return true;
    }
    return eq(x, v);
});
const evalExpr = (doc, e) => {
    if (typeof e === 'string' && e.startsWith('$')) return doc[e.slice(1)];
    if (e && typeof e === 'object' && '$year' in e) return new RealDate(evalExpr(doc, e.$year)).getUTCFullYear();
    if (e && typeof e === 'object' && '$month' in e) return new RealDate(evalExpr(doc, e.$month)).getUTCMonth() + 1;
    if (e && typeof e === 'object' && '$ifNull' in e) return evalExpr(doc, e.$ifNull[0]) ?? evalExpr(doc, e.$ifNull[1]);
    return e;
};
let monthlyPipeline = null;
const aggregate = (c) => async (pipeline) => {
    const isMonthly = pipeline.some((s) => s.$group && s.$group._id && s.$group._id.year);
    if (!isMonthly) return []; // other dashboard aggregates are out of E2 scope
    monthlyPipeline = pipeline;
    let rows = db[c].slice();
    for (const st of pipeline) {
        if (st.$match) rows = rows.filter((d) => matches(d, st.$match));
        else if (st.$group) {
            const groups = new Map();
            for (const d of rows) {
                const id = st.$group._id && typeof st.$group._id === 'object' ? Object.fromEntries(Object.entries(st.$group._id).map(([k, e]) => [k, evalExpr(d, e)])) : null;
                const key = JSON.stringify(id);
                const g = groups.get(key) || { _id: id, ...Object.fromEntries(Object.keys(st.$group).filter((k) => k !== '_id').map((k) => [k, 0])) };
                for (const [k, acc] of Object.entries(st.$group)) if (k !== '_id') g[k] += acc.$sum === 1 ? 1 : Number(evalExpr(d, acc.$sum)) || 0;
                groups.set(key, g);
            }
            rows = [...groups.values()];
        } else if (st.$sort) {
            const keys = Object.entries(st.$sort);
            rows.sort((a, b) => { for (const [k, dir] of keys) { const av = k.split('.').reduce((o, p) => o?.[p], a), bv = k.split('.').reduce((o, p) => o?.[p], b); if (av !== bv) return (av < bv ? -1 : 1) * dir; } return 0; });
        } else if (st.$limit) rows = rows.slice(0, st.$limit);
        else throw new Error('unexpected stage ' + Object.keys(st));
    }
    return rows;
};
const q = (getter) => { const x = { select: () => x, populate: () => x, lean: () => x, sort: () => x, limit: () => x, then: (r, j) => Promise.resolve().then(getter).then(r, j) }; return x; };
const fake = (M, c) => {
    M.find = (f) => q(() => db[c].filter((d) => matches(d, f)));
    M.findOne = (f) => q(() => { const o = db[c].find((d) => matches(d, f)); return o ? M.hydrate({ ...o }) : null; });
    M.findById = (id) => q(() => { const o = db[c].find((d) => eq(d._id, id)); return o ? M.hydrate({ ...o }) : null; });
    M.countDocuments = async (f) => db[c].filter((d) => matches(d, f)).length;
    M.aggregate = aggregate(c);
};
for (const [M, c] of [[User, 'users'], [Employee, 'employees'], [Company, 'companies'], [Campaign, 'campaigns'], [Booking, 'bookings'], [Creative, 'creatives'], [AuditLog, 'audit']]) fake(M, c);

const out = (s) => process.stdout.write(s + '\n');
const A = OID(), B = OID(), E = OID();
const U = { ownerA: OID(), ownerB: OID(), ownerE: OID(), noAnalytics: OID() };
const seed = () => {
    const u = (id, accountType, companyId) => ({ _id: id, email: `${String(id).slice(-6)}@example.com`, name: 'n', accountType, status: 'ACTIVE', companyId, tokenVersion: 0 });
    db = {
        users: [u(U.ownerA, 'COMPANY', A), u(U.ownerB, 'COMPANY', B), u(U.ownerE, 'COMPANY', E), u(U.noAnalytics, 'EMPLOYEE', A)],
        employees: [
            ...[[U.ownerA, A], [U.ownerB, B], [U.ownerE, E]].map(([userId, companyId]) => ({ _id: OID(), userId, companyId, position: 'Company Owner', permissions: ['ALL_ACCESS'], isActive: true })),
            { _id: OID(), userId: U.noAnalytics, companyId: A, position: 'Viewer', permissions: ['BOOKING_VIEW'], isActive: true },
        ],
        companies: [A, B, E].map((id) => ({ _id: id, name: 'co', slug: `co-${id}`, status: 'APPROVED' })),
        campaigns: [], bookings: [], creatives: [], audit: [],
    };
};
// a booking on the 1st/15th/last day of a month relative to the clock's month
const monthRel = (rel, day = 15) => { const n = new RealDate(CLOCK); return new RealDate(RealDate.UTC(n.getUTCFullYear(), n.getUTCMonth() + rel, day)); };
const lastDay = (rel) => { const n = new RealDate(CLOCK); return new RealDate(RealDate.UTC(n.getUTCFullYear(), n.getUTCMonth() + rel + 1, 0)); };
const addBooking = (companyId, date, price, status = 'ACCEPTED') => db.bookings.push({ _id: OID(), companyId, campaignId: OID(), stationId: OID(), userId: OID(), date, price, status, createdAt: new RealDate(CLOCK) });

const app = src('app');
global.Date = FakeDate;
const tok = (id) => jwt.sign({ id: String(id), tokenVersion: 0 }, process.env.JWT_SECRET, { expiresIn: '5m' });
const results = [];
const check = (label, ok, detail = '') => { results.push(ok); out(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== '' ? '  — ' + detail : ''}`); };
const label = (m) => `${m.year}-${String(m.month).padStart(2, '0')}`;

(async () => {
    const server = app.listen(0, '127.0.0.1'); // loopback only
    await new Promise((resolve, reject) => server.once('listening', resolve).once('error', reject)); // address() is null until bound
    const base = `http://127.0.0.1:${server.address().port}`;
    const dash = async (who, qs = '') => {
        const r = await fetch(`${base}/api/v1/company/dashboard${qs}`, { headers: who ? { Authorization: `Bearer ${tok(who)}` } : {} });
        const body = await r.json().catch(() => ({}));
        return { code: r.status, body, monthly: body?.data?.performance?.monthly };
    };

    // ── Latest window vs oldest-12 regression (clock: 15 Sep 2026) ──
    seed();
    for (const rel of [-30, -24, -18, -15, -13, -12]) addBooking(A, monthRel(rel), 31337);  // outside the window
    for (let rel = -11; rel <= 0; rel++) addBooking(A, monthRel(rel), 100 * (rel + 12));     // 100…1200, one per month
    addBooking(A, monthRel(0, 1), 5);                // first day of current month
    addBooking(A, lastDay(0), 7);                    // last day of current month
    addBooking(A, monthRel(-11, 1), 3);              // first day of the window
    addBooking(A, monthRel(1, 1), 9999);             // next month (future airtime)
    addBooking(A, monthRel(3), 9999);                // future
    addBooking(A, monthRel(-2), 50000, 'PENDING');   // not confirmed spend
    addBooking(A, monthRel(-2), 50000, 'CANCELLED');
    addBooking(A, monthRel(-2), 50000, 'REJECTED');
    addBooking(A, monthRel(-1), 444, 'SCHEDULED');
    addBooking(A, monthRel(-3), 333, 'COMPLETED');
    for (let rel = -11; rel <= 0; rel++) addBooking(B, monthRel(rel), 77777);             // Company B
    let r = await dash(U.ownerA);
    const m = r.monthly || [];
    const expectLabels = ['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];
    check('1   Dashboard → 200 with exactly 12 months', r.code === 200 && m.length === 12, `${r.code} n=${m.length}`);
    check('2   Months are Oct 2025 … Sep 2026, oldest → newest (latest window from the server clock)', JSON.stringify(m.map(label)) === JSON.stringify(expectLabels), m.map(label).join(','));
    check('3   Shape per month unchanged: { year, month, spend, bookings }', m.every((x) => JSON.stringify(Object.keys(x)) === '["year","month","spend","bookings"]'));
    check('4   Records 12+ months old excluded (old buggy query would have started in 2024)', m[0].spend === 100 + 3 && !m.some((x) => x.spend % 31337 === 0 && x.spend > 0), `first=${m[0].spend}`);
    check('5   Current month included incl. its first and last day', m[11].spend === 1200 + 5 + 7 && m[11].bookings === 3, `${m[11].spend}/${m[11].bookings}`);
    check('6   Future months/airtime excluded', !m.some((x) => x.spend >= 9999) && !m.some((x) => x.year === 2026 && x.month > 9));
    check('7   Only confirmed spend counted (ACCEPTED/SCHEDULED/COMPLETED; not PENDING/CANCELLED/REJECTED)', m[9].spend === 1000 && m[10].spend === 1100 + 444 && m[8].spend === 900 + 333, `${m[8].spend}/${m[9].spend}/${m[10].spend}`);
    check('8   Company A never includes Company B bookings', !m.some((x) => x.spend >= 77777));
    const rB = await dash(U.ownerB);
    check('9   Company B sees only its own 12 months (77777 each)', rB.monthly?.length === 12 && rB.monthly.every((x) => x.spend === 77777 && x.bookings === 1), rB.monthly?.map((x) => x.spend).join(','));
    r = await dash(U.ownerA, `?companyId=${B}`);
    check('10  ?companyId=<B> ignored — still Company A figures', r.monthly?.[11]?.spend === 1212, `${r.monthly?.[11]?.spend}`);
    const match = monthlyPipeline?.find((s) => s.$match)?.$match;
    check('11  Pipeline is bounded in MongoDB: date >= window start AND < next month start; no $limit', match?.date?.$gte instanceof RealDate && match?.date?.$lt instanceof RealDate
        && match.date.$gte.toISOString() === '2025-10-01T00:00:00.000Z' && match.date.$lt.toISOString() === '2026-10-01T00:00:00.000Z' && !monthlyPipeline.some((s) => s.$limit) && eq(match.companyId, A),
        `${match?.date?.$gte?.toISOString?.()} → ${match?.date?.$lt?.toISOString?.()}`);

    // ── Empty months filled ──
    seed();
    const jan = RealDate.UTC(2026, 0, 10), apr = RealDate.UTC(2026, 3, 10), sep = RealDate.UTC(2026, 8, 10);
    for (const t of [jan, apr, sep]) addBooking(A, new RealDate(t), 10);
    r = await dash(U.ownerA);
    const nz = r.monthly.filter((x) => x.spend > 0).map(label);
    check('12  Activity in Jan / Apr / Sep only → all 12 months returned, zeros elsewhere', r.monthly.length === 12 && JSON.stringify(nz) === '["2026-01","2026-04","2026-09"]' && r.monthly.filter((x) => x.spend === 0 && x.bookings === 0).length === 9, nz.join(','));

    // ── Year boundary: clock in January ──
    CLOCK = RealDate.UTC(2026, 0, 3, 8, 0, 0);
    seed();
    addBooking(A, new RealDate(RealDate.UTC(2025, 0, 20)), 1);   // Jan 2025 → outside
    addBooking(A, new RealDate(RealDate.UTC(2025, 1, 1)), 2);    // Feb 2025 → first month
    addBooking(A, new RealDate(RealDate.UTC(2025, 11, 31)), 3);  // Dec 2025
    addBooking(A, new RealDate(RealDate.UTC(2026, 0, 2)), 4);    // Jan 2026
    r = await dash(U.ownerA);
    check('13  January clock → Feb 2025 … Jan 2026, no month 0 or 13', JSON.stringify(r.monthly.map(label)) === JSON.stringify(['2025-02', '2025-03', '2025-04', '2025-05', '2025-06', '2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12', '2026-01'])
        && r.monthly.every((x) => x.month >= 1 && x.month <= 12), r.monthly.map(label).join(','));
    check('14  Year-boundary values land in the right months (Jan 2025 excluded)', r.monthly[0].spend === 2 && r.monthly[10].spend === 3 && r.monthly[11].spend === 4 && r.monthly.reduce((s, x) => s + x.spend, 0) === 9);
    // December clock
    CLOCK = RealDate.UTC(2026, 11, 31, 23, 59, 0);
    seed(); addBooking(A, new RealDate(RealDate.UTC(2026, 11, 31)), 5); addBooking(A, new RealDate(RealDate.UTC(2027, 0, 1)), 99);
    r = await dash(U.ownerA);
    check('15  December clock → Jan 2026 … Dec 2026; 1 Jan 2027 not included', label(r.monthly[0]) === '2026-01' && label(r.monthly[11]) === '2026-12' && r.monthly[11].spend === 5 && !r.monthly.some((x) => x.spend === 99));
    // first instant of a month
    CLOCK = RealDate.UTC(2026, 2, 1, 0, 0, 0);
    seed();
    r = await dash(U.ownerA);
    check('16  Clock at 00:00 on 1 Mar → window ends with Mar 2026', label(r.monthly[11]) === '2026-03' && label(r.monthly[0]) === '2025-04', `${label(r.monthly[0])} … ${label(r.monthly[11])}`);

    // ── Empty company / auth ──
    CLOCK = RealDate.UTC(2026, 8, 15, 12, 0, 0);
    seed();
    r = await dash(U.ownerE);
    check('17  Company with no activity → 200, 12 months of zeros (not null/500)', r.code === 200 && r.monthly?.length === 12 && r.monthly.every((x) => x.spend === 0 && x.bookings === 0), `${r.code}`);
    r = await dash(U.noAnalytics);
    check('18  Employee without ANALYTICS_VIEW → 403 (N6 unchanged)', r.code === 403, `${r.code}`);
    r = await dash(null);
    check('19  No token → 401', r.code === 401, `${r.code}`);
    check('20  No Math.random / hardcoded growth in the monthly code', !/Math\.random/.test(require('fs').readFileSync(path.join(BACKEND, 'src/controllers/company.controller.js'), 'utf8')));

    server.close();
    global.Date = RealDate;
    const passed = results.filter(Boolean).length;
    out(`\nE2: ${passed}/${results.length} passed`);
    process.exitCode = passed === results.length ? 0 : 1;
})().catch((e) => { out('HARNESS CRASH ' + e.stack); process.exitCode = 1; process.exit(1); });
