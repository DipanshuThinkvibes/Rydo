import { INestApplication } from '@nestjs/common';
import { OrgRole } from '@prisma/client';
import { api, createApp, FakeMessages, resetDb, signIn } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { WaitlistService } from '../src/commute/waitlist.service';

const HOME = { label: 'HSR Layout', lat: 12.9116, lng: 77.6474 };
const MID = { lat: 12.9188, lng: 77.662 };
const OFFICE = { label: 'Office', lat: 12.9259, lng: 77.6766 };

/** Release 1.1: preferred drivers, waitlist, commute planner. */
describe('Release 1.1', () => {
  let app: INestApplication;
  let messages: FakeMessages;
  let prisma: PrismaService;
  let org: string;
  let vehicleId: string;
  let morning: string;
  const tokens: Record<string, string> = {};
  const ms: Record<string, string> = {};
  const tomorrow = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(Date.now() + 86_400_000));

  async function person(key: string, roles: OrgRole[]) {
    const email = `${key}@r.test`;
    const user = await prisma.user.create({ data: { email, name: `${key} person` } });
    ms[key] = (await prisma.membership.create({ data: { organizationId: org, userId: user.id, status: 'ACTIVE', roles: { create: roles.map((role) => ({ role })) } } })).id;
    tokens[key] = (await signIn(app, messages, email)).accessToken;
  }
  const as = (key: string) => ({ Authorization: `Bearer ${tokens[key]}`, 'x-org-id': org });
  const pt = (p: { lat: number; lng: number }) => `ST_SetSRID(ST_MakePoint(${p.lng}, ${p.lat}), 4326)::geography`;
  async function ride(time: string, from: { lat: number; lng: number }, to: { lat: number; lng: number }, direction: string, seats = 1) {
    const [r] = await prisma.$queryRawUnsafe<{ id: string }[]>(`
      INSERT INTO rides (id, organization_id, driver_membership_id, vehicle_id, direction, origin_label, origin, destination_label, destination, route_line,
        distance_meters, duration_seconds, depart_at, seats_total, seats_booked, women_only, status, created_at, updated_at)
      VALUES (gen_random_uuid(), '${org}', '${ms.driver}', '${vehicleId}', '${direction}', 'A', ${pt(from)}, 'B', ${pt(to)},
        ST_GeogFromText('LINESTRING(${from.lng} ${from.lat}, ${MID.lng} ${MID.lat}, ${to.lng} ${to.lat})'),
        3500, 1200, ('${tomorrow}'::date + time '${time}') AT TIME ZONE 'Asia/Kolkata', ${seats}, 0, false, 'SCHEDULED', now(), now()) RETURNING id`);
    return r.id;
  }
  const search = (key: string, body: object = {}) =>
    api(app).post('/api/v1/rides/search').set(as(key)).send({ pickup: HOME, drop: OFFICE, date: tomorrow, fromTime: '08:00', toTime: '09:00', ...body }).expect(200);

  beforeAll(async () => {
    ({ app, messages, prisma } = await createApp());
    await resetDb(prisma);
    org = (await prisma.organization.create({ data: { licenses: { create: [{ product: 'SHARE' }] }, name: 'R Co', slug: 'r', emailDomains: ['r.test'], status: 'ACTIVE' } })).id;
    await prisma.$executeRawUnsafe(`INSERT INTO offices (id, organization_id, name, address, location, is_default) VALUES (gen_random_uuid(), '${org}', 'Office', 'ORR', ${pt(OFFICE)}, true)`);
    await person('driver', ['RIDER', 'DRIVER']);
    await person('priya', ['RIDER']);
    await person('arjun', ['RIDER']);
    await person('kiran', ['RIDER']);
    const p = await prisma.driverProfile.create({ data: { membershipId: ms.driver, status: 'VERIFIED' } });
    vehicleId = (await prisma.vehicle.create({ data: { checkStatus: 'VERIFIED', organizationId: org, driverProfileId: p.id, type: 'CAR', make: 'Honda', model: 'City', color: 'White', plateNumber: 'KA 01 RR 0001', seatCapacity: 3, isDefault: true } })).id;
    morning = await ride('08:30', HOME, OFFICE, 'TO_OFFICE', 1);
  });
  afterAll(() => app.close());

  it('preferred drivers come first, with a reason; only real drivers can be added', async () => {
    const before = (await search('priya')).body.data[0];
    expect(before.preferred).toBe(false);
    await api(app).post('/api/v1/me/preferred-drivers').set(as('priya')).send({ driverMembershipId: ms.priya }).expect(409);
    await api(app).post('/api/v1/me/preferred-drivers').set(as('priya')).send({ driverMembershipId: ms.arjun }).expect(404);
    const list = (await api(app).post('/api/v1/me/preferred-drivers').set(as('priya')).send({ driverMembershipId: ms.driver }).expect(200)).body.data;
    expect(list[0]).toMatchObject({ membershipId: ms.driver, name: 'driver person', available: true, ridesTogether: 0 });
    const after = (await search('priya')).body.data[0];
    expect(after).toMatchObject({ preferred: true, score: Math.min(100, before.score + 10) });
    expect(after.reasons[0]).toBe('Your preferred driver');
    await api(app).delete(`/api/v1/me/preferred-drivers/${ms.driver}`).set(as('priya')).expect(200).then((r) => expect(r.body.data).toHaveLength(0));
  });

  it('waitlist: a freed seat goes to the first person waiting, who gets a request sent for them', async () => {
    const req = await api(app).post(`/api/v1/rides/${morning}/requests`).set(as('priya')).send({ pickup: HOME, drop: OFFICE }).expect(201);
    await api(app).post(`/api/v1/requests/${req.body.data.id}/accept`).set(as('driver')).expect(200);
    expect((await search('arjun')).body.data).toHaveLength(0); // full

    const w = await api(app).post('/api/v1/me/waitlist').set(as('arjun')).send({ pickup: HOME, drop: OFFICE, date: tomorrow, fromTime: '08:00', toTime: '09:00', autoRequest: true }).expect(201);
    expect(w.body.data.status).toBe('WAITING');
    const again = await api(app).post('/api/v1/me/waitlist').set(as('arjun')).send({ pickup: HOME, drop: OFFICE, date: tomorrow, fromTime: '08:00', toTime: '09:00' }).expect(201);
    expect(again.body.data.id).toBe(w.body.data.id);

    const booking = await prisma.booking.findFirstOrThrow({ where: { rideId: morning, riderMembershipId: ms.priya } });
    await api(app).post(`/api/v1/bookings/${booking.id}/cancel`).set(as('priya')).send({}).expect(200);

    expect((await prisma.waitlistEntry.findUniqueOrThrow({ where: { id: w.body.data.id } })).status).toBe('MATCHED');
    expect(await prisma.rideRequest.count({ where: { rideId: morning, riderMembershipId: ms.arjun, status: 'PENDING' } })).toBe(1);
    expect(await prisma.notification.count({ where: { type: 'WAITLIST_MATCHED' } })).toBe(1);
    const mine = (await api(app).get('/api/v1/me/waitlist').set(as('arjun')).expect(200)).body.data;
    expect(mine[0]).toMatchObject({ status: 'MATCHED', criteria: { date: tomorrow } });
  });

  it('waitlist: "just tell me" riders get a heads-up when a new ride appears; past times are refused', async () => {
    const w = await api(app).post('/api/v1/me/waitlist').set(as('priya')).send({ pickup: HOME, drop: OFFICE, date: tomorrow, fromTime: '10:00', toTime: '11:00', autoRequest: false }).expect(201);
    expect(w.body.data.status).toBe('WAITING');
    await ride('10:30', HOME, OFFICE, 'TO_OFFICE', 2);
    expect(await app.get(WaitlistService).check(org)).toBe(1);
    expect((await prisma.waitlistEntry.findUniqueOrThrow({ where: { id: w.body.data.id } })).status).toBe('NOTIFIED');
    expect(await prisma.notification.count({ where: { type: 'WAITLIST_SEAT' } })).toBe(1);
    expect(await prisma.rideRequest.count({ where: { riderMembershipId: ms.priya, status: 'PENDING' } })).toBe(0);

    await api(app).post('/api/v1/me/waitlist').set(as('priya')).send({ pickup: HOME, drop: OFFICE, date: '2020-01-01', fromTime: '08:00', toTime: '09:00' }).expect(409);
    await api(app).delete(`/api/v1/me/waitlist/${w.body.data.id}`).set(as('arjun')).expect(404);
    await api(app).delete(`/api/v1/me/waitlist/${w.body.data.id}`).set(as('priya')).expect(200);
  });

  it('commute planner: set home and the week once; RYDO requests what exists and waitlists the rest', async () => {
    const noHome = await api(app).post('/api/v1/me/commute/plan').set(as('kiran')).expect(409);
    expect(noHome.body.error.message).toMatch(/home/);
    await api(app).put('/api/v1/me/home').set(as('kiran')).send(HOME).expect(200);
    expect((await api(app).get('/api/v1/me/home').set(as('kiran')).expect(200)).body.data).toMatchObject({ label: 'HSR Layout' });

    const week = (await api(app).put('/api/v1/me/commute').set(as('kiran')).send({ days: [{ date: tomorrow, status: 'OFFICE', toOfficeTime: '08:30', toHomeTime: '18:30' }] }).expect(200)).body.data;
    expect(week.find((d: { date: string }) => d.date === tomorrow)).toMatchObject({ planned: true, status: 'OFFICE', toOfficeTime: '08:30', toHomeTime: '18:30' });

    const plan = (await api(app).post('/api/v1/me/commute/plan').set(as('kiran')).expect(200)).body.data;
    expect(plan).toMatchObject({ requested: 1, waitlisted: 1 });
    const day = (await api(app).get('/api/v1/me/commute?days=3').set(as('kiran')).expect(200)).body.data.find((d: { date: string }) => d.date === tomorrow);
    expect(day.toOffice).toMatchObject({ state: 'REQUESTED', driverName: 'driver person' });
    expect(day.toHome.state).toBe('WAITLISTED');

    // Running it again changes nothing; working from home clears the times.
    expect((await api(app).post('/api/v1/me/commute/plan').set(as('kiran')).expect(200)).body.data).toMatchObject({ requested: 0, waitlisted: 0, alreadySet: 2 });
    const wfh = (await api(app).put('/api/v1/me/commute').set(as('kiran')).send({ days: [{ date: tomorrow, status: 'WFH' }] }).expect(200)).body.data;
    expect(wfh.find((d: { date: string }) => d.date === tomorrow)).toMatchObject({ status: 'WFH', toOfficeTime: null });
  });
});
