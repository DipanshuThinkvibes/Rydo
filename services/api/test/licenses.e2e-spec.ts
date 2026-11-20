import { INestApplication } from '@nestjs/common';
import { api, createApp, FakeMessages, resetDb, signIn } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { buildWorld, World } from './world';

const iso = (daysFromNow: number) => new Date(Date.now() + daysFromNow * 86_400_000).toISOString().slice(0, 10);

/** The super admin licenses each client; a product works only while its licence is valid. */
describe('Licences', () => {
  let app: INestApplication;
  let messages: FakeMessages;
  let prisma: PrismaService;
  let w: World;
  let root: { Authorization: string };
  const base = '/api/v1/admin/platform';
  const lic = (org: string, p: string) => `${base}/organizations/${org}/licenses/${p}`;
  const search = (as: string) => api(app).get('/api/v1/me/preferred-drivers').set(w.as(as)); // a carpool route: needs a valid Share licence

  beforeAll(async () => {
    ({ app, messages, prisma } = await createApp());
    await resetDb(prisma);
    w = await buildWorld(app, messages, prisma, 'lic');
    const staff = await prisma.user.create({ data: { email: 'owner@rydo.test', name: 'Owner' } });
    await prisma.platformAdmin.create({ data: { userId: staff.id, role: 'SUPER_ADMIN' } });
    root = { Authorization: `Bearer ${(await signIn(app, messages, 'owner@rydo.test')).accessToken}` };
  });
  afterAll(() => app.close());

  it('is for RYDO staff only', async () => {
    for (const path of ['/licenses', '/licenses/summary', `/organizations/${w.org}/licenses`]) {
      await api(app).get(base + path).expect(401);
      await api(app).get(base + path).set(w.as('hr')).expect(403);
    }
    await api(app).put(lic(w.org, 'SHARE')).set(w.as('hr')).send({ expiresAt: null }).expect(403);
    await api(app).post(lic(w.org, 'SHARE') + '/revoke').set(w.as('hr')).send({ reason: 'I want to' }).expect(403);
  });

  it('lists every licence with its state and what is left', async () => {
    const rows = (await api(app).get(base + '/licenses').set(root).expect(200)).body.data;
    expect(rows).toHaveLength(2); // the two test companies, one Share licence each
    expect(rows[0]).toMatchObject({ product: 'SHARE', state: 'ACTIVE', daysLeft: null });
    const s = (await api(app).get(base + '/licenses/summary').set(root).expect(200)).body.data;
    expect(s).toMatchObject({ total: 2, active: 2, expiringSoon: 0, expired: 0, clientsWithoutShare: 0 });
  });

  it('a company with a valid Share licence can use carpool', async () => {
    await search('priya').expect(200);
  });

  it('shows each company its own licence status and the products that are on', async () => {
    const me = (await api(app).get('/api/v1/me').set(w.as('priya')).expect(200)).body.data;
    const o = me.memberships[0].organization;
    expect(o.features).toMatchObject({ share: true, enterprise: false });
    expect(o.licenses).toEqual([{ product: 'SHARE', state: 'ACTIVE', expiresAt: null, daysLeft: null }]);
  });

  it('issues a product, with an end date, and rejects bad dates', async () => {
    await api(app).put(lic(w.org, 'ENTERPRISE')).set(root).send({ expiresAt: '31-12-2027' }).expect(400);
    await api(app).put(lic(w.org, 'ENTERPRISE')).set(root).send({ startsAt: iso(5), expiresAt: iso(1) }).expect(400);
    await api(app).put(lic(w.org, 'NOPE')).set(root).send({ expiresAt: null }).expect(400);
    const res = (await api(app).put(lic(w.org, 'ENTERPRISE')).set(root).send({ expiresAt: iso(90), notes: 'Pilot' }).expect(200)).body.data;
    expect(res).toMatchObject({ product: 'ENTERPRISE', state: 'ACTIVE', notes: 'Pilot' });
    expect(res.daysLeft).toBeGreaterThan(88);
    expect(await prisma.auditLog.count({ where: { action: 'LICENSE_ISSUED', organizationId: w.org } })).toBe(1);
  });

  it('issuing a product switches its module on, and RYDO can still switch the module off', async () => {
    const me = (await api(app).get('/api/v1/me').set(w.as('priya')).expect(200)).body.data;
    expect(me.memberships[0].organization.features.enterprise).toBe(true);
    await prisma.organization.update({ where: { id: w.org }, data: { features: { enterprise: false } } });
    const off = (await api(app).get('/api/v1/me').set(w.as('priya')).expect(200)).body.data;
    expect(off.memberships[0].organization.features.enterprise).toBe(false);
  });

  it('pausing the Share licence stops carpool at once, with a clear message, and resuming restores it', async () => {
    await api(app).post(lic(w.org, 'SHARE') + '/suspend').set(root).send({ reason: 'x' }).expect(400);
    await api(app).post(lic(w.org, 'SHARE') + '/suspend').set(root).send({ reason: 'Invoice not settled' }).expect(200);
    const blocked = await search('priya').expect(403);
    expect(blocked.body.error.code).toBe('LICENSE_INACTIVE');
    const me = (await api(app).get('/api/v1/me').set(w.as('priya')).expect(200)).body.data;
    expect(me.memberships[0].organization.features.share).toBe(false);
    expect(me.memberships[0].organization.licenses[0].state).toBe('SUSPENDED');
    await search('priya').expect(403);
    // the other company is not touched
    await api(app).get('/api/v1/me/preferred-drivers').set(w.as('outsiderRider', w.other)).expect(200);

    await api(app).post(lic(w.org, 'SHARE') + '/suspend').set(root).send({ reason: 'Again, why not' }).expect(409);
    await api(app).post(lic(w.org, 'SHARE') + '/resume').set(root).send({ reason: 'Paid and settled' }).expect(200);
    await search('priya').expect(200);
    await api(app).post(lic(w.org, 'SHARE') + '/resume').set(root).send({ reason: 'Already running' }).expect(409);
  });

  it('an expired licence stops carpool, and renewing brings it back', async () => {
    await prisma.license.update({ where: { organizationId_product: { organizationId: w.org, product: 'SHARE' } }, data: { expiresAt: new Date(Date.now() - 3_600_000) } });
    const res = await search('priya').expect(403);
    expect(res.body.error.code).toBe('LICENSE_INACTIVE');
    const s = (await api(app).get(base + '/licenses/summary').set(root).expect(200)).body.data;
    expect(s).toMatchObject({ expired: 1, clientsWithoutShare: 1 });
    const expired = (await api(app).get(base + '/licenses?state=EXPIRED').set(root).expect(200)).body.data;
    expect(expired.map((l: { organization: { name: string } }) => l.organization.name)).toEqual(['lic Co']);

    await api(app).put(lic(w.org, 'SHARE')).set(root).send({ expiresAt: iso(365) }).expect(200);
    await search('priya').expect(200);
    expect(await prisma.auditLog.count({ where: { action: 'LICENSE_RENEWED', organizationId: w.org } })).toBe(1);
  });

  it('a licence that starts in the future is not valid yet', async () => {
    await api(app).put(lic(w.org, 'SHARE')).set(root).send({ startsAt: iso(10), expiresAt: iso(100) }).expect(200);
    await search('priya').expect(403);
    const rows = (await api(app).get(`${base}/licenses?orgId=${w.org}&product=SHARE`).set(root).expect(200)).body.data;
    expect(rows[0].state).toBe('SCHEDULED');
    await api(app).put(lic(w.org, 'SHARE')).set(root).send({ expiresAt: null }).expect(200);
    await search('priya').expect(200);
  });

  it('flags licences ending within 30 days', async () => {
    await api(app).put(lic(w.org, 'SHARE')).set(root).send({ expiresAt: iso(10) }).expect(200);
    const s = (await api(app).get(base + '/licenses/summary').set(root).expect(200)).body.data;
    expect(s.expiringSoon).toBe(1);
    const soon = (await api(app).get(base + '/licenses?state=EXPIRING').set(root).expect(200)).body.data;
    expect(soon).toHaveLength(1);
    expect(soon[0].daysLeft).toBeLessThanOrEqual(11);
  });

  it('revoking removes the licence until it is issued again', async () => {
    await api(app).post(lic(w.org, 'SHARE') + '/revoke').set(root).send({ reason: 'Contract ended' }).expect(200);
    await search('priya').expect(403);
    await api(app).post(lic(w.org, 'SHARE') + '/revoke').set(root).send({ reason: 'Contract ended' }).expect(409);
    await api(app).post(lic(w.org, 'SHARE') + '/resume').set(root).send({ reason: 'Not paused' }).expect(409); // revoked is not paused
    await api(app).put(lic(w.org, 'SHARE')).set(root).send({ expiresAt: null }).expect(200);
    await search('priya').expect(200);
    await api(app).post(lic(w.org, 'CAMPUS') + '/revoke').set(root).send({ reason: 'Never issued' }).expect(404);
  });

  it('shows one company all three products, issued or not', async () => {
    const rows = (await api(app).get(`${base}/organizations/${w.org}/licenses`).set(root).expect(200)).body.data;
    expect(rows.map((r: { product: string; state: string }) => `${r.product}:${r.state}`)).toEqual(['SHARE:ACTIVE', 'ENTERPRISE:ACTIVE', 'CAMPUS:NONE']);
  });

  it('a new client made by RYDO gets a Share licence and nothing else unless asked', async () => {
    const res = await api(app).post(`${base}/clients`).set(root).send({
      company: { name: 'Globex', slug: 'globex', emailDomains: ['globex.example'] },
      contact: { name: 'Gina', email: 'gina@globex.example' },
      admin: { name: 'Gina', email: 'gina@globex.example' },
      licenseEndsOn: iso(365),
      sendWelcome: false,
    }).expect(201);
    const id = res.body.data.id ?? res.body.data.organization?.id;
    const rows = await prisma.license.findMany({ where: { organizationId: id } });
    expect(rows.map((r) => r.product)).toEqual(['SHARE']);
    expect(rows[0].expiresAt).toBeTruthy();
  });
});
