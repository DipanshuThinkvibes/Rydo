import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { issueCreateSchema, issueQuerySchema, issueUpdateSchema, type IssueCreate, type IssueQuery, type IssueUpdate } from '@rydo/shared';
import { ZodPipe } from '../common/zod.pipe';
import { Auth, Org, type AuthContext, type OrgContext } from '../common/request-context';
import { OrgScoped } from '../tenancy/decorators';
import { IssuesService } from './issues.service';

/** Issue reports: members report problems and follow them; admins work them from open to resolved. */
@Controller()
export class IssuesController {
  constructor(private readonly issues: IssuesService) {}

  @Post('me/issues')
  @OrgScoped()
  @HttpCode(200)
  async report(@Auth() auth: AuthContext, @Org() org: OrgContext, @Body(new ZodPipe(issueCreateSchema)) b: IssueCreate) {
    return { data: await this.issues.create(org, auth.userId, b) };
  }

  @Get('me/issues')
  @OrgScoped()
  async mine(@Org() org: OrgContext) {
    return { data: await this.issues.mine(org) };
  }

  @Get('admin/issues')
  @OrgScoped('ORG_ADMIN', 'HR_ADMIN', 'OPS_ADMIN')
  async list(@Org() org: OrgContext, @Query(new ZodPipe(issueQuerySchema)) q: IssueQuery) {
    return this.issues.adminList(org, q);
  }

  @Get('admin/issues/:id')
  @OrgScoped('ORG_ADMIN', 'HR_ADMIN', 'OPS_ADMIN')
  async get(@Org() org: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.issues.adminGet(org, id) };
  }

  @Patch('admin/issues/:id')
  @OrgScoped('ORG_ADMIN', 'HR_ADMIN', 'OPS_ADMIN')
  async update(@Auth() auth: AuthContext, @Org() org: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(issueUpdateSchema)) b: IssueUpdate) {
    return { data: await this.issues.adminUpdate(org, auth.userId, id, b) };
  }
}
