import { INestApplication } from '@nestjs/common';
import { OrgRole } from '@prisma/client';
import { io, type Socket } from 'socket.io-client';
import { REALTIME_PATH } from '@rydo/shared';
import { api, createApp, FakeMessages, resetDb, signIn } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { TripService } from '../src/tracking/trip.service';

const HOME = { lat: 12.9116, lng: 77.6474 };
const MID = { lat: 12.9188, lng: 77.662 };
const OFFICE = { lat: 12.9259, lng: 77.6766 };
const NEAR = { lat: 12.9159, lng: 77.6555 }; // a pickup near the route

/** Phase 4: start, PIN boarding, no-show, live location, long stop, SOS, share link, ratings, realtime. */
describe('Live trips', () => {
  let app: INestApplication;
  let messages: FakeMessages;
  let prisma: PrismaService;
  let org: string;
  let other: string;
  let rideId: string;
  const tokens: Record<string, string> = {};
  const ms: Record<string, string> = {};
  const bookings: Record<string, string> = {};

  async function person(key: string, roles: OrgRole[], orgId = org) {
    const email = `${key}@t.test`;
    const user = await prisma.user.create({ data: { email, name: `${key} person` } });
    ms[key] = (await prisma.membership.create({ data: { organizationId: orgId, userId: user.id, status: 'ACTIVE', roles: { create: roles.map((role) => ({ role })) } } })).id;
    tokens[key] = (await signIn(app, messages, email)).accessToken;
  }
  const as = (key: string, orgId = org) => ({ Authorization: `Bearer ${tokens[key]}`, 'x-org-id': orgId });
  const pt = (p: { lat: number; lng: number }) => `ST_SetSRID(ST_MakePoint(${p.lng}, ${p.lat}), 4326)::geography`;

  async function book(key: string, pin: string, at = NEAR) {
    const [rq] = await prisma.$queryRawUnsafe<{ id: string }[]>(`
      INSERT INTO ride_requests (id, organization_id, ride_id, rider_membership_id, seats, pickup_label, pickup, drop_label, drop, auto_rematch, status, expires_at, created_at)
      VALUES (gen_random_uuid(), '${org}', '${rideId}', '${ms[key]}', 1, '${key} stop', ${pt(at)}, 'Office', ${pt(OFFICE)}, false, 'ACCEPTED', now(), now()) RETURNING id`);
    const [b] = await prisma.$queryRawUnsafe<{ id: string }[]>(`
      INSERT INTO bookings (id, organization_id, ride_id, request_id, rider_membership_id, seats, pickup_label, pickup, drop_label, drop, pin, status, created_at, updated_at)
      VALUES (gen_random_uuid(), '${org}', '${rideId}', '${rq.id}', '${ms[key]}', 1, '${key} stop', ${pt(at)}, 'Office', ${pt(OFFICE)}, '${pin}', 'CONFIRMED', now(), now()) RETURNING id`);
    bookings[key] = b.id;
  }

  beforeAll(async () => {
    ({ app, messages, prisma } = await createApp());
    await resetDb(prisma);
    org = (await prisma.organization.create({ data: { name: 'T Co', slug: 't', emailDomains: ['t.test'], status: 'ACTIVE' } })).id;
    other = (await prisma.organization.create({ data: { name: 'O Co', slug: 'o', emailDomains: ['o.test'], status: 'ACTIVE' } })).id;
    await person('driver', ['RIDER', 'DRIVER']);
    await person('priya', ['RIDER']);
    await person('arjun', ['RIDER']);
    await person('kiran', ['RIDER']);
    await person('stranger', ['RIDER']);
    await person('ops', ['OPS_ADMIN']);
    await person('outsider', ['ORG_ADMIN'], other);
    const p = await prisma.driverProfile.create({ data: { membershipId: ms.driver, status: 'VERIFIED' } });
    const v = await prisma.vehicle.create({ data: { organizationId: org, driverProfileId: p.id, type: 'CAR', make: 'Hyundai', model: 'i20', color: 'Grey', plateNumber: 'KA 03 MN 4521', seatCapacity: 3, isDefault: true } });
    const [r] = await prisma.$queryRawUnsafe<{ id: string }[]>(`
      INSERT INTO rides (id, organization_id, driver_membership_id, vehicle_id, direction, origin_label, origin, destination_label, destination, route_line,
        distance_meters, duration_seconds, depart_at, seats_total, seats_booked, women_only, status, created_at, updated_at)
      VALUES (gen_random_uuid(), '${org}', '${ms.driver}', '${v.id}', 'TO_OFFICE', 'Home', ${pt(HOME)}, 'Office', ${pt(OFFICE)},
        ST_GeogFromText('LINESTRING(${HOME.lng} ${HOME.lat}, ${MID.lng} ${MID.lat}, ${OFFICE.lng} ${OFFICE.lat})'),
        3500, 1200, now() + interval '10 minutes', 3, 3, false, 'FULL', now(), now()) RETURNING id`);
    rideId = r.id;
    await book('priya', '4827');
    await book('arjun', '1111');
    await book('kiran', '2222');
  });
  afterAll(() => app.close());

  it('only the driver starts, and not too early', async () => {
    await api(app).post(`/api/v1/rides/${rideId}/start`).set(as('priya')).expect(403);
    await api(app).post(`/api/v1/rides/${rideId}/start`).set(as('stranger')).expect(404);
    await prisma.ride.update({ where: { id: rideId }, data: { departAt: new Date(Date.now() + 2 * 3600_000) } });
    const early = await api(app).post(`/api/v1/rides/${rideId}/start`).set(as('driver')).expect(409);
    expect(early.body.error.code).toBe('TOO_EARLY');
    await prisma.ride.update({ where: { id: rideId }, data: { departAt: new Date(Date.now() + 10 * 60_000) } });
    await api(app).post(`/api/v1/rides/${rideId}/start`).set(as('driver')).expect(200);
    expect((await prisma.ride.findUniqueOrThrow({ where: { id: rideId } })).status).toBe('IN_PROGRESS');
    expect(await prisma.notification.count({ where: { type: 'RIDE_STARTED' } })).toBe(3);
  });

  it('live view: driver sees every rider, a rider only themself, admins everything, others nothing', async () => {
    const d = (await api(app).get(`/api/v1/rides/${rideId}/live`).set(as('driver')).expect(200)).body.data;
    expect(d.viewer).toBe('DRIVER');
    expect(d.riders).toHaveLength(3);
    expect(d.riders[0]).not.toHaveProperty('pin');
    const p = (await api(app).get(`/api/v1/rides/${rideId}/live`).set(as('priya')).expect(200)).body.data;
    expect(p.riders.map((x: { name: string }) => x.name)).toEqual(['priya person']);
    expect((await api(app).get(`/api/v1/rides/${rideId}/live`).set(as('ops')).expect(200)).body.data.viewer).toBe('ADMIN');
    await api(app).get(`/api/v1/rides/${rideId}/live`).set(as('stranger')).expect(404);
    await api(app).get(`/api/v1/rides/${rideId}/live`).set(as('outsider', other)).expect(404);
  });

  it('PIN boarding: wrong PIN refused, right PIN boards', async () => {
    const wrong = await api(app).post(`/api/v1/bookings/${bookings.priya}/board`).set(as('driver')).send({ pin: '0000' }).expect(400);
    expect(wrong.body.error.code).toBe('PIN_WRONG');
    await api(app).post(`/api/v1/bookings/${bookings.priya}/board`).set(as('priya')).send({ pin: '4827' }).expect(404);
    await api(app).post(`/api/v1/bookings/${bookings.priya}/arrived`).set(as('driver')).expect(200);
    await api(app).post(`/api/v1/bookings/${bookings.priya}/board`).set(as('driver')).send({ pin: '4827' }).expect(200);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: bookings.priya } })).status).toBe('BOARDED');
  });

  it('no-show only after arriving and waiting, and it costs reliability', async () => {
    await api(app).post(`/api/v1/bookings/${bookings.arjun}/no-show`).set(as('driver')).expect(409);
    const a = await api(app).post(`/api/v1/bookings/${bookings.arjun}/arrived`).set(as('driver')).expect(200);
    expect(new Date(a.body.data.noShowAt).getTime() - new Date(a.body.data.arrivedAt).getTime()).toBe(3 * 60_000);
    const early = await api(app).post(`/api/v1/bookings/${bookings.arjun}/no-show`).set(as('driver')).expect(409);
    expect(early.body.error.code).toBe('TOO_EARLY');
    await prisma.rideEvent.updateMany({ where: { bookingId: bookings.arjun, type: 'ARRIVED_AT_PICKUP' }, data: { at: new Date(Date.now() - 4 * 60_000) } });
    await api(app).post(`/api/v1/bookings/${bookings.arjun}/no-show`).set(as('driver')).expect(200);
    expect(Number((await prisma.membership.findUniqueOrThrow({ where: { id: ms.arjun } })).reliabilityScore)).toBe(90);
  });

  it('streams location to the ride and ops rooms over Socket.IO', async () => {
    await app.listen(0);
    const url = await app.getUrl();
    const connect = (key: string) =>
      new Promise<Socket>((resolve, reject) => {
        const s = io(url.replace('[::1]', 'localhost'), { path: REALTIME_PATH, transports: ['websocket'], auth: { token: tokens[key] } });
        s.on('connect', () => resolve(s));
        s.on('connect_error', reject);
      });
    const rider = await connect('priya');
    const ops = await connect('ops');
    const stranger = await connect('stranger');
    expect(await rider.emitWithAck('subscribe', { rideId })).toEqual({ ok: true });
    expect(await ops.emitWithAck('subscribe', { opsOrgId: org })).toEqual({ ok: true });
    expect(await stranger.emitWithAck('subscribe', { rideId })).toEqual({ ok: false });
    const got = Promise.all([new Promise((r) => rider.once('ride.location', r)), new Promise((r) => ops.once('ride.location', r))]);
    await api(app).post(`/api/v1/rides/${rideId}/locations`).set(as('driver')).send({ points: [{ ...HOME, speedMps: 8 }, { ...MID, speedMps: 9 }] }).expect(200);
    const [a, b] = (await got) as { lat: number }[];
    expect(a.lat).toBeCloseTo(MID.lat, 4);
    expect(b.lat).toBeCloseTo(MID.lat, 4);
    [rider, ops, stranger].forEach((s) => s.close());
  });

  it('only the driver sends locations, and the live view shows the newest one', async () => {
    await api(app).post(`/api/v1/rides/${rideId}/locations`).set(as('priya')).send({ points: [MID] }).expect(403);
    const live = (await api(app).get(`/api/v1/rides/${rideId}/live`).set(as('priya')).expect(200)).body.data;
    expect(live.location.lat).toBeCloseTo(MID.lat, 4);
  });

  it('flags a long stop away from any pickup, and an off-route car', async () => {
    const stuck = { lat: 12.9205, lng: 77.6655 };
    const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
    // Earlier test points were moving; push them out of the stop window.
    await prisma.$executeRaw`UPDATE vehicle_locations SET recorded_at = recorded_at - interval '30 minutes'`;
    const res = await api(app).post(`/api/v1/rides/${rideId}/locations`).set(as('driver')).send({ points: [5, 4, 3, 2, 1, 0].map((m) => ({ ...stuck, at: ago(m) })) }).expect(200);
    expect(res.body.data.alerts).toContain('LONG_STOP');
    expect(await prisma.notification.count({ where: { type: 'LONG_STOP' } })).toBe(2); // driver + boarded rider
    await api(app).post(`/api/v1/rides/${rideId}/ok`).set(as('priya')).expect(200);
    const off = await api(app).post(`/api/v1/rides/${rideId}/locations`).set(as('driver')).send({ points: [{ lat: 12.95, lng: 77.7 }] }).expect(200);
    expect(off.body.data.alerts).toContain('OFF_ROUTE');
  });

  it('SOS reaches company admins at once; they acknowledge and resolve it', async () => {
    await api(app).post(`/api/v1/rides/${rideId}/sos`).set(as('ops')).send({}).expect(403);
    const s = await api(app).post(`/api/v1/rides/${rideId}/sos`).set(as('priya')).send({ lat: 12.92, lng: 77.66 }).expect(201);
    const again = await api(app).post(`/api/v1/rides/${rideId}/sos`).set(as('priya')).send({}).expect(201);
    expect(again.body.data).toMatchObject({ id: s.body.data.id, alreadyOpen: true });
    expect(messages.sent.some((m) => m.to === 'ops@t.test' && /SOS from priya person/.test(m.subject))).toBe(true);
    const list = (await api(app).get('/api/v1/admin/sos').set(as('ops')).expect(200)).body.data;
    expect(list[0]).toMatchObject({ status: 'ACTIVE', raisedBy: 'priya person', byDriver: false });
    expect(list[0].lat).toBeCloseTo(12.92, 3);
    await api(app).get('/api/v1/admin/sos').set(as('priya')).expect(403);
    await api(app).get('/api/v1/admin/sos').set(as('outsider', other)).expect(200).then((r) => expect(r.body.data).toHaveLength(0));
    await api(app).post(`/api/v1/admin/sos/${s.body.data.id}/ack`).set(as('ops')).expect(200);
    await api(app).post(`/api/v1/admin/sos/${s.body.data.id}/resolve`).set(as('ops')).send({ notes: 'Called Priya, flat tyre, all fine' }).expect(200);
    expect((await prisma.sosEvent.findUniqueOrThrow({ where: { id: s.body.data.id } })).status).toBe('RESOLVED');
    const board = (await api(app).get('/api/v1/admin/rides/live').set(as('ops')).expect(200)).body.data;
    expect(board[0]).toMatchObject({ id: rideId, openSos: 0, plateNumber: 'KA 03 MN 4521' });
  });

  it('a share link shows the trip to family without sign-in and without private details', async () => {
    await api(app).post(`/api/v1/rides/${rideId}/share`).set(as('driver')).expect(403);
    const share = (await api(app).post(`/api/v1/rides/${rideId}/share`).set(as('priya')).expect(201)).body.data;
    expect(share.url).toContain(`/t/${share.token}`);
    const pub = (await api(app).get(`/api/v1/public/trips/${share.token}`).expect(200)).body.data;
    expect(pub).toMatchObject({ status: 'IN_PROGRESS', driverFirstName: 'driver', vehicle: { plateNumber: 'KA 03 MN 4521' }, rider: { firstName: 'priya', status: 'BOARDED' } });
    expect(JSON.stringify(pub)).not.toMatch(/@t\.test|4827/);
    await api(app).get('/api/v1/public/trips/not-a-real-token').expect(404);
  });

  it('GPS points land in day partitions, and housekeeping keeps SOS days', async () => {
    const [p] = await prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM gps.vehicle_locations_default`;
    expect(p.n).toBe(0);
    const r = await app.get(TripService).retention();
    expect(r.partitionsDropped).toBe(0);
    const [old] = await prisma.$queryRaw<{ ok: boolean }[]>`SELECT to_regclass('gps.vehicle_locations_' || to_char((now() AT TIME ZONE 'UTC')::date, 'YYYYMMDD')) IS NOT NULL AS ok`;
    expect(old.ok).toBe(true);
  });

  it('completing the ride closes it, and people rate each other once', async () => {
    await api(app).post(`/api/v1/rides/${rideId}/ratings`).set(as('priya')).send({ rateeMembershipId: ms.driver, stars: 5 }).expect(409);
    await api(app).post(`/api/v1/rides/${rideId}/complete`).set(as('driver')).expect(200);
    const statuses = await prisma.booking.findMany({ where: { rideId }, select: { riderMembershipId: true, status: true } });
    const by = Object.fromEntries(statuses.map((s) => [s.riderMembershipId, s.status]));
    expect(by).toEqual({ [ms.priya]: 'COMPLETED', [ms.arjun]: 'NO_SHOW', [ms.kiran]: 'NO_SHOW' });
    expect(Number((await prisma.membership.findUniqueOrThrow({ where: { id: ms.kiran } })).reliabilityScore)).toBe(100);
    await api(app).post(`/api/v1/rides/${rideId}/ratings`).set(as('priya')).send({ rateeMembershipId: ms.driver, stars: 5, tags: ['On time'] }).expect(201);
    await api(app).post(`/api/v1/rides/${rideId}/ratings`).set(as('priya')).send({ rateeMembershipId: ms.driver, stars: 4 }).expect(409);
    await api(app).post(`/api/v1/rides/${rideId}/ratings`).set(as('priya')).send({ rateeMembershipId: ms.arjun, stars: 1 }).expect(403);
    await api(app).post(`/api/v1/rides/${rideId}/ratings`).set(as('arjun')).send({ rateeMembershipId: ms.driver, stars: 1 }).expect(403);
    await api(app).post(`/api/v1/rides/${rideId}/ratings`).set(as('driver')).send({ rateeMembershipId: ms.priya, stars: 5 }).expect(201);
    const live = (await api(app).get(`/api/v1/rides/${rideId}/live`).set(as('priya')).expect(200)).body.data;
    expect(live).toMatchObject({ ride: { status: 'COMPLETED' }, ratedDriver: true });
    await api(app).post(`/api/v1/rides/${rideId}/locations`).set(as('driver')).send({ points: [MID] }).expect(409);
  });
  it('reports count the day and export safe CSV files; exports and activity are role-checked', async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    const s = (await api(app).get(`/api/v1/admin/reports/summary?from=${today}&to=${today}`).set(as('ops')).expect(200)).body.data;
    expect(s.totals).toMatchObject({ ridesCompleted: 1, tripsCompleted: 1, noShows: 2, sosRaised: 1, activeRiders: 1, activeDrivers: 1 });
    expect(s.totals.sharedKm).toBeGreaterThan(0);
    expect(s.series).toHaveLength(1);
    expect(s.drivers[0]).toMatchObject({ name: 'driver person', rides: 1, riders: 1, rating: 5 });
    await api(app).get(`/api/v1/admin/reports/summary?from=${today}&to=2020-01-01`).set(as('ops')).expect(400);
    await api(app).get(`/api/v1/admin/reports/summary?from=${today}&to=${today}`).set(as('priya')).expect(403);

    await prisma.user.updateMany({ where: { email: 'priya@t.test' }, data: { name: '=HYPERLINK("x")' } });
    const b = await api(app).get(`/api/v1/admin/reports/bookings.csv?from=${today}&to=${today}`).set(as('ops')).expect(200);
    expect(b.headers['content-type']).toMatch(/text\/csv/);
    expect(b.headers['content-disposition']).toContain(`bookings-${today}`);
    expect(b.text.charCodeAt(0)).toBe(0xfeff);
    expect(b.text).toContain(`"'=HYPERLINK(""x"")"`);
    expect(b.text.trim().split('\r\n')).toHaveLength(4); // header + 3 bookings
    await prisma.user.updateMany({ where: { email: 'priya@t.test' }, data: { name: 'priya person' } });

    await api(app).get('/api/v1/admin/reports/employees.csv').set(as('ops')).expect(403);
    await person('hr', ['HR_ADMIN']);
    const e = await api(app).get('/api/v1/admin/reports/employees.csv').set(as('hr')).expect(200);
    expect(e.text).toContain('priya@t.test');
    await api(app).get('/api/v1/admin/reports/employees.csv').set(as('outsider', other)).expect(200).then((r) => expect(r.text).not.toContain('priya@t.test'));

    await api(app).get('/api/v1/admin/audit').set(as('ops')).expect(403);
    const log = (await api(app).get('/api/v1/admin/audit?limit=100').set(as('hr')).expect(200)).body.data.map((r: { action: string }) => r.action);
    expect(log).toEqual(expect.arrayContaining(['REPORT_EXPORTED', 'RIDE_COMPLETED', 'SOS_RAISED']));
  });
});