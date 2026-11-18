# RYDO API: issues, chat, feedback, surveys, push, safety, profile

Base URL `/api/v1`. Same rules as the rest of the API: sign in first (`Authorization: Bearer <token>` on mobile, cookie on web),
company routes also send `x-org-id: <company id>`. Success is `{ data, meta? }`; errors are `{ error: { code, message, fields? } }`.
Request rules live in `packages/shared/src/engagement.ts` (shared with web and mobile).
**Everything here is free to use. There are no payment or pricing fields.**

"Admin" below means `ORG_ADMIN`, `HR_ADMIN` or `OPS_ADMIN` unless a row says otherwise. "Member" means any active person in the company.

## Issue reports (Phase 1: "Issue Reporting")

| Method and path | Who | What |
|---|---|---|
| `POST /me/issues` | member | `{ category, description (10+ chars), rideId?, againstMembershipId? }`. Category is one of `UNSAFE_DRIVING HARASSMENT LATE_OR_NO_SHOW ROUTE COST APP_BUG OTHER`. A ride can only be reported by its driver or a rider with a seat. Every admin gets an in-app notice, a phone push and an email at once. |
| `GET /me/issues` | member | My reports and their status/resolution. |
| `GET /admin/issues?status=&category=&limit=&cursor=` | admin | Newest first. `meta.counts` gives open / in progress / resolved totals; `meta.nextCursor` pages. |
| `GET /admin/issues/:id` | admin | One report with reporter, person reported, assignee, ride. |
| `PATCH /admin/issues/:id` | admin | `{ status?, resolution?, assignToMe? }`. Moves: open → in progress → resolved (and resolved → in progress to reopen). Resolving needs `resolution`. Taking a report assigns it to you. The reporter is notified of every status change. Written to the activity log. |

## Ride chat (Phase 1: "In-app Chat")

One thread per ride and rider: the driver and that confirmed rider only. Other riders, riders without a seat, admins and other companies get `404`.
A thread opens when the seat is confirmed. When the ride is completed or cancelled, or the seat is cancelled, history stays readable and sending returns `409`. Blocked pairs get `403` on send.
Part of RYDO Share: `403 FEATURE_OFF` if the company switched Share off. `:riderId` is the rider's membership id, or `me` for a rider opening their own thread.

| Method and path | What |
|---|---|
| `GET /rides/:rideId/chat` | My threads on this ride: `{ riderMembershipId, as, with:{membershipId,name}, unread, lastMessage, canSend, archived }`. |
| `GET /rides/:rideId/chat/:riderId/messages?limit=&before=` | A page, oldest to newest. `meta.nextBefore` loads older messages. Opening it marks the other person's messages as read. |
| `POST /rides/:rideId/chat/:riderId/messages` | `{ body }` (1 to 1000 chars). |
| `GET /me/chat/unread` | `{ total, threads:[{ rideId, riderMembershipId, count }] }` for the badge. Finished rides are not counted. |

**Live delivery (Socket.IO, path `/api/v1/realtime`):** emit `chat.subscribe` with `{ rideId, riderMembershipId }` (ack `{ ok }`), then listen for `chat.message`
(`{ id, rideId, riderMembershipId, senderMembershipId, body, createdAt }`) and `chat.read` (`{ rideId, riderMembershipId, byMembershipId }`). `chat.unsubscribe` leaves.
Chat is on its own private room: joining the shared ride room does not receive it.
The inbox keeps one unread "new message" notice per thread; the phone still gets a push for every message.

## Feedback form and dashboard (Phase 1: "Feedback Form", "Feedback Analysis")

| Method and path | Who | What |
|---|---|---|
| `POST /me/feedback` | member | `{ category, rating? (1-5), comment }`. Categories: `USABILITY MATCHING COMMUNICATION COST_SHARING GENERAL`. |
| `GET /me/feedback` | member | My submissions and their status. |
| `GET /admin/feedback?status=&category=&limit=&cursor=` | admin | Categorised list; `meta.categories` has counts. |
| `PATCH /admin/feedback/:id` | admin | `{ status? (NEW/REVIEWED/CLOSED), adminNote? }`. |
| `GET /admin/feedback/export.csv` | admin | All feedback as CSV (Excel-safe), logged. |
| `GET /admin/feedback/insights?days=90` | admin | `days` is 7 to 365. Returns the average ride rating with a weekly trend, feedback by category/status, issues by category with average resolution hours and a weekly resolution trend, survey response rate, and the most repeated words (`themes`). |

