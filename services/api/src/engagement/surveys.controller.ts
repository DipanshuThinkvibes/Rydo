import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { announcementSchema, surveyAnswersSchema, surveyCreateSchema, type AnnouncementInput, type SurveyAnswers, type SurveyCreate } from '@rydo/shared';
import { randomUUID } from 'node:crypto';
import { ZodPipe } from '../common/zod.pipe';
import { Auth, Org, type AuthContext, type OrgContext } from '../common/request-context';
import { OrgScoped } from '../tenancy/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AppError } from '../common/app-error';
import { audienceMembershipIds } from './audience';
import { SurveysService } from './surveys.service';

/** Surveys: admins publish them, employees answer them. */
@Controller()
export class SurveysController {
  constructor(private readonly surveys: SurveysService) {}

  @Post('admin/surveys')
  @OrgScoped('ORG_ADMIN', 'HR_ADMIN', 'OPS_ADMIN')
  @HttpCode(200)
  async create(@Auth() auth: AuthContext, @Org() org: OrgContext, @Body(new ZodPipe(surveyCreateSchema)) b: SurveyCreate) {
    return { data: await this.surveys.create(org, auth.userId, b) };
  }

  @Get('admin/surveys')
  @OrgScoped('ORG_ADMIN', 'HR_ADMIN', 'OPS_ADMIN')
  async list(@Org() org: OrgContext) {
    return { data: await this.surveys.list(org) };
  }

  @Get('admin/surveys/:id')
  @OrgScoped('ORG_ADMIN', 'HR_ADMIN', 'OPS_ADMIN')
  async results(@Org() org: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.surveys.results(org, id) };
  }

  @Post('admin/surveys/:id/publish')
  @OrgScoped('ORG_ADMIN', 'HR_ADMIN', 'OPS_ADMIN')
  @HttpCode(200)
  async publish(@Auth() auth: AuthContext, @Org() org: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.surveys.publish(org, auth.userId, id) };
  }

  @Post('admin/surveys/:id/close')
  @OrgScoped('ORG_ADMIN', 'HR_ADMIN', 'OPS_ADMIN')
  @HttpCode(200)
  async close(@Auth() auth: AuthContext, @Org() org: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.surveys.close(org, auth.userId, id) };
  }

  @Delete('admin/surveys/:id')
  @OrgScoped('ORG_ADMIN', 'HR_ADMIN', 'OPS_ADMIN')
  async remove(@Auth() auth: AuthContext, @Org() org: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.surveys.remove(org, auth.userId, id) };
  }

  @Get('me/surveys')
  @OrgScoped()
  async mine(@Org() org: OrgContext) {
    return { data: await this.surveys.mine(org) };
  }

  @Post('me/surveys/:id/responses')
  @OrgScoped()
  @HttpCode(200)
  async answer(@Org() org: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(surveyAnswersSchema)) b: SurveyAnswers) {
    return { data: await this.surveys.answer(org, id, b) };
  }
}

/** Admin announcements to everyone or a segment. Kept in the company's activity log; no extra table. */
@Controller('admin/announcements')
export class AnnouncementsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notify: NotificationsService,
  ) {}

  @Post()
  @OrgScoped('ORG_ADMIN', 'HR_ADMIN')
  @HttpCode(200)
  async send(@Auth() auth: AuthContext, @Org() org: OrgContext, @Body(new ZodPipe(announcementSchema)) b: AnnouncementInput) {
    if (b.audience.departmentIds?.length) {
      const found = await this.prisma.department.count({ where: { id: { in: b.audience.departmentIds }, organizationId: org.organizationId } });
      if (found !== new Set(b.audience.departmentIds).size) throw new AppError('VALIDATION_ERROR', 'One of those departments is not in your company.', 400, { audience: 'Unknown department' });
    }
    const people = await audienceMembershipIds(this.prisma, org.organizationId, b.audience);
    if (!people.length) throw new AppError('CONFLICT', 'Nobody matches that audience.', 409);
    await this.notify.notifyMany(people, { type: 'ANNOUNCEMENT', title: b.title, body: b.body, email: b.email });
    await this.audit.log({ organizationId: org.organizationId, actorUserId: auth.userId, action: 'ANNOUNCEMENT_SENT', entityType: 'announcement', entityId: randomUUID(), after: { title: b.title, body: b.body, audience: b.audience, email: b.email, recipients: people.length } });
    return { data: { recipients: people.length } };
  }

  @Get()
  @OrgScoped('ORG_ADMIN', 'HR_ADMIN', 'OPS_ADMIN')
  async history(@Org() org: OrgContext) {
    const rows = await this.prisma.auditLog.findMany({ where: { organizationId: org.organizationId, action: 'ANNOUNCEMENT_SENT' }, orderBy: { createdAt: 'desc' }, take: 50 });
    return { data: rows.map((r) => ({ id: r.entityId, at: r.createdAt, ...(r.after as object) })) };
  }
}
