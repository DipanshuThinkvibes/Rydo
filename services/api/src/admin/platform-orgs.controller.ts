import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  addOrgAdminSchema,
  clientSetupSchema,
  createOrgSchema,
  DEFAULT_ORG_SETTINGS,
  LICENSE_INFO,
  LICENSE_PRODUCTS,
  orgFeatures,
  platformUpdateOrgSchema,
  supportGrantSchema,
  type ClientSetup,
  type OrgSettings,
  type PlatformUpdateOrg,
} from '@rydo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppError } from '../common/app-error';
import { ZodPipe } from '../common/zod.pipe';
import { Auth, type AuthContext } from '../common/request-context';
import { PlatformAdmin } from '../tenancy/decorators';
import { hashPassword } from '../auth/password';
import { MESSAGE_ADAPTER, type MessageAdapter } from '../adapters/message.adapter';
import { env } from '../config/env';

interface Stats {
  id: string;
  activeMembers: number;
  pendingMembers: number;
  verifiedDrivers: number;
  pendingDrivers: number;
  ridesNext7: number;
  ridesLast7: number;
  bookingsLast7: number;
  lastActivityAt: Date | null;
}

/** RYDO owner console: onboard clients, set them up, switch features, watch them, support them. */
@Controller('admin/platform')
@PlatformAdmin()
export class PlatformOrgsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(MESSAGE_ADAPTER) private readonly messages: MessageAdapter,
  ) {}

  /** Every client with live numbers, in one query. */
  @Get('organizations')
  async list() {
    const [orgs, stats] = await Promise.all([this.prisma.organization.findMany({ orderBy: { createdAt: 'desc' } }), this.stats()]);
    const s = new Map(stats.map((x) => [x.id, x]));
    return { data: orgs.map((o) => ({ ...this.public(o), stats: s.get(o.id) ?? null })) };
  }

  @Get('organizations/:id')
  async detail(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    const org = await this.prisma.organization.findUnique({ where: { id } });
    if (!org) throw new AppError('NOT_FOUND', 'Company not found.', 404);
    const [[stats], admins, offices, series, recent, support] = await Promise.all([
      this.stats(id),
      this.prisma.membership.findMany({
        where: { organizationId: id, roles: { some: { role: { in: ['ORG_ADMIN', 'HR_ADMIN', 'OPS_ADMIN'] } } } },
        include: { user: { select: { name: true, email: true, passwordHash: true } }, roles: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.$queryRaw<object[]>`
        SELECT id, name, address, ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng, is_default AS "isDefault"
        FROM offices WHERE organization_id = ${id}::uuid ORDER BY is_default DESC, name`,
      this.prisma.$queryRaw<{ day: string; rides: number; bookings: number }[]>`
        WITH days AS (
          SELECT d::date AS d FROM generate_series((now() AT TIME ZONE ${org.timezone})::date - 6, (now() AT TIME ZONE ${org.timezone})::date + 7, interval '1 day') d
        )
        SELECT to_char(days.d, 'YYYY-MM-DD') AS day,
          (SELECT count(*)::int FROM rides r WHERE r.organization_id = ${id}::uuid AND r.status <> 'CANCELLED' AND (r.depart_at AT TIME ZONE ${org.timezone})::date = days.d) AS rides,
          (SELECT count(*)::int FROM bookings b JOIN rides r ON r.id = b.ride_id WHERE r.organization_id = ${id}::uuid AND (r.depart_at AT TIME ZONE ${org.timezone})::date = days.d AND b.status NOT IN ('CANCELLED_BY_RIDER', 'CANCELLED_BY_DRIVER')) AS bookings
        FROM days ORDER BY days.d`,
      this.prisma.auditLog.findMany({ where: { organizationId: id }, orderBy: { id: 'desc' }, take: 12 }),
      this.prisma.supportGrant.findFirst({ where: { organizationId: id, userId: auth.userId, endedAt: null, expiresAt: { gt: new Date() } } }),
    ]);
    const actors = await this.names(recent.map((a) => a.actorUserId));
    return {
      data: {
        ...this.public(org),
        settings: { ...DEFAULT_ORG_SETTINGS, ...(org.settings as Partial<OrgSettings>) },
        notes: org.notes,
        stats: stats ?? null,
        admins: admins.map((m) => ({ membershipId: m.id, name: m.user.name, email: m.user.email, status: m.status, roles: m.roles.map((r) => r.role), hasPassword: !!m.user.passwordHash })),
        offices,
        series,
        recent: recent.map((a) => ({ id: a.id.toString(), action: a.action, entityType: a.entityType, createdAt: a.createdAt, actor: a.actorUserId ? actors.get(a.actorUserId) ?? null : null })),
        support: support ? { grantId: support.id, expiresAt: support.expiresAt, reason: support.reason } : null,
      },
    };
  }

  /** Plain company record (kept for scripts). The setup wizard below is the normal way. */
  @Post('organizations')
  async create(@Auth() auth: AuthContext, @Body(new ZodPipe(createOrgSchema)) body: z.infer<typeof createOrgSchema>) {
    await this.ensureFree(body.slug, body.emailDomains);
    const org = await this.prisma.organization.create({ data: { ...body, status: 'ACTIVE' } });
    await this.audit.log({ organizationId: org.id, actorUserId: auth.userId, action: 'ORG_CREATED', entityType: 'organization', entityId: org.id, after: body });
    return { data: org };
  }

  /** One-step onboarding: company, contact, first admin, offices, rules, features, seat limit, welcome email. */
  @Post('clients')
  async setup(@Auth() auth: AuthContext, @Body(new ZodPipe(clientSetupSchema)) b: ClientSetup) {
    await this.ensureFree(b.company.slug, b.company.emailDomains);
    const adminDomain = b.admin.email.split('@')[1];
    if (!b.company.emailDomains.includes(adminDomain)) {
      throw new AppError('VALIDATION_ERROR', `The admin's email must use one of the company domains (${b.company.emailDomains.join(', ')}).`, 400, { 'admin.email': 'Use a company email' });
    }
    const passwordHash = b.admin.password ? await hashPassword(b.admin.password) : undefined;

    const result = await this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: b.company.name,
          slug: b.company.slug,
          emailDomains: b.company.emailDomains,
          timezone: b.company.timezone,
          status: 'ACTIVE',
          settings: b.settings as Prisma.InputJsonValue,
          features: b.features as Prisma.InputJsonValue,
          maxEmployees: b.maxEmployees,
          // Every module switched on gets a licence (RYDO Share by default), so nothing works without one.
          licenses: {
            create: LICENSE_PRODUCTS.filter((p) => orgFeatures(b.features)[LICENSE_INFO[p].feature]).map((product) => ({
              product,
              issuedById: auth.userId,
              expiresAt: b.licenseEndsOn ? new Date(`${b.licenseEndsOn}T23:59:59.999Z`) : null,
            })),
          },
          contactName: b.contact.name,
          contactEmail: b.contact.email,
          contactPhone: b.contact.phone ?? null,
        },
      });
      const user = await tx.user.upsert({ where: { email: b.admin.email }, update: passwordHash ? { passwordHash } : {}, create: { email: b.admin.email, name: b.admin.name, passwordHash } });
      const m = await tx.membership.create({ data: { organizationId: org.id, userId: user.id, status: 'ACTIVE', decidedAt: new Date() } });
      await tx.membershipRole.createMany({ data: (['ORG_ADMIN', 'HR_ADMIN'] as const).map((role) => ({ membershipId: m.id, role })) });
      const defaultIdx = Math.max(0, b.offices.findIndex((o) => o.isDefault));
      for (const [i, o] of b.offices.entries()) {
        await tx.$executeRaw`
          INSERT INTO offices (id, organization_id, name, address, location, is_default)
          VALUES (gen_random_uuid(), ${org.id}::uuid, ${o.name}, ${o.address}, ST_SetSRID(ST_MakePoint(${o.lng}, ${o.lat}), 4326)::geography, ${i === defaultIdx})`;
      }
      await this.audit.log(
        {
          organizationId: org.id,
          actorUserId: auth.userId,
          action: 'CLIENT_ONBOARDED',
          entityType: 'organization',
          entityId: org.id,
          after: { company: b.company, admin: b.admin.email, offices: b.offices.length, features: b.features, maxEmployees: b.maxEmployees },
        },
        tx,
      );
      return { org, membershipId: m.id };
    });

    if (b.sendWelcome) {
      const signIn = `${env().WEB_ORIGIN.split(',')[0]}/sign-in`;
      await this.messages
        .sendEmail({
          to: b.admin.email,
          subject: `${b.company.name} is ready on RYDO`,
          text: [
            `Hi ${b.admin.name},`,
            '',
            `RYDO is set up for ${b.company.name}. You are the company admin.`,
            `Sign in: ${signIn}`,
            b.admin.password ? 'Use the password the RYDO team shared with you, then change it under My account.' : 'Choose "Forgot password?" on the sign-in page to set your password.',
            '',
            'Next steps: check your offices and ride rules, then tell your employees to sign up with their work email.',
            '',
            '— Team RYDO',
          ].join('\n'),
        })
        .catch(() => undefined);
    }
    return { data: { id: result.org.id, slug: result.org.slug, adminMembershipId: result.membershipId, welcomeSent: b.sendWelcome } };
  }

  @Patch('organizations/:id')
  async update(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(platformUpdateOrgSchema)) b: PlatformUpdateOrg) {
    const before = await this.prisma.organization.findUnique({ where: { id } });
    if (!before) throw new AppError('NOT_FOUND', 'Company not found.', 404);
    if (b.emailDomains) {
      const clash = await this.prisma.organization.findFirst({ where: { id: { not: id }, emailDomains: { hasSome: b.emailDomains } } });
      if (clash) throw new AppError('CONFLICT', 'Another company already uses one of these email domains.', 409);
    }
    const { features, ...rest } = b;
    const org = await this.prisma.organization.update({
      where: { id },
      data: { ...rest, ...(features ? { features: { ...orgFeatures(before.features), ...features } as Prisma.InputJsonValue } : {}) },
    });
    const changed = Object.fromEntries(Object.keys(b).map((k) => [k, (before as Record<string, unknown>)[k]]));
    await this.audit.log({ organizationId: id, actorUserId: auth.userId, action: b.status && b.status !== before.status ? 'ORG_STATUS_CHANGED' : 'ORG_UPDATED_BY_RYDO', entityType: 'organization', entityId: id, before: changed, after: b });
    return { data: this.public(org) };
  }

  /** Adds a company admin (active immediately, no HR approval needed). */
  @Post('organizations/:id/admins')
  async addAdmin(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(addOrgAdminSchema)) body: z.infer<typeof addOrgAdminSchema>) {
    const org = await this.prisma.organization.findUnique({ where: { id } });
    if (!org) throw new AppError('NOT_FOUND', 'Company not found.', 404);
    const passwordHash = body.password ? await hashPassword(body.password) : undefined;
    const membership = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.upsert({ where: { email: body.email }, update: passwordHash ? { passwordHash } : {}, create: { email: body.email, name: body.name, passwordHash } });
      const m = await tx.membership.upsert({
        where: { organizationId_userId: { organizationId: id, userId: user.id } },
        update: { status: 'ACTIVE', decidedAt: new Date() },
        create: { organizationId: id, userId: user.id, status: 'ACTIVE', decidedAt: new Date() },
      });
      await tx.membershipRole.upsert({
        where: { membershipId_role: { membershipId: m.id, role: 'ORG_ADMIN' } },
        update: {},
        create: { membershipId: m.id, role: 'ORG_ADMIN' },
      });
      await this.audit.log({ organizationId: id, actorUserId: auth.userId, action: 'ORG_ADMIN_ADDED', entityType: 'membership', entityId: m.id, after: { email: body.email } }, tx);
      return m;
    });
    return { data: { membershipId: membership.id } };
  }

  /** Start a time-boxed, read-only support session for one client. The client's activity log shows it. */
  @Post('organizations/:id/support')
  async startSupport(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(supportGrantSchema)) b: z.infer<typeof supportGrantSchema>) {
    const org = await this.prisma.organization.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!org) throw new AppError('NOT_FOUND', 'Company not found.', 404);
    const grant = await this.prisma.$transaction(async (tx) => {
      await tx.supportGrant.updateMany({ where: { organizationId: id, userId: auth.userId, endedAt: null }, data: { endedAt: new Date() } });
      const g = await tx.supportGrant.create({ data: { organizationId: id, userId: auth.userId, reason: b.reason, expiresAt: new Date(Date.now() + b.minutes * 60_000) } });
      await this.audit.log({ organizationId: id, actorUserId: auth.userId, action: 'SUPPORT_STARTED', entityType: 'support_grant', entityId: g.id, after: { reason: b.reason, minutes: b.minutes } }, tx);
      return g;
    });
    return { data: { grantId: grant.id, expiresAt: grant.expiresAt, organization: org } };
  }

  @Post('organizations/:id/support/end')
  @HttpCode(200)
  async endSupport(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    const ended = await this.prisma.supportGrant.updateMany({ where: { organizationId: id, userId: auth.userId, endedAt: null }, data: { endedAt: new Date() } });
    if (ended.count) await this.audit.log({ organizationId: id, actorUserId: auth.userId, action: 'SUPPORT_ENDED', entityType: 'organization', entityId: id });
    return { data: { ended: ended.count > 0 } };
  }

  // ── helpers ──

  private public(o: { id: string; name: string; slug: string; emailDomains: string[]; status: string; timezone: string; features: unknown; maxEmployees: number | null; contactName: string | null; contactEmail: string | null; contactPhone: string | null; createdAt: Date }) {
    return {
      id: o.id, name: o.name, slug: o.slug, emailDomains: o.emailDomains, status: o.status, timezone: o.timezone, createdAt: o.createdAt,
      features: orgFeatures(o.features), maxEmployees: o.maxEmployees,
      contact: { name: o.contactName, email: o.contactEmail, phone: o.contactPhone },
    };
  }

  private async ensureFree(slug: string, domains: string[]) {
    const clash = await this.prisma.organization.findFirst({ where: { OR: [{ slug }, { emailDomains: { hasSome: domains } }] } });
    if (clash) throw new AppError('CONFLICT', clash.slug === slug ? 'This short name is taken.' : 'Another company already uses one of these email domains.', 409);
  }

  private stats(orgId?: string) {
    const only = orgId ?? null;
    return this.prisma.$queryRaw<Stats[]>`
      SELECT o.id,
        (SELECT count(*)::int FROM memberships m WHERE m.organization_id = o.id AND m.status = 'ACTIVE') AS "activeMembers",
        (SELECT count(*)::int FROM memberships m WHERE m.organization_id = o.id AND m.status = 'PENDING') AS "pendingMembers",
        (SELECT count(*)::int FROM driver_profiles d JOIN memberships m ON m.id = d.membership_id WHERE m.organization_id = o.id AND d.status = 'VERIFIED') AS "verifiedDrivers",
        (SELECT count(*)::int FROM driver_profiles d JOIN memberships m ON m.id = d.membership_id WHERE m.organization_id = o.id AND d.status = 'PENDING') AS "pendingDrivers",
        (SELECT count(*)::int FROM rides r WHERE r.organization_id = o.id AND r.status <> 'CANCELLED' AND r.depart_at >= now() AND r.depart_at < now() + interval '7 days') AS "ridesNext7",
        (SELECT count(*)::int FROM rides r WHERE r.organization_id = o.id AND r.status <> 'CANCELLED' AND r.depart_at < now() AND r.depart_at >= now() - interval '7 days') AS "ridesLast7",
        (SELECT count(*)::int FROM bookings b JOIN rides r ON r.id = b.ride_id WHERE r.organization_id = o.id AND b.created_at >= now() - interval '7 days') AS "bookingsLast7",
        (SELECT max(a.created_at) FROM audit_logs a WHERE a.organization_id = o.id) AS "lastActivityAt"
      FROM organizations o
      WHERE (${only}::uuid IS NULL OR o.id = ${only}::uuid)`;
  }

  private async names(ids: (string | null)[]) {
    const users = await this.prisma.user.findMany({ where: { id: { in: [...new Set(ids.filter((x): x is string => !!x))] } }, select: { id: true, name: true, email: true } });
    return new Map(users.map((u) => [u.id, { name: u.name, email: u.email }]));
  }
}
