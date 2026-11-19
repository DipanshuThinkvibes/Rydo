import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ClientType } from '@prisma/client';
import { normalizeIdNumber, type AuthResult, type CompanyMatch, type GoogleSignInResult, type SignupCheck, type SignupInput, type SignupOptions } from '@rydo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/app-error';
import { AuditService } from '../audit/audit.service';
import { MeService } from '../me/me.service';
import { STORAGE_ADAPTER, type StorageAdapter } from '../adapters/storage.adapter';
import { IDENTITY_ADAPTER, type IdentityAdapter } from '../adapters/identity.adapter';
import { DOC_MAX_BYTES, DOC_TYPES } from '../drivers/documents';
import { OtpService } from './otp.service';
import { TokensService } from './tokens.service';
import { hashPassword } from './password';
import { randomToken } from './crypto';

const domainOf = (email: string) => email.split('@')[1];

/** Aadhaar may not be stored in full by RYDO: keep the last 4 digits only. Other ID numbers are kept as typed (upper-case). */
export function storedIdNumber(type: string, raw: string) {
  const n = normalizeIdNumber(raw);
  return type === 'AADHAAR' ? `XXXX XXXX ${n.slice(-4)}` : n;
}

export interface UploadedIdProof {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

/**
 * Self sign-up for employees of companies on RYDO: work-email domain check, employee details, ID proof photo,
 * email proven by a 6-digit code or by Google. New members wait for HR approval (status PENDING).
 */
@Injectable()
export class SignupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly tokens: TokensService,
    private readonly me: MeService,
    private readonly audit: AuditService,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
    @Inject(IDENTITY_ADAPTER) private readonly identity: IdentityAdapter,
  ) {}

  private companyFor(email: string) {
    return this.prisma.organization.findFirst({ where: { status: 'ACTIVE', emailDomains: { has: domainOf(email) } } });
  }

  /** "Find your company": active companies whose name contains the text (at most 5). */
  async searchCompanies(q: string): Promise<CompanyMatch[]> {
    const rows = await this.prisma.organization.findMany({
      where: { status: 'ACTIVE', name: { contains: q, mode: 'insensitive' } },
      select: { id: true, name: true, emailDomains: true },
      orderBy: { name: 'asc' },
      take: 5,
    });
    return rows.map((r) => ({ id: r.id, name: r.name, domains: r.emailDomains }));
  }

  /** Departments and offices to choose from on the form (names only). */
  async options(companyId: string): Promise<SignupOptions> {
    const company = await this.prisma.organization.findFirst({ where: { id: companyId, status: 'ACTIVE' }, select: { id: true } });
    if (!company) throw new AppError('NOT_FOUND', 'Company not found.', 404);
    const [departments, offices] = await Promise.all([
      this.prisma.department.findMany({ where: { organizationId: companyId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      this.prisma.$queryRaw<{ id: string; name: string }[]>`SELECT id, name FROM offices WHERE organization_id = ${companyId}::uuid ORDER BY is_default DESC, name`,
    ]);
    return { departments, offices };
  }

  async check(email: string): Promise<SignupCheck> {
    const c = await this.companyFor(email);
    return { registered: !!c, companyName: c?.name ?? null };
  }

  private async session(userId: string, client: string, userAgent?: string): Promise<AuthResult> {
    const t = await this.tokens.issue(userId, client as ClientType, userAgent);
    return { ...(await this.me.summary(userId)), accessToken: t.accessToken, refreshToken: t.refreshToken };
  }

  /** Continue with Google: known people are signed in; new people from a registered company go to the sign-up form. */
  async google(idToken: string, client: string, userAgent?: string): Promise<GoogleSignInResult> {
    const g = await this.identity.verifyGoogleIdToken(idToken);
    if (!g.emailVerified) throw new AppError('INVALID_CREDENTIALS', 'Your Google email is not verified.', 401);
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ googleSub: g.sub }, { email: g.email }] },
      include: { platformRoles: true, memberships: { where: { status: { not: 'LEFT' } } } },
    });
    if (user) {
      if (user.googleSub && user.googleSub !== g.sub) throw new AppError('INVALID_CREDENTIALS', 'This email is linked to a different Google account.', 401);
      if (user.status === 'DISABLED') throw new AppError('FORBIDDEN', 'This account is disabled.', 403);
      if (user.platformRoles.length > 0 || user.memberships.length > 0) {
        if (!user.googleSub) await this.prisma.user.update({ where: { id: user.id }, data: { googleSub: g.sub } });
        return this.session(user.id, client, userAgent);
      }
    }
    const company = await this.companyFor(g.email);
    if (!company) throw new AppError('COMPANY_NOT_ON_RYDO', "Your company isn't on RYDO yet. Sign in with your work Google account or ask your HR team.", HttpStatus.BAD_REQUEST);
    return { needsSignup: true, email: g.email, name: g.name ?? '', companyId: company.id, companyName: company.name };
  }

  async signup(dto: SignupInput, file: UploadedIdProof | undefined, userAgent?: string): Promise<AuthResult> {
    // The ID photo is optional; when sent it must be a picture or PDF up to 5 MB.
    const ext = file ? DOC_TYPES[file.mimetype] : undefined;
    if (file && (!ext || file.size > DOC_MAX_BYTES)) {
      throw new AppError('VALIDATION_ERROR', 'The ID photo must be a JPG, PNG, WebP or PDF up to 5 MB.', HttpStatus.BAD_REQUEST, { idProof: 'JPG, PNG, WebP or PDF, max 5 MB' });
    }

    // The chosen company must own the email's domain (checked before the code is used up).
    const company = await this.prisma.organization.findFirst({ where: { id: dto.companyId, status: 'ACTIVE' } });
    if (!company) throw new AppError('COMPANY_NOT_ON_RYDO', "This company isn't on RYDO.", HttpStatus.BAD_REQUEST);
    if (!company.emailDomains.includes(domainOf(dto.email))) {
      const ends = company.emailDomains.map((d) => `@${d}`).join(' or ');
      throw new AppError('VALIDATION_ERROR', `Use your ${company.name} work email (ending in ${ends}).`, HttpStatus.BAD_REQUEST, { email: `Must end in ${ends}` });
    }
    const [dept, office] = await Promise.all([
      dto.departmentId ? this.prisma.department.findFirst({ where: { id: dto.departmentId, organizationId: company.id }, select: { id: true } }) : null,
      dto.officeId ? this.prisma.office.findFirst({ where: { id: dto.officeId, organizationId: company.id }, select: { id: true } }) : null,
    ]);
    if (dto.departmentId && !dept) throw new AppError('VALIDATION_ERROR', 'Choose a department from the list.', HttpStatus.BAD_REQUEST, { departmentId: 'Not in this company' });
    if (dto.officeId && !office) throw new AppError('VALIDATION_ERROR', 'Choose an office from the list.', HttpStatus.BAD_REQUEST, { officeId: 'Not in this company' });

    // 1. The email is theirs: the emailed code, or a Google sign-in for the same verified email.
    let googleSub: string | null = null;
    if (dto.googleIdToken) {
      const g = await this.identity.verifyGoogleIdToken(dto.googleIdToken);
      if (!g.emailVerified || g.email !== dto.email) throw new AppError('INVALID_CREDENTIALS', 'Google sign-in does not match this email.', 401);
      googleSub = g.sub;
    } else {
      await this.otp.verify(dto.email, dto.code!);
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { memberships: { where: { organizationId: company.id } } },
    });
    const member = existing?.memberships[0];
    if (member?.signedUpAt) throw new AppError('CONFLICT', 'An account already exists for this email. Sign in instead.', 409);
    if (existing?.status === 'DISABLED') throw new AppError('FORBIDDEN', 'This account is disabled.', 403);
    if (googleSub && existing?.googleSub && existing.googleSub !== googleSub) throw new AppError('INVALID_CREDENTIALS', 'This email is linked to a different Google account.', 401);

    const employeeId = dto.employeeId.trim();
    const clash = await this.prisma.membership.findFirst({
      where: { organizationId: company.id, employeeCode: { equals: employeeId, mode: 'insensitive' }, ...(member ? { id: { not: member.id } } : {}) },
      select: { id: true },
    });
    if (clash) throw new AppError('CONFLICT', 'This employee ID is already registered. Check it or ask your HR team.', 409, { employeeId: 'Already registered' });

    // 3. Account and membership (PENDING until HR approves). Older code-only sign-ins are completed here.
    const passwordHash = dto.password ? await hashPassword(dto.password) : undefined;
    const details = {
      employeeCode: employeeId,
      jobTitle: dto.jobTitle.trim(),
      departmentId: dto.departmentId ?? null,
      officeId: dto.officeId ?? null,
      managerName: dto.managerName.trim(),
      managerEmail: dto.managerEmail,
      managerEmployeeCode: dto.managerEmployeeId?.trim() || null,
      idProofType: dto.idProofType,
      idProofNumber: storedIdNumber(dto.idProofType, dto.idProofNumber),
    };
    const { userId, membershipId } = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.upsert({
        where: { email: dto.email },
        update: { name: dto.name.trim(), phone: dto.phone.trim(), ...(passwordHash ? { passwordHash } : {}), ...(googleSub ? { googleSub } : {}) },
        create: { email: dto.email, name: dto.name.trim(), phone: dto.phone.trim(), passwordHash: passwordHash ?? null, googleSub },
      });
      const m = member
        ? await tx.membership.update({ where: { id: member.id }, data: details })
        : await tx.membership.create({ data: { organizationId: company.id, userId: user.id, status: 'PENDING', ...details, roles: { create: [{ role: 'RIDER' }] } } });
      return { userId: user.id, membershipId: m.id };
    });

    // 4. An ID photo, if sent, is private: only HR opens it, through a short-lived link.
    let idProofKey: string | undefined;
    if (file && ext) {
      idProofKey = `orgs/${company.id}/members/${membershipId}/id-proof-${randomToken(9)}.${ext}`;
      await this.storage.put(idProofKey, file.buffer, file.mimetype);
    }
    await this.prisma.membership.update({ where: { id: membershipId }, data: { ...(idProofKey ? { idProofKey } : {}), signedUpAt: new Date() } });
    await this.audit.log({
      organizationId: company.id,
      actorUserId: userId,
      action: 'MEMBER_SIGNED_UP',
      entityType: 'membership',
      entityId: membershipId,
      after: { employeeId, jobTitle: details.jobTitle, managerEmail: dto.managerEmail, idProofType: dto.idProofType, idPhoto: !!idProofKey, via: googleSub ? 'google' : 'email-code' },
    });

    return this.session(userId, dto.client, userAgent);
  }
}
