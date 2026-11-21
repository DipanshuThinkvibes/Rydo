import { INestApplication } from '@nestjs/common';
import { api, createApp, FakeMessages, resetDb } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { buildWorld, World } from './world';
import { runVehicleCheck } from '../src/drivers/vehicle-check';

const year = new Date().getFullYear();
const nextYear = `${year + 1}-06-30`;
const lastYear = `${year - 1}-06-30`;
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
const car = { type: 'CAR', make: 'Maruti', model: 'Swift', color: 'Red', plateNumber: 'KA 09 MJ 5521', seatCapacity: 3, manufactureYear: 2021, fuelType: 'PETROL' };
const PHOTOS = ['VEHICLE_PHOTO_FRONT', 'VEHICLE_PHOTO_SIDE', 'VEHICLE_PHOTO_INSIDE'];

/**
 * The seven-step "Become a driver" checklist (profile photo, licence, vehicle, RC, insurance, vehicle photos, safety guidelines).
 * The vehicle is checked FIRST; only when everything passes does the company HR hear about it.
 */
describe('Driver application', () => {
  let app: INestApplication;
  let messages: FakeMessages;
  let prisma: PrismaService;
  let w: World;
  let vehicleId: string;
  let driverId: string;

  const me = (k: string) => w.as(k);
  /** A paper (number and end date) with its front, and the back too when asked. */
  const upload = (k: string, f: Record<string, string>, opts: { back?: boolean; type?: string } = {}) => {
    let r = api(app).post('/api/v1/driver/documents').set(me(k));
    for (const [a, b] of Object.entries(f)) r = r.field(a, b);
    r = r.attach('file', png, { filename: 'front.png', contentType: opts.type ?? 'image/png' });
    return opts.back ? r.attach('fileBack', png, { filename: 'back.png', contentType: 'image/png' }) : r;
  };
  const licence = (k: string, over: Record<string, string> = {}, back = true) => upload(k, { kind: 'DRIVING_LICENSE', number: 'KA0120190001234', expiresAt: nextYear, ...over }, { back });
  const photo = (k: string, kind: string, vId = vehicleId) => api(app).post('/api/v1/driver/documents').set(me(k)).field('kind', kind).field('vehicleId', vId).attach('file', png, { filename: 'p.png', contentType: 'image/png' });
  const allPhotos = async (k: string, vId = vehicleId) => {
    for (const kind of PHOTOS) await photo(k, kind, vId).expect(201);
  };
  const apply = (k: string, body: object = {}) => api(app).post('/api/v1/driver/application').set(me(k)).send(body);
  const profile = async (k: string) => (await api(app).get('/api/v1/driver/profile').set(me(k)).expect(200)).body.data;
  const failedCodes = (checks: { passed: boolean; code: string }[]) => checks.filter((c) => !c.passed).map((c) => c.code);

  beforeAll(async () => {
    ({ app, messages, prisma } = await createApp());
    await resetDb(prisma);
    w = await buildWorld(app, messages, prisma, 'dap');
  });
  afterAll(() => app.close());

  it('starts as a draft with all seven steps still to do, and saves licence details as you go', async () => {
    const start = (await api(app).post('/api/v1/driver/profile').set(me('priya')).send({}).expect(201)).body.data;
    driverId = start.id;
    expect(start).toMatchObject({ status: 'PENDING', applicationStatus: 'DRAFT' });
    expect(start.readiness).toEqual({ photo: false, license: false, vehicle: false, rc: false, insurance: false, photos: false, guidelines: false, stepsDone: 0, stepsTotal: 7, canApply: false });
    const saved = (await api(app).patch('/api/v1/driver/profile').set(me('priya')).send({ details: { dateOfBirth: '1990-05-10', licenseClass: 'LMV' } }).expect(200)).body.data;
    expect(saved.details).toEqual({ dateOfBirth: '1990-05-10', licenseClass: 'LMV', drivingSince: null }); // driving-since is no longer asked
    expect(saved.readiness.license).toBe(false); // details alone are not the licence step: the photos are needed too
    await api(app).patch('/api/v1/driver/profile').set(me('priya')).send({ details: { dateOfBirth: '2015-01-01' } }).expect(400); // too young
    await api(app).patch('/api/v1/driver/profile').set(me('priya')).send({ details: { licenseClass: 'TRUCK' } }).expect(400);
  });

  it('HR does not see a half-finished application', async () => {
    expect((await api(app).get('/api/v1/admin/drivers').set(me('hr')).expect(200)).body.data).toHaveLength(0);
  });

  it('adds a vehicle with year and fuel, and refuses nonsense', async () => {
    const bad = await api(app).post('/api/v1/driver/vehicles').set(me('priya')).send({ ...car, manufactureYear: 1950 }).expect(400);
    expect(bad.body.error.fields.manufactureYear).toBeDefined();
    await api(app).post('/api/v1/driver/vehicles').set(me('priya')).send({ ...car, fuelType: 'STEAM' }).expect(400);
    const res = (await api(app).post('/api/v1/driver/vehicles').set(me('priya')).send(car).expect(201)).body.data;
    vehicleId = res.vehicles[0].id;
    expect(res.vehicles[0]).toMatchObject({ plateNumber: 'KA 09 MJ 5521', manufactureYear: 2021, fuelType: 'PETROL', checkStatus: 'PENDING' });
    expect(res.readiness.vehicle).toBe(true);
  });

  it('applying with steps missing runs the check, says exactly what to fix, and tells HR nothing', async () => {
    const mails = messages.sent.length;
    const res = (await apply('priya').expect(200)).body.data;
    expect(res).toMatchObject({ sentToHr: false, passed: false });
    expect(failedCodes(res.checks)).toEqual(expect.arrayContaining(['RC_PRESENT', 'INSURANCE_PRESENT', 'LICENSE_PRESENT', 'VEHICLE_PHOTOS', 'PROFILE_PHOTO', 'GUIDELINES']));
    expect(res.profile.applicationStatus).toBe('NEEDS_FIXES');
    expect(res.profile.vehicles[0].checkStatus).toBe('REJECTED');
    expect(await prisma.notification.count({ where: { type: 'DRIVER_APPLICATION' } })).toBe(0);
    expect(messages.sent.slice(mails).some((m) => m.to === w.emails.hr)).toBe(false);
    expect((await api(app).get('/api/v1/admin/drivers').set(me('hr')).expect(200)).body.data).toHaveLength(0);
  });

  it('step 7: the safety guidelines must be agreed', async () => {
    const no = await api(app).post('/api/v1/driver/guidelines').set(me('priya')).send({ agree: false }).expect(400);
    expect(no.body.error.fields.agree).toBeDefined();
    const res = (await api(app).post('/api/v1/driver/guidelines').set(me('priya')).send({ agree: true }).expect(200)).body.data;
    expect(res.readiness.guidelines).toBe(true);
    expect(await prisma.auditLog.count({ where: { action: 'DRIVER_GUIDELINES_ACCEPTED' } })).toBe(1);
    await api(app).post('/api/v1/driver/guidelines').set(me('arjun')).send({ agree: true }).expect(404); // arjun never started a driver profile
  });

  it('step 1: the profile photo counts as a step', async () => {
    expect((await profile('priya')).readiness.photo).toBe(false);
    await prisma.user.update({ where: { id: w.users.priya }, data: { photoKey: `users/${w.users.priya}/photo-test.png` } });
    expect((await profile('priya')).readiness.photo).toBe(true);
  });

  it('papers: file type, end date, and which vehicle a paper or photo is for', async () => {
    await upload('priya', { kind: 'DRIVING_LICENSE', number: 'KA0120190001234', expiresAt: nextYear }, { type: 'text/plain' }).expect(400);
    const noVehicle = await upload('priya', { kind: 'INSURANCE', number: 'POL-12345', expiresAt: nextYear }).expect(400);
    expect(noVehicle.body.error.fields.vehicleId).toBeDefined();
    await upload('priya', { kind: 'INSURANCE', number: 'POL-12345', expiresAt: lastYear, vehicleId }).expect(400); // already ended
    const noNumber = await upload('priya', { kind: 'DRIVING_LICENSE', expiresAt: nextYear }).expect(400);
    expect(noNumber.body.error.fields.number).toBeDefined();
    const photoNoVehicle = await api(app).post('/api/v1/driver/documents').set(me('priya')).field('kind', 'VEHICLE_PHOTO_FRONT').attach('file', png, { filename: 'p.png', contentType: 'image/png' }).expect(400);
    expect(photoNoVehicle.body.error.fields.vehicleId).toBeDefined();
  });

  it('step 2: the licence takes both sides, and the back counts', async () => {
    const front = (await licence('priya', {}, false).expect(201)).body.data;
    expect(front).toMatchObject({ kind: 'DRIVING_LICENSE', hasBack: false });
    expect((await profile('priya')).readiness.license).toBe(false); // the back side is still missing
    const both = (await licence('priya').expect(201)).body.data;
    expect(both.hasBack).toBe(true);
    expect((await profile('priya')).readiness.license).toBe(true);
  });

  it('step 6: the three vehicle photos need a vehicle but no number or date', async () => {
    const one = (await photo('priya', 'VEHICLE_PHOTO_FRONT').expect(201)).body.data;
    expect(one).toMatchObject({ kind: 'VEHICLE_PHOTO_FRONT', number: null, expiresAt: null, vehicleId });
    expect((await profile('priya')).readiness.photos).toBe(false);
    await photo('priya', 'VEHICLE_PHOTO_SIDE').expect(201);
    await photo('priya', 'VEHICLE_PHOTO_INSIDE').expect(201);
    expect((await profile('priya')).readiness.photos).toBe(true);
  });

  it('a wrong RC number is caught by the vehicle check: it must match the plate', async () => {
    await upload('priya', { kind: 'VEHICLE_RC', number: 'RC-KA01ZZ0001', expiresAt: nextYear, vehicleId }).expect(201);
    await upload('priya', { kind: 'INSURANCE', number: 'POL-12345', expiresAt: nextYear, vehicleId }).expect(201);
    const res = (await apply('priya').expect(200)).body.data;
    expect(res.sentToHr).toBe(false);
    const rc = res.checks.find((c: { code: string }) => c.code === 'RC_MATCH');
    expect(rc).toMatchObject({ passed: false });
    expect(rc.detail).toContain('KA 09 MJ 5521');
    expect(res.vehiclePassed).toBe(false);
  });

  it('a licence class that cannot drive this vehicle is caught', async () => {
    await upload('priya', { kind: 'VEHICLE_RC', number: 'RC-KA09MJ5521', expiresAt: nextYear, vehicleId }, { back: true }).expect(201); // a smart-card RC has a back too
    await api(app).patch('/api/v1/driver/profile').set(me('priya')).send({ details: { licenseClass: 'MCWG' } }).expect(200);
    const res = (await apply('priya').expect(200)).body.data;
    expect(res.sentToHr).toBe(false);
    expect(res.checks.find((c: { code: string }) => c.code === 'LICENSE_CLASS')).toMatchObject({ passed: false, group: 'DRIVER' });
    expect(res.vehiclePassed).toBe(true); // the vehicle itself is fine; the driver details are not
    await api(app).patch('/api/v1/driver/profile').set(me('priya')).send({ details: { licenseClass: 'LMV' } }).expect(200);
  });

  it('when all seven steps are done the vehicle is verified FIRST, then HR is asked, and the driver is told', async () => {
    expect((await profile('priya')).readiness).toMatchObject({ stepsDone: 7, canApply: true });
    const mails = messages.sent.length;
    const res = (await apply('priya').expect(200)).body.data;
    expect(res).toMatchObject({ sentToHr: true, passed: true, vehiclePassed: true });
    expect(res.checks.every((c: { passed: boolean }) => c.passed)).toBe(true);
    expect(res.profile).toMatchObject({ status: 'PENDING', applicationStatus: 'WITH_HR' });
    expect(res.profile.vehicles[0].checkStatus).toBe('VERIFIED');
    expect(res.profile.submittedAt).toBeTruthy();

    const asked = await prisma.notification.findMany({ where: { type: 'DRIVER_APPLICATION' } });
    expect(asked.map((n) => n.userId)).toEqual([w.users.hr]);
    expect(asked[0].title).toBe('priya person applied to be a driver');
    expect(asked[0].body).toContain('KA 09 MJ 5521');
    expect(messages.sent.slice(mails).some((m) => m.to === w.emails.hr && /applied to be a driver/.test(m.subject))).toBe(true);
    expect(messages.sent.slice(mails).some((m) => m.to === w.emails.priya && /vehicle is verified/i.test(m.subject))).toBe(true);
    expect(await prisma.auditLog.count({ where: { action: 'DRIVER_APPLIED' } })).toBe(1);
  });

  it('HR sees the application: check results, licence class, age (not the birth date), both sides and the photos', async () => {
    const list = (await api(app).get('/api/v1/admin/drivers?status=PENDING').set(me('hr')).expect(200)).body.data;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: driverId, applicationStatus: 'WITH_HR', needsReview: true });
    expect(list[0].details).toMatchObject({ licenseClass: 'LMV' });
    expect(list[0].details.age).toBeGreaterThanOrEqual(35);
    expect(JSON.stringify(list[0])).not.toContain('1990-05-10');
    expect(list[0].vehicles[0]).toMatchObject({ checkStatus: 'VERIFIED', manufactureYear: 2021, fuelType: 'PETROL' });
    expect(list[0].vehicles[0].checks.length).toBeGreaterThan(8);
    expect(list[0].documents.map((d: { kind: string }) => d.kind).sort()).toEqual(['DRIVING_LICENSE', 'INSURANCE', 'VEHICLE_PHOTO_FRONT', 'VEHICLE_PHOTO_INSIDE', 'VEHICLE_PHOTO_SIDE', 'VEHICLE_RC']);
    expect((await api(app).get('/api/v1/admin/drivers').set(w.as('outsider', w.other)).expect(200)).body.data).toHaveLength(0);
    // the back of a two-sided paper has its own short-lived link; a one-sided paper has none
    const lic = list[0].documents.find((d: { kind: string }) => d.kind === 'DRIVING_LICENSE');
    expect(lic.hasBack).toBe(true);
    const front = (await api(app).get(`/api/v1/admin/documents/${lic.id}/view-url`).set(me('hr')).expect(200)).body.data;
    const back = (await api(app).get(`/api/v1/admin/documents/${lic.id}/view-url?side=back`).set(me('hr')).expect(200)).body.data;
    expect(back.url).not.toBe(front.url);
    const ins = list[0].documents.find((d: { kind: string }) => d.kind === 'INSURANCE');
    await api(app).get(`/api/v1/admin/documents/${ins.id}/view-url?side=back`).set(me('hr')).expect(404);
  });

  it('cannot apply twice while with HR, and cannot publish a ride before being verified', async () => {
    const again = await apply('priya').expect(409);
    expect(again.body.error.message).toMatch(/already with HR/);
    await api(app).post('/api/v1/ride-plans').set(me('priya')).send({ vehicleId }).expect((r) => expect([400, 403]).toContain(r.status));
  });

  it('HR will not approve until the vehicle has passed, and approving makes the person a driver', async () => {
    await prisma.vehicle.update({ where: { id: vehicleId }, data: { checkStatus: 'REJECTED' } });
    const blocked = await api(app).post(`/api/v1/admin/drivers/${driverId}/verify`).set(me('hr')).expect(409);
    expect(blocked.body.error.message).toMatch(/vehicle has not passed the vehicle check/);
    await prisma.vehicle.update({ where: { id: vehicleId }, data: { checkStatus: 'VERIFIED' } });
    await api(app).post(`/api/v1/admin/drivers/${driverId}/verify`).set(me('hr')).expect(200);
    expect((await profile('priya')).status).toBe('VERIFIED');
    expect(await prisma.membershipRole.count({ where: { membershipId: w.ms.priya, role: 'DRIVER' } })).toBe(1);
  });

  it('a second vehicle must pass its own check (papers and photos) before it can be used for a ride', async () => {
    const res = (await api(app).post('/api/v1/driver/vehicles').set(me('priya')).send({ type: 'BIKE', make: 'Honda', model: 'Activa', color: 'Black', plateNumber: 'KA 05 HX 9087', seatCapacity: 1, isDefault: false }).expect(201)).body.data;
    const bikeId = res.vehicles.find((v: { type: string }) => v.type === 'BIKE').id;
    const check = (await api(app).post(`/api/v1/driver/vehicles/${bikeId}/check`).set(me('priya')).expect(200)).body.data;
    expect(check.vehiclePassed).toBe(false); // no RC, insurance or photos yet
    expect(failedCodes(check.checks)).toEqual(expect.arrayContaining(['RC_PRESENT', 'INSURANCE_PRESENT', 'VEHICLE_PHOTOS']));
    await upload('priya', { kind: 'VEHICLE_RC', number: 'RC-KA05HX9087', expiresAt: nextYear, vehicleId: bikeId }).expect(201);
    await upload('priya', { kind: 'INSURANCE', number: 'POL-BIKE-1', expiresAt: nextYear, vehicleId: bikeId }).expect(201);
    const stillNo = (await api(app).post(`/api/v1/driver/vehicles/${bikeId}/check`).set(me('priya')).expect(200)).body.data;
    expect(failedCodes(stillNo.checks)).toContain('VEHICLE_PHOTOS');
    await allPhotos('priya', bikeId);
    // priya's licence is LMV (a car), so a bike is refused for the licence class, not for the vehicle
    const ok = (await api(app).post(`/api/v1/driver/vehicles/${bikeId}/check`).set(me('priya')).expect(200)).body.data;
    expect(ok.vehiclePassed).toBe(true);
    expect(failedCodes(ok.checks)).toEqual(['LICENSE_CLASS']);
    expect(ok.profile.vehicles.find((v: { id: string }) => v.id === bikeId).checkStatus).toBe('VERIFIED');
    await api(app).post(`/api/v1/driver/vehicles/${bikeId}/check`).set(me('arjun')).expect(404); // not arjun's vehicle
  });

  it('changing the plate sends a vehicle back to be checked; changing the colour does not', async () => {
    expect((await profile('priya')).vehicles.find((v: { id: string }) => v.id === vehicleId).checkStatus).toBe('VERIFIED');
    await api(app).patch(`/api/v1/driver/vehicles/${vehicleId}`).set(me('priya')).send({ ...car, color: 'Blue' }).expect(200);
    expect((await profile('priya')).vehicles.find((v: { id: string }) => v.id === vehicleId)).toMatchObject({ color: 'Blue', checkStatus: 'VERIFIED' });
    await api(app).patch(`/api/v1/driver/vehicles/${vehicleId}`).set(me('priya')).send({ ...car, plateNumber: 'KA 09 MJ 7777' }).expect(200);
    expect((await profile('priya')).vehicles.find((v: { id: string }) => v.id === vehicleId).checkStatus).toBe('PENDING');
  });

  it('a verified driver who renews a paper is checked again and stays verified', async () => {
    await prisma.vehicle.update({ where: { id: vehicleId }, data: { plateNumber: 'KA 09 MJ 5521' } });
    await upload('priya', { kind: 'INSURANCE', number: 'POL-NEW', expiresAt: nextYear, vehicleId }).expect(201);
    expect((await profile('priya')).vehicles.find((v: { id: string }) => v.id === vehicleId).checkStatus).toBe('VERIFIED');
  });

  describe('the vehicle check itself', () => {
    const good = {
      vehicle: { type: 'CAR' as const, plateNumber: 'KA 01 AB 1234', seatCapacity: 3, manufactureYear: 2020 },
      rc: { number: 'RC-KA01AB1234', expiresAt: new Date(Date.now() + 400 * 86_400_000) },
      insurance: { number: 'P1', expiresAt: new Date(Date.now() + 200 * 86_400_000) },
      license: { number: 'DL1', expiresAt: new Date(Date.now() + 900 * 86_400_000) },
      licenseBack: true,
      photos: { front: true, side: true, inside: true },
      profilePhoto: true,
      guidelines: true,
      driver: { dateOfBirth: new Date('1990-05-10'), licenseClass: 'LMV', drivingSince: 2012 as number | null },
    };
    it('passes when everything is in order, including a BH-series plate', () => {
      expect(runVehicleCheck(good).passed).toBe(true);
      const bh = runVehicleCheck({ ...good, vehicle: { ...good.vehicle, plateNumber: '22 BH 1234 AA' }, rc: { ...good.rc, number: '22BH1234AA' } });
      expect(bh.checks.find((c) => c.code === 'PLATE_FORMAT')?.passed).toBe(true);
    });
    it('does not need the driving-since year', () => {
      const out = runVehicleCheck({ ...good, driver: { ...good.driver, drivingSince: null } });
      expect(out.passed).toBe(true);
      expect(out.checks.some((c) => c.code === 'EXPERIENCE')).toBe(false);
    });
    it.each([
      ['a bad plate', { vehicle: { ...good.vehicle, plateNumber: 'HELLO 1' } }, 'PLATE_FORMAT'],
      ['an expired RC', { rc: { ...good.rc, expiresAt: new Date(Date.now() - 86_400_000 * 2) } }, 'RC_VALID'],
      ['an expired insurance', { insurance: { ...good.insurance, expiresAt: new Date(Date.now() - 86_400_000 * 2) } }, 'INSURANCE_VALID'],
      ['no insurance', { insurance: undefined }, 'INSURANCE_PRESENT'],
      ['an expired licence', { license: { ...good.license, expiresAt: new Date(Date.now() - 86_400_000 * 2) } }, 'LICENSE_VALID'],
      ['only the front of the licence', { licenseBack: false }, 'LICENSE_BACK'],
      ['a bike licence on a car', { driver: { ...good.driver, licenseClass: 'MCWG' } }, 'LICENSE_CLASS'],
      ['a driver who is too young', { driver: { ...good.driver, dateOfBirth: new Date(Date.now() - 10 * 365 * 86_400_000) } }, 'AGE'],
      ['driving since before turning 18', { driver: { ...good.driver, drivingSince: 1995 } }, 'EXPERIENCE'],
      ['four seats on a bike', { vehicle: { ...good.vehicle, type: 'BIKE' as const, seatCapacity: 4 }, driver: { ...good.driver, licenseClass: 'MCWG' } }, 'SEATS'],
      ['a missing vehicle photo', { photos: { front: true, side: false, inside: true } }, 'VEHICLE_PHOTOS'],
      ['no profile photo', { profilePhoto: false }, 'PROFILE_PHOTO'],
      ['guidelines not agreed', { guidelines: false }, 'GUIDELINES'],
    ])('fails %s', (_name, over, code) => {
      const out = runVehicleCheck({ ...good, ...over });
      expect(out.passed).toBe(false);
      expect(out.checks.find((c) => c.code === code)?.passed).toBe(false);
    });
    it('names which vehicle photo is missing', () => {
      const out = runVehicleCheck({ ...good, photos: { front: false, side: true, inside: false } });
      expect(out.checks.find((c) => c.code === 'VEHICLE_PHOTOS')?.detail).toContain('front, inside');
    });
    it('an RC that ends today is still in date, and the plate may be written without spaces', () => {
      const out = runVehicleCheck({ ...good, rc: { ...good.rc, expiresAt: new Date() }, vehicle: { ...good.vehicle, plateNumber: 'KA01AB1234' } });
      expect(out.checks.find((c) => c.code === 'RC_VALID')?.passed).toBe(true);
      expect(out.passed).toBe(true);
    });
  });
});
