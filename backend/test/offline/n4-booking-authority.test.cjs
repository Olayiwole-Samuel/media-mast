// N4 verification harness — offline. Real app/routes/middleware/models, in-memory store, dummy JWT secret.
process.env.JWT_SECRET = 'n4-harness-dummy-secret';
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
const { BOOKING_STATUS_TRANSITIONS } = src('utils/bookingStatus');

const OID = () => new mongoose.Types.ObjectId();
let db;
const clone = (o) => mongoose.mongo.BSON.deserialize(mongoose.mongo.BSON.serialize(o), { promoteValues: true });
const getField = (d, k) => k.split('.').reduce((o, p) => (o == null ? undefined : o[p]), d);
const eq = (a, b) => (a == null && b == null) || (a != null && b != null && String(a) === String(b));
const matches = (d, f = {}) => Object.entries(f).every(([k, v]) => {
    const x = getField(d, k);
    if (v && typeof v === 'object' && !(v instanceof mongoose.Types.ObjectId) && !(v instanceof Date) && !Array.isArray(v)) {
        if ('$in' in v) return v.$in.some((y) => eq(x, y));
        if ('$nin' in v) return !v.$nin.some((y) => eq(x, y));
        if ('$gt' in v) return x != null && x > v.$gt;
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
const toDoc = (M, c, o) => {
    if (!o) return null;
    const d = M.hydrate(clone(o));
    d.save = async () => { await d.validate(); const plain = d.toObject(); const i = db[c].findIndex((x) => eq(x._id, plain._id)); db[c][i] = plain; return d; };
    return d;
};
const q = (M, c, getter) => {
    let sel = null;
    const x = {
        select: (s) => { sel = s; return x; }, populate: () => x, lean: () => x, sort: () => x, limit: () => x, skip: () => x,
        then: (r, j) => Promise.resolve().then(() => { const v = getter(); return Array.isArray(v) ? v.map((o) => toDoc(M, c, project(o, sel))) : toDoc(M, c, project(v, sel)); }).then(r, j),
    };
    return x;
};
let raceHook = null; // lets a test change a booking between the read and the conditional write
const fake = (M, c) => {
    M.find = (f) => q(M, c, () => db[c].filter((d) => matches(d, f)));
    M.findOne = (f) => q(M, c, () => {
        if (f && f._id !== undefined && !/^[0-9a-fA-F]{24}$/.test(String(f._id))) throw new mongoose.Error.CastError('ObjectId', f._id, '_id');
        return db[c].find((d) => matches(d, f)) || null;
    });
    M.findById = (id) => q(M, c, () => {
        if (!/^[0-9a-fA-F]{24}$/.test(String(id))) throw new mongoose.Error.CastError('ObjectId', id, '_id');
        return db[c].find((d) => eq(d._id, id)) || null;
    });
    M.countDocuments = async (f) => db[c].filter((d) => matches(d, f)).length;
    M.findOneAndUpdate = (f, u) => q(M, c, () => {
        if (raceHook && c === 'bookings') { const h = raceHook; raceHook = null; h(); }
        const o = db[c].find((d) => matches(d, f));
        if (!o) return null;
        Object.assign(o, u.$set || {});
        const v = new M(o).validateSync(); if (v) throw v;
        return o;
    });
    M.updateOne = async (f, u) => { const o = db[c].find((d) => matches(d, f)); if (o) Object.assign(o, u.$set || u); return { matchedCount: o ? 1 : 0 }; };
};
for (const [M, c] of [[User, 'users'], [Employee, 'employees'], [Company, 'companies'], [Campaign, 'campaigns'], [Station, 'stations'], [Booking, 'bookings']]) fake(M, c);
// N9 fixture plumbing: booking creation takes a per-station lock (Station.findOneAndUpdate / updateOne).
// These suites send requests one at a time, so the fake grants the lock; N9 tests the lock itself.
Station.findOneAndUpdate = async (f) => ({ _id: f._id });
Station.updateOne = async () => ({ matchedCount: 1 });

Booking.create = async (data) => { const b = new Booking(data); await b.validate(); db.bookings.push(b.toObject()); return b; };
AuditLog.create = async (data) => { const a = new AuditLog(data); await a.validate(); db.audit.push(a.toObject()); return a; };
AuditLog.find = () => q(AuditLog, 'audit', () => []);

const logs = [];
for (const k of ['log', 'warn', 'error', 'info']) console[k] = (...a) => logs.push(a.map((x) => (x instanceof Error ? x.message : typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
const out = (s) => process.stdout.write(s + '\n');

// ── Actors ──
const A = OID(), B = OID(), M = OID(), N = OID();          // buyer A, buyer B, media company M (owns S1), media company N (owns S2)
const U = { ownerA: OID(), apprA: OID(), viewA: OID(), ownerB: OID(), ownerM: OID(), staffM: OID(), viewM: OID(), ownerN: OID(), indiv: OID(), admin: OID() };
const S1 = OID(), S2 = OID(), CA = OID(), CB = OID();
const future = new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10);
const seed = () => {
    const u = (id, accountType, companyId) => ({ _id: id, email: `${String(id).slice(-6)}@example.com`, name: 'n', accountType, status: 'ACTIVE', companyId, tokenVersion: 0 });
    const e = (userId, companyId, position, permissions) => ({ _id: OID(), userId, companyId, position, permissions, isActive: true });
    db = {
        users: [u(U.ownerA, 'COMPANY', A), u(U.apprA, 'EMPLOYEE', A), u(U.viewA, 'EMPLOYEE', A), u(U.ownerB, 'COMPANY', B), u(U.ownerM, 'COMPANY', M),
            u(U.staffM, 'EMPLOYEE', M), u(U.viewM, 'EMPLOYEE', M), u(U.ownerN, 'COMPANY', N), u(U.indiv, 'INDIVIDUAL', null), u(U.admin, 'ADMIN', null)],
        employees: [e(U.ownerA, A, 'Company Owner', ['ALL_ACCESS']), e(U.apprA, A, 'Approver', ['BOOKING_APPROVE', 'BOOKING_VIEW', 'BOOKING_CANCEL']), e(U.viewA, A, 'Viewer', ['BOOKING_VIEW']),
            e(U.ownerB, B, 'Company Owner', ['ALL_ACCESS']), e(U.ownerM, M, 'Company Owner', ['ALL_ACCESS']), e(U.staffM, M, 'Traffic', ['BOOKING_APPROVE', 'BOOKING_VIEW']),
            e(U.viewM, M, 'Sales', ['BOOKING_VIEW']), e(U.ownerN, N, 'Company Owner', ['ALL_ACCESS'])],
        companies: [A, B, M, N].map((id) => ({ _id: id, name: 'co', status: 'APPROVED' })),
        campaigns: [{ _id: CA, companyId: A, userId: U.ownerA, name: 'A camp', status: 'DRAFT' }, { _id: CB, companyId: B, userId: U.ownerB, name: 'B camp', status: 'DRAFT' }],
        stations: [
            { _id: S1, name: 'S1 FM', companyId: M, approvalStatus: 'APPROVED', isActive: true, pricing: { amount: 50000, currency: 'NGN', unit: 'slot' } },
            { _id: S2, name: 'S2 TV', companyId: N, approvalStatus: 'APPROVED', isActive: true, pricing: { amount: 90000, currency: 'NGN', unit: 'slot' } },
        ],
        bookings: [],
        audit: [],
    };
};
const mkBooking = (status, companyId, stationId, extra = {}) => {
    const b = { _id: OID(), bookingReference: `BK-${Math.random().toString(36).slice(2, 10)}`, campaignId: companyId === A ? CA : CB, stationId, userId: companyId === A ? U.ownerA : U.ownerB,
        companyId, slot: 'PRIME_TIME', date: new Date(`${future}T00:00:00.000Z`), time: '10:00', duration: 30, price: 50000, currency: 'NGN', status, proofUrl: null, proofUploadedAt: null, proofVerified: false, stationNote: null, ...extra };
    db.bookings.push(b);
    return b;
};
const bk = (id) => db.bookings.find((b) => eq(b._id, id));

const app = src('app');
const tok = (id) => jwt.sign({ id: String(id), tokenVersion: 0 }, process.env.JWT_SECRET, { expiresIn: '5m' });

const results = [];
const check = (label, ok, detail = '') => { results.push(ok); out(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== '' ? '  — ' + detail : ''}`); };

(async () => {
    seed();
    const server = app.listen(0, '127.0.0.1'); // loopback only
    await new Promise((resolve, reject) => server.once('listening', resolve).once('error', reject)); // address() is null until bound
    const base = `http://127.0.0.1:${server.address().port}`;
    const call = async (who, method, p, body, rawToken) => {
        const h = {};
        const t = rawToken !== undefined ? rawToken : who ? tok(who) : null;
        if (t) h.Authorization = `Bearer ${t}`;
        if (body !== undefined) h['Content-Type'] = 'application/json';
        const r = await fetch(base + p, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
        const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* */ }
        return { code: r.status, body: json || {}, text };
    };
    const act = (who, id, action, body) => call(who, 'PATCH', `/api/v1/bookings/${id}/${action}`, body);
    const STATION_ACTIONS = ['accept', 'reject', 'request-changes', 'schedule', 'proof', 'complete'];
    const PROOF = { proofUrl: 'https://cdn.example.com/proof/air-check.mp3' };

    // ── Authentication ──
    let b = mkBooking('PENDING', A, S1);
    let r = await act(null, b._id, 'accept');
    check('1   No token → 401 on a station action', r.code === 401 && bk(b._id).status === 'PENDING', `${r.code}`);
    r = await call(null, 'PATCH', `/api/v1/bookings/${b._id}/accept`, undefined, 'not.a.valid.jwt');
    check('2   Invalid token → 401', r.code === 401 && bk(b._id).status === 'PENDING', `${r.code}`);
    r = await call(U.ownerA, 'GET', '/api/v1/bookings');
    check('3   Company owner lists own bookings → 200', r.code === 200 && r.body.data?.length === 1, `${r.code}`);
    r = await call(U.indiv, 'GET', '/api/v1/bookings');
    check('4   Individual lists bookings → 200 with only their own (none here, no company bookings)', r.code === 200 && Array.isArray(r.body.data) && r.body.data.length === 0, `${r.code}`);
    r = await call(U.admin, 'GET', '/api/v1/admin/bookings');
    check('5   Admin booking list preserved → 200', r.code === 200, `${r.code}`);
    r = await act(U.admin, b._id, 'accept');
    check('5b  Full admin can act for any station (station desk) → 200 ACCEPTED', r.code === 200 && bk(b._id).status === 'ACCEPTED', `${r.code}`);

    // ── Creation + D3 pricing ──
    const before = db.bookings.length;
    r = await call(U.ownerA, 'POST', '/api/v1/bookings', { campaignId: String(CA), stationId: String(S1), slot: 'MORNING', date: future, time: '07:00', duration: 30, price: 1, currency: 'USD', status: 'COMPLETED', companyId: String(B) });
    const created = r.body.data;
    check('6   Company creates booking → 201 PENDING', r.code === 201 && created?.status === 'PENDING' && db.bookings.length === before + 1, `${r.code} ${r.body.message || ''}`);
    check('7   Price is server-derived from Station.pricing (50000 NGN)', created?.price === 50000 && created?.currency === 'NGN');
    check('8   Client price/currency/status/companyId ignored', created?.price !== 1 && created?.status === 'PENDING' && eq(created?.companyId, A));

    // ── Ownership ──
    const bB = mkBooking('PENDING', B, S2);
    r = await call(U.ownerA, 'GET', `/api/v1/bookings/${bB._id}`);
    check('9   Company A cannot read Company B booking → 404', r.code === 404, `${r.code}`);
    r = await call(U.ownerA, 'POST', `/api/v1/bookings/${bB._id}/cancel`);
    const r2 = await act(U.ownerA, bB._id, 'resubmit');
    check('10  Company A cannot mutate Company B booking (cancel/resubmit → 404, unchanged)', r.code === 404 && r2.code === 404 && bk(bB._id).status === 'PENDING', `${r.code}/${r2.code}`);
    let allA = true;
    for (const a of STATION_ACTIONS) { const x = await act(U.ownerA, bB._id, a, a === 'proof' ? PROOF : undefined); allA = allA && x.code === 404; }
    check('10b Company A station actions on Company B booking → 404, unchanged', allA && bk(bB._id).status === 'PENDING' && !bk(bB._id).proofUrl);
    r = await call(U.indiv, 'GET', `/api/v1/bookings/${b._id}`);
    check('11  Individual cannot access a company booking → 404', r.code === 404, `${r.code}`);

    // ── Customer authority on its own booking (owner has ALL_ACCESS, approver has BOOKING_APPROVE) ──
    const auditBefore = db.audit.length;
    const own = {
        accept: mkBooking('PENDING', A, S1), reject: mkBooking('PENDING', A, S1), 'request-changes': mkBooking('PENDING', A, S1),
        schedule: mkBooking('ACCEPTED', A, S1), proof: mkBooking('SCHEDULED', A, S1), complete: mkBooking('SCHEDULED', A, S1, { proofUrl: 'https://x.example.com/p' }),
    };
    const labels = { accept: '12  accept', reject: '13  reject', schedule: '14  schedule', 'request-changes': '14b request changes', proof: '16  upload proof', complete: '17  complete' };
    for (const who of [U.ownerA, U.apprA]) {
        for (const a of STATION_ACTIONS) {
            const target = own[a];
            const prev = { ...bk(target._id) };
            const x = await act(who, target._id, a, a === 'proof' ? PROOF : undefined);
            const now = bk(target._id);
            check(`${labels[a]}: buyer ${who === U.ownerA ? 'owner (ALL_ACCESS)' : 'BOOKING_APPROVE employee'} → 403, unchanged`, x.code === 403 && now.status === prev.status && now.proofUrl === prev.proofUrl
                && /Only the station/.test(x.body.message || ''), `${x.code}`);
        }
    }
    check('15  No LIVE status exists to set (enum has no LIVE / PROOF_UPLOADED / COMPANY_REVIEW)', !Booking.schema.path('status').enumValues.some((s) => ['LIVE', 'PROOF_UPLOADED', 'COMPANY_REVIEW'].includes(s)));
    check('31  Rejected actions wrote no success audit', db.audit.length === auditBefore, `${db.audit.length - auditBefore} new`);

    // ── Status manipulation ──
    const g = mkBooking('PENDING', A, S1);
    r = await call(U.ownerA, 'PATCH', `/api/v1/bookings/${g._id}/status`, { status: 'COMPLETED' });
    const r3 = await call(U.ownerA, 'PUT', `/api/v1/bookings/${g._id}`, { status: 'COMPLETED' });
    check('18  Generic status update gone (PATCH /:id/status, PUT /:id → 404), status unchanged', r.code === 404 && r3.code === 404 && bk(g._id).status === 'PENDING', `${r.code}/${r3.code}`);
    r = await act(U.staffM, g._id, 'schedule');
    const r4 = await act(U.staffM, g._id, 'complete');
    check('19  Invalid transitions (PENDING → SCHEDULED / COMPLETED) → 400', r.code === 400 && r4.code === 400 && bk(g._id).status === 'PENDING', `${r.code}/${r4.code}`);
    await act(U.staffM, g._id, 'accept');
    r = await act(U.staffM, g._id, 'accept');
    check('20  Same-status transition (accept an ACCEPTED booking) → 400 "already"', r.code === 400 && /already ACCEPTED/.test(r.body.message || ''), `${r.code} ${r.body.message}`);
    const race = mkBooking('ACCEPTED', A, S1);
    raceHook = () => { bk(race._id).status = 'CANCELLED'; };
    r = await act(U.staffM, race._id, 'schedule');
    check('21  Stale status (cancelled between read and write) → 409, not overwritten', r.code === 409 && bk(race._id).status === 'CANCELLED', `${r.code}`);
    const race2 = mkBooking('ACCEPTED', A, S1);
    raceHook = () => { bk(race2._id).status = 'SCHEDULED'; };
    r = await call(U.ownerA, 'POST', `/api/v1/bookings/${race2._id}/cancel`);
    check('21b Cancel racing a station schedule → 409, SCHEDULED kept', r.code === 409 && bk(race2._id).status === 'SCHEDULED', `${r.code}`);

    // ── Station authority (real: Station.companyId) ──
    const w = mkBooking('PENDING', A, S1);
    const aud0 = db.audit.length;
    r = await act(U.staffM, w._id, 'accept', { note: 'Confirmed for prime slot' });
    check('22  Station staff (BOOKING_APPROVE, owns S1) accepts → 200 ACCEPTED', r.code === 200 && bk(w._id).status === 'ACCEPTED' && bk(w._id).stationNote === 'Confirmed for prime slot', `${r.code}`);
    r = await act(U.staffM, w._id, 'complete');
    check('22b Station cannot skip SCHEDULED (ACCEPTED → COMPLETED) → 400', r.code === 400 && bk(w._id).status === 'ACCEPTED', `${r.code}`);
    r = await act(U.ownerM, w._id, 'schedule');
    check('22c Station owner schedules → 200 SCHEDULED', r.code === 200 && bk(w._id).status === 'SCHEDULED', `${r.code}`);
    r = await act(U.staffM, w._id, 'complete');
    // Proof is optional now: completing before the slot has aired is refused for timing, not for missing proof.
    check('22d Completion before the slot airs (no proof) → 400 "not aired yet", not a proof error', r.code === 400 && bk(w._id).status === 'SCHEDULED' && /not aired yet/.test(r.body.message || '') && !/proof/i.test(r.body.message || ''), `${r.code} ${r.body.message}`);
    const noProof = mkBooking('SCHEDULED', A, S1, { date: new Date(Date.now() - 864e5) });
    r = await act(U.staffM, noProof._id, 'complete');
    check('22d2 Aired spot completes without proof → 200 COMPLETED', r.code === 200 && bk(noProof._id).status === 'COMPLETED' && !bk(noProof._id).proofUrl, `${r.code} ${r.body.message}`);
    r = await act(U.staffM, w._id, 'proof', { proofUrl: 'javascript:alert(1)' });
    const r5 = await act(U.staffM, w._id, 'proof', {});
    check('22e Proof must be an http(s) link → 400', r.code === 400 && r5.code === 400 && !bk(w._id).proofUrl, `${r.code}/${r5.code}`);
    r = await act(U.staffM, w._id, 'proof', PROOF);
    check('22f Station records proof → 200, status unchanged, proofUploadedAt set, proofVerified false', r.code === 200 && bk(w._id).status === 'SCHEDULED' && bk(w._id).proofUrl === PROOF.proofUrl
        && bk(w._id).proofUploadedAt instanceof Date && bk(w._id).proofVerified === false, `${r.code}`);
    r = await act(U.staffM, w._id, 'complete');
    check('22f2 Spot not aired yet (slot in the future) → 400 "not aired yet", still SCHEDULED', r.code === 400 && bk(w._id).status === 'SCHEDULED' && /not aired yet/.test(r.body.message || ''), `${r.code} ${r.body.message}`);
    // Time passes: the slot has now aired (yesterday), so it can be completed.
    bk(w._id).date = new Date(Date.now() - 864e5);
    r = await act(U.staffM, w._id, 'complete');
    check('22g Station completes after proof → 200 COMPLETED', r.code === 200 && bk(w._id).status === 'COMPLETED', `${r.code}`);
    r = await act(U.staffM, w._id, 'proof', PROOF);
    check('22h Proof cannot be changed after completion → 400', r.code === 400, `${r.code}`);
    const rj = mkBooking('PENDING', A, S1);
    r = await act(U.staffM, rj._id, 'reject', { note: 'Slot unavailable' });
    check('22i Station rejects → 200 REJECTED; REJECTED is final', r.code === 200 && bk(rj._id).status === 'REJECTED' && (await act(U.staffM, rj._id, 'accept')).code === 400, `${r.code}`);
    const ch = mkBooking('PENDING', A, S1);
    r = await act(U.staffM, ch._id, 'request-changes', { note: 'Please move to 11:00' });
    check('22j Station requests changes → 200 CHANGES_REQUESTED', r.code === 200 && bk(ch._id).status === 'CHANGES_REQUESTED', `${r.code}`);
    r = await act(U.ownerM, ch._id, 'resubmit');
    const r9 = await act(U.staffM, ch._id, 'resubmit');
    check('22k Station cannot resubmit for the customer (owner → 404 ownership, staff → 403 permission)', r.code === 404 && r9.code === 403 && bk(ch._id).status === 'CHANGES_REQUESTED', `${r.code}/${r9.code}`);
    r = await act(U.ownerA, ch._id, 'resubmit');
    check('22l Customer resubmits CHANGES_REQUESTED → PENDING', r.code === 200 && bk(ch._id).status === 'PENDING', `${r.code}`);
    r = await act(U.staffM, ch._id, 'accept', { note: 42 });
    check('22m Non-text note → 400', r.code === 400 && bk(ch._id).status === 'PENDING', `${r.code}`);
    r = await act(U.viewM, ch._id, 'accept');
    check('22n Station staff without BOOKING_APPROVE → 403', r.code === 403 && bk(ch._id).status === 'PENDING', `${r.code}`);
    const s2b = mkBooking('PENDING', A, S2);
    r = await act(U.staffM, s2b._id, 'accept');
    check('23  Station M (owns S1) cannot act on an S2 booking → 404, unchanged', r.code === 404 && bk(s2b._id).status === 'PENDING', `${r.code}`);
    r = await act(U.ownerN, w._id, 'proof', PROOF);
    const r6 = await act(U.ownerN, rj._id, 'accept');
    check('24  Unrelated station company cannot act on S1 bookings → 404', r.code === 404 && r6.code === 404, `${r.code}/${r6.code}`);
    r = await call(U.staffM, 'PATCH', `/api/v1/bookings/${s2b._id}/accept`, { stationId: String(S1), companyId: String(N) });
    check('24b stationId/companyId in body cannot claim ownership → 404', r.code === 404 && bk(s2b._id).status === 'PENDING', `${r.code}`);
    r = await call(U.staffM, 'GET', '/api/v1/bookings/station');
    check('24c GET /bookings/station lists only bookings on the company\'s stations', r.code === 200 && r.body.data.length > 0 && r.body.data.every((x) => eq(x.stationId?._id || x.stationId, S1)), `${r.code} n=${r.body.data?.length}`);
    r = await call(U.ownerB, 'GET', '/api/v1/bookings/station');
    check('24d Company that owns no station → empty station list', r.code === 200 && r.body.data.length === 0, `${r.code}`);
    r = await call(U.staffM, 'GET', '/api/v1/bookings');
    check('24e Station company\'s customer list (GET /bookings) still shows only its own purchases', r.code === 200 && r.body.data.length === 0, `${r.code} n=${r.body.data?.length}`);
    const stationAudits = db.audit.slice(aud0);
    check('30  Station actions audited (ACCEPT / SCHEDULE / UPLOAD_PROOF / COMPLETE / REJECT / UPDATE)', ['ACCEPT_BOOKING', 'SCHEDULE_BOOKING', 'UPLOAD_BOOKING_PROOF', 'COMPLETE_BOOKING', 'REJECT_BOOKING', 'UPDATE_BOOKING']
        .every((a) => stationAudits.some((x) => x.action === a)) && stationAudits.filter((x) => x.action !== 'UPDATE_BOOKING' || x.metadata?.actor === 'STATION').every((x) => eq(x.companyId, M)), stationAudits.map((x) => x.action).join(','));
    check('30b Audit metadata holds no secrets', !/Bearer|eyJ|password|token/i.test(JSON.stringify(db.audit)));

    // ── Cancellation: PENDING / ACCEPTED / SCHEDULED / CHANGES_REQUESTED (not yet aired) ──
    const c1 = mkBooking('PENDING', A, S1), c2 = mkBooking('ACCEPTED', A, S1);
    r = await call(U.ownerA, 'POST', `/api/v1/bookings/${c1._id}/cancel`);
    const r7 = await call(U.ownerA, 'POST', `/api/v1/bookings/${c2._id}/cancel`);
    check('25  Cancel PENDING and ACCEPTED → 200 CANCELLED + CANCEL_BOOKING audit', r.code === 200 && r7.code === 200 && bk(c1._id).status === 'CANCELLED' && bk(c2._id).status === 'CANCELLED'
        && db.audit.filter((x) => x.action === 'CANCEL_BOOKING').length >= 2, `${r.code}/${r7.code}`);
    const codes = [];
    // Closed bookings stay closed; not-yet-aired SCHEDULED / CHANGES_REQUESTED spots can now be cancelled (cancellation policy).
    for (const st of ['COMPLETED', 'REJECTED', 'CANCELLED']) { const x = mkBooking(st, A, S1); const y = await call(U.ownerA, 'POST', `/api/v1/bookings/${x._id}/cancel`); codes.push(`${st}:${y.code}`); if (y.code !== 403 || bk(x._id).status !== st) codes.push('CHANGED'); }
    for (const st of ['SCHEDULED', 'CHANGES_REQUESTED']) { const x = mkBooking(st, A, S1); const y = await call(U.ownerA, 'POST', `/api/v1/bookings/${x._id}/cancel`); codes.push(`${st}:${y.code}`); if (y.code !== 200 || bk(x._id).status !== 'CANCELLED') codes.push('NOT-CANCELLED'); }
    check('26/27 Cancel COMPLETED / REJECTED / CANCELLED → 403 unchanged; future SCHEDULED / CHANGES_REQUESTED → 200 CANCELLED', !codes.includes('CHANGED') && !codes.includes('NOT-CANCELLED'), codes.join(' '));
    const sc = mkBooking('PENDING', A, S1);
    r = await call(U.ownerM, 'POST', `/api/v1/bookings/${sc._id}/cancel`);
    check('27b Station owner cannot cancel the customer\'s booking via the customer route → 404', r.code === 404 && bk(sc._id).status === 'PENDING', `${r.code}`);

    // ── IDs ──
    const bad = [];
    for (const [m, p] of [['GET', '/api/v1/bookings/not-a-real-id'], ['POST', '/api/v1/bookings/not-a-real-id/cancel'], ['PATCH', '/api/v1/bookings/not-a-real-id/accept'],
        ['PATCH', '/api/v1/bookings/not-a-real-id/proof'], ['PATCH', '/api/v1/bookings/not-a-real-id/resubmit']]) {
        const x = await call(m.startsWith('PATCH') && p.includes('accept') ? U.staffM : U.ownerA, m, p, p.endsWith('proof') ? PROOF : undefined);
        bad.push(`${x.code}`);
    }
    check('28  Malformed booking ID → 400 "Invalid booking ID" on every route', bad.every((c) => c === '400'), bad.join(','));
    r = await call(U.ownerA, 'POST', '/api/v1/bookings', { campaignId: 'nope', stationId: String(S1), slot: 'X', date: future, time: '09:00', duration: 30 });
    check('28b Malformed campaignId on create → 400, not 500', r.code === 400, `${r.code}`);
    const missing = String(OID());
    r = await call(U.ownerA, 'GET', `/api/v1/bookings/${missing}`);
    const r8 = await act(U.staffM, missing, 'accept');
    check('29  Missing booking → 404', r.code === 404 && r8.code === 404, `${r.code}/${r8.code}`);

    // ── Matrix sanity: no customer path to station statuses ──
    const custTargets = Object.values(BOOKING_STATUS_TRANSITIONS.CUSTOMER).flat();
    check('M1  Customer matrix reaches only CANCELLED / PENDING', custTargets.every((s) => ['CANCELLED', 'PENDING'].includes(s)), custTargets.join(','));
    check('M2  No log line contains a JWT', !logs.some((l) => /eyJ[A-Za-z0-9_-]+\./.test(l)));

    r = await call(null, 'GET', '/health');
    check('H   /health → 200', r.code === 200, `${r.code}`);

    server.close();
    const passed = results.filter(Boolean).length;
    out(`\nN4: ${passed}/${results.length} passed`);
    process.exitCode = passed === results.length ? 0 : 1;
})().catch((e) => { out('HARNESS CRASH ' + e.stack); process.exitCode = 1; });
