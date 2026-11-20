import { INestApplication } from '@nestjs/common';
import { api, createApp, resetDb } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/** The sign-up screen finds a company by name from the real database. */
describe('Public company search', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createApp());
    await resetDb(prisma);
    const a = await prisma.organization.create({ data: { licenses: { create: [{ product: 'SHARE' }] }, name: 'Thinkvibes', slug: 'tv', emailDomains: ['thinkvibes.com'], status: 'ACTIVE', contactEmail: 'secret@tv.com' } });
    await prisma.department.createMany({ data: [{ organizationId: a.id, name: 'Engineering' }, { organizationId: a.id, name: 'Design' }] });
    await prisma.organization.create({ data: { licenses: { create: [{ product: 'SHARE' }] }, name: 'Thinkwaiting', slug: 'tw', emailDomains: ['tw.com'], status: 'PENDING' } });
  });
  afterAll(() => app.close());

  it('finds a live company without signing in, ignoring case, with only the sign-up details', async () => {
    const r = (await api(app).get('/api/v1/public/companies?q=THINK').expect(200)).body.data;
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ name: 'Thinkvibes', domains: ['thinkvibes.com'], departments: ['Design', 'Engineering'], offices: [] });
    expect(JSON.stringify(r)).not.toContain('secret@tv.com');
  });

  it('hides companies that are not live, and needs 2 letters', async () => {
    expect((await api(app).get('/api/v1/public/companies?q=waiting').expect(200)).body.data).toEqual([]);
    expect((await api(app).get('/api/v1/public/companies?q=t').expect(200)).body.data).toEqual([]);
    expect((await api(app).get('/api/v1/public/companies').expect(200)).body.data).toEqual([]);
  });
});
