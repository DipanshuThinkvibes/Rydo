import { INestApplication } from '@nestjs/common';
import { OrgRole } from '@prisma/client';
import { api, createApp, FakeDocumentCheck, FakeMessages, resetDb, signIn } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { DocumentExpiryService } from '../src/drivers/document-expiry.service';

const nextYear = `${new Date().getFullYear() + 1}-06-30`;
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
const pdf = Buffer.from('%PDF-1.4');
const LICENCE = 'KA0120190001234';
const PLATE = 'KA 01 AB 1234';

type Step = { key: string; status: string; note: string | null; cause?: string };
type Doc = { id: string; kind: string; status: string; hasBack: boolean; check: { status: string; notes: string[] } | null; rejectReason: string | null };

/** Driver sign-up like the Uber driver app: checklist, papers, government record checks, photos, guidelines, HR verify. */
describe('Driver sign-up and verification', () => {
  let app: INestApplication;
  let messages: FakeMessages;
  let records: FakeDocumentCheck;
  let prisma: PrismaService;
  const orgs: Record<string, string> = {};
  const tokens: Record<string, string> = {};
  const ms: Record<string, string> = {};
  let driverId: string;
  let vehicleId: string;

  async function person(key: string, org: 'A' | 'B', roles: OrgRole[]) {
    const email = `${key}@${org}.test`.toLowerCase();
    const user = await prisma.user.create({ data: { email, name: `${key} person` } });
    const m = await prisma.membership.create({ data: { organizationId: orgs[org], userId: user.id, status: 'ACTIVE', roles: { create: roles.map((role) => ({ role })) } } });
    ms[key] = m.id;
    tokens[key] = (await signIn(app, messages, email)).accessToken;
  }
  const as = (key: string, org: 'A' | 'B') => ({ Authorization: `Bearer ${tokens[key]}`, 'x-org-id': orgs[org] });
  const upload = (fields: Record<string, string>, opts: { file?: Buffer; type?: string; back?: Buffer } = {}) => {
    let req = api(app).post('/api/v1/driver/documents').set(as('rahul', 'A'));
    for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
    const type = opts.type ?? 'image/png';
    req = req.attach('file', opts.file ?? png, { filename: type === 'application/pdf' ? 'doc.pdf' : 'doc.png', contentType: type });
    if (opts.back) req = req.attach('back', opts.back, { filename: 'back.png', contentType: 'image/png' });
    return req;
  };
  const licence = (extra: Record<string, string> = {}) => ({ kind: 'DRIVING_LICENSE', number: LICENCE, expiresAt: nextYear, dateOfBirth: '1992-04-15', vehicleClasses: 'LMV,MCWG', ...extra });
  const mine = async () => (await api(app).get('/api/v1/driver/profile').set(as('rahul', 'A')).expect(200)).body.data as { status: string; checklist: Step[]; documents: Doc[] };
  const step = async (key: string) => (await mine()).checklist.find((s) => s.key === key)!;
  const queueDoc = async (kind: string) => ((await api(app).get('/api/v1/admin/drivers').set(as('hrA', 'A'))).body.data[0].documents as Doc[]).find((d) => d.kind === kind)!;

  beforeAll(async () => {
    ({ app, messages, records, prisma } = await createApp());
    await resetDb(prisma);
    orgs.A = (await prisma.organization.create({ data: { licenses: { create: [{ product: 'SHARE' }] }, name: 'Company A', slug: 'a', emailDomains: ['a.test'], status: 'ACTIVE' } })).id;
    orgs.B = (await prisma.organization.create({ data: { licenses: { create: [{ product: 'SHARE' }] }, name: 'Company B', slug: 'b', emailDomains: ['b.test'], status: 'ACTIVE' } })).id;
    await person('hrA', 'A', ['HR_ADMIN']);
    await person('rahul', 'A', ['RIDER']);
    await person('hrB', 'B', ['HR_ADMIN']);
    // Sarathi says this licence only covers bikes (fixed later in the test); Vahan says the insurance has lapsed.
    records.licences.set(LICENCE, { name: 'RAHUL PERSON', validTill: nextYear, vehicleClasses: ['MCWG'] });
    records.vehicles.set(PLATE, { ownerName: 'Rahul Person', makerModel: 'HONDA CITY', registrationValidTill: nextYear, insuranceValidTill: '2020-01-01', insurer: 'Acko', insurancePolicyNumber: null });
  });
  afterAll(() => app.close());

  it('a rider starts a driver profile, adds a car and sees the checklist', async () => {
    const start = await api(app).post('/api/v1/driver/profile').set(as('rahul', 'A')).send({}).expect(201);
    expect(start.body.data.status).toBe('PENDING');
    expect(start.body.data.checklist.map((s: Step) => s.key)).toEqual(['PHOTO', 'LICENCE', 'VEHICLE', 'RC', 'INSURANCE', 'VEHICLE_PHOTOS', 'GUIDELINES']);
    expect(start.body.data.checklist.every((s: Step) => s.status === 'TODO')).toBe(true);
    driverId = start.body.data.id;
    const car = await api(app).post('/api/v1/driver/vehicles').set(as('rahul', 'A')).send({ type: 'CAR', make: 'Honda', model: 'City', color: 'White', plateNumber: 'ka 01  ab 1234', seatCapacity: 3 }).expect(201);
    expect(car.body.data.vehicles[0].plateNumber).toBe(PLATE);
    vehicleId = car.body.data.vehicles[0].id;
    expect(car.body.data.checklist.find((s: Step) => s.key === 'VEHICLE').status).toBe('DONE');
  });

  it('rejects a bike with more than one passenger seat and a duplicate plate', async () => {
    const bike = await api(app).post('/api/v1/driver/vehicles').set(as('rahul', 'A')).send({ type: 'BIKE', make: 'Honda', model: 'Activa', color: 'Black', plateNumber: 'KA 05 HX 9087', seatCapacity: 2 }).expect(400);
    expect(bike.body.error.fields.seatCapacity).toBeDefined();
    await api(app).post('/api/v1/driver/vehicles').set(as('rahul', 'A')).send({ type: 'CAR', make: 'Maruti', model: 'Swift', color: 'Red', plateNumber: PLATE, seatCapacity: 3 }).expect(409);
  });

  it('checks uploads: file type, expiry, both licence sides, date of birth, classes, vehicle, photo format', async () => {
    await upload(licence(), { file: Buffer.from('x'), type: 'text/plain', back: png }).expect(400);
    expect((await upload(licence({ expiresAt: '2020-01-01' }), { back: png }).expect(400)).body.error.fields.expiresAt).toBeDefined();
    expect((await upload(licence()).expect(400)).body.error.fields.back).toBeDefined();
    const { dateOfBirth: _d, ...noDob } = licence();
    expect((await upload(noDob, { back: png }).expect(400)).body.error.fields.dateOfBirth).toBeDefined();
    expect((await upload(licence({ vehicleClasses: 'TRUCK' }), { back: png }).expect(400)).body.error.fields.vehicleClasses).toBeDefined();
    expect((await upload({ kind: 'VEHICLE_RC', number: 'RC123456', expiresAt: nextYear }).expect(400)).body.error.fields.vehicleId).toBeDefined();
    expect((await upload({ kind: 'VEHICLE_INSURANCE', vehicleId, expiresAt: nextYear }).expect(400)).body.error.fields.number).toBeDefined();
    expect((await upload({ kind: 'VEHICLE_PHOTO_FRONT', vehicleId }, { file: pdf, type: 'application/pdf' }).expect(400)).body.error.fields.file).toBeDefined();
    expect((await upload({ kind: 'VEHICLE_INSURANCE', vehicleId, number: 'POL1234', expiresAt: nextYear }, { back: png }).expect(400)).body.error.fields.back).toBeDefined();
  });

  it('a licence that does not cover cars fails the government check and needs attention', async () => {
    const doc = (await upload(licence(), { back: png }).expect(201)).body.data as Doc;
    expect(doc.hasBack).toBe(true);
    expect(doc.check!.status).toBe('FAILED');
    expect(doc.check!.notes).toEqual(expect.arrayContaining(['✓ Name matches (RAHUL PERSON).', expect.stringMatching(/^✗ The licence does not cover cars/)]));
    expect(await step('LICENCE')).toMatchObject({ status: 'NEEDS_ATTENTION', cause: 'CHECK_FAILED' });
  });

  it('HR can run the check again; other companies and riders cannot', async () => {
    const doc = await queueDoc('DRIVING_LICENSE');
    await api(app).post(`/api/v1/admin/documents/${doc.id}/check`).set(as('hrB', 'B')).expect(404);
    await api(app).post(`/api/v1/admin/documents/${doc.id}/check`).set(as('rahul', 'A')).expect(403);
    records.down = true;
    expect((await api(app).post(`/api/v1/admin/documents/${doc.id}/check`).set(as('hrA', 'A')).expect(200)).body.data.check.status).toBe('UNAVAILABLE');
    records.down = false;
    records.licences.set(LICENCE, { name: 'RAHUL PERSON', validTill: nextYear, vehicleClasses: ['LMV', 'MCWG'] });
    expect((await api(app).post(`/api/v1/admin/documents/${doc.id}/check`).set(as('hrA', 'A')).expect(200)).body.data.check.status).toBe('PASSED');
    expect(await step('LICENCE')).toMatchObject({ status: 'IN_REVIEW' });
    expect(await prisma.auditLog.count({ where: { action: 'DOCUMENT_CHECKED', entityId: doc.id } })).toBe(2);
  });

  it('cannot verify until every step is done', async () => {
    const res = await api(app).post(`/api/v1/admin/drivers/${driverId}/verify`).set(as('hrA', 'A')).send({}).expect(409);
    for (const what of ['profile photo missing', 'vehicle RC missing', 'insurance missing', 'vehicle photos missing', 'guidelines not accepted']) expect(res.body.error.message).toContain(what);
  });

  it('RC passes, lapsed insurance fails, photos and guidelines complete the checklist', async () => {
    const rc = (await upload({ kind: 'VEHICLE_RC', number: 'RC123456', expiresAt: nextYear, vehicleId }, { file: pdf, type: 'application/pdf' }).expect(201)).body.data as Doc;
    expect(rc.check!.status).toBe('PASSED');
    const ins = (await upload({ kind: 'VEHICLE_INSURANCE', number: 'pol-778899', expiresAt: nextYear, vehicleId }, { file: pdf, type: 'application/pdf' }).expect(201)).body.data as Doc;
    expect(ins.check!.status).toBe('FAILED');
    expect(ins.check!.notes[0]).toMatch(/Insurance expired on 2020-01-01/);
    for (const kind of ['VEHICLE_PHOTO_FRONT', 'VEHICLE_PHOTO_SIDE']) await upload({ kind, vehicleId }).expect(201);
    expect(await step('VEHICLE_PHOTOS')).toMatchObject({ status: 'TODO', note: '1 still to add' });
    await upload({ kind: 'VEHICLE_PHOTO_INSIDE', vehicleId }).expect(201);
    expect(await step('VEHICLE_PHOTOS')).toMatchObject({ status: 'IN_REVIEW' });
    await api(app).post('/api/v1/driver/guidelines').set(as('rahul', 'A')).expect(200);
    await prisma.user.update({ where: { email: 'rahul@a.test' }, data: { photoKey: 'users/rahul.png' } });
    const done = await mine();
    expect(done.checklist.filter((s) => s.status === 'TODO')).toEqual([]);
    expect(await prisma.auditLog.count({ where: { action: 'DRIVER_GUIDELINES_ACCEPTED', entityId: driverId } })).toBe(1);
  });

  it('HR sees the driver in the queue with check results; other companies do not', async () => {
    const queue = (await api(app).get('/api/v1/admin/drivers?status=PENDING').set(as('hrA', 'A')).expect(200)).body.data;
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ id: driverId, name: 'rahul person', needsReview: true, hasPhoto: true });
    expect(queue[0].documents).toHaveLength(6);
    expect((await api(app).get('/api/v1/admin/drivers').set(as('hrB', 'B')).expect(200)).body.data).toHaveLength(0);
    await api(app).post(`/api/v1/admin/drivers/${driverId}/verify`).set(as('hrB', 'B')).send({}).expect(404);
  });

  it('document links are short-lived, include the back side, company-only and audited', async () => {
    const doc = await queueDoc('DRIVING_LICENSE');
    const res = await api(app).get(`/api/v1/admin/documents/${doc.id}/view-url`).set(as('hrA', 'A')).expect(200);
    expect(res.body.data.expiresInSeconds).toBe(120);
    expect(res.body.data.backUrl).toBeTruthy();
    await api(app).get(`/api/v1/admin/documents/${doc.id}/view-url`).set(as('hrB', 'B')).expect(404);
    await api(app).get(`/api/v1/admin/documents/${doc.id}/view-url`).set(as('rahul', 'A')).expect(403);
    expect(await prisma.auditLog.count({ where: { action: 'DOCUMENT_VIEWED', entityId: doc.id } })).toBe(1);
  });

  it('asking for a re-upload rejects the document, tells the driver and blocks verifying until a new upload', async () => {
    const lic = await queueDoc('DRIVING_LICENSE');
    const res = await api(app).post(`/api/v1/admin/drivers/${driverId}/request-reupload`).set(as('hrA', 'A')).send({ documentIds: [lic.id], reason: 'Photo is blurry' }).expect(200);
    expect(res.body.data.status).toBe('REJECTED');
    expect(messages.sent.some((m) => m.to === 'rahul@a.test' && /re-upload/.test(m.subject))).toBe(true);
    expect(await step('LICENCE')).toMatchObject({ status: 'NEEDS_ATTENTION', cause: 'REUPLOAD', note: 'HR asked for a new upload: Photo is blurry' });
    const blocked = await api(app).post(`/api/v1/admin/drivers/${driverId}/verify`).set(as('hrA', 'A')).send({ ignoreFailedChecks: true }).expect(409);
    expect(blocked.body.error.code).toBe('CONFLICT');
    await upload(licence(), { back: png }).expect(201);
    expect((await prisma.driverProfile.findUniqueOrThrow({ where: { id: driverId } })).status).toBe('PENDING');
  });

  it('a failed check needs an explicit "verify anyway", which is audited', async () => {
    const res = await api(app).post(`/api/v1/admin/drivers/${driverId}/verify`).set(as('hrA', 'A')).send({}).expect(409);
    expect(res.body.error.code).toBe('CHECK_FAILED');
    expect(res.body.error.message).toMatch(/vehicle insurance/);
    await api(app).post(`/api/v1/admin/drivers/${driverId}/verify`).set(as('hrA', 'A')).send({ ignoreFailedChecks: true }).expect(200);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'DRIVER_VERIFIED', entityId: driverId } });
    expect(log.after).toMatchObject({ status: 'VERIFIED', verifiedDespiteFailedChecks: ['VEHICLE_INSURANCE'] });
  });

  it('verifying approves the documents, grants the Driver role and emails them', async () => {
    const p = await prisma.driverProfile.findUniqueOrThrow({ where: { id: driverId }, include: { documents: true } });
    expect(p.status).toBe('VERIFIED');
    expect(await prisma.membershipRole.count({ where: { membershipId: ms.rahul, role: 'DRIVER' } })).toBe(1);
    expect((await api(app).get('/api/v1/admin/drivers?status=PENDING').set(as('hrA', 'A'))).body.data).toHaveLength(0);
    expect(messages.sent.some((m) => m.to === 'rahul@a.test' && /verified/.test(m.subject))).toBe(true);
  });

  it('an expired insurance stops a verified driver overnight', async () => {
    await prisma.document.updateMany({ where: { driverProfileId: driverId, kind: 'VEHICLE_INSURANCE' }, data: { expiresAt: new Date('2025-01-01') } });
    await app.get(DocumentExpiryService).run();
    expect((await prisma.driverProfile.findUniqueOrThrow({ where: { id: driverId } })).status).toBe('EXPIRED');
  });
});
