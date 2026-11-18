import { INestApplication } from '@nestjs/common';
import { api, createApp, FakeMessages, resetDb } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { buildWorld, HOME, OFFICE, tomorrow, World } from './world';

/** Emergency contacts, blocking, sharing a trip with contacts, profile photo and cards, car type and AC filters. */
describe('Safety, profile and car filters', () => {
  let app: INestApplication;
  let messages: FakeMessages;
  let prisma: PrismaService;
  let w: World;
  const search = (key: string, body: object = {}) =>
    api(app).post('/api/v1/rides/search').set(w.as(key)).send({ pickup: { label: 'Home', ...HOME }, drop: { label: 'Office', ...OFFICE }, date: tomorrow, fromTime: '08:00', toTime: '09:00', ...body }).expect(200);

  beforeAll(async () => {
    ({ app, messages, prisma } = await createApp());
    await resetDb(prisma);
    w = await buildWorld(app, messages, prisma, 'saf');
  });
  afterAll(() => app.close());

  // ───────── Emergency contacts ─────────

  describe('emergency contacts', () => {
    let mom: string;

    it('adds, edits and removes contacts; they belong to the person', async () => {
      const a = (await api(app).post('/api/v1/me/emergency-contacts').set(w.as('priya')).send({ name: 'Asha', phone: '+91 98765 43210', email: 'Asha@Example.com', relation: 'Mother' }).expect(200)).body.data;
      mom = a.id;
      expect(a).toMatchObject({ name: 'Asha', phone: '+91 98765 43210', email: 'asha@example.com', relation: 'Mother' });
      const b = (await api(app).post('/api/v1/me/emergency-contacts').set(w.as('priya')).send({ name: 'Ravi', phone: '9876500000' }).expect(200)).body.data;
      expect(b.email).toBeNull();
      const edited = (await api(app).patch(`/api/v1/me/emergency-contacts/${b.id}`).set(w.as('priya')).send({ name: 'Ravi K', phone: '9876500000', email: 'ravi@example.com' }).expect(200)).body.data;
      expect(edited).toMatchObject({ name: 'Ravi K', email: 'ravi@example.com' });
      expect((await api(app).get('/api/v1/me/emergency-contacts').set(w.as('priya')).expect(200)).body.data).toHaveLength(2);
      expect((await api(app).get('/api/v1/me/emergency-contacts').set(w.as('arjun')).expect(200)).body.data).toHaveLength(0);
      await api(app).delete(`/api/v1/me/emergency-contacts/${b.id}`).set(w.as('priya')).expect(200);
      expect(await prisma.emergencyContact.count({ where: { userId: w.users.priya } })).toBe(1);
    });

    it('checks the phone, rejects duplicates and stops at five', async () => {
      await api(app).post('/api/v1/me/emergency-contacts').set(w.as('priya')).send({ name: 'Bad', phone: 'call me' }).expect(400);
      await api(app).post('/api/v1/me/emergency-contacts').set(w.as('priya')).send({ name: 'Dup', phone: '+91 98765 43210' }).expect(409);
      for (let i = 0; i < 4; i++) await api(app).post('/api/v1/me/emergency-contacts').set(w.as('priya')).send({ name: `C${i}`, phone: `+91 90000 0000${i}` }).expect(200);
      const full = await api(app).post('/api/v1/me/emergency-contacts').set(w.as('priya')).send({ name: 'Sixth', phone: '+91 91111 11111' }).expect(409);
      expect(full.body.error.code).toBe('CONFLICT');
    });

    it("nobody else can read, change or delete someone's contact", async () => {
      await api(app).patch(`/api/v1/me/emergency-contacts/${mom}`).set(w.as('arjun')).send({ name: 'Hacked', phone: '+91 90000 11111' }).expect(404);
      await api(app).delete(`/api/v1/me/emergency-contacts/${mom}`).set(w.as('arjun')).expect(404);
      await api(app).delete(`/api/v1/me/emergency-contacts/${mom}`).set(w.as('outsiderRider', w.other)).expect(404);
      expect(await prisma.emergencyContact.count({ where: { id: mom } })).toBe(1);
    });
  });

  // ───────── Sharing the live trip with contacts ─────────

  describe('share live trip with chosen contacts', () => {
    it('emails the live link to contacts that have an email, and says who was skipped', async () => {
      const contacts = (await api(app).get('/api/v1/me/emergency-contacts').set(w.as('priya')).expect(200)).body.data;
      const withEmail = contacts.find((c: { email: string | null }) => c.email);
      const without = contacts.find((c: { email: string | null }) => !c.email);
      const before = messages.sent.length;
      const res = (await api(app).post(`/api/v1/rides/${w.rideId}/share/contacts`).set(w.as('priya')).send({ contactIds: [withEmail.id, without.id] }).expect(200)).body.data;
      expect(res.url).toMatch(/\/t\/[A-Za-z0-9_-]{20,}$/);
      expect(res.sentTo).toEqual([{ id: withEmail.id, name: withEmail.name }]);
      expect(res.skippedNoEmail).toEqual([{ id: without.id, name: without.name }]);
      const mail = messages.sent.slice(before);
      expect(mail).toHaveLength(1);
      expect(mail[0]).toMatchObject({ to: 'asha@example.com', subject: 'priya person shared their live RYDO trip with you' });
      expect(mail[0].text).toContain(res.url);
      expect(mail[0].text).not.toContain(w.emails.priya); // no personal details in the mail
      expect(await prisma.auditLog.count({ where: { action: 'TRIP_SHARED_TO_CONTACTS' } })).toBe(1);
      // the public link works without signing in
      const pub = (await api(app).get(`/api/v1/public/trips/${res.url.split('/t/')[1]}`).expect(200)).body.data;
      expect(pub).toMatchObject({ from: 'Home', to: 'Office', driverFirstName: 'driver' });
    });

    it('refuses contacts that are not yours, contacts without email, and people without a seat', async () => {
      const mine = (await api(app).get('/api/v1/me/emergency-contacts').set(w.as('priya')).expect(200)).body.data;
      await api(app).post(`/api/v1/rides/${w.rideId}/share/contacts`).set(w.as('arjun')).send({ contactIds: [mine[0].id] }).expect(404); // someone else's contact
      const noEmail = mine.find((c: { email: string | null }) => !c.email);
      const res = await api(app).post(`/api/v1/rides/${w.rideId}/share/contacts`).set(w.as('priya')).send({ contactIds: [noEmail.id] }).expect(409);
      expect(res.body.error.code).toBe('CONFLICT');
      await api(app).post('/api/v1/me/emergency-contacts').set(w.as('kiran')).send({ name: 'Mum', phone: '+91 92222 22222', email: 'mum@example.com' }).expect(200);
      const kc = (await api(app).get('/api/v1/me/emergency-contacts').set(w.as('kiran')).expect(200)).body.data[0];
      await api(app).post(`/api/v1/rides/${w.rideId}/share/contacts`).set(w.as('kiran')).send({ contactIds: [kc.id] }).expect(404); // kiran has no seat, so the ride does not exist for them
      await api(app).post(`/api/v1/rides/${w.rideId}/share/contacts`).set(w.as('priya')).send({ contactIds: [] }).expect(400);
    });
  });

  // ───────── Blocking ─────────

  describe('blocking', () => {
    it('a blocked driver vanishes from search for the blocker (and the other way round), until unblocked', async () => {
      expect((await search('kiran')).body.data).toHaveLength(1);
      await api(app).post('/api/v1/me/blocks').set(w.as('kiran')).send({ membershipId: w.ms.driver }).expect(200);
      expect((await search('kiran')).body.data).toHaveLength(0);
      expect((await search('stranger')).body.data).toHaveLength(1); // others still see the ride
      await api(app).delete(`/api/v1/me/blocks/${w.ms.driver}`).set(w.as('kiran')).expect(200);
      expect((await search('kiran')).body.data).toHaveLength(1);
      // the driver blocking a rider hides the ride from that rider too
      await api(app).post('/api/v1/me/blocks').set(w.as('driver')).send({ membershipId: w.ms.kiran }).expect(200);
      expect((await search('kiran')).body.data).toHaveLength(0);
      await api(app).delete(`/api/v1/me/blocks/${w.ms.kiran}`).set(w.as('driver')).expect(200);
    });

    it('lists blocks with names, ignores repeats, and refuses self, strangers from other companies and unknown people', async () => {
      await api(app).post('/api/v1/me/blocks').set(w.as('kiran')).send({ membershipId: w.ms.stranger }).expect(200);
      const list = (await api(app).post('/api/v1/me/blocks').set(w.as('kiran')).send({ membershipId: w.ms.stranger }).expect(200)).body.data;
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ membershipId: w.ms.stranger, name: 'stranger person' });
      await api(app).post('/api/v1/me/blocks').set(w.as('kiran')).send({ membershipId: w.ms.kiran }).expect(400);
      await api(app).post('/api/v1/me/blocks').set(w.as('kiran')).send({ membershipId: w.ms.outsiderRider }).expect(404);
      await api(app).post('/api/v1/me/blocks').set(w.as('kiran')).send({ membershipId: 'nope' }).expect(400);
      expect((await api(app).get('/api/v1/me/blocks').set(w.as('arjun')).expect(200)).body.data).toHaveLength(0);
      await api(app).delete(`/api/v1/me/blocks/${w.ms.stranger}`).set(w.as('kiran')).expect(200);
    });
  });

  // ───────── Profile ─────────

  describe('profile photo, profile and colleague card', () => {
    it('uploads a photo through a signed link and saves only a key that was issued to you', async () => {
      const up = (await api(app).post('/api/v1/me/photo/upload-url').set(w.as('priya')).send({ contentType: 'image/png' }).expect(200)).body.data;
      expect(up.key).toMatch(new RegExp(`^users/${w.users.priya}/photo-[0-9a-f-]{36}\\.png$`));
      expect(up).toMatchObject({ method: 'PUT', headers: { 'content-type': 'image/png' }, expiresInSec: 300 });
      expect(up.uploadUrl).toContain(up.key);
      await api(app).post('/api/v1/me/photo/upload-url').set(w.as('priya')).send({ contentType: 'application/pdf' }).expect(400);

      await api(app).put('/api/v1/me/photo').set(w.as('priya')).send({ key: `users/${w.users.arjun}/photo-${'0'.repeat(8)}-0000-0000-0000-${'0'.repeat(12)}.png` }).expect(400); // someone else's
      await api(app).put('/api/v1/me/photo').set(w.as('priya')).send({ key: 'orgs/secret/license.pdf' }).expect(400);
      const saved = (await api(app).put('/api/v1/me/photo').set(w.as('priya')).send({ key: up.key }).expect(200)).body.data;
      expect(saved.photoUrl).toContain(up.key);
      const prof = (await api(app).get('/api/v1/me/profile').set(w.as('priya')).expect(200)).body.data;
      expect(prof.photoUrl).toContain(up.key);
      await api(app).delete('/api/v1/me/photo').set(w.as('priya')).expect(200);
      expect((await api(app).get('/api/v1/me/profile').set(w.as('priya')).expect(200)).body.data.photoUrl).toBeNull();
    });

    it('updates the phone number, which stays private', async () => {
      await api(app).patch('/api/v1/me').set(w.as('driver')).send({ phone: 'not a phone' }).expect(400);
      await api(app).patch('/api/v1/me').set(w.as('driver')).send({ phone: '+91 99999 88888' }).expect(200);
      const mine = (await api(app).get('/api/v1/me/profile').set(w.as('driver')).expect(200)).body.data;
      expect(mine.phone).toBe('+91 99999 88888');
      const card = (await api(app).get(`/api/v1/members/${w.ms.driver}/card`).set(w.as('priya')).expect(200)).body.data;
      expect(JSON.stringify(card)).not.toContain('99999');
      expect(JSON.stringify(card)).not.toContain(w.emails.driver);
    });

    it('shows ratings averaged on the profile and on a colleague card, with anonymous comments', async () => {
      const rate = (rater: string, ratee: string, stars: number, comment: string | null) =>
        prisma.rating.create({ data: { organizationId: w.org, rideId: w.rideId, raterMembershipId: w.ms[rater], rateeMembershipId: w.ms[ratee], stars, comment } });
      await rate('priya', 'driver', 5, 'Smooth and on time');
      await rate('arjun', 'driver', 4, null);
      const mine = (await api(app).get('/api/v1/me/profile').set(w.as('driver')).expect(200)).body.data;
      expect(mine.rating).toMatchObject({ average: 4.5, count: 2 });
      expect(mine.rating.recentComments).toEqual([expect.objectContaining({ stars: 5, comment: 'Smooth and on time' })]);
      expect(mine).toMatchObject({ reliabilityScore: 100, driver: { status: 'VERIFIED' }, emergencyContacts: 0 });

      const card = (await api(app).get(`/api/v1/members/${w.ms.driver}/card`).set(w.as('kiran')).expect(200)).body.data;
      expect(card).toMatchObject({ name: 'driver person', rating: { average: 4.5, count: 2 }, reliabilityScore: 100, driver: { verified: true, vehicle: { make: 'Honda', carType: 'SEDAN', hasAc: true } } });
      expect(card.rating.recentComments[0]).not.toHaveProperty('raterMembershipId');
      const rider = (await api(app).get(`/api/v1/members/${w.ms.priya}/card`).set(w.as('kiran')).expect(200)).body.data;
      expect(rider).toMatchObject({ name: 'priya person', driver: null, rating: { average: null, count: 0 } });
    });

    it('hides people from other companies', async () => {
      await api(app).get(`/api/v1/members/${w.ms.outsiderRider}/card`).set(w.as('priya')).expect(404);
      await api(app).get(`/api/v1/members/${w.ms.driver}/card`).set(w.as('outsiderRider', w.other)).expect(404);
    });
  });

  // ───────── Car type and AC filters ─────────

  describe('car type and AC filters', () => {
    it('stores a car type on cars only', async () => {
      const car = { type: 'CAR', carType: 'SUV', make: 'Mahindra', model: 'XUV700', color: 'Black', plateNumber: 'KA 05 SU 7777', seatCapacity: 4, hasAc: false, isDefault: false };
      const ok = await api(app).post('/api/v1/driver/vehicles').set(w.as('driver')).send(car).expect(201);
      expect(ok.body.data.carType ?? (await prisma.vehicle.findFirstOrThrow({ where: { plateNumber: 'KA 05 SU 7777' } })).carType).toBe('SUV');
      await api(app).post('/api/v1/driver/vehicles').set(w.as('driver')).send({ ...car, type: 'BIKE', seatCapacity: 1, plateNumber: 'KA 05 BK 1111' }).expect(400);
      await api(app).post('/api/v1/driver/vehicles').set(w.as('driver')).send({ ...car, carType: 'TRUCK', plateNumber: 'KA 05 TR 2222' }).expect(400);
    });

    it('filters search by Hatchback / Sedan / SUV and by AC', async () => {
      const ids = (r: { body: { data: { vehicle: { carType: string } }[] } }) => r.body.data.length;
      expect(ids(await search('kiran'))).toBe(1);
      const sedan = await search('kiran', { carTypes: ['SEDAN'] });
      expect(sedan.body.data).toHaveLength(1);
      expect(sedan.body.data[0].vehicle).toMatchObject({ carType: 'SEDAN', hasAc: true });
      expect(ids(await search('kiran', { carTypes: ['SUV'] }))).toBe(0);
      expect(ids(await search('kiran', { carTypes: ['SUV', 'SEDAN'] }))).toBe(1);
      expect(ids(await search('kiran', { ac: true }))).toBe(1);
      expect(ids(await search('kiran', { ac: false }))).toBe(0);
      await api(app).post('/api/v1/rides/search').set(w.as('kiran')).send({ pickup: { label: 'Home', ...HOME }, drop: { label: 'Office', ...OFFICE }, date: tomorrow, fromTime: '08:00', toTime: '09:00', carTypes: ['BUS'] }).expect(400);
      // a ride whose car has no type set never matches a car-type filter
      await prisma.vehicle.update({ where: { id: w.vehicleId }, data: { carType: null } });
      expect(ids(await search('kiran', { carTypes: ['SEDAN'] }))).toBe(0);
      expect(ids(await search('kiran'))).toBe(1);
    });
  });
});
