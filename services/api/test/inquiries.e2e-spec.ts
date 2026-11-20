import { INestApplication } from '@nestjs/common';
import { api, createApp, FakeMessages, resetDb, signIn } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { buildWorld, World } from './world';

const form = { companyName: 'Globex Labs', contactName: 'Asha Rao', workEmail: 'Asha@Globex.com', phone: '+91 98765 43210', companySize: '201-1000', city: 'Pune', message: 'We would like to try RYDO for our two offices.', website: '', consent: true };

/** "Contact us": a company asks to be onboarded; the RYDO team follows up from the owner console. */
describe('Onboarding requests (Contact us)', () => {
  let app: INestApplication;
  let messages: FakeMessages;
  let prisma: PrismaService;
  let w: World;
  let rootToken: string;
  let id: string;
  const root = () => ({ Authorization: `Bearer ${rootToken}` });

  beforeAll(async () => {
    ({ app, messages, prisma } = await createApp());
    await resetDb(prisma);
    w = await buildWorld(app, messages, prisma, 'inq');
    const staff = await prisma.user.create({ data: { email: 'owner@rydo.test', name: 'Owner' } });
    await prisma.platformAdmin.create({ data: { userId: staff.id, role: 'SUPER_ADMIN' } });
    rootToken = (await signIn(app, messages, 'owner@rydo.test')).accessToken;
  });
  afterAll(() => app.close());

  it('anyone can send the form without signing in; the team is told and the sender gets a confirmation', async () => {
    const before = messages.sent.length;
    const res = await api(app).post('/api/v1/public/contact').send(form).expect(200);
    expect(res.body.data).toEqual({ received: true });
    const row = await prisma.onboardingInquiry.findFirstOrThrow();
    id = row.id;
    expect(row).toMatchObject({ companyName: 'Globex Labs', workEmail: 'asha@globex.com', companySize: '201-1000', city: 'Pune', status: 'NEW' });
    const mail = messages.sent.slice(before);
    expect(mail.find((m) => m.to === 'owner@rydo.test')?.subject).toBe('New onboarding request: Globex Labs');
    expect(mail.find((m) => m.to === 'asha@globex.com')?.subject).toBe('We got your request: RYDO');
    expect(await prisma.notification.count({ where: { type: 'ONBOARDING_INQUIRY' } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'INQUIRY_RECEIVED', entityId: id } })).toBe(1);
  });

  it('checks the form and needs consent', async () => {
    const bad = await api(app).post('/api/v1/public/contact').send({ ...form, companyName: 'x', workEmail: 'nope', companySize: '5', consent: false }).expect(400);
    expect(Object.keys(bad.body.error.fields).sort()).toEqual(['companyName', 'companySize', 'consent', 'workEmail']);
    await api(app).post('/api/v1/public/contact').send({ ...form, phone: 'call me' }).expect(400);
    await api(app).post('/api/v1/public/contact').send({ ...form, message: 'x'.repeat(1501) }).expect(400);
    expect(await prisma.onboardingInquiry.count()).toBe(1);
  });

  it('optional fields can be left empty', async () => {
    await api(app).post('/api/v1/public/contact').send({ companyName: 'Initech', contactName: 'Bill Lumbergh', workEmail: 'bill@initech.com', companySize: '1-50', phone: '', city: '', message: '', consent: true }).expect(200);
    const r = await prisma.onboardingInquiry.findFirstOrThrow({ where: { companyName: 'Initech' } });
    expect(r).toMatchObject({ phone: null, city: null, message: null });
  });

  it('keeps one request when the same person sends it twice, and ignores bots', async () => {
    await api(app).post('/api/v1/public/contact').send(form).expect(200);
    expect(await prisma.onboardingInquiry.count({ where: { companyName: 'Globex Labs' } })).toBe(1);
    const mails = messages.sent.length;
    await api(app).post('/api/v1/public/contact').send({ ...form, companyName: 'Spam Inc', website: 'http://spam.example' }).expect(200).then((r) => expect(r.body.data.received).toBe(true));
    expect(await prisma.onboardingInquiry.count({ where: { companyName: 'Spam Inc' } })).toBe(0);
    expect(messages.sent.length).toBe(mails); // nobody is emailed for a bot
  });

  it('still saves the request if email is down', async () => {
    const orig = messages.sendEmail.bind(messages);
    messages.sendEmail = async () => {
      throw new Error('smtp down');
    };
    await api(app).post('/api/v1/public/contact').send({ ...form, companyName: 'Umbrella', workEmail: 'ops@umbrella.com' }).expect(200);
    messages.sendEmail = orig;
    expect(await prisma.onboardingInquiry.count({ where: { companyName: 'Umbrella' } })).toBe(1);
  });

  it('only RYDO staff read and work the inbox', async () => {
    await api(app).get('/api/v1/admin/platform/inquiries').expect(401);
    await api(app).get('/api/v1/admin/platform/inquiries').set(w.as('hr')).expect(403); // a company admin is not RYDO staff
    await api(app).patch(`/api/v1/admin/platform/inquiries/${id}`).set(w.as('hr')).send({ status: 'CLOSED' }).expect(403);
    const list = await api(app).get('/api/v1/admin/platform/inquiries').set(root()).expect(200);
    expect(list.body.data).toHaveLength(3);
    expect(list.body.meta.counts).toEqual({ NEW: 3, CONTACTED: 0, ONBOARDED: 0, CLOSED: 0 });
    expect(list.body.data[0]).toHaveProperty('workEmail');
  });

  it('staff move a request along with notes; filters and paging work', async () => {
    await api(app).patch(`/api/v1/admin/platform/inquiries/${id}`).set(root()).send({}).expect(400);
    await api(app).patch(`/api/v1/admin/platform/inquiries/${id}`).set(root()).send({ status: 'NOPE' }).expect(400);
    const done = (await api(app).patch(`/api/v1/admin/platform/inquiries/${id}`).set(root()).send({ status: 'CONTACTED', notes: 'Called Asha; demo booked Friday.' }).expect(200)).body.data;
    expect(done).toMatchObject({ status: 'CONTACTED', notes: 'Called Asha; demo booked Friday.' });
    expect(await prisma.auditLog.count({ where: { action: 'INQUIRY_UPDATED', entityId: id } })).toBe(1);
    await api(app).patch('/api/v1/admin/platform/inquiries/00000000-0000-4000-8000-000000000000').set(root()).send({ status: 'CLOSED' }).expect(404);
    expect((await api(app).get('/api/v1/admin/platform/inquiries?status=CONTACTED').set(root()).expect(200)).body.data).toHaveLength(1);
    const p1 = (await api(app).get('/api/v1/admin/platform/inquiries?limit=2').set(root()).expect(200)).body;
    const p2 = (await api(app).get(`/api/v1/admin/platform/inquiries?limit=2&cursor=${encodeURIComponent(p1.meta.nextCursor)}`).set(root()).expect(200)).body;
    expect(p1.data.length + p2.data.length).toBe(3);
    expect(p2.meta.nextCursor).toBeNull();
    await api(app).get('/api/v1/admin/platform/inquiries?cursor=garbage').set(root()).expect(400);
  });
});
