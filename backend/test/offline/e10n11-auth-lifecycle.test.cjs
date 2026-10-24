// E10/N11 verification harness — offline. Real app/routes/middleware/models/hooks,
// in-memory store, dummy JWT secret. Passwords/tokens are generated per run and never printed.
process.env.JWT_SECRET = 'e10-harness-dummy-secret';
process.env.JWT_EXPIRE = '5m';
delete process.env.VERCEL;

const path = require('path');
const crypto = require('crypto');
const BACKEND = path.resolve(__dirname, '..', '..'); // backend/ (this file: backend/test/offline/)
const mongoose = require(path.join(BACKEND, 'node_modules', 'mongoose'));
const jwt = require(path.join(BACKEND, 'node_modules', 'jsonwebtoken'));
mongoose.set('bufferCommands', false);

const src = (p) => require(path.join(BACKEND, 'src', p));
const User = src('models/User'), Employee = src('models/Employee'), Company = src('models/Company'), AuditLog = src('models/AuditLog');
const authMailer = src('utils/authMailer');
const limiters = src('middleware/rateLimit');
const resetLimiters = () => ['loginLimiter', 'registerLimiter', 'forgotPasswordLimiter', 'resetPasswordLimiter', 'acceptInviteLimiter', 'changePasswordLimiter'].forEach((k) => limiters[k].reset());

const OID = () => new mongoose.Types.ObjectId();
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const pw = () => 'Aa1!' + crypto.randomBytes(9).toString('base64url');
const A = OID(), B = OID();

// ── In-memory store with real schema validation + real pre-save hooks ──
let db;
const SECRETS = new Set();           // every password / token used this run
const remember = (s) => { if (s) SECRETS.add(String(s)); return s; };
const clone = (o) => mongoose.mongo.BSON.deserialize(mongoose.mongo.BSON.serialize(o), { promoteValues: true });
const getField = (d, k) => k.split('.').reduce((o, p) => (o == null ? undefined : o[p]), d);
const eq = (a, b) => (a == null && b == null) || (a != null && b != null && String(a) === String(b));
const matches = (d, f = {}) => Object.entries(f).every(([k, v]) => {
    const x = getField(d, k);
    if (v && typeof v === 'object' && !(v instanceof mongoose.Types.ObjectId) && !(v instanceof Date) && !Array.isArray(v)) {
        if ('$gt' in v) return x != null && x > v.$gt;
        if ('$in' in v) return v.$in.some((y) => eq(x, y));
        if ('$ne' in v) return !eq(x, v.$ne);
        return true;
    }
    return eq(x, v);
});
const hiddenPaths = (M) => Object.entries(M.schema.paths).filter(([, p]) => p.options && p.options.select === false).map(([k]) => k);
const project = (M, o, sel) => {
    if (!o) return o;
    const parts = (sel || '').split(/\s+/).filter(Boolean);
    const plus = parts.filter((p) => p.startsWith('+')).map((p) => p.slice(1));
    const inc = parts.filter((p) => !p.startsWith('-') && !p.startsWith('+'));
    const exc = parts.filter((p) => p.startsWith('-')).map((p) => p.slice(1));
    let out;
    if (inc.length) { out = { _id: o._id }; inc.forEach((k) => { if (k in o) out[k] = o[k]; }); }
    else { out = { ...o }; exc.forEach((k) => delete out[k]); hiddenPaths(M).forEach((k) => { if (!plus.includes(k)) delete out[k]; }); }
    return out;
};
const runSaveHooks = async (M, d) => { await d.validate(); const r = M.schema.s.hooks.execPre('save', d, [{}]); if (r && r.then) await r; };
const toDoc = (M, c, o) => {
    if (!o) return null;
    const d = M.hydrate(clone(o));
    d.save = async () => {
        await runSaveHooks(M, d);
        const plain = d.toObject({ depopulate: true });
        const i = db[c].findIndex((x) => eq(x._id, plain._id));
        db[c][i] = { ...db[c][i], ...plain };
        return d;
    };
    return d;
};
const q = (M, c, getter) => {
    let sel = null;
    const x = {
        select: (s) => { sel = s; return x; }, populate: () => x, lean: () => x, sort: () => x, limit: () => x, skip: () => x,
        then: (r, j) => Promise.resolve().then(() => {
            const v = getter();
            return Array.isArray(v) ? v.map((o) => toDoc(M, c, project(M, o, sel))) : toDoc(M, c, project(M, v, sel));
        }).then(r, j),
    };
    return x;
};
const applyUpdate = (o, u) => { const set = u.$set || (Object.keys(u).some((k) => k.startsWith('$')) ? {} : u); Object.assign(o, set); };
const fake = (M, c) => {
    M.find = (f) => q(M, c, () => db[c].filter((d) => matches(d, f)));
    M.findOne = (f) => q(M, c, () => db[c].find((d) => matches(d, f)) || null);
    M.findById = (id) => q(M, c, () => db[c].find((d) => eq(d._id, id)) || null);
    M.countDocuments = async (f) => db[c].filter((d) => matches(d, f)).length;
    M.updateOne = async (f, u) => { const o = db[c].find((d) => matches(d, f)); if (o) applyUpdate(o, u); return { matchedCount: o ? 1 : 0, modifiedCount: o ? 1 : 0 }; };
    M.findOneAndUpdate = (f, u) => q(M, c, () => { const o = db[c].find((d) => matches(d, f)); if (!o) return null; const before = { ...o }; applyUpdate(o, u); return before; });
    M.findByIdAndDelete = async (id) => { db[c] = db[c].filter((d) => !eq(d._id, id)); };
    M.create = async (data) => { const d = new M(data); await runSaveHooks(M, d); db[c].push(d.toObject()); return toDoc(M, c, d.toObject()); };
};
fake(User, 'users'); fake(Employee, 'employees'); fake(Company, 'companies');
AuditLog.create = async (data) => { const a = new AuditLog(data); await a.validate(); db.audit.push(a.toObject()); return a; };
AuditLog.find = () => q(AuditLog, 'audit', () => []);

