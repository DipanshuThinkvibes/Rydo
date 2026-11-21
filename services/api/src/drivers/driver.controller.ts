import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, ParseUUIDPipe, Patch, Post, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { Prisma } from '@prisma/client';
import {
  PAPER_KINDS,
  VEHICLE_PHOTO_KINDS,
  documentMetaSchema,
  driverApplySchema,
  driverGuidelinesSchema,
  driverProfileSchema,
  vehicleSchema,
  type DocumentMeta,
  type DriverApply,
  type DriverProfileInput,
  type VehicleInput,
} from '@rydo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppError } from '../common/app-error';
import { ZodPipe } from '../common/zod.pipe';
import { Auth, Org, type AuthContext, type OrgContext } from '../common/request-context';
import { OrgScoped, RequireFeature } from '../tenancy/decorators';
import { STORAGE_ADAPTER, StorageAdapter } from '../adapters/storage.adapter';
import { randomToken } from '../auth/crypto';
import { DOC_MAX_BYTES, DOC_TYPES, documentView, latestDocuments } from './documents';
import { DriverApplicationService } from './driver-application.service';

/** Papers and photos that belong to one vehicle (the licence belongs to the driver). */
const VEHICLE_KINDS: string[] = ['VEHICLE_RC', 'INSURANCE', ...VEHICLE_PHOTO_KINDS];
const DOC_LABEL: Record<string, string> = {
  DRIVING_LICENSE: 'driving licence',
  VEHICLE_RC: 'RC',
  INSURANCE: 'insurance',
  VEHICLE_PHOTO_FRONT: 'front photo',
  VEHICLE_PHOTO_SIDE: 'side photo',
  VEHICLE_PHOTO_INSIDE: 'inside photo',
};
const uploadFields = FileFieldsInterceptor([{ name: 'file', maxCount: 1 }, { name: 'fileBack', maxCount: 1 }], { limits: { fileSize: DOC_MAX_BYTES } });

