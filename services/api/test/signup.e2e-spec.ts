import { INestApplication } from '@nestjs/common';
import { api, createApp, FakeMessages, googleToken, resetDb, signIn } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/** Self sign-up: find the company, employee details, email code or Google, optional ID photo, HR review. */
describe('Sign-up', () => {
  let app: INestApplication;
  let messages: FakeMessages;
  let prisma: PrismaService;
  let org: string;
  let other: string;
  let dept: string;
  let office: string;
  let otherDept: string;
  let hrToken: string;
  let outsiderHr: string;
  const photo = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

  const fields = (over: Record<string, string> = {}) => ({
    companyId: org,
    name: 'Priya Sharma',
    phone: '+91 98765 43210',
    idProofType: 'AADHAAR',
    idProofNumber: '1234 5678 9012',
    employeeId: 'TV-1042',
    jobTitle: 'Software engineer',
    departmentId: dept,
    officeId: office,
    managerName: 'Rahul Mehta',
    managerEmail: 'rahul@sgn.test',
    acceptTerms: 'true',
    client: 'MOBILE',
    ...over,
  });
  /** Multipart like the app; the ID photo is attached only when asked. */
  function signup(body: Record<string, string>, withPhoto = false) {
    let r = api(app).post('/api/v1/auth/signup');
    for (const [k, v] of Object.entries(body)) r = r.field(k, v);
    return withPhoto ? r.attach('idProof', photo, { filename: 'id.jpg', contentType: 'image/jpeg' }) : r;
  }
  async function code(email: string) {
    await api(app).post('/api/v1/auth/otp/request').send({ email }).expect(200);
    return messages.lastCode(email)!;
  }

  beforeAll(async () => {
    ({ app, messages, prisma } = await createApp());
    await resetDb(prisma);
    org = (await prisma.organization.create({ data: { name: 'Thinkvibes', slug: 'sgn', emailDomains: ['sgn.test'], status: 'ACTIVE' } })).id;
    other = (await prisma.organization.create({ data: { name: 'Other Co', slug: 'sgn-o', emailDomains: ['o-sgn.test'], status: 'ACTIVE' } })).id;
    await prisma.organization.create({ data: { name: 'Thinkvibes Labs (pending)', slug: 'sgn-p', emailDomains: ['p-sgn.test'], status: 'PENDING' } });
    dept = (await prisma.department.create({ data: { organizationId: org, name: 'Engineering' } })).id;
    otherDept = (await prisma.department.create({ data: { organizationId: other, name: 'Sales' } })).id;
    [{ id: office }] = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO offices (id, organization_id, name, address, location, is_default) VALUES (gen_random_uuid(), '${org}', 'ORR campus', 'Outer Ring Rd', ST_SetSRID(ST_MakePoint(77.68, 12.93), 4326)::geography, true) RETURNING id`,
    );
    for (const [email, orgId] of [['hr@sgn.test', org], ['hr@o-sgn.test', other]] as const) {
      const u = await prisma.user.create({ data: { email, name: 'HR' } });
      await prisma.membership.create({ data: { organizationId: orgId, userId: u.id, status: 'ACTIVE', roles: { create: [{ role: 'HR_ADMIN' }] } } });
    }
    hrToken = (await signIn(app, messages, 'hr@sgn.test')).accessToken;
    outsiderHr = (await signIn(app, messages, 'hr@o-sgn.test')).accessToken;
  });
  afterAll(() => app.close());

  it('finds active companies by name and lists their departments and offices', async () => {
    const found = (await api(app).get('/api/v1/auth/companies?q=think').expect(200)).body.data;
    expect(found).toEqual([{ id: org, name: 'Thinkvibes', domains: ['sgn.test'] }]);
    await api(app).get('/api/v1/auth/companies?q=th').expect(400);
    const opts = (await api(app).get(`/api/v1/auth/companies/${org}/options`).expect(200)).body.data;
    expect(opts).toEqual({ departments: [{ id: dept, name: 'Engineering' }], offices: [{ id: office, name: 'ORR campus' }] });
    await api(app).get('/api/v1/auth/companies/00000000-0000-4000-8000-000000000000/options').expect(404);
  });

  it('creates a pending account with all the details; Aadhaar kept masked; no photo or password needed', async () => {
    const email = 'priya@sgn.test';
    const res = await signup({ ...fields(), email, code: await code(email) }).expect(200);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.memberships[0]).toMatchObject({ status: 'PENDING', roles: ['RIDER'] });
    const m = await prisma.membership.findFirstOrThrow({ where: { organizationId: org, user: { email } }, include: { user: true } });
    expect(m).toMatchObject({
      employeeCode: 'TV-1042',
      jobTitle: 'Software engineer',
      departmentId: dept,
      officeId: office,
      managerName: 'Rahul Mehta',
      managerEmail: 'rahul@sgn.test',
      idProofType: 'AADHAAR',
      idProofNumber: 'XXXX XXXX 9012',
      idProofKey: null,
    });
    expect(m.signedUpAt).toBeTruthy();
    expect(m.user).toMatchObject({ name: 'Priya Sharma', phone: '+91 98765 43210', passwordHash: null });
  });

  it('keeps an ID photo private when one is sent', async () => {
    const email = 'meera@sgn.test';
    await signup({ ...fields({ employeeId: 'TV-1050', name: 'Meera N' }), email, code: await code(email) }, true).expect(200);
    const m = await prisma.membership.findFirstOrThrow({ where: { user: { email } } });
    expect(m.idProofKey).toMatch(new RegExp(`^orgs/${org}/members/${m.id}/id-proof-`));
  });

  it('refuses: second sign-up, used employee ID, wrong domain, other company department, no consent, wrong code, bad ID number', async () => {
    await signup({ ...fields(), email: 'priya@sgn.test', code: await code('priya@sgn.test') }).expect(409);
    const dup = await signup({ ...fields({ name: 'Arjun' }), email: 'arjun@sgn.test', code: await code('arjun@sgn.test') }).expect(409);
    expect(dup.body.error.fields).toHaveProperty('employeeId');
    const domain = await signup({ ...fields({ employeeId: 'TV-2000', companyId: other }), email: 'kiran@sgn.test', code: await code('kiran@sgn.test') }).expect(400);
    expect(domain.body.error.fields).toHaveProperty('email');
    const foreignDept = await signup({ ...fields({ employeeId: 'TV-2001', departmentId: otherDept }), email: 'kiran@sgn.test', code: await code('kiran@sgn.test') }).expect(400);
    expect(foreignDept.body.error.fields).toHaveProperty('departmentId');
    const noConsent = await signup({ ...fields({ employeeId: 'TV-2002', acceptTerms: 'false' }), email: 'kiran@sgn.test', code: '123456' }).expect(400);
    expect(noConsent.body.error.fields).toHaveProperty('acceptTerms');
    await code('kiran@sgn.test');
    expect((await signup({ ...fields({ employeeId: 'TV-2003' }), email: 'kiran@sgn.test', code: '000000' }).expect(400)).body.error.code).toBe('OTP_INVALID');
    const badPan = await signup({ ...fields({ employeeId: 'TV-2004', idProofType: 'PAN', idProofNumber: '12345' }), email: 'kiran@sgn.test', code: '123456' }).expect(400);
    expect(badPan.body.error.fields).toHaveProperty('idProofNumber');
    const self = await signup({ ...fields({ employeeId: 'TV-2005', managerEmail: 'kiran@sgn.test' }), email: 'kiran@sgn.test', code: '123456' }).expect(400);
    expect(self.body.error.fields).toHaveProperty('managerEmail');
  });

  it('Continue with Google: new employee → form → account (no code); next time straight in', async () => {
    const tok = googleToken('neha@sgn.test', 'g-neha-0001');
    const first = (await api(app).post('/api/v1/auth/google').send({ idToken: tok, client: 'MOBILE' }).expect(200)).body.data;
    expect(first).toMatchObject({ needsSignup: true, email: 'neha@sgn.test', companyId: org, companyName: 'Thinkvibes' });
    expect(first.accessToken).toBeUndefined();
    const made = await signup({ ...fields({ name: 'Neha K', employeeId: 'TV-3001', idProofType: 'PAN', idProofNumber: 'abcde1234f' }), email: 'neha@sgn.test', googleIdToken: tok }).expect(200);
    expect(made.body.data.memberships[0].status).toBe('PENDING');
    expect((await prisma.membership.findFirstOrThrow({ where: { user: { email: 'neha@sgn.test' } } })).idProofNumber).toBe('ABCDE1234F');
    expect((await api(app).post('/api/v1/auth/google').send({ idToken: tok, client: 'MOBILE' }).expect(200)).body.data.accessToken).toBeTruthy();
    await api(app).post('/api/v1/auth/google').send({ idToken: googleToken('neha@sgn.test', 'g-someone-else'), client: 'MOBILE' }).expect(401);
    await signup({ ...fields({ employeeId: 'TV-3002' }), email: 'ravi@sgn.test', googleIdToken: googleToken('neha@sgn.test', 'g-neha-0001') }).expect(401);
    await api(app).post('/api/v1/auth/google').send({ idToken: googleToken('ravi@sgn.test', 'g-ravi-0001', true), client: 'MOBILE' }).expect(401);
    expect((await api(app).post('/api/v1/auth/google').send({ idToken: googleToken('me@gmail.com', 'g-gmail-0001'), client: 'MOBILE' }).expect(400)).body.error.code).toBe('COMPANY_NOT_ON_RYDO');
  });

  it('HR sees the details and opens an ID photo; other companies and riders cannot', async () => {
    const list = (await api(app).get('/api/v1/admin/members?status=PENDING').set({ Authorization: `Bearer ${hrToken}`, 'x-org-id': org }).expect(200)).body.data as Record<string, unknown>[];
    expect(list.find((m) => m.employeeId === 'TV-1042')).toMatchObject({
      name: 'Priya Sharma',
      phone: '+91 98765 43210',
      jobTitle: 'Software engineer',
      department: 'Engineering',
      office: 'ORR campus',
      managerName: 'Rahul Mehta',
      managerEmail: 'rahul@sgn.test',
      idProofNumber: 'XXXX XXXX 9012',
      hasIdProof: false,
    });
    const meera = list.find((m) => m.employeeId === 'TV-1050')!;
    expect((await api(app).get(`/api/v1/admin/members/${meera.id}/id-proof-url`).set({ Authorization: `Bearer ${hrToken}`, 'x-org-id': org }).expect(200)).body.data.url).toContain('/id-proof-');
    expect(await prisma.auditLog.count({ where: { action: 'ID_PROOF_VIEWED', entityId: meera.id as string } })).toBe(1);
    await api(app).get(`/api/v1/admin/members/${meera.id}/id-proof-url`).set({ Authorization: `Bearer ${outsiderHr}`, 'x-org-id': other }).expect(404);
    const rider = (await signIn(app, messages, 'meera@sgn.test')).accessToken;
    await api(app).get(`/api/v1/admin/members/${meera.id}/id-proof-url`).set({ Authorization: `Bearer ${rider}`, 'x-org-id': org }).expect(403);
  });
});
