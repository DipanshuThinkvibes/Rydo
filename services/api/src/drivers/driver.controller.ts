import { Body, Controller, Get, HttpStatus, Inject, Param, ParseUUIDPipe, Patch, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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
import { DOC_MAX_BYTES, DOC_TYPES, documentView, latestDocuments } from './documents';

/** The signed-in employee's own driver profile, vehicles and documents (used by the mobile app). */
@Controller('driver')
@OrgScoped()
export class DriverController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
  ) {}

  private async profile(org: OrgContext) {
    return this.prisma.driverProfile.findUnique({ where: { membershipId: org.membershipId }, include: { vehicles: { where: { active: true } }, documents: true } });
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
      vehicles: p.vehicles.map(({ driverProfileId: _d, organizationId: _o, ...v }) => v),
      documents: latestDocuments(p.documents).map(documentView),
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

  /** Photo or PDF of a driving license or vehicle RC, sent as multipart with its number and expiry. */
  @Post('documents')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: DOC_MAX_BYTES } }))
  async upload(@Auth() auth: AuthContext, @Org() org: OrgContext, @Body(new ZodPipe(documentMetaSchema)) meta: DocumentMeta, @UploadedFile() file?: Express.Multer.File) {
    const ext = file && DOC_TYPES[file.mimetype];
    if (!file || !ext) throw new AppError('VALIDATION_ERROR', 'Upload a photo (JPG, PNG, WebP) or PDF up to 5 MB.', HttpStatus.BAD_REQUEST, { file: 'JPG, PNG, WebP or PDF, max 5 MB' });
    const p = await this.mustHaveProfile(org);
    let vehicleId: string | null = null;
    if (meta.kind === 'VEHICLE_RC') {
      if (!meta.vehicleId || !p.vehicles.some((v) => v.id === meta.vehicleId)) throw new AppError('VALIDATION_ERROR', 'Choose which vehicle this RC is for.', 400, { vehicleId: 'Pick your vehicle' });
      vehicleId = meta.vehicleId;
    }
    const key = `orgs/${org.organizationId}/drivers/${p.id}/${meta.kind.toLowerCase()}-${randomToken(9)}.${ext}`;
    await this.storage.put(key, file.buffer, file.mimetype);
    const doc = await this.prisma.$transaction(async (tx) => {
      const d = await tx.document.create({
        data: { organizationId: org.organizationId, driverProfileId: p.id, vehicleId, kind: meta.kind, storageKey: key, number: meta.number, expiresAt: new Date(meta.expiresAt) },
      });
      // A fresh upload puts a rejected or expired driver back in HR's queue.
      if (p.status === 'REJECTED' || p.status === 'EXPIRED') await tx.driverProfile.update({ where: { id: p.id }, data: { status: 'PENDING' } });
      await this.audit.log({ organizationId: org.organizationId, actorUserId: auth.userId, action: 'DOCUMENT_UPLOADED', entityType: 'document', entityId: d.id, after: { kind: meta.kind, number: meta.number, expiresAt: meta.expiresAt } }, tx);
      return d;
    });
    return { data: documentView(doc) };
  }
}