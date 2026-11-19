# RYDO

Company carpool platform. One API and one PostgreSQL database serve two apps:

| Folder | What | Tech |
| --- | --- | --- |
| `apps/mobile` | Rider and driver app (Android + iOS) | Expo SDK 58, React Native, Expo Router |
| `apps/web` | Admin website (HR, Ops, Org Admin, RYDO Super Admin) | Next.js 16, Tailwind 4 |
| `services/api` | The only backend | NestJS 11, Prisma 6, PostgreSQL 16 + PostGIS |
| `packages/shared` | Types, validation schemas, error codes used by all three | TypeScript + Zod |
| `packages/ui-tokens` | Colours, radius, spacing from the design system | TypeScript |

Specs: [`docs/phase-0`](docs/phase-0) (data model, API list, design system). Project memory and decisions: [`project-brain`](project-brain).

## First-time setup (Windows, macOS or Linux)

Needs Node 22+ (`.nvmrc` says 24), Docker Desktop and Git.

```bash
npm install
npm run infra:up                       # PostgreSQL+PostGIS, Mailpit (email inbox), RustFS (file storage)
cp services/api/.env.example services/api/.env
cp apps/web/.env.example apps/web/.env.local
cp apps/mobile/.env.example apps/mobile/.env
npx prisma generate --schema services/api/prisma/schema.prisma
npm run build -w @rydo/shared -w @rydo/ui-tokens
npm run db:migrate                     # creates all tables
npm run db:seed                        # Super Admin + demo company "Acme Tech" (acme.test)
```

npm 11 blocks package install scripts by default; that is why `prisma generate` is run by hand above.

## Run

```bash
npm run dev -w @rydo/api       # http://localhost:4000/api/v1/health
npm run dev -w @rydo/web       # http://localhost:3000
npm run start -w @rydo/mobile  # Expo on :8081 (web app keeps :3000): press a (Android), i (iOS), w (web)
```

Sign in with any seeded email (for example `hr@acme.test`). Codes never leave your machine: open the Mailpit inbox at http://localhost:8025 to read them.

Background GPS and push need a **development build** on a real phone, not Expo Go (see `apps/mobile/AGENTS.md`).

## Tests

```bash
npm test -w @rydo/api      # end-to-end tests on the rydo_test database
npm run typecheck          # every package
```

CI (`.github/workflows/ci.yml`) runs both on every push and pull request.

## Rules for every change

1. **Tenant isolation.** Company routes use `@OrgScoped(...)`; every query filters by `org.organizationId`. Add a cross-company test for new admin endpoints (see `services/api/test/tenancy.e2e-spec.ts`).
2. **Replaceable vendors.** Email, storage, maps and push are only called through `services/api/src/adapters`. Never import a vendor SDK in feature code.
3. **One source of validation.** Request schemas live in `packages/shared` and are used by the API and both apps.
4. **Errors** are `{ error: { code, message, fields } }`; apps switch on `code`.
5. **Secrets** stay in `.env` files, which git ignores. `.env.test` holds dummy values only.