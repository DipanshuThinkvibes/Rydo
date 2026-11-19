import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { FeedbackCategoryName, FeedbackCreate, FeedbackQuery, FeedbackUpdate } from '@rydo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppError } from '../common/app-error';
import type { OrgContext } from '../common/request-context';

const CATEGORY_LABEL: Record<FeedbackCategoryName, string> = {
  USABILITY: 'App usability and interface',
  MATCHING: 'Ride matching and suggestions',
  COMMUNICATION: 'Chat and notifications',
  COST_SHARING: 'Cost sharing',
  GENERAL: 'General comments and ideas',
};

const STOP = new Set(
  'the and for that this with have from your are was were not but you can will would could should there their them they what when where which while about into over also than then just very more most some any been being does did done our out all one has had its it\'s dont cant wont too use used using get got make made like need want please thanks thank rydo app ride rides driver rider'.split(' '),
);

/** CSV cell: quoted, and safe to open in Excel (no formula injection). */
function cell(v: unknown) {
  let s = v == null ? '' : v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** The always-available feedback form, and what the company's admins learn from it. */
@Injectable()
export class FeedbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(org: OrgContext, b: FeedbackCreate) {
    const f = await this.prisma.feedback.create({ data: { organizationId: org.organizationId, membershipId: org.membershipId, category: b.category, rating: b.rating, comment: b.comment } });
    return { id: f.id, category: f.category, rating: f.rating, comment: f.comment, status: f.status, createdAt: f.createdAt };
  }

  async mine(org: OrgContext) {
    const rows = await this.prisma.feedback.findMany({ where: { organizationId: org.organizationId, membershipId: org.membershipId }, orderBy: { createdAt: 'desc' }, take: 100 });
    return rows.map((f) => ({ id: f.id, category: f.category, rating: f.rating, comment: f.comment, status: f.status, createdAt: f.createdAt }));
  }

  private async names(ids: string[]) {
    const rows = await this.prisma.membership.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, user: { select: { name: true } } } });
    return new Map(rows.map((r) => [r.id, r.user.name]));
  }

  async adminList(org: OrgContext, q: FeedbackQuery) {
    const where: Prisma.FeedbackWhereInput = { organizationId: org.organizationId, ...(q.status ? { status: q.status } : {}), ...(q.category ? { category: q.category } : {}) };
    if (q.cursor) {
      const [iso, id] = q.cursor.split('|');
      const at = new Date(iso);
      if (!id || Number.isNaN(at.getTime())) throw new AppError('VALIDATION_ERROR', 'Bad cursor.', 400, { cursor: 'Invalid' });
      where.OR = [{ createdAt: { lt: at } }, { createdAt: at, id: { lt: id } }];
    }
    const [rows, byCategory] = await Promise.all([
      this.prisma.feedback.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: q.limit + 1 }),
      this.prisma.feedback.groupBy({ by: ['category'], where: { organizationId: org.organizationId }, _count: true }),
    ]);
    const page = rows.slice(0, q.limit);
    const names = await this.names(page.map((f) => f.membershipId));
    const last = page[page.length - 1];
    return {
      data: page.map((f) => ({
        id: f.id,
        category: f.category,
        categoryLabel: CATEGORY_LABEL[f.category],
        rating: f.rating,
        comment: f.comment,
        status: f.status,
        adminNote: f.adminNote,
        from: { membershipId: f.membershipId, name: names.get(f.membershipId) ?? 'Former member' },
        reviewedAt: f.reviewedAt,
        createdAt: f.createdAt,
      })),
      meta: {
        nextCursor: rows.length > q.limit && last ? `${last.createdAt.toISOString()}|${last.id}` : null,
        categories: Object.fromEntries(byCategory.map((c) => [c.category, c._count])),
      },
    };
  }

  async adminUpdate(org: OrgContext, actorUserId: string, id: string, b: FeedbackUpdate) {
    const f = await this.prisma.feedback.findFirst({ where: { id, organizationId: org.organizationId } });
    if (!f) throw new AppError('NOT_FOUND', 'Feedback not found.', 404);
    const status = b.status ?? f.status;
    const updated = await this.prisma.feedback.update({
      where: { id },
      data: { status, adminNote: b.adminNote ?? f.adminNote, ...(status !== 'NEW' && !f.reviewedAt ? { reviewedById: org.membershipId, reviewedAt: new Date() } : {}) },
    });
    await this.audit.log({ organizationId: org.organizationId, actorUserId, action: 'FEEDBACK_UPDATED', entityType: 'feedback', entityId: id, before: { status: f.status }, after: { status: updated.status } });
    return { id, status: updated.status, adminNote: updated.adminNote, reviewedAt: updated.reviewedAt };
  }

  /** Every feedback entry as CSV (newest first, up to 5,000). */
  async exportCsv(org: OrgContext, actorUserId: string) {
    const rows = await this.prisma.feedback.findMany({ where: { organizationId: org.organizationId }, orderBy: { createdAt: 'desc' }, take: 5000 });
    const names = await this.names(rows.map((f) => f.membershipId));
    await this.audit.log({ organizationId: org.organizationId, actorUserId, action: 'FEEDBACK_EXPORTED', entityType: 'feedback', entityId: org.organizationId, after: { rows: rows.length } });
    const head = ['Date', 'Category', 'Rating', 'Status', 'From', 'Comment', 'Admin note'];
    const body = rows.map((f) => [f.createdAt, CATEGORY_LABEL[f.category], f.rating, f.status, names.get(f.membershipId) ?? '', f.comment, f.adminNote]);
    return '﻿' + [head, ...body].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
  }

  /** Ratings trend, feedback and issue breakdowns, resolution times and recurring words, for the last N days. */
  async insights(org: OrgContext, days: number) {
    const orgId = org.organizationId;
    const since = new Date(Date.now() - days * 86_400_000);
    const [ratingTrend, ratingAll, feedbackByCategory, feedbackByStatus, issuesByCategory, issueTotals, resolutionTrend, surveyStats, feedbackText, issueText] = await Promise.all([
      this.prisma.$queryRaw<{ week: string; avg: number; count: number }[]>`
        SELECT to_char(date_trunc('week', created_at), 'YYYY-MM-DD') AS week, round(avg(stars)::numeric, 2)::float AS avg, count(*)::int AS count
        FROM ratings WHERE organization_id = ${orgId}::uuid AND created_at >= ${since} GROUP BY 1 ORDER BY 1`,
      this.prisma.rating.aggregate({ where: { organizationId: orgId, createdAt: { gte: since } }, _avg: { stars: true }, _count: true }),
      this.prisma.feedback.groupBy({ by: ['category'], where: { organizationId: orgId, createdAt: { gte: since } }, _count: true, _avg: { rating: true } }),
      this.prisma.feedback.groupBy({ by: ['status'], where: { organizationId: orgId, createdAt: { gte: since } }, _count: true }),
      this.prisma.$queryRaw<{ category: string; total: number; resolved: number; avgHours: number | null }[]>`
        SELECT category::text AS category, count(*)::int AS total, (count(*) FILTER (WHERE status = 'RESOLVED'))::int AS resolved,
          round((avg(extract(epoch FROM resolved_at - created_at) / 3600) FILTER (WHERE resolved_at IS NOT NULL))::numeric, 1)::float AS "avgHours"
        FROM issue_reports WHERE organization_id = ${orgId}::uuid AND created_at >= ${since} GROUP BY 1 ORDER BY 2 DESC`,
      this.prisma.$queryRaw<{ open: number; inProgress: number; resolved: number; avgHours: number | null }[]>`
        SELECT (count(*) FILTER (WHERE status = 'OPEN'))::int AS open, (count(*) FILTER (WHERE status = 'IN_PROGRESS'))::int AS "inProgress",
          (count(*) FILTER (WHERE status = 'RESOLVED'))::int AS resolved,
          round((avg(extract(epoch FROM resolved_at - created_at) / 3600) FILTER (WHERE resolved_at IS NOT NULL))::numeric, 1)::float AS "avgHours"
        FROM issue_reports WHERE organization_id = ${orgId}::uuid AND created_at >= ${since}`,
      this.prisma.$queryRaw<{ week: string; avgHours: number; resolved: number }[]>`
        SELECT to_char(date_trunc('week', resolved_at), 'YYYY-MM-DD') AS week, round((avg(extract(epoch FROM resolved_at - created_at) / 3600))::numeric, 1)::float AS "avgHours", count(*)::int AS resolved
        FROM issue_reports WHERE organization_id = ${orgId}::uuid AND resolved_at IS NOT NULL AND resolved_at >= ${since} GROUP BY 1 ORDER BY 1`,
      this.prisma.$queryRaw<{ published: number; avgResponseRate: number | null }[]>`
        SELECT count(*)::int AS published,
          round((avg(CASE WHEN s.audience_size > 0 THEN (SELECT count(*) FROM survey_responses r WHERE r.survey_id = s.id)::float / s.audience_size END))::numeric, 3)::float AS "avgResponseRate"
        FROM surveys s WHERE s.organization_id = ${orgId}::uuid AND s.status <> 'DRAFT' AND s.published_at >= ${since}`,
      this.prisma.feedback.findMany({ where: { organizationId: orgId, createdAt: { gte: since } }, select: { comment: true }, take: 3000 }),
      this.prisma.issueReport.findMany({ where: { organizationId: orgId, createdAt: { gte: since } }, select: { description: true }, take: 3000 }),
    ]);

    // Recurring words across feedback and issue reports (a simple keyword count, no AI).
    const counts = new Map<string, number>();
    for (const text of [...feedbackText.map((f) => f.comment), ...issueText.map((i) => i.description)]) {
      for (const w of new Set(text.toLowerCase().match(/[a-z][a-z']{3,}/g) ?? [])) if (!STOP.has(w)) counts.set(w, (counts.get(w) ?? 0) + 1);
    }
    const themes = [...counts.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([word, mentions]) => ({ word, mentions }));

    return {
      days,
      rides: { averageRating: ratingAll._avg.stars ? Math.round(ratingAll._avg.stars * 100) / 100 : null, ratings: ratingAll._count, trend: ratingTrend },
      feedback: {
        total: feedbackByCategory.reduce((n, c) => n + c._count, 0),
        byCategory: feedbackByCategory.map((c) => ({ category: c.category, label: CATEGORY_LABEL[c.category], count: c._count, averageRating: c._avg.rating ? Math.round(c._avg.rating * 100) / 100 : null })),
        byStatus: Object.fromEntries(feedbackByStatus.map((s) => [s.status, s._count])),
      },
      issues: { ...(issueTotals[0] ?? { open: 0, inProgress: 0, resolved: 0, avgHours: null }), byCategory: issuesByCategory, resolutionTrend },
      surveys: surveyStats[0] ?? { published: 0, avgResponseRate: null },
      themes,
    };
  }
}
