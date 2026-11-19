import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { emailVerifySchema, type EmailVerifyInput } from '@rydo/shared';
import { ZodPipe } from '../common/zod.pipe';
import { AppError } from '../common/app-error';
import { Auth, type AuthContext } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OtpService } from '../auth/otp.service';

/** Proving you own your email address from the account page: a 6-digit code is emailed, you type it back. */
@Controller('me/email')
export class EmailVerificationController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly audit: AuditService,
  ) {}

  private async me(auth: AuthContext) {
    return this.prisma.user.findUniqueOrThrow({ where: { id: auth.userId }, select: { email: true, emailVerifiedAt: true } });
  }

  @Get()
  async status(@Auth() auth: AuthContext) {
    const u = await this.me(auth);
    return { data: { email: u.email, verified: !!u.emailVerifiedAt, verifiedAt: u.emailVerifiedAt } };
  }

  /** Emails a code. At most 5 a hour per address (the same limit as sign-in codes). */
  @Post('verify/send')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  async send(@Auth() auth: AuthContext) {
    const u = await this.me(auth);
    if (u.emailVerifiedAt) throw new AppError('CONFLICT', 'Your email address is already verified.', 409);
    await this.otp.send(u.email, 'verify-email');
    return { data: { sent: true, email: u.email } };
  }

  @Post('verify')
  @HttpCode(200)
  async verify(@Auth() auth: AuthContext, @Body(new ZodPipe(emailVerifySchema)) b: EmailVerifyInput) {
    const u = await this.me(auth);
    if (u.emailVerifiedAt) return { data: { verified: true, verifiedAt: u.emailVerifiedAt } };
    await this.otp.verify(u.email, b.code); // throws OTP_INVALID / OTP_EXPIRED / OTP_TOO_MANY_ATTEMPTS
    const verifiedAt = new Date();
    await this.prisma.user.update({ where: { id: auth.userId }, data: { emailVerifiedAt: verifiedAt } });
    await this.audit.log({ actorUserId: auth.userId, action: 'EMAIL_VERIFIED', entityType: 'user', entityId: auth.userId });
    return { data: { verified: true, verifiedAt } };
  }
}
