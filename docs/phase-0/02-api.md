# RYDO Release 1 — API list

Status: Phase 0 draft, 2026-11-05. One NestJS API serves both clients. Tables: [`schema.prisma`](schema.prisma), rules: [`01-data-model.md`](01-data-model.md).

## 1. Conventions

| Topic | Rule |
| --- | --- |
| Base URL | `/api/v1` (versioned; a breaking change means `/api/v2`, old apps keep working) |
| Auth: mobile | `Authorization: Bearer <access token>` (15 min) + rotating refresh token (30 days) |
| Auth: web | Same tokens in `httpOnly`, `Secure`, `SameSite=Strict` cookies + CSRF token |
| Tenant | `X-Org-Id` header; the API checks the caller has an ACTIVE membership there. Never trusted from the body |
| Success | `{ "data": …, "meta": { "nextCursor": … } }` |
| Error | `{ "error": { "code": "SEAT_TAKEN", "message": "…", "fields": { … } } }` |
| Lists | Cursor pagination: `?cursor=&limit=` (max 50) |
| Retries | `Idempotency-Key` header on POSTs that create requests, bookings, SOS and location batches |
| Rate limits | Per user; OTP: 5 per email per hour |

Legend for "Who": **R** rider, **D** driver, **OA** Org Admin, **HR** HR Admin, **OPS** Ops Admin, **SA** Super Admin. Mobile = R/D, web = OA/HR/OPS/SA.

## 2. Mobile app endpoints

### Sign-in and profile

| Method + path | Who | Does |
| --- | --- | --- |
| `POST /auth/otp/request` | anyone | Email must match a company domain; sends 6-digit code |
| `POST /auth/otp/verify` | anyone | Returns tokens + memberships; creates a PENDING membership on first sign-in |
| `POST /auth/refresh` · `POST /auth/logout` | signed in | Rotate / revoke session |
| `GET /me` · `PATCH /me` | signed in | Name, photo, gender (for women-only) |
| `GET /me/memberships` | signed in | Companies and roles; status PENDING shows "waiting for HR" |
| `POST /me/device-tokens` · `DELETE /me/device-tokens/:token` | signed in | Push registration |
| `GET/POST/DELETE /me/emergency-contacts` | R, D | For SOS |
| `GET/POST/PATCH/DELETE /me/places` | R, D | Home, Office, other saved places |
| `PATCH /me/preferences` | R | Women-only, AC, quiet, auto-rematch, auto-book |
| `POST /blocks` · `DELETE /blocks/:membershipId` | R, D | Blocked people are never matched |

### Becoming a driver

| Method + path | Who | Does |
| --- | --- | --- |
| `POST /driver/profile` · `GET /driver/profile` | R | Starts driver verification |
| `PATCH /driver/profile` | D | Approval mode (manual / auto-accept team), ride preferences |
| `POST /driver/vehicles` · `PATCH /driver/vehicles/:id` | D | Car or bike, plate, seats, AC |
| `POST /uploads/sign` | D | Short-lived upload URL for a document photo |
| `POST /driver/documents` | D | Register uploaded license / RC with number and expiry |

### Driver: publish and run rides

| Method + path | Who | Does |
| --- | --- | --- |
| `POST /ride-plans` | D (verified) | Publish one-off or repeating ride; rides are generated 14 days ahead |
| `GET /ride-plans/mine` · `PATCH /ride-plans/:id` · `DELETE /ride-plans/:id` | D | Edit or stop a plan; riders on future rides are notified |
| `GET /rides/driving?date=` | D | Today's / upcoming rides with booked riders and pickup order |
| `GET /rides/:id/requests` | D | Pending requests for a ride |
| `POST /requests/:id/accept` · `POST /requests/:id/decline` | D | Accept runs the seat-locking transaction |
| `POST /rides/:id/start` | D | Status IN_PROGRESS; tracking begins |
| `POST /rides/:id/stops/:stopId/arrived` | D | Starts the rider's wait timer |
| `POST /bookings/:id/verify-pin` | D | Wrong PIN → error; right PIN → BOARDED |
| `POST /bookings/:id/no-show` | D | Allowed only after `noShowAfterMinutes` |
| `POST /rides/:id/complete` · `POST /rides/:id/cancel` | D | Cancel inside the free window counts as late |

### Rider: find, book, ride

| Method + path | Who | Does |
| --- | --- | --- |
| `POST /rides/search` | R | Pickup, drop, date, time window, seats, filters → rides with match % and reasons |
| `GET /rides/:id` | R | Rider view of one ride (no phone numbers) |
| `POST /rides/:id/requests` | R | Request seats; `autoRematch` on by default |
| `GET /me/requests` · `POST /requests/:id/cancel` | R | Pending requests |
| `GET /me/bookings?status=` · `GET /bookings/:id` | R | Booking includes the 4-digit PIN for this rider only |
| `POST /bookings/:id/cancel` | R | Warns when inside the free-cancel window |
| `POST /waitlist` · `DELETE /waitlist/:id` | R | Alert when a matching ride appears |
| `GET /me/commute?week=2026-W45` | R | Weekly planner |
| `PUT /me/commute/:date` | R | Office / WFH / Leave, times, auto-book |
| `POST /me/commute/skip-today` | R | Cancels today's bookings and tells the driver |
| `GET/POST/DELETE /me/preferred-drivers` | R | Preferred drivers get requests first |

### During and after the trip

