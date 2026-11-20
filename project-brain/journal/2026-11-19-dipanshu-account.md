# 2026-11-19 Dipanshu: ID proof picklist, email verification, dark mode, account page

- Sign-up: ID proof picklist (Aadhaar, PAN, Passport, Driving licence, Voter ID) with per-type format checks. Only the last 4 characters are sent and stored (`EmployeeRegistration.idType`, `idLast4`).
- Email verification: `users.email_verified_at`; endpoints `GET /me/email`, `POST /me/email/verify/send`, `POST /me/email/verify`. OTP or Google sign-in also marks the email verified. `/me` returns `user.emailVerified`.
- Web: light/dark/system theme (`data-theme` on html, no-flash script, ThemeToggle in headers, ThemePicker on account page). Account page redesigned with verification card.
- Migration: `20261120100000_id_proof_and_email_verified`. API suite: 211 tests passing. Web `tsc` and `eslint` clean.
- Not committed yet (ask first). Backend files belong on `dipanshu/rydo-api`, web files on `dipanshu/rydo-web`.
- Still open: check dark mode on every page, rotate the exposed Google key, real SMTP for email codes.

## Super admin persona (same day)
- Platform block: `memberships.platform_blocked_at/_reason/_by_id` (migration `20261120200000_platform_block`). RYDO blocks one person in one company; the company admin cannot reactivate (403).
- API (platform admin only, privacy-safe: shortened name, masked email, no phone/ID/places): `GET /admin/platform/people`, `GET people/:id`, `POST people/:id/block|unblock {reason}`, `GET reports`, `GET reports/summary`. Public `GET /public/companies` now reads the database for sign-up.
- Repeat-report flag: 2 or more reports against one person within 90 days.
- Web: `/platform/people` and `/platform/reports` + nav items. API suite 225 tests passing; web tsc/eslint clean. Pages not yet clicked through in the browser.
- Super admin Overview redesigned: hero summary, 6 KPI tiles (clients, employees, carpool adoption %, trips shared, CO2 saved, fuel saved), weekly shared-trips chart, top clients by adoption, Needs attention (new onboarding requests, HR waiting, quiet clients, SOS, failed jobs), safety panel. Removed rides today, seats booked, open requests, Google Maps usage and background-jobs cards.
- New API `GET /admin/platform/impact` (30-day carpool numbers across all clients). API suite 227 passing.

## Licences (super admin)
- New table `licenses` (migrations `20261120300000_licenses`, `..300100_licenses_defaults`): product SHARE / ENTERPRISE / CAMPUS per company, status ACTIVE / SUSPENDED / REVOKED, startsAt, expiresAt (null = no end). Existing clients were backfilled with a no-end-date licence for each module they already had.
- Enforcement: `org.guard` and `/me` use `applyLicenses()` (shared). No valid licence = product off; carpool routes answer 403 `LICENSE_INACTIVE`. Issuing a licence also switches its module on.
- Super admin API: `GET /admin/platform/licenses`, `/licenses/summary`, `GET organizations/:id/licenses`, `PUT organizations/:id/licenses/:product` (issue/renew), `POST .../suspend|resume|revoke {reason}`. New clients get a Share licence (optional `licenseEndsOn`). No pricing or payment: licences are access and dates only.
- Web: `/platform/licenses`, Licences card on each client page, Overview shows licence attention items, company banner when Share is inactive or ending in 14 days.
- Tests: 240 API tests passing (new `licenses.e2e-spec.ts`; test fixtures now give each company a Share licence).

## Settings page and Account redesign
- New `/settings` (Appearance, Notifications, Security, Safety and privacy) and a redesigned `/account` (hero, profile strength checklist, email verification, profile form, shortcuts). Password change and theme moved to Settings.
- API: `GET/PATCH /me/settings` (email and push choices; stored in `users.notification_prefs`, migration `20261120400000_notification_prefs`), `GET /me/sessions`, `DELETE /me/sessions/:id`, `POST /me/sessions/revoke-others`.
- `NotificationsService` now honours the choices; SOS and account notices (types starting SOS or ACCOUNT_) are always sent. In-app inbox is always kept.
- 249 API tests passing; web tsc and eslint clean.

## Account hub redesign (all personas)
- `/account` and `/settings*` now share one identity header and a role-aware tab bar (`components/account-hub.tsx`, route group `(admin)/(account)`). Tabs: Profile, Preferences, Security, Safety & privacy (company members only), and a role tab (Rider "My rides", Driver "Driving", admins "Admin tools", owner "RYDO owner").
- Header colour, badges and the role page change with who you are: RYDO owner, Org admin, HR admin, Ops admin, Driver, Rider (a person can hold several). Role page lists what each persona can do plus shortcuts; drivers also see verification status and ride preferences.
- Web tsc/eslint clean; checked in light and dark. No backend change.
- Devices list reworked: `GET /me/sessions` now also returns sessions that ended in the last 30 days with `status` (ACTIVE / SIGNED_OUT / EXPIRED) and `endedAt`; this device is listed first. Security tab shows "This device" (Active now), "Other devices" (first 3, Show all), and a collapsed "Earlier sessions". Friendly dates via `fmtWhenFriendly`. Header "Not verified" links to the email step. 250 API tests passing.

## Session lifetimes
- Mobile app: a sign-in ends 14 days after it started; refreshing does not extend it. Website: ends after 2 hours without use (each use starts the 2 hours again). Constants in `services/api/src/auth/cookies.ts` (`MOBILE_SESSION_SEC`, `WEB_IDLE_SEC`). New column `sessions.last_active_at` (migration `20261120500000_session_activity`); activity is written at most once a minute. Previously every session slid 30 days.
- Web: an open tab now notices a removed/expired session within a minute (and when the tab comes back), and signs out after 2 hours without mouse/keyboard use. Sign-in page explains why. Files: `lib/session-end.ts`, `lib/session.tsx`, `lib/api.ts`, `app/sign-in/page.tsx`.
- Existing sessions keep their old end dates until they are next refreshed; websites then move to the 2-hour rule. 261 API tests passing.

## Profile photo fix and persona headers
- Photo upload: the website uploaded straight to the storage server (port 9000), whose cross-origin answer had no `Access-Control-Allow-Origin`, so browsers blocked it. Now `POST /me/photo/file` (multipart, 5 MB, JPG/PNG/WebP with a real-image check) uploads through the API, like the company logo. `GET /me/photo` gives any account (incl. RYDO staff) its photo. The signed-link endpoints stay for the mobile app.
- `GET /me/highlights`: four counts picked by the person's most senior role (owner, Org admin, HR, Ops, driver, rider); counts only, scoped to the company. `/me` now returns `user.platformRole` (SUPER_ADMIN, SUPPORT or null).
- Web: account header has a persona colour band with dotted pattern and watermark icon, the four numbers, and a RYDO support persona (read-only, logged; no tools until a super admin gives access). 273 API tests passing (the tracking spec is occasionally flaky near midnight/by timing; unrelated).
