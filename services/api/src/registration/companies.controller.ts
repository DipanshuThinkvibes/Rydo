import { Controller, Get, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Public company search for the sign-up screen: only companies that are live on RYDO, and only what a new employee
 * needs to pick theirs (name, email domains, departments, office names). Needs 2+ letters so nobody can list everyone.
 * Used by the web and the mobile sign-up.
 */
@Controller('public/companies')
export class PublicCompaniesController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get()
  async search(@Query('q') q?: string) {
    const text = (q ?? '').trim().slice(0, 60);
    if (text.length < 2) return { data: [] };
    // Spaces and capitals don't matter ("thinkvibes" finds "Think Vibes"), and the email domain counts too ("thinkvibes.com").
    const term = `%${text.toLowerCase().replace(/\s+/g, '').replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const ids = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM organizations
      WHERE status = 'ACTIVE'
        AND (replace(lower(name), ' ', '') LIKE ${term} OR EXISTS (SELECT 1 FROM unnest(email_domains) d WHERE lower(d) LIKE ${term}))
      ORDER BY name LIMIT 8`;
    const orgs = await this.prisma.organization.findMany({
      where: { id: { in: ids.map((r) => r.id) } },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        emailDomains: true,
        departments: { select: { name: true }, orderBy: { name: 'asc' } },
        offices: { select: { name: true }, orderBy: { name: 'asc' } },
      },
    });
    return { data: orgs.map((o) => ({ id: o.id, name: o.name, domains: o.emailDomains, departments: o.departments.map((d) => d.name), offices: o.offices.map((f) => f.name) })) };
  }
}
