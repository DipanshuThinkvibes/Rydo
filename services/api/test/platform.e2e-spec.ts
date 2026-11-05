import { INestApplication } from '@nestjs/common';
import { api, createApp, FakeMessages, resetDb, signIn } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { UsageService } from '../src/adapters/counting-maps.adapter';

/** RYDO owner console: onboarding, features, seat limits, support view, activity log, health. */
describe('RYDO owner console', () => {
  let app: INestApplication;
  let messages: FakeMessages;
  let prisma: PrismaService;
  const tokens: Record<string, string> = {};
  let clientId: string;

  const as = (key: string, org?: string, support = false) => {
    const h: Record<string, string> = { Authorization: `Bearer ${tokens[key]}` };
    if (org) h['x-org-id'] = org;
    if (support) h['x-rydo-support'] = '1';
    return h;
  };
  const setup = (over: Record<string, unknown> = {}) => ({
    company: { name: 'Globex Corp', slug: 'globex', emailDomains: ['globex.test'] },
    contact: { name: 'Hank Scorpio', email: 'hank@globex.test', phone: '+91 98450 00000' },
    admin: { name: 'Lisa Admin', email: 'lisa@globex.test', password: 'Globex2026' },
    offices: [{ name: 'Globex HQ', address: 'Outer Ring Road, Bellandur', lat: 12.9259, lng: 77.6766, isDefault: true }],
    settings: { pickupRadiusMeters: 800 },
    features: { womenOnly: false },
    maxEmployees: 2,
    ...over,
  });

  beforeAll(async () => {
    ({ app, messages, prisma } = await createApp());
    await resetDb(prisma);
    const root = await prisma.user.create({ data: { email: 'root@rydo.test', name: 'Root' } });
    await prisma.platformAdmin.create({ data: { userId: root.id, role: 'SUPER_ADMIN' } });
    tokens.root = (await signIn(app, messages, 'root@rydo.test')).accessToken;
  });
  afterAll(() => app.close());

  it('onboards a client in one step and emails the admin', async () => {
    const res = await api(app).post('/api/v1/admin/platform/clients').set(as('root')).send(setup()).expect(201);
    clientId = res.body.data.id;
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: clientId } });
    expect(org).toMatchObject({ status: 'ACTIVE', maxEmployees: 2, contactEmail: 'hank@globex.test' });
    expect(org.features).toEqual({ womenOnly: false });
    const offices = await prisma.office.count({ where: { organizationId: clientId, isDefault: true } });
    expect(offices).toBe(1);
    expect(messages.sent.some((m) => m.to === 'lisa@globex.test' && /Globex Corp is ready on RYDO/.test(m.subject))).toBe(true);
    // The admin can sign in with the shared password and manage only Globex.
    const login = await api(app).post('/api/v1/auth/password/login').send({ email: 'lisa@globex.test', password: 'Globex2026', client: 'MOBILE' }).expect(200);
    tokens.lisa = login.body.data.accessToken;
    expect(login.body.data.memberships[0].roles).toEqual(expect.arrayContaining(['ORG_ADMIN', 'HR_ADMIN']));
  });

  it('refuses duplicates and an admin outside the company domain', async () => {
    await api(app).post('/api/v1/admin/platform/clients').set(as('root')).send(setup()).expect(409);
    const res = await api(app).post('/api/v1/admin/platform/clients').set(as('root')).send(setup({ company: { name: 'Initech', slug: 'initech', emailDomains: ['initech.test'] } })).expect(400);
    expect(res.body.error.fields['admin.email']).toBeDefined();
  });

  it('only RYDO admins reach the owner console', async () => {
    await api(app).get('/api/v1/admin/platform/organizations').set(as('lisa')).expect(403);
    await api(app).get('/api/v1/admin/platform/health').set(as('lisa')).expect(403);
    await api(app).post('/api/v1/admin/platform/clients').set(as('lisa')).send(setup({ company: { name: 'X', slug: 'xx', emailDomains: ['x.test'] } })).expect(403);
  });

  it('RYDO admins can search addresses without a company (owner console)', async () => {
    await api(app).get('/api/v1/maps/autocomplete?q=Bellandur&session=abcdefgh1234').set(as('root')).expect(200);
    await api(app).get('/api/v1/maps/autocomplete?q=Bellandur&session=abcdefgh1234').set(as('lisa')).expect(400);
  });

  it('lists clients with live numbers and shows one in detail', async () => {
    const list = (await api(app).get('/api/v1/admin/platform/organizations').set(as('root')).expect(200)).body.data;
    expect(list[0]).toMatchObject({ slug: 'globex', features: { share: true, womenOnly: false }, stats: { activeMembers: 1, pendingMembers: 0 } });
    const detail = (await api(app).get(`/api/v1/admin/platform/organizations/${clientId}`).set(as('root')).expect(200)).body.data;
    expect(detail.admins[0]).toMatchObject({ email: 'lisa@globex.test', hasPassword: true });
    expect(detail.offices).toHaveLength(1);
    expect(detail.series).toHaveLength(14);
    expect(detail.settings.pickupRadiusMeters).toBe(800);
    expect(detail.recent[0].action).toBe('CLIENT_ONBOARDED');
  });

  it('switching a feature off is enforced for the client', async () => {
    const me = (await api(app).get('/api/v1/me').set(as('lisa')).expect(200)).body.data;
    expect(me.memberships[0].organization.features).toMatchObject({ share: true, womenOnly: false });
    await api(app).post('/api/v1/rides/search').set(as('lisa', clientId)).send({ pickup: { label: 'Home', lat: 12.91, lng: 77.64 }, drop: { label: 'Office', lat: 12.92, lng: 77.67 }, date: '2030-01-07', fromTime: '08:00', toTime: '09:00' }).expect(200);
    await api(app).patch(`/api/v1/admin/platform/organizations/${clientId}`).set(as('root')).send({ features: { share: false } }).expect(200);
    const off = await api(app).post('/api/v1/rides/search').set(as('lisa', clientId)).send({ pickup: { label: 'Home', lat: 12.91, lng: 77.64 }, drop: { label: 'Office', lat: 12.92, lng: 77.67 }, date: '2030-01-07', fromTime: '08:00', toTime: '09:00' }).expect(403);
    expect(off.body.error.code).toBe('FEATURE_OFF');
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: clientId } });
    expect(org.features).toMatchObject({ share: false, womenOnly: false, costShare: true });
    await api(app).patch(`/api/v1/admin/platform/organizations/${clientId}`).set(as('root')).send({ features: { share: true } }).expect(200);
  });

  it('the seat limit stops approvals past the plan', async () => {
    const mk = async (email: string) => {
      const u = await prisma.user.create({ data: { email, name: email } });
      return (await prisma.membership.create({ data: { organizationId: clientId, userId: u.id, status: 'PENDING' } })).id;
    };
    const a = await mk('one@globex.test');
    const b = await mk('two@globex.test');
    await api(app).post(`/api/v1/admin/members/${a}/approve`).set(as('lisa', clientId)).expect(200);
    const res = await api(app).post(`/api/v1/admin/members/${b}/approve`).set(as('lisa', clientId)).expect(409);
    expect(res.body.error.code).toBe('SEAT_LIMIT');
    await api(app).patch(`/api/v1/admin/platform/organizations/${clientId}`).set(as('root')).send({ maxEmployees: null }).expect(200);
    await api(app).post(`/api/v1/admin/members/${b}/approve`).set(as('lisa', clientId)).expect(200);
  });

  it('support view: needs a grant, reads admin screens only, never writes, and is logged', async () => {
    await api(app).get('/api/v1/admin/members').set(as('root', clientId, true)).expect(403);
    await api(app).post(`/api/v1/admin/platform/organizations/${clientId}/support`).set(as('root')).send({ reason: 'x' }).expect(400);
    const g = await api(app).post(`/api/v1/admin/platform/organizations/${clientId}/support`).set(as('root')).send({ reason: 'Client asked why approvals fail', minutes: 30 }).expect(201);
    expect(new Date(g.body.data.expiresAt).getTime()).toBeGreaterThan(Date.now());

    const members = await api(app).get('/api/v1/admin/members').set(as('root', clientId, true)).expect(200);
    expect(members.body.data.map((m: { email: string }) => m.email)).toContain('lisa@globex.test');
    await api(app).get('/api/v1/admin/org').set(as('root', clientId, true)).expect(200);
    const write = await api(app).patch('/api/v1/admin/org').set(as('root', clientId, true)).send({ name: 'Hacked' }).expect(403);
    expect(write.body.error.code).toBe('SUPPORT_READ_ONLY');
    await api(app).get('/api/v1/me/bookings').set(as('root', clientId, true)).expect(403);
    // Without the support header a RYDO admin is just an outsider.
    await api(app).get('/api/v1/admin/members').set(as('root', clientId)).expect(403);

    await api(app).post(`/api/v1/admin/platform/organizations/${clientId}/support/end`).set(as('root')).expect(200);
    await api(app).get('/api/v1/admin/members').set(as('root', clientId, true)).expect(403);
    const log = (await api(app).get(`/api/v1/admin/platform/audit?organizationId=${clientId}`).set(as('root')).expect(200)).body.data.map((r: { action: string }) => r.action);
    expect(log).toEqual(expect.arrayContaining(['SUPPORT_STARTED', 'SUPPORT_ENDED']));
  });

  it('activity log pages and filters across clients', async () => {
    const first = (await api(app).get('/api/v1/admin/platform/audit?limit=2').set(as('root')).expect(200)).body;
    expect(first.data).toHaveLength(2);
    expect(first.data[0].organization.name).toBe('Globex Corp');
    expect(first.meta.next).toEqual(expect.any(String));
    const next = (await api(app).get(`/api/v1/admin/platform/audit?limit=2&before=${first.meta.next}`).set(as('root')).expect(200)).body;
    expect(Number(next.data[0].id)).toBeLessThan(Number(first.data[1].id));
    const onboarded = (await api(app).get('/api/v1/admin/platform/audit?action=CLIENT_ONBOARDED').set(as('root')).expect(200)).body.data;
    expect(onboarded).toHaveLength(1);
    const actions = (await api(app).get('/api/v1/admin/platform/audit/actions').set(as('root')).expect(200)).body.data;
    expect(actions).toContain('MEMBER_APPROVED');
  });

  it('health shows platform totals and maps usage', async () => {
    const usage = app.get(UsageService);
    usage.hit('google', 'routes');
    usage.hit('google', 'routes');
    await new Promise((r) => setTimeout(r, 200));
    const h = (await api(app).get('/api/v1/admin/platform/health').set(as('root')).expect(200)).body.data;
    expect(h.totals).toMatchObject({ activeClients: 1, activeMembers: 3 });
    expect(h.usage).toEqual([{ provider: 'google', sku: 'routes', today: 2, month: 2 }]);
    expect(Array.isArray(h.expiring)).toBe(true);
  });
});
