import { ExecutionContext, Injectable } from '@nestjs/common';
import type { RydoRequest } from '../common/request-context';
import { OrgGuard } from './org.guard';

/**
 * For shared tools (e.g. address search) used inside a company AND by RYDO admins in the owner console.
 * A Super Admin is always allowed (these routes never read company data); everyone else goes through the normal tenant check.
 */
@Injectable()
export class OrgOrPlatformGuard extends OrgGuard {
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<RydoRequest>();
    const admin = await this.prismaClient.platformAdmin.findUnique({ where: { userId_role: { userId: req.auth!.userId, role: 'SUPER_ADMIN' } } });
    if (admin) return true;
    return super.canActivate(ctx);
  }
}