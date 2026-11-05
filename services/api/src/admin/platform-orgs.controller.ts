import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { addOrgAdminSchema, createOrgSchema, updateOrgStatusSchema } from '@rydo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppError } from '../common/app-error';
import { ZodPipe } from '../common/zod.pipe';
import { Auth, type AuthContext } from '../common/request-context';
import { PlatformAdmin } from '../tenancy/decorators';

/** RYDO Super Admin: onboard and manage companies. */
@Controller('admin/platform/organizations')
@PlatformAdmin()
export class PlatformOrgsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async list() {
    const orgs = await this.prisma.organization.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { memberships: true } } },
    });
    return { data: orgs.map(({ _count, ...o }) => ({ ...o, members: _count.memberships })) };
  }

  @Post()
  async create(@Auth() auth: AuthContext, @Body(new ZodPipe(createOrgSchema)) body: z.infer<typeof createOrgSchema>) {
    const clash = await this.prisma.organization.findFirst({ where: { OR: [{ slug: body.slug }, { emailDomains: { hasSome: body.emailDomains } }] } });
    if (clash) throw new AppError('CONFLICT', 'A company with this slug or email domain already exists.', 409);
    const org = await this.prisma.organization.create({ data: { ...body, status: 'ACTIVE' } });
    await this.audit.log({ organizationId: org.id, actorUserId: auth.userId, action: 'ORG_CREATED', entityType: 'organization', entityId: org.id, after: body });
    return { data: org };
  }

  @Patch(':id')
  async setStatus(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(updateOrgStatusSchema)) body: z.infer<typeof updateOrgStatusSchema>) {
    const before = await this.prisma.organization.findUnique({ where: { id } });
    if (!before) throw new AppError('NOT_FOUND', 'Company not found.', 404);
    const org = await this.prisma.organization.update({ where: { id }, data: { status: body.status } });
    await this.audit.log({ organizationId: id, actorUserId: auth.userId, action: 'ORG_STATUS_CHANGED', entityType: 'organization', entityId: id, before: { status: before.status }, after: body });
    return { data: org };
  }

  /** Adds the company's first Org Admin (active immediately, no HR approval needed). */
  @Post(':id/admins')
  async addAdmin(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(addOrgAdminSchema)) body: z.infer<typeof addOrgAdminSchema>) {
    const org = await this.prisma.organization.findUnique({ where: { id } });
    if (!org) throw new AppError('NOT_FOUND', 'Company not found.', 404);
    const membership = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.upsert({ where: { email: body.email }, update: {}, create: { email: body.email, name: body.name } });
      const m = await tx.membership.upsert({
        where: { organizationId_userId: { organizationId: id, userId: user.id } },
        update: { status: 'ACTIVE', decidedAt: new Date() },
        create: { organizationId: id, userId: user.id, status: 'ACTIVE', decidedAt: new Date() },
      });
      await tx.membershipRole.upsert({
        where: { membershipId_role: { membershipId: m.id, role: 'ORG_ADMIN' } },
        update: {},
        create: { membershipId: m.id, role: 'ORG_ADMIN' },
      });
      await this.audit.log({ organizationId: id, actorUserId: auth.userId, action: 'ORG_ADMIN_ADDED', entityType: 'membership', entityId: m.id, after: { email: body.email } }, tx);
      return m;
    });
    return { data: { membershipId: membership.id } };
  }
}