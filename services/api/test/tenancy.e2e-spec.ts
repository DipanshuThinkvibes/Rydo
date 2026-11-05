import { INestApplication } from '@nestjs/common';
import { OrgRole } from '@prisma/client';
import { api, createApp, FakeMessages, resetDb, signIn } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/** Company A must never see or change Company B's data, and roles must hold. */
describe('Tenant isolation and roles', () => {
  let app: INestApplication;
  let messages: FakeMessages;
  let prisma: PrismaService;
  const orgs: Record<string, string> = {};
  const tokens: Record<string, string> = {};
  const memberships: Record<string, string> = {};

  async function person(key: string, org: 'A' | 'B', status: 'ACTIVE' | 'PENDING', roles: OrgRole[]) {
    const email = `${key}@${org}.test`.toLowerCase();
    const user = await prisma.user.create({ data: { email, name: key } });
    const m = await prisma.membership.create({
      data: { organizationId: orgs[org], userId: user.id, status, roles: { create: roles.map((role) => ({ role })) } },
    });
    memberships[key] = m.id;
    tokens[key] = (await signIn(app, messages, email)).accessToken;
  }
  const as = (key: string, org?: string) => {
    const headers: Record<string, string> = { Authorization: `Bearer ${tokens[key]}` };
    if (org) headers['x-org-id'] = org;
    return headers;
  };

  beforeAll(async () => {
    ({ app, messages, prisma } = await createApp());
    await resetDb(prisma);
    orgs.A = (await prisma.organization.create({ data: { name: 'Company A', slug: 'a', emailDomains: ['a.test'], status: 'ACTIVE' } })).id;
    orgs.B = (await prisma.organization.create({ data: { name: 'Company B', slug: 'b', emailDomains: ['b.test'], status: 'ACTIVE' } })).id;
    await person('hrA', 'A', 'ACTIVE', ['ORG_ADMIN', 'HR_ADMIN']);
    await person('riderA', 'A', 'ACTIVE', ['RIDER']);
    await person('pendingA', 'A', 'PENDING', ['RIDER']);
    await person('hrB', 'B', 'ACTIVE', ['HR_ADMIN']);
    await person('pendingB', 'B', 'PENDING', ['RIDER']);

    const superUser = await prisma.user.create({ data: { email: 'root@rydo.test', name: 'Root' } });
    await prisma.platformAdmin.create({ data: { userId: superUser.id, role: 'SUPER_ADMIN' } });
    tokens.root = (await signIn(app, messages, 'root@rydo.test')).accessToken;
  });
  afterAll(() => app.close());

  it('requires a company header on company routes', async () => {
    const res = await api(app).get('/api/v1/admin/members').set(as('hrA')).expect(400);
    expect(res.body.error.code).toBe('ORG_REQUIRED');
  });

  it('lists only my company\'s employees', async () => {
    const res = await api(app).get('/api/v1/admin/members').set(as('hrA', orgs.A)).expect(200);
    const emails = res.body.data.map((m: { email: string }) => m.email);
    expect(emails).toEqual(expect.arrayContaining(['hra@a.test', 'ridera@a.test', 'pendinga@a.test']));
    expect(emails.some((e: string) => e.endsWith('@b.test'))).toBe(false);
  });

  it('refuses another company\'s header', async () => {
    const res = await api(app).get('/api/v1/admin/members').set(as('hrA', orgs.B)).expect(403);
    expect(res.body.error.code).toBe('MEMBERSHIP_NOT_ACTIVE');
  });

  it('cannot approve an employee of another company, even with their id', async () => {
    const res = await api(app).post(`/api/v1/admin/members/${memberships.pendingB}/approve`).set(as('hrA', orgs.A)).expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    const still = await prisma.membership.findUniqueOrThrow({ where: { id: memberships.pendingB } });
    expect(still.status).toBe('PENDING');
  });

  it('HR approves its own employee, writes an audit row and emails them', async () => {
    await api(app).post(`/api/v1/admin/members/${memberships.pendingA}/approve`).set(as('hrA', orgs.A)).expect(200);
    const m = await prisma.membership.findUniqueOrThrow({ where: { id: memberships.pendingA } });
    expect(m.status).toBe('ACTIVE');
    expect(await prisma.auditLog.count({ where: { action: 'MEMBER_APPROVED', entityId: memberships.pendingA, organizationId: orgs.A } })).toBe(1);
    expect(messages.sent.some((s) => s.to === 'pendinga@a.test' && /approved/.test(s.subject))).toBe(true);
  });

  it('a rider cannot use admin routes', async () => {
    const res = await api(app).get('/api/v1/admin/members').set(as('riderA', orgs.A)).expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('a pending employee has no company access yet', async () => {
    const res = await api(app).get('/api/v1/admin/members').set(as('pendingB', orgs.B)).expect(403);
    expect(res.body.error.code).toBe('MEMBERSHIP_NOT_ACTIVE');
  });

  it('keeps at least one Org Admin', async () => {
    const res = await api(app).patch(`/api/v1/admin/members/${memberships.hrA}/roles`).set(as('hrA', orgs.A)).send({ roles: ['HR_ADMIN'] }).expect(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('only RYDO Super Admins manage companies', async () => {
    await api(app).get('/api/v1/admin/platform/organizations').set(as('hrA')).expect(403);
    const created = await api(app).post('/api/v1/admin/platform/organizations').set(as('root')).send({ name: 'Company C', slug: 'company-c', emailDomains: ['c.test'] }).expect(201);
    expect(created.body.data.status).toBe('ACTIVE');
    const dup = await api(app).post('/api/v1/admin/platform/organizations').set(as('root')).send({ name: 'Copy', slug: 'copy-a', emailDomains: ['a.test'] }).expect(409);
    expect(dup.body.error.code).toBe('CONFLICT');
  });

  it('a suspended company locks its admins out', async () => {
    await api(app).patch(`/api/v1/admin/platform/organizations/${orgs.B}`).set(as('root')).send({ status: 'SUSPENDED' }).expect(200);
    const res = await api(app).get('/api/v1/admin/members').set(as('hrB', orgs.B)).expect(403);
    expect(res.body.error.code).toBe('MEMBERSHIP_NOT_ACTIVE');
  });
});