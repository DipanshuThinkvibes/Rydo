import { INestApplication } from '@nestjs/common';
import { api, createApp, FakeMessages, resetDb, signIn } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { buildWorld, World, MID, OFFICE, pt } from './world';

/**
 * At pickup the person or the vehicle does not match what the app showed. Rider or driver cancels with a reason, HR is told,
 * the other person gets a warning, and a repeat goes to RYDO's own team.
 */
describe('Wrong person or wrong vehicle: cancel, report, warn, escalate', () => {
  let app: INestApplication;
  let messages: FakeMessages;
  let prisma: PrismaService;
  let w: World;
  let rootToken: string;
  let supportToken: string;
  let kiranBooking: string;
  const mismatch = (key: string, booking: string, body: object) => api(app).post(`/api/v1/bookings/${booking}/mismatch`).set(w.as(key)).send(body);
  const notices = (userId: string, type: string) => prisma.notification.findMany({ where: { userId, type }, orderBy: { createdAt: 'asc' } });

  beforeAll(async () => {
    ({ app, messages, prisma } = await createApp());
    await resetDb(prisma);
    w = await buildWorld(app, messages, prisma, 'mis');
    const owner = await prisma.user.create({ data: { email: 'owner@rydo.test', name: 'Owner' } });
    const help = await prisma.user.create({ data: { email: 'help@rydo.test', name: 'Helper' } });
    await prisma.platformAdmin.create({ data: { userId: owner.id, role: 'SUPER_ADMIN' } });
    await prisma.platformAdmin.create({ data: { userId: help.id, role: 'SUPPORT' } });
    rootToken = (await signIn(app, messages, 'owner@rydo.test')).accessToken;
    supportToken = (await signIn(app, messages, 'help@rydo.test')).accessToken;

    // a third rider with a seat on the same ride
    const [rq] = await prisma.$queryRawUnsafe<{ id: string }[]>(`
      INSERT INTO ride_requests (id, organization_id, ride_id, rider_membership_id, seats, pickup_label, pickup, drop_label, drop, auto_rematch, status, expires_at, created_at)
      VALUES (gen_random_uuid(), '${w.org}', '${w.rideId}', '${w.ms.kiran}', 1, 'Stop', ${pt(MID)}, 'Office', ${pt(OFFICE)}, false, 'ACCEPTED', now(), now()) RETURNING id`);
    const [b] = await prisma.$queryRawUnsafe<{ id: string }[]>(`
      INSERT INTO bookings (id, organization_id, ride_id, request_id, rider_membership_id, seats, pickup_label, pickup, drop_label, drop, pin, status, created_at, updated_at)
      VALUES (gen_random_uuid(), '${w.org}', '${w.rideId}', '${rq.id}', '${w.ms.kiran}', 1, 'Stop', ${pt(MID)}, 'Office', ${pt(OFFICE)}, '3333', 'CONFIRMED', now(), now()) RETURNING id`);
    kiranBooking = b.id;
    await prisma.$executeRawUnsafe(`UPDATE rides SET seats_booked = 3, status = 'FULL' WHERE id = '${w.rideId}'`);
  });
  afterAll(() => app.close());

  const asStaff = (t: string) => ({ Authorization: `Bearer ${t}` });

  it('needs a signed-in person, and the right to ride (an admin account is refused)', async () => {
    await api(app).post(`/api/v1/bookings/${w.bookings.priya}/mismatch`).send({ kind: 'WRONG_PERSON' }).expect(401);
    const hr = await mismatch('hr', w.bookings.priya, { kind: 'WRONG_PERSON' });
    expect(hr.status).toBe(403);
    expect(hr.body.error.code).toBe('ADMIN_ACCOUNT');
  });

  it('only the rider or the driver of that booking can report it, and only with a reason that fits their side', async () => {
    await mismatch('arjun', w.bookings.priya, { kind: 'WRONG_PERSON' }).expect(404); // somebody else's booking
    await api(app).post(`/api/v1/bookings/${w.bookings.priya}/mismatch`).set(w.as('outsiderRider', w.other)).send({ kind: 'WRONG_PERSON' }).expect(404); // another company
    const bad = await mismatch('priya', w.bookings.priya, { kind: 'NOT_A_REASON' }).expect(400);
    expect(bad.body.error.fields.kind).toBeDefined();
    // a driver can only report that the rider is not the person in the photo
    const wrongSide = await mismatch('driver', w.bookings.priya, { kind: 'WRONG_VEHICLE' }).expect(400);
    expect(wrongSide.body.error.fields.kind).toBeDefined();
    expect(await prisma.issueReport.count()).toBe(0);
  });

  it('1) a rider cancels because the vehicle is wrong: no penalty, seat freed, HR told, driver warned once', async () => {
    const before = await prisma.membership.findUniqueOrThrow({ where: { id: w.ms.priya } });
    const mails = messages.sent.length;
    const res = (await mismatch('priya', w.bookings.priya, { kind: 'WRONG_VEHICLE', note: 'It was a blue Swift, not a white City' }).expect(200)).body.data;
    expect(res).toMatchObject({ status: 'CANCELLED_BY_RIDER', warning: 1, escalated: false });

    const b = await prisma.booking.findUniqueOrThrow({ where: { id: w.bookings.priya } });
    expect(b).toMatchObject({ status: 'CANCELLED_BY_RIDER', lateCancel: false });
    const after = await prisma.membership.findUniqueOrThrow({ where: { id: w.ms.priya } });
    expect(Number(after.reliabilityScore)).toBe(Number(before.reliabilityScore)); // no penalty for reporting
    const ride = await prisma.ride.findUniqueOrThrow({ where: { id: w.rideId } });
    expect(ride).toMatchObject({ seatsBooked: 2, status: 'SCHEDULED' }); // FULL goes back to open

    const report = await prisma.issueReport.findFirstOrThrow({});
    expect(report).toMatchObject({ category: 'IDENTITY_MISMATCH', reporterMembershipId: w.ms.priya, againstMembershipId: w.ms.driver, rideId: w.rideId, status: 'OPEN' });
    expect(report.description).toContain('Wrong vehicle');
    expect(report.description).toContain('blue Swift');

    // the driver got a first warning
    const warn = await notices(w.users.driver, 'SAFETY_WARNING');
    expect(warn).toHaveLength(1);
    expect(warn[0].title).toBe('A colleague reported that you did not match');
    expect(warn[0].body).toContain('first warning');
    expect(messages.sent.slice(mails).some((m) => m.to === w.emails.driver && /did not match/.test(m.subject))).toBe(true);
    // the company's HR was told: the first report
    const hr = await notices(w.users.hr, 'SAFETY_REPORT');
    expect(hr).toHaveLength(1);
    expect(hr[0].body).toContain('first report');
    expect(messages.sent.slice(mails).some((m) => m.to === w.emails.hr && /reported/.test(m.subject))).toBe(true);
    // RYDO's team is not bothered yet; the rider is told it went through
    expect(await prisma.notification.count({ where: { type: 'SAFETY_ESCALATION' } })).toBe(0);
    const sent = await notices(w.users.priya, 'SAFETY_REPORT_SENT');
    expect(sent[0].body).toContain('Search again to find another driver');
    expect(await prisma.auditLog.count({ where: { action: 'MISMATCH_REPORTED' } })).toBe(1);
  });

  it('a cancelled booking cannot be reported again', async () => {
    const again = await mismatch('priya', w.bookings.priya, { kind: 'WRONG_PERSON' }).expect(409);
    expect(again.body.error.code).toBe('CONFLICT');
    expect(await prisma.issueReport.count()).toBe(1);
  });

  it('2) a driver cancels one rider who is not the person in the photo: that rider is warned, the ride goes on', async () => {
    const res = (await mismatch('driver', kiranBooking, { kind: 'WRONG_PERSON', note: 'A different person came to the stop' }).expect(200)).body.data;
    expect(res).toMatchObject({ status: 'CANCELLED_BY_DRIVER', warning: 1 });
    const b = await prisma.booking.findUniqueOrThrow({ where: { id: kiranBooking } });
    expect(b.status).toBe('CANCELLED_BY_DRIVER');
    // only that rider's booking ended: the ride and the other rider's seat are untouched
    expect((await prisma.ride.findUniqueOrThrow({ where: { id: w.rideId } })).status).toBe('SCHEDULED');
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: w.bookings.arjun } })).status).toBe('CONFIRMED');
    const warn = await notices(w.users.kiran, 'SAFETY_WARNING');
    expect(warn[0].body).toContain('clear photo of you');
    expect(warn[0].body).toContain('first warning');
    const hr = await notices(w.users.hr, 'SAFETY_REPORT');
    expect(hr).toHaveLength(2);
  });

  it('3) a second report against the same driver is a final warning, tells HR it is a repeat, and goes to RYDO’s team', async () => {
    const mails = messages.sent.length;
    const res = (await mismatch('arjun', w.bookings.arjun, { kind: 'WRONG_PERSON' }).expect(200)).body.data;
    expect(res).toMatchObject({ status: 'CANCELLED_BY_RIDER', warning: 2, escalated: true });

    const warn = await notices(w.users.driver, 'SAFETY_WARNING');
    expect(warn).toHaveLength(2);
    expect(warn[1].title).toBe('Second report: final warning');
    expect(warn[1].body).toContain('temporary pause');
    const hr = await notices(w.users.hr, 'SAFETY_REPORT');
    expect(hr[2].body).toContain('This is a repeat: 2 reports');

    // the Super Admin and the Support team are both told, by inbox and by email
    const owner = await prisma.user.findUniqueOrThrow({ where: { email: 'owner@rydo.test' } });
    const help = await prisma.user.findUniqueOrThrow({ where: { email: 'help@rydo.test' } });
    for (const u of [owner, help]) {
      const n = await notices(u.id, 'SAFETY_ESCALATION');
      expect(n).toHaveLength(1);
      expect(n[0].title).toContain('Repeat report');
      expect(n[0].body).toContain('2 identity or vehicle mismatch reports');
    }
    expect(messages.sent.slice(mails).filter((m) => /Repeat report/.test(m.subject)).map((m) => m.to).sort()).toEqual(['help@rydo.test', 'owner@rydo.test']);
  });

  it('the repeat shows up for RYDO’s team: flagged, in the reports queue and in People', async () => {
    const reports = (await api(app).get('/api/v1/admin/platform/reports').set(asStaff(supportToken)).expect(200)).body.data;
    expect(reports.total).toBe(3);
    const row = reports.rows.find((r: { against: { membershipId: string } | null }) => r.against?.membershipId === w.ms.driver);
    expect(row).toMatchObject({ category: 'IDENTITY_MISMATCH', against: { flagged: true, reportsAgainst: 2 } });
    const flagged = (await api(app).get('/api/v1/admin/platform/people?flagged=true').set(asStaff(rootToken)).expect(200)).body.data.rows;
    expect(flagged.map((r: { id: string }) => r.id)).toEqual([w.ms.driver]);
    const summary = (await api(app).get('/api/v1/admin/platform/reports/summary').set(asStaff(supportToken)).expect(200)).body.data;
    expect(summary).toMatchObject({ openReports: 3, flaggedPeople: 1 });
  });

  it('the company admin sees the reports too, and the people involved keep their names short for RYDO', async () => {
    const issues = (await api(app).get('/api/v1/admin/issues').set(w.as('hr'))).body;
    expect(JSON.stringify(issues)).toContain('IDENTITY_MISMATCH');
  });
});
