# MEDIA MASTERS — BACKEND AUDIT REPORT

**Project:** Media Masters (Nigerian media booking & campaign management SaaS)
**Scope audited:** `backend/` — Node.js + Express 5 + MongoDB/Mongoose 9, JavaScript/CommonJS, JWT auth, bcryptjs, REST API mounted at `/api/v1`. Frontend contract checks where they touch the API.
**Audit type:** Read-only. **No files were created, modified or deleted during the audit.** Nothing was executed against the database.
**Method:** All route files, middleware, models, controllers, validators, scripts and config files were read directly from source. Findings were cross-verified line-by-line; every CONFIRMED item cites the exact file, line and function. Two parallel sub-audits were run over distinct subsystems and their claims were re-verified against the code before inclusion.

---

## 0. How to read this report

- **CONFIRMED** — proven by code read at the cited line.
- **POTENTIAL** — plausible risk that needs a runtime check or a design decision.
- Every finding cites `file:line` + function name.
- Severity scale: **CRITICAL** (blocking/security/data-integrity), **HIGH**, **MEDIUM**, **LOW**.

---

## Table of contents

- A. Architecture Summary
- B. What's Working
- 1. Project Structure Audit
- 2. Authentication Audit
- 3. Company Authorization Audit
- 4. Company Registration + Admin Approval
- 5. User Management Audit
- 6. Admin Authorization Audit
- 7. Company Team / Employee Audit
- 8. Campaign Audit + Campaign Status Audit
- 9. Booking Audit
- 10. Station Audit
- 11. Creative / File Audit
- 12. Dashboard Audit + Statistics Audit
- 13. Activity / Audit Log Audit + Action Consistency
- 14. API Response Audit
- 15. Error Handling Audit
- 16. Validation Audit
- 17. Database Relationship Audit
- 18. Multi-Tenancy / Data Isolation Audit
- 19. Security Audit
- 20. Performance Audit
- 21. Transaction / Data Consistency Audit
- 22. Environment / Configuration Audit
- 23. Route Inventory
- 24. Model Inventory
- Final Report: A Architecture Summary · B What's Working · C Critical Problems · D High Priority Problems · E Medium/Low Priority Problems · F Security Findings · G Data Integrity Findings · H API Contract Findings · I Performance Findings · J Missing Features · K Recommended Fix Order · L Backend Readiness Assessment

---

## A. Architecture Summary

```text
media-masters-main/
├── backend/
│   ├── server.js                     # dotenv → mongoose.connect → app.listen (skipped when VERCEL=1)
│   ├── .env                          # PORT, NODE_ENV, MONGODB_URI, JWT_SECRET, JWT_EXPIRE, FRONTEND_URL
│   ├── package.json                  # express 5, mongoose 9, jsonwebtoken, bcryptjs, joi, cors, helmet(unused), dotenv
│   └── src/
│       ├── app.js                    # express app, hardcoded CORS allow-list, json/urlencoded, /api/v1, /health, 404, error handler
│       ├── routes/
│       │   ├── index.js              # mounts auth, company, campaigns, bookings, stations, settings, creatives, employees, admin, departments
│       │   └── v1/                   # 10 route files (99 endpoints total)
│       ├── controllers/              # 11 controllers (admin.controller.js = 5,219 lines / 45 handlers)
│       ├── models/                   # 12 models: User, Admin, Company, Employee, Department, AuditLog, Campaign, Booking, Station, Creative, Payment, Schedule
│       ├── middleware/               # auth.js (protect), role.js (requireCompany, requireCompanyOwner*, requirePermission*, requireAdmin) *unused
│       ├── validators/               # auth.validator.js ONLY (Joi)
│       ├── utils/                    # permissions.js (permission catalogue + templates)
│       └── scripts/                  # createAdmin.js (hardcoded admin credentials)
├── frontend/                         # Next.js app; token in localStorage; lib/api.js + per-page fetch calls
└── vercel.json                       # frontend+backend services, /api/v1 and /health rewritten to backend
```

**Request flow:** `JWT → protect (loads fresh User, checks status ACTIVE) → route-level guard (requireAdmin | requireCompany[+company APPROVED]) → controller (companyId from req.user, never from body) → Mongoose → { success, message, data } JSON.`

**Key structural facts**

- All company resources are resolved through `req.user.companyId` — **there is no `companyId` accepted from request bodies/params anywhere in company-scoped controllers** (verified across campaigns, bookings, creatives, departments, employees, settings, team).
- Two different `requireCompany` implementations exist: `middleware/role.js:6-86` (used by campaigns, bookings, creatives, employees, departments, settings) and an inline duplicate in `routes/v1/company.routes.js:22-113` (used only by `/company/*`).
- `requirePermission` (`role.js:127-166`) and `requireCompanyOwner` (`role.js:90-123`) are exported but **imported nowhere** (repo-wide search returns only the definitions).
- Payment gateway (`Payment` model, `PAYMENT_PENDING`/`PAYMENT_SUCCESSFUL` statuses) and station accounts (`accountType: 'STATION'`) exist in schemas but have **no implementation path**.

## B. What's Working

| Area | Evidence |
|---|---|
| Password hashing | `User.js:72-82` pre-save bcrypt(10); `comparePassword` `User.js:85-91`; `toJSON` strips password `User.js:94-98` |
| JWT issue/verify + expiry | `auth.controller.js:8-12`, `middleware/auth.js:27-30`, 401 for invalid/expired `auth.js:85-100` |
| Fresh-user check on every request | `auth.js:35-43` + `status !== 'ACTIVE'` block `auth.js:48-67`; deleted users → 401 (stale JWT cannot be reused) |
| Company status gating | `role.js:43-72` and `company.routes.js:63-95` block PENDING/REJECTED/SUSPENDED companies; message per status |
| Company data scoping | Every campaign/booking/creative-list/department/employee/settings query is filtered by `companyId: req.user.companyId` (e.g. `campaign.controller.js:50-53,170-173,251-254,369-372`; `booking.controller.js:162-165,481-484,590-593`) |
| Booking ownership on create | Campaign must belong to caller's company `booking.controller.js:298-301`; station must be APPROVED + active `booking.controller.js:323-337` |
| Booking status transitions | Explicit transition map `booking.controller.js:497-534` + cancel rules `booking.controller.js:602-608` |
| Campaign creation & deletion rules | Forced `DRAFT` `campaign.controller.js:130`; delete limited to DRAFT/CANCELLED + cascade `campaign.controller.js:263-281` |
| Company dashboard uses real DB data | `company.controller.js:77-352` — all 14 queries are Promise.all'd, company-scoped, no hardcoded numbers (see Dashboard section for correctness caveats) |
| Audit fields exist and are indexed | `AuditLog.js:204-225`; company activity is company-scoped `company.controller.js:308-316` |
| Directory scoping consistency | `Employee.findOne({_id, companyId})` pattern used in team/department/employee controllers |
| Vercel deploy shape | `server.js:15-19` skips `listen` on Vercel; `module.exports = app`; root `vercel.json` rewrites |

---

## 1. Project Structure Audit (§5 of the audit brief)

- **Entry point:** `backend/server.js`
- **Express app setup:** `backend/src/app.js`
- **Database connection:** `server.js:8-10` (`mongoose.connect(process.env.MONGODB_URI)`, no retry, no pool options)
- **Environment configuration:** `backend/.env` loaded by dotenv in both `server.js:1` and `app.js:5` (double load, harmless)
- **Routes:** `src/routes/index.js` + `src/routes/v1/*.js` (10 files)
- **Controllers:** `src/controllers/*.js` (11 files; `admin.controller.js` = 5,219 lines)
- **Models:** `src/models/*.js` (12 files)
- **Middleware:** `src/middleware/auth.js` (protect), `src/middleware/role.js` (requireCompany, requireCompanyOwner, requirePermission, requireAdmin)
- **Validators:** `src/validators/auth.validator.js` — **the only validator file in the project**
- **Utilities/helpers:** `src/utils/permissions.js`; local helpers inside controllers (`admin.controller.js:18-170`, `booking.controller.js:12-63`)
- **Services:** **none** — business logic lives entirely in controllers
- **Upload/file handling:** **none** — no multer, no static directory, no cloud SDK (see Creative section)
- **Authentication:** JWT bearer (`middleware/auth.js`), issued in `auth.controller.js:8-12`
- **Authorization:** `requireAdmin` (`role.js:170-205`), `requireCompany` (`role.js:6-86`), unused owner/permission guards (`role.js:90-166`)
- **Audit logging:** inline `AuditLog.create` in every controller + convenience helpers `admin.controller.js:164-170` (adds IP/user-agent) and `booking.controller.js:42-63` (swallows failures)
- **Error handling:** per-controller try/catch + single global handler `app.js:60-66`

---

## 2. Authentication Audit (§6)

Trace verified: `register → User.create (pre-save hash) → JWT → login (comparePassword) → protect → req.user`.

**CONFIRMED issues**

1. **Registration does not use the validated body.** `validateRegister` writes `req.validatedBody` (`auth.validator.js:88-103`) but `register` reads `req.body` (`auth.controller.js:27`). Validation still gates entry, but lowercasing/trimming/stripUnknown results are discarded (email is re-lowercased by the schema, so impact is LOW).
2. **Company registration issues an unusable JWT.** `auth.controller.js:142-171` returns a token for a `PENDING` user; `protect` then rejects it (`auth.js:48-53`). Cosmetic/confusing, not a bypass.
3. **No token revocation.** `logout` (`auth.controller.js:289-310`) only writes an audit log; the JWT stays valid for `JWT_EXPIRE` (7d). No refresh tokens, no denylist, no `passwordChangedAt`.
4. **`STATION` account type is unreachable.** `User.js:29` allows `'STATION'`, but `auth.validator.js:5-11` only accepts `individual|company` and no code creates a STATION user (repo-wide search: only the enum). Station owners cannot log in — see Station section.
5. **No login rate limiting** (no `express-rate-limit` in `package.json`; `app.js` has no limiter) → brute-force/stuffing exposure.
6. **No email verification / forgot-password.** `emailVerified` is only ever written as `null` (`admin.controller.js:418`); password reset is admin-only (`admin.controller.js:3877-3921`).
7. Token is stored in `localStorage` by the frontend (`frontend/src/app/login/page.jsx:175-176`) — XSS-exfiltratable; flagged as a security concern (see Security section).
8. **`createAdmin.js` ships hardcoded credentials** `[REDACTED]` / `[REDACTED]` (`src/scripts/createAdmin.js:14-15`) and prints them. **These credentials have been exposed and must be rotated** (values redacted from this report).

