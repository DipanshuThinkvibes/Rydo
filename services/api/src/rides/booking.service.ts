import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomInt } from 'crypto';
import type { RideRequestInput } from '@rydo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppError } from '../common/app-error';
import { NotificationsService } from '../notifications/notifications.service';
import { JOB_QUEUE, JobQueue } from '../adapters/job-queue';
import { MatchingService } from './matching.service';

interface OrgRef {
  organizationId: string;
  membershipId: string;
}
interface RideLock {
  id: string;
  organizationId: string;
  driverMembershipId: string;
  status: string;
  seatsTotal: number;
  seatsBooked: number;
  departAt: Date;
  distanceMeters: number | null;
}

const pin = () => randomInt(0, 10_000).toString().padStart(4, '0');
const name = async (prisma: PrismaService, membershipId: string) => (await prisma.membership.findUniqueOrThrow({ where: { id: membershipId }, include: { user: { select: { name: true } } } })).user.name;

/**
 * Seat requests and bookings. All seat changes happen with the ride row locked, so two riders can
 * never get the last seat.
 */
@Injectable()
export class BookingService {
  private readonly log = new Logger('Booking');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notify: NotificationsService,
    private readonly matching: MatchingService,
    @Inject(JOB_QUEUE) private readonly jobs: JobQueue,
  ) {}

  // ── Rider asks for seats ──

  async request(org: OrgRef, rideId: string, b: RideRequestInput, actorUserId?: string) {
    const ride = await this.prisma.ride.findFirst({ where: { id: rideId, organizationId: org.organizationId } });
    if (!ride) throw new AppError('NOT_FOUND', 'Ride not found.', 404);
    if (ride.driverMembershipId === org.membershipId) throw new AppError('CONFLICT', "You can't book your own ride.", 409);
    if (ride.status !== 'SCHEDULED' || ride.departAt <= new Date()) throw new AppError('CONFLICT', 'This ride is no longer taking requests.', 409);
    const open = await this.prisma.rideRequest.findFirst({ where: { rideId, riderMembershipId: org.membershipId, status: { in: ['PENDING', 'ACCEPTED'] } } });
    if (open) throw new AppError('CONFLICT', 'You already asked for this ride.', 409);

    // Re-checks route, seats, women-only and blocks exactly as the search does, and keeps the score.
    const local = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(ride.departAt);
    const part = (t: string) => local.find((p) => p.type === t)!.value;
    const [match] = await this.matching.search(org, {
      pickup: b.pickup,
      drop: b.drop,
      seats: b.seats,
      date: `${part('year')}-${part('month')}-${part('day')}`,
      fromTime: '00:00',
      toTime: '23:59',
      womenOnly: false,
    }, { onlyRideIds: [rideId] });
    if (!match) throw new AppError('CONFLICT', "This ride doesn't pass your pickup and drop, or has no seats left.", 409);

    const settings = await this.matching.settings(org.organizationId);
    const minutesToGo = (ride.departAt.getTime() - Date.now()) / 60000;
    const waitSeconds = Math.max(30, Math.min(minutesToGo <= 60 ? settings.driverPopupSeconds : settings.requestTimeoutMinutes * 60, (minutesToGo - 10) * 60));

    const [row] = await this.prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO ride_requests (id, organization_id, ride_id, rider_membership_id, seats, pickup_label, pickup, drop_label, drop,
        match_score, match_reasons, auto_rematch, status, expires_at, created_at)
      VALUES (gen_random_uuid(), ${org.organizationId}::uuid, ${rideId}::uuid, ${org.membershipId}::uuid, ${b.seats},
        ${b.pickup.label}, ST_SetSRID(ST_MakePoint(${b.pickup.lng}, ${b.pickup.lat}), 4326)::geography,
        ${b.drop.label}, ST_SetSRID(ST_MakePoint(${b.drop.lng}, ${b.drop.lat}), 4326)::geography,
        ${match.score}, ${JSON.stringify(match.reasons)}::jsonb, ${b.autoRematch}, 'PENDING'::"RequestStatus",
        now() + make_interval(secs => ${waitSeconds}), now())
      RETURNING id`;
    if (actorUserId) await this.audit.log({ organizationId: org.organizationId, actorUserId, action: 'RIDE_REQUESTED', entityType: 'ride_request', entityId: row.id, after: { rideId, seats: b.seats } });

    // Auto-accept: the driver chose "accept my team" and the rider is in the same department.
    const driver = await this.prisma.driverProfile.findUnique({ where: { membershipId: ride.driverMembershipId } });
    const [rider, drv] = await Promise.all([
      this.prisma.membership.findUniqueOrThrow({ where: { id: org.membershipId } }),
      this.prisma.membership.findUniqueOrThrow({ where: { id: ride.driverMembershipId } }),
    ]);
    if (driver?.approvalMode === 'AUTO_TEAM' && rider.departmentId && rider.departmentId === drv.departmentId) {
      await this.accept(ride.driverMembershipId, row.id, null);
      return { id: row.id, status: 'ACCEPTED' as const, matchScore: match.score };
    }

    await this.jobs.send('requests.expire', { requestId: row.id }, { startAfterSeconds: Math.ceil(waitSeconds), singletonKey: row.id });
    await this.notify.notifyMembership(ride.driverMembershipId, {
      type: 'REQUEST_RECEIVED',
      title: `${await name(this.prisma, org.membershipId)} wants ${b.seats === 1 ? 'a seat' : `${b.seats} seats`}`,
      body: `Pickup: ${b.pickup.label}. Answer within ${waitSeconds >= 120 ? `${Math.round(waitSeconds / 60)} minutes` : `${Math.round(waitSeconds)} seconds`}.`,
      data: { requestId: row.id, rideId },
    });
    return { id: row.id, status: 'PENDING' as const, matchScore: match.score, expiresInSeconds: Math.round(waitSeconds) };
  }

  // ── Driver answers ──

  /** Locks the ride, re-checks seats, creates the booking with a ride PIN. */
  async accept(driverMembershipId: string, requestId: string, actorUserId: string | null) {
    const booking = await this.prisma.$transaction(async (tx) => {
      const req = await tx.rideRequest.findUnique({ where: { id: requestId } });
      if (!req) throw new AppError('NOT_FOUND', 'Request not found.', 404);
      const [ride] = await tx.$queryRaw<RideLock[]>`
        SELECT id, organization_id AS "organizationId", driver_membership_id AS "driverMembershipId", status::text, seats_total AS "seatsTotal",
          seats_booked AS "seatsBooked", depart_at AS "departAt", distance_meters AS "distanceMeters"
        FROM rides WHERE id = ${req.rideId}::uuid FOR UPDATE`;
      if (ride.driverMembershipId !== driverMembershipId) throw new AppError('NOT_FOUND', 'Request not found.', 404);
      if (req.status !== 'PENDING') throw new AppError('CONFLICT', `This request was already ${req.status.toLowerCase()}.`, 409);
      if (req.expiresAt <= new Date()) throw new AppError('CONFLICT', 'This request has expired.', 409);
      if (ride.status !== 'SCHEDULED' || ride.seatsTotal - ride.seatsBooked < req.seats) throw new AppError('CONFLICT', 'Not enough seats left on this ride.', 409);

      const settings = await this.matching.settings(ride.organizationId);
      const riders = ride.seatsBooked + req.seats;
      const cost = settings.costPerKmEstimate && ride.distanceMeters ? (settings.costPerKmEstimate * (ride.distanceMeters / 1000)) / (riders + 1) : null;
      const [b] = await tx.$queryRaw<{ id: string; pin: string }[]>`
        INSERT INTO bookings (id, organization_id, ride_id, request_id, rider_membership_id, seats, pickup_label, pickup, drop_label, drop, pin, status, cost_share_est, created_at, updated_at)
        SELECT gen_random_uuid(), rq.organization_id, rq.ride_id, rq.id, rq.rider_membership_id, rq.seats, rq.pickup_label, rq.pickup, rq.drop_label, rq.drop,
          ${pin()}, 'CONFIRMED'::"BookingStatus", ${cost}::numeric, now(), now()
        FROM ride_requests rq WHERE rq.id = ${requestId}::uuid
        RETURNING id, pin`;
      await tx.$executeRaw`UPDATE rides SET seats_booked = seats_booked + ${req.seats},
        status = CASE WHEN seats_booked + ${req.seats} >= seats_total THEN 'FULL'::"RideStatus" ELSE status END, updated_at = now()
        WHERE id = ${ride.id}::uuid`;
      await tx.rideRequest.update({ where: { id: requestId }, data: { status: 'ACCEPTED', decidedAt: new Date() } });
      if (actorUserId) await this.audit.log({ organizationId: ride.organizationId, actorUserId, action: 'RIDE_REQUEST_ACCEPTED', entityType: 'booking', entityId: b.id }, tx);
      return { ...b, riderMembershipId: req.riderMembershipId, departAt: ride.departAt };
    });
    const when = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(booking.departAt);
    await this.notify.notifyMembership(booking.riderMembershipId, {
      type: 'REQUEST_ACCEPTED',
      title: `${await name(this.prisma, driverMembershipId)} accepted your ride`,
      body: `${when}. Your ride PIN is ${booking.pin}; tell it to the driver only inside the car.`,
      data: { bookingId: booking.id },
      email: true,
    });
    return { bookingId: booking.id };
  }

  async decline(driverMembershipId: string, requestId: string, actorUserId: string) {
    const req = await this.prisma.rideRequest.findUnique({ where: { id: requestId }, include: { ride: true } });
    if (!req || req.ride.driverMembershipId !== driverMembershipId) throw new AppError('NOT_FOUND', 'Request not found.', 404);
    if (req.status !== 'PENDING') throw new AppError('CONFLICT', `This request was already ${req.status.toLowerCase()}.`, 409);
    await this.prisma.rideRequest.update({ where: { id: requestId }, data: { status: 'DECLINED', decidedAt: new Date() } });
    await this.audit.log({ organizationId: req.organizationId, actorUserId, action: 'RIDE_REQUEST_DECLINED', entityType: 'ride_request', entityId: requestId });
    await this.afterNo(requestId, 'declined');
  }

  /** Job: the driver didn't answer in time. */
  async expire(requestId: string) {
    const { count } = await this.prisma.rideRequest.updateMany({ where: { id: requestId, status: 'PENDING' }, data: { status: 'EXPIRED', decidedAt: new Date() } });
    if (count) await this.afterNo(requestId, 'did not answer');
  }

  /** After a decline or timeout: try the next best ride for the same trip, if the rider allowed it. */
  private async afterNo(requestId: string, what: string) {
    const [req] = await this.prisma.$queryRaw<{ organizationId: string; riderMembershipId: string; rideId: string; seats: number; autoRematch: boolean; pickupLabel: string; pLat: number; pLng: number; dropLabel: string; dLat: number; dLng: number; departAt: Date; driverMembershipId: string }[]>`
      SELECT rq.organization_id AS "organizationId", rq.rider_membership_id AS "riderMembershipId", rq.ride_id AS "rideId", rq.seats, rq.auto_rematch AS "autoRematch",
        rq.pickup_label AS "pickupLabel", ST_Y(rq.pickup::geometry) AS "pLat", ST_X(rq.pickup::geometry) AS "pLng",
        rq.drop_label AS "dropLabel", ST_Y(rq.drop::geometry) AS "dLat", ST_X(rq.drop::geometry) AS "dLng",
        r.depart_at AS "departAt", r.driver_membership_id AS "driverMembershipId"
      FROM ride_requests rq JOIN rides r ON r.id = rq.ride_id WHERE rq.id = ${requestId}::uuid`;
    const driverName = await name(this.prisma, req.driverMembershipId);
    const org = { organizationId: req.organizationId, membershipId: req.riderMembershipId };

    if (req.autoRematch) {
      const tried = (await this.prisma.rideRequest.findMany({ where: { riderMembershipId: req.riderMembershipId }, select: { rideId: true } })).map((r) => r.rideId);
      const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', ...opts }).format(d);
      const t = (d: Date) => fmt(d, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
      const [next] = await this.matching.search(org, {
        pickup: { label: req.pickupLabel, lat: req.pLat, lng: req.pLng },
        drop: { label: req.dropLabel, lat: req.dLat, lng: req.dLng },
        seats: req.seats,
        date: fmt(req.departAt, { year: 'numeric', month: '2-digit', day: '2-digit' }),
        fromTime: t(new Date(req.departAt.getTime() - 30 * 60000)),
        toTime: t(new Date(req.departAt.getTime() + 30 * 60000)),
        womenOnly: false,
      }, { excludeRideIds: tried });
      if (next) {
        try {
          await this.request(org, next.rideId, { pickup: { label: req.pickupLabel, lat: req.pLat, lng: req.pLng }, drop: { label: req.dropLabel, lat: req.dLat, lng: req.dLng }, seats: req.seats, autoRematch: true });
          await this.notify.notifyMembership(req.riderMembershipId, { type: 'REQUEST_REMATCHED', title: `${driverName} ${what}, so we asked ${next.driver.name}`, body: `${next.score}% match. We'll tell you when they answer.`, data: { rideId: next.rideId } });
          return;
        } catch (e) {
          this.log.warn(`Rematch failed: ${(e as Error).message}`);
        }
      }
    }
    await this.notify.notifyMembership(req.riderMembershipId, {
      type: 'REQUEST_DECLINED',
      title: `${driverName} ${what}`,
      body: req.autoRematch ? 'No other ride matched your trip. Try a wider time window.' : 'Search again to find another ride.',
      data: { rideId: req.rideId },
      email: true,
    });
  }

  async cancelRequest(org: OrgRef, requestId: string) {
    const { count } = await this.prisma.rideRequest.updateMany({ where: { id: requestId, riderMembershipId: org.membershipId, status: 'PENDING' }, data: { status: 'CANCELLED', decidedAt: new Date() } });
    if (!count) throw new AppError('NOT_FOUND', 'No open request to cancel.', 404);
  }

  // ── Cancellations ──

  private async lowerReliability(tx: { $executeRaw: PrismaService['$executeRaw'] }, membershipId: string) {
    await tx.$executeRaw`UPDATE memberships SET reliability_score = GREATEST(0, reliability_score - 5) WHERE id = ${membershipId}::uuid`;
  }

  /** Rider cancels. Inside the company's free window it counts as late and lowers their reliability. */
  async cancelBooking(org: OrgRef, bookingId: string, actorUserId: string, reason?: string) {
    const settings = await this.matching.settings(org.organizationId);
    const result = await this.prisma.$transaction(async (tx) => {
      const b = await tx.booking.findFirst({ where: { id: bookingId, riderMembershipId: org.membershipId } });
      if (!b) throw new AppError('NOT_FOUND', 'Booking not found.', 404);
      if (b.status !== 'CONFIRMED') throw new AppError('CONFLICT', `This booking is ${b.status.toLowerCase().replace(/_/g, ' ')}.`, 409);
      const [ride] = await tx.$queryRaw<RideLock[]>`SELECT id, driver_membership_id AS "driverMembershipId", depart_at AS "departAt", status::text FROM rides WHERE id = ${b.rideId}::uuid FOR UPDATE`;
      if (ride.departAt <= new Date()) throw new AppError('CONFLICT', 'This ride has already started.', 409);
      const late = ride.departAt.getTime() - Date.now() < settings.freeCancelHours * 3_600_000;
      await tx.booking.update({ where: { id: b.id }, data: { status: 'CANCELLED_BY_RIDER', cancelledAt: new Date(), lateCancel: late } });
      await tx.$executeRaw`UPDATE rides SET seats_booked = seats_booked - ${b.seats}, status = CASE WHEN status = 'FULL' THEN 'SCHEDULED'::"RideStatus" ELSE status END, updated_at = now() WHERE id = ${ride.id}::uuid`;
      if (late) await this.lowerReliability(tx, org.membershipId);
      await this.audit.log({ organizationId: org.organizationId, actorUserId, action: 'BOOKING_CANCELLED', entityType: 'booking', entityId: b.id, after: { late, reason } }, tx);
      return { late, driverMembershipId: ride.driverMembershipId };
    });
    await this.notify.notifyMembership(result.driverMembershipId, { type: 'BOOKING_CANCELLED', title: `${await name(this.prisma, org.membershipId)} cancelled their seat`, body: reason ?? 'A seat is free again on your ride.', data: { bookingId }, email: true });
    return { late: result.late };
  }

  /** Driver cancels one ride: every rider is told; late cancels lower the driver's reliability. */
  async cancelRide(org: OrgRef, rideId: string, actorUserId: string, reason?: string) {
    const settings = await this.matching.settings(org.organizationId);
    const { riders, late } = await this.prisma.$transaction(async (tx) => {
      const [ride] = await tx.$queryRaw<RideLock[]>`SELECT id, driver_membership_id AS "driverMembershipId", depart_at AS "departAt", status::text FROM rides WHERE id = ${rideId}::uuid AND organization_id = ${org.organizationId}::uuid FOR UPDATE`;
      if (!ride || ride.driverMembershipId !== org.membershipId) throw new AppError('NOT_FOUND', 'Ride not found.', 404);
      if (!['SCHEDULED', 'FULL'].includes(ride.status)) throw new AppError('CONFLICT', `This ride is ${ride.status.toLowerCase()}.`, 409);
      const confirmed = await tx.booking.findMany({ where: { rideId, status: 'CONFIRMED' } });
      const late = confirmed.length > 0 && ride.departAt.getTime() - Date.now() < settings.freeCancelHours * 3_600_000;
      await tx.booking.updateMany({ where: { rideId, status: 'CONFIRMED' }, data: { status: 'CANCELLED_BY_DRIVER', cancelledAt: new Date() } });
      await tx.rideRequest.updateMany({ where: { rideId, status: 'PENDING' }, data: { status: 'CANCELLED', decidedAt: new Date() } });
      await tx.ride.update({ where: { id: rideId }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason ?? 'Cancelled by driver', seatsBooked: 0 } });
      if (late) await this.lowerReliability(tx, org.membershipId);
      await this.audit.log({ organizationId: org.organizationId, actorUserId, action: 'RIDE_CANCELLED', entityType: 'ride', entityId: rideId, after: { reason, late, riders: confirmed.length } }, tx);
      return { riders: confirmed.map((b) => b.riderMembershipId), late };
    });
    const driver = await name(this.prisma, org.membershipId);
    for (const r of riders) {
      await this.notify.notifyMembership(r, { type: 'RIDE_CANCELLED', title: `${driver} cancelled the ride`, body: `${reason ?? 'Plans changed.'} Search again to find another ride.`, data: { rideId }, email: true });
    }
    return { cancelledBookings: riders.length, late };
  }
}