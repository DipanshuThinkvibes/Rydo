import { INestApplication } from '@nestjs/common';
import { api, createApp, FakeMessages, resetDb } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { buildWorld, HOME, OFFICE, World } from './world';

/** Saved addresses: many homes / offices / others, one default per kind, edit, delete, and the company wall. */
describe('Saved places', () => {
  let app: INestApplication;
  let messages: FakeMessages;
  let prisma: PrismaService;
  let w: World;
  const place = (key: string, body: object) => api(app).post('/api/v1/me/places').set(w.as(key)).send(body);

  beforeAll(async () => {
    ({ app, messages, prisma } = await createApp());
    await resetDb(prisma);
    w = await buildWorld(app, messages, prisma, 'plc');
  });
  afterAll(() => app.close());

  let home1: string;
  let home2: string;
  let office1: string;

  it('the first address of a kind becomes its default; later ones do not', async () => {
    const h1 = (await place('priya', { label: 'HOME', name: 'Home', address: 'HSR Layout, Sector 2', ...HOME }).expect(200)).body.data;
    expect(h1).toMatchObject({ label: 'HOME', name: 'Home', isDefault: true });
    expect(h1.lat).toBeCloseTo(HOME.lat, 4);
    home1 = h1.id;
    const h2 = (await place('priya', { label: 'HOME', name: "Mom's place", address: 'Koramangala 4th Block', lat: 12.93, lng: 77.62 }).expect(200)).body.data;
    expect(h2.isDefault).toBe(false);
    home2 = h2.id;
    const o = (await place('priya', { label: 'OFFICE', name: 'Acme Tech', address: 'Outer Ring Rd', ...OFFICE }).expect(200)).body.data;
    expect(o.isDefault).toBe(true);
    office1 = o.id;
    const list = (await api(app).get('/api/v1/me/places').set(w.as('priya')).expect(200)).body.data;
    expect(list.map((p: { id: string }) => p.id)).toEqual([home1, home2, office1]);
  });

  it('making another address the default moves the default, and /me/home follows it', async () => {
    await api(app).post(`/api/v1/me/places/${home2}/default`).set(w.as('priya')).expect(200);
    const list = (await api(app).get('/api/v1/me/places').set(w.as('priya')).expect(200)).body.data as { id: string; isDefault: boolean; label: string }[];
    expect(list.filter((p) => p.label === 'HOME' && p.isDefault).map((p) => p.id)).toEqual([home2]);
    expect((await api(app).get('/api/v1/me/home').set(w.as('priya')).expect(200)).body.data.label).toBe("Mom's place");
  });

  it('edits name and address; PUT /me/home updates the default home without deleting the others', async () => {
    const e = (await api(app).patch(`/api/v1/me/places/${home1}`).set(w.as('priya')).send({ name: 'Flat', address: 'HSR Sector 3', lat: 12.912, lng: 77.648 }).expect(200)).body.data;
    expect(e).toMatchObject({ name: 'Flat', address: 'HSR Sector 3', isDefault: false });
    await api(app).put('/api/v1/me/home').set(w.as('priya')).send({ label: 'New home', lat: 12.92, lng: 77.63 }).expect(200);
    const homes = ((await api(app).get('/api/v1/me/places').set(w.as('priya')).expect(200)).body.data as { label: string }[]).filter((p) => p.label === 'HOME');
    expect(homes).toHaveLength(2);
  });

  it('deleting the default promotes the newest remaining one', async () => {
    const left = (await api(app).delete(`/api/v1/me/places/${home2}`).set(w.as('priya')).expect(200)).body.data as { id: string; isDefault: boolean; label: string }[];
    expect(left.find((p) => p.id === home1)?.isDefault).toBe(true);
  });

  it('checks the input', async () => {
    await place('priya', { label: 'GYM', name: 'x', address: 'yy', ...HOME }).expect(400);
    await place('priya', { label: 'OTHER', name: '', address: 'yy', ...HOME }).expect(400);
    await api(app).patch(`/api/v1/me/places/${home1}`).set(w.as('priya')).send({}).expect(400);
  });

  it('stops at 20 addresses', async () => {
    const have = ((await api(app).get('/api/v1/me/places').set(w.as('arjun')).expect(200)).body.data as unknown[]).length;
    for (let i = have; i < 20; i++) await place('arjun', { label: 'OTHER', name: `P${i}`, address: `Street ${i}`, ...HOME }).expect(200);
    expect((await place('arjun', { label: 'OTHER', name: 'One more', address: 'Street x', ...HOME }).expect(409)).body.error.code).toBe('CONFLICT');
  });

  it('nobody else can see, change or delete them, in this company or another', async () => {
    expect((await api(app).get('/api/v1/me/places').set(w.as('kiran')).expect(200)).body.data).toHaveLength(0);
    await api(app).patch(`/api/v1/me/places/${office1}`).set(w.as('kiran')).send({ name: 'Hacked' }).expect(404);
    await api(app).post(`/api/v1/me/places/${office1}/default`).set(w.as('kiran')).expect(404);
    await api(app).delete(`/api/v1/me/places/${office1}`).set(w.as('kiran')).expect(404);
    await api(app).delete(`/api/v1/me/places/${office1}`).set(w.as('outsiderRider', w.other)).expect(404);
    // Priya cannot use her token against another company.
    await api(app).get('/api/v1/me/places').set(w.as('priya', w.other)).expect(403);
    const [row] = await prisma.$queryRaw<{ name: string }[]>`SELECT name FROM saved_places WHERE id = ${office1}::uuid`;
    expect(row.name).toBe('Acme Tech');
  });
});
