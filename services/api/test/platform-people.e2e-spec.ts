import { INestApplication } from '@nestjs/common';
import { api, createApp, FakeMessages, resetDb, signIn } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { buildWorld, World } from './world';

/** The super admin blocks and unblocks people in any company and watches complaints, without seeing personal data. */
describe('Super admin: people, blocking and reports', () => {
  let app: INestApplication;
  let messages: FakeMessages;
  let prisma: PrismaService;
  let w: World;
  let root: { Authorization: string };
  const base = '/api/v1/admin/platform';

  const report = (against: string, by: string, over: object = {}) =>
    prisma.issueReport.create({ data: { organizationId: w.org, reporterMembershipId: by, againstMembershipId: against, category: 'UNSAFE_DRIVING', description: 'Drove too fast on the ring road', ...over } });

  beforeAll(async () => {
    ({ app, messages, prisma } = await createApp());
    await resetDb(prisma);
    w = await buildWorld(app, messages, prisma, 'ppl');
    const staff = await prisma.user.create({ data: { email: 'owner@rydo.test', name: 'Owner' } });
    await prisma.platformAdmin.create({ data: { userId: staff.id, role: 'SUPER_ADMIN' } });
    root = { Authorization: `Bearer ${(await signIn(app, messages, 'owner@rydo.test')).accessToken}` };
  });
  afterAll(() => app.close());

  it('is for RYDO staff only: nobody, riders and company admins are refused', async () => {
    for (const path of ['/people', '/reports', '/reports/summary']) {
      await api(app).get(base + path).expect(401);
      await api(app).get(base + path).set(w.as('priya')).expect(403);
      await api(app).get(base + path).set(w.as('hr')).expect(403);
    }
    await api(app).post(`${base}/people/${w.ms.kiran}/block`).set(w.as('hr')).send({ reason: 'Because I can' }).expect(403);
  });

  it('lists people of every company with only the details needed: no phone, full email, ID or places', async () => {
    await prisma.user.update({ where: { id: w.users.priya }, data: { phone: '9876501234' } });
    const res = (await api(app).get(base + '/people').set(root).expect(200)).body.data;
    expect(res.rows.length).toBeGreaterThan(5);
    const priya = res.rows.find((r: { id: string }) => r.id === w.ms.priya);
    expect(priya).toMatchObject({ organization: { name: 'ppl Co' }, status: 'ACTIVE', blocked: false, reportsAgainst: 0, flagged: false });
    expect(priya.name).toBe('priya p.');
    expect(priya.email).toBe(`p***@${w.domain}`);
    const text = JSON.stringify(res);
    expect(text).not.toContain('9876501234');
    expect(text).not.toContain(w.emails.priya);
    expect(res.rows.some((r: { organization: { name: string } }) => r.organization.name !== 'ppl Co')).toBe(true); // the other company too
  });

  it('filters by company, search text and status', async () => {
    const other = (await api(app).get(`${base}/people?orgId=${w.other}`).set(root).expect(200)).body.data.rows;
    expect(other.length).toBeGreaterThan(0);
    expect(other.every((r: { organization: { id: string } }) => r.organization.id === w.other)).toBe(true);
    const found = (await api(app).get(`${base}/people?q=arjun`).set(root).expect(200)).body.data.rows;
    expect(found.map((r: { id: string }) => r.id)).toEqual([w.ms.arjun]);
    await api(app).get(`${base}/people?status=NOPE`).set(root).expect(400);
  });

  it('blocks a person with a reason, at once, and tells them', async () => {
    await api(app).post(`${base}/people/${w.ms.kiran}/block`).set(root).send({}).expect(400);
    await api(app).post(`${base}/people/${w.ms.kiran}/block`).set(root).send({ reason: 'no' }).expect(400);
    await api(app).get('/api/v1/me/profile').set(w.as('kiran')).expect(200);
    const res = (await api(app).post(`${base}/people/${w.ms.kiran}/block`).set(root).send({ reason: 'Repeated unsafe driving complaints' }).expect(200)).body.data;
    expect(res).toMatchObject({ status: 'SUSPENDED', blocked: true });
    const row = (await api(app).get(`${base}/people/${w.ms.kiran}`).set(root).expect(200)).body.data;
    expect(row).toMatchObject({ blocked: true, status: 'SUSPENDED', blockReason: 'Repeated unsafe driving complaints' });
    expect(row.history[0].action).toBe('PLATFORM_MEMBER_BLOCKED');
    // they lose the company straight away
    await api(app).get('/api/v1/me/profile').set(w.as('kiran')).expect(403);
    expect(await prisma.notification.count({ where: { userId: w.users.kiran, type: 'ACCOUNT_BLOCKED' } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'PLATFORM_MEMBER_BLOCKED', entityId: w.ms.kiran } })).toBe(1);
  });

  it('refuses to block twice, to block yourself, or to block someone who is not a member yet', async () => {
    const again = await api(app).post(`${base}/people/${w.ms.kiran}/block`).set(root).send({ reason: 'Second time' }).expect(409);
    expect(again.body.error.code).toBe('CONFLICT');
    await api(app).post(`${base}/people/00000000-0000-4000-8000-000000000000/block`).set(root).send({ reason: 'Nobody here' }).expect(404);
    const pending = await prisma.user.create({ data: { email: `wait@${w.domain}`, name: 'Wait Er' } });
    const pm = await prisma.membership.create({ data: { organizationId: w.org, userId: pending.id, status: 'PENDING' } });
    await api(app).post(`${base}/people/${pm.id}/block`).set(root).send({ reason: 'Not a member yet' }).expect(409);
  });

  it('the company admin cannot undo a RYDO block, but still sees them as suspended', async () => {
    const res = await api(app).post(`/api/v1/admin/members/${w.ms.kiran}/reactivate`).set(w.as('hr')).expect(403);
    expect(res.body.error.message).toContain('RYDO support');
    await api(app).get('/api/v1/me/profile').set(w.as('kiran')).expect(403);
  });

  it('shows who is blocked, and filters on it', async () => {
    const blocked = (await api(app).get(base + '/people?blocked=true').set(root).expect(200)).body.data.rows;
    expect(blocked.map((r: { id: string }) => r.id)).toEqual([w.ms.kiran]);
    expect(blocked[0].blockReason).toBe('Repeated unsafe driving complaints');
  });

  it('unblocks with a reason, restoring access, and the company admin can manage them again', async () => {
    await api(app).post(`${base}/people/${w.ms.kiran}/unblock`).set(root).send({ reason: 'Resolved with the company' }).expect(200);
    await api(app).get('/api/v1/me/profile').set(w.as('kiran')).expect(200);
    expect(await prisma.notification.count({ where: { userId: w.users.kiran, type: 'ACCOUNT_UNBLOCKED' } })).toBe(1);
    const again = await api(app).post(`${base}/people/${w.ms.kiran}/unblock`).set(root).send({ reason: 'Already done' }).expect(409);
    expect(again.body.error.code).toBe('CONFLICT');
    await api(app).post(`/api/v1/admin/members/${w.ms.kiran}/suspend`).set(w.as('hr')).expect(200);
    await api(app).post(`/api/v1/admin/members/${w.ms.kiran}/reactivate`).set(w.as('hr')).expect(200); // an ordinary suspension is the company's to lift
  });

  it('a second report against the same person flags them', async () => {
    await report(w.ms.arjun, w.ms.priya);
    const one = (await api(app).get(`${base}/people/${w.ms.arjun}`).set(root).expect(200)).body.data;
    expect(one).toMatchObject({ reportsAgainst: 1, flagged: false });
    await report(w.ms.arjun, w.ms.kiran, { category: 'HARASSMENT', description: 'Rude on the ride' });
    const two = (await api(app).get(`${base}/people/${w.ms.arjun}`).set(root).expect(200)).body.data;
    expect(two).toMatchObject({ reportsAgainst: 2, recentReportsAgainst: 2, flagged: true });
    expect(two.reports).toHaveLength(2);
    const flagged = (await api(app).get(base + '/people?flagged=true').set(root).expect(200)).body.data.rows;
    expect(flagged.map((r: { id: string }) => r.id)).toEqual([w.ms.arjun]);
  });

  it('old reports do not count towards the flag', async () => {
    await report(w.ms.stranger, w.ms.priya, { createdAt: new Date(Date.now() - 200 * 86_400_000) });
    await report(w.ms.stranger, w.ms.kiran);
    const p = (await api(app).get(`${base}/people/${w.ms.stranger}`).set(root).expect(200)).body.data;
    expect(p).toMatchObject({ reportsAgainst: 2, recentReportsAgainst: 1, flagged: false });
  });

  it('lists every company’s reports with short names and no contact details', async () => {
    const res = (await api(app).get(base + '/reports').set(root).expect(200)).body.data;
    expect(res.total).toBe(4);
    const row = res.rows.find((r: { against: { membershipId: string } | null }) => r.against?.membershipId === w.ms.arjun);
    expect(row).toMatchObject({ organization: 'ppl Co', category: expect.any(String), against: { name: 'arjun p.', flagged: true } });
    expect(JSON.stringify(res)).not.toContain('@');
    const open = (await api(app).get(base + '/reports?status=RESOLVED').set(root).expect(200)).body.data;
    expect(open.total).toBe(0);
  });

  it('gives the safety numbers', async () => {
    await api(app).post(`${base}/people/${w.ms.arjun}/block`).set(root).send({ reason: 'Two reports in a row' }).expect(200);
    const s = (await api(app).get(base + '/reports/summary').set(root).expect(200)).body.data;
    expect(s).toMatchObject({ openReports: 4, blocked: 1, flaggedPeople: 1, repeatRule: { reports: 2, days: 90 } });
  });
});

