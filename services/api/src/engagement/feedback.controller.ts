import { Body, Controller, Get, HttpCode, Header, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { feedbackCreateSchema, feedbackQuerySchema, feedbackUpdateSchema, insightsQuerySchema, type FeedbackCreate, type FeedbackQuery, type FeedbackUpdate } from '@rydo/shared';
import type { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe';
import { Auth, Org, type AuthContext, type OrgContext } from '../common/request-context';
import { OrgScoped } from '../tenancy/decorators';
import { FeedbackService } from './feedback.service';

/** Feedback form for everyone; the feedback dashboard for the company's admins. */
@Controller()
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Post('me/feedback')
  @OrgScoped()
  @HttpCode(200)
  async submit(@Org() org: OrgContext, @Body(new ZodPipe(feedbackCreateSchema)) b: FeedbackCreate) {
    return { data: await this.feedback.create(org, b) };
  }

  @Get('me/feedback')
  @OrgScoped()
  async mine(@Org() org: OrgContext) {
    return { data: await this.feedback.mine(org) };
  }

  @Get('admin/feedback')
  @OrgScoped('ORG_ADMIN', 'HR_ADMIN', 'OPS_ADMIN')
  async list(@Org() org: OrgContext, @Query(new ZodPipe(feedbackQuerySchema)) q: FeedbackQuery) {
    return this.feedback.adminList(org, q);
  }

  @Get('admin/feedback/insights')
  @OrgScoped('ORG_ADMIN', 'HR_ADMIN', 'OPS_ADMIN')
  async insights(@Org() org: OrgContext, @Query(new ZodPipe(insightsQuerySchema)) q: z.infer<typeof insightsQuerySchema>) {
    return { data: await this.feedback.insights(org, q.days) };
  }

  @Get('admin/feedback/export.csv')
  @OrgScoped('ORG_ADMIN', 'HR_ADMIN', 'OPS_ADMIN')
  @Header('content-type', 'text/csv; charset=utf-8')
  @Header('content-disposition', 'attachment; filename="rydo-feedback.csv"')
  async export(@Auth() auth: AuthContext, @Org() org: OrgContext) {
    return this.feedback.exportCsv(org, auth.userId);
  }

  @Patch('admin/feedback/:id')
  @OrgScoped('ORG_ADMIN', 'HR_ADMIN', 'OPS_ADMIN')
  async update(@Auth() auth: AuthContext, @Org() org: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(feedbackUpdateSchema)) b: FeedbackUpdate) {
    return { data: await this.feedback.adminUpdate(org, auth.userId, id, b) };
  }
}
