import { HttpStatus, Injectable } from '@nestjs/common';
import { ClientType } from '@prisma/client';
import type { AuthResult, OtpVerify } from '@rydo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/app-error';
import { MeService } from '../me/me.service';
import { OtpService } from './otp.service';
import { TokensService } from './tokens.service';

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

  async verifyCode(dto: OtpVerify, userAgent?: string): Promise<AuthResult> {
    await this.otp.verify(dto.email, dto.code);

    const user = await this.prisma.user.upsert({
      where: { email: dto.email },
      update: {},
      create: { email: dto.email, name: nameFromEmail(dto.email) },
    });
    if (user.status === 'DISABLED') throw new AppError('FORBIDDEN', 'This account is disabled.', 403);

    // First sign-in from a company domain: join that company and wait for HR approval.
    const company = await this.companyFor(dto.email);
    if (company) {
      const existing = await this.prisma.membership.findUnique({
        where: { organizationId_userId: { organizationId: company.id, userId: user.id } },
      });
      if (!existing) {
        await this.prisma.membership.create({
          data: { organizationId: company.id, userId: user.id, status: 'PENDING', roles: { create: [{ role: 'RIDER' }] } },
        });
      }
    }

    const tokens = await this.tokens.issue(user.id, dto.client as ClientType, userAgent);
    return { ...(await this.me.summary(user.id)), accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
  }
}