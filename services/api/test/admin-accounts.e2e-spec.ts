import { INestApplication } from '@nestjs/common';
import { api, createApp, FakeMessages, resetDb, signIn } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { buildWorld, World } from './world';

const search = { pickup: { label: 'Home', lat: 12.91, lng: 77.64 }, drop: { label: 'Office', lat: 12.92, lng: 77.67 }, date: '2030-01-07', fromTime: '08:00', toTime: '09:30' };

/** Admin accounts run the company. Riding and driving are for separate employee accounts. */
describe('Admin accounts and employee accounts', () => {
  let app: INestApplication;
  let messages: FakeMessages;
  let prisma: PrismaService;
  let w: World;
  let root: { Authorization: string };

  beforeAll(async () => {
    ({ app, messages, prisma } = await createApp());
    await resetDb(prisma);
    w = await buildWorld(app, messages, prisma, 'adm');
    await w.person('orgadmin', ['ORG_ADMIN']);
    const staff = await prisma.user.create({ data: { email: 'owner@rydo.test', name: 'Owner' } });
    await prisma.platformAdmin.create({ data: { userId: staff.id, role: 'SUPER_ADMIN' } });
    root = { Authorization: `Bearer ${(await signIn(app, messages, 'owner@rydo.test')).accessToken}` };
  });
  afterAll(() => app.close());

  const refused = (res: { status: number; body: { error?: { code: string; message: string } } }) => {
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('ADMIN_ACCOUNT');
    expect(res.body.error?.message).toContain('employee account');
  };

  describe.each([['hr'], ['ops'], ['orgadmin']])('the %s admin account', (key) => {
    it('cannot ask to ride: search, plans, requests, week, chat, preferred drivers', async () => {
      refused(await api(app).post('/api/v1/rides/search').set(w.as(key)).send(search));
      refused(await api(app).post('/api/v1/ride-plans').set(w.as(key)).send({}));
      refused(await api(app).get('/api/v1/me/preferred-drivers').set(w.as(key)));
      refused(await api(app).get('/api/v1/me/commute').set(w.as(key)));
      refused(await api(app).get(`/api/v1/rides/${w.rideId}/chat`).set(w.as(key)));
    });

    it('cannot ask to drive: start, vehicle, application, documents, vehicle check', async () => {
      refused(await api(app).get('/api/v1/driver/profile').set(w.as(key)));
      refused(await api(app).post('/api/v1/driver/profile').set(w.as(key)).send({}));
      refused(await api(app).post('/api/v1/driver/vehicles').set(w.as(key)).send({ type: 'CAR', make: 'Honda', model: 'City', color: 'White', plateNumber: 'KA 01 AB 9999', seatCapacity: 3 }));
      refused(await api(app).post('/api/v1/driver/application').set(w.as(key)).send({ dateOfBirth: '1990-01-01', licenseClass: 'LMV', drivingSince: 2012, declaration: true }));
      refused(await api(app).post(`/api/v1/driver/vehicles/${w.vehicleId}/check`).set(w.as(key)));
    });

    it('still runs the company: members, drivers to review, reports, the live board, notifications and its own account', async () => {
      const admin = (await api(app).get('/api/v1/me').set(w.as(key)).expect(200)).body.data;
      expect(admin.memberships[0].roles.some((r: string) => r === 'RIDER' || r === 'DRIVER')).toBe(false);
      await api(app).get('/api/v1/me/profile').set(w.as(key)).expect(200);
      await api(app).get('/api/v1/me/notifications').set(w.as(key)).expect(200);
      await api(app).get('/api/v1/me/highlights').set(w.as(key)).expect(200);
      await api(app).get('/api/v1/admin/rides/live').set(w.as(key)).expect(200);
      await api(app).get(`/api/v1/rides/${w.rideId}/live`).set(w.as(key)).expect(200); // watching a trip is monitoring, not riding
    });
  });

  it('HR and the Org admin still manage people and drivers', async () => {
    await api(app).get('/api/v1/admin/members').set(w.as('hr')).expect(200);
    await api(app).get('/api/v1/admin/drivers').set(w.as('hr')).expect(200);
    await api(app).get('/api/v1/admin/reports/summary?from=2030-01-01&to=2030-01-31').set(w.as('orgadmin')).expect(200);
  });

  it('an employee account (rider or driver) is unaffected', async () => {
    await api(app).post('/api/v1/rides/search').set(w.as('priya')).send(search).expect(200);
    await api(app).get('/api/v1/me/preferred-drivers').set(w.as('priya')).expect(200);
    await api(app).get('/api/v1/driver/profile').set(w.as('driver')).expect(200);
    await api(app).get(`/api/v1/rides/${w.rideId}/chat`).set(w.as('driver')).expect((r) => expect(r.status).not.toBe(403));
  });

  it('a person who was both (an old mixed account) is treated as an admin account', async () => {
    await prisma.membershipRole.create({ data: { membershipId: w.ms.hr, role: 'RIDER' } });
    refused(await api(app).post('/api/v1/rides/search').set(w.as('hr')).send(search));
    await prisma.membershipRole.deleteMany({ where: { membershipId: w.ms.hr, role: 'RIDER' } });
  });

  it('roles cannot be mixed: an admin is not made a rider or driver on the same account', async () => {
    const mixed = await api(app).patch(`/api/v1/admin/members/${w.ms.kiran}/roles`).set(w.as('orgadmin')).send({ roles: ['HR_ADMIN', 'RIDER'] }).expect(409);
    expect(mixed.body.error.message).toMatch(/separate employee account/);
    expect(mixed.body.error.fields.roles).toBeDefined();
    await api(app).patch(`/api/v1/admin/members/${w.ms.kiran}/roles`).set(w.as('orgadmin')).send({ roles: ['OPS_ADMIN', 'DRIVER'] }).expect(409);
    // an employee stays an employee, and promoting someone replaces their roles instead of adding to them
    await api(app).patch(`/api/v1/admin/members/${w.ms.kiran}/roles`).set(w.as('orgadmin')).send({ roles: ['RIDER', 'DRIVER'] }).expect(200);
    await api(app).patch(`/api/v1/admin/members/${w.ms.kiran}/roles`).set(w.as('orgadmin')).send({ roles: ['HR_ADMIN'] }).expect(200);
    refused(await api(app).post('/api/v1/rides/search').set(w.as('kiran')).send(search));
    // and back to an employee
    await api(app).patch(`/api/v1/admin/members/${w.ms.kiran}/roles`).set(w.as('orgadmin')).send({ roles: ['RIDER'] }).expect(200);
    await api(app).post('/api/v1/rides/search').set(w.as('kiran')).send(search).expect(200);
  });

  it('RYDO cannot make an existing rider or driver the client admin on that same account', async () => {
    const res = await api(app).post(`/api/v1/admin/platform/organizations/${w.org}/admins`).set(root).send({ name: 'Priya', email: w.emails.priya }).expect(409);
    expect(res.body.error.message).toMatch(/separate account/);
    expect(await prisma.membershipRole.count({ where: { membershipId: w.ms.priya, role: 'ORG_ADMIN' } })).toBe(0);
    // a brand new email is fine
    await api(app).post(`/api/v1/admin/platform/organizations/${w.org}/admins`).set(root).send({ name: 'New Admin', email: `newadmin@${w.domain}` }).expect(201);
  });

  it('the same person can have one account of each kind (different emails) in the same company', async () => {
    const adminUser = await prisma.user.create({ data: { email: `sam.admin@${w.domain}`, name: 'Sam Admin' } });
    const riderUser = await prisma.user.create({ data: { email: `sam@${w.domain}`, name: 'Sam' } });
    await prisma.membership.create({ data: { organizationId: w.org, userId: adminUser.id, status: 'ACTIVE', roles: { create: [{ role: 'HR_ADMIN' }] } } });
    await prisma.membership.create({ data: { organizationId: w.org, userId: riderUser.id, status: 'ACTIVE', roles: { create: [{ role: 'RIDER' }] } } });
    const a = (await signIn(app, messages, adminUser.email)).accessToken;
    const r = (await signIn(app, messages, riderUser.email)).accessToken;
    const h = (t: string) => ({ Authorization: `Bearer ${t}`, 'x-org-id': w.org });
    refused(await api(app).post('/api/v1/rides/search').set(h(a)).send(search));
    await api(app).post('/api/v1/rides/search').set(h(r)).send(search).expect(200);
    await api(app).get('/api/v1/admin/members').set(h(a)).expect(200);
    await api(app).get('/api/v1/admin/members').set(h(r)).expect(403);
  });
});
