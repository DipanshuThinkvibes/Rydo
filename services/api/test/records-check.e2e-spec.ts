import { INestApplication } from '@nestjs/common';
import { api, createApp, FakeDocumentCheck, FakeMessages, resetDb } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { buildWorld, World } from './world';

const year = new Date().getFullYear();
const nextYear = `${year + 1}-06-30`;
const inYears = (n: number) => `${year + n}-03-01`;
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
const LICENCE_NO = 'KA0120190007788';
const PLATE = 'KA 05 RC 4411';

/**
 * Licence, RC and insurance are looked up in government records (Sarathi / Vahan) through the DOCUMENT_CHECK adapter
 * after each upload. HR sees the notes; a FAILED check blocks "Verify" until HR says "verify anyway".
 */
describe('Government records check on driver papers', () => {
  let app: INestApplication;
  let messages: FakeMessages;
  let records: FakeDocumentCheck;
  let prisma: PrismaService;
  let w: World;
  let driverId: string;
  let vehicleId: string;
  let licenceId: string;
  let rcId: string;

  const me = (k: string, orgId?: string) => w.as(k, orgId);
  const upload = (f: Record<string, string>, back = false) => {
    let r = api(app).post('/api/v1/driver/documents').set(me('kiran'));
    for (const [a, b] of Object.entries(f)) r = r.field(a, b);
    r = r.attach('file', png, { filename: 'front.png', contentType: 'image/png' });
    return back ? r.attach('fileBack', png, { filename: 'back.png', contentType: 'image/png' }) : r;
  };
  const profile = async () => (await api(app).get('/api/v1/driver/profile').set(me('kiran')).expect(200)).body.data;

  beforeAll(async () => {
    ({ app, messages, records, prisma } = await createApp());
    await resetDb(prisma);
    w = await buildWorld(app, messages, prisma, 'rec');
    records.on = true;
    records.licences.set(LICENCE_NO, { name: 'KIRAN PERSON', validTill: inYears(8), vehicleClasses: ['LMV'] });
    records.vehicles.set(PLATE, { ownerName: 'Kiran Person', makerModel: 'HONDA AMAZE', registrationValidTill: inYears(10), insuranceValidTill: inYears(1), insurer: 'Demo Insurance', insurancePolicyNumber: null });

    driverId = (await api(app).post('/api/v1/driver/profile').set(me('kiran')).send({ details: { dateOfBirth: '1991-02-03', licenseClass: 'LMV' } }).expect(201)).body.data.id;
    const v = (await api(app).post('/api/v1/driver/vehicles').set(me('kiran')).send({ type: 'CAR', carType: 'COMPACT_SUV', make: 'Honda', model: 'Amaze', color: 'Grey', plateNumber: PLATE, seatCapacity: 3 }).expect(201)).body.data;
    vehicleId = v.vehicles[0].id;
    expect(v.vehicles[0].carType).toBe('COMPACT_SUV'); // one of the 7 body types
  });
  afterAll(() => app.close());

  it('checks the licence after upload and shows the result on the document and the checklist', async () => {
    const doc = (await upload({ kind: 'DRIVING_LICENSE', number: LICENCE_NO, expiresAt: nextYear }, true).expect(201)).body.data;
    licenceId = doc.id;
    expect(doc.check.status).toBe('WARNING'); // found and in date, but the typed valid-till differs from the record
    expect(doc.check.notes).toEqual(expect.arrayContaining(['✓ Licence found in government records (Sarathi).', '✓ Name matches (KIRAN PERSON).']));
    const p = await profile();
    expect(p.checklist.find((s: { key: string }) => s.key === 'LICENCE')).toMatchObject({ status: 'IN_REVIEW' });
  });

  it('a vehicle that is not in government records fails the RC check and the step needs attention', async () => {
    records.vehicles.delete(PLATE);
    const doc = (await upload({ kind: 'VEHICLE_RC', number: 'KA05RC4411', expiresAt: nextYear, vehicleId }).expect(201)).body.data;
    rcId = doc.id;
    expect(doc.check).toMatchObject({ status: 'FAILED', notes: [`✗ No vehicle ${PLATE} in government records (Vahan).`] });
    const step = (await profile()).checklist.find((s: { key: string }) => s.key === 'RC');
    expect(step).toMatchObject({ status: 'NEEDS_ATTENTION', cause: 'CHECK_FAILED' });
  });

  it('photos are not looked up, and an unavailable provider never counts as a failure', async () => {
    const photo = (await api(app).post('/api/v1/driver/documents').set(me('kiran')).field('kind', 'VEHICLE_PHOTO_FRONT').field('vehicleId', vehicleId).attach('file', png, { filename: 'p.png', contentType: 'image/png' }).expect(201)).body.data;
    expect(photo.check).toBeNull();
    records.down = true;
    const ins = (await upload({ kind: 'INSURANCE', number: 'POL-7788', expiresAt: nextYear, vehicleId }).expect(201)).body.data;
    expect(ins.check.status).toBe('UNAVAILABLE');
    records.down = false;
  });

  it('HR can run a check again; photos and other companies cannot be checked', async () => {
    records.vehicles.set(PLATE, { ownerName: 'Kiran Person', makerModel: null, registrationValidTill: inYears(10), insuranceValidTill: inYears(1), insurer: null, insurancePolicyNumber: null });
    const again = (await api(app).post(`/api/v1/admin/documents/${rcId}/check`).set(me('hr')).expect(200)).body.data;
    expect(again.check.status).not.toBe('FAILED');
    const photoId = (await prisma.document.findFirstOrThrow({ where: { driverProfileId: driverId, kind: 'VEHICLE_PHOTO_FRONT' } })).id;
    await api(app).post(`/api/v1/admin/documents/${photoId}/check`).set(me('hr')).expect(400);
    await api(app).post(`/api/v1/admin/documents/${rcId}/check`).set(me('outsider', w.other)).expect(404); // company wall
    await api(app).post(`/api/v1/admin/documents/${rcId}/check`).set(me('priya')).expect(403); // riders are not HR
  });

  it('a FAILED check blocks Verify until HR verifies anyway, and that is audited', async () => {
    await prisma.document.update({ where: { id: rcId }, data: { checkStatus: 'FAILED' } });
    await prisma.vehicle.update({ where: { id: vehicleId }, data: { checkStatus: 'VERIFIED' } });
    await prisma.driverProfile.update({ where: { id: driverId }, data: { applicationStatus: 'WITH_HR' } });
    const listed = (await api(app).get('/api/v1/admin/drivers').set(me('hr')).expect(200)).body.data.find((d: { id: string }) => d.id === driverId);
    expect(listed.checklist).toHaveLength(7);
    expect(listed.vehicles[0].carType).toBe('COMPACT_SUV');

    const blocked = await api(app).post(`/api/v1/admin/drivers/${driverId}/verify`).set(me('hr')).send({}).expect(409);
    expect(blocked.body.error.code).toBe('CHECK_FAILED');
    await api(app).post(`/api/v1/admin/drivers/${driverId}/verify`).set(me('hr')).send({ ignoreFailedChecks: true }).expect(200);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'DRIVER_VERIFIED', entityId: driverId } });
    expect(log.after).toMatchObject({ verifiedDespiteFailedChecks: ['VEHICLE_RC'] });
    expect(licenceId).toBeDefined();
  });
});
