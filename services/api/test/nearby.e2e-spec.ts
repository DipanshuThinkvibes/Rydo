import { INestApplication } from '@nestjs/common';
import { api, createApp, FakeMessages, resetDb } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { buildWorld, HOME, OFFICE, tomorrow, World } from './world';

/**
 * Ride search suggestions. The world's ride goes HOME → MID → OFFICE (about 3.5 km) tomorrow at 08:30, and the company's
 * pickup distance is the default 1 km. Rides further away (up to 3 km) or that meet the trip partway are suggested, marked `nearby`.
 */
describe('Nearby ride suggestions', () => {
  let app: INestApplication;
  let messages: FakeMessages;
  let prisma: PrismaService;
  let w: World;

  const place = (label: string, p: { lat: number; lng: number }) => ({ label, lat: p.lat, lng: p.lng });
  const search = (pickup: { lat: number; lng: number }, drop: { lat: number; lng: number } = OFFICE) => ({
    pickup: place('My pickup', pickup),
    drop: place('My drop', drop),
    date: tomorrow,
    fromTime: '08:00',
    toTime: '09:00',
    seats: 1,
    womenOnly: false,
  });
  const find = async (body: object) => (await api(app).post('/api/v1/rides/search').set(w.as('kiran')).send(body).expect(200)).body.data as { rideId: string; nearby: boolean; reasons: string[]; pickupDistanceMeters: number; pickupPoint: { lat: number; lng: number } }[];

  // Same line as the ride, 3.5 km before its start: the ride starts in between the rider's pickup and drop.
  const BEFORE_START = { lat: HOME.lat - (OFFICE.lat - HOME.lat), lng: HOME.lng - (OFFICE.lng - HOME.lng) };
  // 1.8 km north of the ride's start: further than the 1 km pickup distance, within the 3 km suggestion reach.
  const OFF_ROUTE = { lat: HOME.lat + 0.016, lng: HOME.lng };

  beforeAll(async () => {
    ({ app, messages, prisma } = await createApp());
    await resetDb(prisma);
    w = await buildWorld(app, messages, prisma, 'nby');
  });
  afterAll(() => app.close());

  it('a pickup on the route is a direct match, not a suggestion', async () => {
    const [m] = await find(search(HOME));
    expect(m).toMatchObject({ rideId: w.rideId, nearby: false });
  });

  it('suggests a ride whose route passes a little further away, and says where to meet the car', async () => {
    const [m] = await find(search(OFF_ROUTE));
    expect(m).toMatchObject({ rideId: w.rideId, nearby: true });
    expect(m.pickupDistanceMeters).toBeGreaterThan(1000);
    expect(m.reasons[0]).toMatch(/^Meet the car 1\.\d km from your pickup$/);
    expect(m.pickupPoint.lat).toBeCloseTo(HOME.lat, 2);
  });

  it('suggests a ride that starts in between the pickup and the drop', async () => {
    const [m] = await find(search(BEFORE_START));
    expect(m).toMatchObject({ rideId: w.rideId, nearby: true });
    expect(m.pickupDistanceMeters).toBeGreaterThan(3000); // the meeting point is the ride's start, further than the reach
  });

  it('does not suggest rides that are far away, go the other way or only graze the trip', async () => {
    expect(await find(search({ lat: HOME.lat + 0.08, lng: HOME.lng }))).toHaveLength(0); // ~9 km away
    expect(await find(search(OFFICE, HOME))).toHaveLength(0); // the ride goes the other way
    // A long trip of which the ride covers far less than 40%.
    const farBefore = { lat: HOME.lat - 4 * (OFFICE.lat - HOME.lat), lng: HOME.lng - 4 * (OFFICE.lng - HOME.lng) };
    expect(await find(search(farBefore))).toHaveLength(0);
  });

  it('direct matches come before suggestions', async () => {
    const list = await find(search(HOME));
    const firstNearby = list.findIndex((m) => m.nearby);
    expect(firstNearby === -1 || list.slice(firstNearby).every((m) => m.nearby)).toBe(true);
  });

  it('requesting a suggestion sends the driver the meeting point on their route, not the rider\'s address', async () => {
    const body = search(OFF_ROUTE);
    const res = await api(app).post(`/api/v1/rides/${w.rideId}/requests`).set(w.as('kiran')).send({ pickup: body.pickup, drop: body.drop, seats: 1 }).expect(201);
    const [row] = await prisma.$queryRaw<{ label: string; lat: number }[]>`SELECT pickup_label AS label, ST_Y(pickup::geometry) AS lat FROM ride_requests WHERE id = ${res.body.data.id}::uuid`;
    expect(row.label).toBe('Meet point on your route near My pickup');
    expect(row.lat).toBeCloseTo(HOME.lat, 2);
  });

  it('automatic booking (My week, waitlist) stays strict: the shared search without suggestions finds nothing off-route', async () => {
    const { MatchingService } = await import('../src/rides/matching.service');
    const strict = await app.get(MatchingService).search({ organizationId: w.org, membershipId: w.ms.arjun }, search(OFF_ROUTE) as never);
    expect(strict).toHaveLength(0);
  });
});
