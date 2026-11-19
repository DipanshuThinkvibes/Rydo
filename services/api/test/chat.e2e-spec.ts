import { INestApplication } from '@nestjs/common';
import { io, type Socket } from 'socket.io-client';
import { CHAT_EVENT, REALTIME_PATH } from '@rydo/shared';
import { api, createApp, FakeMessages, resetDb } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { PUSH_ADAPTER } from '../src/adapters/push.adapter';
import type { LogPushAdapter } from '../src/adapters/log-push.adapter';
import { buildWorld, World } from './world';

/** Ride chat: one driver, one confirmed rider, one ride. Private, live, and closed when the ride is over. */
describe('Ride chat', () => {
  let app: INestApplication;
  let messages: FakeMessages;
  let prisma: PrismaService;
  let w: World;
  let push: LogPushAdapter;
  const chat = (rider: string) => `/api/v1/rides/${w.rideId}/chat/${rider}/messages`;

  beforeAll(async () => {
    ({ app, messages, prisma } = await createApp());
    await resetDb(prisma);
    w = await buildWorld(app, messages, prisma, 'chat');
    push = app.get(PUSH_ADAPTER);
  });
  afterAll(() => app.close());

  it('lists who you can talk to: the driver sees each rider, a rider sees only the driver', async () => {
    const driver = (await api(app).get(`/api/v1/rides/${w.rideId}/chat`).set(w.as('driver')).expect(200)).body.data;
    expect(driver.map((t: { with: { name: string } }) => t.with.name).sort()).toEqual(['arjun person', 'priya person']);
    expect(driver[0]).toMatchObject({ as: 'DRIVER', unread: 0, lastMessage: null, canSend: true, archived: false });
    const rider = (await api(app).get(`/api/v1/rides/${w.rideId}/chat`).set(w.as('priya')).expect(200)).body.data;
    expect(rider).toHaveLength(1);
    expect(rider[0]).toMatchObject({ as: 'RIDER', with: { membershipId: w.ms.driver, name: 'driver person' } });
  });

  it('only the driver and that rider can open a thread: not other riders, riders without a seat, admins or outsiders', async () => {
    await api(app).get(chat(w.ms.priya)).set(w.as('arjun')).expect(404); // another rider on the same ride
    await api(app).get(chat(w.ms.priya)).set(w.as('kiran')).expect(404); // no seat
    await api(app).get(chat(w.ms.priya)).set(w.as('hr')).expect(404); // admins do not read private chats
    await api(app).get(chat(w.ms.priya)).set(w.as('outsider', w.other)).expect(404);
    await api(app).post(chat(w.ms.priya)).set(w.as('arjun')).send({ body: 'hi' }).expect(404);
    await api(app).get(`/api/v1/rides/${w.rideId}/chat`).set(w.as('kiran')).expect(404);
    await api(app).get(chat('not-an-id')).set(w.as('priya')).expect(400);
  });

  it('a rider and the driver exchange messages; unread counts and read receipts work', async () => {
    await api(app).post(chat('me')).set(w.as('priya')).send({ body: '  Can you pick me up at the gate?  ' }).expect(200).then((r) => expect(r.body.data).toMatchObject({ body: 'Can you pick me up at the gate?', mine: true }));
    await api(app).post(chat('me')).set(w.as('priya')).send({ body: 'I will be there at 8:25' }).expect(200);
    await api(app).post(chat('me')).set(w.as('priya')).send({ body: '' }).expect(400);
    await api(app).post(chat('me')).set(w.as('priya')).send({ body: 'x'.repeat(1001) }).expect(400);

    const unread = (await api(app).get('/api/v1/me/chat/unread').set(w.as('driver')).expect(200)).body.data;
    expect(unread.total).toBe(2);
    expect(unread.threads[0]).toMatchObject({ rideId: w.rideId, riderMembershipId: w.ms.priya, count: 2 });
    expect((await api(app).get('/api/v1/me/chat/unread').set(w.as('priya')).expect(200)).body.data.total).toBe(0);

    const list = (await api(app).get(`/api/v1/rides/${w.rideId}/chat`).set(w.as('driver')).expect(200)).body.data.find((t: { riderMembershipId: string }) => t.riderMembershipId === w.ms.priya);
    expect(list).toMatchObject({ unread: 2, lastMessage: { body: 'I will be there at 8:25' } });

    const history = await api(app).get(chat(w.ms.priya)).set(w.as('driver')).expect(200);
    expect(history.body.data.map((m: { body: string }) => m.body)).toEqual(['Can you pick me up at the gate?', 'I will be there at 8:25']); // oldest first
    expect(history.body.data.every((m: { mine: boolean }) => m.mine === false)).toBe(true);
    expect(history.body.meta).toMatchObject({ canSend: true, archived: false, as: 'DRIVER', nextBefore: null });
    // opening the thread marked them read
    expect((await api(app).get('/api/v1/me/chat/unread').set(w.as('driver')).expect(200)).body.data.total).toBe(0);

    await api(app).post(chat(w.ms.priya)).set(w.as('driver')).send({ body: 'Yes, see you at the gate.' }).expect(200);
    const mineView = (await api(app).get(chat('me')).set(w.as('priya')).expect(200)).body.data;
    expect(mineView.map((m: { mine: boolean }) => m.mine)).toEqual([true, true, false]);
    expect(mineView[0].readAt).toBeTruthy(); // the driver has read her first message
  });

  it('pages through a long history, newest page first', async () => {
    for (let i = 1; i <= 4; i++) await api(app).post(chat('me')).set(w.as('priya')).send({ body: `msg ${i}` }).expect(200);
    const page1 = (await api(app).get(`${chat('me')}?limit=3`).set(w.as('priya')).expect(200)).body;
    expect(page1.data.map((m: { body: string }) => m.body)).toEqual(['msg 2', 'msg 3', 'msg 4']);
    expect(page1.meta.nextBefore).toBeTruthy();
    const page2 = (await api(app).get(`${chat('me')}?limit=3&before=${encodeURIComponent(page1.meta.nextBefore)}`).set(w.as('priya')).expect(200)).body;
    expect(page2.data.at(-1).body).toBe('msg 1');
  });

  it('keeps one unread alert per thread in the inbox, but the phone still gets every push', async () => {
    await api(app).post('/api/v1/me/devices').set(w.as('driver')).send({ token: 'driver-phone-token-aaaaaaaa', platform: 'ANDROID' }).expect(200);
    const before = push.sent.length;
    const inboxBefore = await prisma.notification.count({ where: { userId: w.users.driver, type: 'CHAT_MESSAGE' } });
    for (const t of ['one', 'two', 'three']) await api(app).post(chat('me')).set(w.as('priya')).send({ body: t }).expect(200);
    expect(push.sent.length - before).toBe(3);
    expect(push.sent.at(-1)).toMatchObject({ tokens: ['driver-phone-token-aaaaaaaa'], msg: { title: 'priya person', body: 'three', data: { type: 'CHAT_MESSAGE', rideId: w.rideId } } });
    const inboxAfter = await prisma.notification.count({ where: { userId: w.users.driver, type: 'CHAT_MESSAGE' } });
    expect(inboxAfter - inboxBefore).toBeLessThanOrEqual(1);
  });

  it('delivers live messages only to the two people in the thread', async () => {
    await app.listen(0);
    const url = (await app.getUrl()).replace('[::1]', 'localhost');
    const connect = (key: string) =>
      new Promise<Socket>((resolve, reject) => {
        const s = io(url, { path: REALTIME_PATH, transports: ['websocket'], auth: { token: w.tokens[key] } });
        s.on('connect', () => resolve(s));
        s.on('connect_error', reject);
      });
    const [priya, driver, arjun, hr] = await Promise.all([connect('priya'), connect('driver'), connect('arjun'), connect('hr')]);
    const sub = { rideId: w.rideId, riderMembershipId: w.ms.priya };
    expect(await priya.emitWithAck('chat.subscribe', sub)).toEqual({ ok: true });
    expect(await driver.emitWithAck('chat.subscribe', sub)).toEqual({ ok: true });
    expect(await arjun.emitWithAck('chat.subscribe', sub)).toEqual({ ok: false });
    expect(await hr.emitWithAck('chat.subscribe', sub)).toEqual({ ok: false });
    expect(await priya.emitWithAck('chat.subscribe', { rideId: w.rideId })).toEqual({ ok: false });

    // arjun joins the shared ride room (allowed: he has a seat) and must still not hear priya's chat
    expect(await arjun.emitWithAck('subscribe', { rideId: w.rideId })).toEqual({ ok: true });
    let leaked = false;
    arjun.on(CHAT_EVENT, () => (leaked = true));

    const toPriya = new Promise<{ body: string; senderMembershipId: string }>((r) => priya.once(CHAT_EVENT, r));
    await api(app).post(chat(w.ms.priya)).set(w.as('driver')).send({ body: 'Leaving now' }).expect(200);
    expect(await toPriya).toMatchObject({ body: 'Leaving now', senderMembershipId: w.ms.driver, riderMembershipId: w.ms.priya });
    await new Promise((r) => setTimeout(r, 200));
    expect(leaked).toBe(false);
    [priya, driver, arjun, hr].forEach((s) => s.close());
  });

  it('refuses writing between people who blocked each other, but both can still read', async () => {
    await api(app).post('/api/v1/me/blocks').set(w.as('driver')).send({ membershipId: w.ms.arjun }).expect(200);
    await api(app).post(chat('me')).set(w.as('arjun')).send({ body: 'hello?' }).expect(403);
    const hist = (await api(app).get(chat('me')).set(w.as('arjun')).expect(200)).body.meta;
    expect(hist).toMatchObject({ blocked: true, canSend: false });
    const t = (await api(app).get(`/api/v1/rides/${w.rideId}/chat`).set(w.as('driver')).expect(200)).body.data.find((x: { riderMembershipId: string }) => x.riderMembershipId === w.ms.arjun);
    expect(t.canSend).toBe(false);
    await api(app).delete(`/api/v1/me/blocks/${w.ms.arjun}`).set(w.as('driver')).expect(200);
    await api(app).post(chat('me')).set(w.as('arjun')).send({ body: 'hello again' }).expect(200);
  });

  it('closes when the seat is cancelled or the ride is over: history stays, nothing new can be sent', async () => {
    await prisma.booking.update({ where: { id: w.bookings.arjun }, data: { status: 'CANCELLED_BY_RIDER' } });
    await api(app).post(chat('me')).set(w.as('arjun')).send({ body: 'still there?' }).expect(404); // no live booking: no thread at all

    await prisma.ride.update({ where: { id: w.rideId }, data: { status: 'COMPLETED' } });
    const closed = await api(app).post(chat('me')).set(w.as('priya')).send({ body: 'thanks for the ride' }).expect(409);
    expect(closed.body.error.code).toBe('CONFLICT');
    const hist = (await api(app).get(chat('me')).set(w.as('priya')).expect(200)).body;
    expect(hist.meta).toMatchObject({ canSend: false, archived: true });
    expect(hist.data.length).toBeGreaterThan(3);
    expect((await api(app).get('/api/v1/me/chat/unread').set(w.as('driver')).expect(200)).body.data.total).toBe(0); // archived chats are not counted
  });

  it('is part of RYDO Share: off when the company switches Share off', async () => {
    await prisma.organization.update({ where: { id: w.org }, data: { features: { share: false } } });
    const res = await api(app).get(`/api/v1/rides/${w.rideId}/chat`).set(w.as('priya')).expect(403);
    expect(res.body.error.code).toBe('FEATURE_OFF');
    await prisma.organization.update({ where: { id: w.org }, data: { features: { share: true } } });
  });
});
