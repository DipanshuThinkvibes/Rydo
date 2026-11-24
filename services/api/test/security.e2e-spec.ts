import { INestApplication } from '@nestjs/common';
import { OrgRole } from '@prisma/client';
import { api, createApp, FakeMessages, resetDb, signIn } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { UserThrottlerGuard } from '../src/common/user-throttler.guard';

/** Phase 5: the checks an attacker would try first. */
describe('Security', () => {
  let app: INestApplication;
  let messages: FakeMessages;
  let prisma: PrismaService;
  const orgs: Record<string, string> = {};
  const tokens: Record<string, string> = {};
  const ms: Record<string, string> = {};

  async function person(key: string, org: 'A' | 'B', roles: OrgRole[]) {
    const email = `${key}@${org}.test`.toLowerCase();
    const user = await prisma.user.create({ data: { email, name: key } });
    ms[key] = (await prisma.membership.create({ data: { organizationId: orgs[org], userId: user.id, status: 'ACTIVE', roles: { create: roles.map((role) => ({ role })) } } })).id;
    tokens[key] = (await signIn(app, messages, email)).accessToken;
  }
  const as = (key: string, org: 'A' | 'B' = 'A') => ({ Authorization: `Bearer ${tokens[key]}`, 'x-org-id': orgs[org] });

  beforeAll(async () => {
    ({ app, messages, prisma } = await createApp());
    await resetDb(prisma);
    orgs.A = (await prisma.organization.create({ data: { licenses: { create: [{ product: 'SHARE' }] }, name: 'A Co', slug: 'a', emailDomains: ['a.test'], status: 'ACTIVE' } })).id;
    orgs.B = (await prisma.organization.create({ data: { licenses: { create: [{ product: 'SHARE' }] }, name: 'B Co', slug: 'b', emailDomains: ['b.test'], status: 'ACTIVE' } })).id;
    await person('adminA', 'A', ['ORG_ADMIN', 'HR_ADMIN']);
    await person('riderA', 'A', ['RIDER']);
    await person('riderB', 'B', ['RIDER']);
  });
  afterAll(() => app.close());

  it('every private route needs sign-in', async () => {
    const routes: [string, string][] = [
      ['get', '/api/v1/me'],
      ['get', '/api/v1/me/bookings'],
      ['get', '/api/v1/admin/members'],
      ['get', '/api/v1/rides/driving'],
      ['post', '/api/v1/rides/search'],
      ['get', '/api/v1/admin/platform/health'],
      ['get', '/api/v1/admin/reports/employees.csv'],
      ['get', '/api/v1/maps/autocomplete?q=ab&session=abcdefgh'],
    ];
    for (const [m, url] of routes) {
      const res = await (api(app) as unknown as Record<string, (u: string) => { set: (h: object) => Promise<{ status: number }> }>)[m](url).set({ 'x-org-id': orgs.A });
      expect([url, res.status]).toEqual([url, 401]);
    }
  });

  it('a forged or altered token is refused', async () => {
    const [h, p] = tokens.riderA.split('.');
    const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
    const forged = `${h}.${Buffer.from(JSON.stringify({ ...claims, sub: ms.adminA })).toString('base64url')}.${tokens.riderA.split('.')[2]}`;
    await api(app).get('/api/v1/me').set({ Authorization: `Bearer ${forged}` }).expect(401);
    await api(app).get('/api/v1/me').set({ Authorization: 'Bearer not.a.token' }).expect(401);
  });

  it('extra fields are ignored: nobody makes themself a RYDO admin or changes RYDO-only settings', async () => {
    await api(app).patch('/api/v1/me').set(as('riderA')).send({ isPlatformAdmin: true, email: 'evil@x.test' }).expect(200);
    const u = await prisma.user.findUniqueOrThrow({ where: { email: 'ridera@a.test' }, include: { platformRoles: true } });
    expect(u.platformRoles).toHaveLength(0);
    await api(app).patch('/api/v1/admin/org').set(as('adminA')).send({ name: 'A Co', status: 'SUSPENDED', features: { share: false }, maxEmployees: 99999 }).expect(200);
    const o = await prisma.organization.findUniqueOrThrow({ where: { id: orgs.A } });
    expect(o).toMatchObject({ status: 'ACTIVE', maxEmployees: null });
    expect(o.features).toEqual({});
  });

  it('SQL injection attempts are treated as plain text', async () => {
    const res = await api(app).get(`/api/v1/admin/members?q=${encodeURIComponent("' OR 1=1 --")}`).set(as('adminA')).expect(200);
    expect(res.body.data).toHaveLength(0);
    const all = await api(app).get('/api/v1/admin/members').set(as('adminA')).expect(200);
    expect(all.body.data.every((m: { email: string }) => m.email.endsWith('@a.test'))).toBe(true);
    await api(app)
      .post('/api/v1/rides/search')
      .set(as('riderA'))
      .send({ pickup: { label: "x'); DROP TABLE rides; --", lat: 12.9, lng: 77.6 }, drop: { label: 'Office', lat: 12.92, lng: 77.67 }, date: '2030-01-07', fromTime: '08:00', toTime: '09:00' })
      .expect(200);
    expect(await prisma.ride.count()).toBeGreaterThanOrEqual(0);
  });

  it("another company's data is out of reach, even with its id", async () => {
    await api(app).get('/api/v1/admin/members').set(as('riderB', 'A')).expect(403);
    await api(app).get('/api/v1/me/bookings').set(as('riderB', 'A')).expect(403);
    const fake = '00000000-0000-4000-8000-000000000000';
    await api(app).get(`/api/v1/rides/${fake}/live`).set(as('riderA')).expect(404);
    await api(app).post(`/api/v1/bookings/${fake}/cancel`).set(as('riderA')).send({}).expect(404);
    await api(app).get('/api/v1/admin/members').set(as('riderA')).expect(403);
  });

  it('the API sends safe headers and refuses oversized requests', async () => {
    const res = await api(app).get('/api/v1/health').expect(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['content-security-policy']).toBeDefined();
    const big = await api(app).patch('/api/v1/me').set(as('riderA')).send({ name: 'x'.repeat(200_000) }).expect(413);
    expect(big.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    await api(app).patch('/api/v1/me').set(as('riderA')).set('content-type', 'application/json').send('{bad json').expect(400);
  });

  it('a made-up trip link reveals nothing', async () => {
    const res = await api(app).get('/api/v1/public/trips/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA').expect(404);
    expect(Object.keys(res.body)).toEqual(['error']);
  });

  it('rate limits count per person, not per office internet address', async () => {
    const g = Object.create(UserThrottlerGuard.prototype) as { getTracker: (r: object) => Promise<string> };
    expect(await g.getTracker({ ip: '1.2.3.4', auth: { userId: 'u1' } })).toBe('u:u1');
    expect(await g.getTracker({ ip: '1.2.3.4', body: { email: ' Priya@A.test ' } })).toBe('ip:1.2.3.4:priya@a.test');
    expect(await g.getTracker({ ip: '1.2.3.4' })).toBe('ip:1.2.3.4');
  });
});