**Account-type matrix:** INDIVIDUAL ✅ (register/login/me; no company routes), COMPANY ✅ (PENDING until admin approves; then full company routes), EMPLOYEE ✅ (login works; company gate passes; but *no* per-employee permission enforcement), ADMIN ✅ (login + `requireAdmin`), STATION ❌ (cannot be created/logged in).

## 3. Company Authorization Audit (§7)

Flow verified: `JWT → protect → req.user → requireCompany → companyId → Company.findById → status APPROVED → controller`.

- `companyId` is created at registration (`auth.controller.js:105`) and returned on login (`auth.controller.js:237`) — it is **never** taken from the client.
- `protect` re-loads the user each request, so `companyId`/`status` are never stale.
- Employees are linked by `User.companyId` + an `Employee` row (`Employee.js:4-14`, `userId` unique → one company per user ✔).
- Suspended/pending/rejected companies are blocked with correct messages (`role.js:53-72`).
- **CONFIRMED gap:** neither `requireCompany` implementation consults `Employee.isActive`. A soft-removed worker (`company.controller.js:692-698` sets `Employee.isActive=false` + `User.status='DEACTIVATED'`) is blocked by `protect` **only until someone flips the User back to ACTIVE** — which the admin user-activate endpoint does without looking at the Employee row (`admin.controller.js:3159-3190`). Then the removed employee regains full company access.
- **CONFIRMED gap:** `requireCompanyOwner` exists but is used on zero routes → owners and employees have identical power (see Team section).
- **CONFIRMED duplication:** `company.routes.js:22-113` re-implements `requireCompany` and additionally replaces `req.user` with a 3-field projection (`_id, accountType, status, companyId`) — divergence risk from `role.js:6-86`.

---

## 4. Company Registration + Admin Approval (§8)

- Self-registration: `auth.controller.js:67-130` creates `Company(PENDING) → User(COMPANY, PENDING) → Employee('Company Owner', ALL_ACCESS)` — **not wrapped in a transaction**; if `Employee.create` throws, Company+User remain (orphan owner-less company).
- Admin approval reconciles both records: `updateCompanyVerification` (`admin.controller.js:781-886`) sets `company.status` and `companyUser.status` (APPROVED→ACTIVE, PENDING→PENDING, REJECTED→DEACTIVATED). Other employees' User rows are untouched (company gate covers them).
- **CONFIRMED:** `admin.createCompany` (`admin.controller.js:309-450`) creates Company+User **but no owner Employee row** (self-registration does). Result: admin-created companies have no `'Company Owner'` Employee → they disappear from `getTeam` (`company.controller.js:528-531` filters `isActive:true` employees), `requireCompanyOwner` would deny the real owner, and admin worker lists omit the owner. Rollback on user-create failure only deletes the Company (`421-426`) — good as far as it goes.
- **CONFIRMED:** `reactivateCompany` (`admin.controller.js:981-1054`) unconditionally sets `APPROVED` + owner `ACTIVE` (even a REJECTED company), auditing `from: 'SUSPENDED'` regardless (`1021-1030`).
- Suspend (`907-975`) and verification changes write two documents with no transaction — partial failure leaves Company and User disagreeing.
- Company deletion: no `DELETE /admin/companies` route exists → `DELETE_COMPANY` audit action is dead (companies can only be suspended).
- **No orphan cleanup** anywhere: deleting/removing users never touches Campaign/Booking/Creative/Payment/AuditLog (`admin.controller.js:3769-3773` individual delete; `5040-5090` campaign delete cascade).

---

## 5. User Management Audit (§9)

- `User` model (`User.js`) has no `phone` field, **but the admin worker update writes `user.phone`** (`admin.controller.js:1571-1588`) and later requests `'phone'` in the populate projection (`1809`) → worker phone can never be persisted or returned (silently dropped by Mongoose strict mode), while the audit `changes` object (`1581-1584`) records a change that never happened. CONFIRMED (Low/Medium).
- Account-status sets are consistent with `protect` (`ACTIVE|PENDING|SUSPENDED|DEACTIVATED`).
- Admin user suspend/activate (`admin.controller.js:3146-3212`) can target **any** user incl. another ADMIN; it ignores the linked Employee row and the company status (see Company Authorization section).
- `accountType`/`companyId` cannot be changed by the user via any self-service route (there is no profile route). They *can* be changed by another user via the invite endpoint — see Critical C1.
- Deleted users lose access immediately (protect → 401) ✔; deactivated users blocked at `auth.js:48` ✔.

## 6. Admin Authorization Audit (§10)

- Every `/api/v1/admin/*` route passes `protect` + `requireAdmin` (`admin.routes.js:89-90`); `requireAdmin` re-reads the DB and requires `accountType==='ADMIN' && status==='ACTIVE'` (`role.js:170-205`) ✔.
- The `Admin` model (`Admin.js`, permission list, `isActive`) is **never used for authorization** — only `createAdmin.js` writes it. All admins implicitly hold all permissions.
- All 45 `admin.controller` exports are routed, and all route imports exist (verified 1:1). 48 admin routes total.
- No IDOR found on admin routes (they are admin-only by design; ObjectIds validated via `isValidObjectId` in the helpers `admin.controller.js:18-19, 84-138`).
- **CONFIRMED:** `station.controller` admin endpoints duplicate `admin.controller` station endpoints with different semantics — `PATCH /api/v1/stations/:id/approve` (routed at `station.routes.js:25`) sets a non-existent `status` field and does **not** change `approvalStatus`.

---

## 7. Company Team / Employee Audit (§11)

- Relationships: `Employee.userId (unique) + Employee.companyId` → User → Company ✔.
- `getTeam` (`company.controller.js:517-550`), `removeTeamMember` (`666-724`), `updateTeamMemberRole` (`727-781`) are all company-scoped.
- **CONFIRMED privilege escalation:** `updateTeamMemberRole` has no permission/owner check and no validation of `position`/`permissions`:

```js
// company.controller.js:745-751
if (position)   { employee.position = position; }
if (permissions){ employee.permissions = permissions; }
```

Any employee can set their own `position = 'Company Owner'`, change the real owner's position/permissions, then delete the owner (`removeTeamMember` only blocks deleting a *current* 'Company Owner', `684-689`).
- **CONFIRMED:** `requirePermission`/`requireCompanyOwner` unused → `employee.permissions` is decorative. `employee.controller.js` validates permission strings (`76-83`) but `company.controller.js:749-751` does not.
- **CONFIRMED:** removed workers can never be re-invited: `inviteTeamMember` rejects if an Employee row exists at all (`company.controller.js:583-593`), and removal only soft-deletes (`692-698`) → permanent dead end; the only recovery is admin DB surgery.
- `Employee.isActive` is written (deactivate/activate in `employee.controller.js:165-172, 225-231`) and User status is synced ✔ — but not part of the access check.

---

## 8. Campaign Audit (§12) + Campaign Status Audit (§13)

- Routes: `protect + requireCompany` on all six campaign routes (`campaign.routes.js:16-25`).
- Model enum contains **20 statuses** (`Campaign.js:22-43`); controllers use the same 20-value list in `campaign.controller.js:328-349` and `admin.controller.js:4832-4853`.
- **CONFIRMED: no transition validation at all.** `updateCampaignStatus` accepts any of the 20 (`campaign.controller.js:357-385`). A company user can move `DRAFT → LIVE`, `→ COMPLETED`, `→ REFUNDED`, or self-assert `PAYMENT_SUCCESSFUL` with no payment. Compare bookings, which do have a transition map (`booking.controller.js:497-534`).
- **CONFIRMED: a second, unguarded status path.** `updateCampaign` allow-list includes `status` (`campaign.controller.js:184-193`) → `PUT /campaigns/:id` can set any enum value without even the 20-status check.
- Referenced-but-never-implemented workflow statuses: `PAYMENT_PENDING/SUCCESSFUL`, `BOOKING_REQUESTS_SENT`, `MEDIA_REVIEW`, `CREATIVE_APPROVED`, `SCHEDULED`, `PROOF_UPLOADED`, `COMPANY_REVIEW` — nothing sets them except client requests. The "simplified" workflow is **not** implemented; the 20-status model is, without rules.
- Company scoping correct on every campaign query (verified). `deleteCampaign` cascades bookings+creatives with no transaction (`campaign.controller.js:271-281`).
- `totalReach`, `engagement`, `progress` (`Campaign.js:78-91`) are **never written by any code** (grep: only read in the dashboard) → reach/engagement always 0.
- `createCampaign` rejects `budget: 0` (`campaign.controller.js:113`) and provides an `objective` default; `objective` has no enum in the schema (`Campaign.js:15-19`).

## 9. Booking Audit (§14)

- Company scoping correct on list/get/status/cancel (`booking.controller.js:81-83, 162-165, 481-484, 590-593`); campaign ownership validated on create (`298-301`).
- **CONFIRMED: pricing is client-supplied.** `createBooking` destructures `price, currency` from `req.body` (`booking.controller.js:205-214`), only checks `price >= 0` (`261-271`) and stores it (`424`). `Station.pricing.amount/currency/unit` (`Station.js:158-185`) is never consulted, `Schedule` is never imported anywhere, and `station.inventoryStatus` is never updated by booking activity. Any company user can book a station for ₦0 and that value flows into dashboard "spend".
- **CONFIRMED:** overlap detection is read-then-write (`355-372`) with no unique constraint/transaction → concurrent requests can double-book a slot (POTENTIAL race, CONFIRMED absence of protection).
- **CONFIRMED:** no station-side actor exists. `stationResponse`, `stationNote`, `proofUrl`, `proofUploadedAt`, `proofVerified` (`Booking.js:86-109`) are written/read by **no controller** (grep) — the platform-company itself performs ACCEPTED/SCHEDULED/COMPLETED transitions (`booking.controller.js:497-522`). Proof-of-run upload is not implemented.
- Allowed transitions are otherwise sane; `CANCELLED/REJECTED/COMPLETED` are terminal; cancel only from PENDING/ACCEPTED (`602-608`).
- Audit actions used: `CREATE_BOOKING` (414), `UPDATE_BOOKING` (555), `CANCEL_BOOKING` (621) — all valid enum values; helper always sets `entityType:'BOOKING'` and swallows errors (`42-63`).