## Surveys (Phase 1: "Periodic Surveys")

| Method and path | Who | What |
|---|---|---|
| `POST /admin/surveys` | admin | Creates a **draft**: `{ title, description?, questions[], audience?, closesAt? }`. Questions: `RATING` (1-5), `CHOICE` (2-10 options) or `TEXT`, each with a unique `id`. `audience`: `{ roles?: ["RIDER","DRIVER"], departmentIds? }`, empty = everyone. |
| `GET /admin/surveys`, `GET /admin/surveys/:id` | admin | List with response counts; one survey with results: `responseRate`, per-question average and spread (ratings), counts (choices), latest answers (text). Results never show who answered. |
| `POST /admin/surveys/:id/publish` | admin | Draft to published. Notifies the audience (in-app + push) and fixes the audience size, which is the response-rate denominator. |
| `POST /admin/surveys/:id/close` | admin | Stops answers. |
| `DELETE /admin/surveys/:id` | admin | Drafts only. |
| `GET /me/surveys` | member | Open surveys addressed to me, with `answered`. |
| `POST /me/surveys/:id/responses` | member | `{ answers: { <questionId>: number or text } }`. Required: RATING and CHOICE questions. One answer per person (`409` after). Not in the audience: `403`. |

## Announcements (Phase 1: "Push notifications or surveys to all users or segments")

| Method and path | Who | What |
|---|---|---|
| `POST /admin/announcements` | `ORG_ADMIN`, `HR_ADMIN` | `{ title, body, audience?, email? }`. In-app and phone push for everyone in the audience; email too if `email: true`. Returns `{ recipients }`. |
| `GET /admin/announcements` | admin | History (from the activity log). |

## Push notifications (Phase 1: "Push Notifications")

| Method and path | What |
|---|---|
| `POST /me/devices` | `{ token, platform: "IOS" \| "ANDROID" }`. The mobile app calls this after sign-in. A token moves to whoever registered it last; at most 10 phones per person. |
| `POST /me/devices/remove` | `{ token }`. Call on sign-out. |

Every in-app notification is also pushed to the person's phones (chat, issue updates, requests, SOS, announcements, surveys...). Push never makes the main action fail.
Dead tokens reported by Firebase are deleted automatically. With no Firebase settings the API only logs what it would have sent.
Setting it up: copy `project_id`, `client_email` and `private_key` from a Firebase service-account JSON into `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY` (see `.env.example`).

## Safety

| Method and path | Who | What |
|---|---|---|
| `GET/POST /me/emergency-contacts`, `PATCH/DELETE /me/emergency-contacts/:id` | signed-in person | `{ name, phone, email?, relation? }`. Up to 5, no duplicate phone numbers. They belong to the person, not a company. |
| `POST /rides/:rideId/share/contacts` | rider with a seat | `{ contactIds[] }`. Creates the live-trip link and emails it to those contacts that have an email. Returns `{ url, expiresAt, sentTo, skippedNoEmail }`. (SMS is not sent: only email is set up.) |
| `GET/POST /me/blocks`, `DELETE /me/blocks/:membershipId` | member | Blocked people vanish from each other's ride search and cannot message each other. |

## Profile

| Method and path | What |
|---|---|
| `POST /me/photo/upload-url` | `{ contentType: image/jpeg \| image/png \| image/webp }` → `{ key, uploadUrl, method:"PUT", headers, expiresInSec }`. Upload the file to `uploadUrl`, then call the next one. |
| `PUT /me/photo` | `{ key }`. Only a key issued to you is accepted. Returns `{ photoUrl }` (a short-lived link). `DELETE /me/photo` removes it. |
| `PATCH /me` | Now also accepts `phone` (private, never shown to others). |
| `GET /me/profile` | My profile: photo, department, roles, reliability, **rating average and count with recent comments**, rides completed, driver status and preferences, number of emergency contacts. |
| `GET /members/:membershipId/card` | A colleague's card in my company: name, photo, department, reliability, rating (average, count, anonymous comments), rides completed, and for verified drivers their preferences and default vehicle. Never phone or email. |

## Ride search: new filters

`POST /rides/search` also accepts `carTypes: ["HATCHBACK","SEDAN","SUV"]` and `ac: true | false`. A ride whose car has no type set never matches a car-type filter.
Each result's `vehicle` now has `carType`. A driver sets it with `carType` on `POST/PATCH /driver/vehicles` (cars only).

## Not included on purpose

Payments, cost settlement and pricing plans are not part of this release; everything is free. PDF reports are not built.
