import { INestApplication } from '@nestjs/common';
import { api, createApp, FakeMessages, resetDb, signIn } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { buildWorld, World } from './world';

const DAY = 86_400_000;

/** RYDO's Super Admin and Support team can pause a rider or driver for a while. Support only for a limited time. */
describe('Temporary blocks and the Support team', () => {
  let app: INestApplication;
  let messages: FakeMessages;
  let prisma: PrismaService;
  let w: World;
  let root: { Authorization: string };
  let support: { Authorization: string };
  const base = '/api/v1/admin/platform';
  const block = (who: { Authorization: string }, key: string, body: object) => api(app).post(`${base}/people/${w.ms[key]}/block`).set(who).send(body);
  const unblock = (who: { Authorization: string }, key: string) => api(app).post(`${base}/people/${w.ms[key]}/unblock`).set(who).send({ reason: 'Resolved with the company' });
  const row = (key: string) => prisma.membership.findUniqueOrThrow({ where: { id: w.ms[key] } });

  beforeAll(async () => {
    ({ app, messages, prisma } = await createApp());
    await resetDb(prisma);
    w = await buildWorld(app, messages, prisma, 'tmp');
    const owner = await prisma.user.create({ data: { email: 'owner@rydo.test', name: 'Owner' } });
    const help = await prisma.user.create({ data: { email: 'help@rydo.test', name: 'Helper' } });
    await prisma.platformAdmin.create({ data: { userId: owner.id, role: 'SUPER_ADMIN' } });
    await prisma.platformAdmin.create({ data: { userId: help.id, role: 'SUPPORT' } });
    root = { Authorization: `Bearer ${(await signIn(app, messages, 'owner@rydo.test')).accessToken}` };
    support = { Authorization: `Bearer ${(await signIn(app, messages, 'help@rydo.test')).accessToken}` };
  });
  afterAll(() => app.close());

  describe('what the Support team can reach', () => {
    it('sees people, reports and the company list for filters', async () => {
      await api(app).get(`${base}/people`).set(support).expect(200);
      await api(app).get(`${base}/people/${w.ms.priya}`).set(support).expect(200);
      await api(app).get(`${base}/reports`).set(support).expect(200);
      await api(app).get(`${base}/reports/summary`).set(support).expect(200);
      const companies = (await api(app).get(`${base}/people/companies`).set(support).expect(200)).body.data;
      expect(companies.map((c: { name: string }) => c.name)).toEqual(expect.arrayContaining(['tmp Co', 'tmp Other']));
    });

    it('cannot reach the rest of the owner console: clients, licences, onboarding, health, impact', async () => {
      for (const path of ['/organizations', '/licenses', '/licenses/summary', '/health', '/impact', '/inquiries', '/audit']) {
        await api(app).get(base + path).set(support).expect(403);
      }
      await api(app).put(`${base}/organizations/${w.org}/licenses/SHARE`).set(support).send({ expiresAt: null }).expect(403);
      await api(app).post(`${base}/organizations/${w.org}/support`).set(support).send({ reason: 'Looking around', minutes: 30 }).expect(403);
    });

    it('is not open to company admins or riders, or to anyone signed out', async () => {
      await api(app).get(`${base}/people`).expect(401);
      await api(app).get(`${base}/people`).set(w.as('hr')).expect(403);
      await api(app).get(`${base}/people`).set(w.as('priya')).expect(403);
    });

    it('is recognised in /me as the support team, not as an admin', async () => {
      const me = (await api(app).get('/api/v1/me').set(support).expect(200)).body.data;
      expect(me.user).toMatchObject({ isPlatformAdmin: false, platformRole: 'SUPPORT' });
    });
  });

  describe('pausing someone for a while', () => {
    it('Support pauses a rider for 7 days: they are told the date and lose access until then', async () => {
      const res = (await block(support, 'kiran', { reason: 'Two identity reports in a week', days: 7 }).expect(200)).body.data;
      expect(res).toMatchObject({ blocked: true, status: 'SUSPENDED' });
      const m = await row('kiran');
      expect(m.platformBlockedUntil!.getTime()).toBeGreaterThan(Date.now() + 6.9 * DAY);
      expect(m.platformBlockedUntil!.getTime()).toBeLessThan(Date.now() + 7.1 * DAY);
      const until = m.platformBlockedUntil!.toISOString().slice(0, 10);
      const note = await prisma.notification.findFirstOrThrow({ where: { userId: w.users.kiran, type: 'ACCOUNT_BLOCKED' } });
      expect(note.body).toContain(until);
      expect(note.body).toContain('starts again by itself');
      // they cannot use the company, and are told why and until when
      const refused = await api(app).get('/api/v1/me/profile').set(w.as('kiran')).expect(403);
      expect(refused.body.error.code).toBe('MEMBERSHIP_NOT_ACTIVE');
      expect(refused.body.error.message).toContain(until);
      expect(refused.body.error.message).toContain('RYDO paused your access');
      expect(await prisma.auditLog.count({ where: { action: 'PLATFORM_MEMBER_BLOCKED', entityId: w.ms.kiran } })).toBe(1);
    });

    it('the list and the person show when the pause ends', async () => {
      const list = (await api(app).get(`${base}/people?blocked=true`).set(support).expect(200)).body.data.rows;
      expect(list.map((r: { id: string }) => r.id)).toEqual([w.ms.kiran]);
      expect(list[0].blockedUntil).toBeTruthy();
      expect((await api(app).get(`${base}/people/${w.ms.kiran}`).set(support).expect(200)).body.data.blockedUntil).toBeTruthy();
    });

    it('Support cannot pause for longer than 30 days, without an end, or with an odd length', async () => {
      const open = await block(support, 'arjun', { reason: 'Until further notice' }).expect(403);
      expect(open.body.error.message).toMatch(/up to 30 days/);
      await block(support, 'arjun', { reason: 'Until further notice', days: null }).expect(403);
      await block(support, 'arjun', { reason: 'Sixty days', days: 60 }).expect(400);
      await block(support, 'arjun', { reason: 'Zero days', days: 0 }).expect(400);
      await block(support, 'arjun', { reason: 'no', days: 7 }).expect(400); // a reason is needed
      expect((await row('arjun')).platformBlockedAt).toBeNull();
    });

    it('the Super Admin can pause for a set time or until they lift it', async () => {
      await block(root, 'arjun', { reason: 'Repeated unsafe behaviour', days: 30 }).expect(200);
      expect((await row('arjun')).platformBlockedUntil).toBeTruthy();
      await block(root, 'driver', { reason: 'Serious repeat reports' }).expect(200); // no end date
      const d = await row('driver');
      expect(d.platformBlockedAt).toBeTruthy();
      expect(d.platformBlockedUntil).toBeNull();
      const note = await prisma.notification.findFirstOrThrow({ where: { userId: w.users.driver, type: 'ACCOUNT_BLOCKED' } });
      expect(note.body).not.toContain('starts again by itself');
      const refused = await api(app).get('/api/v1/me/profile').set(w.as('driver')).expect(403);
      expect(refused.body.error.message).not.toMatch(/until 20/);
    });

    it('cannot pause yourself, someone twice, or someone who is not a member yet', async () => {
      const self = await prisma.membership.create({ data: { organizationId: w.org, userId: (await prisma.user.findUniqueOrThrow({ where: { email: 'help@rydo.test' } })).id, status: 'ACTIVE' } });
      await api(app).post(`${base}/people/${self.id}/block`).set(support).send({ reason: 'Myself', days: 1 }).expect(409);
      const twice = await block(root, 'kiran', { reason: 'Again', days: 3 }).expect(409);
      expect(twice.body.error.code).toBe('CONFLICT');
    });

    it('the company admin cannot undo a pause, and the person is shown as paused', async () => {
      await api(app).post(`/api/v1/admin/members/${w.ms.kiran}/reactivate`).set(w.as('hr')).expect(403);
    });

    it('Support can lift a pause that has an end date, but not one the Super Admin left open', async () => {
      await unblock(support, 'driver').expect(403); // open-ended
      await api(app).get('/api/v1/me/profile').set(w.as('driver')).expect(403);
      await unblock(root, 'driver').expect(200); // the Super Admin can
      await api(app).get('/api/v1/me/profile').set(w.as('driver')).expect(200);
      await unblock(support, 'arjun').expect(200); // a set-time pause can be lifted by Support
      await api(app).get('/api/v1/me/profile').set(w.as('arjun')).expect(200);
      expect(await prisma.notification.count({ where: { userId: w.users.arjun, type: 'ACCOUNT_UNBLOCKED' } })).toBe(1);
    });
  });

  describe('a pause that has run out ends by itself', () => {
    it('on the next request: the person is back, it is logged, and they are told', async () => {
      await prisma.membership.update({ where: { id: w.ms.kiran }, data: { platformBlockedUntil: new Date(Date.now() - 60_000) } });
      await api(app).get('/api/v1/me/profile').set(w.as('kiran')).expect(200);
      const m = await row('kiran');
      expect(m).toMatchObject({ status: 'ACTIVE', platformBlockedAt: null, platformBlockedUntil: null, platformBlockReason: null });
      const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'PLATFORM_MEMBER_UNBLOCKED', entityId: w.ms.kiran } });
      expect(log.after).toMatchObject({ automatic: true });
      expect(await prisma.notification.count({ where: { userId: w.users.kiran, type: 'ACCOUNT_UNBLOCKED' } })).toBe(1);
    });

    it('also when they only open /me, and when RYDO’s team looks at the People list', async () => {
      await block(root, 'stranger', { reason: 'Short pause', days: 1 }).expect(200);
      await prisma.membership.update({ where: { id: w.ms.stranger }, data: { platformBlockedUntil: new Date(Date.now() - 1000) } });
      const me = (await api(app).get('/api/v1/me').set(w.as('stranger')).expect(200)).body.data;
      expect(me.memberships[0].status).toBe('ACTIVE');

      await block(root, 'priya', { reason: 'Short pause', days: 1 }).expect(200);
      await prisma.membership.update({ where: { id: w.ms.priya }, data: { platformBlockedUntil: new Date(Date.now() - 1000) } });
      const people = (await api(app).get(`${base}/people?blocked=true`).set(root).expect(200)).body.data.rows;
      expect(people.some((r: { id: string }) => r.id === w.ms.priya)).toBe(false);
      expect((await row('priya')).status).toBe('ACTIVE');
    });

    it('is only written once however many requests arrive', async () => {
      await block(root, 'arjun', { reason: 'Another short pause', days: 1 }).expect(200);
      await prisma.membership.update({ where: { id: w.ms.arjun }, data: { platformBlockedUntil: new Date(Date.now() - 1000) } });
      await Promise.all([1, 2, 3].map(() => api(app).get('/api/v1/me/profile').set(w.as('arjun'))));
      const logs = await prisma.auditLog.count({ where: { action: 'PLATFORM_MEMBER_UNBLOCKED', entityId: w.ms.arjun, after: { path: ['automatic'], equals: true } } });
      expect(logs).toBe(1);
    });
  });
});
