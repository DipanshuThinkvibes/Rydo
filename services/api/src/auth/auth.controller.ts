import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { otpRequestSchema, otpVerifySchema, refreshSchema, type OtpRequest, type OtpVerify } from '@rydo/shared';
import { ZodPipe } from '../common/zod.pipe';
import { AppError } from '../common/app-error';
import { Auth, type AuthContext, type RydoRequest } from '../common/request-context';
import { ACCESS_TTL_SEC, COOKIE, REFRESH_TTL_SEC, cookieOptions } from './cookies';
import { randomToken } from './crypto';
import { Public } from './public.decorator';
import { AuthService } from './auth.service';
import { TokensService } from './tokens.service';
import { MeService } from '../me/me.service';

const REFRESH_PATH = '/api/v1/auth';

function setWebCookies(res: Response, accessToken: string, refreshToken: string) {
  res.cookie(COOKIE.access, accessToken, cookieOptions(ACCESS_TTL_SEC));
  res.cookie(COOKIE.refresh, refreshToken, cookieOptions(REFRESH_TTL_SEC, true, REFRESH_PATH));
  res.cookie(COOKIE.csrf, randomToken(24), cookieOptions(REFRESH_TTL_SEC, false));
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokensService,
    private readonly me: MeService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('otp/request')
  @HttpCode(200)
  async request(@Body(new ZodPipe(otpRequestSchema)) body: OtpRequest) {
    await this.auth.requestCode(body.email);
    return { data: { sent: true } };
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('otp/verify')
  @HttpCode(200)
  async verify(@Body(new ZodPipe(otpVerifySchema)) body: OtpVerify, @Req() req: RydoRequest, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.verifyCode(body, req.headers['user-agent']);
    if (body.client === 'WEB') {
      setWebCookies(res, result.accessToken!, result.refreshToken!);
      return { data: { ...result, accessToken: undefined, refreshToken: undefined } };
    }
    return { data: result };
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body(new ZodPipe(refreshSchema)) body: { refreshToken?: string }, @Req() req: RydoRequest, @Res({ passthrough: true }) res: Response) {
    const token = body.refreshToken ?? (req.cookies?.[COOKIE.refresh] as string | undefined);
    if (!token) throw new AppError('UNAUTHENTICATED', 'Please sign in again.', 401);
    const next = await this.tokens.rotate(token);
    if (next.client === 'WEB') {
      setWebCookies(res, next.accessToken, next.refreshToken);
      return { data: await this.me.summary(next.userId) };
    }
    return { data: { accessToken: next.accessToken, refreshToken: next.refreshToken } };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Auth() auth: AuthContext, @Res({ passthrough: true }) res: Response) {
    await this.tokens.revoke(auth.sessionId);
    res.clearCookie(COOKIE.access, { path: '/' });
    res.clearCookie(COOKIE.refresh, { path: REFRESH_PATH });
    res.clearCookie(COOKIE.csrf, { path: '/' });
    return { data: { signedOut: true } };
  }
}