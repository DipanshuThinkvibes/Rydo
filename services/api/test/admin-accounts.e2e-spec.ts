import { INestApplication } from '@nestjs/common';
import { api, createApp, FakeMessages, resetDb } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { buildWorld, World } from './world';

/** Admin accounts (company, HR and ride desk) run the company and never ride or drive. To carpool, an admin signs up with their own work email. */
describe('Admin accounts cannot ride or drive', () => {
  let app: INestApplication;
  let messages: FakeMessages;
  let prisma: PrismaService;
  let w: World;
  const search = { pickup: { label: 'Home', lat: 12.9116, lng: 77.6474 }, drop: { label: 'Office', lat: 12.9259, lng: 77.6766 }, date: '2030-01-07', fromTime: '08:00', toTime: '09:00' };

  beforeAll(async () => {
    ({ app, messages, prisma } = await createApp());
    await resetDb(prisma);
    w = await buildWorld(app, messages, prisma, 'adm');
    await w.person('orgadmin', ['ORG_ADMIN']);
    await w.person('hrRider', ['HR_ADMIN', 'RIDER']);
  });
  afterAll(() => app.close());

  const carpool: [string, string, object?][] = [
    ['post', '/api/v1/rides/search', search],
    ['post', '/api/v1/ride-plans', {}],
    ['get', '/api/v1/me/requests'],
    ['get', '/api/v1/me/bookings'],
    ['get', '/api/v1/rides/driving'],
    ['get', '/api/v1/me/commute'],
    ['get', '/api/v1/me/preferred-drivers'],
    ['get', '/api/v1/me/chat/unread'],
    ['get', '/api/v1/driver/profile'],
    ['post', '/api/v1/driver/profile', {}],
  ];

  it.each(['hr', 'ops', 'orgadmin', 'hrRider'])('%s is refused on every ride and drive route', async (key: string) => {
    for (const [method, path, body] of carpool) {
      const req = method === 'get' ? api(app).get(path) : api(app).post(path).send(body ?? {});
      const res = await req.set(w.as(key)).expect(403);
      expect(res.body.error.code).toBe('ADMIN_ACCOUNT');
    }
    await api(app).post(`/api/v1/rides/${w.rideId}/requests`).set(w.as(key)).send({}).expect(403);
    await api(app).post(`/api/v1/rides/${w.rideId}/start`).set(w.as(key)).send({}).expect(403);
  });

  it('a rider and a driver still carpool as before', async () => {
    await api(app).post('/api/v1/rides/search').set(w.as('priya')).send(search).expect(200);
    await api(app).get('/api/v1/me/bookings').set(w.as('priya')).expect(200);
    await api(app).get('/api/v1/rides/driving').set(w.as('driver')).expect(200);
    await api(app).get('/api/v1/driver/profile').set(w.as('driver')).expect(200);
  });

  it('admins still watch a live trip and keep their admin screens', async () => {
    const live = await api(app).get(`/api/v1/rides/${w.rideId}/live`).set(w.as('ops')).expect(200);
    expect(live.body.data.viewer).toBe('ADMIN');
    await api(app).get('/api/v1/admin/rides/live').set(w.as('ops')).expect(200);
    await api(app).get('/api/v1/admin/members').set(w.as('hr')).expect(200);
  });

  it('giving someone an admin role drops their rider and driver roles', async () => {
    const res = await api(app).patch(`/api/v1/admin/members/${w.ms.kiran}/roles`).set(w.as('orgadmin')).send({ roles: ['HR_ADMIN', 'RIDER', 'DRIVER'] }).expect(200);
    expect(res.body.data.roles).toEqual(['HR_ADMIN']);
    const stored = await prisma.membershipRole.findMany({ where: { membershipId: w.ms.kiran } });
    expect(stored.map((r) => r.role)).toEqual(['HR_ADMIN']);
    await api(app).post('/api/v1/rides/search').set(w.as('kiran')).send(search).expect(403);
    // Back to a plain rider: carpool works again.
    await api(app).patch(`/api/v1/admin/members/${w.ms.kiran}/roles`).set(w.as('orgadmin')).send({ roles: ['RIDER'] }).expect(200);
    await api(app).post('/api/v1/rides/search').set(w.as('kiran')).send(search).expect(200);
  });

  it('cross-company: an admin of another company gets no access here, not a hint about our roles', async () => {
    const res = await api(app).post('/api/v1/rides/search').set({ ...w.as('outsider', w.other), 'x-org-id': w.org }).send(search).expect(403);
    expect(res.body.error.code).toBe('MEMBERSHIP_NOT_ACTIVE');
  });
});
