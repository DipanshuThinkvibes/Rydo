import { INestApplication } from '@nestjs/common';
import { OrgRole } from '@prisma/client';
import { api, createApp, FakeMessages, resetDb, signIn } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/** Step 1: forgot password, company settings, logo, offices, departments, member tools. */
describe('Company admin tools', () => {
  let app: INestApplication;
  let messages: FakeMessages;
  let prisma: PrismaService;
  const orgs: Record<string, string> = {};
  const tokens: Record<string, string> = {};
  const ms: Record<string, string> = {};

  async function person(key: string, org: 'A' | 'B', roles: OrgRole[]) {
    const email = `${key}@${org}.test`.toLowerCase();
    const user = await prisma.user.create({ data: { email, name: `${key} person` } });
    const m = await prisma.membership.create({ data: { organizationId: orgs[org], userId: user.id, status: 'ACTIVE', roles: { create: roles.map((role) => ({ role })) } } });
    ms[key] = m.id;
    tokens[key] = (await signIn(app, messages, email)).accessToken;
  }
  const as = (key: string, org: 'A' | 'B') => ({ Authorization: `Bearer ${tokens[key]}`, 'x-org-id': orgs[org] });

  beforeAll(async () => {
    ({ app, messages, prisma } = await createApp());
    await resetDb(prisma);
    orgs.A = (await prisma.organization.create({ data: { name: 'Company A', slug: 'a', emailDomains: ['a.test'], status: 'ACTIVE' } })).id;
    orgs.B = (await prisma.organization.create({ data: { name: 'Company B', slug: 'b', emailDomains: ['b.test'], status: 'ACTIVE' } })).id;
    await person('adminA', 'A', ['ORG_ADMIN']);
    await person('hrA', 'A', ['HR_ADMIN']);
    await person('riderA', 'A', ['RIDER']);
    await person('adminB', 'B', ['ORG_ADMIN']);
  });
  afterAll(() => app.close());

  describe('forgot password', () => {
    it('resets with an emailed code and signs out old sessions', async () => {
      const email = 'hra@a.test';
      const before = await signIn(app, messages, email);
      await api(app).post('/api/v1/auth/otp/request').send({ email }).expect(200);
      await api(app).post('/api/v1/auth/password/reset').send({ email, code: messages.lastCode(email), newPassword: 'Fresh2026' }).expect(200);
      await api(app).post('/api/v1/auth/refresh').send({ refreshToken: before.refreshToken }).expect(401);
      await api(app).post('/api/v1/auth/password/login').send({ email, password: 'Fresh2026', client: 'WEB' }).expect(200);
      // the reset ended every old session, including the token the later tests used: sign in again
      await api(app).get('/api/v1/me').set('Authorization', `Bearer ${tokens.hrA}`).expect(401);
      tokens.hrA = (await signIn(app, messages, email)).accessToken;
    });

    it('rejects a wrong code', async () => {
      const email = 'admina@a.test';
      await api(app).post('/api/v1/auth/otp/request').send({ email }).expect(200);
      const right = messages.lastCode(email);
      const res = await api(app).post('/api/v1/auth/password/reset').send({ email, code: right === '123456' ? '654321' : '123456', newPassword: 'Fresh2026' }).expect(400);
      expect(res.body.error.code).toBe('OTP_INVALID');
    });
  });

  describe('company settings', () => {
    it('shows every ride rule with defaults to HR', async () => {
      const res = await api(app).get('/api/v1/admin/org').set(as('hrA', 'A')).expect(200);
      expect(res.body.data).toMatchObject({ name: 'Company A', emailDomains: ['a.test'] });
      expect(res.body.data.settings).toMatchObject({ freeCancelHours: 2, driverPopupSeconds: 20, womenOnlyEnabled: true, costPerKmEstimate: null });
    });

    it('only Org Admins can change it', async () => {
      await api(app).patch('/api/v1/admin/org').set(as('hrA', 'A')).send({ name: 'Nope' }).expect(403);
    });

    it('merges a partial rules update and keeps the rest', async () => {
      const res = await api(app).patch('/api/v1/admin/org').set(as('adminA', 'A')).send({ name: 'Company A Ltd', settings: { freeCancelHours: 4 } }).expect(200);
      expect(res.body.data.name).toBe('Company A Ltd');
      expect(res.body.data.settings).toMatchObject({ freeCancelHours: 4, maxDetourMinutes: 10 });
      expect(await prisma.auditLog.count({ where: { action: 'ORG_UPDATED', organizationId: orgs.A } })).toBe(1);
    });

    it('validates rule ranges', async () => {
      const res = await api(app).patch('/api/v1/admin/org').set(as('adminA', 'A')).send({ settings: { driverPopupSeconds: 2 } }).expect(400);
      expect(res.body.error.fields['settings.driverPopupSeconds']).toBeDefined();
    });

    it('refuses an email domain another company owns', async () => {
      const res = await api(app).patch('/api/v1/admin/org').set(as('adminA', 'A')).send({ emailDomains: ['a.test', 'b.test'] }).expect(409);
      expect(res.body.error.fields.emailDomains).toBeDefined();
    });

    it('accepts a PNG logo and refuses other files', async () => {
      await api(app).post('/api/v1/admin/org/logo').set(as('adminA', 'A')).attach('file', Buffer.from('hello'), { filename: 'x.txt', contentType: 'text/plain' }).expect(400);
      const res = await api(app).post('/api/v1/admin/org/logo').set(as('adminA', 'A')).attach('file', Buffer.from([0x89, 0x50, 0x4e, 0x47]), { filename: 'logo.png', contentType: 'image/png' }).expect(201);
      expect(res.body.data.logoUrl).toMatch(new RegExp(`orgs/${orgs.A}/logo-.+\\.png`));
    });
  });

  describe('offices', () => {
    let officeA: string;

    it('creates offices with a map point, one default at a time', async () => {
      officeA = (await api(app).post('/api/v1/admin/offices').set(as('adminA', 'A')).send({ name: 'Bellandur', address: 'Outer Ring Rd', lat: 12.9259, lng: 77.6766, isDefault: true }).expect(201)).body.data.id;
      await api(app).post('/api/v1/admin/offices').set(as('adminA', 'A')).send({ name: 'Whitefield', address: 'ITPL Main Rd', lat: 12.9857, lng: 77.7307, isDefault: true }).expect(201);
      const list = (await api(app).get('/api/v1/admin/offices').set(as('hrA', 'A')).expect(200)).body.data;
      expect(list).toHaveLength(2);
      expect(list[0]).toMatchObject({ name: 'Whitefield', isDefault: true });
      expect(list.find((o: { name: string }) => o.name === 'Bellandur')).toMatchObject({ isDefault: false, lat: 12.9259, lng: 77.6766 });
    });

    it('another company cannot see, edit or delete them', async () => {
      expect((await api(app).get('/api/v1/admin/offices').set(as('adminB', 'B')).expect(200)).body.data).toHaveLength(0);
      expect((await api(app).get('/api/v1/admin/offices').set(as('riderA', 'A')).expect(200)).body.data).toHaveLength(2);
      await api(app).post('/api/v1/admin/offices').set(as('riderA', 'A')).send({ name: 'Nope', address: 'Nope road', lat: 1, lng: 1 }).expect(403);
      await api(app).patch(`/api/v1/admin/offices/${officeA}`).set(as('adminB', 'B')).send({ name: 'Hacked', address: 'x x x', lat: 0, lng: 0 }).expect(404);
      await api(app).delete(`/api/v1/admin/offices/${officeA}`).set(as('adminB', 'B')).expect(404);
      await api(app).delete(`/api/v1/admin/offices/${officeA}`).set(as('adminA', 'A')).expect(200);
    });
  });

  describe('departments and members', () => {
    let deptA: string;
    let deptB: string;

    it('creates departments and refuses duplicates', async () => {
      deptA = (await api(app).post('/api/v1/admin/departments').set(as('hrA', 'A')).send({ name: 'Engineering' }).expect(201)).body.data.id;
      deptB = (await api(app).post('/api/v1/admin/departments').set(as('adminB', 'B')).send({ name: 'Engineering' }).expect(201)).body.data.id;
      const dup = await api(app).post('/api/v1/admin/departments').set(as('hrA', 'A')).send({ name: 'Engineering' }).expect(409);
      expect(dup.body.error.code).toBe('CONFLICT');
    });

    it('assigns only departments of the same company', async () => {
      await api(app).patch(`/api/v1/admin/members/${ms.riderA}`).set(as('hrA', 'A')).send({ departmentId: deptB }).expect(404);
      await api(app).patch(`/api/v1/admin/members/${ms.riderA}`).set(as('hrA', 'A')).send({ departmentId: deptA }).expect(200);
      const list = (await api(app).get('/api/v1/admin/members?q=ridera').set(as('hrA', 'A')).expect(200)).body.data;
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ email: 'ridera@a.test', department: 'Engineering', departmentId: deptA });
    });

    it('deleting a department leaves its people without one', async () => {
      await api(app).delete(`/api/v1/admin/departments/${deptA}`).set(as('hrA', 'A')).expect(200);
      expect((await prisma.membership.findUniqueOrThrow({ where: { id: ms.riderA } })).departmentId).toBeNull();
    });

    it('suspends and reactivates, but not yourself', async () => {
      await api(app).post(`/api/v1/admin/members/${ms.hrA}/suspend`).set(as('hrA', 'A')).expect(409);
      await api(app).post(`/api/v1/admin/members/${ms.riderA}/suspend`).set(as('hrA', 'A')).expect(200);
      expect((await prisma.membership.findUniqueOrThrow({ where: { id: ms.riderA } })).status).toBe('SUSPENDED');
      await api(app).post(`/api/v1/admin/members/${ms.riderA}/suspend`).set(as('adminB', 'B')).expect(404);
      await api(app).post(`/api/v1/admin/members/${ms.riderA}/reactivate`).set(as('hrA', 'A')).expect(200);
    });

    it('keeps the last Org Admin from being suspended', async () => {
      const res = await api(app).post(`/api/v1/admin/members/${ms.adminA}/suspend`).set(as('hrA', 'A')).expect(409);
      expect(res.body.error.message).toMatch(/at least one Org Admin/);
    });
  });
});