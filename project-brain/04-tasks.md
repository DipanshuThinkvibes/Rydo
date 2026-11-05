# Tasks

## Now
- [ ] Owner to answer open questions 1-4 (team + timeline, Mac/Apple account, in-app admin OK, sign-in method)

## Next
- [ ] Phase 0: Release 1 data model (Share tables) + API endpoint list
- [ ] Owner review of prototype v2; collect changes
- [x] Scope check of v2 features done 2026-11-05 (see 02-decisions.md)
- [ ] Spike: background GPS with expo-location vs Transistor library on physical devices
- [ ] Legal view on carpool cost sharing

## Later
- [ ] Phase 1 Foundation: monorepo, CI, NestJS skeleton, Postgres + PostGIS, own auth, tenancy + RBAC, adapter skeletons, cross-tenant tests
- [ ] After Release 1: web app on same API, Enterprise module, Campus module, payments

## Done
- [x] Prototype v2: 14 screens, new visual system (2026-10-30)
- [x] Clickable mobile prototype on Claude Design, 7 screens (2026-10-29)
- [x] Initialize project brain and git repo (2026-10-29)
- [x] Review 5 Rydo docs + master prompt (2026-10-29)
- [x] Publish architecture proposal doc (2026-10-29)
- [x] Update proposal with owner decisions: no Supabase, Share-only, mobile-first, Google Maps, replaceable tech (2026-10-29)



## Build plan (web-first, agreed direction 2026-11-05)
1. Phase 1 wrap-up (web): forgot password; Org Admin settings (name, logo, email domains, ride rules); offices and departments; role management screen; employee search.
2. Phase 2 Verification: API for driver profile, vehicles, document upload (signed URLs); web HR review queue (view license/RC, verify, ask re-upload, expiry alerts).
3. Phase 3 Rides: ride plans + nightly ride generation (pg-boss), Google Maps adapter, PostGIS matching, requests/bookings with seat locking and ride PIN; web Ops ride list + ride detail. Needs Google Maps API key.
4. Phase 4 Live: Socket.IO tracking, web live map, SOS alerts, long-stop check. Mobile background GPS needs real phones.
5. Phase 5 Hardening + staging: reports/CSV, audit log viewer, RLS, load + security tests, deploy to a staging server, backups.
6. Mobile catch-up on the same APIs, device testing, pilot.