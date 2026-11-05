import { Controller, Get, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { auditQuerySchema } from '@rydo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ZodPipe } from '../common/zod.pipe';
import { PlatformAdmin } from '../tenancy/decorators';

/** RYDO owner console: who did what across all clients, and how the platform is doing today. */
@Controller('admin/platform')
@PlatformAdmin()
export class PlatformInsightsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('audit')
  async audit(@Query(new ZodPipe(auditQuerySchema)) q: z.infer<typeof auditQuerySchema>) {
    const where: Prisma.AuditLogWhereInput = {
      ...(q.platformOnly ? { organizationId: null } : q.organizationId ? { organizationId: q.organizationId } : {}),
      ...(q.action ? { action: q.action } : {}),
      ...(q.before ? { id: { lt: BigInt(q.before) } } : {}),
    };
    const rows = await this.prisma.auditLog.findMany({ where, orderBy: { id: 'desc' }, take: q.limit + 1 });
    const page = rows.slice(0, q.limit);
    const [users, orgs] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: [...new Set(page.map((r) => r.actorUserId).filter((x): x is string => !!x))] } }, select: { id: true, name: true, email: true } }),
      this.prisma.organization.findMany({ where: { id: { in: [...new Set(page.map((r) => r.organizationId).filter((x): x is string => !!x))] } }, select: { id: true, name: true } }),
    ]);
    const u = new Map(users.map((x) => [x.id, x]));
    const o = new Map(orgs.map((x) => [x.id, x.name]));
    return {
      data: page.map((r) => ({
        id: r.id.toString(),
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        before: r.before,
        after: r.after,
        createdAt: r.createdAt,
        organization: r.organizationId ? { id: r.organizationId, name: o.get(r.organizationId) ?? null } : null,
        actor: r.actorUserId ? { name: u.get(r.actorUserId)?.name ?? null, email: u.get(r.actorUserId)?.email ?? null } : null,
      })),
      meta: { next: rows.length > q.limit ? page[page.length - 1].id.toString() : null },
    };
  }

  @Get('audit/actions')
  async actions() {
    const rows = await this.prisma.auditLog.findMany({ distinct: ['action'], select: { action: true }, orderBy: { action: 'asc' } });
    return { data: rows.map((r) => r.action) };
  }

  /** One screen of platform health. A few grouped queries, no per-company loops. */
  @Get('health')
  async health() {
    const [[totals], usage, expiring, pending] = await Promise.all([
      this.prisma.$queryRaw<Record<string, number>[]>`
        SELECT
          (SELECT count(*)::int FROM organizations WHERE status = 'ACTIVE') AS "activeClients",
          (SELECT count(*)::int FROM organizations WHERE status <> 'ACTIVE') AS "inactiveClients",
          (SELECT count(*)::int FROM memberships WHERE status = 'ACTIVE') AS "activeMembers",
          (SELECT count(*)::int FROM memberships WHERE status = 'PENDING') AS "pendingMembers",
          (SELECT count(*)::int FROM driver_profiles WHERE status = 'VERIFIED') AS "verifiedDrivers",
          (SELECT count(*)::int FROM driver_profiles WHERE status = 'PENDING') AS "pendingDrivers",
          (SELECT count(*)::int FROM rides WHERE status <> 'CANCELLED' AND (depart_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date) AS "ridesToday",
          (SELECT count(*)::int FROM bookings b JOIN rides r ON r.id = b.ride_id WHERE (r.depart_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date AND b.status NOT IN ('CANCELLED_BY_RIDER', 'CANCELLED_BY_DRIVER')) AS "bookingsToday",
          (SELECT count(*)::int FROM ride_requests WHERE status = 'PENDING' AND expires_at > now()) AS "openRequests",
          (SELECT count(*)::int FROM bookings WHERE status IN ('CANCELLED_BY_RIDER', 'CANCELLED_BY_DRIVER') AND cancelled_at >= now() - interval '24 hours') AS "cancellations24h"`,
      this.prisma.$queryRaw<{ provider: string; sku: string; today: number; month: number }[]>`
        SELECT provider, sku,
          COALESCE(sum(count) FILTER (WHERE day = (now() AT TIME ZONE 'Asia/Kolkata')::date), 0)::int AS today,
          sum(count)::int AS month
        FROM usage_daily WHERE day >= date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata')::date
        GROUP BY provider, sku ORDER BY provider, sku`,
      this.prisma.$queryRaw<object[]>`
        SELECT d.id, d.kind::text AS kind, to_char(d.expires_at, 'YYYY-MM-DD') AS "expiresAt", u.name AS "driverName", o.id AS "organizationId", o.name AS "organizationName"
        FROM documents d
        JOIN driver_profiles p ON p.id = d.driver_profile_id
        JOIN memberships m ON m.id = p.membership_id
        JOIN users u ON u.id = m.user_id
        JOIN organizations o ON o.id = d.organization_id
        WHERE d.status = 'APPROVED' AND d.expires_at BETWEEN (now() AT TIME ZONE 'Asia/Kolkata')::date AND (now() AT TIME ZONE 'Asia/Kolkata')::date + 30
        ORDER BY d.expires_at LIMIT 10`,
      this.prisma.$queryRaw<object[]>`
        SELECT * FROM (
          SELECT o.id, o.name,
            (SELECT count(*)::int FROM memberships m WHERE m.organization_id = o.id AND m.status = 'PENDING') AS members,
            (SELECT count(*)::int FROM driver_profiles p JOIN memberships m ON m.id = p.membership_id WHERE m.organization_id = o.id AND p.status = 'PENDING') AS drivers
          FROM organizations o WHERE o.status = 'ACTIVE'
        ) x WHERE members + drivers > 0
        ORDER BY members + drivers DESC LIMIT 8`,
    ]);
    return { data: { totals, usage, expiring, pending: (pending as { members: number; drivers: number }[]).filter((p) => p.members + p.drivers > 0), jobs: await this.jobs() } };
  }

  /** Background jobs (pg-boss) in the last 24 hours. Null when the job tables are not there (e.g. tests). */
  private async jobs() {
    try {
      const [states, failed] = await Promise.all([
        this.prisma.$queryRaw<{ state: string; count: number }[]>`SELECT state::text, count(*)::int FROM pgboss.job WHERE created_on > now() - interval '24 hours' GROUP BY state`,
        this.prisma.$queryRaw<{ name: string; at: Date }[]>`SELECT name, completed_on AS at FROM pgboss.job WHERE state = 'failed' AND created_on > now() - interval '24 hours' ORDER BY completed_on DESC LIMIT 5`,
      ]);
      return { states: Object.fromEntries(states.map((s) => [s.state, s.count])), failed };
    } catch {
      return null;
    }
  }
}
