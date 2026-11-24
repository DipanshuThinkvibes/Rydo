import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/app-error';
import type { RydoRequest } from '../common/request-context';

/**
 * RYDO's own team: the Super Admin and the Support team. Used for the safety work (people, reports, pausing someone for a while).
 * Everything else in the owner console stays Super Admin only. The role found is kept on the request, so a route can allow more
 * to the Super Admin than to Support.
 */
@Injectable()
export class PlatformStaffGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<RydoRequest>();
    const rows = await this.prisma.platformAdmin.findMany({ where: { userId: req.auth!.userId }, select: { role: true } });
    if (!rows.length) throw new AppError('FORBIDDEN', 'RYDO team only.', 403);
    req.platformRole = rows.some((r) => r.role === 'SUPER_ADMIN') ? 'SUPER_ADMIN' : 'SUPPORT';
    return true;
  }
}
