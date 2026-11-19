# Tasks

## Now
- [ ] Owner: rotate the Google Maps key that is in git history (first commit, services/api/.env.test) and use a separate server key for Places/Routes
- [ ] Screens (web + mobile) for the new APIs: ride chat, issue reports, feedback form + admin feedback dashboard, surveys, announcements, emergency contacts, profile photo and rating card, car-type/AC filters
- [ ] Set up Firebase (FCM_PROJECT_ID, FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY) so phone push is actually delivered
- [ ] Owner: choose and pay for a staging server + domain + SMTP; then follow docs/deploy/staging.md
- [ ] Owner: decide on PostgreSQL row-level security (second tenant wall; costs extra DB round trips per request)

## Next
- [ ] Mobile: test the prototype screens on a phone with seeded users; then native packages: react-native-maps (swap components/route-map.tsx), expo-location (background GPS, replaces the simulator), expo-image-picker (driver documents, profile photo), expo-notifications (push via /me/devices), socket.io-client (replace polling)
- [ ] Spike: background GPS with expo-location vs Transistor library on physical devices
- [ ] Off-server backup copies + uptime monitor on staging
- [ ] Major upgrades to clear npm audit warnings: NestJS 12, Prisma 7 (prisma.config.ts), Zod 4, Expo 52+
- [ ] Faster hot paths if needed: /me does several queries; one API process handles ~190-360 req/s (run 2+ processes)
- [ ] Legal view on carpool cost sharing
- [ ] PDF reports and monthly settlement email (needs a PDF package; payments/pricing intentionally not built)

## Later
- [ ] Pilot with one company, then App Store + Play Store
- [ ] Masked calls; Enterprise module; Campus module; payments and subscriptions (switched on per client in the owner console)

## Done (recent)
- [x] Mobile: all 14 RYDO Share prototype screens on the existing APIs, plus report a problem (2026-11-18, Anjali, not committed)
- [x] Phase 1 gap APIs: issue reports, ride chat, feedback + surveys + insights, announcements, push, emergency contacts, blocks, profile card, car type + AC filters (2026-11-17, branch dipanshu/rydo-api)
- [x] Release 1.1: preferred drivers, waitlist, commute planner (My week) (2026-11-06)
- [x] Phase 5: GPS day partitions, Redis option, reports + CSV, company activity log, per-person rate limits, security tests, load test, Docker staging kit + backups (2026-11-06)
- [x] Phase 4: live trips, Socket.IO, simulator, SOS, long stop, off-route, share link, ratings (2026-11-06)
- [x] Owner console + Ops rides map (2026-11-06)
- [x] Maps everywhere + modern UI (2026-11-05)
- [x] Phases 1-3 + web rider/driver screens (2026-11-05)

## Build plan (web-first, agreed 2026-11-05)
1-5 done on the web (see journal). 6. Mobile catch-up on the same APIs, device testing, pilot.