// Capture the reset email instead of sending it.
let mailbox = [];
authMailer.sendPasswordResetEmail = async (msg) => { mailbox.push(msg); remember(msg.token); return true; };

// Capture all console output.
const logs = [];
for (const k of ['log', 'warn', 'error', 'info', 'debug']) console[k] = (...a) => logs.push(a.map((x) => (x instanceof Error ? `${x.message} ${x.stack}` : typeof x === 'string' ? x : (() => { try { return JSON.stringify(x); } catch { return String(x); } })())).join(' '));
const out = (s) => process.stdout.write(s + '\n');

const P = { indiv: remember(pw()), other: remember(pw()), owner: remember(pw()), staff: remember(pw()), admin: remember(pw()) };
const P_LEGACY = P.indiv; // legacy record reuses the original individual hash
const ids = { indiv: OID(), other: OID(), owner: OID(), staff: OID(), admin: OID(), legacy: OID() };
const seed = async () => {
    db = { users: [], employees: [], companies: [], audit: [] };
    mailbox = [];
    const mk = async (id, email, password, accountType, companyId, extra = {}) => {
        const d = new User({ _id: id, email, password, name: email.split('@')[0], accountType, status: 'ACTIVE', companyId, ...extra });
        await runSaveHooks(User, d);
        db.users.push(d.toObject());
    };
    await mk(ids.indiv, 'indiv@example.com', P.indiv, 'INDIVIDUAL', null);
    await mk(ids.other, 'other@example.com', P.other, 'INDIVIDUAL', null);
    await mk(ids.owner, 'owner@example.com', P.owner, 'COMPANY', A);
    await mk(ids.staff, 'staff@example.com', P.staff, 'EMPLOYEE', A);
    await mk(ids.admin, 'admin@example.com', P.admin, 'ADMIN', null);
    // Legacy record: created before this change (no lifecycle fields at all).
    db.users.push({ _id: ids.legacy, email: 'legacy@example.com', name: 'legacy', accountType: 'INDIVIDUAL', status: 'ACTIVE', companyId: null, password: db.users[0].password });
    db.companies.push({ _id: A, name: 'Co A', status: 'APPROVED' }, { _id: B, name: 'Co B', status: 'APPROVED' });
    db.employees.push(
        { _id: OID(), userId: ids.owner, companyId: A, position: 'Company Owner', permissions: ['ALL_ACCESS'], isActive: true, acceptedAt: new Date() },
        { _id: OID(), userId: ids.staff, companyId: A, position: 'HR', permissions: ['TEAM_VIEW'], isActive: true, acceptedAt: new Date() },
    );
};
const user = (id) => db.users.find((u) => eq(u._id, id));
const byEmail = (e) => db.users.find((u) => u.email === e);

