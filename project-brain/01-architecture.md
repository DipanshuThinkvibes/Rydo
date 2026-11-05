# Architecture

Status: stack APPROVED by owner on 2026-10-29 (with changes below). Nothing is built yet.

## Non-negotiable principles (owner)
1. RYDO is a mobile AND web product. Release 1 ships mobile only (Android + iOS), but API, data model and roles must let the web app plug into the same API with no backend rewrite.
2. Must scale without redesign: stateless API, all state in Postgres/Redis, versioned API, partitioned GPS table, tracking can later split into its own service.
3. Every technology must be replaceable: feature code calls only RYDO interfaces; exactly one adapter file talks to each vendor; vendor chosen by config; one integration test per adapter.
4. No Supabase (owner decision). Plain PostgreSQL + PostGIS.

## Stack (Release 1)
- Mobile: React Native + Expo (development builds, not Expo Go) + TypeScript
- Web (later release): Next.js + TypeScript, same API
- API: NestJS modular monolith, REST /api/v1 + Socket.IO gateway
- DB: PostgreSQL 16 + PostGIS (Docker locally; any managed Postgres later), Prisma + raw SQL for PostGIS
- Auth: own NestJS auth module - work email + OTP, argon2, short-lived JWT + rotating refresh tokens (behind AuthService; swappable to Keycloak/Auth0/Cognito/SSO)
- Storage: S3-compatible (MinIO locally; S3/R2 later) behind StorageAdapter
- Maps: Google Maps Platform (decided) behind MapsAdapter
- Push: FCM (+ APNs) behind PushAdapter; email/OTP behind MessageAdapter
- Redis only when scaling to 2+ API instances
- Monorepo: pnpm + Turborepo; shared types/validation (Zod)

## Release 1 scope
RYDO Share (carpool) only, mobile only. Admin tasks (HR approvals, document review, ride/issue lists) in an Admin area inside the app. Super Admin creates tenants in-app or via seed script for the pilot.

## API modules
Release 1: identity, tenancy, verification, share, tracking, notifications, safety. Later: transport, campus, reporting, billing.

## Data model key idea
route -> schedule -> trip (GPS attaches to trip); carpool_ride creates a trip per day it runs. organization_id on every tenant-owned table. Release 1 creates only platform, identity (+ auth_credentials, otp_codes, refresh_tokens), org structure, fleet/verification, carpool, tracking, comms/governance tables. vehicle_locations partitioned by day, 30-day retention (90 if incident).

## Gotchas
- Background GPS does not work in Expo Go; needs dev builds and physical-device tests (Android OEM battery killers, iOS "Always" permission).
- Transistor background-geolocation library needs a paid licence for release builds; spike expo-location first.
- iOS cannot be built/simulated on Windows; use EAS cloud builds + a real iPhone + $99 Apple account.
- Free API hosts that sleep (Render ~15 min) break live tracking; need one always-on instance.
- Google Maps: per-SKU free caps since Mar 2025; ETA server-side every 30-60 s per trip, never per GPS point; use autocomplete session tokens.
- Own auth = own security burden: OTP rate limits, token rotation, security review before pilot.

## Update 2026-11-05
- Release 1 = mobile app (riders, drivers) + web admin app (Next.js; admins only). One API, one PostgreSQL database.
- Background jobs: pg-boss in PostgreSQL behind JobQueue adapter (Redis only when scaling).
- Phase 0 specs live in docs/phase-0/ (schema.prisma, 01-data-model.md, 02-api.md, 03-design-system.md).
