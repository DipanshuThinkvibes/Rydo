import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppError } from '../common/app-error';
import { ZodPipe } from '../common/zod.pipe';
import { Auth, type AuthContext } from '../common/request-context';
import { PlatformAdmin } from '../tenancy/decorators';

const reasonSchema = z.object({ reason: z.string().trim().min(5, 'Give a short reason (at least 5 characters).').max(300) });
const peopleQuery = z.object({
  orgId: z.string().uuid().optional(),
  q: z.string().trim().max(60).optional(),
  status: z.enum(['ACTIVE', 'REJECTED', 'SUSPENDED', 'LEFT']).optional(),
  blocked: z.enum(['true', 'false']).optional(),
  flagged: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).max(500).default(1),
});
const reportsQuery = z.object({
  orgId: z.string().uuid().optional(),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED']).optional(),
  page: z.coerce.number().int().min(1).max(500).default(1),
});

/** Two or more reports against the same person within this many days flag them for a look. */
export const REPEAT_REPORT_DAYS = 90;
export const REPEAT_REPORT_COUNT = 2;
const PAGE = 25;

/** "priya.sharma@acme.com" becomes "p***@acme.com": enough to recognise, not enough to contact. */
export const maskEmail = (e: string) => {
  const [u, d] = e.split('@');
  return `${u.slice(0, 1)}***@${d}`;
};
/** "Priya Sharma" becomes "Priya S." */
export const shortName = (n: string) => {
  const p = n.trim().split(/\s+/);
  return p.length > 1 ? `${p[0]} ${p[p.length - 1][0]}.` : p[0];
};

/**
 * RYDO owner console, people side. The super admin sees who is on each company and can block or unblock a person,
 * but never phone numbers, full emails, ID proofs, places, rides or chats: only what is needed to act.
 */