const app = src('app');
const legacyTok = (id) => remember(jwt.sign({ id: String(id) }, process.env.JWT_SECRET, { expiresIn: '5m' }));

const results = [];
const check = (label, ok, detail = '') => { results.push(ok); out(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== '' ? '  — ' + detail : ''}`); };

(async () => {
    await seed();
    const server = app.listen(0, '127.0.0.1'); // loopback only
    await new Promise((resolve, reject) => server.once('listening', resolve).once('error', reject)); // address() is null until bound
    const base = `http://127.0.0.1:${server.address().port}`;
    const responses = [];
    const call = async (method, p, { body, token, raw } = {}) => {
        const h = {};
        if (token) h.Authorization = `Bearer ${token}`;
        if (body !== undefined || raw !== undefined) h['Content-Type'] = 'application/json';
        const r = await fetch(base + p, { method, headers: h, body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined });
        const text = await r.text();
        let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
        responses.push({ p, text });
        if (json?.token) remember(json.token);
        return { code: r.status, text, body: json };
    };
    const login = async (email, password) => { const r = await call('POST', '/api/v1/auth/login', { body: { email, password } }); return r; };
    const me = (token) => call('GET', '/api/v1/auth/me', { token });
    const change = (token, currentPassword, newPassword) => call('PATCH', '/api/v1/auth/password', { token, body: { currentPassword, newPassword } });

    // ════════ TOKEN VERSION + PASSWORD CHANGE ════════
    resetLimiters();
    let r = await login('indiv@example.com', P.indiv);
    const t1 = r.body?.token;
    const claims = t1 ? jwt.decode(t1) : {};
    check('T1  Login → 200 with JWT', r.code === 200 && !!t1, `${r.code}`);
    check('T2  JWT payload = { id, tokenVersion: 0, iat, exp } — nothing sensitive', claims.id === String(ids.indiv) && claims.tokenVersion === 0
        && JSON.stringify(Object.keys(claims).sort()) === JSON.stringify(['exp', 'iat', 'id', 'tokenVersion']), Object.keys(claims).join(','));
    check('T3  Login response exposes mustChangePassword:false', r.body?.data?.user?.mustChangePassword === false);
    r = await me(t1);
    check('T4  Protected /auth/me with JWT → 200', r.code === 200, `${r.code}`);
    check('T5  /auth/me hides password, tokenVersion, reset fields', r.code === 200 && !/"password"|tokenVersion|passwordReset/.test(r.text));

    r = await change(t1, 'Wrong-current-1!', pw());
    check('T6  Wrong current password → 400 "Current password is incorrect"', r.code === 400 && r.body?.message === 'Current password is incorrect', `${r.code}`);
    check('T7  Password unchanged after failed change (old password still logs in)', (await login('indiv@example.com', P.indiv)).code === 200);
    check('T8  Existing JWT still valid after failed change', (await me(t1)).code === 200);
    r = await change(t1, P.indiv, 'weakpassword');
    check('T9  Weak new password rejected by the shared registration rule → 400', r.code === 400 && /uppercase|number|special/.test(JSON.stringify(r.body?.errors || [])), JSON.stringify(r.body?.errors));
    check('T9b Validation errors never quote the submitted password', !r.text.includes('weakpassword'));
    const regLog = logs.length;
    r = await call('POST', '/api/v1/auth/register', { body: { accountType: 'individual', email: 'reg@example.com', name: 'Reg', password: 'nouppercase1!' } });
    check('T9c Registration validation: password not echoed in response or logs', r.code === 400 && !r.text.includes('nouppercase1!') && !logs.slice(regLog).join(' ').includes('nouppercase1!'), JSON.stringify(r.body?.errors));
    r = await change(t1, P.indiv, P.indiv);
    check('T10 New password equal to current → 400', r.code === 400 && /different/.test(r.body?.message || ''), `${r.code}`);
    r = await call('PATCH', '/api/v1/auth/password', { body: { currentPassword: P.indiv, newPassword: pw() } });
    check('T11 Change password without JWT → 401', r.code === 401, `${r.code}`);

    const vBefore = user(ids.indiv).tokenVersion;
    const hashBefore = user(ids.indiv).password;
    const newIndiv = remember(pw());
    r = await change(t1, P.indiv, newIndiv);
    check('T12 Correct change → 200, no token/password in response', r.code === 200 && r.body?.success === true && !r.body?.token && !r.text.includes(newIndiv), `${r.code} ${r.body?.message}`);
    check('T13 tokenVersion incremented, passwordChangedAt set, new bcrypt hash stored', user(ids.indiv).tokenVersion === vBefore + 1 && user(ids.indiv).passwordChangedAt instanceof Date
        && user(ids.indiv).password !== hashBefore && user(ids.indiv).password.startsWith('$2') && user(ids.indiv).password !== newIndiv);
    r = await me(t1);
    check('T14 Old JWT (the one used for the change) → 401 generic "Invalid token"', r.code === 401 && r.body?.message === 'Invalid token', `${r.code} ${r.body?.message}`);
    check('T15 Old password no longer logs in → 401', (await login('indiv@example.com', P.indiv)).code === 401);
    r = await login('indiv@example.com', newIndiv);
    const t2 = r.body?.token;
    check('T16 New password logs in → 200, token carries tokenVersion 1', r.code === 200 && jwt.decode(t2 || '')?.tokenVersion === 1, `${r.code}`);
    check('T17 New JWT → protected endpoint 200', (await me(t2)).code === 200);
    const ca = db.audit.find((a) => a.action === 'CHANGE_PASSWORD');
    check('T18 CHANGE_PASSWORD audit written, no metadata/changes payload', !!ca && eq(ca.userId, ids.indiv) && !ca.metadata && !ca.changes);
    P.indiv = newIndiv;

    // Backward compatibility: tokens issued before tokenVersion existed.
    const legacy = legacyTok(ids.legacy);
    check('C1  Pre-existing JWT without tokenVersion claim, user never revoked → 200', (await me(legacy)).code === 200);
    const legacyIndiv = legacyTok(ids.indiv);
    check('C2  Pre-existing JWT without claim for a user whose version moved on → 401', (await me(legacyIndiv)).code === 401);
    const tampered = remember(jwt.sign({ id: String(ids.indiv), tokenVersion: '1' }, process.env.JWT_SECRET, { expiresIn: '5m' }));
    check('C3  tokenVersion of the wrong type ("1" vs 1) → 401', (await me(tampered)).code === 401);
    check('C4  Legacy record (no lifecycle fields) can still log in', (await login('legacy@example.com', P_LEGACY)).code === 200);

    // ════════ PASSWORD RESET ════════
    resetLimiters();
    r = await login('other@example.com', P.other);
    const tOther = r.body?.token;
    mailbox = [];
    const r1 = await call('POST', '/api/v1/auth/forgot-password', { body: { email: 'other@example.com' } });
    const r2 = await call('POST', '/api/v1/auth/forgot-password', { body: { email: 'nobody-here@example.com' } });
    check('R1  Reset request for existing email → 200 generic message', r1.code === 200 && r1.body?.message === 'If an account exists for that email, password reset instructions will be sent.', `${r1.code}`);
    check('R2  Reset request for unknown email → identical status and body', r2.code === r1.code && r2.text === r1.text);
    check('R3  Response never contains the reset token', mailbox.length === 1 && !r1.text.includes(mailbox[0].token));
    const resetTok = mailbox[0]?.token || '';
    check('R4  Token is 32 random bytes (base64url, 43 chars); only for the existing user', /^[A-Za-z0-9_-]{43}$/.test(resetTok) && mailbox[0]?.email === 'other@example.com');
    const ou = user(ids.other);
    const ttl = ou.passwordResetExpiresAt - Date.now();
    check('R5  DB stores SHA-256 of token, never the raw token; expiry ≈ 30 min', ou.passwordResetTokenHash === sha(resetTok) && !JSON.stringify(db).includes(resetTok)
        && ttl > 29 * 60 * 1000 && ttl <= 30 * 60 * 1000, `${Math.round(ttl / 60000)} min`);
    check('R6  REQUEST_PASSWORD_RESET audited for the real user only', db.audit.filter((a) => a.action === 'REQUEST_PASSWORD_RESET').length === 1);
    r = await call('POST', '/api/v1/auth/reset-password', { body: { token: resetTok, password: 'weak' } });
    check('R7  Weak password with valid token → 400 (shared rule), token not consumed', r.code === 400 && user(ids.other).passwordResetTokenHash === sha(resetTok), `${r.code}`);
    r = await call('POST', '/api/v1/auth/reset-password', { body: { token: 'not-a-real-token-at-all', password: pw() } });
    check('R8  Invalid token → 400 "Invalid or expired reset token"', r.code === 400 && r.body?.message === 'Invalid or expired reset token', `${r.code}`);
    const newOther = remember(pw());
    r = await call('POST', '/api/v1/auth/reset-password', { body: { token: resetTok, password: newOther } });
    check('R9  Valid token → 200, no JWT issued', r.code === 200 && !r.body?.token, `${r.code} ${r.body?.message}`);
    check('R10 Old password no longer works', (await login('other@example.com', P.other)).code === 401);
    check('R11 New password works', (await login('other@example.com', newOther)).code === 200);
    check('R12 JWT issued before the reset → 401', (await me(tOther)).code === 401);
    check('R13 Reset fields cleared, tokenVersion +1, passwordChangedAt set', user(ids.other).passwordResetTokenHash === null && user(ids.other).passwordResetExpiresAt === null
        && user(ids.other).tokenVersion === 1 && user(ids.other).passwordChangedAt instanceof Date);
    r = await call('POST', '/api/v1/auth/reset-password', { body: { token: resetTok, password: remember(pw()) } });
    check('R14 Same token again → 400 (single use)', r.code === 400 && (await login('other@example.com', newOther)).code === 200, `${r.code}`);
    check('R15 RESET_PASSWORD audited', db.audit.some((a) => a.action === 'RESET_PASSWORD' && eq(a.userId, ids.other)));
    // expired token
    mailbox = [];
    await call('POST', '/api/v1/auth/forgot-password', { body: { email: 'other@example.com' } });
    const expTok = mailbox[0]?.token;
    user(ids.other).passwordResetExpiresAt = new Date(Date.now() - 1000);
    r = await call('POST', '/api/v1/auth/reset-password', { body: { token: expTok, password: remember(pw()) } });
    check('R16 Expired token → 400, password unchanged', r.code === 400 && (await login('other@example.com', newOther)).code === 200, `${r.code}`);
    // a password change voids an outstanding reset link
    mailbox = [];
    await call('POST', '/api/v1/auth/forgot-password', { body: { email: 'other@example.com' } });
    const pendTok = mailbox[0]?.token;
    const tO2 = (await login('other@example.com', newOther)).body?.token;
    const newOther2 = remember(pw());
    await change(tO2, newOther, newOther2);
    r = await call('POST', '/api/v1/auth/reset-password', { body: { token: pendTok, password: remember(pw()) } });
    check('R17 Outstanding reset token is void after a password change', r.code === 400 && (await login('other@example.com', newOther2)).code === 200, `${r.code}`);

    // ════════ ADMIN RESET / TEMPORARY PASSWORD ════════
    resetLimiters();
    const adminTok = (await login('admin@example.com', P.admin)).body?.token;
    const indivTok = (await login('indiv@example.com', P.indiv)).body?.token;
    const vI = user(ids.indiv).tokenVersion;
    const logMark = logs.length;
    r = await call('POST', `/api/v1/admin/individuals/${ids.indiv}/reset`, { token: adminTok });
    const temp = remember(r.body?.data?.temporaryPassword);
    check('A1  Admin reset → 200, one-time temporaryPassword returned to the admin, mustChangePassword:true', r.code === 200 && typeof temp === 'string' && temp.length >= 12 && r.body?.data?.mustChangePassword === true, `${r.code}`);
    check('A2  Stored as bcrypt hash; mustChangePassword true; tokenVersion +1; passwordChangedAt set', user(ids.indiv).password.startsWith('$2') && user(ids.indiv).password !== temp
        && user(ids.indiv).mustChangePassword === true && user(ids.indiv).tokenVersion === vI + 1 && user(ids.indiv).passwordChangedAt instanceof Date);
    check('A3  Individual\'s JWT from before the reset → 401', (await me(indivTok)).code === 401);
    check('A4  Temporary password never logged; audit stores only "RESET"', !logs.slice(logMark).join('\n').includes(temp) && !JSON.stringify(db.audit).includes(temp)
        && db.audit.some((a) => a.action === 'UPDATE_USER' && a.changes?.password === 'RESET'));
    r = await login('indiv@example.com', temp);
    const tTemp = r.body?.token;
    check('A5  Login with temporary password → 200 with mustChangePassword:true', r.code === 200 && r.body?.data?.user?.mustChangePassword === true, `${r.code}`);
    check('A6  Password-change endpoint usable while mustChangePassword is set', (await me(tTemp)).code === 200);
    const vT = user(ids.indiv).tokenVersion;
    const finalIndiv = remember(pw());
    r = await change(tTemp, temp, finalIndiv);
    check('A7  Changing the temporary password → 200, mustChangePassword cleared', r.code === 200 && user(ids.indiv).mustChangePassword === false, `${r.code}`);
    check('A8  ...and tokenVersion incremented again (temp-session JWT revoked)', user(ids.indiv).tokenVersion === vT + 1 && (await me(tTemp)).code === 401);
    r = await login('indiv@example.com', temp);
    check('A9  Temporary password no longer works (not a permanent credential)', r.code === 401, `${r.code}`);
    r = await login('indiv@example.com', finalIndiv);
    check('A10 Chosen password works, mustChangePassword:false', r.code === 200 && r.body?.data?.user?.mustChangePassword === false, `${r.code}`);
    mailbox = [];
    await call('POST', `/api/v1/admin/individuals/${ids.indiv}/reset`, { token: adminTok });
    const temp2 = remember(user(ids.indiv) && (responses[responses.length - 1].text.match(/"temporaryPassword":"([^"]+)"/) || [])[1]);
    await call('POST', '/api/v1/auth/forgot-password', { body: { email: 'indiv@example.com' } });
    const rt = mailbox[0]?.token;
    await call('POST', '/api/v1/auth/reset-password', { body: { token: rt, password: remember(pw()) } });
    check('A11 Self-service reset also clears mustChangePassword', user(ids.indiv).mustChangePassword === false && !!temp2);

    // ════════ EMPLOYEE INVITATIONS ════════
    resetLimiters();
    const ownerTok = (await login('owner@example.com', P.owner)).body?.token;
    const staffTok = (await login('staff@example.com', P.staff)).body?.token;
    const counts = () => `${db.users.length}/${db.employees.length}`;
    let before = counts();
    r = await call('POST', '/api/v1/company/team/invite', { token: ownerTok, body: { email: 'hire@example.com', name: 'New Hire', password: remember(pw()) } });
    check('I1  Owner cannot set the employee password → 400, nothing created', r.code === 400 && /chooses? their own password/.test(r.body?.message || '') && counts() === before, `${r.code}`);
    r = await call('POST', '/api/v1/company/team/invite', { token: staffTok, body: { email: 'hire@example.com', name: 'New Hire' } });
    check('I2  Non-owner employee cannot invite → 403', r.code === 403, `${r.code}`);
    r = await call('POST', '/api/v1/company/team/invite', { token: ownerTok, body: { email: 'hire@example.com', name: 'New Hire', position: 'Media Buyer', permissions: ['CAMPAIGN_VIEW', 'TEAM_VIEW'], companyId: String(B) } });
    const invTok = remember(r.body?.data?.invitation?.token);
    const hire = byEmail('hire@example.com');
    const hireEmp = hire && db.employees.find((e) => eq(e.userId, hire._id));
    check('I3  Owner invite → 201 with one-time invitation token', r.code === 201 && /^[A-Za-z0-9_-]{43}$/.test(invTok || '') && r.body?.data?.invitationPending === true, `${r.code}`);
    check('I4  User created PENDING with no password; companyId from server (A, not body B)', hire?.status === 'PENDING' && !hire?.password && hire?.accountType === 'EMPLOYEE' && eq(hire?.companyId, A));
    const ittl = hireEmp?.inviteExpiresAt - Date.now();
    check('I5  Employee stores SHA-256 of token only; acceptedAt null; expiry ≈ 7 days', hireEmp?.inviteTokenHash === sha(invTok) && !JSON.stringify(db).includes(invTok) && hireEmp?.acceptedAt == null
        && ittl > 6.99 * 864e5 && ittl <= 7 * 864e5, `${(ittl / 864e5).toFixed(2)} d`);
    check('I6  Position/permissions/inviter/INVITE_EMPLOYEE audit preserved; audit has no token', hireEmp?.position === 'Media Buyer' && hireEmp?.permissions.join() === 'CAMPAIGN_VIEW,TEAM_VIEW'
        && eq(hireEmp?.invitedBy, ids.owner) && db.audit.some((a) => a.action === 'INVITE_EMPLOYEE' && a.metadata?.email === 'hire@example.com') && !JSON.stringify(db.audit).includes(invTok));
    check('I7  Invitee cannot sign in before accepting → 401', (await login('hire@example.com', 'Anything-1!')).code === 401);
    r = await call('GET', '/api/v1/company/team', { token: ownerTok });
    check('I8  Team list never exposes an invitation hash value', r.code === 200 && !/"inviteTokenHash":"/.test(r.text) && !r.text.includes(sha(invTok)), `${r.code}`);
    r = await call('POST', '/api/v1/auth/invite/accept', { body: { token: invTok, password: 'weak' } });
    check('I9  Weak password on accept → 400 (shared rule), invitation not consumed', r.code === 400 && db.employees.find((e) => eq(e.userId, hire._id)).inviteTokenHash === sha(invTok), `${r.code}`);
    r = await call('POST', '/api/v1/auth/invite/accept', { body: { token: 'bogus-token', password: remember(pw()) } });
    check('I10 Invalid invitation token → 400 "Invalid or expired invitation"', r.code === 400 && r.body?.message === 'Invalid or expired invitation', `${r.code}`);
    const hirePw = remember(pw());
    r = await call('POST', '/api/v1/auth/invite/accept', {
        body: { token: invTok, name: 'Ada Hire', password: hirePw, companyId: String(B), permissions: ['ALL_ACCESS'], accountType: 'ADMIN', position: 'Company Owner', status: 'ACTIVE' },
    });
    const hireAfter = byEmail('hire@example.com');
    const empAfter = db.employees.find((e) => eq(e.userId, hireAfter._id));
    check('I11 Employee accepts with own password → 200, no JWT issued', r.code === 200 && !r.body?.token, `${r.code} ${r.body?.message}`);
    check('I12 companyId/permissions/accountType/position NOT changeable via accept input', eq(hireAfter.companyId, A) && hireAfter.accountType === 'EMPLOYEE' && empAfter.permissions.join() === 'CAMPAIGN_VIEW,TEAM_VIEW'
        && empAfter.position === 'Media Buyer' && eq(empAfter.companyId, A));
    check('I13 User ACTIVE with own bcrypt hash and chosen name; invitation cleared + acceptedAt set', hireAfter.status === 'ACTIVE' && hireAfter.password.startsWith('$2') && hireAfter.name === 'Ada Hire'
        && empAfter.inviteTokenHash === null && empAfter.acceptedAt instanceof Date && db.audit.some((a) => a.action === 'ACCEPT_EMPLOYEE_INVITE'));
    r = await login('hire@example.com', hirePw);
    const hireTok = r.body?.token;
    check('I14 Employee logs in with the password they chose', r.code === 200 && r.body?.data?.user?.mustChangePassword === false, `${r.code}`);
    r = await call('GET', '/api/v1/company/team', { token: hireTok });
    check('I15 ...and their invited permission (TEAM_VIEW) works on company routes', r.code === 200, `${r.code}`);
    r = await call('POST', '/api/v1/auth/invite/accept', { body: { token: invTok, password: remember(pw()) } });
    check('I16 Used invitation → 400 and password unchanged', r.code === 400 && (await login('hire@example.com', hirePw)).code === 200, `${r.code}`);
    // expired invitation
    resetLimiters();
    r = await call('POST', '/api/v1/company/team/invite', { token: ownerTok, body: { email: 'late@example.com', name: 'Late' } });
    const lateTok = remember(r.body?.data?.invitation?.token);
    db.employees.find((e) => eq(e.userId, byEmail('late@example.com')._id)).inviteExpiresAt = new Date(Date.now() - 1000);
    r = await call('POST', '/api/v1/auth/invite/accept', { body: { token: lateTok, password: remember(pw()) } });
    check('I17 Expired invitation → 400, account stays PENDING', r.code === 400 && byEmail('late@example.com').status === 'PENDING', `${r.code}`);
    // resend replaces the token
    r = await call('POST', '/api/v1/company/team/invite', { token: ownerTok, body: { email: 'late@example.com', name: 'Late' } });
    const lateTok2 = remember(r.body?.data?.invitation?.token);
    check('I18 Re-inviting a pending invitee → 200 with a fresh token', r.code === 200 && lateTok2 && lateTok2 !== lateTok, `${r.code}`);
    r = await call('POST', '/api/v1/auth/invite/accept', { body: { token: lateTok, password: remember(pw()) } });
    check('I19 Previous token no longer works after resend', r.code === 400, `${r.code}`);
    // removed before accepting
    await call('DELETE', `/api/v1/company/team/${db.employees.find((e) => eq(e.userId, byEmail('late@example.com')._id))._id}`, { token: ownerTok });
    r = await call('POST', '/api/v1/auth/invite/accept', { body: { token: lateTok2, password: remember(pw()) } });
    check('I20 Invitation of a member removed before accepting → 400', r.code === 400 && byEmail('late@example.com').status !== 'ACTIVE', `${r.code}`);
    r = await call('POST', '/api/v1/company/team/invite', { token: ownerTok, body: { email: 'hire@example.com', name: 'x' } });
    check('I21 Re-inviting an already-accepted member → 409 (no token issued)', r.code === 409 && !r.body?.data?.invitation, `${r.code}`);

    // ════════ SECURITY / D8 ════════
    const allLogs = logs.join('\n');
    const allAudit = JSON.stringify(db.audit);
    const leakedInLogs = [...SECRETS].filter((s) => s && allLogs.includes(s));
    check('S1  No password / JWT / reset token / invite token / temp password in logs', leakedInLogs.length === 0, `${SECRETS.size} secrets checked, ${leakedInLogs.length} found`);
    check('S2  No bcrypt hash, token hash, Authorization header or "Bearer" in logs', !/\$2[aby]\$|Bearer |authorization/i.test(allLogs)
        && !db.users.some((u) => u.passwordResetTokenHash && allLogs.includes(u.passwordResetTokenHash)));
    check('S3  No secret in any audit entry', [...SECRETS].every((s) => !allAudit.includes(s)) && !/\$2[aby]\$/.test(allAudit));
    const respText = responses.map((x) => x.text).join('\n');
    check('S4  No bcrypt hash or stored token hash in any API response', !/\$2[aby]\$/.test(respText) && !/"(passwordResetTokenHash|inviteTokenHash)":"/.test(respText) && !db.employees.concat(db.users).some((d) => [d.inviteTokenHash, d.passwordResetTokenHash].some((h) => h && respText.includes(h))));
    r = await call('POST', '/api/v1/auth/reset-password', { raw: `{"token":"x","password":${P.admin}}` });
    check('S5  Malformed JSON → 400 "Invalid JSON in request body", body not echoed', r.code === 400 && r.body?.message === 'Invalid JSON in request body' && !r.text.includes(P.admin), `${r.code}`);
    resetLimiters();
    const lc = []; for (let i = 0; i < 11; i++) lc.push((await login('nobody@example.com', 'Wrong-pass-1!')).code);
    check('S6  D8 login limiter intact: 10×401 then 429', lc.slice(0, 10).every((c) => c === 401) && lc[10] === 429, lc.join(','));
    const fc = []; for (let i = 0; i < 6; i++) fc.push((await call('POST', '/api/v1/auth/forgot-password', { body: { email: `x${i}@example.com` } })).code);
    check('S7  Forgot-password limited: 5×200 then 429', fc.slice(0, 5).every((c) => c === 200) && fc[5] === 429, fc.join(','));
    const rc = []; for (let i = 0; i < 11; i++) rc.push((await call('POST', '/api/v1/auth/reset-password', { body: { token: 'bad' + i, password: 'Aa1!aaaaaa' } })).code);
    check('S8  Reset-password limited: 10 failures then 429', rc.slice(0, 10).every((c) => c === 400) && rc[10] === 429, rc.join(','));
    const ac = []; for (let i = 0; i < 11; i++) ac.push((await call('POST', '/api/v1/auth/invite/accept', { body: { token: 'bad' + i, password: 'Aa1!aaaaaa' } })).code);
    check('S9  Invite-accept limited: 10 failures then 429', ac.slice(0, 10).every((c) => c === 400) && ac[10] === 429, ac.join(','));
    r = await call('GET', '/health');
    check('S10 /health → 200 while auth limiters are tripped', r.code === 200 && r.body?.status === 'OK', `${r.code}`);
    check('S11 Existing users kept and still bcrypt-hashed (no wipe, no plaintext)', ['indiv', 'other', 'owner', 'staff', 'admin', 'legacy'].every((k) => user(ids[k])?.password?.startsWith('$2')));

    server.close();
    const passed = results.filter(Boolean).length;
    out(`\nE10/N11: ${passed}/${results.length} passed`);
    process.exitCode = passed === results.length ? 0 : 1;
})().catch((e) => { out('HARNESS CRASH ' + e.stack); process.exitCode = 1; });