---

## 10. Station Audit (§15)

- `Station` enum types TV/RADIO/PRESS/BILLBOARD/DIGITAL ✔ (`Station.js:24-34`); approval is `approvalStatus` (`Station.js:205-213`), inventory is `inventoryStatus` (`219-228`), pricing is `pricing.{amount,currency,unit}` (`158-185`).
- **CONFIRMED CRITICAL FUNCTIONAL BUG:** the *public/legacy* station controller queries a field that does not exist:

```js
// station.controller.js:8-11
const stations = await Station.find({ status: 'APPROVED', isActive: true })
```

`Station` has no `status` → **`GET /api/v1/stations` always returns `[]`** (same in `approveStation` `153-161`, `createStation` `110`, `updateStation` `224`). The frontend's station marketplace (`lib/api.js:476`, `481`) is therefore empty.
- Also in `station.controller.js`: `createStation` omits the **required** `companyId` (`Station.js:46-50`) → validation error → 500 on `POST /api/v1/stations`; it passes `price`/`status` which the schema drops; the `updateStation` allow-list writes `status`, `price`, `isActive`, `rating`, `reviews` (`207-228`) — `status`/`price` don't exist.
- The **working** station API is the admin one: `admin.controller.js:2341-2490` (requires `companyId`, writes `pricing.*`, `approvalStatus:'PENDING'`, `isActive:false`) and `2695-2947` (approve uses `approvalStatus`, inventory-status, activate/deactivate). Two divergent implementations of the same resource = the frontend must use `/admin/stations/*`.
- No station-owner access control exists at all (no station login → nothing to protect); stations are administered by admins and owned by a `Company` row that cannot log in as a station.
- Public `GET /stations/:id` returns any station regardless of approval/active (`station.controller.js:28-53`) including contact details.

---

## 11. Creative / File Audit (§16)

- **CONFIRMED: every single-creative endpoint is broken (always 403):**

```js
// creative.controller.js:58, 170, 244, 294, 348
if (creative.campaignId.companyId.toString() !== companyId) { return res.status(403) ...
```

