// D3 verification harness — offline. Real Station/Booking/AuditLog schemas, in-memory persistence, dummy JWT secret.
process.env.JWT_SECRET = 'd3-harness-dummy-secret';
process.env.JWT_EXPIRE = '5m';
process.env.ALLOW_DIRECT_BOOKING = 'true'; // these checks exercise the direct (unpaid) booking route

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
const Station = src('models/Station');
const Booking = src('models/Booking');
const AuditLog = src('models/AuditLog');

const OID = () => new mongoose.Types.ObjectId();
const CO = OID(), CO2 = OID(), MEDIA = OID();
const U = { owner: OID(), staffNoPerm: OID(), staffBooker: OID(), indiv: OID() };
const CAMP = OID(), CAMP_OTHER = OID();

let db, audit;
const mkStation = (name, pricing, extra = {}) => new Station({
    name, slug: name.toLowerCase().replace(/\s+/g, '-'), type: 'RADIO', companyId: MEDIA,
    approvalStatus: 'APPROVED', isActive: true, ...(pricing === undefined ? {} : { pricing }), ...extra,
});
const seed = () => {
    audit = [];
    db = {
        users: [
            { _id: U.owner, accountType: 'COMPANY', status: 'ACTIVE', companyId: CO, name: 'Owner', email: 'o@t.local' },
            { _id: U.staffNoPerm, accountType: 'EMPLOYEE', status: 'ACTIVE', companyId: CO, name: 'Viewer', email: 'v@t.local' },
            { _id: U.staffBooker, accountType: 'EMPLOYEE', status: 'ACTIVE', companyId: CO, name: 'Booker', email: 'b@t.local' },
            { _id: U.indiv, accountType: 'INDIVIDUAL', status: 'ACTIVE', companyId: null, name: 'Ind', email: 'i@t.local' },
        ],
        employees: [
            { _id: OID(), userId: U.owner, companyId: CO, position: 'Company Owner', permissions: ['ALL_ACCESS'], isActive: true },
            { _id: OID(), userId: U.staffNoPerm, companyId: CO, position: 'Team Member', permissions: ['BOOKING_VIEW'], isActive: true },
            { _id: OID(), userId: U.staffBooker, companyId: CO, position: 'Team Member', permissions: ['BOOKING_CREATE', 'BOOKING_VIEW'], isActive: true },
        ],
        companies: [{ _id: CO, name: 'Buyer Co', status: 'APPROVED' }, { _id: CO2, name: 'Other Co', status: 'APPROVED' }],
        campaigns: [
            { _id: CAMP, name: 'Launch', companyId: CO, userId: U.owner, status: 'DRAFT', budget: 1 },
            { _id: CAMP_OTHER, name: 'Theirs', companyId: CO2, userId: OID(), status: 'DRAFT', budget: 1 },
        ],
        stations: [
            mkStation('Priced FM', { amount: 50000, currency: 'NGN', unit: 'SPOT' }),
            mkStation('No Price FM', undefined),                                   // schema default amount 0
            mkStation('Zero FM', { amount: 0, currency: 'NGN' }),
            mkStation('Blank Currency FM', { amount: 20000, currency: '   ' }),
            mkStation('Pending FM', { amount: 30000, currency: 'NGN' }, { approvalStatus: 'PENDING' }),
        ],
        bookings: [],
    };
    db.users.forEach((u) => { u.id = String(u._id); });
};
const st = (name) => db.stations.find((s) => s.name === name);

const matchVal = (actual, cond) => {
    if (cond && typeof cond === 'object' && !(cond instanceof Date) && !mongoose.isValidObjectId(cond)) {
        if ('$nin' in cond) return !cond.$nin.includes(actual);
        if ('$in' in cond) return cond.$in.includes(actual);
    }
    if (cond instanceof Date) return actual instanceof Date && actual.getTime() === cond.getTime();
    return String(actual) === String(cond);
};
const matches = (d, f) => Object.entries(f).every(([k, v]) => matchVal(d[k], v));
const asDoc = (d) => d && (typeof d.save === 'function' ? d : Object.assign(d, { save: async () => d, toObject: () => ({ ...d }) }));
const q = (v) => { const x = { select: () => x, populate: () => x, lean: () => x, sort: () => x, then: (r, j) => Promise.resolve(v).then(r, j) }; return x; };
const fake = (M, c) => {
    M.findById = (id) => q(asDoc(db[c].find((d) => String(d._id) === String(id)) || null));
    M.findOne = (f) => q(asDoc(db[c].find((d) => matches(d, f)) || null));
    M.find = (f = {}) => q(db[c].filter((d) => matches(d, f)));
};
fake(User, 'users'); fake(Employee, 'employees'); fake(Company, 'companies');
fake(Campaign, 'campaigns'); fake(Station, 'stations'); fake(Booking, 'bookings');
// N9 fixture plumbing: booking creation takes a per-station lock (Station.findOneAndUpdate / updateOne).
// These suites send requests one at a time, so the fake grants the lock; N9 tests the lock itself.
Station.findOneAndUpdate = async (f) => ({ _id: f._id });
Station.updateOne = async () => ({ matchedCount: 1 });

