# RYDO staging server

One Linux server runs everything in Docker: database (PostgreSQL + PostGIS), Redis, file storage, two API servers, the website, nightly backups, and Caddy for HTTPS.

```
browser ──https──> Caddy ──/api/*──> api ×2 ──> PostgreSQL, Redis, storage
                         └─ other ──> web (Next.js)
```

## 1. What you need

| Item | Notes |
| --- | --- |
| Server | Ubuntu 24.04, **2 vCPU / 4 GB RAM / 40 GB disk** is enough for staging (any provider: DigitalOcean, Hetzner, AWS Lightsail, Azure...). This costs money: pick the plan yourself. |
| Domain | e.g. `staging.rydo.example`. Two DNS **A** records pointing at the server: `staging...` and `files.staging...`. |
| Email (SMTP) | Any provider (Brevo, Amazon SES, Zoho Mail). Needed for sign-in codes and SOS emails. |
| Google Maps keys | **Server key**: Places API (New) + Routes API, restricted to the server's IP. **Browser key**: Maps JavaScript API, restricted to `https://staging.../*`. Keep them separate from the dev keys. |

## 2. First start

```bash
# on the server
curl -fsSL https://get.docker.com | sh
git clone https://github.com/karanjain-tv/TV-RYDO.git rydo && cd rydo
cp infra/staging/.env.staging.example infra/staging/.env
nano infra/staging/.env           # fill every value; secrets: openssl rand -base64 48
docker compose -f infra/staging/docker-compose.yml --env-file infra/staging/.env up -d --build
```

The first build takes a few minutes. `migrate` runs the database migrations and exits; the API starts after it.

Create the RYDO owner account (and the demo company, for team testing):

```bash
docker compose -f infra/staging/docker-compose.yml --env-file infra/staging/.env run --rm migrate npx ts-node prisma/seed.ts
```

Check it:

```bash
curl https://<DOMAIN>/api/v1/health      # {"status":"ok"...}
```

Open `https://<DOMAIN>`, sign in with `SEED_SUPER_ADMIN_EMAIL` and `SEED_DEV_PASSWORD`, then change the password under My account.

## 3. Everyday commands

All commands start with `docker compose -f infra/staging/docker-compose.yml --env-file infra/staging/.env`, shortened to `dc` below (`alias dc='docker compose -f infra/staging/docker-compose.yml --env-file infra/staging/.env'`).

| Task | Command |
| --- | --- |
| Deploy the latest code | `git pull && dc up -d --build` |
| See logs | `dc logs -f api` (or `web`, `caddy`, `backup`) |
| Status | `dc ps` |
| Restart the API | `dc restart api` |
| Roll back | `git checkout <previous commit> && dc up -d --build` (migrations only move forward: restore a backup if a migration must be undone) |

## 4. Backups

- Every night at 02:30 (server time) the `backup` service writes `infra/staging/backups/rydo-YYYYMMDD-HHMM.dump` and keeps 14 days.
- **Copy them off the server** (another cloud bucket or drive). A backup on the same disk does not survive a lost server.
- Test a restore once a month:

```bash
dc stop api
dc run --rm backup /bin/sh /restore.sh /backups/rydo-YYYYMMDD-HHMM.dump
dc start api
```

Uploaded driver documents live in the `storage-data` volume; back that up too (or use AWS S3 / Cloudflare R2 with versioning instead of the built-in storage).

## 5. What is already hardened

- HTTPS everywhere (Caddy, automatic certificates); HSTS, no-frame, no-sniff and referrer headers.
- Two API servers behind Caddy; live updates pass between them through Redis.
- Rate limits per person (not per office IP); sign-in limited per email.
- Requests over 100 KB are refused; broken requests get a clear error, not a crash.
- GPS points are stored in day partitions; a nightly job drops days older than 30 (90 when a ride had an SOS).
- Database, Redis and storage have no public ports; only Caddy (80/443) is open.

## 6. Load test (before a pilot)

From a laptop with the repo: `npm run load:api -w @rydo/api` in one terminal, `npm run load:test -w @rydo/api` in another. It builds 500 employees, 60 drivers and 120 rides in a separate database and measures the busiest screens. See the latest numbers in `project-brain/journal/2026-11-06.md`.

## 7. Still to decide before production

- Row-level security in PostgreSQL as a second tenant wall (today: the API's tenant guard + cross-company tests).
- Upgrades that clear the remaining `npm audit` warnings (all need major versions: NestJS 12, Prisma 7, Zod 4, Expo 52).
- Off-server backup copies and an uptime monitor.
