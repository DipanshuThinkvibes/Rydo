/**
 * Load test: one company with 500 employees (60 drivers, 120 rides tomorrow), hammered on the busiest screens.
 *
 *   1. Start the API against the load database:   npm run load:api      (port 4100, rate limits off)
 *   2. In another terminal:                       npm run load:test
 *
 * Uses its own database (rydo_load), never your dev or test data. Prints p50/p97.5/p99 latency and requests/sec.
 */
import autocannon from 'autocannon';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const BASE = process.env.LOAD_URL ?? 'http://localhost:4100';
const USERS = 500;
const DRIVERS = 60;
const SECONDS = Number(process.env.LOAD_SECONDS ?? 15);
const CONNECTIONS = Number(process.env.LOAD_CONNECTIONS ?? 100);
const OFFICE = { lat: 12.9259, lng: 77.6766 };

const prisma = new PrismaClient();

async function seed() {
  await prisma.$executeRawUnsafe(`TRUNCATE organizations, users CASCADE`);
  const org = await prisma.organization.create({ data: { name: 'Load Co', slug: 'load', emailDomains: ['load.test'], status: 'ACTIVE' } });
  await prisma.$executeRawUnsafe(`
    INSERT INTO users (id, email, name, status, created_at, updated_at)
    SELECT gen_random_uuid(), 'u' || i || '@load.test', 'Person ' || i, 'ACTIVE', now(), now() FROM generate_series(1, ${USERS}) i`);
  await prisma.$executeRawUnsafe(`
    INSERT INTO memberships (id, organization_id, user_id, status, reliability_score, created_at, updated_at)
    SELECT gen_random_uuid(), '${org.id}', id, 'ACTIVE', 100, now(), now() FROM users`);
  await prisma.$executeRawUnsafe(`INSERT INTO membership_roles (membership_id, role) SELECT id, 'RIDER' FROM memberships`);
  const admin = await prisma.membership.findFirstOrThrow({ where: { user: { email: 'u1@load.test' } } });
  await prisma.membershipRole.create({ data: { membershipId: admin.id, role: 'OPS_ADMIN' } });
  // Drivers: the first 60 people, each with a car and two rides tomorrow from homes around the city to the office.
  await prisma.$executeRawUnsafe(`
    WITH d AS (SELECT m.id AS mid, row_number() OVER (ORDER BY u.email) AS n FROM memberships m JOIN users u ON u.id = m.user_id
               WHERE u.email ~ '^u([0-9]|[1-5][0-9]|60)@')
    INSERT INTO driver_profiles (id, membership_id, status, approval_mode, created_at, updated_at)
    SELECT gen_random_uuid(), mid, 'VERIFIED', 'MANUAL', now(), now() FROM d`);
  await prisma.$executeRawUnsafe(`
    INSERT INTO vehicles (id, organization_id, driver_profile_id, type, make, model, color, plate_number, seat_capacity, has_ac, is_default, active, created_at)
    SELECT gen_random_uuid(), '${org.id}', p.id, 'CAR', 'Maruti', 'Swift', 'White', 'KA 01 LT ' || lpad((row_number() OVER ())::text, 4, '0'), 3, true, true, true, now()
    FROM driver_profiles p`);
  await prisma.$executeRawUnsafe(`
    INSERT INTO rides (id, organization_id, driver_membership_id, vehicle_id, direction, origin_label, origin, destination_label, destination, route_line,
      distance_meters, duration_seconds, depart_at, seats_total, seats_booked, women_only, status, created_at, updated_at)
    SELECT gen_random_uuid(), '${org.id}', p.membership_id, v.id, 'TO_OFFICE', 'Home ' || g.k, h.pt, 'Office',
      ST_SetSRID(ST_MakePoint(${OFFICE.lng}, ${OFFICE.lat}), 4326)::geography,
      ST_MakeLine(ARRAY[h.pt::geometry, ST_SetSRID(ST_MakePoint((ST_X(h.pt::geometry) + ${OFFICE.lng}) / 2, (ST_Y(h.pt::geometry) + ${OFFICE.lat}) / 2), 4326), ST_SetSRID(ST_MakePoint(${OFFICE.lng}, ${OFFICE.lat}), 4326)])::geography,
      9000, 1800, ((now() AT TIME ZONE 'Asia/Kolkata')::date + 1 + time '08:00' + (g.k * interval '20 minutes')) AT TIME ZONE 'Asia/Kolkata',
      3, 0, false, 'SCHEDULED', now(), now()
    FROM driver_profiles p JOIN vehicles v ON v.driver_profile_id = p.id
    CROSS JOIN generate_series(0, 1) g(k)
    CROSS JOIN LATERAL (SELECT ST_SetSRID(ST_MakePoint(77.58 + random() * 0.08, 12.90 + random() * 0.06), 4326)::geography AS pt) h`);
  const users = await prisma.user.findMany({ select: { id: true, email: true } });
  return { org: org.id, users };
}

