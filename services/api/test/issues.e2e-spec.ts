import { INestApplication } from '@nestjs/common';
import { api, createApp, FakeMessages, resetDb } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { buildWorld, World } from './world';

/** Issue reports: anyone reports; admins work each one from open to resolved; nothing crosses companies. */
describe('Issue reports', () => {
  let app: INestApplication;
  let messages: FakeMessages;
  let prisma: PrismaService;
  let w: World;
  let issueId: string;

  beforeAll(async () => {
    ({ app, messages, prisma } = await createApp());
    await resetDb(prisma);
    w = await buildWorld(app, messages, prisma, 'iss');
  });
  afterAll(() => app.close());

  it('a rider reports a problem on their ride; every admin is told at once', async () => {
    const mailsBefore = messages.sent.length;
    const res = await api(app).post('/api/v1/me/issues').set(w.as('priya')).send({ category: 'UNSAFE_DRIVING', description: 'The car went through a red light twice.', rideId: w.rideId, againstMembershipId: w.ms.driver }).expect(200);
    issueId = res.body.data.id;
    expect(res.body.data).toMatchObject({ status: 'OPEN', category: 'UNSAFE_DRIVING', categoryLabel: 'Unsafe driving' });
    const told = await prisma.notification.findMany({ where: { type: 'ISSUE_REPORTED' }, select: { userId: true } });
    expect(told.map((n) => n.userId).sort()).toEqual([w.users.hr, w.users.ops].sort());
    expect(messages.sent.slice(mailsBefore).filter((m) => /New issue/.test(m.subject)).map((m) => m.to).sort()).toEqual([w.emails.hr, w.emails.ops].sort());
    expect(await prisma.auditLog.count({ where: { action: 'ISSUE_REPORTED', entityId: issueId } })).toBe(1);
  });

  it('checks what is sent', async () => {
    const bad = await api(app).post('/api/v1/me/issues').set(w.as('priya')).send({ category: 'APP_BUG', description: 'short' }).expect(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
    await api(app).post('/api/v1/me/issues').set(w.as('priya')).send({ category: 'NOPE', description: 'A long enough description.' }).expect(400);
    // only people who were on the ride can report it
    await api(app).post('/api/v1/me/issues').set(w.as('stranger')).send({ category: 'ROUTE', description: 'Took a strange route today.', rideId: w.rideId }).expect(403);
    await api(app).post('/api/v1/me/issues').set(w.as('priya')).send({ category: 'OTHER', description: 'Reporting myself by mistake.', againstMembershipId: w.ms.priya }).expect(400);
    // a person from another company can't be named
    await api(app).post('/api/v1/me/issues').set(w.as('priya')).send({ category: 'OTHER', description: 'Naming an outsider here.', againstMembershipId: w.ms.outsiderRider }).expect(404);
  });

  it('the reporter sees their own reports and nobody else does', async () => {
    const mine = (await api(app).get('/api/v1/me/issues').set(w.as('priya')).expect(200)).body.data;
    expect(mine).toHaveLength(1);
    expect(mine[0]).not.toHaveProperty('reporter'); // no names in the rider's own view
    expect((await api(app).get('/api/v1/me/issues').set(w.as('arjun')).expect(200)).body.data).toHaveLength(0);
  });

  it('only admins list and open reports, with names and counts', async () => {
    await api(app).get('/api/v1/admin/issues').set(w.as('priya')).expect(403);
    await api(app).get(`/api/v1/admin/issues/${issueId}`).set(w.as('driver')).expect(403);
    const list = await api(app).get('/api/v1/admin/issues').set(w.as('hr')).expect(200);
    expect(list.body.meta.counts).toEqual({ OPEN: 1, IN_PROGRESS: 0, RESOLVED: 0 });
    expect(list.body.data[0]).toMatchObject({ id: issueId, reporter: { name: 'priya person' }, against: { name: 'driver person' }, ride: { from: 'Home', to: 'Office' } });
    await api(app).get(`/api/v1/admin/issues/${issueId}`).set(w.as('ops')).expect(200);
  });

  it('moves open to in progress to resolved; resolving needs a note; the reporter is told', async () => {
    await api(app).patch(`/api/v1/admin/issues/${issueId}`).set(w.as('hr')).send({}).expect(400);
    const noNote = await api(app).patch(`/api/v1/admin/issues/${issueId}`).set(w.as('hr')).send({ status: 'RESOLVED' }).expect(400);
    expect(noNote.body.error.fields.resolution).toBeDefined();

    const working = (await api(app).patch(`/api/v1/admin/issues/${issueId}`).set(w.as('hr')).send({ status: 'IN_PROGRESS' }).expect(200)).body.data;
    expect(working).toMatchObject({ status: 'IN_PROGRESS', assignedTo: { name: 'hr person' } }); // taking it assigns it

    const done = (await api(app).patch(`/api/v1/admin/issues/${issueId}`).set(w.as('ops')).send({ status: 'RESOLVED', resolution: 'Spoke to the driver; a warning was recorded.' }).expect(200)).body.data;
    expect(done.status).toBe('RESOLVED');
    expect(done.resolvedAt).toBeTruthy();

    const toldPriya = await prisma.notification.findMany({ where: { userId: w.users.priya, type: 'ISSUE_UPDATE' }, orderBy: { createdAt: 'asc' } });
    expect(toldPriya.map((n) => n.title)).toEqual(['We are looking into your report', 'Your report was resolved']);
    expect(toldPriya[1].body).toContain('warning was recorded');
    expect(messages.sent.some((m) => m.to === w.emails.priya && m.subject === 'Your report was resolved')).toBe(true);
    expect(await prisma.auditLog.count({ where: { action: 'ISSUE_UPDATED', entityId: issueId } })).toBe(2);

    const mine = (await api(app).get('/api/v1/me/issues').set(w.as('priya')).expect(200)).body.data[0];
    expect(mine).toMatchObject({ status: 'RESOLVED', resolution: 'Spoke to the driver; a warning was recorded.' });
  });

  it('refuses moves that skip the rules, and can reopen a resolved report', async () => {
    const res = await api(app).patch(`/api/v1/admin/issues/${issueId}`).set(w.as('hr')).send({ status: 'OPEN' }).expect(409);
    expect(res.body.error.code).toBe('CONFLICT');
    await api(app).patch(`/api/v1/admin/issues/${issueId}`).set(w.as('hr')).send({ status: 'IN_PROGRESS' }).expect(200);
  });

  it('pages through reports and filters them', async () => {
    for (let i = 0; i < 3; i++) await api(app).post('/api/v1/me/issues').set(w.as('arjun')).send({ category: 'LATE_OR_NO_SHOW', description: `Driver was late number ${i + 1} today.` }).expect(200);
    const first = (await api(app).get('/api/v1/admin/issues?limit=2').set(w.as('hr')).expect(200)).body;
    expect(first.data).toHaveLength(2);
    expect(first.meta.nextCursor).toBeTruthy();
    const second = (await api(app).get(`/api/v1/admin/issues?limit=2&cursor=${encodeURIComponent(first.meta.nextCursor)}`).set(w.as('hr')).expect(200)).body;
    expect(second.data).toHaveLength(2);
    expect(second.meta.nextCursor).toBeNull();
    expect(new Set([...first.data, ...second.data].map((i: { id: string }) => i.id)).size).toBe(4);
    const late = (await api(app).get('/api/v1/admin/issues?category=LATE_OR_NO_SHOW').set(w.as('hr')).expect(200)).body.data;
    expect(late).toHaveLength(3);
    await api(app).get('/api/v1/admin/issues?cursor=garbage').set(w.as('hr')).expect(400);
  });

  it('keeps companies apart: an admin of another company sees and changes nothing', async () => {
    expect((await api(app).get('/api/v1/admin/issues').set(w.as('outsider', w.other)).expect(200)).body.data).toHaveLength(0);
    await api(app).get(`/api/v1/admin/issues/${issueId}`).set(w.as('outsider', w.other)).expect(404);
    await api(app).patch(`/api/v1/admin/issues/${issueId}`).set(w.as('outsider', w.other)).send({ status: 'RESOLVED', resolution: 'Nope' }).expect(404);
    // an outsider also cannot pick our company with their own token
    await api(app).get('/api/v1/admin/issues').set(w.as('outsider')).expect(403);
  });
});
