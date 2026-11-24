import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ADMIN_ACCOUNT_MESSAGE, ORG_HEADER, SUPPORT_HEADER, applyLicenses, isAdminAccount, orgFeatures, type OrgFeatures, type OrgRoleName } from '@rydo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/app-error';
import { env } from '../config/env';
import { releaseExpiredBlocks } from './platform-block';
import type { RydoRequest } from '../common/request-context';

export const ORG_ROLES_KEY = 'rydo:org-roles';
export const ORG_FEATURE_KEY = 'rydo:org-feature';
export const ADMIN_MAY_USE_KEY = 'rydo:admin-may-use';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Stand-in membership id for RYDO support (never matches a real row). */
export const SUPPORT_MEMBERSHIP_ID = '00000000-0000-0000-0000-000000000000';
const SUPPORT_ROLES: OrgRoleName[] = ['ORG_ADMIN', 'HR_ADMIN', 'OPS_ADMIN'];

/**
 * Tenant boundary. Reads X-Org-Id, requires an ACTIVE membership in an ACTIVE company,
 * checks roles and the company's switched-on features, and sets req.org.
 * Services must filter every query by req.org.organizationId.
 *
 * RYDO support (Super Admin with a live support grant and the support header) may READ a
 * client's admin screens without a membership. Writes are refused.
 */
@Injectable()
export class OrgGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  protected get prismaClient() {
    return this.prisma;
  }

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<RydoRequest>();
    const orgId = req.headers[ORG_HEADER];
    if (typeof orgId !== 'string' || !UUID.test(orgId)) throw new AppError('ORG_REQUIRED', 'Choose a company first.', 400);
    const needed = this.reflector.getAllAndOverride<OrgRoleName[]>(ORG_ROLES_KEY, [ctx.getHandler(), ctx.getClass()]) ?? [];
    const feature = this.reflector.getAllAndOverride<keyof OrgFeatures | undefined>(ORG_FEATURE_KEY, [ctx.getHandler(), ctx.getClass()]);
    const adminMayUse = !!this.reflector.get<boolean>(ADMIN_MAY_USE_KEY, ctx.getHandler());

    if (req.headers[SUPPORT_HEADER] === '1') return this.support(req, orgId, needed);

    const membership = await this.prisma.membership.findUnique({
      where: { organizationId_userId: { organizationId: orgId, userId: req.auth!.userId } },
      include: { roles: true, user: { select: { photoKey: true } }, organization: { select: { status: true, features: true, licenses: { select: { product: true, status: true, startsAt: true, expiresAt: true } } } } },
    });
    // A temporary pause by RYDO ends by itself: put the person back and carry on as active.
    if (membership && membership.status === 'SUSPENDED' && membership.platformBlockedAt && membership.platformBlockedUntil && membership.platformBlockedUntil <= new Date()) {
      await releaseExpiredBlocks(this.prisma, { id: membership.id });
      membership.status = 'ACTIVE';
      membership.platformBlockedAt = null;
    }
    if (membership && membership.status === 'SUSPENDED' && membership.platformBlockedAt) {
      const until = membership.platformBlockedUntil;
      throw new AppError('MEMBERSHIP_NOT_ACTIVE', until ? `RYDO paused your access until ${until.toISOString().slice(0, 10)}. Contact RYDO support if you think this is a mistake.` : 'RYDO paused your access. Contact RYDO support if you think this is a mistake.', 403);
    }
    if (!membership || membership.status !== 'ACTIVE' || membership.organization.status !== 'ACTIVE') {
      throw new AppError('MEMBERSHIP_NOT_ACTIVE', "You don't have access to this company.", 403);
    }
    if (feature) {
      const switches = orgFeatures(membership.organization.features);
      if (!applyLicenses(switches, membership.organization.licenses)[feature]) {
        // Switched on, but the licence has ended or was paused: say so, so the admin knows to contact RYDO.
        if (switches[feature]) throw new AppError('LICENSE_INACTIVE', "Your company's RYDO licence for this is not active. Ask your admin to contact RYDO.", 403);
        throw new AppError('FEATURE_OFF', 'This part of RYDO is not switched on for your company. Ask your admin.', 403);
      }
    }

    const roles = membership.roles.map((r) => r.role as OrgRoleName);
    // Carpool (finding, offering and joining rides) is for employee accounts. An admin account never uses it, so a company
    // admin who also wants to ride signs in with a separate employee account. Admin screens that watch rides name their admin roles.
    if (feature === 'share' && !adminMayUse && isAdminAccount(roles) && !needed.some((r) => isAdminAccount([r]))) {
      throw new AppError('ADMIN_ACCOUNT', ADMIN_ACCOUNT_MESSAGE, 403);
    }
    // Everyone needs a profile photo to ride or drive: the driver checks the rider against it, and the rider checks the driver.
    if (feature === 'share' && !adminMayUse && env().REQUIRE_PROFILE_PHOTO === 'true' && !membership.user.photoKey) {
      throw new AppError('PHOTO_REQUIRED', 'Add your profile photo first. Riders and drivers use it to check who is who before a ride.', 403);
    }
    if (needed.length && !needed.some((r) => roles.includes(r))) {
      throw new AppError('FORBIDDEN', "Your role can't do this.", 403);
    }
    req.org = { organizationId: orgId, membershipId: membership.id, roles };
    return true;
  }

  /** Read-only support access: admin screens only, GET only, live grant required. */
  private async support(req: RydoRequest, orgId: string, needed: OrgRoleName[]) {
    const userId = req.auth!.userId;
    const [admin, grant] = await Promise.all([
      this.prisma.platformAdmin.findUnique({ where: { userId_role: { userId, role: 'SUPER_ADMIN' } } }),
      this.prisma.supportGrant.findFirst({ where: { userId, organizationId: orgId, endedAt: null, expiresAt: { gt: new Date() } } }),
    ]);
    if (!admin || !grant) throw new AppError('FORBIDDEN', 'Start a support session for this company first.', 403);
    const path = req.path ?? '';
    const adminScreen = path.includes('/api/v1/admin/') && !path.includes('/view-url');
    if (req.method !== 'GET' || !adminScreen || (needed.length && !needed.some((r) => SUPPORT_ROLES.includes(r)))) {
      throw new AppError('SUPPORT_READ_ONLY', 'Support view is read-only. Ask the company admin to make this change.', 403);
    }
    req.org = { organizationId: orgId, membershipId: SUPPORT_MEMBERSHIP_ID, roles: SUPPORT_ROLES, support: true };
    return true;
  }
}
