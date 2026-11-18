import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { IssueCategoryName, IssueCreate, IssueQuery, IssueStatusName, IssueUpdate } from '@rydo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AppError } from '../common/app-error';
import type { OrgContext } from '../common/request-context';

const LABEL: Record<IssueCategoryName, string> = {
  UNSAFE_DRIVING: 'Unsafe driving',
  HARASSMENT: 'Harassment or conduct',
  LATE_OR_NO_SHOW: 'Late or no-show',
  ROUTE: 'Route problem',
  COST: 'Cost or payment question',
  APP_BUG: 'App problem',
  OTHER: 'Other',
};

/** Allowed moves. A resolved report can be reopened; nothing skips the audit trail. */
const MOVES: Record<IssueStatusName, IssueStatusName[]> = {
  OPEN: ['IN_PROGRESS', 'RESOLVED'],
  IN_PROGRESS: ['RESOLVED', 'OPEN'],
  RESOLVED: ['IN_PROGRESS'],
};

type Row = {
  id: string;
  category: IssueCategoryName;
  description: string;
  status: IssueStatusName;
  resolution: string | null;
  rideId: string | null;
  reporterMembershipId: string;
  againstMembershipId: string | null;
  assignedToId: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Issue reports: any member reports; this company's admins track each one from open to resolved. */
@Injectable()
export class IssuesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notify: NotificationsService,
  ) {}

  private async names(ids: (string | null)[]) {
    const unique = [...new Set(ids.filter((i): i is string => !!i))];
    if (!unique.length) return new Map<string, string>();
    const rows = await this.prisma.membership.findMany({ where: { id: { in: unique } }, select: { id: true, user: { select: { name: true } } } });
    return new Map(rows.map((r) => [r.id, r.user.name]));
  }

  private async rideLabels(ids: (string | null)[]) {
    const unique = [...new Set(ids.filter((i): i is string => !!i))];
    if (!unique.length) return new Map<string, { from: string; to: string; departAt: Date }>();
    const rows = await this.prisma.ride.findMany({ where: { id: { in: unique } }, select: { id: true, originLabel: true, destinationLabel: true, departAt: true } });
    return new Map(rows.map((r) => [r.id, { from: r.originLabel, to: r.destinationLabel, departAt: r.departAt }]));
  }

  private shape(r: Row, names: Map<string, string>, rides: Map<string, { from: string; to: string; departAt: Date }>, admin: boolean) {
    return {
      id: r.id,
      category: r.category,
      categoryLabel: LABEL[r.category],
      description: r.description,
      status: r.status,
      resolution: r.resolution,
      ride: r.rideId ? { id: r.rideId, ...(rides.get(r.rideId) ?? {}) } : null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      resolvedAt: r.resolvedAt,
      ...(admin
        ? {
            reporter: { membershipId: r.reporterMembershipId, name: names.get(r.reporterMembershipId) ?? 'Former member' },
            against: r.againstMembershipId ? { membershipId: r.againstMembershipId, name: names.get(r.againstMembershipId) ?? 'Former member' } : null,
            assignedTo: r.assignedToId ? { membershipId: r.assignedToId, name: names.get(r.assignedToId) ?? 'Former member' } : null,
          }
        : {}),
    };
  }

  async create(org: OrgContext, actorUserId: string, b: IssueCreate) {
    if (b.rideId) {
      const ride = await this.prisma.ride.findFirst({ where: { id: b.rideId, organizationId: org.organizationId }, select: { driverMembershipId: true } });
      if (!ride) throw new AppError('NOT_FOUND', 'Ride not found.', 404);
      const took = ride.driverMembershipId === org.membershipId || !!(await this.prisma.booking.findFirst({ where: { rideId: b.rideId, riderMembershipId: org.membershipId }, select: { id: true } }));
      if (!took) throw new AppError('FORBIDDEN', 'You can only report a ride you were part of.', 403);
    }
    if (b.againstMembershipId) {
      if (b.againstMembershipId === org.membershipId) throw new AppError('VALIDATION_ERROR', "You can't report yourself.", 400, { againstMembershipId: 'Pick someone else' });
      const other = await this.prisma.membership.findFirst({ where: { id: b.againstMembershipId, organizationId: org.organizationId }, select: { id: true } });
      if (!other) throw new AppError('NOT_FOUND', 'That person is not in your company.', 404);
    }
    const issue = await this.prisma.issueReport.create({
      data: { organizationId: org.organizationId, reporterMembershipId: org.membershipId, rideId: b.rideId, againstMembershipId: b.againstMembershipId, category: b.category, description: b.description },
    });
    await this.audit.log({ organizationId: org.organizationId, actorUserId, action: 'ISSUE_REPORTED', entityType: 'issue_report', entityId: issue.id, after: { category: b.category, rideId: b.rideId ?? null } });
    // Admins hear about every report straight away (in-app, phone and email).
    const who = (await this.names([org.membershipId])).get(org.membershipId) ?? 'Someone';
    await this.notify.notifyAdmins(org.organizationId, {
      type: 'ISSUE_REPORTED',
      title: `New issue: ${LABEL[b.category]}`,
      body: `${who} reported: ${b.description.slice(0, 160)}${b.description.length > 160 ? '…' : ''}`,
      data: { issueId: issue.id },
      email: true,
    });
    return this.shape(issue as Row, new Map(), new Map(), false);
  }

  async mine(org: OrgContext) {
    const rows = (await this.prisma.issueReport.findMany({ where: { organizationId: org.organizationId, reporterMembershipId: org.membershipId }, orderBy: { createdAt: 'desc' }, take: 100 })) as Row[];
    const rides = await this.rideLabels(rows.map((r) => r.rideId));
    return rows.map((r) => this.shape(r, new Map(), rides, false));
  }

  async adminList(org: OrgContext, q: IssueQuery) {
    const where: Prisma.IssueReportWhereInput = { organizationId: org.organizationId, ...(q.status ? { status: q.status } : {}), ...(q.category ? { category: q.category } : {}) };
    if (q.cursor) {
      const [iso, id] = q.cursor.split('|');
      const at = new Date(iso);
      if (!id || Number.isNaN(at.getTime())) throw new AppError('VALIDATION_ERROR', 'Bad cursor.', 400, { cursor: 'Invalid' });
      where.OR = [{ createdAt: { lt: at } }, { createdAt: at, id: { lt: id } }];
    }
    const [rows, counts] = await Promise.all([
      this.prisma.issueReport.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: q.limit + 1 }) as Promise<Row[]>,
      this.prisma.issueReport.groupBy({ by: ['status'], where: { organizationId: org.organizationId }, _count: true }),
    ]);
    const page = rows.slice(0, q.limit);
    const names = await this.names(page.flatMap((r) => [r.reporterMembershipId, r.againstMembershipId, r.assignedToId]));
    const rides = await this.rideLabels(page.map((r) => r.rideId));
    const last = page[page.length - 1];
    return {
      data: page.map((r) => this.shape(r, names, rides, true)),
      meta: {
        nextCursor: rows.length > q.limit && last ? `${last.createdAt.toISOString()}|${last.id}` : null,
        counts: { OPEN: 0, IN_PROGRESS: 0, RESOLVED: 0, ...Object.fromEntries(counts.map((c) => [c.status, c._count])) },
      },
    };
  }

  async adminGet(org: OrgContext, id: string) {
    const r = (await this.prisma.issueReport.findFirst({ where: { id, organizationId: org.organizationId } })) as Row | null;
    if (!r) throw new AppError('NOT_FOUND', 'Report not found.', 404);
    const names = await this.names([r.reporterMembershipId, r.againstMembershipId, r.assignedToId]);
    const rides = await this.rideLabels([r.rideId]);
    return this.shape(r, names, rides, true);
  }

  async adminUpdate(org: OrgContext, actorUserId: string, id: string, b: IssueUpdate) {
    const r = (await this.prisma.issueReport.findFirst({ where: { id, organizationId: org.organizationId } })) as Row | null;
    if (!r) throw new AppError('NOT_FOUND', 'Report not found.', 404);
    const status = b.status ?? r.status;
    if (b.status && b.status !== r.status && !MOVES[r.status].includes(b.status)) {
      throw new AppError('CONFLICT', `A report that is ${r.status.toLowerCase().replace('_', ' ')} can't move to ${b.status.toLowerCase().replace('_', ' ')}.`, 409);
    }
    const resolution = b.resolution ?? r.resolution;
    if (status === 'RESOLVED' && !resolution) throw new AppError('VALIDATION_ERROR', 'Say how it was resolved.', 400, { resolution: 'Required to resolve' });
    const takeIt = b.assignToMe || (status === 'IN_PROGRESS' && !r.assignedToId);
    const data: Prisma.IssueReportUncheckedUpdateInput = {
      status,
      resolution,
      ...(takeIt ? { assignedToId: org.membershipId } : {}),
      resolvedAt: status === 'RESOLVED' ? (r.resolvedAt ?? new Date()) : null,
    };
    // Support view is read-only (the guard stops it), so the stand-in membership never reaches here.
    const updated = (await this.prisma.issueReport.update({ where: { id }, data })) as Row;
    await this.audit.log({
      organizationId: org.organizationId,
      actorUserId,
      action: 'ISSUE_UPDATED',
      entityType: 'issue_report',
      entityId: id,
      before: { status: r.status, resolution: r.resolution, assignedToId: r.assignedToId },
      after: { status: updated.status, resolution: updated.resolution, assignedToId: updated.assignedToId },
    });
    if (status !== r.status) {
      const title = status === 'RESOLVED' ? 'Your report was resolved' : status === 'IN_PROGRESS' ? 'We are looking into your report' : 'Your report was reopened';
      await this.notify.notifyMembership(r.reporterMembershipId, { type: 'ISSUE_UPDATE', title, body: status === 'RESOLVED' ? (resolution ?? '') : `${LABEL[r.category]}: ${r.description.slice(0, 120)}`, data: { issueId: id, status }, email: status === 'RESOLVED' });
    }
    return this.adminGet(org, id);
  }
}
