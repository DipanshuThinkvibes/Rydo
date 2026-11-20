import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, ParseUUIDPipe, Patch, Post, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { Prisma } from '@prisma/client';
import { documentMetaSchema, driverProfileSchema, vehicleSchema, type DocumentMeta, type DriverProfileInput, type VehicleInput } from '@rydo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppError } from '../common/app-error';
import { ZodPipe } from '../common/zod.pipe';
import { Auth, Org, type AuthContext, type OrgContext } from '../common/request-context';
import { OrgScoped } from '../tenancy/decorators';
import { STORAGE_ADAPTER, StorageAdapter } from '../adapters/storage.adapter';
import { randomToken } from '../auth/crypto';
import { DOC_MAX_BYTES, DOC_TYPES, documentView, driverChecklist, latestDocuments, PHOTO_TYPES } from './documents';
import { DocumentCheckService } from './document-check.service';

/** The signed-in employee's own driver profile, vehicles and documents (used by the mobile app). */
@Controller('driver')
@OrgScoped()
export class DriverController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
    private readonly checks: DocumentCheckService,
  ) {}

  private async profile(org: OrgContext) {
    return this.prisma.driverProfile.findUnique({
      where: { membershipId: org.membershipId },
      include: { vehicles: { where: { active: true } }, documents: true, membership: { select: { user: { select: { photoKey: true } } } } },
    });
  }

  private async mustHaveProfile(org: OrgContext) {
    const p = await this.profile(org);
    if (!p) throw new AppError('NOT_FOUND', 'Start your driver profile first.', 404);
    return p;
  }

  private view(p: NonNullable<Awaited<ReturnType<DriverController['profile']>>>) {
    return {
      id: p.id,
      status: p.status,
      approvalMode: p.approvalMode,
      preferences: p.preferences,
      verifiedAt: p.verifiedAt,
      guidelinesAcceptedAt: p.guidelinesAcceptedAt,
      vehicles: p.vehicles.map(({ driverProfileId: _d, organizationId: _o, ...v }) => v),
      documents: latestDocuments(p.documents).map(documentView),
      // What is left to do, step by step (the app's checklist).
      checklist: driverChecklist(p, !!p.membership.user.photoKey),
    };
  }

  @Get('profile')
  async get(@Org() org: OrgContext) {
    const p = await this.profile(org);
    return { data: p ? this.view(p) : null };
  }

  @Post('profile')
  async start(@Auth() auth: AuthContext, @Org() org: OrgContext, @Body(new ZodPipe(driverProfileSchema)) body: DriverProfileInput) {
    const existing = await this.profile(org);
    if (existing) return { data: this.view(existing) };
    const p = await this.prisma.driverProfile.create({
      data: { membershipId: org.membershipId, approvalMode: body.approvalMode, preferences: (body.preferences ?? {}) as Prisma.InputJsonValue },
    });
    await this.audit.log({ organizationId: org.organizationId, actorUserId: auth.userId, action: 'DRIVER_PROFILE_STARTED', entityType: 'driver_profile', entityId: p.id });
    return { data: this.view((await this.profile(org))!) };
  }

  @Patch('profile')
  async update(@Org() org: OrgContext, @Body(new ZodPipe(driverProfileSchema)) body: DriverProfileInput) {
    const p = await this.mustHaveProfile(org);
    await this.prisma.driverProfile.update({
      where: { id: p.id },
      data: { approvalMode: body.approvalMode, preferences: body.preferences ? ({ ...(p.preferences as object), ...body.preferences } as Prisma.InputJsonValue) : undefined },
    });
    return { data: this.view((await this.profile(org))!) };
  }

  @Post('vehicles')
  async addVehicle(@Auth() auth: AuthContext, @Org() org: OrgContext, @Body(new ZodPipe(vehicleSchema)) v: VehicleInput) {
    const p = await this.mustHaveProfile(org);
    const vehicle = await this.prisma.$transaction(async (tx) => {
      if (v.isDefault) await tx.vehicle.updateMany({ where: { driverProfileId: p.id }, data: { isDefault: false } });
      return tx.vehicle.create({ data: { ...v, organizationId: org.organizationId, driverProfileId: p.id } });
    });
    await this.audit.log({ organizationId: org.organizationId, actorUserId: auth.userId, action: 'VEHICLE_ADDED', entityType: 'vehicle', entityId: vehicle.id, after: v });
    return { data: this.view((await this.profile(org))!) };
  }

  @Patch('vehicles/:id')
  async updateVehicle(@Org() org: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(vehicleSchema)) v: VehicleInput) {
    const p = await this.mustHaveProfile(org);
    if (!p.vehicles.some((x) => x.id === id)) throw new AppError('NOT_FOUND', 'Vehicle not found.', 404);
    await this.prisma.$transaction(async (tx) => {
      if (v.isDefault) await tx.vehicle.updateMany({ where: { driverProfileId: p.id }, data: { isDefault: false } });
      await tx.vehicle.update({ where: { id }, data: v });
    });
    return { data: this.view((await this.profile(org))!) };
  }

  /** The driver agrees to the driver guidelines after reading the safety basics. Needed before HR can verify. */
  @Post('guidelines')
  @HttpCode(200)
  async acceptGuidelines(@Auth() auth: AuthContext, @Org() org: OrgContext) {
    const p = await this.mustHaveProfile(org);
    if (!p.guidelinesAcceptedAt) {
      await this.prisma.driverProfile.update({ where: { id: p.id }, data: { guidelinesAcceptedAt: new Date() } });
      await this.audit.log({ organizationId: org.organizationId, actorUserId: auth.userId, action: 'DRIVER_GUIDELINES_ACCEPTED', entityType: 'driver_profile', entityId: p.id });
    }
    return { data: this.view((await this.profile(org))!) };
  }

  /**
   * One driver document, sent as multipart: "file" (front side, or the photo) and, for a licence or RC, "back".
   * Licence, RC and insurance numbers are then checked against government records (when a provider is set up).
   */
  @Post('documents')
  @UseInterceptors(FileFieldsInterceptor([{ name: 'file', maxCount: 1 }, { name: 'back', maxCount: 1 }], { limits: { fileSize: DOC_MAX_BYTES } }))
  async upload(@Auth() auth: AuthContext, @Org() org: OrgContext, @Body(new ZodPipe(documentMetaSchema)) meta: DocumentMeta, @UploadedFiles() files: { file?: Express.Multer.File[]; back?: Express.Multer.File[] } = {}) {
    const isPhoto = meta.kind.startsWith('VEHICLE_PHOTO_');
    const types = isPhoto ? PHOTO_TYPES : DOC_TYPES;
    const front = files.file?.[0];
    const back = files.back?.[0];
    if (!front || !types[front.mimetype]) throw new AppError('VALIDATION_ERROR', isPhoto ? 'Upload a photo (JPG, PNG or WebP) up to 5 MB.' : 'Upload a photo (JPG, PNG, WebP) or PDF up to 5 MB.', HttpStatus.BAD_REQUEST, { file: isPhoto ? 'JPG, PNG or WebP, max 5 MB' : 'JPG, PNG, WebP or PDF, max 5 MB' });
    if (back && (!['DRIVING_LICENSE', 'VEHICLE_RC'].includes(meta.kind) || !DOC_TYPES[back.mimetype])) throw new AppError('VALIDATION_ERROR', 'Only a licence or RC has a back side (JPG, PNG, WebP or PDF).', HttpStatus.BAD_REQUEST, { back: 'Not needed for this document' });
    if (meta.kind === 'DRIVING_LICENSE' && !back) throw new AppError('VALIDATION_ERROR', 'Add photos of both sides of your licence.', HttpStatus.BAD_REQUEST, { back: 'Add the back side' });
    const p = await this.mustHaveProfile(org);
    let vehicleId: string | null = null;
    if (meta.kind !== 'DRIVING_LICENSE') {
      if (!meta.vehicleId || !p.vehicles.some((v) => v.id === meta.vehicleId)) throw new AppError('VALIDATION_ERROR', 'Choose which vehicle this is for.', 400, { vehicleId: 'Pick your vehicle' });
      vehicleId = meta.vehicleId;
    }
    const base = `orgs/${org.organizationId}/drivers/${p.id}/${meta.kind.toLowerCase()}-${randomToken(9)}`;
    const key = `${base}.${types[front.mimetype]}`;
    const backKey = back ? `${base}-back.${DOC_TYPES[back.mimetype]}` : null;
    await this.storage.put(key, front.buffer, front.mimetype);
    if (back && backKey) await this.storage.put(backKey, back.buffer, back.mimetype);
    const doc = await this.prisma.$transaction(async (tx) => {
      const d = await tx.document.create({
        data: {
          organizationId: org.organizationId,
          driverProfileId: p.id,
          vehicleId,
          kind: meta.kind,
          storageKey: key,
          backStorageKey: backKey,
          number: isPhoto ? null : meta.number,
          expiresAt: !isPhoto && meta.expiresAt ? new Date(meta.expiresAt) : null,
          dateOfBirth: meta.kind === 'DRIVING_LICENSE' && meta.dateOfBirth ? new Date(meta.dateOfBirth) : null,
          vehicleClasses: meta.kind === 'DRIVING_LICENSE' ? (meta.vehicleClasses ?? []) : [],
        },
      });
      // A fresh upload puts a rejected or expired driver back in HR's queue.
      if (p.status === 'REJECTED' || p.status === 'EXPIRED') await tx.driverProfile.update({ where: { id: p.id }, data: { status: 'PENDING' } });
      await this.audit.log({ organizationId: org.organizationId, actorUserId: auth.userId, action: 'DOCUMENT_UPLOADED', entityType: 'document', entityId: d.id, after: { kind: meta.kind, number: d.number, expiresAt: meta.expiresAt ?? null } }, tx);
      return d;
    });
    const checked = (await this.checks.checkAndStore(doc.id)) ?? doc;
    return { data: documentView(checked) };
  }
}