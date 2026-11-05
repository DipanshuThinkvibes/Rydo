import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ORG_HEADER, type OrgRoleName } from '@rydo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/app-error';
import type { RydoRequest } from '../common/request-context';

export const ORG_ROLES_KEY = 'rydo:org-roles';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Tenant boundary. Reads X-Org-Id, requires an ACTIVE membership in an ACTIVE company,
 * checks roles, and sets req.org. Services must filter every query by req.org.organizationId.
 */
@Injectable()
export class OrgGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<RydoRequest>();
    const orgId = req.headers[ORG_HEADER];
    if (typeof orgId !== 'string' || !UUID.test(orgId)) throw new AppError('ORG_REQUIRED', 'Choose a company first.', 400);

    const membership = await this.prisma.membership.findUnique({
      where: { organizationId_userId: { organizationId: orgId, userId: req.auth!.userId } },
      include: { roles: true, organization: { select: { status: true } } },
    });
    if (!membership || membership.status !== 'ACTIVE' || membership.organization.status !== 'ACTIVE') {
      throw new AppError('MEMBERSHIP_NOT_ACTIVE', "You don't have access to this company.", 403);
    }

    const roles = membership.roles.map((r) => r.role as OrgRoleName);
    const needed = this.reflector.getAllAndOverride<OrgRoleName[]>(ORG_ROLES_KEY, [ctx.getHandler(), ctx.getClass()]) ?? [];
    if (needed.length && !needed.some((r) => roles.includes(r))) {
      throw new AppError('FORBIDDEN', "Your role can't do this.", 403);
    }
    req.org = { organizationId: orgId, membershipId: membership.id, roles };
    return true;
  }
}