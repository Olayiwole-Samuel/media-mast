// N9 verification harness — offline. Real app/routes/middleware/models, in-memory store with
// atomic single-document updates (like MongoDB) and artificial I/O delay so concurrent requests interleave.
process.env.JWT_SECRET = 'n9-harness-dummy-secret';
process.env.JWT_EXPIRE = '5m';
process.env.ALLOW_DIRECT_BOOKING = 'true'; // these checks exercise the direct (unpaid) booking route
delete process.env.VERCEL;

const path = require('path');
const BACKEND = path.resolve(__dirname, '..', '..'); // backend/ (this file: backend/test/offline/)
const mongoose = require(path.join(BACKEND, 'node_modules', 'mongoose'));
const jwt = require(path.join(BACKEND, 'node_modules', 'jsonwebtoken'));
mongoose.set('bufferCommands', false);

const src = (p) => require(path.join(BACKEND, 'src', p));
const User = src('models/User'), Employee = src('models/Employee'), Company = src('models/Company'), AuditLog = src('models/AuditLog');
const Campaign = src('models/Campaign'), Station = src('models/Station'), Booking = src('models/Booking');

const OID = () => new mongoose.Types.ObjectId();
let db;
let IO_DELAY = 0; // ms of simulated latency per DB call
const io = () => (IO_DELAY ? new Promise((r) => setTimeout(r, IO_DELAY)) : Promise.resolve());
const clone = (o) => mongoose.mongo.BSON.deserialize(mongoose.mongo.BSON.serialize(o), { promoteValues: true });
const eq = (a, b) => (a == null && b == null) || (a != null && b != null && String(a) === String(b));
const cmp = (x, y) => (x instanceof Date ? x.getTime() : x) - (y instanceof Date ? y.getTime() : y);
const matches = (d, f = {}) => Object.entries(f).every(([k, v]) => {
    if (k === '$or') return v.some((g) => matches(d, g));
    const x = d[k];
    if (v && typeof v === 'object' && !(v instanceof mongoose.Types.ObjectId) && !(v instanceof Date) && !Array.isArray(v)) {
        if ('$in' in v) return v.$in.some((y) => eq(x, y));
        if ('$nin' in v) return !v.$nin.some((y) => eq(x, y));
        if ('$lte' in v) return x != null && cmp(x, v.$lte) <= 0;
        if ('$gt' in v) return x != null && cmp(x, v.$gt) > 0;
        return true;
    }
    if (v instanceof Date) return x instanceof Date && x.getTime() === v.getTime();
    return eq(x, v);
});
const project = (o, sel) => {
    if (!o || !sel) return o;
    const parts = sel.split(/\s+/).filter(Boolean);
    if (parts.every((p) => p.startsWith('-') || p.startsWith('+'))) return o;
    const out = { _id: o._id }; parts.forEach((k) => { if (k in o) out[k] = o[k]; }); return out;
};
const toDoc = (M, o) => (o ? M.hydrate(clone(o)) : null);
const q = (M, getter) => {
    let sel = null;
    const x = {
        select: (s) => { sel = s; return x; }, populate: () => x, lean: () => x, sort: () => x,
        then: (r, j) => io().then(() => { const v = getter(); return Array.isArray(v) ? v.map((o) => toDoc(M, project(o, sel))) : toDoc(M, project(v, sel)); }).then(r, j),
    };
    return x;
};
const fake = (M, c) => {
    M.find = (f) => q(M, () => db[c].filter((d) => matches(d, f)));
    M.findOne = (f) => q(M, () => db[c].find((d) => matches(d, f)) || null);
    M.findById = (id) => q(M, () => db[c].find((d) => eq(d._id, id)) || null);
    // Atomic: match + update happen in one synchronous step, like a single-document MongoDB write.
    M.findOneAndUpdate = (f, u) => q(M, () => { const o = db[c].find((d) => matches(d, f)); if (!o) return null; const before = { ...o }; Object.assign(o, u.$set || {}); return before; });
    M.updateOne = async (f, u) => { await io(); const o = db[c].find((d) => matches(d, f)); if (o) Object.assign(o, u.$set || {}); return { matchedCount: o ? 1 : 0 }; };
    M.deleteOne = async (f) => { await io(); const i = db[c].findIndex((d) => matches(d, f)); if (i >= 0) db[c].splice(i, 1); return { deletedCount: i >= 0 ? 1 : 0 }; };
};
for (const [M, c] of [[User, 'users'], [Employee, 'employees'], [Company, 'companies'], [Campaign, 'campaigns'], [Station, 'stations'], [Booking, 'bookings']]) fake(M, c);
Booking.create = async (data) => { const b = new Booking(data); await b.validate(); await io(); db.bookings.push(b.toObject()); return b; };
AuditLog.create = async (data) => { const a = new AuditLog(data); await a.validate(); db.audit.push(a.toObject()); return a; };

