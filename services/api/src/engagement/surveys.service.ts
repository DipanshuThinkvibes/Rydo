import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { audienceSchema, surveyQuestionSchema, type Audience, type SurveyAnswers, type SurveyCreate, type SurveyQuestion } from '@rydo/shared';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AppError } from '../common/app-error';
import type { OrgContext } from '../common/request-context';
import { audienceMembershipIds, inAudience } from './audience';

const questionsOf = (raw: unknown) => z.array(surveyQuestionSchema).parse(raw);
const audienceOf = (raw: unknown): Audience => audienceSchema.parse(raw ?? {});

/** Admin-pushed surveys and everyone's answers. Results are anonymous: they never show who answered. */
@Injectable()
export class SurveysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notify: NotificationsService,
  ) {}

  // ───────── Admin ─────────

  async create(org: OrgContext, actorUserId: string, b: SurveyCreate) {
    const ids = b.questions.map((q) => q.id);
    if (new Set(ids).size !== ids.length) throw new AppError('VALIDATION_ERROR', 'Each question needs its own id.', 400, { questions: 'Duplicate question ids' });
    if (b.closesAt && new Date(b.closesAt) <= new Date()) throw new AppError('VALIDATION_ERROR', 'The closing time is in the past.', 400, { closesAt: 'Pick a future time' });
    if (b.audience.departmentIds?.length) {
      const found = await this.prisma.department.count({ where: { id: { in: b.audience.departmentIds }, organizationId: org.organizationId } });
      if (found !== new Set(b.audience.departmentIds).size) throw new AppError('VALIDATION_ERROR', 'One of those departments is not in your company.', 400, { audience: 'Unknown department' });
    }
    const s = await this.prisma.survey.create({
      data: { organizationId: org.organizationId, createdByMembershipId: org.membershipId, title: b.title, description: b.description, questions: b.questions as object, audience: b.audience as object, closesAt: b.closesAt ? new Date(b.closesAt) : null },
    });
    await this.audit.log({ organizationId: org.organizationId, actorUserId, action: 'SURVEY_CREATED', entityType: 'survey', entityId: s.id, after: { title: s.title } });
    return this.shape(s, 0);
  }

  async list(org: OrgContext) {
    const [rows, counts] = await Promise.all([
      this.prisma.survey.findMany({ where: { organizationId: org.organizationId }, orderBy: { createdAt: 'desc' }, take: 100 }),
      this.prisma.surveyResponse.groupBy({ by: ['surveyId'], where: { survey: { organizationId: org.organizationId } }, _count: true }),
    ]);
    const n = new Map(counts.map((c) => [c.surveyId, c._count]));
    return rows.map((s) => this.shape(s, n.get(s.id) ?? 0));
  }

  private shape(s: { id: string; title: string; description: string | null; questions: unknown; audience: unknown; status: string; publishedAt: Date | null; closesAt: Date | null; audienceSize: number; createdAt: Date }, responses: number) {
    return {
      id: s.id,
      title: s.title,
      description: s.description,
      questions: s.questions,
      audience: s.audience,
      status: s.status,
      publishedAt: s.publishedAt,
      closesAt: s.closesAt,
      audienceSize: s.audienceSize,
      responses,
      responseRate: s.audienceSize ? Math.round((responses / s.audienceSize) * 1000) / 1000 : null,
      createdAt: s.createdAt,
    };
  }

  private async own(org: OrgContext, id: string) {
    const s = await this.prisma.survey.findFirst({ where: { id, organizationId: org.organizationId } });
    if (!s) throw new AppError('NOT_FOUND', 'Survey not found.', 404);
    return s;
  }

  /** Draft → published: works out who is in the audience, tells them, and starts counting the response rate. */
  async publish(org: OrgContext, actorUserId: string, id: string) {
    const s = await this.own(org, id);
    if (s.status !== 'DRAFT') throw new AppError('CONFLICT', 'Only a draft can be published.', 409);
    if (s.closesAt && s.closesAt <= new Date()) throw new AppError('CONFLICT', 'The closing time has passed. Create a new survey.', 409);
    const people = (await audienceMembershipIds(this.prisma, org.organizationId, audienceOf(s.audience))).filter((m) => m !== org.membershipId);
    const done = await this.prisma.survey.updateMany({ where: { id, status: 'DRAFT' }, data: { status: 'PUBLISHED', publishedAt: new Date(), audienceSize: people.length } });
    if (!done.count) throw new AppError('CONFLICT', 'Only a draft can be published.', 409);
    await this.audit.log({ organizationId: org.organizationId, actorUserId, action: 'SURVEY_PUBLISHED', entityType: 'survey', entityId: id, after: { audience: s.audience, people: people.length } });
    await this.notify.notifyMany(people, { type: 'SURVEY', title: 'New survey: ' + s.title, body: s.description ?? 'Your answers help improve commuting at your company. It takes a minute.', data: { surveyId: id } });
    return this.results(org, id);
  }

  async close(org: OrgContext, actorUserId: string, id: string) {
    const s = await this.own(org, id);
    if (s.status !== 'PUBLISHED') throw new AppError('CONFLICT', 'Only a published survey can be closed.', 409);
    await this.prisma.survey.update({ where: { id }, data: { status: 'CLOSED' } });
    await this.audit.log({ organizationId: org.organizationId, actorUserId, action: 'SURVEY_CLOSED', entityType: 'survey', entityId: id });
    return this.results(org, id);
  }

  async remove(org: OrgContext, actorUserId: string, id: string) {
    const s = await this.own(org, id);
    if (s.status !== 'DRAFT') throw new AppError('CONFLICT', 'Only a draft can be deleted. Close a published survey instead.', 409);
    await this.prisma.survey.delete({ where: { id } });
    await this.audit.log({ organizationId: org.organizationId, actorUserId, action: 'SURVEY_DELETED', entityType: 'survey', entityId: id, before: { title: s.title } });
    return { id };
  }

  /** Response rate and a summary per question: average and spread for ratings, counts for choices, recent words for text. */
  async results(org: OrgContext, id: string) {
    const s = await this.own(org, id);
    const questions: SurveyQuestion[] = questionsOf(s.questions);
    const responses = await this.prisma.surveyResponse.findMany({ where: { surveyId: id }, select: { answers: true } });
    const perQuestion = questions.map((q) => {
      const values = responses.map((r) => (r.answers as Record<string, number | string>)[q.id]).filter((v) => v !== undefined && v !== '');
      if (q.type === 'RATING') {
        const nums = values.filter((v): v is number => typeof v === 'number');
        const distribution = Object.fromEntries([1, 2, 3, 4, 5].map((n) => [n, nums.filter((x) => x === n).length]));
        return { id: q.id, type: q.type, text: q.text, answered: nums.length, average: nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100 : null, distribution };
      }
      if (q.type === 'CHOICE') {
        return { id: q.id, type: q.type, text: q.text, answered: values.length, counts: Object.fromEntries(q.options.map((o) => [o, values.filter((v) => v === o).length])) };
      }
      return { id: q.id, type: q.type, text: q.text, answered: values.length, answers: values.slice(-50).reverse() };
    });
    return { ...this.shape(s, responses.length), perQuestion };
  }

  // ───────── Employees ─────────

  /** Open surveys addressed to me, with whether I already answered. */
  async mine(org: OrgContext) {
    const me = await this.prisma.membership.findUniqueOrThrow({ where: { id: org.membershipId }, select: { departmentId: true, roles: { select: { role: true } } } });
    const mine = { departmentId: me.departmentId, roles: me.roles.map((r) => r.role as string) };
    const open = await this.prisma.survey.findMany({
      where: { organizationId: org.organizationId, status: 'PUBLISHED', OR: [{ closesAt: null }, { closesAt: { gt: new Date() } }] },
      orderBy: { publishedAt: 'desc' },
      take: 50,
    });
    const answered = new Set((await this.prisma.surveyResponse.findMany({ where: { membershipId: org.membershipId, surveyId: { in: open.map((s) => s.id) } }, select: { surveyId: true } })).map((r) => r.surveyId));
    return open
      .filter((s) => inAudience(mine, audienceOf(s.audience)))
      .map((s) => ({ id: s.id, title: s.title, description: s.description, questions: s.questions, closesAt: s.closesAt, answered: answered.has(s.id) }));
  }

  async answer(org: OrgContext, id: string, b: SurveyAnswers) {
    const s = await this.prisma.survey.findFirst({ where: { id, organizationId: org.organizationId, status: 'PUBLISHED' } });
    if (!s || (s.closesAt && s.closesAt <= new Date())) throw new AppError('NOT_FOUND', 'This survey is not open.', 404);
    const me = await this.prisma.membership.findUniqueOrThrow({ where: { id: org.membershipId }, select: { departmentId: true, roles: { select: { role: true } } } });
    if (!inAudience({ departmentId: me.departmentId, roles: me.roles.map((r) => r.role as string) }, audienceOf(s.audience))) throw new AppError('FORBIDDEN', 'This survey is not for you.', 403);

    const clean: Record<string, number | string> = {};
    const fields: Record<string, string> = {};
    for (const q of questionsOf(s.questions)) {
      const v = b.answers[q.id];
      if (v === undefined || v === '') {
        if (q.type !== 'TEXT') fields[q.id] = 'Answer this question';
        continue;
      }
      if (q.type === 'RATING') {
        if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 5) fields[q.id] = 'Pick 1 to 5';
        else clean[q.id] = v;
      } else if (q.type === 'CHOICE') {
        if (typeof v !== 'string' || !q.options.includes(v)) fields[q.id] = 'Pick one of the options';
        else clean[q.id] = v;
      } else if (typeof v !== 'string') fields[q.id] = 'Write a short answer';
      else clean[q.id] = v.trim();
    }
    if (Object.keys(fields).length) throw new AppError('VALIDATION_ERROR', 'Check your answers', 400, fields);
    try {
      await this.prisma.surveyResponse.create({ data: { id: randomUUID(), surveyId: id, membershipId: org.membershipId, answers: clean } });
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') throw new AppError('CONFLICT', 'You already answered this survey.', 409);
      throw e;
    }
    return { answered: true };
  }
}
