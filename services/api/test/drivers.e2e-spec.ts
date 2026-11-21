import { INestApplication } from '@nestjs/common';
import { OrgRole } from '@prisma/client';
import { api, createApp, FakeMessages, resetDb, signIn } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

const nextYear = `${new Date().getFullYear() + 1}-06-30`;
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);

/** Phase 2: a rider becomes a driver, uploads documents, HR verifies. */
describe('Driver verification', () => {
  let app: INestApplication;
  let messages: FakeMessages;
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
  const upload = (key: string, fields: Record<string, string>, file = png, type = 'image/png') => {
    let req = api(app).post('/api/v1/driver/documents').set(as(key, 'A'));
    for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
    return req.attach('file', file, { filename: type === 'application/pdf' ? 'doc.pdf' : 'doc.png', contentType: type });
  };

  beforeAll(async () => {
    ({ app, messages, prisma } = await createApp());
    await resetDb(prisma);
    orgs.A = (await prisma.organization.create({ data: { licenses: { create: [{ product: 'SHARE' }] }, name: 'Company A', slug: 'a', emailDomains: ['a.test'], status: 'ACTIVE' } })).id;
    orgs.B = (await prisma.organization.create({ data: { licenses: { create: [{ product: 'SHARE' }] }, name: 'Company B', slug: 'b', emailDomains: ['b.test'], status: 'ACTIVE' } })).id;
    await person('hrA', 'A', ['HR_ADMIN']);
    await person('rahul', 'A', ['RIDER']);
    await person('hrB', 'B', ['HR_ADMIN']);
  });
  afterAll(() => app.close());

  it('a rider starts a driver profile and adds a car', async () => {
    const start = await api(app).post('/api/v1/driver/profile').set(as('rahul', 'A')).send({}).expect(201);
    expect(start.body.data.status).toBe('PENDING');
    driverId = start.body.data.id;
    const car = await api(app).post('/api/v1/driver/vehicles').set(as('rahul', 'A')).send({ type: 'CAR', make: 'Honda', model: 'City', color: 'White', plateNumber: 'ka 01  ab 1234', seatCapacity: 3 }).expect(201);
    expect(car.body.data.vehicles[0].plateNumber).toBe('KA 01 AB 1234');
    vehicleId = car.body.data.vehicles[0].id;
  });

  it('rejects a bike with more than one passenger seat and a duplicate plate', async () => {
    const bike = await api(app).post('/api/v1/driver/vehicles').set(as('rahul', 'A')).send({ type: 'BIKE', make: 'Honda', model: 'Activa', color: 'Black', plateNumber: 'KA 05 HX 9087', seatCapacity: 2 }).expect(400);
    expect(bike.body.error.fields.seatCapacity).toBeDefined();
    await api(app).post('/api/v1/driver/vehicles').set(as('rahul', 'A')).send({ type: 'CAR', make: 'Maruti', model: 'Swift', color: 'Red', plateNumber: 'KA 01 AB 1234', seatCapacity: 3 }).expect(409);
  });

  it('checks uploads: file type, expiry and which vehicle an RC is for', async () => {
    await upload('rahul', { kind: 'DRIVING_LICENSE', number: 'KA0120190001234', expiresAt: nextYear }, Buffer.from('x'), 'text/plain').expect(400);
    const old = await upload('rahul', { kind: 'DRIVING_LICENSE', number: 'KA0120190001234', expiresAt: '2020-01-01' }).expect(400);
    expect(old.body.error.fields.expiresAt).toBeDefined();
    const noVehicle = await upload('rahul', { kind: 'VEHICLE_RC', number: 'RC123456', expiresAt: nextYear }).expect(400);
    expect(noVehicle.body.error.fields.vehicleId).toBeDefined();
  });

  it('cannot verify until both documents are in', async () => {
    await upload('rahul', { kind: 'DRIVING_LICENSE', number: 'KA0120190001234', expiresAt: nextYear }).expect(201);
    const res = await api(app).post(`/api/v1/admin/drivers/${driverId}/verify`).set(as('hrA', 'A')).expect(409);
    expect(res.body.error.message).toMatch(/RC missing/);
  });

  it('HR sees the driver in the review queue; other companies do not', async () => {
    await upload('rahul', { kind: 'VEHICLE_RC', number: 'RC-KA01AB1234', expiresAt: nextYear, vehicleId }, Buffer.from('%PDF-1.4'), 'application/pdf').expect(201);
    await upload('rahul', { kind: 'INSURANCE', number: 'POL-998877', expiresAt: nextYear, vehicleId }).expect(201);
    // the rest of the checklist: profile photo, both sides of the licence, three vehicle photos, safety guidelines
    const rahulUser = await prisma.membership.findUniqueOrThrow({ where: { id: ms.rahul } });
    await prisma.user.update({ where: { id: rahulUser.userId }, data: { photoKey: 'users/rahul/photo.png' } });
    await api(app).post('/api/v1/driver/guidelines').set(as('rahul', 'A')).send({ agree: true }).expect(200);
    for (const kind of ['VEHICLE_PHOTO_FRONT', 'VEHICLE_PHOTO_SIDE', 'VEHICLE_PHOTO_INSIDE']) {
      await api(app).post('/api/v1/driver/documents').set(as('rahul', 'A')).field('kind', kind).field('vehicleId', vehicleId).attach('file', png, { filename: 'p.png', contentType: 'image/png' }).expect(201);
    }
    await api(app).patch('/api/v1/driver/profile').set(as('rahul', 'A')).send({ details: { dateOfBirth: '1990-05-10', licenseClass: 'LMV' } }).expect(200);
    await api(app).post('/api/v1/driver/documents').set(as('rahul', 'A')).field('kind', 'DRIVING_LICENSE').field('number', 'KA0120190001234').field('expiresAt', nextYear).attach('file', png, { filename: 'f.png', contentType: 'image/png' }).attach('fileBack', png, { filename: 'b.png', contentType: 'image/png' }).expect(201);
    // HR hears nothing until the driver applies and the vehicle check passes
    expect((await api(app).get('/api/v1/admin/drivers?status=PENDING').set(as('hrA', 'A')).expect(200)).body.data).toHaveLength(0);
    await api(app).post('/api/v1/driver/application').set(as('rahul', 'A')).send({ dateOfBirth: '1990-05-10', licenseClass: 'LMV', drivingSince: 2012, declaration: true }).expect(200);
    const queue = (await api(app).get('/api/v1/admin/drivers?status=PENDING').set(as('hrA', 'A')).expect(200)).body.data;
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ id: driverId, name: 'rahul person', needsReview: true });
    expect(queue[0].documents).toHaveLength(6);
    expect(queue[0].vehicles[0]).toMatchObject({ checkStatus: 'VERIFIED' });
    expect((await api(app).get('/api/v1/admin/drivers').set(as('hrB', 'B')).expect(200)).body.data).toHaveLength(0);
    await api(app).post(`/api/v1/admin/drivers/${driverId}/verify`).set(as('hrB', 'B')).expect(404);
  });

  it('document links are short-lived, company-only and audited', async () => {
    const doc = (await api(app).get('/api/v1/admin/drivers').set(as('hrA', 'A'))).body.data[0].documents[0];
    const res = await api(app).get(`/api/v1/admin/documents/${doc.id}/view-url`).set(as('hrA', 'A')).expect(200);
    expect(res.body.data.expiresInSeconds).toBe(120);
    await api(app).get(`/api/v1/admin/documents/${doc.id}/view-url`).set(as('hrB', 'B')).expect(404);
    await api(app).get(`/api/v1/admin/documents/${doc.id}/view-url`).set(as('rahul', 'A')).expect(403);
    expect(await prisma.auditLog.count({ where: { action: 'DOCUMENT_VIEWED', entityId: doc.id } })).toBe(1);
  });

  it('asking for a re-upload rejects the document, tells the driver and returns them to the queue on upload', async () => {
    const lic = (await api(app).get('/api/v1/admin/drivers').set(as('hrA', 'A'))).body.data[0].documents.find((d: { kind: string }) => d.kind === 'DRIVING_LICENSE');
    const res = await api(app).post(`/api/v1/admin/drivers/${driverId}/request-reupload`).set(as('hrA', 'A')).send({ documentIds: [lic.id], reason: 'Photo is blurry' }).expect(200);
    expect(res.body.data.status).toBe('REJECTED');
    expect(messages.sent.some((m) => m.to === 'rahul@a.test' && /re-upload/.test(m.subject))).toBe(true);
    const mine = (await api(app).get('/api/v1/driver/profile').set(as('rahul', 'A')).expect(200)).body.data;
    expect(mine.documents.find((d: { kind: string }) => d.kind === 'DRIVING_LICENSE')).toMatchObject({ status: 'REJECTED', rejectReason: 'Photo is blurry' });
    await upload('rahul', { kind: 'DRIVING_LICENSE', number: 'KA0120190001234', expiresAt: nextYear }).expect(201);
    expect((await prisma.driverProfile.findUniqueOrThrow({ where: { id: driverId } })).status).toBe('PENDING');
  });

  it('verifying approves the documents, grants the Driver role and emails them', async () => {
    await api(app).post(`/api/v1/admin/drivers/${driverId}/verify`).set(as('hrA', 'A')).expect(200);
    const p = await prisma.driverProfile.findUniqueOrThrow({ where: { id: driverId }, include: { documents: true } });
    expect(p.status).toBe('VERIFIED');
    expect(await prisma.membershipRole.count({ where: { membershipId: ms.rahul, role: 'DRIVER' } })).toBe(1);
    const queue = (await api(app).get('/api/v1/admin/drivers?status=PENDING').set(as('hrA', 'A'))).body.data;
    expect(queue).toHaveLength(0);
    expect(messages.sent.some((m) => m.to === 'rahul@a.test' && /verified/.test(m.subject))).toBe(true);
  });
});