import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { DOCUMENT_LABEL, driverListQuerySchema, requestReuploadSchema, verifyDriverSchema, type RequestReupload, type VerifyDriver } from '@rydo/shared';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppError } from '../common/app-error';
import { ZodPipe } from '../common/zod.pipe';
import { Auth, Org, type AuthContext, type OrgContext } from '../common/request-context';
import { OrgScoped } from '../tenancy/decorators';
import { MESSAGE_ADAPTER, MessageAdapter } from '../adapters/message.adapter';
import { STORAGE_ADAPTER, StorageAdapter } from '../adapters/storage.adapter';
import { documentView, driverChecklist, latestDocuments } from './documents';
import { DocumentCheckService } from './document-check.service';

const include = {
  membership: { include: { user: { select: { name: true, email: true, photoKey: true } }, department: { select: { name: true } } } },
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
    private readonly checks: DocumentCheckService,
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
        verifiedAt: p.verifiedAt,
        needsReview,
        hasExpiryWarning: documents.some((d) => d.expiringSoon || d.expired),
        hasPhoto: !!p.membership.user.photoKey,
        guidelinesAcceptedAt: p.guidelinesAcceptedAt,
        checklist: driverChecklist(p, !!p.membership.user.photoKey),
        vehicles: p.vehicles.map((v) => ({ id: v.id, type: v.type, carType: v.carType, make: v.make, model: v.model, color: v.color, plateNumber: v.plateNumber, seatCapacity: v.seatCapacity, hasAc: v.hasAc, isDefault: v.isDefault })),
        documents,
      };
    });
    const filtered = q.status === 'PENDING' ? items.filter((i) => i.needsReview) : q.status ? items.filter((i) => i.status === q.status) : items;
    return { data: filtered };
  }

  /** Links that work for 2 minutes (front, and back when there is one). Every view is written to the audit log. */
  @Get('documents/:id/view-url')
  async viewUrl(@Auth() auth: AuthContext, @Org() org: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    const doc = await this.prisma.document.findFirst({ where: { id, organizationId: org.organizationId } });
    if (!doc) throw new AppError('NOT_FOUND', 'Document not found.', 404);
    const url = await this.storage.signedReadUrl(doc.storageKey, 120);
    const backUrl = doc.backStorageKey ? await this.storage.signedReadUrl(doc.backStorageKey, 120) : null;
    await this.audit.log({ organizationId: org.organizationId, actorUserId: auth.userId, action: 'DOCUMENT_VIEWED', entityType: 'document', entityId: id });
    return { data: { url, backUrl, expiresInSeconds: 120 } };
  }

  /** Runs the government records check again (for example after the provider was down). */
  @Post('documents/:id/check')
  @HttpCode(200)
  async recheck(@Auth() auth: AuthContext, @Org() org: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    const doc = await this.prisma.document.findFirst({ where: { id, organizationId: org.organizationId } });
    if (!doc) throw new AppError('NOT_FOUND', 'Document not found.', 404);
    const checked = await this.checks.checkAndStore(id);
    if (!checked) throw new AppError('VALIDATION_ERROR', 'Photos are checked by eye; there is no record to look up.', 400);
    await this.audit.log({ organizationId: org.organizationId, actorUserId: auth.userId, action: 'DOCUMENT_CHECKED', entityType: 'document', entityId: id, after: { status: checked.checkStatus } });
    return { data: documentView(checked) };
  }

  /**
   * Approves the latest documents and lets the person publish rides. Everything on the checklist must be in:
   * photo, licence (both sides), vehicle, RC, insurance, 3 vehicle photos and the guidelines. A government records
   * check that FAILED needs ignoreFailedChecks: true (HR has looked at it); that choice is in the audit log.
   */
  @Post('drivers/:id/verify')
  @HttpCode(200)
  async verify(@Auth() auth: AuthContext, @Org() org: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(verifyDriverSchema)) body: VerifyDriver) {
    const p = await this.driverInMyCompany(org, id);
    const checklist = driverChecklist(p, !!p.membership.user.photoKey);
    const LABEL = { PHOTO: 'profile photo', LICENCE: 'driving licence', VEHICLE: 'vehicle', RC: 'vehicle RC', INSURANCE: 'insurance', VEHICLE_PHOTOS: 'vehicle photos', GUIDELINES: 'driver guidelines' } as const;
    const docs = latestDocuments(p.documents);
    const failedChecks = docs.filter((d) => d.checkStatus === 'FAILED' && d.status !== 'REJECTED');
    const problems: string[] = [];
    for (const s of checklist) {
      if (s.status === 'TODO') problems.push(s.key === 'GUIDELINES' ? 'driver guidelines not accepted yet' : `${LABEL[s.key]} missing`);
      // A failed records check can be overridden below; a re-upload request, an expiry or a missing back side cannot.
      else if (s.status === 'NEEDS_ATTENTION' && s.cause !== 'CHECK_FAILED') problems.push(`${LABEL[s.key]}: ${s.note}`);
    }
    if (problems.length) throw new AppError('CONFLICT', `Can't verify yet: ${problems.join('; ')}.`, 409);
    if (failedChecks.length && !body.ignoreFailedChecks) {
      throw new AppError('CHECK_FAILED', `Government records did not match for: ${failedChecks.map((d) => DOCUMENT_LABEL[d.kind].toLowerCase()).join(', ')}. Look at the photos and verify anyway only if you are sure.`, 409);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.document.updateMany({ where: { id: { in: docs.filter((d) => d.status === 'PENDING').map((d) => d.id) } }, data: { status: 'APPROVED', reviewedById: org.membershipId, reviewedAt: new Date(), rejectReason: null } });
      await tx.driverProfile.update({ where: { id }, data: { status: 'VERIFIED', verifiedById: org.membershipId, verifiedAt: new Date() } });
      await tx.membershipRole.upsert({ where: { membershipId_role: { membershipId: p.membershipId, role: 'DRIVER' } }, update: {}, create: { membershipId: p.membershipId, role: 'DRIVER' } });
      await this.audit.log({ organizationId: org.organizationId, actorUserId: auth.userId, action: 'DRIVER_VERIFIED', entityType: 'driver_profile', entityId: id, before: { status: p.status }, after: { status: 'VERIFIED', ...(failedChecks.length ? { verifiedDespiteFailedChecks: failedChecks.map((d) => d.kind) } : {}) } }, tx);
    });
    await this.messages.sendEmail({ to: p.membership.user.email, subject: "You're a verified RYDO driver", text: 'Your HR team checked your licence, vehicle papers and photos. You can now publish rides in the RYDO app.' });
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