describe('Super admin: carpool impact numbers', () => {
  let app: INestApplication;
  let messages: FakeMessages;
  let prisma: PrismaService;
  let w: World;
  let root: { Authorization: string };

  beforeAll(async () => {
    ({ app, messages, prisma } = await createApp());
    await resetDb(prisma);
    w = await buildWorld(app, messages, prisma, 'imp');
    const staff = await prisma.user.create({ data: { email: 'owner@rydo.test', name: 'Owner' } });
    await prisma.platformAdmin.create({ data: { userId: staff.id, role: 'SUPER_ADMIN' } });
    root = { Authorization: `Bearer ${(await signIn(app, messages, 'owner@rydo.test')).accessToken}` };
  });
  afterAll(() => app.close());

  it('is for RYDO staff only', async () => {
    await api(app).get('/api/v1/admin/platform/impact').expect(401);
    await api(app).get('/api/v1/admin/platform/impact').set(w.as('hr')).expect(403);
  });

  it('counts shared trips, adoption, savings and quiet clients across all companies', async () => {
    await prisma.$executeRawUnsafe(`UPDATE rides SET distance_meters = 10000, status = 'COMPLETED', depart_at = now() - interval '2 days' WHERE id = '${w.rideId}'`);
    await prisma.booking.updateMany({ where: { rideId: w.rideId }, data: { status: 'COMPLETED' } });
    const res = (await api(app).get('/api/v1/admin/platform/impact').set(root).expect(200)).body.data;
    const trips = await prisma.booking.count({ where: { rideId: w.rideId, status: 'COMPLETED' } });
    expect(trips).toBeGreaterThan(0);
    expect(res).toMatchObject({ days: 30, sharedTrips: trips, ridesShared: 1, clients: 2 });
    expect(res.sharedKm).toBeGreaterThanOrEqual(10 * trips);
    expect(res.co2SavedKg).toBe(Math.round(res.sharedKm * 0.12));
    expect(res.adoptionPct).toBeGreaterThan(0);
    expect(res.adoptionPct).toBeLessThanOrEqual(100);
    expect(res.weeks).toHaveLength(8);
    expect(res.weeks.reduce((n: number, x: { trips: number }) => n + x.trips, 0)).toBe(trips);
    expect(res.topClients[0]).toMatchObject({ name: 'imp Co', sharedTrips: trips });
    expect(res.quietClients.map((c: { name: string }) => c.name)).toEqual(['imp Other']); // has people, no shared trip yet
    expect(res.newInquiries).toBe(0);
  });
});
