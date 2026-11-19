import { INestApplication } from '@nestjs/common';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { api, createApp, FakeMessages, resetDb } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { PUSH_ADAPTER } from '../src/adapters/push.adapter';
import type { LogPushAdapter } from '../src/adapters/log-push.adapter';
import { FcmPushAdapter } from '../src/adapters/fcm-push.adapter';
import { buildWorld, World } from './world';

/** Phone push: registering devices, sending with every notification, cleaning dead tokens, and the Firebase adapter. */
describe('Push notifications', () => {
  let app: INestApplication;
  let messages: FakeMessages;
  let prisma: PrismaService;
  let w: World;
  let push: LogPushAdapter;
  const tok = (s: string) => `${s}-token-0123456789`;

  beforeAll(async () => {
    ({ app, messages, prisma } = await createApp());
    await resetDb(prisma);
    w = await buildWorld(app, messages, prisma, 'push');
    push = app.get(PUSH_ADAPTER);
  });
  afterAll(() => app.close());

  describe('device registration', () => {
    it('registers a phone, treats a repeat as the same phone, and rejects bad input', async () => {
      await api(app).post('/api/v1/me/devices').set(w.as('priya')).send({ token: tok('priya'), platform: 'IOS' }).expect(200).then((r) => expect(r.body.data.registered).toBe(true));
      await api(app).post('/api/v1/me/devices').set(w.as('priya')).send({ token: tok('priya'), platform: 'IOS' }).expect(200);
      expect(await prisma.deviceToken.count({ where: { userId: w.users.priya } })).toBe(1);
      await api(app).post('/api/v1/me/devices').set(w.as('priya')).send({ token: 'short', platform: 'IOS' }).expect(400);
      await api(app).post('/api/v1/me/devices').set(w.as('priya')).send({ token: tok('x'), platform: 'WINDOWS' }).expect(400);
      await api(app).post('/api/v1/me/devices').send({ token: tok('anon'), platform: 'IOS' }).expect(401);
    });

    it('a phone handed to someone else moves to the new person; only the owner can remove a token', async () => {
      await api(app).post('/api/v1/me/devices').set(w.as('arjun')).send({ token: tok('priya'), platform: 'ANDROID' }).expect(200);
      expect(await prisma.deviceToken.count({ where: { token: tok('priya') } })).toBe(1);
      expect((await prisma.deviceToken.findUniqueOrThrow({ where: { token: tok('priya') } })).userId).toBe(w.users.arjun);
      await api(app).post('/api/v1/me/devices/remove').set(w.as('priya')).send({ token: tok('priya') }).expect(200).then((r) => expect(r.body.data.removed).toBe(0));
      await api(app).post('/api/v1/me/devices/remove').set(w.as('arjun')).send({ token: tok('priya') }).expect(200).then((r) => expect(r.body.data.removed).toBe(1));
    });

    it('keeps at most ten phones per person, newest first', async () => {
      for (let i = 0; i < 12; i++) await api(app).post('/api/v1/me/devices').set(w.as('kiran')).send({ token: tok(`k${i}`), platform: 'ANDROID' }).expect(200);
      expect(await prisma.deviceToken.count({ where: { userId: w.users.kiran } })).toBe(10);
    });
  });

  describe('sending', () => {
    it('every notification also goes to the person’s phones (not to anyone else)', async () => {
      await api(app).post('/api/v1/me/devices').set(w.as('hr')).send({ token: tok('hr-a'), platform: 'IOS' }).expect(200);
      await api(app).post('/api/v1/me/devices').set(w.as('hr')).send({ token: tok('hr-b'), platform: 'ANDROID' }).expect(200);
      await api(app).post('/api/v1/me/devices').set(w.as('ops')).send({ token: tok('ops-a'), platform: 'ANDROID' }).expect(200);
      push.sent.length = 0;
      await api(app).post('/api/v1/me/issues').set(w.as('priya')).send({ category: 'APP_BUG', description: 'The map did not load for me today.' }).expect(200);
      const hrPush = push.sent.find((p) => p.tokens.includes(tok('hr-a')));
      expect(hrPush?.tokens.sort()).toEqual(expect.arrayContaining([tok('hr-a'), tok('hr-b'), tok('ops-a')]));
      expect(hrPush?.msg).toMatchObject({ title: 'New issue: App problem', data: { type: 'ISSUE_REPORTED' } });
      expect(hrPush?.tokens).not.toContain(tok('k0')); // not a rider's phone
    });

    it('removes tokens the provider reports as dead, and never fails the action', async () => {
      const spy = jest.spyOn(push, 'send').mockResolvedValueOnce({ invalidTokens: [tok('hr-b')] });
      await api(app).post('/api/v1/me/issues').set(w.as('priya')).send({ category: 'APP_BUG', description: 'The map did not load again.' }).expect(200);
      expect(await prisma.deviceToken.count({ where: { token: tok('hr-b') } })).toBe(0);
      expect(await prisma.deviceToken.count({ where: { token: tok('hr-a') } })).toBe(1);
      spy.mockRejectedValueOnce(new Error('provider down'));
      await api(app).post('/api/v1/me/issues').set(w.as('priya')).send({ category: 'APP_BUG', description: 'Reporting while push is down.' }).expect(200); // still saved
      spy.mockRestore();
    });

    it('announcements reach every registered phone in the audience', async () => {
      push.sent.length = 0;
      await api(app).post('/api/v1/admin/announcements').set(w.as('hr')).send({ title: 'Heads up', body: 'Roadworks near the office tomorrow.' }).expect(200);
      const tokens = push.sent.flatMap((p) => p.tokens);
      expect(tokens).toEqual(expect.arrayContaining([tok('hr-a'), tok('ops-a'), tok('k2'), tok('k11')])); // k0 and k1 were dropped by the ten-phone limit
      expect(tokens).not.toContain(tok('k0'));
      expect(push.sent[0].msg).toMatchObject({ title: 'Heads up', data: { type: 'ANNOUNCEMENT' } });
    });
  });

  describe('Firebase adapter', () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    const cfg = { projectId: 'rydo-test', clientEmail: 'push@rydo-test.iam.gserviceaccount.com', privateKey: pem.replace(/\n/g, '\\n') }; // as it arrives from an env file
    afterEach(() => jest.restoreAllMocks());

    it('signs a service-account token that Google can verify', () => {
      const jwt = new FcmPushAdapter(cfg).signedJwt(1_800_000_000);
      const [h, c, s] = jwt.split('.');
      expect(JSON.parse(Buffer.from(h, 'base64url').toString())).toEqual({ alg: 'RS256', typ: 'JWT' });
      expect(JSON.parse(Buffer.from(c, 'base64url').toString())).toEqual({
        iss: cfg.clientEmail,
        scope: 'https://www.googleapis.com/auth/firebase.messaging',
        aud: 'https://oauth2.googleapis.com/token',
        iat: 1_800_000_000,
        exp: 1_800_003_600,
      });
      expect(createVerify('RSA-SHA256').update(`${h}.${c}`).verify(publicKey, Buffer.from(s, 'base64url'))).toBe(true);
    });

    it('sends each token, reuses the access token, and reports dead tokens', async () => {
      const calls: { url: string; body: string }[] = [];
      jest.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
        const u = String(url);
        const body = String((init as RequestInit).body);
        calls.push({ url: u, body });
        if (u.includes('oauth2.googleapis.com')) return new Response(JSON.stringify({ access_token: 'access-1', expires_in: 3600 }), { status: 200 });
        if (body.includes('dead-token')) return new Response(JSON.stringify({ error: { status: 'NOT_FOUND', message: 'UNREGISTERED' } }), { status: 404 });
        if (body.includes('flaky-token')) return new Response('boom', { status: 500 });
        return new Response('{}', { status: 200 });
      });
      const adapter = new FcmPushAdapter(cfg);
      const r1 = await adapter.send(['good-token', 'dead-token', 'flaky-token'], { title: 'Hello', body: 'World', data: { rideId: '1' } });
      expect(r1.invalidTokens).toEqual(['dead-token']); // a 500 is not a dead token
      const sends = calls.filter((c) => c.url.includes('fcm.googleapis.com'));
      expect(sends).toHaveLength(3);
      expect(sends[0].url).toBe('https://fcm.googleapis.com/v1/projects/rydo-test/messages:send');
      expect(JSON.parse(sends[0].body)).toEqual({ message: { token: 'good-token', notification: { title: 'Hello', body: 'World' }, data: { rideId: '1' } } });
      await adapter.send(['good-token'], { title: 'Again', body: 'Again' });
      expect(calls.filter((c) => c.url.includes('oauth2.googleapis.com'))).toHaveLength(1); // access token reused
    });

    it('does nothing for no tokens and never throws when Google cannot be reached', async () => {
      const spy = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
      const adapter = new FcmPushAdapter(cfg);
      expect(await adapter.send([], { title: 'a', body: 'b' })).toEqual({ invalidTokens: [] });
      expect(spy).not.toHaveBeenCalled();
      expect(await adapter.send(['t-1234567890'], { title: 'a', body: 'b' })).toEqual({ invalidTokens: [] });
    });
  });
});
