import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import {
  googleSignInSchema,
  otpRequestSchema,
  otpVerifySchema,
  passwordLoginSchema,
  passwordResetSchema,
  refreshSchema,
  companySearchSchema,
  signupCheckSchema,
  signupSchema,
  type AuthResult,
  type OtpRequest,
  type OtpVerify,
  type PasswordLogin,
  type PasswordReset,
  type SignupInput,
} from '@rydo/shared';
import type { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe';
import { AppError } from '../common/app-error';
import { Auth, type AuthContext, type RydoRequest } from '../common/request-context';
import { ACCESS_TTL_SEC, COOKIE, REFRESH_TTL_SEC, cookieOptions } from './cookies';
import { randomToken } from './crypto';
import { Public } from './public.decorator';
import { AuthService } from './auth.service';
import { TokensService } from './tokens.service';
import { MeService } from '../me/me.service';
import { DOC_MAX_BYTES } from '../drivers/documents';
import { SignupService, type UploadedIdProof } from './signup.service';

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
    private readonly signups: SignupService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('otp/request')
  @HttpCode(200)
  async request(@Body(new ZodPipe(otpRequestSchema)) body: OtpRequest) {
    await this.auth.requestCode(body.email);
    return { data: { sent: true } };
  }

  /** Sends tokens in the body (mobile) or as httpOnly cookies (web). */
  private respond(client: 'MOBILE' | 'WEB', result: AuthResult, res: Response) {
    if (client === 'WEB') {
      setWebCookies(res, result.accessToken!, result.refreshToken!);
      return { data: { ...result, accessToken: undefined, refreshToken: undefined } };
    }
    return { data: result };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('password/login')
  @HttpCode(200)
  async passwordLogin(@Body(new ZodPipe(passwordLoginSchema)) body: PasswordLogin, @Req() req: RydoRequest, @Res({ passthrough: true }) res: Response) {
    return this.respond(body.client, await this.auth.passwordLogin(body, req.headers['user-agent']), res);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('password/reset')
  @HttpCode(200)
  async resetPassword(@Body(new ZodPipe(passwordResetSchema)) body: PasswordReset) {
    await this.auth.resetPassword(body);
    return { data: { passwordSet: true } };
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('otp/verify')
  @HttpCode(200)
  async verify(@Body(new ZodPipe(otpVerifySchema)) body: OtpVerify, @Req() req: RydoRequest, @Res({ passthrough: true }) res: Response) {
    return this.respond(body.client, await this.auth.verifyCode(body, req.headers['user-agent']), res);
  }

  // ── Self sign-up ──

  /** "Find your company" on the sign-up screen. */
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('companies')
  async companies(@Query(new ZodPipe(companySearchSchema)) q: z.infer<typeof companySearchSchema>) {
    return { data: await this.signups.searchCompanies(q.q) };
  }

  /** Departments and offices for the sign-up form. */
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('companies/:id/options')
  async companyOptions(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.signups.options(id) };
  }

  /** Is this work email's company on RYDO? (Same answer the code request gives; no account details.) */
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('signup/check')
  @HttpCode(200)
  async signupCheck(@Body(new ZodPipe(signupCheckSchema)) body: z.infer<typeof signupCheckSchema>) {
    return { data: await this.signups.check(body.email) };
  }

  /** Multipart: the form fields plus an optional ID photo as `idProof`. Returns a session; the member waits for HR approval. */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('signup')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('idProof', { limits: { fileSize: DOC_MAX_BYTES } }))
  async signup(@Body(new ZodPipe(signupSchema)) body: SignupInput, @UploadedFile() file: UploadedIdProof | undefined, @Req() req: RydoRequest, @Res({ passthrough: true }) res: Response) {
    return this.respond(body.client, await this.signups.signup(body, file, req.headers['user-agent']), res);
  }

  /** Continue with Google. Either a session, or { needsSignup, email, name, companyName } for a new employee. */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('google')
  @HttpCode(200)
  async google(@Body(new ZodPipe(googleSignInSchema)) body: z.infer<typeof googleSignInSchema>, @Req() req: RydoRequest, @Res({ passthrough: true }) res: Response) {
    const r = await this.signups.google(body.idToken, body.client, req.headers['user-agent']);
    if (r.needsSignup) return { data: r };
    return this.respond(body.client, r, res);
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