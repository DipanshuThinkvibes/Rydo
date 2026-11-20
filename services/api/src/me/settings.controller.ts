import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { notificationPrefs, updateSettingsSchema, type UpdateSettings } from '@rydo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppError } from '../common/app-error';
import { ZodPipe } from '../common/zod.pipe';
import { Auth, type AuthContext } from '../common/request-context';

/** Ended sessions stay visible this long. */
const HISTORY_DAYS = 30;

/** A person's own settings: what they are told about, and where they are signed in. Never touches anyone else's. */
@Controller('me')
export class SettingsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get('settings')
  async settings(@Auth() auth: AuthContext) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.userId }, select: { notificationPrefs: true } });
    return { data: { notifications: notificationPrefs(u.notificationPrefs) } };
  }

  @Patch('settings')
  async update(@Auth() auth: AuthContext, @Body(new ZodPipe(updateSettingsSchema)) b: UpdateSettings) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.userId }, select: { notificationPrefs: true } });
    const next = { ...notificationPrefs(u.notificationPrefs), ...b.notifications };
    await this.prisma.user.update({ where: { id: auth.userId }, data: { notificationPrefs: next } });
    return { data: { notifications: next } };
  }

  /**
   * Where this person is signed in, plus sessions that ended in the last 30 days so nothing looks missing.
   * Each row says ACTIVE (still signed in), SIGNED_OUT (signed out or removed) or EXPIRED (ran its course).
   * The device in use is marked and listed first.
   */
  @Get('sessions')
  async sessions(@Auth() auth: AuthContext) {
    const now = new Date();
    const rows = await this.prisma.session.findMany({
      where: { userId: auth.userId, createdAt: { gte: new Date(now.getTime() - HISTORY_DAYS * 86_400_000) } },
      orderBy: { createdAt: 'desc' },
      take: 60,
      select: { id: true, client: true, userAgent: true, createdAt: true, expiresAt: true, revokedAt: true },
    });
    const data = rows.map(({ expiresAt, revokedAt, ...s }) => {
      const status = revokedAt ? 'SIGNED_OUT' : expiresAt <= now ? 'EXPIRED' : 'ACTIVE';
      return { ...s, status, endedAt: status === 'SIGNED_OUT' ? revokedAt : status === 'EXPIRED' ? expiresAt : null, current: s.id === auth.sessionId };
    });
    return { data: [...data.filter((s) => s.current), ...data.filter((s) => !s.current)] };
  }

  /** Signs every other device out. This one stays signed in. */
  @Post('sessions/revoke-others')
  @HttpCode(200)
  async revokeOthers(@Auth() auth: AuthContext) {
    const r = await this.prisma.session.updateMany({ where: { userId: auth.userId, revokedAt: null, id: { not: auth.sessionId } }, data: { revokedAt: new Date() } });
    await this.audit.log({ actorUserId: auth.userId, action: 'SESSIONS_REVOKED', entityType: 'user', entityId: auth.userId, after: { count: r.count } });
    return { data: { signedOut: r.count } };
  }

  /** Signs one other device out. To leave this device, use Sign out. */
  @Delete('sessions/:id')
  @HttpCode(200)
  async revoke(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    if (id === auth.sessionId) throw new AppError('CONFLICT', 'This is the device you are using. Use Sign out to leave it.', 409);
    const r = await this.prisma.session.updateMany({ where: { id, userId: auth.userId, revokedAt: null }, data: { revokedAt: new Date() } });
    if (!r.count) throw new AppError('NOT_FOUND', 'That device is not signed in any more.', 404);
    return { data: { id, signedOut: true } };
  }
}