Booking.create = async (data) => { const b = new Booking(data); await b.validate(); db.bookings.push(b); return b; }; // real schema validation
AuditLog.create = async (data) => { const a = new AuditLog(data); await a.validate(); audit.push(a.toObject()); return a; };

const app = src('app');
const tok = (id) => jwt.sign({ id: String(id) }, process.env.JWT_SECRET, { expiresIn: '5m' });

const results = [];
const check = (label, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`); };
const future = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
let timeSeq = 0;
const nextTime = () => `${String(8 + (timeSeq++ % 12)).padStart(2, '0')}:00`; // distinct slots → no overlap conflicts

(async () => {
    const server = app.listen(0, '127.0.0.1'); // loopback only
    await new Promise((resolve, reject) => server.once('listening', resolve).once('error', reject)); // address() is null until bound
    const port = server.address().port;
    const call = async (who, method, url, body) => {
        const headers = { 'Content-Type': 'application/json' };
        if (who) headers.Authorization = `Bearer ${tok(who)}`;
        const r = await fetch(`http://127.0.0.1:${port}${url}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
        return { code: r.status, body: await r.json().catch(() => ({})) };
    };
    const book = (who, station, extra = {}, campaignId = CAMP) =>
        call(who, 'POST', '/api/v1/bookings', { campaignId: String(campaignId), stationId: String(station._id), slot: 'PRIME_TIME', date: future, time: nextTime(), duration: 30, ...extra });
    const stored = (r) => db.bookings.find((b) => String(b._id) === String(r.body?.data?._id));

    const cases = [
        ['T1  Normal request (no price sent)', {}],
        ['T2  Malicious low price (1)', { price: 1 }],
        ['T3  Malicious high price (999999999)', { price: 999999999 }],
        ['T4  Malicious currency (USD)', { currency: 'USD' }],
        ['T5  Both manipulated (1 USD)', { price: 1, currency: 'USD' }],
        ['T5b Junk types (price "free", currency {$ne:null})', { price: 'free', currency: { $ne: null } }],
        ['T5c Negative price (-500)', { price: -500 }],
    ];
    seed();
    for (const [label, extra] of cases) {
        const r = await book(U.owner, st('Priced FM'), extra);
        const b = stored(r);
        check(`${label} → 201, stored 50000 NGN, response 50000 NGN`, r.code === 201 && b && b.price === 50000 && b.currency === 'NGN'
            && r.body.data.price === 50000 && r.body.data.currency === 'NGN', `${r.code} stored=${b?.price} ${b?.currency} resp=${r.body?.data?.price} ${r.body?.data?.currency} ${r.code !== 201 ? r.body.message : ''}`);
    }
    const lastAudit = audit.filter((a) => a.action === 'CREATE_BOOKING').pop();
    check('T5  Audit metadata records server price/currency, not client values', lastAudit?.metadata?.price === 50000 && lastAudit?.metadata?.currency === 'NGN' && lastAudit?.metadata?.pricingUnit === 'SPOT',
        JSON.stringify({ price: lastAudit?.metadata?.price, currency: lastAudit?.metadata?.currency, unit: lastAudit?.metadata?.pricingUnit }));

    // ── T6 missing / invalid station pricing → 4xx, no booking, no client fallback ──
    for (const [label, name] of [['default (amount 0, schema default)', 'No Price FM'], ['explicit zero', 'Zero FM'], ['blank currency', 'Blank Currency FM']]) {
        seed();
        const r = await book(U.owner, st(name), { price: 75000, currency: 'NGN' });
        check(`T6  Station pricing ${label} + client price → 400, no booking`, r.code === 400 && db.bookings.length === 0 && /pricing is not configured/i.test(r.body.message), `${r.code} ${r.body.message} bookings=${db.bookings.length}`);
    }
    seed();
    const neg = st('Priced FM'); neg.pricing.amount = -10; // only reachable by bypassing schema min; controller must still refuse
    let r = await book(U.owner, neg, { price: 50000 });
    check('T6  Corrupt negative station amount → 400, no booking', r.code === 400 && db.bookings.length === 0, `${r.code}`);

    // ── T7 station/slot relationship: N/A (no slot/inventory model in use) — station integrity checks still apply ──
    seed();
    r = await book(U.owner, st('Pending FM'), { price: 1 });
    check('T7  (N/A slots) Unapproved station still rejected before pricing', r.code === 400 && db.bookings.length === 0 && /not approved/i.test(r.body.message), `${r.code} ${r.body.message}`);
    r = await call(U.owner, 'POST', '/api/v1/bookings', { campaignId: String(CAMP), stationId: String(OID()), slot: 'X', date: future, time: '10:00', duration: 30, price: 1 });
    check('T7  (N/A slots) Unknown station → 404, no booking', r.code === 404 && db.bookings.length === 0, `${r.code}`);

    // ── T8 historical snapshot ──
    seed();
    r = await book(U.owner, st('Priced FM'));
    const id = r.body?.data?._id;
    st('Priced FM').pricing.amount = 80000; st('Priced FM').pricing.currency = 'USD';
    const later = await call(U.owner, 'GET', `/api/v1/bookings/${id}`);
    check('T8  Station price changes later → existing booking keeps 50000 NGN', later.code === 200 && later.body.data.price === 50000 && later.body.data.currency === 'NGN', `${later.code} ${later.body?.data?.price} ${later.body?.data?.currency}`);
    r = await book(U.owner, st('Priced FM'), { price: 50000, currency: 'NGN' });
    check('T8  New booking after change uses new station price 80000 USD', r.code === 201 && stored(r)?.price === 80000 && stored(r)?.currency === 'USD', `${r.code} ${stored(r)?.price} ${stored(r)?.currency}`);

    // ── Existing booking rules preserved ──
    seed();
    const t = '15:00';
    r = await call(U.owner, 'POST', '/api/v1/bookings', { campaignId: String(CAMP), stationId: String(st('Priced FM')._id), slot: 'A', date: future, time: t, duration: 60 });
    const r2 = await call(U.owner, 'POST', '/api/v1/bookings', { campaignId: String(CAMP), stationId: String(st('Priced FM')._id), slot: 'B', date: future, time: '15:30', duration: 30, price: 1 });
    check('R1  Overlap conflict detection unchanged → 409', r.code === 201 && r2.code === 409 && db.bookings.length === 1, `${r.code}/${r2.code}`);
    r = await call(U.owner, 'POST', '/api/v1/bookings', { campaignId: String(CAMP), stationId: String(st('Priced FM')._id), slot: 'A', date: future, time: '10:00' });
    check('R2  Missing duration still 400 (price no longer required)', r.code === 400 && !/price/.test(r.body.message), `${r.code} ${r.body.message}`);
    check('R3  New booking status is PENDING', db.bookings[0]?.status === 'PENDING');

    // ── Authorization regression ──
    seed();
    const authz = [
        ['A1  No token', null, CAMP, 401],
        ['A2  Individual using a company campaign (MVP: individuals book their own) → 404', U.indiv, CAMP, 404],
        ['A3  Employee without BOOKING_CREATE', U.staffNoPerm, CAMP, 403],
        ['A4  Other company\'s campaign (ownership)', U.owner, CAMP_OTHER, 404],
    ];
    for (const [label, who, camp, exp] of authz) {
        const x = await book(who, st('Priced FM'), { price: 1 }, camp);
        check(`${label} → ${exp}, no booking`, x.code === exp && db.bookings.length === 0, `${x.code} ${x.body.message || ''}`);
    }
    r = await book(U.staffBooker, st('Priced FM'), { price: 1 });
    check('A5  Employee with BOOKING_CREATE → 201 at station price', r.code === 201 && stored(r)?.price === 50000, `${r.code} ${stored(r)?.price}`);

    const passed = results.filter(Boolean).length;
    console.log(`\n${passed}/${results.length} passed`);
    process.exitCode = passed === results.length ? 0 : 1;
    // Graceful shutdown: wait for the server and its keep-alive sockets to close, then let Node exit on its own.
    await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
        server.closeAllConnections();
    });
})().catch((e) => { console.log('HARNESS CRASH ' + e.stack); process.exitCode = 1; });
