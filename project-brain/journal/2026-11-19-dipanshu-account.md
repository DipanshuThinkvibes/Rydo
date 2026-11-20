# 2026-11-19 Dipanshu: ID proof picklist, email verification, dark mode, account page

- Sign-up: ID proof picklist (Aadhaar, PAN, Passport, Driving licence, Voter ID) with per-type format checks. Only the last 4 characters are sent and stored (`EmployeeRegistration.idType`, `idLast4`).
- Email verification: `users.email_verified_at`; endpoints `GET /me/email`, `POST /me/email/verify/send`, `POST /me/email/verify`. OTP or Google sign-in also marks the email verified. `/me` returns `user.emailVerified`.
- Web: light/dark/system theme (`data-theme` on html, no-flash script, ThemeToggle in headers, ThemePicker on account page). Account page redesigned with verification card.
- Migration: `20261120100000_id_proof_and_email_verified`. API suite: 211 tests passing. Web `tsc` and `eslint` clean.
- Not committed yet (ask first). Backend files belong on `dipanshu/rydo-api`, web files on `dipanshu/rydo-web`.
- Still open: check dark mode on every page, rotate the exposed Google key, real SMTP for email codes.