const logs = [];
for (const k of ['log', 'warn', 'error', 'info']) console[k] = (...a) => logs.push(a.map((x) => (x instanceof Error ? x.message : typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
const out = (s) => process.stdout.write(s + '\n');

// ── Fixture ──
const A = OID(), B = OID(), M = OID();
const U = { ownerA: OID(), ownerB: OID(), ownerM: OID() };
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const D10 = day(10);
const stations = {};
const campaigns = {};
const seed = () => {
    const u = (id, companyId) => ({ _id: id, email: `${String(id).slice(-6)}@example.com`, name: 'n', accountType: 'COMPANY', status: 'ACTIVE', companyId, tokenVersion: 0 });
    const st = (key, extra = {}) => { const s = { _id: OID(), name: key, companyId: M, approvalStatus: 'APPROVED', isActive: true, inventoryStatus: 'AVAILABLE', pricing: { amount: 50000, currency: 'NGN', unit: 'slot' }, bookingLockUntil: null, ...extra }; stations[key] = s; return s; };
    const cp = (key, extra = {}) => { const c = { _id: OID(), companyId: A, userId: U.ownerA, name: key, status: 'SUBMITTED', budget: 1, startDate: null, endDate: null, ...extra }; campaigns[key] = c; return c; };
    db = {
        users: [u(U.ownerA, A), u(U.ownerB, B), u(U.ownerM, M)],
        employees: [U.ownerA, U.ownerB, U.ownerM].map((id, i) => ({ _id: OID(), userId: id, companyId: [A, B, M][i], position: 'Company Owner', permissions: ['ALL_ACCESS'], isActive: true })),
        companies: [A, B, M].map((id) => ({ _id: id, name: 'co', status: 'APPROVED' })),
        stations: [st('live'), st('live2'), st('pending', { approvalStatus: 'PENDING' }), st('rejected', { approvalStatus: 'REJECTED' }), st('inactive', { isActive: false }),
            st('unavailable', { inventoryStatus: 'UNAVAILABLE' }), st('maintenance', { inventoryStatus: 'MAINTENANCE' }), st('stationBooked', { inventoryStatus: 'BOOKED' }), st('legacy', { inventoryStatus: undefined })],
        campaigns: [cp('open'), cp('draft', { status: 'DRAFT' }), cp('accepted', { status: 'ACCEPTED' }), cp('revision', { status: 'REVISION_REQUESTED' }),
            ...['CANCELLED', 'EXPIRED', 'COMPLETED', 'FAILED', 'REFUNDED', 'DISPUTED', 'REJECTED'].map((s) => cp(s, { status: s })),
            cp('ranged', { startDate: new Date(`${day(5)}T00:00:00Z`), endDate: new Date(`${day(15)}T23:59:59Z`) }),
            cp('backwards', { startDate: new Date(`${day(15)}T00:00:00Z`), endDate: new Date(`${day(5)}T00:00:00Z`) }),
            cp('startOnly', { startDate: new Date(`${day(8)}T00:00:00Z`) }), cp('endOnly', { endDate: new Date(`${day(12)}T00:00:00Z`) }),
            cp('companyB', { companyId: B, userId: U.ownerB })],
        bookings: [],
        audit: [],
    };
};
const app = src('app');
const tok = (id) => jwt.sign({ id: String(id), tokenVersion: 0 }, process.env.JWT_SECRET, { expiresIn: '5m' });

const results = [];
const check = (label, ok, detail = '') => { results.push(ok); out(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== '' ? '  — ' + detail : ''}`); };

(async () => {
    seed();
    const server = app.listen(0, '127.0.0.1'); // loopback only
    await new Promise((resolve, reject) => server.once('listening', resolve).once('error', reject)); // address() is null until bound
    const base = `http://127.0.0.1:${server.address().port}`;
    const call = async (who, method, p, body) => {
        const h = {};
        if (who) h.Authorization = `Bearer ${tok(who)}`;
        if (body !== undefined) h['Content-Type'] = 'application/json';
        const r = await fetch(base + p, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
        const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* */ }
        return { code: r.status, body: json || {}, text };
    };
    let hour = 6;
    const nextTime = () => `${String(hour++ % 24).padStart(2, '0')}:00`;
    const book = (extra = {}, who = U.ownerA) => call(who, 'POST', '/api/v1/bookings', {
        campaignId: String(campaigns.open._id), stationId: String(stations.live._id), slot: 'PRIME_TIME', date: D10, time: nextTime(), duration: 30, ...extra,
    });
    const count = () => db.bookings.length;
    const rejects = async (label, extra, expCode, re, who) => {
        const n = count(); const r = await book(extra, who);
        check(label, r.code === expCode && count() === n && (!re || re.test(r.body.message || '')), `${r.code} ${r.body.message || ''}`);
    };

    // ── Station availability ──
    let r = await book({ stationId: String(stations.live._id) });
    check('1   APPROVED + active + AVAILABLE → 201', r.code === 201 && r.body.data?.status === 'PENDING', `${r.code} ${r.body.message || ''}`);
    await rejects('2   PENDING station → 400', { stationId: String(stations.pending._id) }, 400, /not approved/);
    await rejects('3   REJECTED station → 400', { stationId: String(stations.rejected._id) }, 400, /not approved/);
    await rejects('4   APPROVED but inactive → 400', { stationId: String(stations.inactive._id) }, 400, /inactive/);
    await rejects('5   inventory UNAVAILABLE → 400 "not available for booking right now"', { stationId: String(stations.unavailable._id) }, 400, /not available for booking right now/);
    await rejects('6   inventory MAINTENANCE → 400', { stationId: String(stations.maintenance._id) }, 400, /not available for booking/);
    await rejects('6b  station-level inventory BOOKED → 400', { stationId: String(stations.stationBooked._id) }, 400, /not available for booking/);
    await rejects('7   Client sends inventoryStatus/approvalStatus/isActive → ignored, DB wins (400)', { stationId: String(stations.unavailable._id), inventoryStatus: 'AVAILABLE', approvalStatus: 'APPROVED', isActive: true }, 400, /not available/);
    r = await book({ stationId: String(stations.legacy._id) });
    check('7b  Legacy station without inventoryStatus (schema default AVAILABLE) → 201', r.code === 201, `${r.code}`);

    // ── Campaign ──
    for (const k of ['draft', 'accepted', 'revision']) {
        r = await book({ campaignId: String(campaigns[k]._id) });
        check(`8   Open campaign (${campaigns[k].status}) → 201 (existing flow preserved)`, r.code === 201, `${r.code} ${r.body.message || ''}`);
    }
    await rejects('9   Missing campaign → 404', { campaignId: String(OID()) }, 404, /Campaign not found/);
    await rejects('10  Another company\'s campaign → 404', { campaignId: String(campaigns.companyB._id) }, 404, /Campaign not found/);
    for (const [n, s] of [['11', 'REJECTED'], ['11b', 'FAILED'], ['11c', 'REFUNDED'], ['11d', 'DISPUTED'], ['12', 'CANCELLED'], ['13', 'EXPIRED'], ['14', 'COMPLETED']]) {
        await rejects(`${n.padEnd(3)} ${s} campaign → 400`, { campaignId: String(campaigns[s]._id) }, 400, /can no longer take new bookings/);
    }
    await rejects('15  Campaign with end before start → 400', { campaignId: String(campaigns.backwards._id), date: day(10) }, 400, /end date is before its start date/);
    await rejects('16  Booking before campaign start → 400', { campaignId: String(campaigns.ranged._id), date: day(3) }, 400, /within the campaign dates/);
    await rejects('17  Booking after campaign end → 400', { campaignId: String(campaigns.ranged._id), date: day(20) }, 400, /within the campaign dates/);
    // Explicit times on station live2 so the auto time counter can't collide with earlier bookings.
    const rangedAt = (d) => book({ campaignId: String(campaigns.ranged._id), stationId: String(stations.live2._id), date: d, time: '05:00' });
    r = await rangedAt(day(10));
    const r2 = await rangedAt(day(5));
    const r3 = await rangedAt(day(15));
    check('17b Inside the range, and on the first/last day (end time-of-day ignored) → 201', r.code === 201 && r2.code === 201 && r3.code === 201, `${r.code}/${r2.code}/${r3.code}`);
    r = await book({ campaignId: String(campaigns.open._id), date: day(60) });
    const r4 = await book({ campaignId: String(campaigns.startOnly._id), date: day(30) });
    const r5 = await book({ campaignId: String(campaigns.endOnly._id), date: day(2) });
    check('18  Open-ended campaigns (no dates / start only / end only) keep working', r.code === 201 && r4.code === 201 && r5.code === 201, `${r.code}/${r4.code}/${r5.code}`);
    await rejects('18b start-only campaign still enforces its start', { campaignId: String(campaigns.startOnly._id), date: day(4) }, 400, /within the campaign dates/);

    // ── Conflicts ──
    const D = day(11), st = String(stations.live2._id);
    const at = (time, duration = 30, extra = {}) => book({ stationId: st, date: D, time, duration, ...extra });
    r = await at('10:00', 60);
    const first = r.body.data;
    check('19  First booking 10:00–11:00 → 201', r.code === 201, `${r.code}`);
    r = await at('10:00', 60);
    check('20  Same station, same time → 409 with the existing booking reference', r.code === 409 && r.body.data?.bookingReference === first?.bookingReference, `${r.code}`);
    r = await at('10:30', 30);
    const r6 = await at('09:30', 45);
    check('21  Overlapping 10:30 and 09:30–10:15 → 409', r.code === 409 && r6.code === 409, `${r.code}/${r6.code}`);
    r = await at('11:00', 30);
    const r7 = await at('09:00', 60);
    check('22  Back-to-back 11:00 and 09:00–10:00 (touching, not overlapping) → 201', r.code === 201 && r7.code === 201, `${r.code}/${r7.code}`);
    r = await book({ stationId: String(stations.live._id), date: D, time: '10:00', duration: 60 });
    check('23  Same time on a different station → 201', r.code === 201, `${r.code}`);
    const D2 = day(12);
    const setStatus = (id, status) => { db.bookings.find((b) => eq(b._id, id)).status = status; };
    for (const [n, status, t] of [['24', 'CANCELLED', '14:00'], ['25', 'REJECTED', '15:00']]) {
        const x = await book({ stationId: st, date: D2, time: t, duration: 30 });
        setStatus(x.body.data._id, status);
        const y = await book({ stationId: st, date: D2, time: t, duration: 30 });
        check(`${n}  ${status} booking does not block the same time`, x.code === 201 && y.code === 201, `${x.code}/${y.code}`);
    }
    const old = await book({ stationId: st, date: D2, time: '16:00', duration: 30 });
    setStatus(old.body.data._id, 'COMPLETED');
    r = await book({ stationId: st, date: day(13), time: '16:00', duration: 30 });
    const r8 = await book({ stationId: st, date: D2, time: '16:00', duration: 30 });
    check('26  COMPLETED booking does not block a future date; it still holds its own used airtime', r.code === 201 && r8.code === 409, `${r.code}/${r8.code}`);
    // CHANGES_REQUESTED keeps the hold; resubmit reuses the same booking
    const cr = await book({ stationId: st, date: D2, time: '18:00', duration: 30 });
    setStatus(cr.body.data._id, 'CHANGES_REQUESTED');
    r = await book({ stationId: st, date: D2, time: '18:00', duration: 30 });
    check('27  CHANGES_REQUESTED still holds its time (no one else can take it)', r.code === 409, `${r.code}`);
    const n0 = count();
    r = await call(U.ownerA, 'PATCH', `/api/v1/bookings/${cr.body.data._id}/resubmit`);
    check('27b Resubmit → same booking back to PENDING, no new reservation', r.code === 200 && count() === n0 && db.bookings.filter((b) => b.time === '18:00' && b.date.toISOString().slice(0, 10) === D2 && b.status !== 'CANCELLED').length === 1, `${r.code}`);

    // ── Race safety ──
    IO_DELAY = 15;
    const D3 = day(14), st3 = String(stations.live._id);
    const n1 = count();
    const race = await Promise.all([1, 2].map(() => call(U.ownerA, 'POST', '/api/v1/bookings', { campaignId: String(campaigns.open._id), stationId: st3, slot: 'X', date: D3, time: '20:00', duration: 30 })));
    const codes = race.map((x) => x.code).sort();
    check('28  Two simultaneous identical requests cannot both succeed', count() === n1 + 1, `stored +${count() - n1}`);
    check('29  …one 201, the other 409 conflict', codes.join() === '201,409', codes.join());
    const n2 = count();
    const burst = await Promise.all(['21:00', '21:10', '21:20', '20:50', '21:15'].map((t) => call(U.ownerA, 'POST', '/api/v1/bookings', { campaignId: String(campaigns.open._id), stationId: st3, slot: 'X', date: D3, time: t, duration: 30 })));
    const stored = db.bookings.filter((b) => eq(b.stationId, st3) && b.date.toISOString().slice(0, 10) === D3 && !['CANCELLED', 'REJECTED'].includes(b.status));
    const overlap = stored.some((a, i) => stored.some((b, j) => i < j && (() => { const m = (t) => +t.slice(0, 2) * 60 + +t.slice(3); return m(a.time) < m(b.time) + b.duration && m(b.time) < m(a.time) + a.duration; })()));
    check('29b Burst of 5 overlapping requests: no two stored bookings overlap', !overlap && burst.filter((x) => x.code === 201).length === count() - n2, burst.map((x) => x.code).join(','));
    const lockLeft = db.stations.find((s) => eq(s._id, st3)).bookingLockUntil;
    check('29c Station lock released after the requests', lockLeft === null, String(lockLeft));
    // Defence in depth: lock that "expired" (always granted) — post-insert re-check still prevents a double booking.
    const realFOU = Station.findOneAndUpdate;
    Station.findOneAndUpdate = (f) => q(Station, () => ({ _id: f._id }));
    const n3 = count();
    const noLock = await Promise.all([1, 2, 3].map(() => call(U.ownerA, 'POST', '/api/v1/bookings', { campaignId: String(campaigns.open._id), stationId: String(stations.live2._id), slot: 'X', date: day(16), time: '07:00', duration: 30 })));
    Station.findOneAndUpdate = realFOU;
    check('29d Even with the lock bypassed, at most one survives (others withdrawn → 409)', count() - n3 <= 1 && noLock.filter((x) => x.code === 201).length === count() - n3, `${noLock.map((x) => x.code).join(',')} stored +${count() - n3}`);
    // A held lock that never clears → 409 "try again", nothing created
    db.stations.find((s) => eq(s._id, stations.live._id)).bookingLockUntil = new Date(Date.now() + 60_000);
    IO_DELAY = 0;
    const n4 = count();
    r = await book({ stationId: String(stations.live._id), date: day(17) });
    check('29e Station locked by another request → 409 "try again", no booking', r.code === 409 && /try again/.test(r.body.message || '') && count() === n4, `${r.code}`);
    db.stations.find((s) => eq(s._id, stations.live._id)).bookingLockUntil = new Date(Date.now() - 1000);
    r = await book({ stationId: String(stations.live._id), date: day(17) });
    check('29f Expired lock is taken over → 201', r.code === 201, `${r.code}`);

    // ── Security / ownership / validation ──
    await rejects('30  Booking with another company\'s campaign → 404', { campaignId: String(campaigns.companyB._id) }, 404);
    r = await book({ price: 1, currency: 'USD', stationId: String(stations.live._id), date: day(18) });
    const saved = db.bookings.find((b) => eq(b._id, r.body.data?._id));
    check('31/32 Client price 1 / currency USD ignored → 50000 NGN from Station.pricing', r.code === 201 && saved?.price === 50000 && saved?.currency === 'NGN', `${r.code} ${saved?.price} ${saved?.currency}`);
    db.stations.find((s) => eq(s._id, stations.live._id)).pricing.amount = 75000;
    check('31b Later station price change does not alter the stored booking (snapshot)', db.bookings.find((b) => eq(b._id, saved._id)).price === 50000);
    r = await book({ stationId: String(stations.live._id), date: day(19) });
    check('31c New bookings use the new station price', r.body.data?.price === 75000, `${r.body.data?.price}`);
    await rejects('33  Client cannot bypass availability (maintenance station + fake fields) → 400', { stationId: String(stations.maintenance._id), inventoryStatus: 'AVAILABLE' }, 400);
    await rejects('34  Malformed campaignId → 400', { campaignId: 'nope' }, 400, /Invalid campaignId or stationId/);
    await rejects('35  Malformed stationId → 400', { stationId: { $ne: null } }, 400, /Invalid campaignId or stationId/);
    for (const [lbl, d] of [['"not-a-date"', 'not-a-date'], ['object', { $gt: '' }], ['number', 1735689600000], ['past', day(-3)], ['2026-02-30', '2026-02-30T99:00']]) {
        await rejects(`36  Malformed/invalid date ${lbl} → 400`, { date: d }, 400);
    }
    for (const [lbl, du] of [['0', 0], ['-30', -30], ['0.5', 0.5], ['"abc"', 'abc'], ['true', true], ['[30]', [30]], ['1441', 1441], ['""', '']]) {
        await rejects(`37  Invalid duration ${lbl} → 400`, { duration: du }, 400);
    }
    for (const [lbl, extra] of [['time 25:00', { time: '25:00' }], ['time ["10:00"]', { time: ['10:00'] }], ['slot {}', { slot: {} }], ['slot ""', { slot: '   ' }], ['past midnight', { time: '23:50', duration: 30 }]]) {
        await rejects(`37b Invalid ${lbl} → 400`, extra, 400);
    }
    r = await call(null, 'POST', '/api/v1/bookings', { campaignId: String(campaigns.open._id) });
    check('38  No auth → 401', r.code === 401, `${r.code}`);

    // ── Lifecycle: station accept respects station lifecycle ──
    const pend = await book({ stationId: String(stations.live._id), date: day(21) });
    db.stations.find((s) => eq(s._id, stations.live._id)).isActive = false;
    r = await call(U.ownerM, 'PATCH', `/api/v1/bookings/${pend.body.data._id}/accept`);
    check('L1  Station deactivated → accepting its pending booking → 400, still PENDING (not deleted/cancelled)', r.code === 400 && db.bookings.find((b) => eq(b._id, pend.body.data._id))?.status === 'PENDING', `${r.code}`);
    db.stations.find((s) => eq(s._id, stations.live._id)).isActive = true;
    db.stations.find((s) => eq(s._id, stations.live._id)).inventoryStatus = 'MAINTENANCE';
    r = await call(U.ownerM, 'PATCH', `/api/v1/bookings/${pend.body.data._id}/accept`);
    check('L2  Inventory MAINTENANCE does not block accepting an existing booking (it already holds its time)', r.code === 200, `${r.code}`);
    r = await book({ stationId: String(stations.live._id), date: day(22) });
    check('L3  …but new bookings on that station stop → 400', r.code === 400, `${r.code}`);
    check('L4  No 500s and no stack traces logged during the run', !logs.some((l) => /CastError|TypeError|ValidationError/.test(l)), logs.filter((l) => /Error/.test(l)).slice(0, 2).join(' | '));

    r = await call(null, 'GET', '/health');
    check('H   /health → 200', r.code === 200, `${r.code}`);

    server.close();
    const passed = results.filter(Boolean).length;
    out(`\nN9: ${passed}/${results.length} passed`);
    process.exitCode = passed === results.length ? 0 : 1;
})().catch((e) => { out('HARNESS CRASH ' + e.stack); process.exitCode = 1; });
