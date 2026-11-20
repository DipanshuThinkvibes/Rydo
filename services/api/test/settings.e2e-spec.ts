import { INestApplication } from '@nestjs/common';
import { api, createApp, FakeMessages, resetDb, signIn } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { buildWorld, World } from './world';

/** A person's own settings: notification choices and the devices they are signed in on. */
describe('My settings', () => {
  let app: INestApplication;
  let messages: FakeMessages;
  let prisma: PrismaService;
  let w: World;
  let notices: NotificationsService;

  beforeAll(async () => {
    ({ app, messages, prisma } = await createApp());
    await resetDb(prisma);
    w = await buildWorld(app, messages, prisma, 'set');
    notices = app.get(NotificationsService);
  });
  afterAll(() => app.close());

  it('needs a signed-in person', async () => {
    await api(app).get('/api/v1/me/settings').expect(401);
    await api(app).patch('/api/v1/me/settings').send({ notifications: { emailUpdates: false } }).expect(401);
    await api(app).get('/api/v1/me/sessions').expect(401);
    await api(app).post('/api/v1/me/sessions/revoke-others').expect(401);
  });

  it('starts with everything on, saves changes, and rejects nonsense', async () => {
    expect((await api(app).get('/api/v1/me/settings').set(w.as('priya')).expect(200)).body.data).toEqual({ notifications: { emailUpdates: true, pushUpdates: true } });
    const r = await api(app).patch('/api/v1/me/settings').set(w.as('priya')).send({ notifications: { emailUpdates: false } }).expect(200);
    expect(r.body.data.notifications).toEqual({ emailUpdates: false, pushUpdates: true });
    expect((await api(app).get('/api/v1/me/settings').set(w.as('priya')).expect(200)).body.data.notifications.emailUpdates).toBe(false);
    await api(app).patch('/api/v1/me/settings').set(w.as('priya')).send({ notifications: { emailUpdates: 'maybe' } }).expect(400);
    await api(app).patch('/api/v1/me/settings').set(w.as('priya')).send({}).expect(400);
    // someone else's settings are untouched
    expect((await api(app).get('/api/v1/me/settings').set(w.as('arjun')).expect(200)).body.data.notifications.emailUpdates).toBe(true);
  });

  it('respects the choice: no email for an ordinary update, but the inbox still gets it', async () => {
    const mails = messages.sent.length;
    await notices.notifyMembership(w.ms.priya, { type: 'RIDE_UPDATE', title: 'Your ride changed', body: 'New time', email: true });
    expect(messages.sent.slice(mails).some((m) => m.to === w.emails.priya)).toBe(false);
    expect(await prisma.notification.count({ where: { userId: w.users.priya, type: 'RIDE_UPDATE' } })).toBe(1);
    // someone who kept emails on still gets them
    await notices.notifyMembership(w.ms.arjun, { type: 'RIDE_UPDATE', title: 'Your ride changed', body: 'New time', email: true });
    expect(messages.sent.slice(mails).some((m) => m.to === w.emails.arjun)).toBe(true);
  });

  it('safety and account alerts are always sent, whatever the choice', async () => {
    const mails = messages.sent.length;
    await notices.notifyMembership(w.ms.priya, { type: 'SOS_RAISED', title: 'SOS on your ride', body: 'Help', email: true });
    await notices.notifyMany([w.ms.priya], { type: 'ACCOUNT_BLOCKED', title: 'Paused', body: 'x', email: true });
    expect(messages.sent.slice(mails).filter((m) => m.to === w.emails.priya)).toHaveLength(2);
  });

  it('turning everything off also holds back group emails (announcements) for that person only', async () => {
    const mails = messages.sent.length;
    await notices.notifyMany([w.ms.priya, w.ms.arjun], { type: 'ANNOUNCEMENT', title: 'Office closed Friday', body: 'See you Monday', email: true });
    const to = messages.sent.slice(mails).map((m) => m.to);
    expect(to).toContain(w.emails.arjun);
    expect(to).not.toContain(w.emails.priya);
  });

  describe('devices', () => {
    let a: { accessToken: string; refreshToken: string };
    let b: { accessToken: string; refreshToken: string };
    const as = (t: { accessToken: string }) => ({ Authorization: `Bearer ${t.accessToken}` });

    beforeAll(async () => {
      a = await signIn(app, messages, w.emails.kiran);
      b = await signIn(app, messages, w.emails.kiran);
    });

    it('lists where I am signed in, marking this device', async () => {
      const list = (await api(app).get('/api/v1/me/sessions').set(as(a)).expect(200)).body.data;
      expect(list.length).toBeGreaterThanOrEqual(3); // the world sign-in plus these two
      expect(list.filter((s: { current: boolean }) => s.current)).toHaveLength(1);
      expect(list[0].current).toBe(true); // this device first
      expect(list[0].status).toBe('ACTIVE');
      expect(list[0].endedAt).toBeNull();
      expect(list[0]).not.toHaveProperty('refreshTokenHash');
      const mine = list.find((s: { current: boolean }) => s.current);
      expect(mine.client).toBe('MOBILE');
    });

    it('never shows or touches another person’s devices', async () => {
      const others = (await api(app).get('/api/v1/me/sessions').set(w.as('priya')).expect(200)).body.data;
      const mine = (await api(app).get('/api/v1/me/sessions').set(as(a)).expect(200)).body.data;
      const ids = new Set(mine.map((s: { id: string }) => s.id));
      expect(others.every((s: { id: string }) => !ids.has(s.id))).toBe(true);
      await api(app).delete(`/api/v1/me/sessions/${mine[0].id}`).set(w.as('priya')).expect(404);
    });

    it('signs one other device out at once, but not the one in use', async () => {
      const list = (await api(app).get('/api/v1/me/sessions').set(as(a)).expect(200)).body.data;
      const current = list.find((s: { current: boolean }) => s.current);
      const other = (await api(app).get('/api/v1/me/sessions').set(as(b)).expect(200)).body.data.find((s: { current: boolean }) => s.current);
      const refuse = await api(app).delete(`/api/v1/me/sessions/${current.id}`).set(as(a)).expect(409);
      expect(refuse.body.error.code).toBe('CONFLICT');
      await api(app).delete(`/api/v1/me/sessions/${other.id}`).set(as(a)).expect(200);
      await api(app).get('/api/v1/me').set(as(b)).expect(401); // that device is out
      await api(app).get('/api/v1/me').set(as(a)).expect(200);
      await api(app).delete(`/api/v1/me/sessions/${other.id}`).set(as(a)).expect(404); // already gone
    });

    it('keeps recent ended sessions in the list, labelled, and drops old ones', async () => {
      const list = (await api(app).get('/api/v1/me/sessions').set(as(a)).expect(200)).body.data;
      const out = list.filter((s: { status: string }) => s.status === 'SIGNED_OUT');
      expect(out.length).toBeGreaterThanOrEqual(1); // the one signed out earlier in this block
      expect(out[0].endedAt).toBeTruthy();
      const user = await prisma.user.findUniqueOrThrow({ where: { email: w.emails.kiran } });
      const old = await prisma.session.create({ data: { userId: user.id, client: 'WEB', refreshTokenHash: 'old-' + Date.now(), userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0', expiresAt: new Date(Date.now() - 86_400_000), createdAt: new Date(Date.now() - 5 * 86_400_000) } });
      const ancient = await prisma.session.create({ data: { userId: user.id, client: 'WEB', refreshTokenHash: 'ancient-' + Date.now(), expiresAt: new Date(Date.now() - 80 * 86_400_000), createdAt: new Date(Date.now() - 90 * 86_400_000) } });
      const after = (await api(app).get('/api/v1/me/sessions').set(as(a)).expect(200)).body.data;
      expect(after.find((s: { id: string }) => s.id === old.id)).toMatchObject({ status: 'EXPIRED', current: false });
      expect(after.some((s: { id: string }) => s.id === ancient.id)).toBe(false); // older than 30 days
      expect(JSON.stringify(after)).not.toContain('refreshTokenHash');
    });

    it('signs out every other device and keeps this one', async () => {
      const c = await signIn(app, messages, w.emails.kiran);
      const res = (await api(app).post('/api/v1/me/sessions/revoke-others').set(as(a)).expect(200)).body.data;
      expect(res.signedOut).toBeGreaterThanOrEqual(2);
      await api(app).get('/api/v1/me').set(as(c)).expect(401);
      await api(app).get('/api/v1/me').set(w.as('kiran')).expect(401); // the sign-in made by the test world is out too
      await api(app).get('/api/v1/me').set(as(a)).expect(200);
      const left = (await api(app).get('/api/v1/me/sessions').set(as(a)).expect(200)).body.data.filter((s: { status: string }) => s.status === 'ACTIVE');
      expect(left).toHaveLength(1);
      expect(left[0].current).toBe(true);
    });
  });
});