`companyId` is an **ObjectId**, so `string !== ObjectId` is always true → `GET/PUT/DELETE/approve/reject` on `/creatives/:id` deny everyone. (Side effect: no cross-company leak, but the endpoints are unusable.) If `campaignId` was deleted, `creative.campaignId.companyId` throws → 500.
- `getCreativesByCampaign` and `uploadCreative` verify the campaign belongs to the caller (`12-15, 103-106`) ✔ and `uploadCreative` scopes correctly.
- **CONFIRMED: there is no file upload.** No `multer` dependency, no static/upload directory, no storage SDK; `uploadCreative` accepts `url, size, mimeType, type` **from the client** (`creative.controller.js:85-93`) with no size/MIME/type validation (type is only schema-enum'd; invalid values → 500). No real byte count → see storage issues below.
- `updateCreative` accepts `status` from the body (`177-191`) → **self-approval** bypasses `/approve`.
- `deleteCreative` hard-deletes (`251`) → dashboard storage does decrease when creatives are deleted (it re-aggregates live).
- `size` unit is undefined/unvalidated: dashboard treats it as bytes (`company.controller.js:341-344, 454-459`), `/settings/usage` returns hardcoded `'0 MB'`/`'5 GB'` (`settings.controller.js:287-288`). If the client sends KB/MB, storage is wrong by 10³–10⁶.
- Deleted/changed campaigns: creatives have no cleanup on campaign deletion except the campaign cascade ✔ (`campaign.controller.js:277-279`) and on individual-campaign delete in admin.

## 12. Dashboard Audit (§17) + Dashboard Statistics Audit (§18)

`GET /api/v1/company/dashboard` → `protect + inline requireCompany` (`company.routes.js:119-126`) → `getDashboardData` (`company.controller.js:10-514`). Response: `{success, data:{company, stats{...}, upcomingBookings, performance.monthly, recentCampaigns, recentActivity, storage{usedBytes, categories}}}` — matches the frontend (`app/company/dashboard/page.js:88,126-134`). All values come from the DB (no hardcoded dashboard data) **but several are computed incorrectly or are structurally always zero:**

| Statistic | Source & filter | Verdict |
|---|---|---|
| `totalSpend` | Booking.aggregate `{companyId, status ∈ ACCEPTED/SCHEDULED/COMPLETED}` `$sum price` (`119-140`) | Real, but price is client-supplied (D3) and currency-mixed (no currency grouping, Company/Booking currencies ignored) |
| `currentMonthSpend` | same statuses + `createdAt ∈ [monthStart, nextMonthStart)` (`145-170`) | Real; **uses `createdAt`, not `date`**; boundaries are *server-local* time (Vercel = UTC) while `Company.timezone` is never read anywhere |
| `previousMonthSpend` / `spendChange` | `175-200` / `386-393` | Same caveats; `spendChange` is `null` when previous = 0 (frontend must handle) |
| `totalReach` | `$sum Campaign.totalReach` (`205-219`) | **Always 0** — `totalReach` is never written by any code |
| `activeCampaigns` | `status:'LIVE'` (`96-99`) | Real |
| `totalCampaigns`, `totalBookings`, `pendingBookings`, `employeeCount` | countDocuments (`89-114`, `81-84`) | Real and company-scoped ✔ |
| `upcomingBookings` | date ≥ now, status ∉ CANCELLED/REJECTED/COMPLETED, limit 5 (`224-243`) | Real |
| `performance.monthly` | group by `$year/$month` of `date`, **sort asc + `$limit 12`** (`248-288`) | **Returns the OLDEST 12 months**, not the last 12; no upper date bound → future bookings included |
| `recentCampaigns/recentActivity` | limit 5, company-scoped (`293-316`) | Real ✔ |
| `storage.usedBytes/categories` | Creative aggregate, unit-agnostic `$sum size` (`321-351, 454-459`) | Real records, wrong/undefined unit; client-declared sizes |

Also: `/settings/usage` (`GET /api/v1/settings/usage`) **crashes** — `Campaign` and `Booking` are not imported (`settings.controller.js:1-4` vs use at `273-279`) → ReferenceError → 500 "Failed to load company usage"; and it hardcodes storage strings (`287-288`) = fake data in a real endpoint.

---

## 13. Activity / Audit Log Audit (§19) + Action Consistency (§20)

- `AuditLog` model is solid: `userId, companyId, action(enum), entityType(enum), entityId, changes, metadata, ipAddress, userAgent, sessionId` + 5 indexes (`AuditLog.js:1-231`).
- Coverage is broad: auth, company, workers, stations, users, individuals, campaigns, bookings, creatives, departments, employees (grep of `action:` across controllers). `admin.controller.js:164-170` adds IP/user-agent for all admin actions; the other controllers do not capture IP/UA.
- **CONFIRMED enum violations that turn successful operations into HTTP 500s:**
  - `ACTIVATE_STATION` (`admin.controller.js:2935`) and `DEACTIVATE_STATION` (`2996`) are **not in the enum** (`AuditLog.js:124-129`) → `AuditLog.create` throws → catch → 500 "Failed to activate station" *after* `station.save()` already committed.
  - `UPDATE_COMPANY_LOGO` (`settings.controller.js:235`) is **not in the enum** (`AuditLog.js:41-48`) → `PATCH /settings/logo` always answers 500 although the logo is saved.
  - `'UPDATE_COMPANY_WORKER_STATUS'` fallback (`admin.controller.js:1980`) is also not in the enum — unreachable today (callers only pass activate/reactivate/deactivate) but a trap (POTENTIAL).
- **Defined but never used:** `DELETE_COMPANY`, `APPROVE_COMPANY`, `REJECT_COMPANY`, `SUBMIT_CAMPAIGN`, `APPROVE/REJECT/PAUSE/RESUME/COMPLETE_CAMPAIGN`, `DELETE_BOOKING`, `ACCEPT/REJECT/COMPLETE_BOOKING`, all 5 `*_PAYMENT`, `ADMIN_LOGIN`, `ADMIN_LOGOUT`, `SYSTEM_*`.
- **Sensitive operations with no/weak logs:** failed logins and authorization denials (none), `station.controller.approveStation` logs `companyId: null` (`station.controller.js:167`), password reset logged as generic `UPDATE_USER` with `metadata.actionType:'PASSWORD_RESET'` (`admin.controller.js:3890-3906`) — enum-correct but hard to aggregate.
- Company users only ever see their own company activity: dashboard activity is `AuditLog.find({companyId})` (`company.controller.js:308-316`) ✔; individual activity is admin-only ✔; there is no company-facing audit page endpoint beyond the dashboard's 5 rows.

---

## 14. API Response Audit (§21)

- Dominant shape `{success, message?, data?}` ✔; 404 handler adds `path` (`app.js:46-52`).
- **Inconsistent / divergent cases:** auth validation errors return `{success:false, errors:[...]}` with **no `message`** (`auth.validator.js:95-98`) while every other error has `message` → the frontend (`lib/api.js:41-45`) only reads `message`, so users see "Something went wrong" for registration errors (CONFIRMED contract mismatch).
- `token` sits **beside** `data` on login/register (`auth.controller.js:244-249, 150-171`) — frontend reads it correctly (`login/page.jsx:175`) but it breaks the envelope convention.
- `getCampaign`/`getAdminCampaign` return the campaign spread at the top level plus `bookings`/`creatives` (no `data` wrapper) — different from list endpoints (POTENTIAL; verify per-page usage).
- Lists return `data: [..]` (campaigns/bookings/stations/companies) while `getCompanyWorkers` (`admin.controller.js:1092-1107`), `getBooking`, dashboard, etc. return `data: {object}` — mixed.
- Status-code inconsistency: create → 201 (`auth.controller.js:150`, `campaign.controller.js:145`, `booking.controller.js:428`, `company.controller.js:643`); duplicate-key → 409 in some controllers, 500 in others (global handler has no 11000 mapping).
- `DELETE` endpoints return `{success, message}` without `data` (fine, just note).

## 15. Error Handling Audit (§22)

- Global handler (`app.js:60-66`) returns **`err.message`** for all failures → leaks internal messages (e.g. Mongoose CastError text with field names/values, validation paths); no stack traces leaked ✔. No status-code mapping (everything 500).
- No `asyncHandler`; Express 5 auto-forwards rejected promises ✔.
- Controllers catch broadly and return generic messages ✔, but **ValidationError/CastError → 500 instead of 400** in campaigns, bookings, creatives, departments, employees, company team, settings. `admin.controller.js` has a proper `sendValidationError` helper (`29-55`, maps ValidationError→400, duplicate→409) used in parts of the file only.
- DB connection failure: `server.js:20-27` exits locally, rethrows on Vercel (no retry) — acceptable, but no `/health` DB probe.
- Sensitive info in logs: `User.js:78-89` logs hashing/comparison internals on every login, `auth.controller.js` logs emails/attempts; no secrets logged ✔.

---

## 16. Validation Audit (§23)

- Only `auth.validator.js` (Joi) exists; register/login validated (password complexity, phone pattern) ✔.
- No validators for company data, campaigns, bookings, stations, creatives, employees, departments, settings — validation depends on Mongoose enums/required.
- Mismatches found: Joi `phone` pattern validated but User has no `phone` field (see User Management); `Campaign.objective` required in schema with no enum vs controller default string (`campaign.controller.js:123`); `budget: 0` rejected by the controller though valid in schema (`113`); `Booking.slot` free text while `Schedule.slot` has an enum (`Booking.js:36-40` vs `Schedule.js:24-32`); `Creative.size/mimeType/type` unvalidated; `Department` uniqueness uses **unescaped regex** `` new RegExp(`^${name}$`,'i') `` (`department.controller.js:114, 195-196`) → regex injection/ReDoS (POTENTIAL, LOW).
- No ObjectId validation outside admin controller → `GET /campaigns/abc` etc. → CastError → 500 (should be 400).

---

## 17. Database Relationship Audit (§24)

- Relationships: `User.companyId→Company`, `Employee.userId→User` (unique) + `companyId→Company`, `Department.companyId→Company`, `Campaign.companyId/userId`, `Booking.campaignId/stationId/userId/companyId`, `Creative.campaignId`, `AuditLog.userId/companyId`, `Payment.campaignId/companyId/userId`, `Station.companyId`.
- **Dead/unsupported models:** `Schedule` never imported anywhere; `Admin` only in the seed script; `Payment` only read by the admin dashboard (never written). `Booking.stationResponse/stationNote/proof*` and `Campaign.totalReach/engagement/progress` never written.
- **Missing indexes:** `User.companyId` (queried by company in several places), `Campaign.{companyId,status}` (activeCampaigns), `Booking.{stationId,date}` compound (overlap query `booking.controller.js:355-361`), `Creative.{campaignId,status}`, `Station.{approvalStatus,isActive}`. Existing indexes are otherwise good and non-duplicated (`Payment.js:82-88` explicitly avoids a duplicate).
- **Orphan risks:** station deletion with live bookings (`admin.controller.js:3030-3093` only blocks `isActive`/`BOOKED` inventory), individual deletion leaving campaigns/bookings/payments/logs (`3769-3773`), campaign deletion removing bookings/creatives without touching `Payment`/`AuditLog`.
- Inefficient queries: `admin.controller.js:263-289` (N+1: 2 counts per company), `department.controller.js:26-38` (per-department counts), `admin.controller.js:212-223` (loads all successful payments into Node to sum).

---

## 18. Multi-Tenancy / Data Isolation Audit (§25) — the core result

**Verified safe:** every company-owned resource query for campaigns, bookings, creative lists, departments, employees, settings, team and the dashboard filters on `req.user.companyId`, which comes from the JWT-loaded user and can never be supplied by a client. ID substitution (`/campaigns/:id`, `/bookings/:id`, `/departments/:id`, `/settings`, `/company/team/:id`) does **not** cross tenants — the second filter (`companyId`) prevents it. Admin routes are admin-only.

**Confirmed tenant-boundary holes (both in `company.controller.js`):**

1. **C1 — account takeover via invite** (`inviteTeamMember`, `company.controller.js:552-615`): an existing User with the same email is **re-used and overwritten** (password, name, accountType→EMPLOYEE, status→ACTIVE, companyId→attacker's company). Any company member (owner *or* employee, since no permission check exists) can hijack any account by email — an individual user, another company's owner, or an ADMIN. Only protection: if the victim already has an Employee row in *that* company (`583-593`).
2. **C2 — no intra-tenant role enforcement** (unused `requirePermission`/`requireCompanyOwner` + unvalidated `updateTeamMemberRole`): every employee holds every company power, and can promote themselves to 'Company Owner'.

No other confirmed cross-company read/write path was found (creative endpoints deny everyone; station/public endpoints are global by design).

## 19. Security Audit (§26)

| # | Finding | Where |
|---|---|---|
| S1 | Account takeover via invite (Critical) | `company.controller.js:598-615` |
| S2 | Zero permission enforcement for employees; self-promotion to owner (Critical) | `role.js:90-166` (unused), `company.controller.js:727-781` |
| S3 | JWT in `localStorage` (XSS theft) | `frontend/src/app/login/page.jsx:175` + `lib/api.js:6` |
| S4 | No rate limiting anywhere (login stuffing) | `app.js` (no limiter; no dependency) |
| S5 | `helmet` installed but never mounted → no security headers | `backend/package.json:19` vs `app.js` |
| S6 | Stray live credential file at repo root (`token`, 656 bytes, starts “admin token:”) | `media-masters-main/token` |
| S7 | Seed script hardcodes admin email+password and prints them | `src/scripts/createAdmin.js:14-15,55-62` |
| S8 | Error handler echoes internal error messages | `app.js:60-66` |
| S9 | Audit enum violations cause 500s (see Audit Log section) | `admin.controller.js:2935,2996`; `settings.controller.js:235` |
| S10 | Client-controlled money fields (price/currency) | `booking.controller.js:205-214,424` |
| S11 | Unvalidated client `url`/`size`/`mimeType` for creatives; no real upload/MIME checks | `creative.controller.js:85-93` |
| S12 | Password hash exposed via `.lean()` + unbounded populate | `admin.controller.js:3940-3991` (userId populated, no select) |
| S13 | No email verification, no user-initiated reset, no token revocation | `auth.controller.js:289-310`; `User.js` |
| S14 | CORS origins hardcoded; `FRONTEND_URL` env unused | `app.js:12-15` |
| S15 | Temporary password returned in HTTP response | `admin.controller.js:3908-3920` |
| S16 | Plaintext credentials in `.env` (128-char JWT secret) — value not printed; no `.env.example` | `backend/.env` |
| S17 | No transactions; partial failures corrupt state | Transaction section below |

No NoSQL-injection vector found: no `find(req.body)`, `$where`, or user-supplied `$` operators (grep); Mongoose casting kills operator objects on ObjectId paths. Mass assignment is limited by allow-lists in campaign/station/company updates, but `campaign.updateCampaign` includes `status` (security-relevant) and `station.controller.updateStation` includes `isActive/rating/reviews`.

---

## 20. Performance Audit (§27)

- **N+1:** `admin.getCompanies` (2 counts/company, `admin.controller.js:263-289`), `department.getDepartments` (count per department).
- **Unbounded lists (no pagination/filter params in any route):** `admin.controller.js:213` (all successful payments → memory), `263`, `1074`, `2270`, `3105`, `3256`, `3984`, `4078`, `4369`; `campaign.controller.js:20-22`; `booking.controller.js:81-83,115`; `company.controller.js:528`; `creative.controller.js:24`; `department.controller.js:18-21`.
- **Expensive/inaccurate aggregation:** monthly pipeline returns oldest 12 (`company.controller.js:280-287`); spend aggregations scan `Booking` by `companyId` with no `{companyId,status}` index; storage aggregate `$lookup` on every dashboard load (`321-351`) — fine with an index on `campaigns._id` (automatic) but it's a full scan of `creatives` without `companyId`.
- **Missing indexes** listed in the Database Relationship section; `AuditLog` is well indexed.
- Booking overlap check loads all same-day, same-station bookings for the station in JS (`booking.controller.js:355-372`) — acceptable at small scale, but should be an index-backed query `{stationId, date, status}`.
- Slug uniqueness loops issue sequential queries (`auth.controller.js:83-87`, `admin.controller.js:378-382`) — minor.

---

## 21. Transaction / Data Consistency Audit (§28)

Multi-document writes with **no MongoDB session/transaction** (Mongoose default), so partial failure = inconsistent state:

| Operation | Files/lines | Failure mode |
|---|---|---|
| Self company registration (Company+User+Employee+AuditLog) | `auth.controller.js:90-129` | Company/User left without owner Employee |
| Admin worker create (User+Employee, manual rollback) | `admin.controller.js:1324-1364` | rollback exists (good) but no tx |
| Admin company create (Company+User, rollback) | `admin.controller.js:384-438` | no owner Employee ever |
| Verification / suspend / reactivate (Company+User+Log) | `admin.controller.js:836-875, 928-960, 1004-1035` | statuses diverge |
| Worker toggle (Employee+User+Log) | `admin.controller.js:1964-1990` | divergence |
| Remove worker (Employee update + User update) | `admin.controller.js:2150-2200` | user stays attached/deactivated inconsistently |
| Campaign delete (Bookings+Creatives+Campaign) | `campaign.controller.js:271-281` | orphaned/partial cascade |
| Individual campaign delete / reset | `admin.controller.js:5064-5081 / 3877-3906` | orphans; password changed without log if log fails |
| Any op whose AuditLog enum value is invalid | `admin.controller.js:2935/2996`, `settings.controller.js:235` | write committed + 500 returned |
| Booking slot overlap | `booking.controller.js:355-372` | double booking under concurrency |

## 22. Environment / Configuration Audit (§29)

- `backend/.env` defines `PORT, NODE_ENV, MONGODB_URI, JWT_SECRET, JWT_EXPIRE=7d, FRONTEND_URL` (secrets present, not printed). **No `.env.example`** anywhere → required vars undocumented. `FRONTEND_URL` is never read by code (`app.js` hardcodes origins) — dead config.
- `JWT_SECRET` is 128 chars (strong) but there is no startup assertion; if unset, `jwt.verify(token, undefined)` throws → 500 "Authentication failed" (`auth.js:115-118`).
- Upload configuration: **none** (no multer/limits/storage); request body limit is Express default 100 kb.
- Production config: `vercel.json` (root) rewrites `/api/v1` and `/health` to the backend service; `server.js` handles serverless (`VERCEL`). Frontend `.env.local` (113 bytes) supplies `NEXT_PUBLIC_API_URL` for local dev.
- Root `package.json` contains only `framer-motion` (stub) — harmless but confusing; the real apps are `backend/package.json` and `frontend/package.json`.
- `token` file at repo root must be deleted and that token rotated (see Security S6).

---

## 23. Route Inventory (§30)

Legend — **AUTH** = `protect`; **ADMIN** = `protect+requireAdmin`; **COMPANY** = `protect+requireCompany` (role.js); **COMPANY-LOCAL** = `protect` + inline `requireCompany` (company.routes.js); **PUBLIC** = none. *Scoped* = filtered by `req.user.companyId`. *Log* = AuditLog written on mutation.

| Method | Path | Auth | Role | Controller (file:fn) | Resource | Scoped | Log |
|---|---|---|---|---|---|---|---|
| GET | /api/v1/ | PUBLIC | – | index.js inline | info | – | – |
| GET | /api/v1/test | PUBLIC | – | index.js inline | info | – | – |
| POST | /auth/register | PUBLIC | – | auth:register | User/Company/Employee | – | REGISTER |
| POST | /auth/login | PUBLIC | – | auth:login | User | – | LOGIN |
| GET | /auth/me | AUTH | any | auth:getMe | User | – | – |
| POST | /auth/logout | AUTH | any | auth:logout | User | – | LOGOUT |
| GET | /company/dashboard | AUTH | COMPANY-LOCAL | company:getDashboardData | Company/Campaign/Booking/Creative/Employee/AuditLog | ✔ | – |
| GET | /company/team | AUTH | COMPANY-LOCAL | company:getTeam | Employee | ✔ | – |
| POST | /company/team/invite | AUTH | COMPANY-LOCAL | company:inviteTeamMember | User/Employee | ✔ (but hijack) | INVITE_EMPLOYEE |
| DELETE | /company/team/:id | AUTH | COMPANY-LOCAL | company:removeTeamMember | Employee/User | ✔ | REMOVE_EMPLOYEE |
| PUT | /company/team/:id | AUTH | COMPANY-LOCAL | company:updateTeamMemberRole | Employee | ✔ | UPDATE_EMPLOYEE_ROLE |
| GET | /campaigns | AUTH | COMPANY | campaign:getCampaigns | Campaign | ✔ | – |
| GET | /campaigns/:id | AUTH | COMPANY | campaign:getCampaign | Campaign/Booking/Creative | ✔ | – |
| POST | /campaigns | AUTH | COMPANY | campaign:createCampaign | Campaign | ✔ | CREATE_CAMPAIGN |
| PUT | /campaigns/:id | AUTH | COMPANY | campaign:updateCampaign | Campaign (incl. status!) | ✔ | UPDATE_CAMPAIGN |
| DELETE | /campaigns/:id | AUTH | COMPANY | campaign:deleteCampaign | Campaign/Booking/Creative | ✔ | DELETE_CAMPAIGN |
| PATCH | /campaigns/:id/status | AUTH | COMPANY | campaign:updateCampaignStatus | Campaign | ✔ | UPDATE_CAMPAIGN_STATUS |
| GET | /bookings | AUTH | COMPANY | booking:getBookings | Booking | ✔ | – |
| GET | /bookings/:id | AUTH | COMPANY | booking:getBooking | Booking | ✔ | – |
| POST | /bookings | AUTH | COMPANY | booking:createBooking | Booking/Campaign/Station | ✔ (campaign only) | CREATE_BOOKING |

| PATCH | /bookings/:id/status | AUTH | COMPANY | booking:updateBookingStatus | Booking | ✔ | UPDATE_BOOKING |
| POST | /bookings/:id/cancel | AUTH | COMPANY | booking:cancelBooking | Booking | ✔ | CANCEL_BOOKING |
| GET | /stations | PUBLIC | – | station:getStations | Station (broken filter → []) | – | – |
| GET | /stations/type/:type | PUBLIC | – | station:getStationsByType | Station | – | – |
| GET | /stations/:id | PUBLIC | – | station:getStation | Station (any status) | – | – |
| POST | /stations | ADMIN | ADMIN | station:createStation (broken) | Station | – | CREATE_STATION |
| PATCH | /stations/:id/approve | ADMIN | ADMIN | station:approveStation (wrong field) | Station | – | APPROVE_STATION (companyId null) |
| PUT | /stations/:id | ADMIN | ADMIN | station:updateStation (wrong fields) | Station | – | UPDATE_STATION |
| DELETE | /stations/:id | ADMIN | ADMIN | station:deleteStation | Station | – | DELETE_STATION |
| GET | /settings | AUTH | COMPANY | settings:getCompanySettings | Company/Employee | ✔ | – |
| PUT | /settings | AUTH | COMPANY | settings:updateCompanySettings | Company | ✔ | UPDATE_COMPANY |
| PATCH | /settings/logo | AUTH | COMPANY | settings:updateCompanyLogo | Company | ✔ | UPDATE_COMPANY_LOGO ❌ enum → 500 |
| GET | /settings/usage | AUTH | COMPANY | settings:getCompanyUsage | Employee/(Campaign/Booking undefined) | ✔ | – (crashes) |
| GET | /creatives/campaign/:campaignId | AUTH | COMPANY | creative:getCreativesByCampaign | Creative/Campaign | ✔ | – |
| GET | /creatives/:id | AUTH | COMPANY | creative:getCreative | Creative | broken guard (403) | – |
| POST | /creatives | AUTH | COMPANY | creative:uploadCreative | Creative/Campaign | ✔ (metadata only) | UPLOAD_CREATIVE |
| PUT | /creatives/:id | AUTH | COMPANY | creative:updateCreative | Creative (incl. status) | broken guard | UPDATE_CREATIVE |
| DELETE | /creatives/:id | AUTH | COMPANY | creative:deleteCreative | Creative | broken guard | DELETE_CREATIVE |
| PATCH | /creatives/:id/approve | AUTH | COMPANY | creative:approveCreative | Creative | broken guard | APPROVE_CREATIVE |
| PATCH | /creatives/:id/reject | AUTH | COMPANY | creative:rejectCreative | Creative | broken guard | REJECT_CREATIVE |

| GET | /employees/templates | AUTH | COMPANY | employee:getPermissionTemplates | none (static) | – | – |
| GET | /employees/:id/permissions | AUTH | COMPANY | employee:getEmployeePermissions | Employee | ✔ | – |
| PUT | /employees/:id/permissions | AUTH | COMPANY | employee:updateEmployeePermissions | Employee | ✔ | UPDATE_EMPLOYEE_PERMISSIONS |
| PATCH | /employees/:id/activate | AUTH | COMPANY | employee:activateEmployee | Employee/User | ✔ | ACTIVATE_EMPLOYEE |
| PATCH | /employees/:id/deactivate | AUTH | COMPANY | employee:deactivateEmployee | Employee/User | ✔ | DEACTIVATE_EMPLOYEE |
| GET | /departments | AUTH | COMPANY | department:getDepartments | Department/Employee | ✔ | – |
| GET | /departments/:id | AUTH | COMPANY | department:getDepartment | Department/Employee | ✔ | – |
| POST | /departments | AUTH | COMPANY | department:createDepartment | Department | ✔ | CREATE_DEPARTMENT |
| PUT | /departments/:id | AUTH | COMPANY | department:updateDepartment | Department | ✔ | UPDATE_DEPARTMENT |
| DELETE | /departments/:id | AUTH | COMPANY | department:deleteDepartment | Department | ✔ | DELETE_DEPARTMENT |
| POST | /departments/assign | AUTH | COMPANY | department:assignEmployee | Employee/Department | ✔ | ASSIGN_EMPLOYEE_DEPARTMENT |

### Admin routes (all `protect + requireAdmin`, `admin.routes.js:89-90`)


| Method | Path | Controller | Resource | Log |
|---|---|---|---|---|
| GET | /admin/dashboard | admin:getDashboardStats | all + Payment + AuditLog | – |
| GET | /admin/companies | admin:getCompanies | Company/User/Employee | – |
| POST | /admin/companies | admin:createCompany | Company/User | CREATE_COMPANY |
| GET | /admin/companies/:id | admin:getCompanyById | Company/User/Employee | – |
| PATCH | /admin/companies/:id | admin:updateCompany | Company/User | UPDATE_COMPANY |
| PATCH | /admin/companies/:id/verification | admin:updateCompanyVerification | Company/User | UPDATE_COMPANY_VERIFICATION |
| PATCH | /admin/companies/:id/suspend | admin:suspendCompany | Company/User | SUSPEND_COMPANY |
| PATCH | /admin/companies/:id/reactivate | admin:reactivateCompany | Company/User | REACTIVATE_COMPANY |
| GET | /admin/companies/:id/workers | admin:getCompanyWorkers | Employee/User/Department | – |
| GET | /admin/companies/:id/workers/:workerId | admin:getCompanyWorkerById | Employee/User/Department | – |
| POST | /admin/companies/:id/workers | admin:createCompanyWorker | Employee/User/Department | CREATE_COMPANY_WORKER |
| PATCH | /admin/companies/:id/workers/:workerId | admin:updateCompanyWorker | Employee/User(s)| UPDATE_COMPANY_WORKER |
| PATCH | /admin/companies/:id/workers/:workerId/activate | admin:activateCompanyWorker | Employee/User | ACTIVATE_COMPANY_WORKER |
| PATCH | /admin/companies/:id/workers/:workerId/deactivate | admin:deactivateCompanyWorker | Employee/User | DEACTIVATE_COMPANY_WORKER |
| PATCH | /admin/companies/:id/workers/:workerId/reactivate | admin:reactivateCompanyWorker | Employee/User | REACTIVATE_COMPANY_WORKER |
| DELETE | /admin/companies/:id/workers/:workerId | admin:removeCompanyWorker | Employee/User | REMOVE_COMPANY_WORKER |
| GET | /admin/stations | admin:getStations | Station/Company | – |
| GET | /admin/stations/:id | admin:getStationById | Station/Company | – |
| POST | /admin/stations | admin:createStation | Station/Company | CREATE_STATION |
| PATCH | /admin/stations/:id | admin:updateStation | Station/Company | UPDATE_STATION |
| PATCH | /admin/stations/:id/approve | admin:approveStation | Station | APPROVE_STATION |
| PATCH | /admin/stations/:id/reject | admin:rejectStation | Station | REJECT_STATION |
| PATCH | /admin/stations/:id/inventory-status | admin:updateStationInventoryStatus | Station | UPDATE_STATION_INVENTORY_STATUS |
| PATCH | /admin/stations/:id/activate | admin:activateStation | Station | ACTIVATE_STATION ❌ enum → 500 |
| PATCH | /admin/stations/:id/deactivate | admin:deactivateStation | Station | DEACTIVATE_STATION ❌ enum → 500 |
| DELETE | /admin/stations/:id | admin:deleteStation | Station | DELETE_STATION |
| GET | /admin/campaigns | campaign:getAdminCampaigns | Campaign/Company/User | – |
| GET | /admin/campaigns/:id | campaign:getAdminCampaign | Campaign/Company/User | – |
| GET | /admin/bookings | booking:getAdminBookings | Booking/Company/User | – |
| GET | /admin/users | admin:getUsers | User | – |
| PATCH | /admin/users/:id/suspend | admin:suspendUser | User | SUSPEND_USER |
| PATCH | /admin/users/:id/activate | admin:activateUser | User | ACTIVATE_USER |
| GET | /admin/individuals | admin:getIndividuals | User(INDIVIDUAL) | – |
| GET | /admin/individuals/:id | admin:getIndividualById | User | – |
| PATCH | /admin/individuals/:id | admin:updateIndividual | User | UPDATE_USER |
| PATCH | /admin/individuals/:id/suspend | admin:suspendIndividual | User | SUSPEND_USER |
| PATCH | /admin/individuals/:id/activate | admin:activateIndividual | User | ACTIVATE_USER |
| PATCH | /admin/individuals/:id/reactivate | admin:reactivateIndividual | User | UPDATE_USER |
| POST | /admin/individuals/:id/reset | admin:resetIndividual | User | UPDATE_USER (metadata PASSWORD_RESET) |
| DELETE | /admin/individuals/:id | admin:deleteIndividual | User | DELETE_USER |
| GET | /admin/individuals/:id/campaigns | admin:getIndividualCampaigns | Campaign + populated userId (hash leak) | – |
| GET | /admin/individuals/:id/campaigns/:campaignId | admin:getIndividualCampaign | Campaign | – |
| POST | /admin/individuals/:id/campaigns | admin:createIndividualCampaign | Campaign | CREATE_CAMPAIGN |
| PUT | /admin/individuals/:id/campaigns/:campaignId | admin:updateIndividualCampaign | Campaign | UPDATE_CAMPAIGN |
| PATCH | /admin/individuals/:id/campaigns/:campaignId/status | admin:updateIndividualCampaignStatus | Campaign | UPDATE_CAMPAIGN_STATUS |
| DELETE | /admin/individuals/:id/campaigns/:campaignId | admin:deleteIndividualCampaign | Campaign/Booking/Creative | DELETE_CAMPAIGN |
| GET | /admin/individuals/:id/bookings | admin:getIndividualBookings | Booking + populated refs | – |
| GET | /admin/individuals/:id/activity | admin:getIndividualActivity | AuditLog | – |

**Totals:** 99 endpoints (10 modules + admin); 48 admin routes; 45 admin.controller exports all routed (1:1 verified).

**Contract gaps discovered against the frontend**

- `frontend/src/app/admin/payments/page.js:63` calls `/api/v1/payments` → **route does not exist** (404).
- `frontend/src/app/admin/departments/page.js:54,86,120,152` calls `/api/v1/departments` → that router is `requireCompany` → an **ADMIN gets 403**; there is no admin departments API.
- `frontend/src/app/login/page.jsx:175` stores `data.token` in `localStorage` (matches the backend's top-level `token` but is a security concern).

TOTAL: **99 endpoints** — 2 index/health, 4 auth, 5 company, 6 campaigns, 5 bookings, 7 stations, 4 settings, 7 creatives, 5 employees, 6 departments, 48 admin (table above).

---

## 24. Model Inventory (§31)

| Model | Purpose | Relationships | Important fields | Indexes | Potential issues |
|---|---|---|---|---|---|
| User | Identity for all account types | companyId→Company | email(unique), password, accountType, status, companyId, image, emailVerified, lastLogin/loginCount | email unique | **no `phone`** (written by admin code); no `companyId` index; `STATION` type unused |
| Admin | Admin profile/permissions | userId→User (unique) | permissions[], isActive, createdAt | userId unique | never used for authorization |
| Company | Tenant / agency account | – | name, slug(unique), email(unique), status(PENDING/APPROVED/SUSPENDED/REJECTED), timezone, currency | slug unique, email unique | timezone/currency ignored by all code paths |
| Employee | Company membership / role | userId→User (unique), companyId→Company, departmentId→Department | position, permissions[], isActive, invitedAt/By, acceptedAt | {companyId,isActive} | permissions never enforced; re-invite blocked; not in access checks |
| Department | Team grouping | companyId→Company, managerId→User | name(≤50), description(≤200), isActive | {companyId,name} unique, {companyId,isActive} | unescaped regex in name matching |
| AuditLog | Activity trail | userId→User, companyId→Company | action(enum), entityType(enum), entityId(string), changes/metadata, ipAddress, userAgent, sessionId | userId+createdAt, companyId+createdAt, action, entityType+entityId, createdAt | 3 action strings used that are absent from the enum |
| Campaign | Campaign record | companyId→Company, userId→User | name, objective, status(20 enum), budget, currency, startDate/endDate/scheduledDate, totalReach, engagement, progress | {companyId,createdAt}, status, userId, {startDate,endDate} | no status machine; counters never written; missing {companyId,status} |
| Booking | Station booking | campaignId→Campaign, stationId→Station, userId→User, companyId→Company | bookingReference(unique), slot, date, time, duration, price, currency, status(7), stationResponse/Note, proofUrl/proofVerified | campaignId, stationId, {companyId,createdAt}, status, date | price client-controlled; no {stationId,date}; proof/response fields dead |
| Station | Media inventory | companyId→Company, adminId→User | name, slug(unique), type(5), location, contact, images, specifications, pricing{amount,currency,unit}, availability, operatingHours, approvalStatus, inventoryStatus, isActive, reach, rating, reviews | companyId, type, approvalStatus, inventoryStatus, {companyId,type}, {companyId,inventoryStatus} | legacy controller reads non-existent `status`; no owner login; pricing unused by bookings |
| Creative | Campaign assets | campaignId→Campaign | name, description, type(5), url, size, mimeType, status(4), uploadedBy(string), uploadedAt, approvedAt/By, version | campaignId, status, type | no real file/upload; single-item endpoints always 403; `size` unit undefined; `uploadedBy/approvedBy` are Strings not refs |
| Payment | Intended gateway record | campaignId, companyId, userId | amount, currency, reference(unique), status(5), provider(PAYSTACK), providerReference/Data, refund*, timestamps | reference unique, {companyId,createdAt}, campaignId, status | never written anywhere; no routes; `PAYMENT_*` campaign statuses unbacked |
| Schedule | Intended station slot inventory | stationId→Station | day(enum), startTime, endTime, slot(4 enum), isAvailable, price | {stationId,day} | never imported anywhere (dead model) |

# FINAL AUDIT REPORT

## A. Architecture Summary

A conventional Express/Mongoose REST API with JWT bearer auth, one shared `User` identity collection for all account types, company multi-tenancy anchored on `User.companyId`, and an `Employee` membership record (unique per user). Company-scoped routers use `protect + requireCompany` and always derive `companyId` from the token-loaded user; admin routes use `protect + requireAdmin`. Business features are fairly complete for companies (campaigns, bookings, creatives-metadata, team, departments, settings, dashboard) and thin/absent for stations, payments, files and station-side interactions. Audit logging is pervasive but has enum defects; there is no service layer, no transaction usage, no validation layer beyond auth, no pagination, and no file storage.

## B. What's Working

Password hashing/compare; JWT issue/verify/expiry and per-request fresh user + status checks; company status gating; company scoping on campaigns/bookings/creative-list/departments/employees/settings/team/dashboard; booking status transition map; campaign delete guard + cascade; department CRUD with assignment guards; department/employee company scoping; admin route protection and ObjectId validation in the admin controller; company dashboard built from real DB queries; audit-log model and coverage; employee↔user↔company relationship integrity; user deletion/deactivation invalidating JWTs.

---

## C. Critical Problems

### C1 — Account takeover / privilege hijack via team invite

```text
Severity: CRITICAL
File:     backend/src/controllers/company.controller.js:552-615 (inviteTeamMember)
Code:     let user = await User.findOne({ email });                    // 579 global lookup
          ... else { user.password = password;                        // 608
                       user.name = name;
                       user.accountType = 'EMPLOYEE';                 // 610
                       user.status = 'ACTIVE';                        // 611
                       user.companyId = companyId; await user.save(); // 612-614
Problem:  Any existing account (another company's owner, an individual, an ADMIN) is
          silently re-owned and its password replaced when its email is "invited".
Why:      Full account takeover, cross-tenant breach, data loss; only needs a known
          email; any company member can call it (no permission check).
Fix:      Never mutate an existing user. Create an invitation (token/email/expiry) and a
          new User only for unregistered emails; require owner/permission; validate
          position and permissions; reject users bound to another company.
```

### C2 — Employee permissions and owner-only actions are never enforced

```text
Severity: CRITICAL
Files:    backend/src/middleware/role.js:90-166  (requireCompanyOwner, requirePermission — exported, imported nowhere)
          backend/src/controllers/company.controller.js:727-781 (updateTeamMemberRole)
Code:     if (position)   { employee.position = position; }
          if (permissions){ employee.permissions = permissions; }   // no owner guard, no validation
Problem:  Any ACTIVE EMPLOYEE can manage the team, change company settings, delete
          campaigns, approve/reject creatives, CRUD departments, and promote themselves
          to 'Company Owner'; nothing checks employee.permissions.
Why:      Insider privilege escalation, owner lockout (demote owner at 745-747, then
          remove them via removeTeamMember 684-689), audit trail shows a legitimate user.
Fix:      Mount requirePermission(...) per route/action; block edits to Company Owner
          rows; validate permissions against PERMISSIONS; require owner for role, team
          and settings changes.
```

### C3 — Public station catalogue is permanently empty / station write path broken

```text
Severity: CRITICAL (feature dead)
File:     backend/src/controllers/station.controller.js:8-11 (getStations), 110, 153-161, 224
Code:     Station.find({ status: 'APPROVED', isActive: true })
Problem:  Station has no `status` field (it is `approvalStatus`, Station.js:205-213), so
          GET /api/v1/stations always returns []. POST /api/v1/stations fails validation
          (required companyId missing, Station.js:46-50) and PATCH /api/v1/stations/:id/approve
          writes a field that is dropped, so approvalStatus stays PENDING.
Why:      The booking marketplace is unusable from the frontend (lib/api.js:476/481);
          two divergent station implementations (legacy vs admin.controller).
Fix:      Delete/align the duplicate station.controller.js implementation to
          approvalStatus + pricing + companyId, or route all station work through
          admin.controller.js.
```

---

## D. High Priority Problems

### D1 — Password hash disclosure to admin UI

```text
Severity: HIGH
File:     backend/src/controllers/admin.controller.js:3940-3991 (getIndividualData),
          used by getIndividualCampaigns (4017) and getIndividualBookings (4029)
Code:     model.find(query).populate(populateFields).sort(...).lean();
          // populateFields = ['companyId','userId'] — no field selection
Problem:  `.lean()` bypasses User.toJSON, so the populated `userId` includes the bcrypt
          password hash in the JSON response.
Why:      Credential material leaks into the admin browser and network logs.
Fix:      `.populate('userId','-password')` (and other models) or select explicit fields.
```

### D2 — AuditLog enum violations make successful operations return 500

```text
Severity: HIGH
File:     backend/src/controllers/admin.controller.js:2935 ('ACTIVATE_STATION'), 2996 ('DEACTIVATE_STATION');
          backend/src/controllers/settings.controller.js:235 ('UPDATE_COMPANY_LOGO')
Enum:     backend/src/models/AuditLog.js:124-129 / 41-48 (values absent)
Problem:  AuditLog.create throws; the catch turns an already-committed change into HTTP 500
          and the action is never logged.
Why:      Misleading API results, missing audit records, client retries duplicating effects.
Fix:      Add the actions to the enum (or reuse an existing action) and make audit writes
          non-fatal (like booking.controller.js:42-63) or transactional.
```

### D3 — Client-controlled booking price/currency

```text
Severity: HIGH
File:     backend/src/controllers/booking.controller.js:205-214, 261-271, 424 (createBooking)
Problem:  price/currency come from the request body; Station.pricing (Station.js:158-185) and
          the Schedule model are never used; price feeds dashboard spend.
Why:      Financial manipulation, bogus revenue/targets, no server-side source of truth.
Fix:      Derive price/currency from station.pricing (+duration/unit), ignore client price,
          snapshot the resolved price into the booking.
```

### D4 — Campaign status machine absent; two unguarded status paths

```text
Severity: HIGH
File:     backend/src/controllers/campaign.controller.js:328-385 (updateCampaignStatus: any of 20 statuses),
          184-202 (updateCampaign allow-list includes 'status');
          admin.controller.js:4832-4911 (same for individuals)
Problem:  No transition map; clients can jump straight to LIVE/COMPLETED/REFUNDED or assert
          PAYMENT_SUCCESSFUL with no payment.
Why:      Workflow integrity, billing disputes, analytics garbage.
Fix:      Define an allowed-transition map (mirroring booking.controller.js:497-534); remove
          `status` from the generic update allow-list; make server-side events (payment
          verified, campaign approved) the only writers of payment/booking-related statuses;
          decide the 20 vs 8 status set.
```

### D5 — Creative single-item endpoints broken for everyone

```text
Severity: HIGH (feature dead)
File:     backend/src/controllers/creative.controller.js:58, 170, 244, 294, 348
Code:     if (creative.campaignId.companyId.toString() !== companyId)
Problem:  string !== ObjectId is always true → 403; if campaign missing → TypeError → 500.
Why:      approve/reject/update/delete/get of creatives is impossible; creative lists also
          break the frontend contract.
Fix:      Reuse the working pattern — findOne({_id:id}).populate('campaignId','companyId')
          then String(creative.campaignId.companyId) === String(companyId).
```

### D6 — Employee lifecycle desync (re-invite impossible; removed users regain access)

```text
Severity: HIGH
File:     backend/src/controllers/company.controller.js:583-593 (invite blocks any existing Employee row),
          692-698 (soft-delete only); backend/src/middleware/role.js:6-86 (never checks Employee.isActive);
          backend/src/controllers/admin.controller.js:3159-3190 (admin activate ignores Employee)
Problem:  Removed members can never be re-invited; if the User row is reactivated, the removed
          employee has full company access again.
Why:      Broken team management; stale access.
Fix:      Include Employee.isActive (and deletedAt) in the company access middleware; make
          re-invite reactivate the existing row; treat "removed" as a distinct state.
```

### D7 — Admin-created companies have no owner Employee; reactivation bypasses REJECTED

```text
Severity: HIGH
File:     backend/src/controllers/admin.controller.js:384-438 (createCompany: Company+User only)
          vs auth.controller.js:110-117 (owner Employee on self-register);
          1002-1035 (reactivateCompany sets APPROVED unconditionally)
Problem:  Owner-less companies; owner cannot be represented as 'Company Owner'; REJECTED
          companies can be quietly approved.
Why:      Inconsistent tenancy data, broken team/owner semantics, approval governance bypass.
Fix:      Create the Employee owner row inside createCompany (same transaction); make
          reactivate transitional (SUSPENDED→APPROVED only) and require explicit approval
          for REJECTED.
```

### D8 — JWT stored in localStorage / no rate limiting / helmet unused

```text
Severity: HIGH (defence in depth)
File:     frontend/src/app/login/page.jsx:175; backend/src/app.js (no rate limiter, no helmet);
          backend/package.json:19
Problem:  Tokens are XSS-stealable; login has no throttle; no security headers.
Fix:      Prefer httpOnly+Secure+SameSite cookies (or short-lived access + refresh rotation),
          add express-rate-limit on auth + global, app.use(helmet()), pin JWT alg/issuer/
          audience, and add logout revocation (jti/passwordChangedAt).
```

---

## E. Medium / Low Priority Problems

| ID | Sev | File:Function | Problem | Why it matters | Recommended fix |
|---|---|---|---|---|---|
| E1 | MED | `settings.controller.js:257-299` getCompanyUsage | `Campaign`/`Booking` never imported (`1-4`) → ReferenceError → 500; `storageUsed:'0 MB'`, `storageLimit:'5 GB'` hardcoded (`287-288`) | Endpoint unusable; fake data in a real endpoint | Import the models; compute storage from `Creative.size` (define unit); make limits configurable |
| E2 | MED | `company.controller.js:248-288` monthlyPerformance | sort asc + `$limit 12` = oldest 12 months; no upper date bound; `$year/$month` in UTC | Dashboard chart is wrong | Sort desc, bound `date <= now`, map back to asc, use company timezone |
| E3 | MED | `company.controller.js:34-52, 149-182` | Month boundaries use server-local time and `createdAt`; `Company.timezone` is never read (only written by settings) | Spend cards shift for non-UTC/other-tz users | Compute boundaries in `company.timezone`; decide `date` vs `createdAt` and document it |
| E4 | MED | `company.controller.js:215, 377-380`; `Campaign.js:78-91` | `totalReach`/`engagement`/`progress` never written | Reach/engagement always 0 | Derive reach from station.reach×bookings or write counters on completion; drop the dead fields otherwise |
| E5 | MED | `creative.controller.js:85-93` + `company.controller.js:321-351` | Client-declared `url/size/mimeType`; storage summed without a unit | Storage numbers meaningless | Real upload (multer→S3), validate MIME/size/type, store bytes, render MB/GB in UI |
| E6 | MED | `admin.controller.js:3030-3093` deleteStation; `3769-3773` deleteIndividual | No booking/cascade checks → orphan bookings/campaigns/payments/logs | Dangling references, broken joins | Guard on existing bookings; cascade or soft-delete with a cleanup job |
| E7 | MED | `company.controller.js:666-724`; `employee.controller.js:199-256` | Permission changes/removals have no owner-only guard; audit `metadata:{email: employee.userId}` stores an id, not an email | Weak traceability; any employee can remove others | Require owner for removals/role changes; store real email/name in audit metadata |
| E8 | MED | `campaign.controller.js:113`; `Booking.js:36-40` vs `Schedule.js:24-32`; `department.controller.js:114,195` | `budget:0` rejected; `slot` unvalidated free text; unescaped regex in department names | UX/reliability/ReDoS | Fix validation; escape regex literals; validate slot against the enum |
| E9 | MED | `admin.controller.js:1571-1588, 1809` | Writes/reads `user.phone` on a schema without `phone` | Worker phone silently lost; audit records a phantom change | Add `phone` to User or store on Employee |

| E10 | MED | `admin.controller.js:3877-3921` resetIndividual | Returns plaintext `temporaryPassword`; resets login history | Credential exposure in responses/logs | Deliver out-of-band; force change at next login; dedicated audit action |
| E11 | MED | `admin.controller.js:3146-3212` | Admin can suspend another admin; ignores Employee/company state | Lateral admin lockout/admin misuse | Self/peer guards; explicit admin-management policy |
| E12 | LOW | `app.js:60-66` | Global handler always 500 and returns `err.message` | Leaks internals; wrong status codes | Map Mongoose/JWT errors (400/401/409), genericize 500s |
| E13 | LOW | `auth.validator.js:95-98` vs `frontend/src/lib/api.js:41-45` | Validation returns `errors[]` (no `message`) while the frontend reads only `message` | Registration errors invisible to users | Standardize `{success:false, message, errors?}` |
| E14 | LOW | `campaign.controller.js:78-81, 495-498`; createBooking vs getBooking | Response object shapes vary (spread vs `data`, raw ids vs populated) | Frontend coupling/ad-hoc parsing | Normalize the envelope and populated refs |
| E15 | LOW | `company.routes.js:22-113` vs `role.js:6-86` | Duplicate `requireCompany`, projection divergence | Drift; hard maintenance | Keep one implementation |
| E16 | LOW | `middleware/role.js:90-166`; `Admin.js`; `Schedule.js`; Booking proof fields | Dead code/fields/models (unused guards, unused Admin permissions, unused Schedule, unused proof fields) | Confusion, false sense of security | Delete or implement deliberately |
| E17 | LOW | AuditLog `entityId` is a String in the schema but ObjectIds are passed in several admin calls | Mixed types | Harder queries/aggregation | Cast to string consistently |
| E18 | LOW | `admin.controller.js:212-223, 263-289, 1074, 2270, 3105, 3256, 3984, 4078, 4369` and all list endpoints | Unpaginated lists, in-memory revenue sum, N+1 counts | Slow as data grows | Aggregation pipelines + pagination (page/limit) |

---

## F. Security Findings (priority order)

1. **C1 invite account takeover** (Critical, cross-tenant). `company.controller.js:598-615`
2. **C2 no permission enforcement / owner escalation** (Critical, intra-tenant). `role.js:90-166` unused; `company.controller.js:727-781`
3. **JWT in localStorage** (frontend) + no token revocation (`logout` is cosmetic). `login/page.jsx:175`; `auth.controller.js:289-310`
4. **No rate limiting** on login/register; **helmet unused**; weak security headers. `app.js`; `package.json:19`
5. **`token` file at repo root** with an admin JWT; **hardcoded admin credentials** in `createAdmin.js` → delete both artefacts and rotate secrets. `media-masters-main/token`; `src/scripts/createAdmin.js:14-15`
6. **D1 password-hash disclosure** via `.lean()` populate. `admin.controller.js:3940-3991`
7. **D2 audit-enum 500s** (integrity + misleading responses). `admin.controller.js:2935,2996`; `settings.controller.js:235`
8. **D3 client-controlled money**; **D4 status self-assertion** (incl. PAYMENT_SUCCESSFUL). `booking.controller.js:205-214,424`; `campaign.controller.js:328-385`
9. **D8/E5 no real file storage** — creatives are arbitrary URLs with unverified size/MIME. `creative.controller.js:85-93`
10. **S8 error leakage**, **S14 hardcoded CORS + unused FRONTEND_URL**, **S15 temp password in response**, **S16 .env without .env.example**. `app.js:12-15,60-66`; `admin.controller.js:3908-3920`
11. **Not vulnerable:** NoSQL operator injection (no raw-body queries, no `$where`), JWT forgery (secret not in code), plaintext password storage.

---

## G. Data Integrity Findings

- Owner-less companies created by `admin.createCompany`; self-registration is not transactional (orphans possible).
- Employee ↔ User status desync on removal/reactivation; `Employee.isActive` is not part of access checks.
- Campaign status can be any of 20 values at any time; `PAYMENT_*` states are unbacked by Payment documents (which are never written).
- Station deletion / individual deletion / campaign cascade leave orphans (bookings, payments, logs).
- Booking overlap check is read-then-write (double bookings possible); `station.inventoryStatus` never reflects bookings.
- Two duplicate station implementations with incompatible field usage (`status` vs `approvalStatus`, `price` vs `pricing`).
- No transactions on any multi-document write (see the Transaction section table).

---

## H. API Contract Findings (frontend ↔ backend)

1. Frontend calls `/api/v1/payments` (`frontend/src/app/admin/payments/page.js:63`) — **no such route** → 404.
2. Frontend admin departments page calls `/api/v1/departments` (`:54,86,120,152`) — that router requires a company account → **ADMIN gets 403**; no admin departments API exists.
3. Frontend station marketplace (`lib/api.js:476,481`) always receives `[]` (C3); admin station create/update payloads that include `pricing` are accepted only by the `/admin/stations` implementation.
4. Creative approve/reject/update/delete calls (`lib/api.js:596-607`) always 403 (D5).
5. Registration validation errors are `errors[]` while the frontend only reads `message` → generic error text (E13).
6. `token` sits outside `data` in login/register while everything else is inside `data` — works only because the login page reads `data.token` from the raw body (`login/page.jsx:175`).
7. Dashboard contract matches: `data.stats.totalSpend/activeCampaigns/employeeCount/pendingBookings/recentCampaigns/recentActivity` (`company/dashboard/page.js:88,126-134`).
8. `/settings/usage` returns 500, so any future usage widget must wait for E1.
9. Booking/creative endpoints return mixed ObjectId vs populated references (createBooking vs getBooking), requiring defensive frontend handling.

---

## I. Performance Findings

- No pagination anywhere (9+ unbounded list/admin queries).
- N+1 in `admin.getCompanies` (2 counts per company) and `department.getDepartments` (per-department counts).
- In-memory revenue summation (`admin.controller.js:212-223`) instead of an aggregation.
- Monthly aggregation returns the wrong window and scans bookings without a `{companyId,status}` index.
- Missing indexes: `User.companyId`, `Booking.{stationId,date}`, `Campaign.{companyId,status}`, `Creative.{campaignId,status}`, `Station.{approvalStatus,isActive}`.
- Storage `$lookup` on every dashboard load; booking conflict check loads a day's bookings into JS.
- Per-request `console.log` noise (User.js hashing/comparison logs) in the login path.

---

## J. Missing Features (required by the existing architecture — not invented)

1. **Payment integration** — model + statuses + audit actions + frontend page exist; no controller/routes/service; `PAYMENT_*` campaign statuses unbacked.
2. **Station accounts / station-side booking responses** — `STATION` in the User enum but no registration/login/authorization; booking `stationResponse/Note/proof*` fields are dead.
3. **Real file upload/storage for creatives** — no multer/static/S3; size/MIME unverified; storage unit undefined.
4. **Booking proof-of-run upload + verification** — fields exist, unused.
5. **Admin departments API** — frontend admin page exists, backend route is company-only.
6. **Payments list API** for the admin UI.
7. **Pagination/filtering/search** across list endpoints.
8. **Rate limiting + helmet wiring + `.env.example`**.
9. **User-initiated password reset / email verification** (`emailVerified` never set).
10. **Booking ↔ station inventory/pricing integration** (`Station.pricing` and `Schedule` unused).

---

## K. Recommended Fix Order

```text
1. Critical security/data issues
   - C1 invite account takeover
   - C2 permission enforcement + owner guards
   - Include Employee.isActive in company access checks
   - Delete the root `token` file and rotate JWT_SECRET/admin credentials
   - Remove hardcoded admin credentials from createAdmin.js
   - Add rate limiting on auth; mount helmet
2. Authentication / authorization
   - Standardize validation-error responses (message + errors)
   - JWT handling: cookie/refresh or short TTL + revocation
   - Fix AuditLog enum gaps (D2) so committed writes never return 500
3. Company / multi-tenant isolation
   - Transactional registration + admin createCompany + owner Employee row
   - Reactivate/approve state guards (no REJECTED→APPROVED bypass)
   - Single requireCompany implementation
   - Re-invite / removal lifecycle
4. Core business logic
   - Campaign transition map; remove `status` from generic update
   - Booking price from Station.pricing; snapshot price/currency
   - Unify station implementation (approvalStatus + pricing)
   - Creative ownership guard + block self-approval via update
   - Booking ↔ station availability/inventory
5. API consistency
   - One response envelope, consistent status codes, CastError→400
   - Pagination contract on all list endpoints
6. Dashboard / data correctness
   - Monthly window (last 12, bounded), company timezone, date vs createdAt
   - Reach/storage semantics and units; remove hardcoded strings
7. Performance
   - Add missing indexes; replace N+1/in-memory aggregations; bound list queries
8. Cleanup / refactoring
   - Dead models/fields (Schedule, Admin-permissions, proof fields), duplicated middleware,
     console logging, .env.example, seed-script hardening
```

---

## L. Backend Readiness Assessment

| Area | Status | Notes |
|---|---|---|
| Authentication | **NEEDS FIXES** | Solid core; missing throttling, verification, reset, revocation; invite takeover |
| Authorization | **NEEDS FIXES** | Role middleware exist but unused; creative guard broken |
| Companies | **NEEDS FIXES** | Status gating works; owner-record gap, reactivate bypass, non-transactional |
| Employees | **PARTIALLY IMPLEMENTED** | CRUD works; permissions unenforced; lifecycle bugs |
| Campaigns | **PARTIALLY IMPLEMENTED** | CRUD + scoping work; no status machine; dead counters |
| Bookings | **PARTIALLY IMPLEMENTED** | Scoping + transitions work; price client-controlled; no station actor/proof/payment |
| Stations | **PARTIALLY IMPLEMENTED** | Admin CRUD works; public list broken; no station accounts; pricing unused |
| Creatives | **PARTIALLY IMPLEMENTED** | Metadata CRUD; single-item endpoints dead; no real uploads/validation |
| Dashboard | **NEEDS FIXES** | Real, scoped data; month window/timezone/zero-reach/storage-unit defects |
| Audit Logs | **NEEDS FIXES** | Broad coverage + indexes; enum defects; some missing actions |
| API consistency | **NEEDS FIXES** | Mixed envelopes/status codes; frontend contract gaps |
| Security | **NEEDS FIXES** | 2 critical findings + hardening gaps |
| Data integrity | **NEEDS FIXES** | No transactions, orphans, status desync |
| Performance | **NEEDS FIXES** | No pagination, N+1, missing indexes |

---

**Bottom line:** the skeleton (auth, tenancy anchoring, scoping, audit model) is sound and the codebase *does* return real data — but it should **not** be integrated further until C1/C2/D2 are fixed, because the platform currently allows one company member to take over arbitrary accounts and every employee to act as the owner, while two "successful" admin/settings operations return 500 because of audit-enum misses. The station, payments, file-upload and station-response subsystems are schema-level only and must be treated as unbuilt.

*End of report. No application files were modified during this audit. Implementation of any fix in section K requires explicit approval.*
