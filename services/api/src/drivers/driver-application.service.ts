import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { DriverApply } from '@rydo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppError } from '../common/app-error';
import { NotificationsService } from '../notifications/notifications.service';
import { latestDocuments } from './documents';
import { runVehicleCheck, type CheckOutcome } from './vehicle-check';

const include = { vehicles: { where: { active: true } }, documents: true, membership: { include: { user: { select: { name: true, email: true, photoKey: true } } } } } as const;

/**
 * Becoming a driver, in order: the driver fills in details, adds a vehicle and uploads papers; RYDO checks the vehicle
 * (and the licence) first; only when every check passes is the company's HR asked to approve the person.
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

  /** The driver applies: save the details, check the vehicle, and only if everything passes send the application to HR. */
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

    if (!outcome.passed) {
      await this.prisma.driverProfile.update({ where: { id: driverProfileId }, data: { applicationStatus: 'NEEDS_FIXES' } });
      await this.audit.log({ organizationId: orgId, actorUserId, action: 'DRIVER_APPLICATION_NEEDS_FIXES', entityType: 'driver_profile', entityId: driverProfileId, after: { failed: outcome.checks.filter((c) => !c.passed).map((c) => c.code) } });
      return { sentToHr: false, outcome };
    }

    await this.prisma.driverProfile.update({
      where: { id: driverProfileId },
      // A driver HR turned away, or whose papers lapsed, goes back into HR's queue.
      data: { applicationStatus: 'WITH_HR', submittedAt: new Date(), ...(p0.status === 'REJECTED' || p0.status === 'EXPIRED' ? { status: 'PENDING' } : {}) },
    });
    await this.audit.log({ organizationId: orgId, actorUserId, action: 'DRIVER_APPLIED', entityType: 'driver_profile', entityId: driverProfileId, after: { vehicle: vehicle.plateNumber } });
    // HR hears only now: the vehicle is already verified.
    await this.notices.notifyAdmins(
      orgId,
      { type: 'DRIVER_APPLICATION', title: `${name} applied to be a driver`, body: `Vehicle checks passed for ${vehicle.plateNumber}. Open Drivers to review the documents and approve.`, data: { driverProfileId }, email: true },
      ['HR_ADMIN', 'ORG_ADMIN'],
    );
    await this.notices.notifyMembership(p0.membershipId, { type: 'DRIVER_APPLICATION_SENT', title: 'Your vehicle is verified', body: 'Your application is with your company HR now. We will tell you when they decide.', email: true });
    return { sentToHr: true, outcome };
  }

  /**
   * New or renewed papers: if the person is already with HR, check the vehicle again. A driver who is not yet verified and
   * now fails goes back to fixing things (and leaves HR's queue); a verified driver keeps their status, only the vehicle is held.
   */
  async recheckIfSubmitted(driverProfileId: string, vehicleId: string | null) {
    const p = await this.load(driverProfileId);
    const vehicle = p.vehicles.find((v) => v.id === vehicleId) ?? p.vehicles.find((v) => v.isDefault) ?? p.vehicles[0];
    if (!vehicle) return null;
    if (p.applicationStatus !== 'WITH_HR' && p.status !== 'VERIFIED') return null;
    const outcome = await this.checkVehicle(driverProfileId, vehicle.id);
    if (!outcome.passed && p.status !== 'VERIFIED') {
      await this.prisma.driverProfile.update({ where: { id: driverProfileId }, data: { applicationStatus: 'NEEDS_FIXES' } });
    }
    return outcome;
  }
}
