# Media Masters — MVP launch checklist

Everything here needs your accounts (Vercel, Atlas, Resend), so it is done by you, not the code.

## 1. Settings (Vercel → backend project → Environment Variables)
Names are listed in `backend/.env.example`. New ones in this release:

| Name | Value |
|---|---|
| `RESEND_API_KEY` | From resend.com → API Keys (sending access only) |
| `MAIL_FROM` | e.g. `Media Masters <no-reply@yourdomain.com>` — the domain must be verified in Resend |
| `APP_URL` | The frontend address, e.g. `https://media-masters-x.vercel.app` |
| `ALLOW_DIRECT_BOOKING` | Leave **unset** (unpaid direct bookings stay off) |

Without `RESEND_API_KEY` + `MAIL_FROM` the app works but sends no email.

Also new for plans, discounts, reminders and SMS:

| Name | Value |
|---|---|
| `SUBSCRIPTION_REQUIRED` | `true` (advertisers need a plan to check out) |
| `MULTI_STATION_DISCOUNTS` | `3:5,5:10` (5% for 3+ stations, 10% for 5+) |
| `CRON_SECRET` | A long random string (16+ characters) |
| `TERMII_API_KEY`, `TERMII_SENDER_ID` | From termii.com; the sender ID must be approved. Without them no SMS is sent |

**Slot reminders (24 h and 1 h before).** Vercel Hobby crons run only once a day, so use an external scheduler (e.g. cron-job.org) to call this every 5 minutes:

`POST https://<backend>/api/v1/jobs/reminders` with the header `Authorization: Bearer <CRON_SECRET>`

Each reminder is sent once, so calling it more often is safe. On a normal server (not Vercel) the backend runs it by itself every 5 minutes.

## 2. Atlas
- Audit user: change its role from `readAnyDatabase@admin` to `read` on the `test` database only.

## 3. Fix the company with no owner record
Admin → Users → Companies → open company `6aa1dd78a849a38ccdb44cfd`.
An "Owner record needs attention" panel explains the problem. If it offers **Create / Reactivate owner record**, click it (recorded in the audit log). If it shows a problem it can't fix, send me the message.

## 4. Walk-through on the deployment (about 20 minutes)
1. Register an individual → create a campaign → add two spots on two stations to the cart → check out (test payment).
   Expect: confirmation page; receipt email; each station manager gets a "new request" email.
2. Sign in as a station manager (first sign-in asks for a new password) → accept one request, decline the other.
   Expect: advertiser emails ("accepted", "declined — refunded").
3. As the advertiser, cancel the accepted booking → check the refund shown matches the cancellation quote.
4. Forgot password from the sign-in page → email link → set a new password → sign in.
5. As a company owner, invite a team member → open the invitation email → accept → sign in as them.
6. Admin → Payments: the checkout from step 1 is listed with the refunds.
7. Admin → approve a pending company → its owner gets the "approved" email.

## Still not live
- **Real payments**: checkout uses the test (stub) provider; no money moves. Paystack is the next build.
