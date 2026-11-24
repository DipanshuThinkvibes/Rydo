import { INestApplication } from '@nestjs/common';
import { api, createApp, FakeMessages, gtoken, resetDb } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { HttpGoogleIdentity } from '../src/adapters/google-identity.adapter';
import { env } from '../src/config/env';
import { buildWorld, World } from './world';

const google = (app: INestApplication, body: object) => api(app).post('/api/v1/auth/google').send({ client: 'MOBILE', ...body });

/** Sign up and log in with Google, restricted to the domain of the company on RYDO. */
describe('Google sign-in and sign-up', () => {
  let app: INestApplication;
  let messages: FakeMessages;
  let prisma: PrismaService;
  let w: World;

  beforeAll(async () => {
    ({ app, messages, prisma } = await createApp());
    await resetDb(prisma);
    w = await buildWorld(app, messages, prisma, 'goo');
  });
  afterAll(() => app.close());

  describe('sign up', () => {
    it('creates the waiting account for the company the person picked, with their Google name and no email code', async () => {
      const mails = messages.sent.length;
      const res = await google(app, { idToken: gtoken(`new.hire@${w.domain}`, { name: 'New Hire' }), mode: 'signup', expectDomain: w.domain }).expect(200);
      expect(res.body.data.accessToken).toBeTruthy();
      expect(res.body.data.user).toMatchObject({ email: `new.hire@${w.domain}`, name: 'New Hire' });
      expect(res.body.data.memberships).toHaveLength(1);
      expect(res.body.data.memberships[0]).toMatchObject({ status: 'PENDING', roles: ['RIDER'], organization: { name: 'goo Co' } });
      expect(messages.sent.length).toBe(mails); // Google already proved the email
    });

    it('lets that person finish registering, which asks the company HR to approve', async () => {
      const t = (await google(app, { idToken: gtoken(`new.hire@${w.domain}`), mode: 'signup', expectDomain: w.domain }).expect(200)).body.data.accessToken;
      const reg = await api(app).post('/api/v1/me/registration').set('Authorization', `Bearer ${t}`).send({
        fullName: 'New Hire', phone: '9876543210', gender: 'OTHER', idType: 'PAN', idLast4: '234F', employeeId: 'GO-1', designation: 'Engineer', department: 'Eng', office: 'HQ', managerName: 'Boss Person', managerEmail: `boss@${w.domain}`,
      }).expect(200);
      expect(reg.body.data).toMatchObject({ status: 'PENDING', company: 'goo Co' });
      expect(await prisma.notification.count({ where: { type: 'REGISTRATION_REQUEST' } })).toBeGreaterThan(0);
    });

    it('signing up twice does not make a second membership', async () => {
      await google(app, { idToken: gtoken(`new.hire@${w.domain}`), mode: 'signup', expectDomain: w.domain }).expect(200);
      const u = await prisma.user.findUniqueOrThrow({ where: { email: `new.hire@${w.domain}` } });
      expect(await prisma.membership.count({ where: { userId: u.id } })).toBe(1);
    });

    it('refuses a Google account from another domain with a clear message', async () => {
      const res = await google(app, { idToken: gtoken('someone@gmail.com'), mode: 'signup', expectDomain: w.domain }).expect(400);
      expect(res.body.error.code).toBe('DOMAIN_MISMATCH');
      expect(res.body.error.message).toBe(`The Google account someone@gmail.com is not a @${w.domain} account. Sign in with your @${w.domain} work Google account, or use your email code.`);
      expect(await prisma.user.count({ where: { email: 'someone@gmail.com' } })).toBe(0); // nothing was created
    });

    it('refuses another company that is on RYDO when a different company was picked', async () => {
      const res = await google(app, { idToken: gtoken(`rider@o-${w.domain}`), mode: 'signup', expectDomain: w.domain }).expect(400);
      expect(res.body.error.code).toBe('DOMAIN_MISMATCH');
    });

    it('refuses a domain that is not a company on RYDO at all', async () => {
      const res = await google(app, { idToken: gtoken('x@nowhere.example'), mode: 'signup' }).expect(400);
      expect(res.body.error.code).toBe('DOMAIN_MISMATCH');
      expect(res.body.error.message).toContain('@nowhere.example is not a company on RYDO');
      expect(await prisma.user.count({ where: { email: 'x@nowhere.example' } })).toBe(0);
    });

    it('is case-insensitive about the domain', async () => {
      await google(app, { idToken: gtoken(`Mixed.Case@${w.domain.toUpperCase()}`), mode: 'signup', expectDomain: w.domain.toUpperCase() }).expect(200);
    });

    it('refuses an email that Google has not verified', async () => {
      const res = await google(app, { idToken: gtoken(`unverified@${w.domain}`, { verified: false }), mode: 'signup', expectDomain: w.domain }).expect(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
      expect(await prisma.user.count({ where: { email: `unverified@${w.domain}` } })).toBe(0);
    });

    it('refuses a token Google did not issue, and a missing one', async () => {
      await google(app, { idToken: 'this-is-not-a-real-google-token-at-all', mode: 'signup' }).expect(401);
      await google(app, { mode: 'signup' }).expect(400);
      await google(app, { idToken: 'short' }).expect(400);
    });
  });

  describe('log in', () => {
    it('signs in someone who already has an account', async () => {
      const res = await google(app, { idToken: gtoken(w.emails.priya), mode: 'login' }).expect(200);
      expect(res.body.data.user.email).toBe(w.emails.priya);
      expect(res.body.data.memberships[0].status).toBe('ACTIVE');
      const me = await api(app).get('/api/v1/me').set('Authorization', `Bearer ${res.body.data.accessToken}`).expect(200);
      expect(me.body.data.user.id).toBe(res.body.data.user.id);
    });

    it('signs in the same person who first used an email code (one account per email)', async () => {
      const before = await prisma.user.count();
      await google(app, { idToken: gtoken(w.emails.hr), mode: 'login' }).expect(200);
      expect(await prisma.user.count()).toBe(before);
    });

    it('does not create an account when logging in: it points to Sign up', async () => {
      const res = await google(app, { idToken: gtoken(`never.registered@${w.domain}`), mode: 'login' }).expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(res.body.error.message).toContain('Choose Sign up');
      expect(await prisma.user.count({ where: { email: `never.registered@${w.domain}` } })).toBe(0);
    });

    it('refuses a personal Gmail that has no RYDO account', async () => {
      const res = await google(app, { idToken: gtoken('random.person@gmail.com'), mode: 'login' }).expect(400);
      expect(res.body.error.code).toBe('DOMAIN_MISMATCH');
    });

    it('refuses a disabled account', async () => {
      await prisma.user.update({ where: { email: w.emails.kiran }, data: { status: 'DISABLED' } });
      await google(app, { idToken: gtoken(w.emails.kiran), mode: 'login' }).expect(403);
      await prisma.user.update({ where: { email: w.emails.kiran }, data: { status: 'ACTIVE' } });
    });

    it('works for the web (cookies) too, with no tokens in the body', async () => {
      const res = await google(app, { idToken: gtoken(w.emails.arjun), mode: 'login', client: 'WEB' }).expect(200);
      expect(res.body.data.accessToken).toBeUndefined();
      expect(String(res.headers['set-cookie'])).toContain('rydo_');
    });
  });

  describe('the real Google check (Google itself is stubbed)', () => {
    const real = new HttpGoogleIdentity();
    const withClient = (id: string | undefined) => {
      const e = env() as { GOOGLE_CLIENT_ID?: string };
      const old = e.GOOGLE_CLIENT_ID;
      e.GOOGLE_CLIENT_ID = id;
      return () => (e.GOOGLE_CLIENT_ID = old);
    };
    const stub = (status: number, body: object) => jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(body), { status }));
    afterEach(() => jest.restoreAllMocks());

    it('says Google sign-in is not set up when there is no client id', async () => {
      const undo = withClient(undefined);
      await expect(real.verify('x'.repeat(30))).rejects.toMatchObject({ code: 'GOOGLE_UNAVAILABLE' });
      undo();
    });

    it('accepts a token made for this app and reads the profile', async () => {
      const undo = withClient('my-client-id');
      stub(200, { aud: 'my-client-id', iss: 'https://accounts.google.com', email: 'Ann@Acme.test', email_verified: 'true', name: 'Ann', sub: '123' });
      expect(await real.verify('x'.repeat(30))).toMatchObject({ email: 'ann@acme.test', emailVerified: true, name: 'Ann', subject: '123' });
      undo();
    });

    it('refuses a token made for another app, a wrong issuer, or one Google rejects', async () => {
      const undo = withClient('my-client-id');
      stub(200, { aud: 'someone-elses-app', iss: 'accounts.google.com', email: 'a@acme.test', email_verified: 'true', sub: '1' });
      await expect(real.verify('x'.repeat(30))).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
      jest.restoreAllMocks();
      stub(200, { aud: 'my-client-id', iss: 'https://evil.example', email: 'a@acme.test', email_verified: 'true', sub: '1' });
      await expect(real.verify('x'.repeat(30))).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
      jest.restoreAllMocks();
      stub(400, { error: 'invalid_token' });
      await expect(real.verify('x'.repeat(30))).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
      undo();
    });

    it('reports a friendly error when Google cannot be reached', async () => {
      const undo = withClient('my-client-id');
      jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
      await expect(real.verify('x'.repeat(30))).rejects.toMatchObject({ code: 'GOOGLE_UNAVAILABLE' });
      undo();
    });

    it('treats an unverified email as not verified', async () => {
      const undo = withClient('my-client-id');
      stub(200, { aud: 'my-client-id', iss: 'accounts.google.com', email: 'a@acme.test', email_verified: 'false', sub: '1' });
      expect((await real.verify('x'.repeat(30))).emailVerified).toBe(false);
      undo();
    });
  });
});
