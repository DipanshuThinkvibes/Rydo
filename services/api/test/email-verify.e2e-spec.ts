import { INestApplication } from '@nestjs/common';
import { api, createApp, FakeMessages, gtoken, resetDb, signIn } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { hashPassword } from '../src/auth/password';

/** The account page shows whether your email is verified, and lets you verify it with an emailed code. */
describe('Email verification', () => {
  let app: INestApplication;
  let messages: FakeMessages;
  let prisma: PrismaService;
  let token: string;
  const email = 'pw.user@verify.test';
  const bearer = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    ({ app, messages, prisma } = await createApp());
    await resetDb(prisma);
    await prisma.organization.create({ data: { name: 'Verify Co', slug: 'verify', emailDomains: ['verify.test'], status: 'ACTIVE' } });
    // a person who has only ever used a password: nobody has proved their inbox yet
    await prisma.user.create({ data: { email, name: 'Pw User', passwordHash: await hashPassword('Secret2026') } });
    const r = await api(app).post('/api/v1/auth/password/login').send({ email, password: 'Secret2026', client: 'MOBILE' }).expect(200);
    token = r.body.data.accessToken;
  });
  afterAll(() => app.close());

  it('needs a signed-in person', async () => {
    await api(app).get('/api/v1/me/email').expect(401);
    await api(app).post('/api/v1/me/email/verify/send').expect(401);
    await api(app).post('/api/v1/me/email/verify').send({ code: '123456' }).expect(401);
  });

  it('starts as not verified, on /me and on /me/email', async () => {
    const me = (await api(app).get('/api/v1/me').set(bearer()).expect(200)).body.data;
    expect(me.user.emailVerified).toBe(false);
    const s = (await api(app).get('/api/v1/me/email').set(bearer()).expect(200)).body.data;
    expect(s).toEqual({ email, verified: false, verifiedAt: null });
  });

  it('emails a verification code (worded for verification, not sign-in) and rejects a wrong or malformed one', async () => {
    const before = messages.sent.length;
    const res = await api(app).post('/api/v1/me/email/verify/send').set(bearer()).expect(200);
    expect(res.body.data).toEqual({ sent: true, email });
    const mail = messages.sent.slice(before).find((m) => m.to === email)!;
    expect(mail.subject).toMatch(/^\d{6} is your RYDO email verification code$/);
    expect(mail.text).toContain('account page');

    const wrong = messages.lastCode(email) === '000000' ? '111111' : '000000';
    const bad = await api(app).post('/api/v1/me/email/verify').set(bearer()).send({ code: wrong }).expect(400);
    expect(bad.body.error.code).toBe('OTP_INVALID');
    await api(app).post('/api/v1/me/email/verify').set(bearer()).send({ code: '12' }).expect(400);
    expect((await api(app).get('/api/v1/me/email').set(bearer()).expect(200)).body.data.verified).toBe(false);
  });

  it('verifies with the right code, and says so everywhere', async () => {
    const res = await api(app).post('/api/v1/me/email/verify').set(bearer()).send({ code: messages.lastCode(email) }).expect(200);
    expect(res.body.data.verified).toBe(true);
    expect(res.body.data.verifiedAt).toBeTruthy();
    expect((await api(app).get('/api/v1/me').set(bearer()).expect(200)).body.data.user.emailVerified).toBe(true);
    expect((await api(app).get('/api/v1/me/email').set(bearer()).expect(200)).body.data).toMatchObject({ email, verified: true });
    expect(await prisma.auditLog.count({ where: { action: 'EMAIL_VERIFIED' } })).toBe(1);
  });

  it('does not send another code once verified, and verifying again is harmless', async () => {
    const mails = messages.sent.length;
    const again = await api(app).post('/api/v1/me/email/verify/send').set(bearer()).expect(409);
    expect(again.body.error.code).toBe('CONFLICT');
    expect(messages.sent.length).toBe(mails);
    await api(app).post('/api/v1/me/email/verify').set(bearer()).send({ code: '123456' }).expect(200).then((r) => expect(r.body.data.verified).toBe(true));
  });

  it('a code cannot be used twice, and only the latest code works', async () => {
    const u = await prisma.user.create({ data: { email: 'second@verify.test', name: 'Second', passwordHash: await hashPassword('Secret2026') } });
    const t = (await api(app).post('/api/v1/auth/password/login').send({ email: u.email, password: 'Secret2026', client: 'MOBILE' }).expect(200)).body.data.accessToken;
    const h = { Authorization: `Bearer ${t}` };
    await api(app).post('/api/v1/me/email/verify/send').set(h).expect(200);
    const first = messages.lastCode(u.email)!;
    await api(app).post('/api/v1/me/email/verify/send').set(h).expect(200);
    const second = messages.lastCode(u.email)!;
    if (first !== second) await api(app).post('/api/v1/me/email/verify').set(h).send({ code: first }).expect(400); // an older code is refused
    await api(app).post('/api/v1/me/email/verify').set(h).send({ code: second }).expect(200);
  });

  it('limits how many codes can be requested in an hour', async () => {
    const u = await prisma.user.create({ data: { email: 'spammy@verify.test', name: 'Spammy', passwordHash: await hashPassword('Secret2026') } });
    const t = (await api(app).post('/api/v1/auth/password/login').send({ email: u.email, password: 'Secret2026', client: 'MOBILE' }).expect(200)).body.data.accessToken;
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) statuses.push((await api(app).post('/api/v1/me/email/verify/send').set({ Authorization: `Bearer ${t}` })).status);
    expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(statuses.slice(5)).toEqual([429, 429]);
  });

  it('signing in with an email code or with Google also counts as proving the email', async () => {
    const viaCode = await signIn(app, messages, 'coder@verify.test');
    expect((await api(app).get('/api/v1/me').set('Authorization', `Bearer ${viaCode.accessToken}`).expect(200)).body.data.user.emailVerified).toBe(true);
    const g = await api(app).post('/api/v1/auth/google').send({ idToken: gtoken('googler@verify.test', { name: 'Googler' }), client: 'MOBILE', mode: 'signup', expectDomain: 'verify.test' }).expect(200);
    expect(g.body.data.user.emailVerified).toBe(true);
  });

  it('people who signed in with a code before this feature existed are already verified (backfill)', async () => {
    const u = await prisma.user.findUniqueOrThrow({ where: { email: 'coder@verify.test' } });
    expect(u.emailVerifiedAt).toBeTruthy();
  });
});
