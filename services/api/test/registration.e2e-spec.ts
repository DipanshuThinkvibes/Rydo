import { INestApplication } from '@nestjs/common';
import { api, createApp, FakeMessages, resetDb, signIn } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { buildWorld, World } from './world';

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

const details = (w: World, over: object = ({} as object)) => ({
  fullName: 'Anita Verma',
  phone: '98765 43210',
  idType: 'AADHAAR',
  idLast4: '0124',
  employeeId: 'RG-10234',
  designation: 'Software engineer',
  department: 'Engineering',
  office: 'Cubbon Park HQ',
  managerName: 'Ravi Menon',
  managerEmail: `ravi@${w.domain}`,
  ...over,
});

/** After a new employee verifies their email, their company's HR is asked to approve them. */
describe('Employee registration request', () => {
  let app: INestApplication;
  let messages: FakeMessages;
  let prisma: PrismaService;
  let w: World;
  let token: string;
  let userId: string;
  const email = () => `anita@${w.domain}`;
  const bearer = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    ({ app, messages, prisma } = await createApp());
    await resetDb(prisma);
    w = await buildWorld(app, messages, prisma, 'reg');
    await w.person('orgadmin', ['ORG_ADMIN']);
    // signing in with a company email creates the waiting account, exactly like the sign-up screen does
    const r = await signIn(app, messages, email());
    token = r.accessToken;
    userId = r.user.id;
  });
  afterAll(() => app.close());

  it('needs a signed-in person', async () => {
    await api(app).post('/api/v1/me/registration').send(details(w)).expect(401);
    await api(app).get('/api/v1/me/registration').expect(401);
  });

  it('starts as waiting, with nothing submitted', async () => {
    const s = (await api(app).get('/api/v1/me/registration').set(bearer()).expect(200)).body.data;
    expect(s).toMatchObject({ status: 'PENDING', company: 'reg Co', submittedAt: null });
  });

  it('saves the details and asks the HR and Org admins (only them) to approve, by in-app notice and email', async () => {
    const mails = messages.sent.length;
    const res = (await api(app).post('/api/v1/me/registration').set(bearer()).send(details(w)).expect(200)).body.data;
    expect(res).toMatchObject({ status: 'PENDING', company: 'reg Co', notifiedAdmins: 2 });

    const asked = await prisma.notification.findMany({ where: { type: 'REGISTRATION_REQUEST' } });
    expect(asked.map((n) => n.userId).sort()).toEqual([w.users.hr, w.users.orgadmin].sort()); // not Ops, not riders, not other companies
    expect(asked[0].title).toBe('Anita Verma is waiting for your approval');
    expect(asked[0].body).toContain('RG-10234');
    expect(asked[0].body).toContain('Ravi Menon');
    expect(asked[0].body).not.toContain('0124'); // no ID number in the notice

    const sent = messages.sent.slice(mails);
    expect(sent.filter((m) => m.subject === 'Anita Verma is waiting for your approval').map((m) => m.to).sort()).toEqual([w.emails.hr, w.emails.orgadmin].sort());
    expect(sent.find((m) => m.to === email())?.subject).toBe('Your RYDO request was sent to reg Co');
    expect(sent.find((m) => m.to === email())?.text).toContain('we will email you');

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user).toMatchObject({ name: 'Anita Verma', phone: '9876543210' });
    const m = await prisma.membership.findFirstOrThrow({ where: { userId } });
    expect(m).toMatchObject({ employeeCode: 'RG-10234', status: 'PENDING' });
    expect(await prisma.auditLog.count({ where: { action: 'REGISTRATION_SUBMITTED' } })).toBe(1);
  });

  it('keeps only the last 4 digits of the Aadhaar number and refuses a full number', async () => {
    const reg = await prisma.employeeRegistration.findFirstOrThrow();
    expect(reg).toMatchObject({ idType: 'AADHAAR', idLast4: '0124' });
    expect(JSON.stringify(reg).replace(UUID, "")).not.toMatch(/\d{12}/);
    const bad = await api(app).post('/api/v1/me/registration').set(bearer()).send(details(w, { idLast4: '234567890124' })).expect(400);
    expect(bad.body.error.fields.idLast4).toBeDefined();
  });

  it('shows HR the details when they review, and nobody else', async () => {
    const list = (await api(app).get('/api/v1/admin/members?status=PENDING').set(w.as('hr')).expect(200)).body.data;
    const row = list.find((r: { email: string }) => r.email === email());
    expect(row.registration).toMatchObject({ employeeId: 'RG-10234', designation: 'Software engineer', department: 'Engineering', office: 'Cubbon Park HQ', managerName: 'Ravi Menon', idType: 'AADHAAR', idLast4: '0124' });
    expect(JSON.stringify(row).replace(UUID, "")).not.toMatch(/\d{12}/);
    await api(app).get('/api/v1/admin/members').set(w.as('priya')).expect(403);
    const other = (await api(app).get('/api/v1/admin/members').set(w.as('outsider', w.other)).expect(200)).body.data;
    expect(other.some((r: { email: string }) => r.email === email())).toBe(false);
  });

  it('accepts each ID proof type, keeps its last 4 characters in capitals, and refuses an unknown type', async () => {
    const ok = [['PAN', 'abcd'], ['PASSPORT', '1234'], ['DRIVING_LICENCE', '5678'], ['VOTER_ID', '90ab'], ['AADHAAR', '0124']];
    for (const [idType, idLast4] of ok) {
      await api(app).post('/api/v1/me/registration').set(bearer()).send(details(w, { idType, idLast4 })).expect(200);
      expect(await prisma.employeeRegistration.findFirstOrThrow()).toMatchObject({ idType, idLast4: idLast4.toUpperCase() });
    }
    const bad = await api(app).post('/api/v1/me/registration').set(bearer()).send(details(w, { idType: 'LIBRARY_CARD' })).expect(400);
    expect(bad.body.error.fields.idType).toBeDefined();
  });

  it('can be corrected before approval, without asking HR a second time', async () => {
    const before = await prisma.notification.count({ where: { type: 'REGISTRATION_REQUEST' } });
    await api(app).post('/api/v1/me/registration').set(bearer()).send(details(w, { designation: 'Senior engineer' })).expect(200);
    expect(await prisma.notification.count({ where: { type: 'REGISTRATION_REQUEST' } })).toBe(before);
    expect((await prisma.employeeRegistration.findFirstOrThrow()).designation).toBe('Senior engineer');
    const s = (await api(app).get('/api/v1/me/registration').set(bearer()).expect(200)).body.data;
    expect(s.submittedAt).toBeTruthy();
  });

  it('checks every field, including the manager belonging to the same company', async () => {
    const bad = await api(app).post('/api/v1/me/registration').set(bearer()).send(details(w, { phone: '12345', employeeId: '!', designation: 'x', department: '', managerName: '1', managerEmail: 'nope' })).expect(400);
    expect(Object.keys(bad.body.error.fields).sort()).toEqual(['department', 'designation', 'employeeId', 'managerEmail', 'managerName', 'phone']);
    const foreign = await api(app).post('/api/v1/me/registration').set(bearer()).send(details(w, { managerEmail: 'boss@elsewhere.com' })).expect(400);
    expect(foreign.body.error.fields.managerEmail).toContain(`@${w.domain}`);
    const self = await api(app).post('/api/v1/me/registration').set(bearer()).send(details(w, { managerEmail: email() })).expect(400);
    expect(self.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('tells the person when HR decides: approval email and status', async () => {
    const m = await prisma.membership.findFirstOrThrow({ where: { userId } });
    const mails = messages.sent.length;
    await api(app).post(`/api/v1/admin/members/${m.id}/approve`).set(w.as('hr')).expect(200);
    expect(messages.sent.slice(mails).some((x) => x.to === email() && x.subject === "You're approved on RYDO")).toBe(true);
    const s = (await api(app).get('/api/v1/me/registration').set(bearer()).expect(200)).body.data;
    expect(s.status).toBe('ACTIVE');
    const again = await api(app).post('/api/v1/me/registration').set(bearer()).send(details(w)).expect(409);
    expect(again.body.error.code).toBe('CONFLICT');
  });

  it('refuses someone with no sign-up waiting (for example HR rejected them)', async () => {
    const u = await prisma.user.create({ data: { email: `rejected@${w.domain}`, name: 'Re Jected' } });
    await prisma.membership.create({ data: { organizationId: w.org, userId: u.id, status: 'REJECTED', roles: { create: [{ role: 'RIDER' }] } } });
    const t = (await signIn(app, messages, `rejected@${w.domain}`)).accessToken;
    const res = await api(app).post('/api/v1/me/registration').set('Authorization', `Bearer ${t}`).send(details(w)).expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect((await api(app).get('/api/v1/me/registration').set('Authorization', `Bearer ${t}`).expect(200)).body.data.status).toBe('REJECTED');
  });
});
