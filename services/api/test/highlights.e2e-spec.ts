import { INestApplication } from '@nestjs/common';
import { api, createApp, FakeMessages, resetDb, signIn } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { buildWorld, World } from './world';

/** The few numbers at the top of each person's account page, chosen by their most senior role. */
describe('Account highlights', () => {
  let app: INestApplication;
  let messages: FakeMessages;
  let prisma: PrismaService;
  let w: World;
  let root: { Authorization: string };
  const get = (h: Record<string, string>) => api(app).get('/api/v1/me/highlights').set(h);
  const keys = (res: { body: { data: { tiles: { key: string }[] } } }) => res.body.data.tiles.map((t) => t.key);

  beforeAll(async () => {
    ({ app, messages, prisma } = await createApp());
    await resetDb(prisma);
    w = await buildWorld(app, messages, prisma, 'hl');
    await w.person('orgadmin', ['ORG_ADMIN']);
    const staff = await prisma.user.create({ data: { email: 'owner@rydo.test', name: 'Owner' } });
    await prisma.platformAdmin.create({ data: { userId: staff.id, role: 'SUPER_ADMIN' } });
    root = { Authorization: `Bearer ${(await signIn(app, messages, 'owner@rydo.test')).accessToken}` };
  });
  afterAll(() => app.close());

  it('needs a signed-in person', async () => {
    await api(app).get('/api/v1/me/highlights').expect(401);
  });

  it('a rider sees trips, CO2 saved, rating and reliability', async () => {
    const res = await get(w.as('priya')).expect(200);
    expect(res.body.data.persona).toBe('RIDER');
    expect(keys(res)).toEqual(['trips', 'co2', 'rating', 'reliability']);
    const reliability = res.body.data.tiles.find((t: { key: string }) => t.key === 'reliability').value;
    expect(reliability).toBe(100);
  });

  it('counts a completed trip and the CO2 it saved', async () => {
    await prisma.$executeRawUnsafe(`UPDATE rides SET distance_meters = 20000, status = 'COMPLETED' WHERE id = '${w.rideId}'`);
    await prisma.booking.updateMany({ where: { rideId: w.rideId }, data: { status: 'COMPLETED' } });
    const mine = await prisma.booking.findFirstOrThrow({ where: { rideId: w.rideId } });
    const riderKey = Object.entries(w.ms).find(([, id]) => id === mine.riderMembershipId)![0];
    const res = await get(w.as(riderKey)).expect(200);
    const t = Object.fromEntries(res.body.data.tiles.map((x: { key: string; value: number }) => [x.key, x.value]));
    expect(t.trips).toBeGreaterThanOrEqual(1);
    expect(t.co2).toBeGreaterThan(0);
  });

  it('a driver sees rides offered, riders carried, rating and reliability', async () => {
    const res = await get(w.as('driver')).expect(200);
    expect(res.body.data.persona).toBe('DRIVER');
    expect(keys(res)).toEqual(['rides', 'riders', 'rating', 'reliability']);
    const t = Object.fromEntries(res.body.data.tiles.map((x: { key: string; value: number }) => [x.key, x.value]));
    expect(t.rides).toBe(1);
    expect(t.riders).toBeGreaterThanOrEqual(1);
  });

  it('HR sees who is waiting, employees, drivers to verify and paused people', async () => {
    await prisma.user.create({ data: { email: `waiting@${w.domain}`, name: 'Wait Er' } }).then((u) => prisma.membership.create({ data: { organizationId: w.org, userId: u.id, status: 'PENDING' } }));
    const res = await get(w.as('hr')).expect(200);
    expect(res.body.data.persona).toBe('HR_ADMIN');
    expect(keys(res)).toEqual(['waiting', 'employees', 'drivers', 'paused']);
    expect(res.body.data.tiles[0].value).toBe(1);
  });

  it('Ops sees rides today, open issues, SOS and no-shows', async () => {
    const res = await get(w.as('ops')).expect(200);
    expect(res.body.data.persona).toBe('OPS_ADMIN');
    expect(keys(res)).toEqual(['today', 'issues', 'sos', 'noshows']);
  });

  it('an Org admin sees employees, waiting, offices and trips', async () => {
    const res = await get(w.as('orgadmin')).expect(200);
    expect(res.body.data.persona).toBe('ORG_ADMIN');
    expect(keys(res)).toEqual(['employees', 'waiting', 'offices', 'trips']);
    expect(res.body.data.tiles[0].value).toBeGreaterThan(5);
  });

  it('numbers stay inside the company: the other company sees its own, not ours', async () => {
    const res = await get(w.as('outsider', w.other)).expect(200);
    expect(res.body.data.persona).toBe('ORG_ADMIN');
    const employees = res.body.data.tiles.find((t: { key: string }) => t.key === 'employees').value;
    expect(employees).toBe(2); // the outsider admin and the outsider rider only
  });

  it('the RYDO owner sees clients, licences, reports and blocked people, with no company needed', async () => {
    const res = await get(root).expect(200);
    expect(res.body.data.persona).toBe('OWNER');
    expect(keys(res)).toEqual(['clients', 'licences', 'reports', 'blocked']);
    expect(res.body.data.tiles[0].value).toBe(2);
    expect(res.body.data.tiles[1].value).toBe(2); // one Share licence per test company
  });

  it('gives only counts, never names or contact details', async () => {
    const text = JSON.stringify((await get(w.as('hr')).expect(200)).body.data);
    expect(text).not.toContain('@');
    expect(text).not.toContain(w.emails.priya);
  });

  it('RYDO support staff are recognised, and have no company numbers', async () => {
    const u = await prisma.user.create({ data: { email: 'help@rydo.test', name: 'Helper' } });
    await prisma.platformAdmin.create({ data: { userId: u.id, role: 'SUPPORT' } });
    const t = (await signIn(app, messages, 'help@rydo.test')).accessToken;
    const me = (await api(app).get('/api/v1/me').set('Authorization', `Bearer ${t}`).expect(200)).body.data;
    expect(me.user).toMatchObject({ isPlatformAdmin: false, platformRole: 'SUPPORT' });
    expect((await api(app).get('/api/v1/me/highlights').set('Authorization', `Bearer ${t}`)).status).toBeGreaterThanOrEqual(400); // no company, no company numbers
    const owner = (await api(app).get('/api/v1/me').set(root).expect(200)).body.data;
    expect(owner.user.platformRole).toBe('SUPER_ADMIN');
    const rider = (await api(app).get('/api/v1/me').set(w.as('priya')).expect(200)).body.data;
    expect(rider.user.platformRole).toBeNull();
  });
});
