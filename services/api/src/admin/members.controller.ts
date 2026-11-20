import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { isAdminAccount, memberListQuerySchema, setRolesSchema, updateMemberSchema, type OrgRoleName } from '@rydo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppError } from '../common/app-error';
import { ZodPipe } from '../common/zod.pipe';
import { Auth, Org, type AuthContext, type OrgContext } from '../common/request-context';
import { OrgScoped } from '../tenancy/decorators';
import { MESSAGE_ADAPTER, MessageAdapter } from '../adapters/message.adapter';

/** Company employees: HR approval queue and role management. Always filtered by the caller's company. */
@Controller('admin/members')
export class MembersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(MESSAGE_ADAPTER) private readonly messages: MessageAdapter,
  ) {}

  @Get()
  @OrgScoped('ORG_ADMIN', 'HR_ADMIN')
  async list(@Org() org: OrgContext, @Query(new ZodPipe(memberListQuerySchema)) q: z.infer<typeof memberListQuerySchema>) {
    const rows = await this.prisma.membership.findMany({
      where: {
        organizationId: org.organizationId,
        ...(q.status ? { status: q.status } : {}),
        ...(q.q ? { user: { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { email: { contains: q.q, mode: 'insensitive' } }] } } : {}),
      },
      include: { user: { select: { name: true, email: true } }, roles: true, department: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    // What each person wrote when they signed up (HR needs it to decide). Only this company's rows are read.
    const regs = await this.prisma.employeeRegistration.findMany({ where: { organizationId: org.organizationId, membershipId: { in: rows.map((m) => m.id) } } });
    const reg = new Map(regs.map((r) => [r.membershipId, r]));
    return {
      data: rows.map((m) => {
        const r = reg.get(m.id);
        return {
          id: m.id,
          name: m.user.name,
          email: m.user.email,
          department: m.department?.name ?? null,
          departmentId: m.departmentId,
          status: m.status,
          roles: m.roles.map((x) => x.role),
          joinedAt: m.createdAt,
          registration: r
            ? { employeeId: r.employeeId, designation: r.designation, department: r.department, office: r.office, phone: r.phone, idType: r.idType, idLast4: r.idLast4, managerName: r.managerName, managerEmail: r.managerEmail, submittedAt: r.createdAt }
            : null,
        };
      }),
    };
  }

  /** Loads a membership only if it belongs to the caller's company; otherwise it does not exist for them. */
  private async inMyCompany(org: OrgContext, id: string) {
    const m = await this.prisma.membership.findFirst({ where: { id, organizationId: org.organizationId }, include: { user: true, roles: true } });
    if (!m) throw new AppError('NOT_FOUND', 'Employee not found.', 404);
    return m;
  }

  /** RYDO sets a seat limit per client (their plan). Approving past it is refused. */
  private async checkSeatLimit(organizationId: string) {
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { maxEmployees: true } });
    if (org.maxEmployees == null) return;
    const active = await this.prisma.membership.count({ where: { organizationId, status: 'ACTIVE' } });
    if (active >= org.maxEmployees) throw new AppError('SEAT_LIMIT', `Your RYDO plan allows ${org.maxEmployees} active employees. Contact RYDO to add more.`, 409);
  }

  private async decide(auth: AuthContext, org: OrgContext, id: string, status: 'ACTIVE' | 'REJECTED') {
    const m = await this.inMyCompany(org, id);
    if (m.status !== 'PENDING') throw new AppError('CONFLICT', `Already ${m.status.toLowerCase()}.`, 409);
    if (status === 'ACTIVE') await this.checkSeatLimit(org.organizationId);
    await this.prisma.$transaction(async (tx) => {
      await tx.membership.update({ where: { id }, data: { status, decidedById: org.membershipId, decidedAt: new Date() } });
      await this.audit.log(
        { organizationId: org.organizationId, actorUserId: auth.userId, action: status === 'ACTIVE' ? 'MEMBER_APPROVED' : 'MEMBER_REJECTED', entityType: 'membership', entityId: id, before: { status: m.status }, after: { status } },
        tx,
      );
    });
    if (status === 'ACTIVE') {
      await this.messages.sendEmail({ to: m.user.email, subject: "You're approved on RYDO", text: 'Your HR team approved your RYDO account. Open the app to find or offer a ride.' });
    }
    return { data: { id, status } };
  }

  @Post(':id/approve')
  @HttpCode(200)
  @OrgScoped('ORG_ADMIN', 'HR_ADMIN')
  approve(@Auth() auth: AuthContext, @Org() org: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.decide(auth, org, id, 'ACTIVE');
  }

  @Post(':id/reject')
  @HttpCode(200)
  @OrgScoped('ORG_ADMIN', 'HR_ADMIN')
  reject(@Auth() auth: AuthContext, @Org() org: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.decide(auth, org, id, 'REJECTED');
  }

  @Patch(':id')
  @OrgScoped('ORG_ADMIN', 'HR_ADMIN')
  async update(@Auth() auth: AuthContext, @Org() org: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(updateMemberSchema)) body: z.infer<typeof updateMemberSchema>) {
    const m = await this.inMyCompany(org, id);
    if (body.departmentId) {
      const dept = await this.prisma.department.findFirst({ where: { id: body.departmentId, organizationId: org.organizationId } });
      if (!dept) throw new AppError('NOT_FOUND', 'Department not found.', 404);
    }
    await this.prisma.membership.update({ where: { id }, data: { departmentId: body.departmentId } });
    await this.audit.log({ organizationId: org.organizationId, actorUserId: auth.userId, action: 'MEMBER_DEPARTMENT_CHANGED', entityType: 'membership', entityId: id, before: { departmentId: m.departmentId }, after: body });
    return { data: { id, departmentId: body.departmentId } };
  }

  /** Suspended people keep their history but lose access to the company at once. */
  @Post(':id/suspend')
  @HttpCode(200)
  @OrgScoped('ORG_ADMIN', 'HR_ADMIN')
  async suspend(@Auth() auth: AuthContext, @Org() org: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    const m = await this.inMyCompany(org, id);
    if (id === org.membershipId) throw new AppError('CONFLICT', "You can't suspend yourself.", 409);
    if (m.status !== 'ACTIVE') throw new AppError('CONFLICT', `Only active people can be suspended (this one is ${m.status.toLowerCase()}).`, 409);
    if (m.roles.some((r) => r.role === 'ORG_ADMIN')) {
      const admins = await this.prisma.membershipRole.count({ where: { role: 'ORG_ADMIN', membership: { organizationId: org.organizationId, status: 'ACTIVE' } } });
      if (admins <= 1) throw new AppError('CONFLICT', 'A company needs at least one Org Admin.', 409);
    }
    await this.prisma.membership.update({ where: { id }, data: { status: 'SUSPENDED' } });
    await this.audit.log({ organizationId: org.organizationId, actorUserId: auth.userId, action: 'MEMBER_SUSPENDED', entityType: 'membership', entityId: id, before: { status: m.status }, after: { status: 'SUSPENDED' } });
    return { data: { id, status: 'SUSPENDED' } };
  }

  @Post(':id/reactivate')
  @HttpCode(200)
  @OrgScoped('ORG_ADMIN', 'HR_ADMIN')
  async reactivate(@Auth() auth: AuthContext, @Org() org: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    const m = await this.inMyCompany(org, id);
    if (m.status !== 'SUSPENDED') throw new AppError('CONFLICT', 'Only suspended people can be reactivated.', 409);
    if (m.platformBlockedAt) throw new AppError('FORBIDDEN', 'RYDO support blocked this person. Contact RYDO support to lift the block.', 403);
    await this.checkSeatLimit(org.organizationId);
    await this.prisma.membership.update({ where: { id }, data: { status: 'ACTIVE' } });
    await this.audit.log({ organizationId: org.organizationId, actorUserId: auth.userId, action: 'MEMBER_REACTIVATED', entityType: 'membership', entityId: id, before: { status: m.status }, after: { status: 'ACTIVE' } });
    return { data: { id, status: 'ACTIVE' } };
  }

  @Patch(':id/roles')
  @OrgScoped('ORG_ADMIN')
  async setRoles(@Auth() auth: AuthContext, @Org() org: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(setRolesSchema)) body: { roles: OrgRoleName[] }) {
    const m = await this.inMyCompany(org, id);
    const before = m.roles.map((r) => r.role);
    // Admin accounts can't ride or drive, so rider/driver roles are dropped when an admin role is given.
    const roles = [...new Set(isAdminAccount(body.roles) ? body.roles.filter((r) => r !== 'RIDER' && r !== 'DRIVER') : body.roles)];
    if (before.includes('ORG_ADMIN') && !roles.includes('ORG_ADMIN')) {
      const admins = await this.prisma.membershipRole.count({ where: { role: 'ORG_ADMIN', membership: { organizationId: org.organizationId, status: 'ACTIVE' } } });
      if (admins <= 1) throw new AppError('CONFLICT', 'A company needs at least one Org Admin.', 409);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.membershipRole.deleteMany({ where: { membershipId: id } });
      await tx.membershipRole.createMany({ data: roles.map((role) => ({ membershipId: id, role })) });
      await this.audit.log({ organizationId: org.organizationId, actorUserId: auth.userId, action: 'ROLES_CHANGED', entityType: 'membership', entityId: id, before: { roles: before }, after: { roles } }, tx);
    });
    return { data: { id, roles } };
  }
}