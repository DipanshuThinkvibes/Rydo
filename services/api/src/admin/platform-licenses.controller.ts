import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  LICENSE_INFO,
  LICENSE_PRODUCTS,
  licenseDaysLeft,
  licenseIssueSchema,
  licenseReasonSchema,
  licenseState,
  orgFeatures,
  type LicenseIssue,
  type LicenseProduct,
  type LicenseState,
} from '@rydo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppError } from '../common/app-error';
import { ZodPipe } from '../common/zod.pipe';
import { Auth, type AuthContext } from '../common/request-context';
import { PlatformAdmin } from '../tenancy/decorators';

const productPipe = new ZodPipe(z.enum(LICENSE_PRODUCTS));
const listQuery = z.object({
  orgId: z.string().uuid().optional(),
  product: z.enum(LICENSE_PRODUCTS).optional(),
  state: z.enum(['ACTIVE', 'SCHEDULED', 'EXPIRED', 'SUSPENDED', 'REVOKED', 'EXPIRING']).optional(),
});
/** "Expiring" means ending within this many days. */
export const EXPIRING_DAYS = 30;

const dayStart = (d: string) => new Date(`${d}T00:00:00.000Z`);
/** A licence runs to the end of its last day. */
const dayEnd = (d: string) => new Date(`${d}T23:59:59.999Z`);