@Controller('admin/platform')
@PlatformAdmin()
export class PlatformPeopleController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private since() {
    return new Date(Date.now() - REPEAT_REPORT_DAYS * 86_400_000);
  }

  /** Reports against each person: all time, and inside the repeat window. */
  private async reportCounts(ids: string[]) {
    const m = new Map<string, { total: number; recent: number }>();
    if (!ids.length) return m;
    const [all, recent] = await Promise.all([
      this.prisma.issueReport.groupBy({ by: ['againstMembershipId'], where: { againstMembershipId: { in: ids } }, _count: true }),
      this.prisma.issueReport.groupBy({ by: ['againstMembershipId'], where: { againstMembershipId: { in: ids }, createdAt: { gte: this.since() } }, _count: true }),
    ]);
    for (const r of all) m.set(r.againstMembershipId!, { total: r._count, recent: 0 });
    for (const r of recent) m.get(r.againstMembershipId!)!.recent = r._count;
    return m;
  }

  @Get('people')
  async people(@Query(new ZodPipe(peopleQuery)) q: z.infer<typeof peopleQuery>) {
    const where: Prisma.MembershipWhereInput = { status: { not: 'PENDING' } };
    if (q.orgId) where.organizationId = q.orgId;
    if (q.status) where.status = q.status;
    if (q.blocked === 'true') where.platformBlockedAt = { not: null };
    if (q.blocked === 'false') where.platformBlockedAt = null;
    if (q.q) where.user = { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { email: { contains: q.q, mode: 'insensitive' } }] };
    if (q.flagged === 'true') {
      const grouped = await this.prisma.issueReport.groupBy({ by: ['againstMembershipId'], where: { againstMembershipId: { not: null }, createdAt: { gte: this.since() } }, _count: true });
      where.id = { in: grouped.filter((g) => g._count >= REPEAT_REPORT_COUNT).map((g) => g.againstMembershipId!) };
    }
    const [total, rows] = await Promise.all([
      this.prisma.membership.count({ where }),
      this.prisma.membership.findMany({
        where,
        include: { user: { select: { name: true, email: true } }, organization: { select: { id: true, name: true } }, roles: true, department: { select: { name: true } } },
        orderBy: [{ platformBlockedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
        skip: (q.page - 1) * PAGE,
        take: PAGE,
      }),
    ]);
    const counts = await this.reportCounts(rows.map((r) => r.id));
    return {
      data: {
        total,
        page: q.page,
        pageSize: PAGE,
        rows: rows.map((m) => {
          const c = counts.get(m.id) ?? { total: 0, recent: 0 };
          return {
            id: m.id,
            name: shortName(m.user.name),
            email: maskEmail(m.user.email),
            organization: m.organization,
            roles: m.roles.map((r) => r.role),
            department: m.department?.name ?? null,
            status: m.status,
            blocked: !!m.platformBlockedAt,
            blockedAt: m.platformBlockedAt,
            blockReason: m.platformBlockReason,
            reportsAgainst: c.total,
            recentReportsAgainst: c.recent,
            flagged: c.recent >= REPEAT_REPORT_COUNT,
          };
        }),
      },
    };
  }

  @Get('people/:id')
  async person(@Param('id', ParseUUIDPipe) id: string) {
    const m = await this.prisma.membership.findUnique({
      where: { id },
      include: { user: { select: { name: true, email: true } }, organization: { select: { id: true, name: true } }, roles: true },
    });
    if (!m) throw new AppError('NOT_FOUND', 'Person not found.', 404);
    const [reports, history, c] = await Promise.all([
      this.prisma.issueReport.findMany({ where: { againstMembershipId: id }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, category: true, status: true, description: true, createdAt: true } }),
      this.prisma.auditLog.findMany({ where: { entityType: 'membership', entityId: id, action: { in: ['PLATFORM_MEMBER_BLOCKED', 'PLATFORM_MEMBER_UNBLOCKED'] } }, orderBy: { createdAt: 'desc' }, take: 20, select: { action: true, createdAt: true, after: true } }),
      this.reportCounts([id]),
    ]);
    const cnt = c.get(id) ?? { total: 0, recent: 0 };
    return {
      data: {
        id: m.id,
        name: shortName(m.user.name),
        email: maskEmail(m.user.email),
        organization: m.organization,
        roles: m.roles.map((r) => r.role),
        status: m.status,
        blocked: !!m.platformBlockedAt,
        blockedAt: m.platformBlockedAt,
        blockReason: m.platformBlockReason,
        reportsAgainst: cnt.total,
        recentReportsAgainst: cnt.recent,
        flagged: cnt.recent >= REPEAT_REPORT_COUNT,
        reports: reports.map((r) => ({ ...r, description: r.description.slice(0, 300) })),
        history,
      },
    };
  }

  /** Blocks one person in one company at once. The company's own admin cannot lift it. */
  @Post('people/:id/block')
  @HttpCode(200)
  async block(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(reasonSchema)) b: z.infer<typeof reasonSchema>) {
    const m = await this.prisma.membership.findUnique({ where: { id } });
    if (!m) throw new AppError('NOT_FOUND', 'Person not found.', 404);
    if (m.userId === auth.userId) throw new AppError('CONFLICT', "You can't block yourself.", 409);
    if (m.platformBlockedAt) throw new AppError('CONFLICT', 'This person is already blocked.', 409);
    if (m.status !== 'ACTIVE' && m.status !== 'SUSPENDED') throw new AppError('CONFLICT', `Only active or suspended people can be blocked (this one is ${m.status.toLowerCase()}).`, 409);
    await this.prisma.$transaction(async (tx) => {
      await tx.membership.update({ where: { id }, data: { status: 'SUSPENDED', platformBlockedAt: new Date(), platformBlockReason: b.reason, platformBlockedById: auth.userId } });
      await this.audit.log({ organizationId: m.organizationId, actorUserId: auth.userId, action: 'PLATFORM_MEMBER_BLOCKED', entityType: 'membership', entityId: id, before: { status: m.status }, after: { status: 'SUSPENDED', reason: b.reason } }, tx);
      await tx.notification.create({ data: { userId: m.userId, organizationId: m.organizationId, type: 'ACCOUNT_BLOCKED', title: 'Your RYDO access was paused', body: 'RYDO support paused your access to this company. Contact RYDO support if you think this is a mistake.' } });
    });
    return { data: { id, status: 'SUSPENDED', blocked: true } };
  }

  @Post('people/:id/unblock')
  @HttpCode(200)
  async unblock(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(reasonSchema)) b: z.infer<typeof reasonSchema>) {
    const m = await this.prisma.membership.findUnique({ where: { id } });
    if (!m) throw new AppError('NOT_FOUND', 'Person not found.', 404);
    if (!m.platformBlockedAt) throw new AppError('CONFLICT', 'This person is not blocked.', 409);
    await this.prisma.$transaction(async (tx) => {
      await tx.membership.update({ where: { id }, data: { status: 'ACTIVE', platformBlockedAt: null, platformBlockReason: null, platformBlockedById: null } });
      await this.audit.log({ organizationId: m.organizationId, actorUserId: auth.userId, action: 'PLATFORM_MEMBER_UNBLOCKED', entityType: 'membership', entityId: id, before: { status: m.status, reason: m.platformBlockReason }, after: { status: 'ACTIVE', reason: b.reason } }, tx);
      await tx.notification.create({ data: { userId: m.userId, organizationId: m.organizationId, type: 'ACCOUNT_UNBLOCKED', title: 'Your RYDO access is back', body: 'RYDO support restored your access to this company.' } });
    });
    return { data: { id, status: 'ACTIVE', blocked: false } };
  }

  /** Every company's complaints in one queue: names shortened, no places or contact details. */
  @Get('reports')
  async reports(@Query(new ZodPipe(reportsQuery)) q: z.infer<typeof reportsQuery>) {
    const where: Prisma.IssueReportWhereInput = {};
    if (q.orgId) where.organizationId = q.orgId;
    if (q.status) where.status = q.status;
    const [total, rows] = await Promise.all([
      this.prisma.issueReport.count({ where }),
      this.prisma.issueReport.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * PAGE, take: PAGE }),
    ]);
    const ids = [...new Set(rows.flatMap((r) => [r.reporterMembershipId, r.againstMembershipId].filter((x): x is string => !!x)))];
    const [people, orgs, counts] = await Promise.all([
      this.prisma.membership.findMany({ where: { id: { in: ids } }, select: { id: true, platformBlockedAt: true, user: { select: { name: true } } } }),
      this.prisma.organization.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.organizationId))] } }, select: { id: true, name: true } }),
      this.reportCounts(rows.map((r) => r.againstMembershipId).filter((x): x is string => !!x)),
    ]);
    const p = new Map(people.map((x) => [x.id, x]));
    const o = new Map(orgs.map((x) => [x.id, x.name]));
    return {
      data: {
        total,
        page: q.page,
        pageSize: PAGE,
        rows: rows.map((r) => {
          const against = r.againstMembershipId ? p.get(r.againstMembershipId) : undefined;
          const c = r.againstMembershipId ? counts.get(r.againstMembershipId) : undefined;
          return {
            id: r.id,
            organization: o.get(r.organizationId) ?? '',
            category: r.category,
            status: r.status,
            description: r.description.slice(0, 300),
            createdAt: r.createdAt,
            resolvedAt: r.resolvedAt,
            reporter: shortName(p.get(r.reporterMembershipId)?.user.name ?? 'Someone'),
            against: against ? { membershipId: r.againstMembershipId, name: shortName(against.user.name), blocked: !!against.platformBlockedAt, reportsAgainst: c?.total ?? 0, flagged: (c?.recent ?? 0) >= REPEAT_REPORT_COUNT } : null,
          };
        }),
      },
    };
  }

  /** The numbers on top of the safety page. */
  @Get('reports/summary')
  async summary() {
    const grouped = await this.prisma.issueReport.groupBy({ by: ['againstMembershipId'], where: { againstMembershipId: { not: null }, createdAt: { gte: this.since() } }, _count: true });
    const [openReports, activeSos, blocked] = await Promise.all([
      this.prisma.issueReport.count({ where: { status: { not: 'RESOLVED' } } }),
      this.prisma.sosEvent.count({ where: { status: { not: 'RESOLVED' } } }),
      this.prisma.membership.count({ where: { platformBlockedAt: { not: null } } }),
    ]);
    return { data: { openReports, activeSos, blocked, flaggedPeople: grouped.filter((g) => g._count >= REPEAT_REPORT_COUNT).length, repeatRule: { reports: REPEAT_REPORT_COUNT, days: REPEAT_REPORT_DAYS } } };
  }
}
