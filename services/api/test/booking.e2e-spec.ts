import { INestApplication } from '@nestjs/common';
import { Gender, OrgRole } from '@prisma/client';
import { decodePolyline } from '@rydo/shared';
import { api, createApp, FakeMessages, resetDb, signIn } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { BookingService } from '../src/rides/booking.service';

const HOME = { label: 'HSR Layout', lat: 12.9116, lng: 77.6474 };
const OFFICE = { label: 'Acme Tech, Bellandur', lat: 12.9259, lng: 77.6766 };
// ~30% along the way, ~170 m off the straight-line route
const NEAR = { label: '27th Main bus stop', lat: 12.9116 + 0.3 * (12.9259 - 12.9116) + 0.0013, lng: 77.6474 + 0.3 * (77.6766 - 77.6474) - 0.0007 };
const FAR = { label: 'Whitefield', lat: 12.9698, lng: 77.75 };
const nextYear = new Date(`${new Date().getFullYear() + 1}-06-30`);

/** Phase 3 part C: matching, requests, seat locking, PIN, rematch, cancellations. */
describe('Matching and booking', () => {
  let app: INestApplication;
  let messages: FakeMessages;
  let prisma: PrismaService;
  const orgs: Record<string, string> = {};
  const tokens: Record<string, string> = {};
  const ms: Record<string, string> = {};
  const vehicles: Record<string, string> = {};
  let rahulRide: string;
  let snehaRide: string;
  let womenRide: string;
  let date: string;

  async function person(key: string, org: 'A' | 'B', roles: OrgRole[], gender: Gender, driver = false) {
    const email = `${key}@${org}.test`.toLowerCase();
    const user = await prisma.user.create({ data: { email, name: `${key} person`, gender } });
    const m = await prisma.membership.create({ data: { organizationId: orgs[org], userId: user.id, status: 'ACTIVE', roles: { create: roles.map((role) => ({ role })) } } });
    ms[key] = m.id;
    if (driver) {
      const p = await prisma.driverProfile.create({ data: { membershipId: m.id, status: 'VERIFIED' } });
      vehicles[key] = (await prisma.vehicle.create({ data: { organizationId: orgs[org], driverProfileId: p.id, type: 'CAR', make: 'Honda', model: 'City', color: 'White', plateNumber: `KA 01 ${key.slice(0, 2).toUpperCase()} 1234`, seatCapacity: 3, isDefault: true } })).id;
      await prisma.document.createMany({
        data: [
          { organizationId: orgs[org], driverProfileId: p.id, kind: 'DRIVING_LICENSE', storageKey: 'x', expiresAt: nextYear, status: 'APPROVED' },
          { organizationId: orgs[org], driverProfileId: p.id, vehicleId: vehicles[key], kind: 'VEHICLE_RC', storageKey: 'y', expiresAt: nextYear, status: 'APPROVED' },
        ],
      });
    }
    tokens[key] = (await signIn(app, messages, email)).accessToken;
  }
  const as = (key: string, org: 'A' | 'B' = 'A') => ({ Authorization: `Bearer ${tokens[key]}`, 'x-org-id': orgs[org] });
  const publish = (key: string, departTime: string, extra: object = {}) =>
    api(app).post('/api/v1/ride-plans').set(as(key)).send({ vehicleId: vehicles[key], origin: HOME, destination: OFFICE, departTime, daysOfWeek: [1, 2, 3, 4, 5], seats: 3, ...extra }).expect(201);
  const search = (key: string, body: object = {}) =>
    api(app).post('/api/v1/rides/search').set(as(key)).send({ pickup: NEAR, drop: OFFICE, date, fromTime: '08:00', toTime: '09:15', ...body }).expect(200);
  const firstRide = async (key: string, local: string) => {
    const [row] = await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM rides WHERE driver_membership_id = ${ms[key]}::uuid
      AND (depart_at AT TIME ZONE 'Asia/Kolkata')::date = ${date}::date AND to_char(depart_at AT TIME ZONE 'Asia/Kolkata', 'HH24:MI') = ${local}`;
    return row.id;
  };

  beforeAll(async () => {
    ({ app, messages, prisma } = await createApp());
    await resetDb(prisma);
    orgs.A = (await prisma.organization.create({ data: { name: 'Company A', slug: 'a', emailDomains: ['a.test'], status: 'ACTIVE' } })).id;
    orgs.B = (await prisma.organization.create({ data: { name: 'Company B', slug: 'b', emailDomains: ['b.test'], status: 'ACTIVE' } })).id;
    await person('rahul', 'A', ['RIDER', 'DRIVER'], 'MALE', true);
    await person('sneha', 'A', ['RIDER', 'DRIVER'], 'FEMALE', true);
    await person('priya', 'A', ['RIDER'], 'FEMALE');
    await person('arjun', 'A', ['RIDER'], 'MALE');
    await person('kiran', 'A', ['RIDER'], 'MALE');
    await person('dev', 'A', ['RIDER'], 'MALE');
    await person('outsider', 'B', ['RIDER'], 'MALE');
    await publish('rahul', '08:30');
    await publish('sneha', '08:40');
    await publish('sneha', '08:50', { womenOnly: true, vehicleId: vehicles.sneha });
    // A weekday at least 3 days ahead, so nothing is "in the past" or inside the free-cancel window.
    const [d] = await prisma.$queryRaw<{ d: string }[]>`SELECT to_char(min(depart_at AT TIME ZONE 'Asia/Kolkata'), 'YYYY-MM-DD') AS d FROM rides WHERE depart_at > now() + interval '3 days'`;
    date = d.d;
    rahulRide = await firstRide('rahul', '08:30');
    snehaRide = await firstRide('sneha', '08:40');
    womenRide = await firstRide('sneha', '08:50');
  });
  afterAll(() => app.close());

  describe('search', () => {
    it('finds rides passing near the pickup and then the drop, best first, with reasons', async () => {
      const res = (await search('priya')).body.data;
      expect(res.map((m: { rideId: string }) => m.rideId)).toEqual(expect.arrayContaining([rahulRide, snehaRide, womenRide]));
      expect(res[0].score).toBeGreaterThanOrEqual(res[res.length - 1].score);
      const rahul = res.find((m: { rideId: string }) => m.rideId === rahulRide);
      expect(rahul.score).toBeGreaterThan(50);
      expect(rahul.reasons[0]).toMatch(/m from the route|right by/);
      expect(rahul.driver.name).toBe('rahul person');
      expect(rahul.pickupDistanceMeters).toBeGreaterThan(50);
      expect(decodePolyline(rahul.route).length).toBeGreaterThan(1);
    });

    it('finds nothing far from the route or in the wrong direction', async () => {
      expect((await search('priya', { pickup: FAR })).body.data).toHaveLength(0);
      expect((await search('priya', { pickup: OFFICE, drop: NEAR })).body.data).toHaveLength(0);
    });

    it('women-only rides are shown to women only', async () => {
      expect((await search('arjun')).body.data.some((m: { rideId: string }) => m.rideId === womenRide)).toBe(false);
      const only = (await search('priya', { womenOnly: true })).body.data;
      expect(only.map((m: { rideId: string }) => m.rideId)).toEqual([womenRide]);
    });

    it('drivers never see their own rides and other companies see nothing', async () => {
      expect((await search('rahul')).body.data.some((m: { rideId: string }) => m.rideId === rahulRide)).toBe(false);
      await api(app).post('/api/v1/rides/search').set(as('outsider', 'A')).send({ pickup: NEAR, drop: OFFICE, date, fromTime: '08:00', toTime: '09:15' }).expect(403);
      const b = await api(app).post('/api/v1/rides/search').set(as('outsider', 'B')).send({ pickup: NEAR, drop: OFFICE, date, fromTime: '08:00', toTime: '09:15' }).expect(200);
      expect(b.body.data).toHaveLength(0);
    });
  });

  describe('request and accept', () => {
    let priyaRequest: string;

    it('a rider requests a seat; the driver is notified', async () => {
      const res = await api(app).post(`/api/v1/rides/${rahulRide}/requests`).set(as('priya')).send({ pickup: NEAR, drop: OFFICE }).expect(201);
      expect(res.body.data).toMatchObject({ status: 'PENDING' });
      priyaRequest = res.body.data.id;
      await api(app).post(`/api/v1/rides/${rahulRide}/requests`).set(as('priya')).send({ pickup: NEAR, drop: OFFICE }).expect(409);
      await api(app).post(`/api/v1/rides/${rahulRide}/requests`).set(as('outsider', 'B')).send({ pickup: NEAR, drop: OFFICE }).expect(404);
      await api(app).post(`/api/v1/rides/${rahulRide}/requests`).set(as('arjun')).send({ pickup: FAR, drop: OFFICE }).expect(409);
      const n = await prisma.notification.findFirst({ where: { type: 'REQUEST_RECEIVED', user: { email: 'rahul@a.test' } } });
      expect(n?.title).toMatch(/priya person wants a seat/);
    });

    it('only the ride\'s driver can answer', async () => {
      await api(app).post(`/api/v1/requests/${priyaRequest}/accept`).set(as('sneha')).expect(404);
      const manage = (await api(app).get(`/api/v1/rides/${rahulRide}/manage`).set(as('rahul')).expect(200)).body.data;
      expect(manage.requests[0]).toMatchObject({ requestId: priyaRequest, name: 'priya person', pickupLabel: '27th Main bus stop' });
      expect(manage.requests[0]).not.toHaveProperty('email');
      expect(manage.requests[0].pickup.lat).toBeCloseTo(NEAR.lat, 4);
      expect(decodePolyline(manage.route).length).toBeGreaterThan(1);
    });

    it('accepting creates a booking with a 4-digit PIN that only the rider sees', async () => {
      const res = await api(app).post(`/api/v1/requests/${priyaRequest}/accept`).set(as('rahul')).expect(200);
      const bookings = (await api(app).get('/api/v1/me/bookings').set(as('priya')).expect(200)).body.data;
      expect(bookings[0]).toMatchObject({ id: res.body.data.bookingId, status: 'CONFIRMED' });
      expect(bookings[0].pin).toMatch(/^\d{4}$/);
      expect(bookings[0].drop.lng).toBeCloseTo(OFFICE.lng, 4);
      expect(bookings[0].route).toEqual(expect.any(String));
      expect((await prisma.ride.findUniqueOrThrow({ where: { id: rahulRide } })).seatsBooked).toBe(1);
      expect(messages.sent.some((m) => m.to === 'priya@a.test' && /accepted your ride/.test(m.subject))).toBe(true);
      const manage = (await api(app).get(`/api/v1/rides/${rahulRide}/manage`).set(as('rahul'))).body.data;
      expect(manage.riders[0]).not.toHaveProperty('pin');
    });

    it('two riders racing for the last seat: exactly one gets it', async () => {
      await prisma.ride.update({ where: { id: rahulRide }, data: { seatsBooked: 2 } }); // pretend 2 of 3 taken
      const a = (await api(app).post(`/api/v1/rides/${rahulRide}/requests`).set(as('kiran')).send({ pickup: NEAR, drop: OFFICE }).expect(201)).body.data.id;
      const b = (await api(app).post(`/api/v1/rides/${rahulRide}/requests`).set(as('dev')).send({ pickup: NEAR, drop: OFFICE }).expect(201)).body.data.id;
      const results = await Promise.all([a, b].map((id) => api(app).post(`/api/v1/requests/${id}/accept`).set(as('rahul'))));
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      const ride = await prisma.ride.findUniqueOrThrow({ where: { id: rahulRide } });
      expect(ride).toMatchObject({ seatsBooked: 3, status: 'FULL' });
      expect((await search('arjun')).body.data.some((m: { rideId: string }) => m.rideId === rahulRide)).toBe(false);
    });
  });

  describe('when the driver says no', () => {
    it('a decline sends the request to the next best ride automatically', async () => {
      const id = (await api(app).post(`/api/v1/rides/${snehaRide}/requests`).set(as('arjun')).send({ pickup: NEAR, drop: OFFICE }).expect(201)).body.data.id;
      // Nothing else fits Arjun except Rahul's (full) and the women-only ride, so first give him another option:
      await publish('rahul', '08:45');
      await api(app).post(`/api/v1/requests/${id}/decline`).set(as('sneha')).expect(200);
      const next = await prisma.rideRequest.findFirst({ where: { riderMembershipId: ms.arjun, status: 'PENDING' }, include: { ride: true } });
      expect(next?.ride.driverMembershipId).toBe(ms.rahul);
      const n = await prisma.notification.findFirst({ where: { type: 'REQUEST_REMATCHED', user: { email: 'arjun@a.test' } } });
      expect(n?.title).toMatch(/declined, so we asked rahul person/);
    });

    it('an unanswered request expires (job) and the rider is told', async () => {
      const req = await prisma.rideRequest.findFirstOrThrow({ where: { riderMembershipId: ms.arjun, status: 'PENDING' } });
      await app.get(BookingService).expire(req.id);
      expect((await prisma.rideRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe('EXPIRED');
      expect(await prisma.notification.count({ where: { user: { email: 'arjun@a.test' }, type: { in: ['REQUEST_DECLINED', 'REQUEST_REMATCHED'] } } })).toBeGreaterThanOrEqual(2);
    });
  });

  describe('cancellations', () => {
    it('a rider cancelling inside the free window is marked late and loses reliability', async () => {
      await prisma.organization.update({ where: { id: orgs.A }, data: { settings: { freeCancelHours: 48 * 7 } } });
      const booking = await prisma.booking.findFirstOrThrow({ where: { riderMembershipId: ms.priya, status: 'CONFIRMED' } });
      const res = await api(app).post(`/api/v1/bookings/${booking.id}/cancel`).set(as('priya')).send({ reason: 'WFH tomorrow' }).expect(200);
      expect(res.body.data.late).toBe(true);
      expect(Number((await prisma.membership.findUniqueOrThrow({ where: { id: ms.priya } })).reliabilityScore)).toBe(95);
      const ride = await prisma.ride.findUniqueOrThrow({ where: { id: rahulRide } });
      expect(ride).toMatchObject({ seatsBooked: 2, status: 'SCHEDULED' });
      await api(app).post(`/api/v1/bookings/${booking.id}/cancel`).set(as('priya')).send({}).expect(409);
    });

    it('a driver cancelling a ride cancels every booking and tells the riders', async () => {
      const res = await api(app).post(`/api/v1/rides/${rahulRide}/cancel`).set(as('rahul')).send({ reason: 'Car in service' }).expect(200);
      expect(res.body.data.cancelledBookings).toBeGreaterThan(0);
      expect(await prisma.booking.count({ where: { rideId: rahulRide, status: 'CONFIRMED' } })).toBe(0);
      expect(messages.sent.some((m) => /cancelled the ride/.test(m.subject))).toBe(true);
      await api(app).post(`/api/v1/rides/${rahulRide}/cancel`).set(as('sneha')).send({}).expect(404);
    });

    it('notifications are listed and can be marked read', async () => {
      const list = (await api(app).get('/api/v1/me/notifications').set(as('rahul')).expect(200)).body;
      expect(list.meta.unread).toBeGreaterThan(0);
      await api(app).post('/api/v1/me/notifications/read').set(as('rahul')).expect(200);
      expect((await api(app).get('/api/v1/me/notifications').set(as('rahul'))).body.meta.unread).toBe(0);
    });
  });
});