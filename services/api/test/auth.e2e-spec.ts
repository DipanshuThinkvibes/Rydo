import { INestApplication } from '@nestjs/common';
import { api, createApp, FakeMessages, resetDb, signIn } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Auth (email OTP)', () => {
  let app: INestApplication;
  let messages: FakeMessages;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, messages, prisma } = await createApp());
    await resetDb(prisma);
    await prisma.organization.create({ data: { licenses: { create: [{ product: 'SHARE' }] }, name: 'Acme', slug: 'acme', emailDomains: ['acme.test'], status: 'ACTIVE' } });
  });
  afterAll(() => app.close());

  it('reports health', async () => {
    const res = await api(app).get('/api/v1/health').expect(200);
    expect(res.body.data).toEqual({ status: 'ok', db: 'ok' });
  });

  it('refuses emails from companies not on RYDO', async () => {
    const res = await api(app).post('/api/v1/auth/otp/request').send({ email: 'someone@gmail.com' }).expect(400);
    expect(res.body.error.code).toBe('COMPANY_NOT_ON_RYDO');
    expect(messages.sent).toHaveLength(0);
  });

  it('validates input with field errors', async () => {
    const res = await api(app).post('/api/v1/auth/otp/request').send({ email: 'not-an-email' }).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.fields.email).toBeDefined();
  });

  it('signs in a new employee and puts them in the HR queue', async () => {
    const r = await signIn(app, messages, 'new.joiner@acme.test');
    expect(r.accessToken).toBeTruthy();
    expect(r.refreshToken).toBeTruthy();
    expect(r.memberships).toHaveLength(1);
    expect(r.memberships[0]).toMatchObject({ status: 'PENDING', roles: ['RIDER'] });

    const me = await api(app).get('/api/v1/me').set('Authorization', `Bearer ${r.accessToken}`).expect(200);
    expect(me.body.data.user.name).toBe('New Joiner');
  });

  it('stores only a hash of the code', async () => {
    await api(app).post('/api/v1/auth/otp/request').send({ email: 'hash.check@acme.test' }).expect(200);
    const code = messages.lastCode('hash.check@acme.test')!;
    const row = await prisma.otpCode.findFirstOrThrow({ where: { email: 'hash.check@acme.test' } });
    expect(row.codeHash).not.toContain(code);
  });

  it('rejects a wrong code and locks after 5 tries', async () => {
    const email = 'wrong.code@acme.test';
    await api(app).post('/api/v1/auth/otp/request').send({ email }).expect(200);
    const right = messages.lastCode(email)!;
    const wrong = right === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      const res = await api(app).post('/api/v1/auth/otp/verify').send({ email, code: wrong, client: 'MOBILE' }).expect(400);
      expect(res.body.error.code).toBe('OTP_INVALID');
    }
    const locked = await api(app).post('/api/v1/auth/otp/verify').send({ email, code: right, client: 'MOBILE' }).expect(429);
    expect(locked.body.error.code).toBe('OTP_TOO_MANY_ATTEMPTS');
  });

  it('does not accept a code twice', async () => {
    const email = 'twice@acme.test';
    await signIn(app, messages, email);
    const code = messages.lastCode(email);
    const res = await api(app).post('/api/v1/auth/otp/verify').send({ email, code, client: 'MOBILE' }).expect(400);
    expect(res.body.error.code).toBe('OTP_EXPIRED');
  });

  it('rotates refresh tokens and rejects the old one', async () => {
    const r = await signIn(app, messages, 'rotate@acme.test');
    const next = await api(app).post('/api/v1/auth/refresh').send({ refreshToken: r.refreshToken }).expect(200);
    expect(next.body.data.refreshToken).not.toBe(r.refreshToken);
    await api(app).post('/api/v1/auth/refresh').send({ refreshToken: r.refreshToken }).expect(401);
  });

  it('logout revokes the session', async () => {
    const r = await signIn(app, messages, 'logout@acme.test');
    await api(app).post('/api/v1/auth/logout').set('Authorization', `Bearer ${r.accessToken}`).expect(200);
    await api(app).post('/api/v1/auth/refresh').send({ refreshToken: r.refreshToken }).expect(401);
  });

  it('the access token stops working the moment the session ends (logout, revoke or expiry)', async () => {
    const r = await signIn(app, messages, 'ended@acme.test');
    const me = (token: string) => api(app).get('/api/v1/me').set('Authorization', `Bearer ${token}`);
    await me(r.accessToken).expect(200);
    await api(app).post('/api/v1/auth/logout').set('Authorization', `Bearer ${r.accessToken}`).expect(200);
    const after = await me(r.accessToken).expect(401);
    expect(after.body.error.code).toBe('UNAUTHENTICATED');

    // revoked by the server
    const r2 = await signIn(app, messages, 'ended@acme.test');
    await prisma.session.updateMany({ where: { userId: r2.user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await me(r2.accessToken).expect(401);

    // a session past its end date
    const r3 = await signIn(app, messages, 'ended@acme.test');
    await prisma.session.updateMany({ where: { userId: r3.user.id, revokedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await me(r3.accessToken).expect(401);
  });

  it('needs a token for private routes', async () => {
    const res = await api(app).get('/api/v1/me').expect(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('signs in with a password once one is set', async () => {
    const email = 'pass.user@acme.test';
    const first = await signIn(app, messages, email);
    const weak = await api(app).post('/api/v1/me/password').set('Authorization', `Bearer ${first.accessToken}`).send({ newPassword: 'short' }).expect(400);
    expect(weak.body.error.fields.newPassword).toBeDefined();
    await api(app).post('/api/v1/me/password').set('Authorization', `Bearer ${first.accessToken}`).send({ newPassword: 'Commute2026' }).expect(200);

    const ok = await api(app).post('/api/v1/auth/password/login').send({ email, password: 'Commute2026', client: 'MOBILE' }).expect(200);
    expect(ok.body.data.accessToken).toBeTruthy();

    const row = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(row.passwordHash).toMatch(/^scrypt\$/);
    expect(row.passwordHash).not.toContain('Commute2026');

    // Changing it needs the current password
    await api(app).post('/api/v1/me/password').set('Authorization', `Bearer ${first.accessToken}`).send({ newPassword: 'Another2026' }).expect(400);
  });

  it('gives the same vague error for a wrong password, an unknown email and an account without a password', async () => {
    for (const body of [
      { email: 'pass.user@acme.test', password: 'Wrong2026' },
      { email: 'nobody@acme.test', password: 'Commute2026' },
      { email: 'new.joiner@acme.test', password: 'Commute2026' },
    ]) {
      const res = await api(app).post('/api/v1/auth/password/login').send({ ...body, client: 'MOBILE' }).expect(401);
      expect(res.body.error).toMatchObject({ code: 'INVALID_CREDENTIALS', message: 'Email or password is wrong.' });
    }
  });

  it('web sign-in uses httpOnly cookies and enforces CSRF on changes', async () => {
    const email = 'web.admin@acme.test';
    await api(app).post('/api/v1/auth/otp/request').send({ email }).expect(200);
    const res = await api(app).post('/api/v1/auth/otp/verify').send({ email, code: messages.lastCode(email), client: 'WEB' }).expect(200);
    expect(res.body.data.accessToken).toBeUndefined();

    const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    expect(cookies.find((c) => c.startsWith('rydo_at='))).toMatch(/HttpOnly/);
    expect(cookies.find((c) => c.startsWith('rydo_rt='))).toMatch(/HttpOnly/);
    const csrf = cookies.find((c) => c.startsWith('rydo_csrf='))!.split(';')[0].split('=')[1];
    const jar = cookies.map((c) => c.split(';')[0]).join('; ');

    await api(app).get('/api/v1/me').set('Cookie', jar).expect(200);
    const blocked = await api(app).patch('/api/v1/me').set('Cookie', jar).send({ name: 'Web Admin' }).expect(403);
    expect(blocked.body.error.code).toBe('FORBIDDEN');
    const ok = await api(app).patch('/api/v1/me').set('Cookie', jar).set('x-csrf-token', csrf).send({ name: 'Web Admin' }).expect(200);
    expect(ok.body.data.user.name).toBe('Web Admin');
  });
});