import { Body, Controller, Get, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { applyLicenses, inviteJoinSchema, orgFeatures, type AuthResult, type InviteJoin } from '@rydo/shared';
import { ClientType, Prisma } from '@prisma/client';
import { ZodPipe } from '../common/zod.pipe';
import { AppError } from '../common/app-error';
import type { RydoRequest } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MeService } from '../me/me.service';
import { ACCESS_TTL_SEC, COOKIE, REFRESH_TTL_SEC, cookieOptions } from './cookies';
import { randomToken, sha256 } from './crypto';
import { hashPassword } from './password';
import { Public } from './public.decorator';
import { TokensService } from './tokens.service';

const domainOf = (email: string) => email.split('@')[1];

/**
 * The form behind an HR invite link. Anyone with a live link and a work email of that company can create their account here;
 * there is no approval step. The link, not an email code, is the proof, so HR is told about every account made this way.
 */
@Controller('public/invites')
export class InviteJoinController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokensService,
    private readonly me: MeService,
    private readonly notify: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  /** Finds a live invite and its company, or says why the link cannot be used. */
  private async live(token: string) {
    const invite = await this.prisma.orgInvite.findUnique({ where: { tokenHash: sha256(token) } });
    if (!invite || invite.revokedAt) throw new AppError('NOT_FOUND', 'This invite link is not valid. Ask your HR team for a new one.', 404);
    if (invite.expiresAt <= new Date()) throw new AppError('INVITE_EXPIRED', 'This invite link has expired (links work for 24 hours). Ask your HR team for a new one.', 410);
    if (invite.usedCount >= invite.maxUses) throw new AppError('INVITE_EXPIRED', 'This invite link has reached its limit. Ask your HR team for a new one.', 410);
    const org = await this.prisma.organization.findUnique({
      where: { id: invite.organizationId },
      select: { id: true, name: true, status: true, emailDomains: true, features: true, licenses: { select: { product: true, status: true, startsAt: true, expiresAt: true } }, departments: { select: { name: true }, orderBy: { name: 'asc' } }, offices: { select: { name: true }, orderBy: { name: 'asc' } } },
    });
    if (!org || org.status !== 'ACTIVE' || !applyLicenses(orgFeatures(org.features), org.licenses).share) {
      throw new AppError('LICENSE_INACTIVE', 'This company is not accepting new employees on RYDO right now. Ask your HR team.', 403);
    }
    return { invite, org };
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get(':token')
  async info(@Param('token') token: string) {
    const { invite, org } = await this.live(token);
    return { data: { company: org.name, domains: org.emailDomains, departments: org.departments.map((d) => d.name), offices: org.offices.map((o) => o.name), expiresAt: invite.expiresAt.toISOString() } };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(':token/join')
  @HttpCode(200)
  async join(@Param('token') token: string, @Body(new ZodPipe(inviteJoinSchema)) b: InviteJoin, @Req() req: RydoRequest, @Res({ passthrough: true }) res: Response) {
    const { invite, org } = await this.live(token);
    if (!org.emailDomains.includes(domainOf(b.email))) {
      throw new AppError('DOMAIN_MISMATCH', `Use your @${org.emailDomains[0]} work email to join ${org.name}.`, 400, { email: `Use a @${org.emailDomains[0]} address` });
    }
    if (b.managerEmail === b.email || !org.emailDomains.includes(domainOf(b.managerEmail))) {
      throw new AppError('VALIDATION_ERROR', `Your manager's email should be a different @${org.emailDomains[0]} address.`, 400, { managerEmail: `Use a @${org.emailDomains[0]} address` });
    }
    if (await this.prisma.user.findUnique({ where: { email: b.email }, select: { id: true } })) {
      throw new AppError('CONFLICT', 'There is already a RYDO account for this email. Sign in instead.', 409, { email: 'Already registered. Sign in instead.' });
    }

    const passwordHash = await hashPassword(b.password);
    let userId: string;
    let membershipId: string;
    try {
      ({ userId, membershipId } = await this.prisma.$transaction(async (tx) => {
        // Count the use first, so two people cannot take the last place at once.
        const taken = await tx.$executeRaw`UPDATE org_invites SET used_count = used_count + 1 WHERE id = ${invite.id}::uuid AND used_count < max_uses AND revoked_at IS NULL AND expires_at > now()`;
        if (!taken) throw new AppError('INVITE_EXPIRED', 'This invite link is no longer open. Ask your HR team for a new one.', 410);
        const user = await tx.user.create({ data: { email: b.email, name: b.fullName, phone: b.phone, passwordHash } });
        const m = await tx.membership.create({ data: { organizationId: org.id, userId: user.id, status: 'ACTIVE', joinedVia: 'INVITE_LINK', inviteId: invite.id, employeeCode: b.employeeId, roles: { create: [{ role: 'RIDER' }] } } });
        await tx.employeeRegistration.create({ data: { organizationId: org.id, userId: user.id, membershipId: m.id, fullName: b.fullName, phone: b.phone, idType: b.idType, idLast4: b.idLast4, employeeId: b.employeeId, designation: b.designation, department: b.department, office: b.office, managerName: b.managerName, managerEmail: b.managerEmail, notifiedAt: new Date() } });
        return { userId: user.id, membershipId: m.id };
      }));
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new AppError('CONFLICT', 'There is already a RYDO account for this email. Sign in instead.', 409, { email: 'Already registered. Sign in instead.' });
      throw e;
    }

    await this.audit.log({ organizationId: org.id, actorUserId: userId, action: 'EMPLOYEE_JOINED_BY_INVITE', entityType: 'membership', entityId: membershipId, after: { inviteId: invite.id, department: b.department } });
    // HR hears about every account made this way. A failure to notify must not undo the account.
    await this.notify
      .notifyAdmins(org.id, { type: 'EMPLOYEE_JOINED', title: `${b.fullName} joined by invite link`, body: `${b.fullName} (${b.email}) created an account in ${org.name} with an invite link.\nEmployee ID: ${b.employeeId}\nDepartment: ${b.department}\nOffice: ${b.office}`, data: { membershipId, inviteId: invite.id }, email: true }, ['ORG_ADMIN', 'HR_ADMIN'])
      .catch(() => undefined);

    const issued = await this.tokens.issue(userId, b.client as ClientType, req.headers['user-agent']);
    const result: AuthResult = { ...(await this.me.summary(userId)), accessToken: issued.accessToken, refreshToken: issued.refreshToken };
    if (b.client === 'WEB') {
      res.cookie(COOKIE.access, issued.accessToken, cookieOptions(ACCESS_TTL_SEC));
      res.cookie(COOKIE.refresh, issued.refreshToken, cookieOptions(REFRESH_TTL_SEC, true, '/api/v1/auth'));
      res.cookie(COOKIE.csrf, randomToken(24), cookieOptions(REFRESH_TTL_SEC, false));
      return { data: { ...result, accessToken: undefined, refreshToken: undefined } };
    }
    return { data: result };
  }
}
