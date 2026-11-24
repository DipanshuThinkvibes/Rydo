import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { DriverApply } from '@rydo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppError } from '../common/app-error';
import { NotificationsService } from '../notifications/notifications.service';
import { latestDocuments } from './documents';
import { runVehicleCheck, type CheckOutcome } from './vehicle-check';

/** What must be uploaded before the request can go to HR. Everything else the check finds is shown to HR to decide on. */
const NEEDED_FOR_HR = ['LICENSE_PRESENT', 'RC_PRESENT', 'INSURANCE_PRESENT'];

const include = { vehicles: { where: { active: true } }, documents: true, membership: { include: { user: { select: { name: true, email: true, photoKey: true } } } } } as const;

/**
 * Becoming a driver: the driver fills in details, adds a vehicle and uploads the licence, RC and insurance, then sends a
 * request to the company's HR. RYDO's automatic vehicle check runs too, but only as information for HR: HR approves
 * (or asks for new uploads), and approving makes the person a driver who can publish rides.
 */
@Injectable()
export class DriverApplicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notices: NotificationsService,
  ) {}

  private load(driverProfileId: string) {
    return this.prisma.driverProfile.findUniqueOrThrow({ where: { id: driverProfileId }, include });
  }

  /** Runs the checks for one vehicle against the driver's details and newest papers, and saves the result on the vehicle. */
  async checkVehicle(driverProfileId: string, vehicleId: string): Promise<CheckOutcome> {
    const p = await this.load(driverProfileId);
    const v = p.vehicles.find((x) => x.id === vehicleId);
    if (!v) throw new AppError('NOT_FOUND', 'Vehicle not found.', 404);
    const docs = latestDocuments(p.documents);
    const outcome = runVehicleCheck({
      vehicle: { type: v.type, plateNumber: v.plateNumber, seatCapacity: v.seatCapacity, manufactureYear: v.manufactureYear },
      rc: docs.find((d) => d.kind === 'VEHICLE_RC' && d.vehicleId === v.id),
      insurance: docs.find((d) => d.kind === 'INSURANCE' && d.vehicleId === v.id),
      license: docs.find((d) => d.kind === 'DRIVING_LICENSE'),
      licenseBack: !!docs.find((d) => d.kind === 'DRIVING_LICENSE')?.backStorageKey,
      photos: {
        front: docs.some((d) => d.kind === 'VEHICLE_PHOTO_FRONT' && d.vehicleId === v.id),
        side: docs.some((d) => d.kind === 'VEHICLE_PHOTO_SIDE' && d.vehicleId === v.id),
        inside: docs.some((d) => d.kind === 'VEHICLE_PHOTO_INSIDE' && d.vehicleId === v.id),
      },
      profilePhoto: !!p.membership.user.photoKey,
      guidelines: !!p.guidelinesAcceptedAt,
      driver: { dateOfBirth: p.dateOfBirth, licenseClass: p.licenseClass, drivingSince: p.drivingSince },
    });
    await this.prisma.vehicle.update({
      where: { id: v.id },
      data: { checkStatus: outcome.vehiclePassed ? 'VERIFIED' : 'REJECTED', checkedAt: new Date(), checkResults: outcome.checks as unknown as Prisma.InputJsonValue },
    });
    return outcome;
  }

  /** The driver applies: save the details, run the vehicle check, and send the request to HR once the papers are in. */
  async apply(driverProfileId: string, actorUserId: string, body: DriverApply) {
    const p0 = await this.load(driverProfileId);
    const vehicle = p0.vehicles.find((v) => v.isDefault) ?? p0.vehicles[0];
    if (!vehicle) throw new AppError('CONFLICT', 'Add your vehicle before you apply.', 409);

    await this.prisma.driverProfile.update({
      where: { id: driverProfileId },
      // Details are normally saved already on the licence step; anything sent now replaces them.
      data: { ...(body.dateOfBirth ? { dateOfBirth: new Date(body.dateOfBirth) } : {}), ...(body.licenseClass ? { licenseClass: body.licenseClass } : {}), ...(body.drivingSince ? { drivingSince: body.drivingSince } : {}), declaredAt: new Date() },
    });
    const outcome = await this.checkVehicle(driverProfileId, vehicle.id);
    const orgId = p0.membership.organizationId;
    const name = p0.membership.user.name;

    const failed = outcome.checks.filter((c) => !c.passed);
    if (failed.some((c) => NEEDED_FOR_HR.includes(c.code))) {
      await this.prisma.driverProfile.update({ where: { id: driverProfileId }, data: { applicationStatus: 'NEEDS_FIXES' } });
      await this.audit.log({ organizationId: orgId, actorUserId, action: 'DRIVER_APPLICATION_NEEDS_FIXES', entityType: 'driver_profile', entityId: driverProfileId, after: { failed: failed.map((c) => c.code) } });
      return { sentToHr: false, outcome };
    }

    await this.prisma.driverProfile.update({
      where: { id: driverProfileId },
      // A driver HR turned away, or whose papers lapsed, goes back into HR's queue.
      data: { applicationStatus: 'WITH_HR', submittedAt: new Date(), ...(p0.status === 'REJECTED' || p0.status === 'EXPIRED' ? { status: 'PENDING' } : {}) },
    });
    await this.audit.log({ organizationId: orgId, actorUserId, action: 'DRIVER_APPLIED', entityType: 'driver_profile', entityId: driverProfileId, after: { vehicle: vehicle.plateNumber, ...(failed.length ? { checksToReview: failed.map((c) => c.code) } : {}) } });
    const checks = failed.length
      ? `${failed.length} automatic ${failed.length === 1 ? 'check needs' : 'checks need'} a look for ${vehicle.plateNumber}`
      : `Vehicle checks passed for ${vehicle.plateNumber}`;
    await this.notices.notifyAdmins(
      orgId,
      { type: 'DRIVER_APPLICATION', title: `${name} applied to be a driver`, body: `${checks}. Open Drivers to review the documents and approve.`, data: { driverProfileId }, email: true },
      ['HR_ADMIN', 'ORG_ADMIN'],
    );
    await this.notices.notifyMembership(
      p0.membershipId,
      outcome.passed
        ? { type: 'DRIVER_APPLICATION_SENT', title: 'Your vehicle is verified', body: 'Your application is with your company HR now. We will tell you when they decide.', email: true }
        : { type: 'DRIVER_APPLICATION_SENT', title: 'Your request is with HR', body: 'Your company HR will check your papers and approve you. We will tell you when they decide.', email: true },
    );
    return { sentToHr: true, outcome };
  }

  /**
   * New or renewed papers: if the person is already with HR (or verified), check the vehicle again so HR sees fresh results.
   * The request stays with HR: HR decides, not the automatic check.
   */
  async recheckIfSubmitted(driverProfileId: string, vehicleId: string | null) {
    const p = await this.load(driverProfileId);
    const vehicle = p.vehicles.find((v) => v.id === vehicleId) ?? p.vehicles.find((v) => v.isDefault) ?? p.vehicles[0];
    if (!vehicle) return null;
    if (p.applicationStatus !== 'WITH_HR' && p.status !== 'VERIFIED') return null;
    // HR already approved this vehicle: a renewal keeps it usable; only a different vehicle needs its own check.
    if (p.status === 'VERIFIED' && vehicle.checkStatus === 'VERIFIED') return null;
    return this.checkVehicle(driverProfileId, vehicle.id);
  }
}
