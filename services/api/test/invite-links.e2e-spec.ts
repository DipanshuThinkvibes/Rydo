import { INestApplication } from '@nestjs/common';
import { api, createApp, FakeMessages, resetDb } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { buildWorld, World } from './world';

const form = (domain: string, over: Record<string, unknown> = {}) => ({
  fullName: 'Nina Rao',
  email: `nina@${domain}`,
  password: 'Sunrise2026',
  phone: '9876543210',
  gender: 'MALE',
  idType: 'PAN',
  idLast4: '4F2K',
  employeeId: 'EMP-501',
  designation: 'Engineer',
  department: 'Engineering',
  office: 'Main office',
  managerName: 'Karan Mehta',
  managerEmail: `karan@${domain}`,
  client: 'MOBILE',
  ...over,
});

/** HR makes a link; employees fill a form and get an account with no approval; links end after 24 hours. */
describe('Employee invite links', () => {
  let app: INestApplication;
  let messages: FakeMessages;
  let prisma: PrismaService;
  let w: World;
  let token: string;
  let inviteId: string;

  const make = async (key = 'hr', body: object = {}) => {
    const res = await api(app).post('/api/v1/admin/invites').set(w.as(key)).send(body);
    return res;
  };
  const tokenOf = (url: string) => url.split('/join/')[1];

  beforeAll(async () => {
    ({ app, messages, prisma } = await createApp());
    await resetDb(prisma);
    w = await buildWorld(app, messages, prisma, 'inv');
  });
  afterAll(() => app.close());

  it('HR makes a link that ends in 24 hours; employees and other companies cannot', async () => {
    const res = await make();
    expect(res.status).toBe(200);
    const hours = (new Date(res.body.data.expiresAt).getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(23.9);
    expect(hours).toBeLessThanOrEqual(24);
    token = tokenOf(res.body.data.url);
    inviteId = res.body.data.id;
    expect((await make('priya')).status).toBe(403); // an employee
    // the secret is never stored
    const row = await prisma.orgInvite.findUniqueOrThrow({ where: { id: inviteId } });
    expect(row.tokenHash).not.toContain(token);
  });

  it('the public page shows the company and its departments, nothing private', async () => {
    const res = await api(app).get(`/api/v1/public/invites/${token}`).expect(200);
    expect(res.body.data.company).toBe('inv Co');
    expect(res.body.data.domains).toContain(w.domain);
    expect(JSON.stringify(res.body.data)).not.toMatch(/"email"|"phone"/);
    await api(app).get('/api/v1/public/invites/not-a-real-link').expect(404);
  });

  it('submitting the form creates an active account at once and tells HR, with no approval', async () => {
    const before = await prisma.notification.count({ where: { organizationId: w.org } });
    const res = await api(app).post(`/api/v1/public/invites/${token}/join`).send(form(w.domain)).expect(200);
    expect(res.body.data.accessToken).toBeTruthy();
    const user = await prisma.user.findUniqueOrThrow({ where: { email: `nina@${w.domain}` }, include: { memberships: { include: { roles: true } } } });
    const m = user.memberships[0];
    expect(m.status).toBe('ACTIVE');
    expect(m.joinedVia).toBe('INVITE_LINK');
    expect(m.inviteId).toBe(inviteId);
    expect(m.roles.map((r) => r.role)).toEqual(['RIDER']);
    expect(await prisma.employeeRegistration.count({ where: { membershipId: m.id } })).toBe(1);
    // HR (and org admin) got a notification for this person
    const told = await prisma.notification.findMany({ where: { type: 'EMPLOYEE_JOINED', organizationId: w.org } });
    expect(told.length).toBeGreaterThan(0);
    expect(await prisma.notification.count({ where: { organizationId: w.org } })).toBeGreaterThan(before);
    // the new employee can use the company straight away
    const me = await api(app).get('/api/v1/me/bookings').set({ Authorization: `Bearer ${res.body.data.accessToken}`, 'x-org-id': w.org });
    expect(me.status).toBe(200);
    // the use was counted
    expect((await prisma.orgInvite.findUniqueOrThrow({ where: { id: inviteId } })).usedCount).toBe(1);
  });

  it('HR sees how each person was created', async () => {
    const list = (await api(app).get('/api/v1/admin/members').set(w.as('hr')).expect(200)).body.data as { email: string; joinedVia: string }[];
    expect(list.find((p) => p.email === `nina@${w.domain}`)?.joinedVia).toBe('INVITE_LINK');
    expect(list.find((p) => p.email === `priya@${w.domain}`)?.joinedVia).toBeDefined();
    const links = (await api(app).get('/api/v1/admin/invites').set(w.as('hr')).expect(200)).body.data as { id: string; usedCount: number; status: string }[];
    expect(links.find((l) => l.id === inviteId)).toMatchObject({ usedCount: 1, status: 'ACTIVE' });
  });

  it('refuses an email from another company, a used email, and a manager outside the company', async () => {
    const wrong = await api(app).post(`/api/v1/public/invites/${token}/join`).send(form('gmail.com', { email: 'sam@gmail.com', managerEmail: `karan@${w.domain}` }));
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.code).toBe('DOMAIN_MISMATCH');
    const used = await api(app).post(`/api/v1/public/invites/${token}/join`).send(form(w.domain));
    expect(used.status).toBe(409);
    const mgr = await api(app).post(`/api/v1/public/invites/${token}/join`).send(form(w.domain, { email: `omar@${w.domain}`, managerEmail: 'boss@elsewhere.com' }));
    expect(mgr.status).toBe(400);
    expect(await prisma.user.count({ where: { email: `omar@${w.domain}` } })).toBe(0);
  });

  it('a link from one company cannot create an account in another', async () => {
    const res = await api(app).post(`/api/v1/public/invites/${token}/join`).send(form(`o-${w.domain}`, { email: `zed@o-${w.domain}`, managerEmail: `boss@o-${w.domain}` }));
    expect(res.status).toBe(400);
    expect(await prisma.user.count({ where: { email: `zed@o-${w.domain}` } })).toBe(0);
    // and the other company's HR cannot see or revoke this link
    const theirs = (await api(app).get('/api/v1/admin/invites').set(w.as('outsider', w.other)).expect(200)).body.data as unknown[];
    expect(theirs).toHaveLength(0);
    await api(app).post(`/api/v1/admin/invites/${inviteId}/revoke`).set(w.as('outsider', w.other)).expect(404);
  });

  it('a link stops working after 24 hours', async () => {
    await prisma.orgInvite.update({ where: { id: inviteId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const info = await api(app).get(`/api/v1/public/invites/${token}`);
    expect(info.status).toBe(410);
    expect(info.body.error.message).toContain('24 hours');
    const join = await api(app).post(`/api/v1/public/invites/${token}/join`).send(form(w.domain, { email: `late@${w.domain}` }));
    expect(join.status).toBe(410);
    expect(await prisma.user.count({ where: { email: `late@${w.domain}` } })).toBe(0);
    const links = (await api(app).get('/api/v1/admin/invites').set(w.as('hr')).expect(200)).body.data as { id: string; status: string }[];
    expect(links.find((l) => l.id === inviteId)?.status).toBe('EXPIRED');
  });

  it('HR can cancel a link early, and a full link stops at its limit', async () => {
    const a = await make('hr', { maxUses: 1 });
    const t1 = tokenOf(a.body.data.url);
    await api(app).post(`/api/v1/public/invites/${t1}/join`).send(form(w.domain, { email: `one@${w.domain}`, employeeId: 'EMP-1' })).expect(200);
    expect((await api(app).post(`/api/v1/public/invites/${t1}/join`).send(form(w.domain, { email: `two@${w.domain}`, employeeId: 'EMP-2' }))).status).toBe(410);
    const b = await make('hr');
    const t2 = tokenOf(b.body.data.url);
    await api(app).post(`/api/v1/admin/invites/${b.body.data.id}/revoke`).set(w.as('hr')).expect(200);
    expect((await api(app).get(`/api/v1/public/invites/${t2}`)).status).toBe(404);
  });

  it('needs the Share licence', async () => {
    await prisma.license.updateMany({ where: { organizationId: w.org }, data: { status: 'SUSPENDED' } });
    const res = await make();
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('LICENSE_INACTIVE');
    await prisma.license.updateMany({ where: { organizationId: w.org }, data: { status: 'ACTIVE' } });
  });
});
