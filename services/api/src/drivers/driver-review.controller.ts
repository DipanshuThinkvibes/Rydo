import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { driverListQuerySchema, requestReuploadSchema, type RequestReupload } from '@rydo/shared';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppError } from '../common/app-error';
import { ZodPipe } from '../common/zod.pipe';
import { Auth, Org, type AuthContext, type OrgContext } from '../common/request-context';
import { OrgScoped } from '../tenancy/decorators';
import { MESSAGE_ADAPTER, MessageAdapter } from '../adapters/message.adapter';
import { STORAGE_ADAPTER, StorageAdapter } from '../adapters/storage.adapter';
import { ageOn } from '@rydo/shared';
import { documentView, expiryFlags, latestDocuments } from './documents';

const LABEL: Record<string, string> = { DRIVING_LICENSE: 'license', VEHICLE_RC: 'RC', INSURANCE: 'insurance', VEHICLE_PHOTO_FRONT: 'front photo', VEHICLE_PHOTO_SIDE: 'side photo', VEHICLE_PHOTO_INSIDE: 'inside photo' };

const include = {
  membership: { include: { user: { select: { name: true, email: true } }, department: { select: { name: true } } } },
  vehicles: { where: { active: true } },
  documents: true,
} as const;

/** HR reviews driver documents. Only drivers of the caller's company exist for them. */
@Controller('admin')
@OrgScoped('ORG_ADMIN', 'HR_ADMIN')
export class DriverReviewController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
    @Inject(MESSAGE_ADAPTER) private readonly messages: MessageAdapter,
  ) {}

  private async driverInMyCompany(org: OrgContext, id: string) {
    const p = await this.prisma.driverProfile.findFirst({ where: { id, membership: { organizationId: org.organizationId } }, include });
    if (!p) throw new AppError('NOT_FOUND', 'Driver not found.', 404);
    return p;
  }

  @Get('drivers')
  async list(@Org() org: OrgContext, @Query(new ZodPipe(driverListQuerySchema)) q: z.infer<typeof driverListQuerySchema>) {
    const rows = await this.prisma.driverProfile.findMany({
      where: {
        // HR only sees applications that were sent to them: the vehicle check has already passed.
        applicationStatus: 'WITH_HR',
        membership: {
          organizationId: org.organizationId,
          ...(q.q ? { user: { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { email: { contains: q.q, mode: 'insensitive' } }] } } : {}),
        },
      },
      include,
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
    const items = rows.map((p) => {
      const documents = latestDocuments(p.documents).map(documentView);
      // Needs review: a new driver, or a verified one who uploaded a renewal.
      const needsReview = p.status === 'PENDING' || documents.some((d) => d.status === 'PENDING');
      return {
        id: p.id,
        membershipId: p.membershipId,
        name: p.membership.user.name,
        email: p.membership.user.email,
        department: p.membership.department?.name ?? null,
        status: p.status,
        applicationStatus: p.applicationStatus,
        submittedAt: p.submittedAt,
        details: { licenseClass: p.licenseClass, drivingSince: p.drivingSince, age: p.dateOfBirth ? ageOn(p.dateOfBirth) : null },
        verifiedAt: p.verifiedAt,
        needsReview,
        hasExpiryWarning: documents.some((d) => d.expiringSoon || d.expired),
        vehicles: p.vehicles.map((v) => ({ id: v.id, type: v.type, make: v.make, model: v.model, color: v.color, plateNumber: v.plateNumber, seatCapacity: v.seatCapacity, hasAc: v.hasAc, isDefault: v.isDefault, manufactureYear: v.manufactureYear, fuelType: v.fuelType, checkStatus: v.checkStatus, checkedAt: v.checkedAt, checks: v.checkResults ?? [] })),
        documents,
      };
    });
    const filtered = q.status === 'PENDING' ? items.filter((i) => i.needsReview) : q.status ? items.filter((i) => i.status === q.status) : items;
    return { data: filtered };
  }

  /** A link that works for 2 minutes. Every view is written to the audit log. */
  @Get('documents/:id/view-url')
  async viewUrl(@Auth() auth: AuthContext, @Org() org: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Query('side') side?: string) {
    const doc = await this.prisma.document.findFirst({ where: { id, organizationId: org.organizationId } });
    if (!doc) throw new AppError('NOT_FOUND', 'Document not found.', 404);
    const key = side === 'back' ? doc.backStorageKey : doc.storageKey;
    if (!key) throw new AppError('NOT_FOUND', 'This document has no back side.', 404);
    const url = await this.storage.signedReadUrl(key, 120);
    await this.audit.log({ organizationId: org.organizationId, actorUserId: auth.userId, action: 'DOCUMENT_VIEWED', entityType: 'document', entityId: id, after: side === 'back' ? { side: 'back' } : undefined });
    return { data: { url, expiresInSeconds: 120 } };
  }

  /** Approves the latest documents and lets the person publish rides. */
  @Post('drivers/:id/verify')
  @HttpCode(200)
  async verify(@Auth() auth: AuthContext, @Org() org: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    const p = await this.driverInMyCompany(org, id);
    const docs = latestDocuments(p.documents);
    const license = docs.find((d) => d.kind === 'DRIVING_LICENSE');
    const vehicle = p.vehicles.find((v) => v.isDefault) ?? p.vehicles[0];
    const rc = vehicle && docs.find((d) => d.kind === 'VEHICLE_RC' && d.vehicleId === vehicle.id);
    const insurance = vehicle && docs.find((d) => d.kind === 'INSURANCE' && d.vehicleId === vehicle.id);
    const problems: string[] = [];
    if (!license) problems.push('driving license missing');
    if (!vehicle) problems.push('no vehicle added');
    else if (!rc) problems.push('vehicle RC missing');
    if (vehicle && !insurance) problems.push('insurance missing');
    if (vehicle && vehicle.checkStatus !== 'VERIFIED') problems.push('the vehicle has not passed the vehicle check');
    for (const d of [license, rc, insurance]) {
      if (!d) continue;
      if (d.status === 'REJECTED') problems.push(`${LABEL[d.kind]} waiting for re-upload`);
      if (expiryFlags(d.expiresAt).expired) problems.push(`${LABEL[d.kind]} has expired`);
    }
    if (problems.length) throw new AppError('CONFLICT', `Can't verify yet: ${problems.join(', ')}.`, 409);

    await this.prisma.$transaction(async (tx) => {
      await tx.document.updateMany({ where: { id: { in: docs.filter((d) => d.status === 'PENDING').map((d) => d.id) } }, data: { status: 'APPROVED', reviewedById: org.membershipId, reviewedAt: new Date(), rejectReason: null } });
      await tx.driverProfile.update({ where: { id }, data: { status: 'VERIFIED', verifiedById: org.membershipId, verifiedAt: new Date() } });
      await tx.membershipRole.upsert({ where: { membershipId_role: { membershipId: p.membershipId, role: 'DRIVER' } }, update: {}, create: { membershipId: p.membershipId, role: 'DRIVER' } });
      await this.audit.log({ organizationId: org.organizationId, actorUserId: auth.userId, action: 'DRIVER_VERIFIED', entityType: 'driver_profile', entityId: id, before: { status: p.status }, after: { status: 'VERIFIED' } }, tx);
    });
    await this.messages.sendEmail({ to: p.membership.user.email, subject: "You're a verified RYDO driver", text: 'Your HR team checked your license and RC. You can now publish rides in the RYDO app.' });
    return { data: { id, status: 'VERIFIED' } };
  }

  /** Marks documents as rejected with a reason the driver sees, and emails them. */
  @Post('drivers/:id/request-reupload')
  @HttpCode(200)
  async requestReupload(@Auth() auth: AuthContext, @Org() org: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(requestReuploadSchema)) body: RequestReupload) {
    const p = await this.driverInMyCompany(org, id);
    const mine = new Set(p.documents.map((d) => d.id));
    if (body.documentIds.some((d) => !mine.has(d))) throw new AppError('NOT_FOUND', 'Document not found.', 404);
    // A verified driver keeps driving on the old approved documents; anyone else goes back to "needs re-upload".
    const nextStatus = p.status === 'VERIFIED' ? 'VERIFIED' : 'REJECTED';
    await this.prisma.$transaction(async (tx) => {
      await tx.document.updateMany({ where: { id: { in: body.documentIds } }, data: { status: 'REJECTED', rejectReason: body.reason, reviewedById: org.membershipId, reviewedAt: new Date() } });
      await tx.driverProfile.update({ where: { id }, data: { status: nextStatus } });
      await this.audit.log({ organizationId: org.organizationId, actorUserId: auth.userId, action: 'DRIVER_REUPLOAD_REQUESTED', entityType: 'driver_profile', entityId: id, after: body }, tx);
    });
    await this.messages.sendEmail({ to: p.membership.user.email, subject: 'Please re-upload your RYDO driver documents', text: `Your HR team asked you to upload again: ${body.reason}` });
    return { data: { id, status: nextStatus } };
  }
}