import { Injectable } from '@nestjs/common';
import type { MembershipSummary, OrgRoleName, SetPassword, UpdateMe } from '@rydo/shared';
import { AppError } from '../common/app-error';
import { hashPassword, verifyPassword } from '../auth/password';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MeService {
  constructor(private readonly prisma: PrismaService) {}

  /** The signed-in person, their companies and roles, in one query. */
  async summary(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        platformRoles: true,
        memberships: {
          where: { status: { not: 'LEFT' } },
          include: { roles: true, organization: { select: { id: true, name: true, slug: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    const memberships: MembershipSummary[] = user.memberships.map((m) => ({
      id: m.id,
      organization: m.organization,
      status: m.status,
      roles: m.roles.map((r) => r.role as OrgRoleName),
    }));
    return {
      user: { id: user.id, email: user.email, name: user.name, isPlatformAdmin: user.platformRoles.some((p) => p.role === 'SUPER_ADMIN') },
      memberships,
    };
  }

  /** Set a first password, or change it (then the current one is required). */
  async setPassword(userId: string, dto: SetPassword) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.passwordHash && !(dto.currentPassword && (await verifyPassword(dto.currentPassword, user.passwordHash)))) {
      throw new AppError('INVALID_CREDENTIALS', 'Your current password is wrong.', 400, { currentPassword: 'Wrong password' });
    }
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(dto.newPassword) } });
    return { passwordSet: true };
  }

  async update(userId: string, data: UpdateMe) {
    await this.prisma.user.update({ where: { id: userId }, data });
    return this.summary(userId);
  }
}