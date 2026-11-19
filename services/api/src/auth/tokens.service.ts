import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ClientType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/app-error';
import { ACCESS_TTL_SEC, REFRESH_TTL_SEC } from './cookies';
import { randomToken, sha256 } from './crypto';

export interface AccessPayload {
  sub: string; // user id
  sid: string; // session id
}

/** Short-lived access JWT + long-lived refresh token (stored hashed, rotated on every use). */
@Injectable()
export class TokensService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private access(userId: string, sessionId: string) {
    return this.jwt.signAsync({ sub: userId, sid: sessionId } satisfies AccessPayload, { expiresIn: ACCESS_TTL_SEC });
  }

  async issue(userId: string, client: ClientType, userAgent?: string) {
    const refreshToken = randomToken();
    const session = await this.prisma.session.create({
      data: {
        userId,
        client,
        userAgent: userAgent?.slice(0, 300),
        refreshTokenHash: sha256(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TTL_SEC * 1000),
      },
    });
    return { accessToken: await this.access(userId, session.id), refreshToken, sessionId: session.id };
  }

  async rotate(refreshToken: string) {
    const session = await this.prisma.session.findUnique({ where: { refreshTokenHash: sha256(refreshToken) } });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new AppError('UNAUTHENTICATED', 'Please sign in again.', 401);
    }
    const next = randomToken();
    await this.prisma.session.update({
      where: { id: session.id },
      data: { refreshTokenHash: sha256(next), expiresAt: new Date(Date.now() + REFRESH_TTL_SEC * 1000) },
    });
    return { accessToken: await this.access(session.userId, session.id), refreshToken: next, userId: session.userId, client: session.client };
  }

  async revoke(sessionId: string) {
    await this.prisma.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  /**
   * Checks the signature and expiry, then that the session behind it is still alive. Without the second check a
   * logged-out (or revoked) token would keep working until it expires. One lookup by primary key per request.
   */
  async verifyAccess(token: string) {
    const payload = await this.jwt.verifyAsync<AccessPayload>(token);
    const session = await this.prisma.session.findUnique({ where: { id: payload.sid }, select: { revokedAt: true, expiresAt: true } });
    if (!session || session.revokedAt || session.expiresAt < new Date()) throw new Error('session ended');
    return payload;
  }
}