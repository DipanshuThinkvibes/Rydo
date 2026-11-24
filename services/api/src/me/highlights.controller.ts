import { Controller, Get } from '@nestjs/common';
import { licenseState, type OrgRoleName } from '@rydo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { Auth, Org, type AuthContext, type OrgContext } from '../common/request-context';
import { OrgOrPlatform } from '../tenancy/decorators';

export interface Highlight {
  key: string;
  label: string;
  value: number | string;
  hint?: string;
  href?: string;
}

/** Average car: about 120 g CO2 per km. Every shared seat is one car trip not made. */
const CO2_KG_PER_KM = 0.12;
const ORDER: OrgRoleName[] = ['ORG_ADMIN', 'HR_ADMIN', 'OPS_ADMIN', 'DRIVER', 'RIDER'];

/**
 * The few numbers that matter most to this person, for the top of their account page. Picked by their most senior role,
 * so an HR admin sees approvals, a driver sees riders carried, the RYDO owner sees clients and licences.
 * Counts only: nothing here names or describes a colleague.
 */
@Controller('me/highlights')
@OrgOrPlatform()
export class HighlightsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async highlights(@Auth() auth: AuthContext, @Org() org?: OrgContext) {
    if (!org) return { data: { persona: 'OWNER', tiles: await this.owner() } };
    const persona = ORDER.find((r) => org.roles.includes(r)) ?? 'RIDER';
    return { data: { persona, tiles: await this.member(persona, org, auth) } };
  }

  private async owner(): Promise<Highlight[]> {
    const [clients, licences, openReports, blocked] = await Promise.all([
      this.prisma.organization.count({ where: { status: 'ACTIVE' } }),
      this.prisma.license.findMany({ where: { organization: { status: { not: 'PENDING' } } } }),
      this.prisma.issueReport.count({ where: { status: { not: 'RESOLVED' } } }),
      this.prisma.membership.count({ where: { platformBlockedAt: { not: null } } }),
    ]);
    return [
      { key: 'clients', label: 'clients', value: clients, href: '/platform/clients' },
      { key: 'licences', label: 'active licences', value: licences.filter((l) => licenseState(l) === 'ACTIVE').length, href: '/platform/licenses' },
      { key: 'reports', label: 'open reports', value: openReports, href: '/platform/reports' },
      { key: 'blocked', label: 'blocked', value: blocked, href: '/platform/people?filter=blocked' },
    ];
  }

  private async rating(organizationId: string, membershipId: string) {
    const agg = await this.prisma.rating.aggregate({ where: { organizationId, rateeMembershipId: membershipId }, _avg: { stars: true }, _count: true });
    return agg._avg.stars ? `${Math.round(agg._avg.stars * 10) / 10} ★` : '–';
  }

  private async member(persona: OrgRoleName, org: OrgContext, auth: AuthContext): Promise<Highlight[]> {
    const organizationId = org.organizationId;
    const me = org.membershipId;
    const count = (status: 'ACTIVE' | 'PENDING' | 'SUSPENDED') => this.prisma.membership.count({ where: { organizationId, status } });

    if (persona === 'ORG_ADMIN') {
      const [employees, waiting, offices, trips] = await Promise.all([
        count('ACTIVE'),
        count('PENDING'),
        this.prisma.office.count({ where: { organizationId } }),
        this.prisma.booking.count({ where: { organizationId, status: 'COMPLETED', ride: { departAt: { gte: new Date(Date.now() - 30 * 86_400_000) } } } }),
      ]);
      return [
        { key: 'employees', label: 'employees', value: employees, href: '/employees' },
        { key: 'waiting', label: 'waiting for HR', value: waiting, href: '/employees' },
        { key: 'offices', label: 'offices', value: offices, href: '/structure' },
        { key: 'trips', label: 'trips, 30 days', value: trips, href: '/reports' },
      ];
    }
    if (persona === 'HR_ADMIN') {
      const [waiting, employees, paused, drivers] = await Promise.all([
        count('PENDING'),
        count('ACTIVE'),
        count('SUSPENDED'),
        this.prisma.driverProfile.count({ where: { status: 'PENDING', applicationStatus: 'WITH_HR', membership: { organizationId } } }),
      ]);
      return [
        { key: 'waiting', label: 'to approve', value: waiting, href: '/employees' },
        { key: 'employees', label: 'employees', value: employees, href: '/employees' },
        { key: 'drivers', label: 'drivers to verify', value: drivers, href: '/drivers' },
        { key: 'paused', label: 'paused', value: paused, href: '/employees' },
      ];
    }
    if (persona === 'OPS_ADMIN') {
      const [today, issues, sos, noShows] = await Promise.all([
        this.prisma.$queryRaw<{ n: number }[]>`
          SELECT count(*)::int AS n FROM rides r JOIN organizations o ON o.id = r.organization_id
          WHERE r.organization_id = ${organizationId}::uuid AND r.status <> 'CANCELLED'
            AND (r.depart_at AT TIME ZONE o.timezone)::date = (now() AT TIME ZONE o.timezone)::date`,
        this.prisma.issueReport.count({ where: { organizationId, status: { not: 'RESOLVED' } } }),
        this.prisma.sosEvent.count({ where: { organizationId, status: { not: 'RESOLVED' } } }),
        this.prisma.booking.count({ where: { organizationId, status: 'NO_SHOW', ride: { departAt: { gte: new Date(Date.now() - 30 * 86_400_000) } } } }),
      ]);
      return [
        { key: 'today', label: 'rides today', value: today[0]?.n ?? 0, href: '/ops' },
        { key: 'issues', label: 'open issues', value: issues, href: '/manage/issues' },
        { key: 'sos', label: 'SOS not resolved', value: sos, href: '/ops' },
        { key: 'noshows', label: 'no-shows, 30 days', value: noShows, href: '/reports' },
      ];
    }

    const [mine, rating, reliability] = await Promise.all([
      persona === 'DRIVER'
        ? this.prisma.$queryRaw<{ rides: number; riders: number }[]>`
            SELECT count(DISTINCT r.id)::int AS rides, COALESCE(sum(b.seats), 0)::int AS riders
            FROM rides r LEFT JOIN bookings b ON b.ride_id = r.id AND b.status = 'COMPLETED'
            WHERE r.organization_id = ${organizationId}::uuid AND r.driver_membership_id = ${me}::uuid AND r.status = 'COMPLETED'`
        : this.prisma.$queryRaw<{ trips: number; km: number }[]>`
            SELECT count(*)::int AS trips, COALESCE(round(sum(r.distance_meters * b.seats) / 1000.0), 0)::int AS km
            FROM bookings b JOIN rides r ON r.id = b.ride_id
            WHERE b.organization_id = ${organizationId}::uuid AND b.rider_membership_id = ${me}::uuid AND b.status = 'COMPLETED'`,
      this.rating(organizationId, me),
      this.prisma.membership.findUniqueOrThrow({ where: { id: me }, select: { reliabilityScore: true } }),
    ]);
    const r = Number(reliability.reliabilityScore);
    if (persona === 'DRIVER') {
      const d = mine[0] as { rides: number; riders: number } | undefined;
      return [
        { key: 'rides', label: 'rides offered', value: d?.rides ?? 0, href: '/drive' },
        { key: 'riders', label: 'riders carried', value: d?.riders ?? 0 },
        { key: 'rating', label: 'rating', value: rating },
        { key: 'reliability', label: 'reliability', value: r },
      ];
    }
    const t = mine[0] as { trips: number; km: number } | undefined;
    void auth;
    return [
      { key: 'trips', label: 'trips taken', value: t?.trips ?? 0, href: '/trips' },
      { key: 'co2', label: 'kg CO₂ saved', value: Math.round((t?.km ?? 0) * CO2_KG_PER_KM) },
      { key: 'rating', label: 'rating', value: rating },
      { key: 'reliability', label: 'reliability', value: r },
    ];
  }
}
