import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/app-error';
import { env } from '../config/env';
import { MESSAGE_ADAPTER, MessageAdapter } from '../adapters/message.adapter';
import { hmac, safeEqual, sixDigitCode } from './crypto';

const TTL_MIN = 10;
const MAX_ATTEMPTS = 5;
const MAX_PER_HOUR = 5;

/** 6-digit sign-in codes. Only a keyed hash is stored; the code itself exists only in the email. */
@Injectable()
export class OtpService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(MESSAGE_ADAPTER) private readonly messages: MessageAdapter,
  ) {}

  private hash(email: string, code: string) {
    return hmac(env().OTP_PEPPER, `${email}:${code}`);
  }

  async send(email: string) {
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const recent = await this.prisma.otpCode.count({ where: { email, createdAt: { gte: since } } });
    if (recent >= MAX_PER_HOUR) {
      throw new AppError('RATE_LIMITED', 'Too many codes requested. Try again in an hour.', HttpStatus.TOO_MANY_REQUESTS);
    }
    const code = sixDigitCode();
    await this.prisma.otpCode.create({
      data: { email, codeHash: this.hash(email, code), expiresAt: new Date(Date.now() + TTL_MIN * 60 * 1000) },
    });
    await this.messages.sendEmail({
      to: email,
      subject: `${code} is your RYDO sign-in code`,
      text: `Your RYDO sign-in code is ${code}. It expires in ${TTL_MIN} minutes. If you didn't ask for it, ignore this email.`,
    });
  }

  /** Throws unless the latest unused code for this email matches. Consumes it on success. */
  async verify(email: string, code: string) {
    const otp = await this.prisma.otpCode.findFirst({
      where: { email, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp || otp.expiresAt < new Date()) throw new AppError('OTP_EXPIRED', 'This code has expired. Request a new one.');
    if (otp.attempts >= MAX_ATTEMPTS) {
      throw new AppError('OTP_TOO_MANY_ATTEMPTS', 'Too many wrong tries. Request a new code.', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (!safeEqual(otp.codeHash, this.hash(email, code))) {
      await this.prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      throw new AppError('OTP_INVALID', 'That code is not right.');
    }
    await this.prisma.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
  }
}