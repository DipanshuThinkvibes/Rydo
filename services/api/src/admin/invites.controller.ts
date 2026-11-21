import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { INVITE_HOURS, INVITE_MAX_USES_DEFAULT, applyLicenses, createInviteSchema, orgFeatures, type CreateInvite, type InviteView } from '@rydo/shared';
import { ZodPipe } from '../common/zod.pipe';
import { AppError } from '../common/app-error';
import { Auth, Org, type AuthContext, type OrgContext } from '../common/request-context';
import { OrgScoped } from '../tenancy/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { randomToken, sha256 } from '../auth/crypto';
import { env } from '../config/env';

/**
 * Invite links: HR makes a link, employees open it, fill the form and get an account straight away (no approval step).
 * A link ends after 24 hours. Only the hash of its secret is stored. Needs the company's RYDO Share licence.
 */
@Controller('admin/invites')
@OrgScoped('ORG_ADMIN', 'HR_ADMIN')
export class InvitesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private status(i: { expiresAt: Date; revokedAt: Date | null; usedCount: number; maxUses: number }): InviteView['status'] {
    if (i.revokedAt) return 'REVOKED';
    if (i.expiresAt <= new Date()) return 'EXPIRED';
    return i.usedCount >= i.maxUses ? 'FULL' : 'ACTIVE';
  }

  @Get()
  async list(@Org() org: OrgContext) {
    const rows = await this.prisma.orgInvite.findMany({ where: { organizationId: org.organizationId }, orderBy: { createdAt: 'desc' }, take: 20 });
    const makers = await this.prisma.membership.findMany({ where: { id: { in: rows.map((r) => r.createdByMembershipId) }, organizationId: org.organizationId }, select: { id: true, user: { select: { name: true } } } });
    const name = new Map(makers.map((m) => [m.id, m.user.name]));
    const data: InviteView[] = rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
      status: this.status(r),
      usedCount: r.usedCount,
      maxUses: r.maxUses,
      createdBy: name.get(r.createdByMembershipId) ?? 'HR',
    }));
    return { data };
  }

  /** Makes a new link. The full link is shown once, here; later only its status is. */
  @Post()
  @HttpCode(200)
  async create(@Auth() auth: AuthContext, @Org() org: OrgContext, @Body(new ZodPipe(createInviteSchema)) body: CreateInvite) {
    const company = await this.prisma.organization.findUniqueOrThrow({ where: { id: org.organizationId }, select: { features: true, licenses: { select: { product: true, status: true, startsAt: true, expiresAt: true } } } });
    if (!applyLicenses(orgFeatures(company.features), company.licenses).share) {
      throw new AppError('LICENSE_INACTIVE', "Invite links need your company's RYDO Share licence. Ask RYDO to switch it on.", 403);
    }
    const token = randomToken(32);
    const invite = await this.prisma.orgInvite.create({
      data: { organizationId: org.organizationId, tokenHash: sha256(token), createdByMembershipId: org.membershipId, expiresAt: new Date(Date.now() + INVITE_HOURS * 3_600_000), maxUses: body.maxUses ?? INVITE_MAX_USES_DEFAULT },
    });
    await this.audit.log({ organizationId: org.organizationId, actorUserId: auth.userId, action: 'INVITE_CREATED', entityType: 'invite', entityId: invite.id, after: { expiresAt: invite.expiresAt, maxUses: invite.maxUses } });
    return { data: { id: invite.id, url: `${env().WEB_ORIGIN}/join/${token}`, expiresAt: invite.expiresAt.toISOString() } };
  }

  @Post(':id/revoke')
  @HttpCode(200)
  async revoke(@Auth() auth: AuthContext, @Org() org: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    const r = await this.prisma.orgInvite.updateMany({ where: { id, organizationId: org.organizationId, revokedAt: null }, data: { revokedAt: new Date() } });
    if (!r.count) throw new AppError('NOT_FOUND', 'Invite link not found.', 404);
    await this.audit.log({ organizationId: org.organizationId, actorUserId: auth.userId, action: 'INVITE_REVOKED', entityType: 'invite', entityId: id });
    return { data: { id, status: 'REVOKED' as const } };
  }
}
