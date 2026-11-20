import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ClientType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/app-error';
import { ACCESS_TTL_SEC, ACTIVITY_WRITE_SEC, MOBILE_SESSION_SEC, WEB_IDLE_SEC } from './cookies';
import { randomToken, sha256 } from './crypto';

export interface AccessPayload {
  sub: string; // user id
  sid: string; // session id
}

interface Lifetime {
  client: ClientType;
  expiresAt: Date;
  lastActiveAt: Date;
  revokedAt: Date | null;
}

/**
 * Short-lived access JWT + refresh token (stored hashed, rotated on every use).
 * A mobile sign-in ends 14 days after it started. A website sign-in ends after 2 hours without use.
 */
@Injectable()
export class TokensService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private access(userId: string, sessionId: string) {
    return this.jwt.signAsync({ sub: userId, sid: sessionId } satisfies AccessPayload, { expiresIn: ACCESS_TTL_SEC });
  }

  /** When a session started at `now` would end if nothing else happened. */
  private endFor(client: ClientType, now: Date) {
    return new Date(now.getTime() + (client === 'MOBILE' ? MOBILE_SESSION_SEC : WEB_IDLE_SEC) * 1000);
  }

  /** True when the session has ended: revoked, past its end, or (website only) unused for 2 hours. */
  private ended(s: Lifetime, now: Date) {
    if (s.revokedAt || s.expiresAt <= now) return true;
    return s.client === 'WEB' && now.getTime() - s.lastActiveAt.getTime() > WEB_IDLE_SEC * 1000;
  }

  async issue(userId: string, client: ClientType, userAgent?: string) {
    const refreshToken = randomToken();
    const now = new Date();
    const session = await this.prisma.session.create({
      data: { userId, client, userAgent: userAgent?.slice(0, 300), refreshTokenHash: sha256(refreshToken), expiresAt: this.endFor(client, now), lastActiveAt: now },
    });
    return { accessToken: await this.access(userId, session.id), refreshToken, sessionId: session.id };
  }

  async rotate(refreshToken: string) {
    const session = await this.prisma.session.findUnique({ where: { refreshTokenHash: sha256(refreshToken) } });
    const now = new Date();
    if (!session || this.ended(session, now)) throw new AppError('UNAUTHENTICATED', 'Please sign in again.', 401);
    const next = randomToken();
    await this.prisma.session.update({
      where: { id: session.id },
      // The app keeps its original 14-day end. The website starts its 2 hours again.
      data: { refreshTokenHash: sha256(next), lastActiveAt: now, ...(session.client === 'WEB' ? { expiresAt: this.endFor('WEB', now) } : {}) },
    });
    return { accessToken: await this.access(session.userId, session.id), refreshToken: next, userId: session.userId, client: session.client };
  }

  async revoke(sessionId: string) {
    await this.prisma.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  /**
   * Checks the signature and expiry, then that the session behind it is still alive. Without the second check a
   * logged-out (or revoked) token would keep working until it expires. One lookup by primary key per request;
   * on the website the "last used" time is saved at most once a minute.
   */
  async verifyAccess(token: string) {
    const payload = await this.jwt.verifyAsync<AccessPayload>(token);
    const session = await this.prisma.session.findUnique({ where: { id: payload.sid }, select: { client: true, expiresAt: true, lastActiveAt: true, revokedAt: true } });
    const now = new Date();
    if (!session || this.ended(session, now)) throw new Error('session ended');
    if (session.client === 'WEB' && now.getTime() - session.lastActiveAt.getTime() > ACTIVITY_WRITE_SEC * 1000) {
      await this.prisma.session.updateMany({ where: { id: payload.sid, revokedAt: null }, data: { lastActiveAt: now, expiresAt: this.endFor('WEB', now) } });
    }
    return payload;
  }
}
