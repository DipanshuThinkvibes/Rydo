import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/app-error';
import type { RydoRequest } from '../common/request-context';

/** RYDO staff only (Super Admin). The one role that works across companies. */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<RydoRequest>();
    const admin = await this.prisma.platformAdmin.findUnique({
      where: { userId_role: { userId: req.auth!.userId, role: 'SUPER_ADMIN' } },
    });
    if (!admin) throw new AppError('FORBIDDEN', 'RYDO admins only.', 403);
    return true;
  }
}