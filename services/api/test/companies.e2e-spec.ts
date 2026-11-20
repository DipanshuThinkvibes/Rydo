import { INestApplication } from '@nestjs/common';
import { api, createApp, resetDb } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/** "Find your company" for the sign-up screens: public, active companies only, no employee data. */
describe('Company search for sign-up', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let org: string;

  beforeAll(async () => {
    ({ app, prisma } = await createApp());
    await resetDb(prisma);
    org = (await prisma.organization.create({ data: { name: 'Thinkvibes', slug: 'cs', emailDomains: ['cs.test'], status: 'ACTIVE' } })).id;
    await prisma.organization.create({ data: { name: 'Thinkvibes Labs', slug: 'cs-p', emailDomains: ['p-cs.test'], status: 'PENDING' } });
    await prisma.department.createMany({ data: [{ organizationId: org, name: 'Sales' }, { organizationId: org, name: 'Engineering' }] });
    await prisma.$executeRawUnsafe(
      `INSERT INTO offices (id, organization_id, name, address, location, is_default) VALUES (gen_random_uuid(), '${org}', 'Head office', 'ORR', ST_SetSRID(ST_MakePoint(77.68, 12.93), 4326)::geography, true)`,
    );
  });
  afterAll(() => app.close());

  it('finds active companies by name with domains, departments and offices', async () => {
    const found = (await api(app).get('/api/v1/auth/companies?q=THINK').expect(200)).body.data;
    expect(found).toEqual([{ id: org, name: 'Thinkvibes', domains: ['cs.test'], departments: ['Engineering', 'Sales'], offices: ['Head office'] }]);
    // Spaces, case and the email domain all find it; LIKE wildcards are taken literally.
    expect((await api(app).get('/api/v1/auth/companies?q=think%20vibes').expect(200)).body.data.map((c: { name: string }) => c.name)).toEqual(['Thinkvibes']);
    expect((await api(app).get('/api/v1/auth/companies?q=cs.test').expect(200)).body.data.map((c: { name: string }) => c.name)).toEqual(['Thinkvibes']);
    expect((await api(app).get('/api/v1/auth/companies?q=%25%25').expect(200)).body.data).toEqual([]);
    await api(app).get('/api/v1/auth/companies?q=t').expect(400);
    expect((await api(app).get('/api/v1/auth/companies?q=nobody').expect(200)).body.data).toEqual([]);
  });

  it('returns one company by id; unknown or pending ones are not found', async () => {
    expect((await api(app).get(`/api/v1/auth/companies/${org}`).expect(200)).body.data.name).toBe('Thinkvibes');
    await api(app).get('/api/v1/auth/companies/00000000-0000-4000-8000-000000000000').expect(404);
  });
});
