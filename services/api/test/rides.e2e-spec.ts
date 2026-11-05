import { INestApplication } from '@nestjs/common';
import { OrgRole } from '@prisma/client';
import { api, createApp, FakeMessages, resetDb, signIn } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { RideGeneratorService } from '../src/rides/ride-generator.service';
import { DocumentExpiryService } from '../src/drivers/document-expiry.service';

const HOME = { label: 'HSR Layout, Sector 2', lat: 12.9116, lng: 77.6474 };
const OFFICE = { label: 'Acme Tech, Bellandur', lat: 12.9259, lng: 77.6766 };
const nextYear = new Date(`${new Date().getFullYear() + 1}-06-30`);

/** Phase 3a: maps search, publishing rides, generation, document expiry. */
describe('Ride plans and generation', () => {
  let app: INestApplication;
  let messages: FakeMessages;
  let prisma: PrismaService;
  const orgs: Record<string, string> = {};
  const tokens: Record<string, string> = {};
  const ms: Record<string, string> = {};
  const vehicles: Record<string, string> = {};
  let planId: string;

  async function person(key: string, org: 'A' | 'B', roles: OrgRole[], driver?: 'VERIFIED' | 'PENDING') {
    const email = `${key}@${org}.test`.toLowerCase();
    const user = await prisma.user.create({ data: { email, name: `${key} person` } });
    const m = await prisma.membership.create({ data: { organizationId: orgs[org], userId: user.id, status: 'ACTIVE', roles: { create: roles.map((role) => ({ role })) } } });
    ms[key] = m.id;
    if (driver) {
      const p = await prisma.driverProfile.create({ data: { membershipId: m.id, status: driver } });
      const v = await prisma.vehicle.create({ data: { organizationId: orgs[org], driverProfileId: p.id, type: 'CAR', make: 'Honda', model: 'City', color: 'White', plateNumber: `KA 01 ${key.slice(0, 2).toUpperCase()} 1234`, seatCapacity: 3, isDefault: true } });
      vehicles[key] = v.id;
      await prisma.document.createMany({
        data: [
          { organizationId: orgs[org], driverProfileId: p.id, kind: 'DRIVING_LICENSE', storageKey: 'x', expiresAt: nextYear, status: 'APPROVED' },
          { organizationId: orgs[org], driverProfileId: p.id, vehicleId: v.id, kind: 'VEHICLE_RC', storageKey: 'y', expiresAt: nextYear, status: 'APPROVED' },
        ],
      });
    }
    tokens[key] = (await signIn(app, messages, email)).accessToken;
  }
  const as = (key: string, org: 'A' | 'B') => ({ Authorization: `Bearer ${tokens[key]}`, 'x-org-id': orgs[org] });
  const plan = (key: string, extra: object = {}) => ({ vehicleId: vehicles[key], origin: HOME, destination: OFFICE, departTime: '08:30', returnTime: '18:30', daysOfWeek: [1, 2, 3, 4, 5], seats: 3, ...extra });

  beforeAll(async () => {
    ({ app, messages, prisma } = await createApp());
    await resetDb(prisma);
    orgs.A = (await prisma.organization.create({ data: { name: 'Company A', slug: 'a', emailDomains: ['a.test'], status: 'ACTIVE' } })).id;
    orgs.B = (await prisma.organization.create({ data: { name: 'Company B', slug: 'b', emailDomains: ['b.test'], status: 'ACTIVE' } })).id;
    await prisma.$executeRaw`INSERT INTO offices (id, organization_id, name, address, location, is_default)
      VALUES (gen_random_uuid(), ${orgs.A}::uuid, 'Bellandur', 'ORR', ST_SetSRID(ST_MakePoint(${OFFICE.lng}, ${OFFICE.lat}), 4326)::geography, true)`;
    await person('rahul', 'A', ['RIDER', 'DRIVER'], 'VERIFIED');
    await person('neha', 'A', ['RIDER'], 'PENDING');
    await person('opsA', 'A', ['OPS_ADMIN']);
    await person('opsB', 'B', ['OPS_ADMIN']);
  });
  afterAll(() => app.close());

  it('searches addresses through the server (no key in the app)', async () => {
    const res = await api(app).get('/api/v1/maps/autocomplete?q=Bellandur&session=abcdefgh1234').set(as('rahul', 'A')).expect(200);
    expect(res.body.data[0]).toMatchObject({ placeId: 'fake-1', main: 'Bellandur' });
    await api(app).get('/api/v1/maps/autocomplete?q=Bellandur&session=abcdefgh1234').set({ Authorization: `Bearer ${tokens.rahul}` }).expect(400);
  });

  it('only verified drivers can publish', async () => {
    const res = await api(app).post('/api/v1/ride-plans').set(as('neha', 'A')).send(plan('neha')).expect(403);
    expect(res.body.error.message).toMatch(/verified/);
  });

  it('checks seats against the vehicle and needs days or a date', async () => {
    const seats = await api(app).post('/api/v1/ride-plans').set(as('rahul', 'A')).send(plan('rahul', { seats: 5 })).expect(400);
    expect(seats.body.error.fields.seats).toBeDefined();
    const days = await api(app).post('/api/v1/ride-plans').set(as('rahul', 'A')).send(plan('rahul', { daysOfWeek: [] })).expect(400);
    expect(days.body.error.fields.daysOfWeek).toBeDefined();
  });

  it('publishing creates weekday rides both ways for 14 days at 08:30 / 18:30 India time', async () => {
    const res = await api(app).post('/api/v1/ride-plans').set(as('rahul', 'A')).send(plan('rahul')).expect(201);
    planId = res.body.data.id;
    const rows = await prisma.$queryRaw<{ direction: string; local: string; dow: number; has_route: boolean; seats_total: number }[]>`
      SELECT direction::text, to_char(depart_at AT TIME ZONE 'Asia/Kolkata', 'HH24:MI') AS local, extract(isodow FROM depart_at AT TIME ZONE 'Asia/Kolkata')::int AS dow,
        route_line IS NOT NULL AS has_route, seats_total FROM rides WHERE ride_plan_id = ${planId}::uuid`;
    expect(res.body.data.ridesCreated).toBe(rows.length);
    expect(rows.length).toBeGreaterThanOrEqual(16);
    expect(rows.every((r) => r.dow <= 5 && r.has_route && r.seats_total === 3)).toBe(true);
    expect(rows.filter((r) => r.direction === 'TO_OFFICE').every((r) => r.local === '08:30')).toBe(true);
    expect(rows.filter((r) => r.direction === 'TO_HOME').every((r) => r.local === '18:30')).toBe(true);
    // Today's 08:30 may already be past while 18:30 is still ahead, so the counts can differ by one.
    expect(Math.abs(rows.filter((r) => r.direction === 'TO_OFFICE').length - rows.filter((r) => r.direction === 'TO_HOME').length)).toBeLessThanOrEqual(1);
  });

  it('running the generator again creates no duplicates', async () => {
    const before = await prisma.ride.count({ where: { ridePlanId: planId } });
    expect(await app.get(RideGeneratorService).generateAll()).toBe(0);
    expect(await prisma.ride.count({ where: { ridePlanId: planId } })).toBe(before);
  });

  it('the driver sees upcoming rides and plans', async () => {
    const driving = (await api(app).get('/api/v1/rides/driving').set(as('rahul', 'A')).expect(200)).body.data;
    expect(driving.length).toBeGreaterThan(0);
    const mine = (await api(app).get('/api/v1/ride-plans/mine').set(as('rahul', 'A')).expect(200)).body.data;
    expect(mine[0]).toMatchObject({ id: planId, departTime: '08:30', returnTime: '18:30', active: true });
  });

  it('Ops sees the day\'s rides; another company does not', async () => {
    const first = await prisma.ride.findFirstOrThrow({ where: { ridePlanId: planId, direction: 'TO_OFFICE' }, orderBy: { departAt: 'asc' } });
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(first.departAt);
    const a = (await api(app).get(`/api/v1/admin/rides?date=${day}`).set(as('opsA', 'A')).expect(200)).body.data;
    expect(a.length).toBe(2);
    expect(a[0]).toMatchObject({ driverName: 'rahul person', plateNumber: 'KA 01 RA 1234', seatsTotal: 3, seatsBooked: 0 });
    expect((await api(app).get(`/api/v1/admin/rides?date=${day}`).set(as('opsB', 'B')).expect(200)).body.data).toHaveLength(0);
    await api(app).get(`/api/v1/admin/rides?date=${day}`).set(as('rahul', 'A')).expect(403);
  });

  it('stopping a plan cancels its future rides', async () => {
    await api(app).delete(`/api/v1/ride-plans/${planId}`).set(as('neha', 'A')).expect(404);
    const res = await api(app).delete(`/api/v1/ride-plans/${planId}`).set(as('rahul', 'A')).expect(200);
    expect(res.body.data.cancelledRides).toBeGreaterThan(0);
    expect(await prisma.ride.count({ where: { ridePlanId: planId, status: { not: 'CANCELLED' }, departAt: { gt: new Date() } } })).toBe(0);
  });

  it('the nightly expiry job stops drivers with an expired license', async () => {
    const profile = await prisma.driverProfile.findUniqueOrThrow({ where: { membershipId: ms.rahul } });
    await prisma.document.updateMany({ where: { driverProfileId: profile.id, kind: 'DRIVING_LICENSE' }, data: { expiresAt: new Date('2025-01-01') } });
    const result = await app.get(DocumentExpiryService).run();
    expect(result.expired).toBe(1);
    expect((await prisma.driverProfile.findUniqueOrThrow({ where: { id: profile.id } })).status).toBe('EXPIRED');
    expect(messages.sent.some((m) => m.to === 'rahul@a.test' && /expired/.test(m.subject))).toBe(true);
    await api(app).post('/api/v1/ride-plans').set(as('rahul', 'A')).send(plan('rahul')).expect(403);
  });
});