import { INestApplication } from '@nestjs/common';
import { api, createApp, FakeMessages, resetDb, signIn } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokensService } from '../src/auth/tokens.service';
import { buildWorld, World } from './world';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** The mobile app signs out 14 days after signing in. The website signs out after 2 hours without use. */
describe('Session lifetimes', () => {
  let app: INestApplication;
  let messages: FakeMessages;
  let prisma: PrismaService;
  let tokens: TokensService;
  let w: World;
  let userId: string;

  const me = (t: string) => api(app).get('/api/v1/me').set('Authorization', `Bearer ${t}`);
  const refresh = (rt: string) => api(app).post('/api/v1/auth/refresh').send({ refreshToken: rt });
  const row = (id: string) => prisma.session.findUniqueOrThrow({ where: { id } });
  const webSession = async () => {
    const s = await tokens.issue(userId, 'WEB', 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0');
    return s;
  };

  beforeAll(async () => {
    ({ app, messages, prisma } = await createApp());
    await resetDb(prisma);
    w = await buildWorld(app, messages, prisma, 'ses');
    tokens = app.get(TokensService);
    userId = w.users.priya;
  });
  afterAll(() => app.close());

  describe('mobile app: 14 days', () => {
    it('a new sign-in ends 14 days after it started', async () => {
      const r = await signIn(app, messages, w.emails.arjun);
      const s = await prisma.session.findFirstOrThrow({ where: { userId: r.user.id, client: 'MOBILE' }, orderBy: { createdAt: 'desc' } });
      const days = (s.expiresAt.getTime() - s.createdAt.getTime()) / DAY;
      expect(days).toBeGreaterThan(13.99);
      expect(days).toBeLessThan(14.01);
    });

    it('using the app and refreshing does not extend it', async () => {
      const r = await signIn(app, messages, w.emails.kiran);
      const s = await prisma.session.findFirstOrThrow({ where: { userId: r.user.id, client: 'MOBILE' }, orderBy: { createdAt: 'desc' } });
      const before = s.expiresAt.getTime();
      const next = (await refresh(r.refreshToken).expect(200)).body.data;
      expect(next.accessToken).toBeTruthy();
      expect((await row(s.id)).expiresAt.getTime()).toBe(before);
      await me(next.accessToken).expect(200);
    });

    it('works however long it has been since the app was last used, until day 14', async () => {
      const s = await tokens.issue(userId, 'MOBILE');
      await prisma.session.update({ where: { id: s.sessionId }, data: { lastActiveAt: new Date(Date.now() - 12 * DAY), expiresAt: new Date(Date.now() + 2 * DAY) } });
      await me(s.accessToken).expect(200);
      expect((await refresh(s.refreshToken).expect(200)).body.data.accessToken).toBeTruthy();
    });

    it('signs out after 14 days: the access token and the refresh both stop', async () => {
      const s = await tokens.issue(userId, 'MOBILE');
      await prisma.session.update({ where: { id: s.sessionId }, data: { createdAt: new Date(Date.now() - 14 * DAY - HOUR), expiresAt: new Date(Date.now() - HOUR) } });
      await me(s.accessToken).expect(401);
      const res = await refresh(s.refreshToken).expect(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });
  });

  describe('website: 2 hours without use', () => {
    it('a new sign-in is good for 2 hours', async () => {
      const s = await webSession();
      const r = await row(s.sessionId);
      const hours = (r.expiresAt.getTime() - Date.now()) / HOUR;
      expect(hours).toBeGreaterThan(1.99);
      expect(hours).toBeLessThanOrEqual(2);
      await me(s.accessToken).expect(200);
    });

    it('using it starts the 2 hours again', async () => {
      const s = await webSession();
      await prisma.session.update({ where: { id: s.sessionId }, data: { lastActiveAt: new Date(Date.now() - 90 * 60_000), expiresAt: new Date(Date.now() + 30 * 60_000) } });
      await me(s.accessToken).expect(200);
      const r = await row(s.sessionId);
      expect(Date.now() - r.lastActiveAt.getTime()).toBeLessThan(10_000);
      expect((r.expiresAt.getTime() - Date.now()) / HOUR).toBeGreaterThan(1.99);
    });

    it('saves activity at most once a minute', async () => {
      const s = await webSession();
      const recent = new Date(Date.now() - 20_000);
      await prisma.session.update({ where: { id: s.sessionId }, data: { lastActiveAt: recent } });
      await me(s.accessToken).expect(200);
      expect((await row(s.sessionId)).lastActiveAt.getTime()).toBe(recent.getTime());
    });

    it('refreshing also counts as use', async () => {
      const s = await webSession();
      await prisma.session.update({ where: { id: s.sessionId }, data: { lastActiveAt: new Date(Date.now() - 100 * 60_000), expiresAt: new Date(Date.now() + 20 * 60_000) } });
      await refresh(s.refreshToken).expect(200);
      const r = await row(s.sessionId);
      expect((r.expiresAt.getTime() - Date.now()) / HOUR).toBeGreaterThan(1.99);
    });

    it('after 2 hours without use it is signed out: access and refresh both stop', async () => {
      const s = await webSession();
      await prisma.session.update({ where: { id: s.sessionId }, data: { lastActiveAt: new Date(Date.now() - 2 * HOUR - 60_000) } });
      const res = await me(s.accessToken).expect(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
      await refresh(s.refreshToken).expect(401);
    });

    it('an idle website session shows up as expired in the devices list, not as signed in', async () => {
      const s = await webSession();
      await prisma.session.update({ where: { id: s.sessionId }, data: { lastActiveAt: new Date(Date.now() - 3 * HOUR), expiresAt: new Date(Date.now() - HOUR) } });
      const list = (await api(app).get('/api/v1/me/sessions').set(w.as('priya')).expect(200)).body.data;
      expect(list.find((x: { id: string }) => x.id === s.sessionId)).toMatchObject({ status: 'EXPIRED', current: false });
    });
  });

  it('a session removed from the devices list stops working on every route at once', async () => {
    const s = await webSession();
    await me(s.accessToken).expect(200);
    await prisma.session.update({ where: { id: s.sessionId }, data: { revokedAt: new Date() } });
    await me(s.accessToken).expect(401);
    await api(app).get('/api/v1/me/notifications').set('Authorization', `Bearer ${s.accessToken}`).expect(401);
    await refresh(s.refreshToken).expect(401);
  });
});
