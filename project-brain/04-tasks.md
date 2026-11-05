# Tasks

## Now
- [ ] Owner: choose and pay for a staging server + domain + SMTP; then follow docs/deploy/staging.md
- [ ] Owner: decide on PostgreSQL row-level security (second tenant wall; costs extra DB round trips per request)

## Next
- [ ] Mobile app (Expo) on the same APIs: sign-in, Find a ride, My trips + live map, Drive + background GPS, push notifications
- [ ] Spike: background GPS with expo-location vs Transistor library on physical devices
- [ ] Off-server backup copies + uptime monitor on staging
- [ ] Major upgrades to clear npm audit warnings: NestJS 12, Prisma 7 (prisma.config.ts), Zod 4, Expo 52+
- [ ] Faster hot paths if needed: /me does several queries; one API process handles ~190-360 req/s (run 2+ processes)
- [ ] Release 1.1: commute planner, preferred drivers, waitlist
- [ ] Legal view on carpool cost sharing

## Later
- [ ] Pilot with one company, then App Store + Play Store
- [ ] Masked calls; Enterprise module; Campus module; payments and subscriptions (switched on per client in the owner console)

## Done (recent)
- [x] Phase 5: GPS day partitions, Redis option, reports + CSV, company activity log, per-person rate limits, security tests, load test, Docker staging kit + backups (2026-11-06)
- [x] Phase 4: live trips, Socket.IO, simulator, SOS, long stop, off-route, share link, ratings (2026-11-06)
- [x] Owner console + Ops rides map (2026-11-06)
- [x] Maps everywhere + modern UI (2026-11-05)
- [x] Phases 1-3 + web rider/driver screens (2026-11-05)

## Build plan (web-first, agreed 2026-11-05)
1-5 done on the web (see journal). 6. Mobile catch-up on the same APIs, device testing, pilot.
