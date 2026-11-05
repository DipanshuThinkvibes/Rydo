# RYDO Release 1 — Data model

Status: Phase 0 draft, 2026-11-05. Source of truth for tables is [`schema.prisma`](schema.prisma) (validated with Prisma 6). This page explains the shape and the rules the schema alone cannot show.

Release 1 = RYDO Share (carpool) for company tenants. One PostgreSQL 16 + PostGIS database serves both clients through one NestJS API:

- **Mobile app** (Android + iOS): riders and drivers.
- **Web app**: admins only (Super Admin, Org Admin, HR Admin, Ops Admin).

## 1. Tables at a glance (32)

| Group | Tables | Used by |
| --- | --- | --- |
| Platform & tenancy | organizations, offices, departments | Web (Super Admin, Org Admin) |
| Identity & access | users, platform_admins, otp_codes, sessions, device_tokens, memberships, membership_roles, saved_places, emergency_contacts, user_blocks | Both |
| Drivers & verification | driver_profiles, vehicles, documents | Mobile uploads, web reviews |
| Carpool | ride_plans, rides, ride_stops, ride_requests, bookings, waitlist_entries, ratings, preferred_drivers, commute_days | Mostly mobile; web reads |
| Tracking | vehicle_locations, ride_events | Mobile writes, both read |
| Communication & safety | messages, notifications, sos_events, issue_reports, audit_logs | Both |

## 2. Core ideas

**User vs membership.** A `user` is a person (email, name, phone). A `membership` is that person inside one company: status, department, roles, reliability score, preferences. Everything company-specific (rides, bookings, ratings) points to the membership, never directly to the user. This keeps multi-company support free later.

**Roles.** Release 1 has a fixed set: `ORG_ADMIN`, `HR_ADMIN`, `OPS_ADMIN`, `RIDER`, `DRIVER` per membership, plus `SUPER_ADMIN` / `SUPPORT` in `platform_admins`. A person can hold several (Rider + Driver; HR Admin + Rider). Permissions per role are mapped in code (see [`02-api.md`](02-api.md)); a permissions table can be added later without changing callers.

**Ride plan → ride → request → booking.**

| Table | Meaning | Example |
| --- | --- | --- |
| `ride_plans` | What a driver publishes once | "Mon–Fri, 8:30 AM to Acme Tech, return 6:30 PM, 3 seats" |
| `rides` | One run on one date, generated from a plan (or one-off) | "Thu 6 Nov, 8:30 AM" |
| `ride_requests` | A rider asks for seats on a ride | Priya asks for 1 seat, pickup 27th Main |
| `bookings` | An accepted request; holds the 4-digit ride PIN | Priya confirmed, PIN 4827 |

Live tracking, chat, ratings, stops and events all hang off the **ride**, so the same pipeline later serves Enterprise shuttles and Campus buses (their `routes` and `schedules` will also generate rides).

**PostGIS.** Points (`geography(Point,4326)`) for offices, saved places, pickups, drops, ride origin/destination; a `geography(LineString,4326)` route line per ride from Google Directions. Matching uses `ST_DWithin(route_line, pickup, radius)` and `ST_LineLocatePoint` to check the pickup comes before the drop along the route. GiST indexes on every geography column.

## 3. Lifecycles

| Entity | States | Who moves it |
| --- | --- | --- |
| Membership | PENDING → ACTIVE / REJECTED; ACTIVE → SUSPENDED / LEFT | HR Admin on web |
| Driver profile | PENDING → VERIFIED / REJECTED; VERIFIED → EXPIRED (license or RC expiry) | HR Admin on web; nightly job for expiry |
| Ride | SCHEDULED ⇄ FULL → IN_PROGRESS → COMPLETED; SCHEDULED/FULL → CANCELLED | Driver; system sets FULL when seats run out |
| Ride request | PENDING → ACCEPTED / DECLINED / EXPIRED / CANCELLED | Driver decides; timer expires; rider cancels |
| Booking | CONFIRMED → BOARDED → COMPLETED; CONFIRMED → NO_SHOW / CANCELLED_BY_RIDER / CANCELLED_BY_DRIVER | Driver enters PIN or marks no-show; either side cancels |
| SOS | ACTIVE → ACKNOWLEDGED → RESOLVED | Admin on web |
| Issue | OPEN → IN_PROGRESS → RESOLVED | Admin on web |

## 4. Rules the database enforces (raw SQL in the first migration)

- `CHECK (seats_booked >= 0 AND seats_booked <= seats_total)` on `rides`.
- `CHECK (stars BETWEEN 1 AND 5)` on `ratings`; `CHECK (seat_capacity BETWEEN 1 AND 6)` on `vehicles`.
- Partial unique index: one `PENDING` request per (ride, rider).
- `vehicle_locations` is `PARTITION BY RANGE (recorded_at)`, one partition per day.
- GiST indexes on all geography columns.
- Row-level security on tenant tables, keyed on `current_setting('app.organization_id')`, as a second safety net. The API's tenant guard remains the main check.

**Accepting a request** runs in one transaction: lock the ride row (`SELECT … FOR UPDATE`), check seats, insert the booking with a fresh PIN, increment `seats_booked`, set the request to ACCEPTED, set the ride to FULL if needed. Two riders racing for the last seat: exactly one wins.

## 5. Company ride rules (`organizations.settings`, edited on web)

| Setting | Default | Used for |
| --- | --- | --- |
| `freeCancelHours` | 2 | Rider/driver cancel inside this window → `late_cancel`, reliability drops |
| `requestTimeoutSec` | 20 (driver pop-up), 900 (scheduled rides) | Request expires and auto-rematch kicks in |
| `waitFreeMinutes` / `noShowAfterMinutes` | 3 / 3 | Driver wait timer; no-show unlocks |
| `pickupRadiusMeters` | 1000 | Matching: how far a pickup may be from the route |
| `maxDetourMinutes` | 10 | Matching: reject rides that add more |
| `longStopMinutes` | 4 | "Everything OK?" check during a trip |
| `womenOnlyEnabled` | true | Show the women-only option |
| `costPerKmEstimate` | null | Cost share estimate; null hides amounts |

## 6. Retention

| Data | Kept for | How |
| --- | --- | --- |
| GPS points (`vehicle_locations`) | 30 days; 90 if the ride has an SOS or issue | Drop daily partitions; copy flagged rides first |
| Chat (`messages`) | 30 days after the ride | Nightly delete job |
| OTP codes, expired sessions | 7 days | Nightly delete job |
| Notifications | 90 days | Nightly delete job |
| Rides, bookings, ratings | 3 years | Archive later |
| Audit logs | 7 years | Never deleted by the app |
| Leavers (`memberships.status = LEFT`) | Personal fields cleared after 30 days | Ride history keeps the anonymised membership |

## 7. Not in Release 1 (tables come with their module)

Enterprise: `routes`, `route_stops`, `schedules`, `shifts`, `vendors`, `trip_assignments`. Campus: `students`, `guardian_links`, `student_stop_assignments`. Money: `payments`, `settlements`, `subscriptions`. Masked calls: `call_sessions` if that feature stays in Release 1. Each is a new migration; nothing above changes.