| Method + path | Who | Does |
| --- | --- | --- |
| `POST /rides/:id/locations` | D | Batch of GPS points (offline queue); live points also go over the socket |
| `GET /rides/:id/live` | R, D on ride | Last position, ETA, freshness |
| `POST /rides/:id/share-link` | R | Time-limited public link for family; expires when the ride ends |
| `POST /rides/:id/long-stop/ok` | R, D on ride | Answers "Everything OK?" |
| `POST /rides/:id/sos` | R, D on ride | Alerts company security + emergency contact; captures location |
| `GET /rides/:id/messages?after=` · `POST /rides/:id/messages` | R, D on ride | Chat opens after acceptance, closes 30 days after the ride |
| `POST /rides/:id/ratings` | R, D on ride | Stars + tags; one per pair per ride |
| `POST /issues` | R, D | Report a problem |
| `GET /me/notifications` · `POST /me/notifications/read` | signed in | Inbox |

### Maps (keys stay on the server)

| Method + path | Who | Does |
| --- | --- | --- |
| `GET /maps/autocomplete?q=&session=` | R, D | Google Places autocomplete with session tokens |
| `GET /maps/places/:placeId` | R, D | Lat/lng for a chosen place |

The app renders map tiles itself with a restricted Google Maps key; routing, ETA and places go through `MapsAdapter` in the API.

## 3. Web admin endpoints

| Method + path | Who | Does |
| --- | --- | --- |
| `GET /admin/platform/organizations` · `POST …` · `PATCH …/:id` | SA | Create, activate, suspend companies |
| `POST /admin/platform/organizations/:id/admins` | SA | Invite the first Org Admin |
| `GET /admin/org` · `PATCH /admin/org` | OA | Name, logo, email domains, ride rules (`settings`) |
| `GET/POST/PATCH/DELETE /admin/offices` · `/admin/departments` | OA | Company structure |
| `GET /admin/members?status=&role=&q=` | OA, HR | Employee directory |
| `PATCH /admin/members/:id/roles` | OA | Grant HR / Ops / Org Admin |
| `POST /admin/members/:id/approve` · `/reject` · `/suspend` | HR | Approval queue; every action audited |
| `GET /admin/drivers?status=` | HR | Driver verification queue |
| `GET /admin/documents/:id/view-url` | HR | Signed URL valid for minutes; each view audited |
| `POST /admin/drivers/:id/verify` · `POST /admin/documents/:id/reject` | HR | Verify or ask for re-upload with a reason |
| `GET /admin/rides?date=&status=` · `GET /admin/rides/:id` | OPS | Ride list; detail with stops, events, bookings |
| `GET /admin/live` | OPS | Active rides with last positions (then socket updates) |
| `GET /admin/sos?status=` · `POST /admin/sos/:id/acknowledge` · `/resolve` | OPS | SOS handling |
| `GET /admin/issues` · `PATCH /admin/issues/:id` | OPS, HR | Assign, update, resolve |
| `GET /admin/reports/summary?from=&to=` | OA, OPS | Rides, participants, cancellations, no-shows, km shared, CO₂ |
| `GET /admin/reports/export.csv` | OA, OPS | Same data as CSV |
| `GET /admin/audit-logs` | OA | Who did what, when |

## 4. Realtime (Socket.IO, namespace `/rt`)

Connect with the access token; the server joins the socket to rooms it is allowed in.

| Room | Members |
| --- | --- |
| `user:{userId}` | That user's devices |
| `ride:{rideId}` | Driver and booked riders, only while the ride is active |
| `org:{orgId}:ops` | Ops / Org Admins on the web |

| Event | Direction | Payload / effect |
| --- | --- | --- |
| `location.push` | driver → server | Batch of points; validated (driver, active ride, accuracy, speed) |
| `location.update` | server → ride room, ops room | Latest point + ETA + stale flag |
| `request.new` | server → driver | Opens the 20-second pop-up |
| `request.decided` | server → rider | Accepted / declined / expired (+ auto-rematch result) |
| `ride.status` | server → ride room | Started, arrived, boarded, completed, cancelled |
| `chat.message` | server → ride room | New message |
| `ride.long_stop` | server → ride room | "Everything OK?" prompt |
| `sos.raised` · `sos.updated` | server → ops room | Red banner on the web dashboard |
| `notification.new` | server → user | Inbox badge |

## 5. Who can do what (mapped in code)

| Capability | R | D | HR | OPS | OA | SA |
| --- | --- | --- | --- | --- | --- | --- |
| Book rides, commute planner | ✓ | ✓ | ✓* | ✓* | ✓* | |
| Publish rides | | ✓ | | | | |
| Approve employees, verify drivers | | | ✓ | | ✓ | |
| View documents | | own | ✓ | | | |
| Live map, SOS, issues | | | | ✓ | ✓ | |
| Company settings, roles | | | | | ✓ | |
| Create companies | | | | | | ✓ |

*Admins who also commute hold the Rider role too. A live location is visible only to people on that ride and to OPS/OA during an active ride or SOS.

## 6. Background jobs

Run behind a `JobQueue` adapter. Release 1 uses **pg-boss** (a queue stored in the same PostgreSQL), so no Redis is needed yet; switch the adapter to BullMQ on Redis when load requires it.

| Job | When |
| --- | --- |
| Generate rides from plans (14 days ahead) | Nightly |
| Expire requests, run auto-rematch | Every request's `expiresAt` |
| Auto-book commute days | Sunday evening, then hourly for changes |
| Match waitlist entries | When rides are published or seats free up |
| Long-stop detector | Every 30 s per active ride |
| Ride reminders (30 min before) | Per booking |
| Document expiry → driver EXPIRED | Nightly |
| Retention cleanup, next day's GPS partition | Nightly |
