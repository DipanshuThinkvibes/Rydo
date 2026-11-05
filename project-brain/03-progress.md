---
project: RYDO
status: active
last_log: 2026-11-06
---

# Progress

## Current state
Web-first build of Release 1 (RYDO Share, carpool for companies) is complete through Phase 5 on the web: admin portal, rider and driver screens with live Google maps, RYDO owner console (client onboarding, features, seat limits, support view, activity, health), Ops rides map, live trips (simulator, PIN boarding, SOS, share link, ratings), reports + CSV, company activity log, security hardening, load test, and a Docker staging kit with HTTPS and nightly backups. 99+ API e2e tests pass. Ownership model: Thinkvibes runs RYDO; clients manage only their own company.

## Milestones
- [x] Project brain, git, source review, architecture proposal, prototype v2
- [x] Phase 0 data model, API list, design system
- [x] Phase 1 Foundation (auth, tenancy, admin web)
- [x] Phase 2 Driver verification
- [x] Phase 3 Rides, matching, booking + web rider/driver screens + Ops map
- [x] Owner console (RYDO platform side)
- [x] Phase 4 Live trips on the web (simulator; real GPS needs phones)
- [x] Phase 5 Hardening + staging kit (staging server itself not rented yet)
- [ ] Staging server live (owner picks and pays for a server)
- [ ] Mobile app on the same APIs, real-phone GPS test
- [ ] Pilot with one company
- [ ] Release 1 in App Store + Play Store

## Start here next time
1. Owner decision: rent a staging server (guide: docs/deploy/staging.md) and decide on PostgreSQL row-level security.
2. Then the mobile app (Expo) on the same APIs: sign-in, Find a ride, My trips with live map, Drive with background GPS (replace the web simulator).
