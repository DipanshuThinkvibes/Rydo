import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { companySearchSchema, type CompanyInfo } from '@rydo/shared';
import { ZodPipe } from '../common/zod.pipe';
import { AppError } from '../common/app-error';
import { Public } from '../auth/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

/**
 * "Find your company" on the sign-up screens (mobile and web): active companies by name, with the email domains,
 * department and office names the form offers. Public and rate-limited; it shows nothing about employees.
 */
@Controller('auth/companies')
export class CompaniesController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get()
  async search(@Query(new ZodPipe(companySearchSchema)) q: z.infer<typeof companySearchSchema>) {
    // Spaces and case don't matter ("thinkvibes" finds "Think Vibes"), and the email domain counts too ("thinkvibes.com").
    const term = `%${q.q.toLowerCase().replace(/\s+/g, '').replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const orgs = await this.prisma.$queryRaw<{ id: string; name: string; emailDomains: string[] }[]>`
      SELECT id, name, email_domains AS "emailDomains" FROM organizations
      WHERE status = 'ACTIVE'
        AND (replace(lower(name), ' ', '') LIKE ${term} OR EXISTS (SELECT 1 FROM unnest(email_domains) d WHERE lower(d) LIKE ${term}))
      ORDER BY name LIMIT 5`;
    return { data: await Promise.all(orgs.map((o) => this.info(o))) };
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get(':id')
  async one(@Param('id', ParseUUIDPipe) id: string) {
    const o = await this.prisma.organization.findFirst({ where: { id, status: 'ACTIVE' }, select: { id: true, name: true, emailDomains: true } });
    if (!o) throw new AppError('NOT_FOUND', 'Company not found.', 404);
    return { data: await this.info(o) };
  }

  private async info(o: { id: string; name: string; emailDomains: string[] }): Promise<CompanyInfo> {
    const [departments, offices] = await Promise.all([
      this.prisma.department.findMany({ where: { organizationId: o.id }, select: { name: true }, orderBy: { name: 'asc' } }),
      this.prisma.$queryRaw<{ name: string }[]>`SELECT name FROM offices WHERE organization_id = ${o.id}::uuid ORDER BY is_default DESC, name`,
    ]);
    return { id: o.id, name: o.name, domains: o.emailDomains, departments: departments.map((d) => d.name), offices: offices.map((x) => x.name) };
  }
}