/** The signed-in employee's own driver application, vehicles and documents (used by the website and the mobile app). */
@Controller('driver')
@OrgScoped()
@RequireFeature('share')
export class DriverController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly application: DriverApplicationService,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
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
    const docs = latestDocuments(p.documents);
    const vehicle = p.vehicles.find((v) => v.isDefault) ?? p.vehicles[0];
    const has = (kind: string, vehicleId?: string) => docs.some((d) => d.kind === kind && (vehicleId === undefined || d.vehicleId === vehicleId));
    const licence = docs.find((d) => d.kind === 'DRIVING_LICENSE');
    // The seven steps of the checklist, in any order. A step is done when everything it asks for is in.
    const readiness = {
      photo: !!p.membership.user.photoKey,
      license: !!licence && !!licence.backStorageKey && !!p.dateOfBirth && !!p.licenseClass,
      vehicle: !!vehicle,
      rc: !!vehicle && has('VEHICLE_RC', vehicle.id),
      insurance: !!vehicle && has('INSURANCE', vehicle.id),
      photos: !!vehicle && VEHICLE_PHOTO_KINDS.every((k) => has(k, vehicle.id)),
      guidelines: !!p.guidelinesAcceptedAt,
    };
    const stepsDone = Object.values(readiness).filter(Boolean).length;
    return {
      id: p.id,
      status: p.status,
      applicationStatus: p.applicationStatus,
      submittedAt: p.submittedAt,
      approvalMode: p.approvalMode,
      preferences: p.preferences,
      verifiedAt: p.verifiedAt,
      details: { dateOfBirth: p.dateOfBirth?.toISOString().slice(0, 10) ?? null, licenseClass: p.licenseClass, drivingSince: p.drivingSince },
      readiness: { ...readiness, stepsDone, stepsTotal: 7, canApply: stepsDone === 7 },
      vehicles: p.vehicles.map(({ driverProfileId: _d, organizationId: _o, ...v }) => v),
      documents: docs.map(documentView),
    };
  }

  private async fresh(org: OrgContext) {
    return this.view((await this.profile(org))!);
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
      data: { membershipId: org.membershipId, approvalMode: body.approvalMode, preferences: (body.preferences ?? {}) as Prisma.InputJsonValue, ...this.detailsData(body) },
    });
    await this.audit.log({ organizationId: org.organizationId, actorUserId: auth.userId, action: 'DRIVER_PROFILE_STARTED', entityType: 'driver_profile', entityId: p.id });
    return { data: await this.fresh(org) };
  }

  /** Draft details are saved as the driver fills the form in; nothing goes to HR until they apply. */
  private detailsData(body: DriverProfileInput) {
    const d = body.details;
    if (!d) return {};
    return {
      ...(d.dateOfBirth ? { dateOfBirth: new Date(d.dateOfBirth) } : {}),
      ...(d.licenseClass ? { licenseClass: d.licenseClass } : {}),
      ...(d.drivingSince ? { drivingSince: d.drivingSince } : {}),
    };
  }

  @Patch('profile')
  async update(@Org() org: OrgContext, @Body(new ZodPipe(driverProfileSchema)) body: DriverProfileInput) {
    const p = await this.mustHaveProfile(org);
    await this.prisma.driverProfile.update({
      where: { id: p.id },
      data: {
        approvalMode: body.approvalMode,
        preferences: body.preferences ? ({ ...(p.preferences as object), ...body.preferences } as Prisma.InputJsonValue) : undefined,
        ...this.detailsData(body),
      },
    });
    return { data: await this.fresh(org) };
  }

  /** The last step of the checklist: the driver has read the safety guidelines and agrees to follow them. */
  @Post('guidelines')
  @HttpCode(200)
  async guidelines(@Auth() auth: AuthContext, @Org() org: OrgContext, @Body(new ZodPipe(driverGuidelinesSchema)) _body: { agree: true }) {
    const p = await this.mustHaveProfile(org);
    await this.prisma.driverProfile.update({ where: { id: p.id }, data: { guidelinesAcceptedAt: new Date() } });
    await this.audit.log({ organizationId: org.organizationId, actorUserId: auth.userId, action: 'DRIVER_GUIDELINES_ACCEPTED', entityType: 'driver_profile', entityId: p.id });
    return { data: await this.fresh(org) };
  }

  @Post('vehicles')
  async addVehicle(@Auth() auth: AuthContext, @Org() org: OrgContext, @Body(new ZodPipe(vehicleSchema)) v: VehicleInput) {
    const p = await this.mustHaveProfile(org);
    const vehicle = await this.prisma.$transaction(async (tx) => {
      if (v.isDefault) await tx.vehicle.updateMany({ where: { driverProfileId: p.id }, data: { isDefault: false } });
      return tx.vehicle.create({ data: { ...v, organizationId: org.organizationId, driverProfileId: p.id } });
    });
    await this.audit.log({ organizationId: org.organizationId, actorUserId: auth.userId, action: 'VEHICLE_ADDED', entityType: 'vehicle', entityId: vehicle.id, after: v });
    return { data: await this.fresh(org) };
  }

  @Patch('vehicles/:id')
  async updateVehicle(@Org() org: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(vehicleSchema)) v: VehicleInput) {
    const p = await this.mustHaveProfile(org);
    const old = p.vehicles.find((x) => x.id === id);
    if (!old) throw new AppError('NOT_FOUND', 'Vehicle not found.', 404);
    // A different plate or vehicle type is a different vehicle: it must be checked again. Small edits (colour, AC) are not.
    const changedIdentity = old.plateNumber !== v.plateNumber || old.type !== v.type;
    await this.prisma.$transaction(async (tx) => {
      if (v.isDefault) await tx.vehicle.updateMany({ where: { driverProfileId: p.id }, data: { isDefault: false } });
      await tx.vehicle.update({ where: { id }, data: { ...v, ...(changedIdentity ? { checkStatus: 'PENDING', checkedAt: null, checkResults: Prisma.DbNull } : {}) } });
      if (changedIdentity && p.status !== 'VERIFIED' && p.applicationStatus === 'WITH_HR') await tx.driverProfile.update({ where: { id: p.id }, data: { applicationStatus: 'DRAFT', submittedAt: null } });
    });
    return { data: await this.fresh(org) };
  }

  /** Runs the vehicle check now (also how a verified driver gets a second vehicle approved). Does not send anything to HR. */
  @Post('vehicles/:id/check')
  @HttpCode(200)
  async checkVehicle(@Org() org: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    const p = await this.mustHaveProfile(org);
    if (!p.vehicles.some((x) => x.id === id)) throw new AppError('NOT_FOUND', 'Vehicle not found.', 404);
    const outcome = await this.application.checkVehicle(p.id, id);
    return { data: { passed: outcome.passed, vehiclePassed: outcome.vehiclePassed, checks: outcome.checks, profile: await this.fresh(org) } };
  }

  /**
   * Send the application to HR. The vehicle is checked first. If anything fails, the answer says what to fix and HR hears nothing.
   * If everything passes, the vehicle is marked verified and the company's HR is asked to approve.
   */
  @Post('application')
  @HttpCode(200)
  async apply(@Auth() auth: AuthContext, @Org() org: OrgContext, @Body(new ZodPipe(driverApplySchema)) body: DriverApply) {
    const p = await this.mustHaveProfile(org);
    if (p.status === 'VERIFIED') throw new AppError('CONFLICT', 'You are already a verified driver.', 409);
    if (p.applicationStatus === 'WITH_HR' && p.status === 'PENDING') throw new AppError('CONFLICT', 'Your application is already with HR.', 409);
    const result = await this.application.apply(p.id, auth.userId, body);
    return { data: { sentToHr: result.sentToHr, passed: result.outcome.passed, vehiclePassed: result.outcome.vehiclePassed, checks: result.outcome.checks, profile: await this.fresh(org) } };
  }

  /**
   * A paper or a photo: licence (front, and the back as `fileBack`), RC (front, optional back), insurance, or one of the three
   * vehicle photos. Papers come with their number and end date; photos need neither. A new upload replaces the old one.
   */
  @Post('documents')
  @UseInterceptors(uploadFields)
  async upload(
    @Auth() auth: AuthContext,
    @Org() org: OrgContext,
    @Body(new ZodPipe(documentMetaSchema)) meta: DocumentMeta,
    @UploadedFiles() files?: { file?: Express.Multer.File[]; fileBack?: Express.Multer.File[] },
  ) {
    const front = files?.file?.[0];
    const back = files?.fileBack?.[0];
    const bad = (f?: Express.Multer.File) => !f || !DOC_TYPES[f.mimetype];
    if (bad(front) || (back && bad(back))) {
      throw new AppError('VALIDATION_ERROR', 'Upload a photo (JPG, PNG, WebP) or PDF up to 5 MB.', HttpStatus.BAD_REQUEST, { file: 'JPG, PNG, WebP or PDF, max 5 MB' });
    }
    const p = await this.mustHaveProfile(org);
    let vehicleId: string | null = null;
    if (VEHICLE_KINDS.includes(meta.kind)) {
      if (!meta.vehicleId || !p.vehicles.some((v) => v.id === meta.vehicleId)) throw new AppError('VALIDATION_ERROR', `Choose which vehicle this ${DOC_LABEL[meta.kind]} is for.`, 400, { vehicleId: 'Pick your vehicle' });
      vehicleId = meta.vehicleId;
    }
    const base = `orgs/${org.organizationId}/drivers/${p.id}/${meta.kind.toLowerCase()}-${randomToken(9)}`;
    const key = `${base}.${DOC_TYPES[front!.mimetype]}`;
    await this.storage.put(key, front!.buffer, front!.mimetype);
    let backKey: string | null = null;
    if (back) {
      backKey = `${base}-back.${DOC_TYPES[back.mimetype]}`;
      await this.storage.put(backKey, back.buffer, back.mimetype);
    }
    const isPaper = (PAPER_KINDS as readonly string[]).includes(meta.kind);
    const doc = await this.prisma.$transaction(async (tx) => {
      const d = await tx.document.create({
        data: {
          organizationId: org.organizationId,
          driverProfileId: p.id,
          vehicleId,
          kind: meta.kind,
          storageKey: key,
          backStorageKey: backKey,
          number: isPaper ? meta.number : null,
          expiresAt: isPaper && meta.expiresAt ? new Date(meta.expiresAt) : null,
        },
      });
      // A fresh upload puts a rejected or expired driver back in HR's queue.
      if (p.status === 'REJECTED' || p.status === 'EXPIRED') await tx.driverProfile.update({ where: { id: p.id }, data: { status: 'PENDING' } });
      await this.audit.log({ organizationId: org.organizationId, actorUserId: auth.userId, action: 'DOCUMENT_UPLOADED', entityType: 'document', entityId: d.id, after: { kind: meta.kind, number: meta.number, expiresAt: meta.expiresAt, bothSides: !!backKey } }, tx);
      return d;
    });
    // Papers changed after applying: check the vehicle again straight away.
    await this.application.recheckIfSubmitted(p.id, vehicleId);
    return { data: documentView(doc) };
  }
}
