import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppError } from '../common/app-error';
import type { RydoRequest } from '../common/request-context';
import { COOKIE, CSRF_HEADER } from './cookies';
import { IS_PUBLIC } from './public.decorator';
import { TokensService } from './tokens.service';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Global: every route needs a valid access token unless marked @Public(). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokensService,
  ) {}

  async canActivate(ctx: ExecutionContext) {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest<RydoRequest>();

    const bearer = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    const cookie = req.cookies?.[COOKIE.access] as string | undefined;
    const token = bearer ?? cookie;
    if (!token) throw new AppError('UNAUTHENTICATED', 'Please sign in.', 401);

    let payload;
    try {
      payload = await this.tokens.verifyAccess(token);
    } catch {
      throw new AppError('UNAUTHENTICATED', 'Your session expired. Please sign in again.', 401);
    }

    const viaCookie = !bearer;
    // Web (cookie) requests that change data must echo the CSRF cookie in a header.
    if (viaCookie && !SAFE.has(req.method)) {
      const sent = req.headers[CSRF_HEADER];
      if (!sent || sent !== req.cookies?.[COOKIE.csrf]) throw new AppError('FORBIDDEN', 'Missing security token. Reload the page.', 403);
    }
    req.auth = { userId: payload.sub, sessionId: payload.sid, viaCookie };
    return true;
  }
}