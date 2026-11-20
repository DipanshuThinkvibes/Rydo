---
project: RYDO
status: active
last_log: 2026-11-18
---

# Progress

## Current state
Web-first build of Release 1 (RYDO Share, carpool for companies) is complete through Phase 5 on the web: admin portal, rider and driver screens with live Google maps, RYDO owner console (client onboarding, features, seat limits, support view, activity, health), Ops rides map, live trips (simulator, PIN boarding, SOS, share link, ratings), reports + CSV, company activity log, security hardening, load test, and a Docker staging kit with HTTPS and nightly backups. 99+ API e2e tests pass. Phase 1 gap APIs (issue reports, ride chat, feedback + surveys + insights, announcements, push registration + sending, emergency contacts, blocks, profile photo/rating card, car-type + AC filters) are built on branch dipanshu/rydo-api (see ENGAGEMENT_API.md in services/api); they have no web or mobile screens yet. Mobile app (Expo): all 14 screens of the RYDO Share prototype are built on the existing APIs (rider, driver, commute, admin; see journal 2026-11-18-anjali), not yet run on a phone; maps/icons drawn without packages, live data polled, driver GPS simulated. Payments and pricing are deliberately not built: everything is free for now. Ownership model: Thinkvibes runs RYDO; clients manage only their own company.

## Milestones
- [x] Project brain, git, source review, architecture proposal, prototype v2
- [x] Phase 0 data model, API list, design system
- [x] Phase 1 Foundation (auth, tenancy, admin web)
- [x] Phase 2 Driver verification
- [x] Phase 3 Rides, matching, booking + web rider/driver screens + Ops map
- [x] Owner console (RYDO platform side)
- [x] Phase 4 Live trips on the web (simulator; real GPS needs phones)
- [x] Phase 5 Hardening + staging kit (staging server itself not rented yet)
- [x] Phase 1 gap APIs (backend only; screens still to build)
- [ ] Screens for chat, issue reporting, feedback, surveys, safety contacts and profile photo (web and mobile)
- [ ] Staging server live (owner picks and pays for a server)
- [x] Mobile screens from the RYDO Share prototype (all 14, on the same APIs)
- [x] Mobile self sign-up (find company, details, email code or Google) on the shared sign-up API
- [x] Mobile has the web's employee and company-admin features (owner console, ops map and CSV stay web-only)
- [ ] Mobile: run on a phone, add native packages (maps, background GPS, photo picker, push, sockets), real-phone GPS test
- [ ] Pilot with one company
- [ ] Release 1 in App Store + Play Store

## Start here next time
1. Owner decision: rent a staging server (guide: docs/deploy/staging.md) and decide on PostgreSQL row-level security.
2. Build web and mobile screens for the new APIs (chat, issues, feedback, surveys, emergency contacts, photo). Rotate the Google key that was committed in git history.
3. Mobile app: `npm run build -w @rydo/shared`, typecheck, run in Expo and test every prototype screen; then add expo-location (background GPS), react-native-maps, expo-image-picker, expo-notifications, socket.io-client.
