import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ClientType } from '@prisma/client';
import type { AuthResult, GoogleAuth, OtpVerify, PasswordLogin, PasswordReset } from '@rydo/shared';
import { GOOGLE_IDENTITY, type GoogleIdentityAdapter } from '../adapters/google-identity.adapter';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/app-error';
import { MeService } from '../me/me.service';
import { OtpService } from './otp.service';
import { TokensService } from './tokens.service';
import { DUMMY_HASH, hashPassword, verifyPassword } from './password';

const domainOf = (email: string) => email.split('@')[1];
const nameFromEmail = (email: string) =>
  email.split('@')[0].split(/[._-]+/).filter(Boolean).map((p) => p[0].toUpperCase() + p.slice(1)).join(' ');

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly tokens: TokensService,
    private readonly me: MeService,
    @Inject(GOOGLE_IDENTITY) private readonly google: GoogleIdentityAdapter,
  ) {}

  private companyFor(email: string) {
    return this.prisma.organization.findFirst({ where: { status: 'ACTIVE', emailDomains: { has: domainOf(email) } } });
  }

  /** Only people from a company on RYDO, invited admins and platform admins get a code. */
  async requestCode(email: string) {
    const [company, user] = await Promise.all([
      this.companyFor(email),
      this.prisma.user.findUnique({ where: { email }, include: { platformRoles: true, memberships: { where: { status: { not: 'LEFT' } } } } }),
    ]);
    const known = user && (user.platformRoles.length > 0 || user.memberships.length > 0);
    if (!company && !known) {
      throw new AppError('COMPANY_NOT_ON_RYDO', "Your company isn't on RYDO yet. Use your work email or ask your HR team.", HttpStatus.BAD_REQUEST);
    }
    await this.otp.send(email);
  }

  /** Email + password. One vague error for every failure so nobody can probe which emails exist. */
  async passwordLogin(dto: PasswordLogin, userAgent?: string): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    const ok = await verifyPassword(dto.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !user.passwordHash || !ok) throw new AppError('INVALID_CREDENTIALS', 'Email or password is wrong.', 401);
    if (user.status === 'DISABLED') throw new AppError('FORBIDDEN', 'This account is disabled.', 403);
    const tokens = await this.tokens.issue(user.id, dto.client as ClientType, userAgent);
    return { ...(await this.me.summary(user.id)), accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
  }

  /** Forgot password: the emailed code proves the inbox, then every old session is signed out. */
  async resetPassword(dto: PasswordReset) {
    await this.otp.verify(dto.email, dto.code);
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) throw new AppError('INVALID_CREDENTIALS', 'No RYDO account uses this email yet.', 400);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(dto.newPassword) } }),
      this.prisma.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
  }

  async verifyCode(dto: OtpVerify, userAgent?: string): Promise<AuthResult> {
    await this.otp.verify(dto.email, dto.code);

    const user = await this.prisma.user.upsert({
      where: { email: dto.email },
      update: {},
      create: { email: dto.email, name: nameFromEmail(dto.email) },
    });
    if (user.status === 'DISABLED') throw new AppError('FORBIDDEN', 'This account is disabled.', 403);

    // The code came to this inbox, so the email is proven.
    await this.prisma.user.updateMany({ where: { id: user.id, emailVerifiedAt: null }, data: { emailVerifiedAt: new Date() } });
    // First sign-in from a company domain: join that company and wait for HR approval.
    await this.joinCompanyIfNew(user.id, dto.email);

    const tokens = await this.tokens.issue(user.id, dto.client as ClientType, userAgent);
    return { ...(await this.me.summary(user.id)), accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
  }

  /** First sign-in from a company's email domain: a waiting membership, so the company's HR can approve it. */
  private async joinCompanyIfNew(userId: string, email: string) {
    const company = await this.companyFor(email);
    if (!company) return;
    const existing = await this.prisma.membership.findUnique({ where: { organizationId_userId: { organizationId: company.id, userId } } });
    if (!existing) await this.prisma.membership.create({ data: { organizationId: company.id, userId, status: 'PENDING', roles: { create: [{ role: 'RIDER' }] } } });
  }

  /**
   * Sign in or sign up with Google. Google proves the email, so no code is needed. The email's domain must belong to a
   * company on RYDO, and (on sign-up) must be the company the person picked, so a personal Gmail cannot join Acme.
   */
  async googleSignIn(dto: GoogleAuth, userAgent?: string): Promise<AuthResult> {
    const g = await this.google.verify(dto.idToken);
    const email = g.email.toLowerCase();
    const domain = domainOf(email);
    if (!g.emailVerified) throw new AppError('UNAUTHENTICATED', 'Google says this email address is not verified. Verify it with Google, or use your email code.', HttpStatus.UNAUTHORIZED);

    if (dto.expectDomain && domain !== dto.expectDomain) {
      throw new AppError('DOMAIN_MISMATCH', `The Google account ${email} is not a @${dto.expectDomain} account. Sign in with your @${dto.expectDomain} work Google account, or use your email code.`, HttpStatus.BAD_REQUEST);
    }

    const [company, existing] = await Promise.all([
      this.companyFor(email),
      this.prisma.user.findUnique({ where: { email }, include: { platformRoles: true, memberships: { where: { status: { not: 'LEFT' } } } } }),
    ]);
    const known = existing && (existing.platformRoles.length > 0 || existing.memberships.length > 0);
    if (!company && !known) {
      throw new AppError('DOMAIN_MISMATCH', `@${domain} is not a company on RYDO. Use your work Google account, or ask your company to join RYDO.`, HttpStatus.BAD_REQUEST);
    }
    if (dto.mode === 'login' && !existing) {
      throw new AppError('NOT_FOUND', 'There is no RYDO account for this Google email yet. Choose Sign up to create one.', HttpStatus.NOT_FOUND);
    }
    if (existing?.status === 'DISABLED') throw new AppError('FORBIDDEN', 'This account is disabled.', HttpStatus.FORBIDDEN);

    const user = existing ?? (await this.prisma.user.create({ data: { email, name: g.name?.trim() || nameFromEmail(email) } }));
    await this.prisma.user.updateMany({ where: { id: user.id, emailVerifiedAt: null }, data: { emailVerifiedAt: new Date() } }); // Google verified it
    await this.joinCompanyIfNew(user.id, email);

    const tokens = await this.tokens.issue(user.id, dto.client as ClientType, userAgent);
    return { ...(await this.me.summary(user.id)), accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
  }
}
