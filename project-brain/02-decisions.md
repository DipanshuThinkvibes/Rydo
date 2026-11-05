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
