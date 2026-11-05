# Decision log (append-only)

Format: date - decision - why - rejected alternatives.

## 2026-10-29 - Create the project brain before any code
- **Decision:** Initialize `project-brain/` and git at the very start of the project.
- **Why:** Keeps context persistent across sessions from day one.
- **Rejected:** Creating it inside `Pictures\Screenshots` (not a project folder).

## 2026-10-29 - Project lives in Downloads\RYDO Project
- **Decision:** Owner named `C:\Users\Karan Jain\Downloads\RYDO Project` as the project folder; brain, CLAUDE.md and git moved there from the placeholder `Projects\new-project` (deleted). Obsidian junction renamed to `BrainVault\RYDO`.
- **Why:** Owner's choice; keeps docs and brain together.

## 2026-10-29 - Master prompt supersedes earlier Rydo docs for scope
- **Decision:** Scope = multi-tenant SaaS with Share, Enterprise and Campus modules, mobile + web from day one (per RYDO_Master_Product_Architecture_Prompt.md).
- **Why:** It is the latest and most complete brief from the owner.
- **Rejected:** Earlier docs' single-company, web-first carpool app.

## PENDING owner approval (proposed 2026-10-29, not yet decided)
- Stack A (RN+Expo, Next.js, NestJS, Supabase Postgres+PostGIS, Prisma) over B (Supabase-only) and C (Flutter+FastAPI).
- MVP = platform core + RYDO Share in one enterprise tenant; Enterprise and Campus after.
- Payments out of MVP until legal view on carpool cost-sharing vs commercial transport.

## 2026-10-29 - Owner decisions on the proposal (supersede the PENDING block above)
- **No Supabase; plain PostgreSQL + PostGIS.** Why (owner): does not want to depend on Supabase; wants scalability and freedom. Consequence: own auth module in NestJS, S3-compatible storage, Socket.IO for realtime.
- **Release 1 = RYDO Share (carpool) only.** Enterprise and Campus later.
- **Release 1 = mobile app only (Android + iOS).** Web app later on the same API; admin tasks live in an in-app Admin area for now.
- **Google Maps Platform** chosen over Mapbox.
- **Every technology must be replaceable** (adapter rule) and the system must scale without redesign; RYDO is long-term a mobile + web product.
- Rejected: Supabase-only stack (vendor dependence, rules scattered in SQL); Flutter + FastAPI (two languages).

## 2026-11-05 - Release 1 now includes a web app (supersedes "mobile only")
- **Decision:** Build the web application alongside the mobile app in Release 1, to manage everything (admin, HR, operations).
- **How:** One NestJS API and one PostgreSQL database for both; same tables, same roles. Web and app never touch the database directly - only through the API. Web is Next.js in the same monorepo (apps/web).
- **Open:** web for admins only first, or riders too? In-app Admin area: keep minimal or remove?
- **2026-11-05 answer:** Web app is for admins only first (Super Admin, Org Admin, HR, transport/ops). Riders and drivers use the mobile app. Rider web can come later on the same API.

## 2026-11-05 - Phase 0 design choices
- **Background jobs on pg-boss** (queue inside PostgreSQL) behind a `JobQueue` adapter. Why: no Redis needed in Release 1; swap to BullMQ/Redis when load requires. Rejected: BullMQ from day one (extra service to run).
- **User vs membership**: company data hangs off `memberships`, not `users`. Why: multi-company later without migration.
- **Ride plan -> ride -> request -> booking**; GPS, chat, events attach to the ride so Enterprise/Campus reuse the same pipeline.
- **Fixed role enum** in Release 1 (ORG_ADMIN, HR_ADMIN, OPS_ADMIN, RIDER, DRIVER + platform SUPER_ADMIN/SUPPORT); permissions mapped in code.
- **Web auth** via httpOnly cookies + CSRF; mobile via bearer + rotating refresh token; same auth module.

## 2026-11-05 - Team and sign-in
- **Team:** owner + 2 developers. Owner does the initial setup alone; the 2 developers join later. Why it matters: repo, README and conventions must let new devs start without hand-holding.
- **Sign-in (owner left it to Claude):** work email + 6-digit OTP only, no passwords in Release 1. Why: matches the prototype, nothing to store or leak, company email proves employment. Password or SSO can be added later behind AuthService. `users.password_hash` stays nullable.
## 2026-11-05 - Release 1 scope of the v2 prototype features (owner approved Claude's split)
- **In Release 1:** ride PIN, driver request pop-up (20 s), auto-request next best match, women-only rides, no-show after 3 min wait, driver auto-accept own team, share live trip link, long-stop "Everything OK?" check.
- **Release 1.1 (after pilot feedback):** weekly commute planner + auto-book, preferred drivers (tied to planner), waitlist.
- **Later:** masked calls (needs a paid telephony provider); Release 1 uses in-app chat only.
- Why: the kept items are small and drive safety/trust; the deferred ones add the most work or running cost and the app works without them.
## 2026-11-05 - Password sign-in added (changes "OTP only")
- **Decision:** owner asked for password sign-in on the web instead of OTP. Web sign-in now defaults to email + password; "sign in with an email code" stays as a link. API: POST /auth/password/login, POST /me/password; Super Admin can give a first password when adding an Org Admin. Mobile still uses OTP for now.
- **How:** scrypt from Node crypto (no native add-on; npm 11 blocks install scripts), one vague "Email or password is wrong." for every failure, 10 tries/min throttle. Seed gives demo admins the local-only password SEED_DEV_PASSWORD (default Rydo@2026).
- **Open:** forgot-password flow (email code -> set new password) not built yet; HR-approved employees have no password until they set one.
## 2026-11-05 - Build everything on the web first, mobile app after (supersedes "web = admins only")
- **Decision:** the owner has no phone for testing now. All features, including rider and driver screens, are built and tested on the web app first. The mobile app (Expo) comes after, on the same APIs.
- **Why:** lets the owner test every flow end to end from a laptop.
- **Impact:** the web app is no longer admin-only; employees (riders/drivers) get their own web screens. Background GPS remains mobile-only (Phase 4 tracking on web can only simulate).