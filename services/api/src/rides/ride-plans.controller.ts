import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { DEFAULT_ORG_SETTINGS, orgFeatures, ridePlanSchema, type OrgSettings, type RidePlanInput } from '@rydo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppError } from '../common/app-error';
import { ZodPipe } from '../common/zod.pipe';
import { Auth, Org, type AuthContext, type OrgContext } from '../common/request-context';
import { OrgScoped, RequireFeature } from '../tenancy/decorators';
import { RideGeneratorService } from './ride-generator.service';
import { WaitlistService } from '../commute/waitlist.service';

/** A verified driver's published rides (mobile app). */
@Controller()
@OrgScoped()
@RequireFeature('share')
export class RidePlansController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly generator: RideGeneratorService,
    private readonly waitlist: WaitlistService,
  ) {}

  @Post('ride-plans')
  async publish(@Auth() auth: AuthContext, @Org() org: OrgContext, @Body(new ZodPipe(ridePlanSchema)) b: RidePlanInput) {
    const driver = await this.prisma.driverProfile.findUnique({ where: { membershipId: org.membershipId }, include: { vehicles: true } });
    if (!driver || driver.status !== 'VERIFIED') throw new AppError('FORBIDDEN', 'Only drivers verified by HR can publish rides.', 403);
    const vehicle = driver.vehicles.find((v) => v.id === b.vehicleId && v.active);
    if (!vehicle) throw new AppError('NOT_FOUND', 'Vehicle not found.', 404);
    if (vehicle.checkStatus !== 'VERIFIED') throw new AppError('CONFLICT', 'This vehicle has not passed the vehicle check yet. Open Vehicles and run the check first.', 409);
    if (b.seats > vehicle.seatCapacity) throw new AppError('VALIDATION_ERROR', `This ${vehicle.type === 'CAR' ? 'car' : 'bike'} has ${vehicle.seatCapacity} passenger seat(s).`, 400, { seats: `At most ${vehicle.seatCapacity}` });
    if (b.womenOnly) {
      const company = await this.prisma.organization.findUniqueOrThrow({ where: { id: org.organizationId } });
      const settings = { ...DEFAULT_ORG_SETTINGS, ...(company.settings as Partial<OrgSettings>) };
      if (!settings.womenOnlyEnabled || !orgFeatures(company.features).womenOnly) throw new AppError('VALIDATION_ERROR', 'Your company has turned off women-only rides.', 400, { womenOnly: 'Not available' });
    }

    const [row] = await this.prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO ride_plans (id, organization_id, driver_membership_id, vehicle_id, origin_label, origin, destination_label, destination,
        depart_time, return_time, days_of_week, one_off_date, seats, women_only, notes, active, created_at, updated_at)
      VALUES (gen_random_uuid(), ${org.organizationId}::uuid, ${org.membershipId}::uuid, ${vehicle.id}::uuid,
        ${b.origin.label}, ST_SetSRID(ST_MakePoint(${b.origin.lng}, ${b.origin.lat}), 4326)::geography,
        ${b.destination.label}, ST_SetSRID(ST_MakePoint(${b.destination.lng}, ${b.destination.lat}), 4326)::geography,
        ${b.departTime}::time, ${b.returnTime ?? null}::time, ${b.daysOfWeek}::int[], ${b.oneOffDate ?? null}::date,
        ${b.seats}, ${b.womenOnly}, ${b.notes ?? null}, true, now(), now())
      RETURNING id`;
    const rides = await this.generator.generateForPlan(row.id);
    // New seats: people waiting for this route and time get them first.
    await this.waitlist.check(org.organizationId).catch(() => undefined);
    await this.audit.log({ organizationId: org.organizationId, actorUserId: auth.userId, action: 'RIDE_PLAN_PUBLISHED', entityType: 'ride_plan', entityId: row.id, after: b });
    return { data: { id: row.id, ridesCreated: rides } };
  }

  @Get('ride-plans/mine')
  async mine(@Org() org: OrgContext) {
    const rows = await this.prisma.$queryRaw<object[]>`
      SELECT p.id, p.origin_label AS "originLabel", p.destination_label AS "destinationLabel",
        to_char(p.depart_time, 'HH24:MI') AS "departTime", to_char(p.return_time, 'HH24:MI') AS "returnTime",
        p.days_of_week AS "daysOfWeek", to_char(p.one_off_date, 'YYYY-MM-DD') AS "oneOffDate", p.seats, p.women_only AS "womenOnly", p.active,
        (SELECT count(*)::int FROM rides r WHERE r.ride_plan_id = p.id AND r.depart_at > now() AND r.status <> 'CANCELLED') AS "upcomingRides"
      FROM ride_plans p WHERE p.driver_membership_id = ${org.membershipId}::uuid ORDER BY p.active DESC, p.created_at DESC`;
    return { data: rows };
  }

  /** Stops the plan and cancels its future rides. */
  @Delete('ride-plans/:id')
  @HttpCode(200)
  async stop(@Auth() auth: AuthContext, @Org() org: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    const plan = await this.prisma.ridePlan.findFirst({ where: { id, driverMembershipId: org.membershipId } });
    if (!plan) throw new AppError('NOT_FOUND', 'Ride plan not found.', 404);
    const cancelled = await this.prisma.$transaction(async (tx) => {
      await tx.ridePlan.update({ where: { id }, data: { active: false } });
      const { count } = await tx.ride.updateMany({
        where: { ridePlanId: id, departAt: { gt: new Date() }, status: { in: ['SCHEDULED', 'FULL'] } },
        data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: 'Driver stopped offering this ride' },
      });
      await this.audit.log({ organizationId: org.organizationId, actorUserId: auth.userId, action: 'RIDE_PLAN_STOPPED', entityType: 'ride_plan', entityId: id, after: { cancelledRides: count } }, tx);
      return count;
    });
    return { data: { id, cancelledRides: cancelled } };
  }

  @Get('rides/driving')
  async driving(@Org() org: OrgContext) {
    const rows = await this.prisma.$queryRaw<object[]>`
      SELECT r.id, r.direction, r.origin_label AS "originLabel", r.destination_label AS "destinationLabel", r.depart_at AS "departAt",
        r.seats_total AS "seatsTotal", r.seats_booked AS "seatsBooked", r.status, r.distance_meters AS "distanceMeters", r.duration_seconds AS "durationSeconds",
        (SELECT count(*)::int FROM ride_requests q WHERE q.ride_id = r.id AND q.status = 'PENDING' AND q.expires_at > now()) AS "pendingRequests",
        ST_AsEncodedPolyline(ST_Simplify(r.route_line::geometry, 0.0001)) AS route
      FROM rides r WHERE r.driver_membership_id = ${org.membershipId}::uuid AND r.depart_at > now() - interval '12 hours' AND r.status <> 'CANCELLED'
      ORDER BY r.depart_at LIMIT 50`;
    return { data: rows };
  }
}