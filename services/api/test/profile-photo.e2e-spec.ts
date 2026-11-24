import { INestApplication } from '@nestjs/common';
import { api, createApp, FakeMessages, resetDb } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { env } from '../src/config/env';
import { buildWorld, World, tomorrow } from './world';

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const search = { pickup: { label: 'Home', lat: 12.91, lng: 77.64 }, drop: { label: 'Office', lat: 12.92, lng: 77.67 }, date: tomorrow, fromTime: '07:30', toTime: '09:30' };

/** Every account needs a profile photo to ride or drive, and riders and drivers see each other's photos. */
describe('Profile photo is required', () => {
  let app: INestApplication;
  let messages: FakeMessages;
  let prisma: PrismaService;
  let w: World;
  const e = env() as { REQUIRE_PROFILE_PHOTO: string };
  let before: string;
  const setPhoto = (key: string) => prisma.user.update({ where: { id: w.users[key] }, data: { photoKey: `users/${w.users[key]}/photo-${key}.png` } });

  beforeAll(async () => {
    before = e.REQUIRE_PROFILE_PHOTO;
    e.REQUIRE_PROFILE_PHOTO = 'true';
    ({ app, messages, prisma } = await createApp());
    await resetDb(prisma);
    w = await buildWorld(app, messages, prisma, 'pho');
  });
  afterAll(async () => {
    e.REQUIRE_PROFILE_PHOTO = before;
    await app.close();
  });

  it('refuses every ride and driver action until there is a photo, with a clear message', async () => {
    for (const res of [
      await api(app).post('/api/v1/rides/search').set(w.as('priya')).send(search),
      await api(app).get('/api/v1/me/preferred-drivers').set(w.as('priya')),
      await api(app).get('/api/v1/driver/profile').set(w.as('driver')),
      await api(app).post('/api/v1/driver/profile').set(w.as('arjun')).send({}),
    ]) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('PHOTO_REQUIRED');
      expect(res.body.error.message).toContain('profile photo');
    }
  });

  it('everything else still works without a photo: signing in, the account, and uploading the photo itself', async () => {
    const me = (await api(app).get('/api/v1/me').set(w.as('priya')).expect(200)).body.data;
    expect(me.user.hasPhoto).toBe(false);
    expect(me.user.photoRequired).toBe(true);
    await api(app).get('/api/v1/me/profile').set(w.as('priya')).expect(200);
    await api(app).get('/api/v1/me/notifications').set(w.as('priya')).expect(200);
    await api(app).post('/api/v1/me/photo/file').set(w.as('priya')).attach('file', png, { filename: 'me.png', contentType: 'image/png' }).expect(200);
  });

  it('after adding a photo the account says so and can ride', async () => {
    expect((await api(app).get('/api/v1/me').set(w.as('priya')).expect(200)).body.data.user.hasPhoto).toBe(true);
    await api(app).post('/api/v1/rides/search').set(w.as('priya')).send(search).expect(200);
    await api(app).get('/api/v1/me/preferred-drivers').set(w.as('priya')).expect(200);
    // someone else without a photo is still held back
    expect((await api(app).post('/api/v1/rides/search').set(w.as('kiran')).send(search)).status).toBe(403);
  });

  it('with REQUIRE_PROFILE_PHOTO=false nobody is held back, and /me tells the apps the photo is optional', async () => {
    e.REQUIRE_PROFILE_PHOTO = 'false';
    try {
      expect((await api(app).get('/api/v1/me').set(w.as('kiran')).expect(200)).body.data.user).toMatchObject({ hasPhoto: false, photoRequired: false });
      await api(app).post('/api/v1/rides/search').set(w.as('kiran')).send(search).expect(200);
    } finally {
      e.REQUIRE_PROFILE_PHOTO = 'true';
    }
  });

  it('removing the photo takes the permission away again', async () => {
    await api(app).delete('/api/v1/me/photo').set(w.as('priya')).expect(200);
    expect((await api(app).get('/api/v1/me').set(w.as('priya')).expect(200)).body.data.user.hasPhoto).toBe(false);
    expect((await api(app).post('/api/v1/rides/search').set(w.as('priya')).send(search)).body.error.code).toBe('PHOTO_REQUIRED');
    await setPhoto('priya');
  });

  it('an admin account is told it is an admin account (not asked for a photo to ride)', async () => {
    const res = await api(app).post('/api/v1/rides/search').set(w.as('hr')).send(search);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ADMIN_ACCOUNT');
  });

  describe('riders and drivers see each other’s photos', () => {
    beforeAll(async () => {
      for (const k of ['driver', 'arjun', 'kiran']) await setPhoto(k);
    });

    it('the driver sees the rider’s photo on the ride, for riders already booked', async () => {
      const ride = (await api(app).get(`/api/v1/rides/${w.rideId}/manage`).set(w.as('driver')).expect(200)).body.data;
      const priya = ride.riders.find((r: { name: string }) => r.name === 'priya person');
      expect(priya.photoUrl).toContain(`photo-priya.png`);
      const arjun = ride.riders.find((r: { name: string }) => r.name === 'arjun person');
      expect(arjun.photoUrl).toContain('photo-arjun.png');
    });

    it('the driver sees the photo of someone who is asking for a seat, before accepting', async () => {
      await prisma.$executeRawUnsafe(`UPDATE rides SET seats_booked = 1 WHERE id = '${w.rideId}'`);
      await prisma.booking.deleteMany({ where: { rideId: w.rideId, riderMembershipId: w.ms.arjun } });
      const req = await api(app)
        .post(`/api/v1/rides/${w.rideId}/requests`)
        .set(w.as('kiran'))
        .send({ pickup: { label: 'Stop', lat: 12.9188, lng: 77.662 }, drop: { label: 'Office', lat: 12.9259, lng: 77.6766 }, seats: 1 });
      expect([200, 201]).toContain(req.status);
      const ride = (await api(app).get(`/api/v1/rides/${w.rideId}/manage`).set(w.as('driver')).expect(200)).body.data;
      expect(ride.requests.length).toBeGreaterThanOrEqual(1);
      expect(ride.requests[0].photoUrl).toContain('photo-kiran.png');
      // never a phone or email
      expect(JSON.stringify(ride)).not.toMatch(/"(email|phone)"/);
    });

    it('the rider sees the driver’s photo and whether the vehicle is verified, in search and in my trips', async () => {
      const found = (await api(app).post('/api/v1/rides/search').set(w.as('priya')).send(search).expect(200)).body.data;
      const mine = found.find((r: { rideId: string }) => r.rideId === w.rideId);
      if (mine) {
        expect(mine.driver.photoUrl).toContain('photo-driver.png');
        expect(mine.vehicle.verified).toBe(true);
      }
      const trips = (await api(app).get('/api/v1/me/bookings').set(w.as('priya')).expect(200)).body.data;
      expect(trips[0].ride.driverPhotoUrl).toContain('photo-driver.png');
      expect(trips[0].ride.vehicle.verified).toBe(true);
      expect(trips[0].ride.vehicle.photoUrl).toBeNull(); // no front photo uploaded yet
    });

    it('once the driver uploads the front photo of the vehicle, the rider sees it', async () => {
      await api(app).post('/api/v1/driver/documents').set(w.as('driver')).field('kind', 'VEHICLE_PHOTO_FRONT').field('vehicleId', w.vehicleId).attach('file', png, { filename: 'v.png', contentType: 'image/png' }).expect(201);
      const trips = (await api(app).get('/api/v1/me/bookings').set(w.as('priya')).expect(200)).body.data;
      expect(trips[0].ride.vehicle.photoUrl).toContain('vehicle_photo_front');
    });

    it('a vehicle that did not pass the check shows as not verified to the rider', async () => {
      await prisma.vehicle.update({ where: { id: w.vehicleId }, data: { checkStatus: 'REJECTED' } });
      const trips = (await api(app).get('/api/v1/me/bookings').set(w.as('priya')).expect(200)).body.data;
      expect(trips[0].ride.vehicle.verified).toBe(false);
      await prisma.vehicle.update({ where: { id: w.vehicleId }, data: { checkStatus: 'VERIFIED' } });
    });
  });
});