/** RYDO owner console: issue, renew, pause and revoke each client's licences. Everything a client can use comes from here. */
@Controller('admin/platform')
@PlatformAdmin()
export class PlatformLicensesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private shape(l: { id: string; organizationId: string; product: string; status: string; startsAt: Date; expiresAt: Date | null; notes: string | null; statusReason: string | null; updatedAt: Date }) {
    return {
      id: l.id,
      organizationId: l.organizationId,
      product: l.product as LicenseProduct,
      state: licenseState(l),
      startsAt: l.startsAt,
      expiresAt: l.expiresAt,
      daysLeft: licenseDaysLeft(l),
      notes: l.notes,
      statusReason: l.statusReason,
      updatedAt: l.updatedAt,
    };
  }

  /** Every licence of every client, with what each is right now. */
  @Get('licenses')
  async list(@Query(new ZodPipe(listQuery)) q: z.infer<typeof listQuery>) {
    const rows = await this.prisma.license.findMany({
      where: { ...(q.orgId ? { organizationId: q.orgId } : {}), ...(q.product ? { product: q.product } : {}), organization: { status: { not: 'PENDING' } } },
      include: { organization: { select: { name: true, status: true } } },
      orderBy: [{ organization: { name: 'asc' } }, { product: 'asc' }],
    });
    const data = rows
      .map((l) => ({ ...this.shape(l), organization: { id: l.organizationId, name: l.organization.name, status: l.organization.status } }))
      .filter((l) => (!q.state ? true : q.state === 'EXPIRING' ? l.state === 'ACTIVE' && l.daysLeft !== null && l.daysLeft <= EXPIRING_DAYS : l.state === q.state));
    return { data };
  }

  /** The numbers on top of the Licences page and the owner home. */
  @Get('licenses/summary')
  async summary() {
    const [rows, orgs] = await Promise.all([
      this.prisma.license.findMany({ where: { organization: { status: { not: 'PENDING' } } } }),
      this.prisma.organization.findMany({ where: { status: { not: 'PENDING' } }, select: { id: true, licenses: { select: { product: true, status: true, startsAt: true, expiresAt: true } } } }),
    ]);
    const states = rows.map((l) => ({ l, s: licenseState(l) as LicenseState, d: licenseDaysLeft(l) }));
    const count = (s: LicenseState) => states.filter((x) => x.s === s).length;
    return {
      data: {
        total: rows.length,
        active: count('ACTIVE'),
        expiringSoon: states.filter((x) => x.s === 'ACTIVE' && x.d !== null && x.d <= EXPIRING_DAYS).length,
        expired: count('EXPIRED'),
        suspended: count('SUSPENDED'),
        revoked: count('REVOKED'),
        byProduct: LICENSE_PRODUCTS.map((p) => ({ product: p, active: states.filter((x) => x.l.product === p && x.s === 'ACTIVE').length })),
        /** Clients that cannot use RYDO Share right now (no valid Share licence). */
        clientsWithoutShare: orgs.filter((o) => !o.licenses.some((l) => l.product === 'SHARE' && licenseState(l) === 'ACTIVE')).length,
        expiringDays: EXPIRING_DAYS,
      },
    };
  }

  @Get('organizations/:id/licenses')
  async forOrg(@Param('id', ParseUUIDPipe) id: string) {
    const org = await this.prisma.organization.findUnique({ where: { id }, select: { id: true } });
    if (!org) throw new AppError('NOT_FOUND', 'Company not found.', 404);
    const rows = await this.prisma.license.findMany({ where: { organizationId: id } });
    return { data: LICENSE_PRODUCTS.map((p) => rows.find((l) => l.product === p)).map((l, i) => (l ? this.shape(l) : { product: LICENSE_PRODUCTS[i], state: 'NONE' as const })) };
  }

  /** Issue a licence, or renew it with new dates. Clears a pause or revoke. */
  @Put('organizations/:id/licenses/:product')
  @HttpCode(200)
  async issue(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Param('product', productPipe) product: LicenseProduct, @Body(new ZodPipe(licenseIssueSchema)) b: LicenseIssue) {
    const org = await this.prisma.organization.findUnique({ where: { id }, select: { id: true } });
    if (!org) throw new AppError('NOT_FOUND', 'Company not found.', 404);
    const startsAt = b.startsAt ? dayStart(b.startsAt) : new Date();
    const expiresAt = b.expiresAt ? dayEnd(b.expiresAt) : null;
    if (expiresAt && expiresAt <= startsAt) throw new AppError('VALIDATION_ERROR', 'The end date must be after the start date.', 400, { expiresAt: 'Pick a date after the start.' });
    const before = await this.prisma.license.findUnique({ where: { organizationId_product: { organizationId: id, product } } });
    const row = await this.prisma.license.upsert({
      where: { organizationId_product: { organizationId: id, product } },
      create: { organizationId: id, product, startsAt, expiresAt, notes: b.notes ?? null, issuedById: auth.userId },
      update: { status: 'ACTIVE', startsAt, expiresAt, statusReason: null, ...(b.notes !== undefined ? { notes: b.notes } : {}), issuedById: auth.userId },
    });
    // Issuing a product also switches its module on, so the licence is the only thing RYDO has to manage.
    const o = await this.prisma.organization.findUniqueOrThrow({ where: { id }, select: { features: true } });
    await this.prisma.organization.update({ where: { id }, data: { features: { ...orgFeatures(o.features), [LICENSE_INFO[product].feature]: true } } });
    await this.audit.log({
      organizationId: id,
      actorUserId: auth.userId,
      action: before ? 'LICENSE_RENEWED' : 'LICENSE_ISSUED',
      entityType: 'license',
      entityId: row.id,
      before: before ? { product, state: licenseState(before), expiresAt: before.expiresAt } : undefined,
      after: { product, startsAt, expiresAt },
    });
    return { data: this.shape(row) };
  }

  private async change(auth: AuthContext, id: string, product: LicenseProduct, status: 'SUSPENDED' | 'ACTIVE' | 'REVOKED', reason: string, action: string) {
    const l = await this.prisma.license.findUnique({ where: { organizationId_product: { organizationId: id, product } } });
    if (!l) throw new AppError('NOT_FOUND', 'This company has no such licence.', 404);
    if (status === 'SUSPENDED' && l.status !== 'ACTIVE') throw new AppError('CONFLICT', 'Only an active licence can be paused.', 409);
    if (status === 'ACTIVE' && l.status !== 'SUSPENDED') throw new AppError('CONFLICT', 'Only a paused licence can be resumed. To bring back a revoked one, issue it again.', 409);
    if (status === 'REVOKED' && l.status === 'REVOKED') throw new AppError('CONFLICT', 'This licence is already revoked.', 409);
    const row = await this.prisma.license.update({ where: { id: l.id }, data: { status, statusReason: status === 'ACTIVE' ? null : reason } });
    await this.audit.log({ organizationId: id, actorUserId: auth.userId, action, entityType: 'license', entityId: l.id, before: { product, state: licenseState(l) }, after: { product, state: licenseState(row), reason } });
    return { data: this.shape(row) };
  }

  @Post('organizations/:id/licenses/:product/suspend')
  @HttpCode(200)
  suspend(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Param('product', productPipe) product: LicenseProduct, @Body(new ZodPipe(licenseReasonSchema)) b: { reason: string }) {
    return this.change(auth, id, product, 'SUSPENDED', b.reason, 'LICENSE_SUSPENDED');
  }

  @Post('organizations/:id/licenses/:product/resume')
  @HttpCode(200)
  resume(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Param('product', productPipe) product: LicenseProduct, @Body(new ZodPipe(licenseReasonSchema)) b: { reason: string }) {
    return this.change(auth, id, product, 'ACTIVE', b.reason, 'LICENSE_RESUMED');
  }

  @Post('organizations/:id/licenses/:product/revoke')
  @HttpCode(200)
  revoke(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Param('product', productPipe) product: LicenseProduct, @Body(new ZodPipe(licenseReasonSchema)) b: { reason: string }) {
    return this.change(auth, id, product, 'REVOKED', b.reason, 'LICENSE_REVOKED');
  }
}