function tokens(users: { id: string }[]) {
  const secret = process.env.JWT_SECRET!;
  return users.map((u) => jwt.sign({ sub: u.id, sid: randomUUID() }, secret, { expiresIn: 3600 }));
}

function run(title: string, org: string, toks: string[], req: { method: 'GET' | 'POST'; path: string; body?: string }) {
  let i = 0;
  return new Promise<autocannon.Result>((resolve, reject) => {
    autocannon(
      {
        url: BASE,
        connections: CONNECTIONS,
        duration: SECONDS,
        requests: [
          {
            method: req.method,
            path: req.path,
            body: req.body,
            setupRequest: (r: autocannon.Request) => ({
              ...r,
              headers: { ...(r.headers ?? {}), authorization: `Bearer ${toks[i++ % toks.length]}`, 'x-org-id': org, 'content-type': 'application/json' },
            }),
          },
        ],
      },
      (err, res) => (err ? reject(err) : (console.log(`${title.padEnd(34)} ${String(Math.round(res.requests.average)).padStart(6)} req/s   p50 ${String(res.latency.p50).padStart(4)} ms   p97.5 ${String(res.latency.p97_5).padStart(4)} ms   p99 ${String(res.latency.p99).padStart(4)} ms   errors ${res.non2xx + res.errors}`), resolve(res))),
    );
  });
}

async function main() {
  console.log(`Seeding ${USERS} employees, ${DRIVERS} drivers, ${DRIVERS * 2} rides…`);
  const { org, users } = await seed();
  const toks = tokens(users);
  const opsToken = toks[users.findIndex((u) => u.email === 'u1@load.test')];
  const tomorrow = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(Date.now() + 86_400_000));
  console.log(`${CONNECTIONS} users at once, ${SECONDS}s per screen, against ${BASE}\n`);
  const search = JSON.stringify({ pickup: { label: 'Home', lat: 12.93, lng: 77.62 }, drop: { label: 'Office', ...OFFICE }, date: tomorrow, fromTime: '07:30', toTime: '10:30' });
  const results = [
    await run('Open the app (GET /me)', org, toks, { method: 'GET', path: '/api/v1/me' }),
    await run('My trips (GET /me/bookings)', org, toks, { method: 'GET', path: '/api/v1/me/bookings' }),
    await run('Find a ride (POST /rides/search)', org, toks, { method: 'POST', path: '/api/v1/rides/search', body: search }),
    await run('Ops rides map (GET /admin/rides)', org, [opsToken], { method: 'GET', path: `/api/v1/admin/rides?date=${tomorrow}` }),
  ];
  const worst = Math.max(...results.map((r) => r.latency.p97_5));
  const failures = results.reduce((a, r) => a + r.non2xx + r.errors, 0);
  console.log(`\nWorst p97.5: ${worst} ms · failed requests: ${failures}`);
  console.log(worst < 500 && failures === 0 ? 'PASS: smooth for this load.' : 'CHECK: slower than 500 ms or some requests failed.');
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
