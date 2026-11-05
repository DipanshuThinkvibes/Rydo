import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { REALTIME_EVENTS, type LiveRide, type LocationPoint, type OrgRoleName, type RatingInput } from '@rydo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MatchingService } from '../rides/matching.service';
import { AppError } from '../common/app-error';
import { env } from '../config/env';
import { REALTIME, opsRoom, rideRoom, type RealtimePublisher } from './realtime.gateway';
import { TripAccessService, type Viewer } from './trip-access.service';

type Org = { organizationId: string; membershipId: string; roles: OrgRoleName[] };
const OFF_ROUTE_M = 500;
const STOPPED_M = 60;
const NEAR_STOP_M = 150;
const START_EARLY_MIN = 30;
const ADMIN_ROLES = ['ORG_ADMIN', 'OPS_ADMIN', 'HR_ADMIN'] as const;

export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

/** Phase 4: a ride from "start" to "rated", live location, safety checks, SOS and the share link. */
@Injectable()
export class TripService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notify: NotificationsService,
    private readonly matching: MatchingService,
    private readonly access: TripAccessService,
    @Inject(REALTIME) private readonly realtime: RealtimePublisher,
  ) {}

  // ── access helpers ──

  async viewer(org: Org, rideId: string) {
    const v = await this.access.forMembership(org, rideId);
    if (!v) throw new AppError('NOT_FOUND', 'Ride not found.', 404);
    return v;
  }

  private async asDriver(org: Org, rideId: string) {
    const v = await this.viewer(org, rideId);
    if (v.role !== 'DRIVER') throw new AppError('FORBIDDEN', 'Only the driver can do this.', 403);
    return v;
  }

  private async bookingForDriver(org: Org, bookingId: string) {
    const b = await this.prisma.booking.findFirst({ where: { id: bookingId, ride: { organizationId: org.organizationId, driverMembershipId: org.membershipId } }, include: { ride: true } });
    if (!b) throw new AppError('NOT_FOUND', 'Booking not found.', 404);
    if (b.ride.status !== 'IN_PROGRESS') throw new AppError('RIDE_NOT_LIVE', 'Start the ride first.', 409);
    return b;
  }

  private announce(rideId: string, organizationId: string, data: object) {
    const payload = { rideId, ...data };
    this.realtime.publish(rideRoom(rideId), REALTIME_EVENTS.update, payload);
    this.realtime.publish(opsRoom(organizationId), REALTIME_EVENTS.update, payload);
  }

  private async event(rideId: string, type: 'STARTED' | 'ARRIVED_AT_PICKUP' | 'PIN_VERIFIED' | 'NO_SHOW' | 'LONG_STOP' | 'LONG_STOP_OK' | 'OFF_ROUTE' | 'COMPLETED', bookingId: string | null = null, data?: object) {
    return this.prisma.rideEvent.create({ data: { rideId, type, bookingId, data: data ?? undefined } });
  }

  private async riderIds(rideId: string, statuses: ('CONFIRMED' | 'BOARDED')[] = ['CONFIRMED', 'BOARDED']) {
    return (await this.prisma.booking.findMany({ where: { rideId, status: { in: statuses } }, select: { riderMembershipId: true } })).map((b) => b.riderMembershipId);
  }

  private async driverName(membershipId: string) {
    const m = await this.prisma.membership.findUniqueOrThrow({ where: { id: membershipId }, include: { user: { select: { name: true } } } });
    return m.user.name;
  }

  // ── trip flow ──

  async start(org: Org, rideId: string, actorUserId: string) {
    await this.asDriver(org, rideId);
    const ride = await this.prisma.ride.findUniqueOrThrow({ where: { id: rideId } });
    if (!['SCHEDULED', 'FULL'].includes(ride.status)) throw new AppError('CONFLICT', `This ride is ${ride.status.toLowerCase().replace('_', ' ')}.`, 409);
    const minutesToGo = (ride.departAt.getTime() - Date.now()) / 60_000;
    if (minutesToGo > START_EARLY_MIN) throw new AppError('TOO_EARLY', `You can start up to ${START_EARLY_MIN} minutes before departure.`, 409);
    if (minutesToGo < -180) throw new AppError('CONFLICT', 'This ride is too old to start.', 409);
    await this.prisma.ride.update({ where: { id: rideId }, data: { status: 'IN_PROGRESS', startedAt: new Date() } });
    await this.event(rideId, 'STARTED');
    await this.audit.log({ organizationId: org.organizationId, actorUserId, action: 'RIDE_STARTED', entityType: 'ride', entityId: rideId });
    const name = await this.driverName(ride.driverMembershipId);
    for (const id of await this.riderIds(rideId, ['CONFIRMED'])) {
      await this.notify.notifyMembership(id, { type: 'RIDE_STARTED', title: `${name} is on the way`, body: 'Watch the car live in My trips. Keep your PIN ready.', data: { rideId } });
    }
    this.announce(rideId, org.organizationId, { status: 'IN_PROGRESS', event: 'STARTED' });
    return { status: 'IN_PROGRESS' as const };
  }

  async arrived(org: Org, bookingId: string) {
    const b = await this.bookingForDriver(org, bookingId);
    if (b.status !== 'CONFIRMED') throw new AppError('CONFLICT', 'This rider is already handled.', 409);
    const e = await this.event(b.rideId, 'ARRIVED_AT_PICKUP', b.id);
    const s = await this.matching.settings(org.organizationId);
    await this.notify.notifyMembership(b.riderMembershipId, { type: 'DRIVER_ARRIVED', title: 'Your driver is at the pickup', body: `Meet at ${b.pickupLabel}. Say your PIN only inside the car.`, data: { rideId: b.rideId } });
    this.announce(b.rideId, org.organizationId, { event: 'ARRIVED_AT_PICKUP', bookingId: b.id });
    return { arrivedAt: e.at, noShowAt: new Date(e.at.getTime() + s.noShowAfterMinutes * 60_000) };
  }

  async board(org: Org, bookingId: string, pin: string, actorUserId: string) {
    const b = await this.bookingForDriver(org, bookingId);
    if (b.status !== 'CONFIRMED') throw new AppError('CONFLICT', 'This rider is already handled.', 409);
    if (b.pin !== pin) throw new AppError('PIN_WRONG', "That PIN doesn't match. Ask the rider to check My trips.", 400, { pin: 'Wrong PIN' });
    await this.prisma.booking.update({ where: { id: b.id }, data: { status: 'BOARDED', boardedAt: new Date() } });
    await this.event(b.rideId, 'PIN_VERIFIED', b.id);
    await this.audit.log({ organizationId: org.organizationId, actorUserId, action: 'RIDER_BOARDED', entityType: 'booking', entityId: b.id });
    this.announce(b.rideId, org.organizationId, { event: 'PIN_VERIFIED', bookingId: b.id });
    return { status: 'BOARDED' as const };
  }

  async noShow(org: Org, bookingId: string, actorUserId: string) {
    const b = await this.bookingForDriver(org, bookingId);
    if (b.status !== 'CONFIRMED') throw new AppError('CONFLICT', 'This rider is already handled.', 409);
    const arrived = await this.prisma.rideEvent.findFirst({ where: { rideId: b.rideId, bookingId: b.id, type: 'ARRIVED_AT_PICKUP' }, orderBy: { at: 'desc' } });
    const s = await this.matching.settings(org.organizationId);
    if (!arrived) throw new AppError('CONFLICT', 'Tap "I\'m at pickup" first, then wait for the rider.', 409);
    const waited = (Date.now() - arrived.at.getTime()) / 60_000;
    if (waited < s.noShowAfterMinutes) throw new AppError('TOO_EARLY', `Wait ${Math.ceil(s.noShowAfterMinutes - waited)} more minute(s) before marking a no-show.`, 409);
    await this.prisma.$transaction([
      this.prisma.booking.update({ where: { id: b.id }, data: { status: 'NO_SHOW' } }),
      this.prisma.$executeRaw`UPDATE memberships SET reliability_score = GREATEST(0, reliability_score - 10) WHERE id = ${b.riderMembershipId}::uuid`,
    ]);
    await this.event(b.rideId, 'NO_SHOW', b.id, { waitedMinutes: Math.round(waited) });
    await this.audit.log({ organizationId: org.organizationId, actorUserId, action: 'RIDER_NO_SHOW', entityType: 'booking', entityId: b.id });
    await this.notify.notifyMembership(b.riderMembershipId, { type: 'NO_SHOW', title: 'Marked as no-show', body: `Your driver waited ${Math.round(waited)} minutes at ${b.pickupLabel}. Your reliability score went down.`, data: { rideId: b.rideId }, email: true });
    this.announce(b.rideId, org.organizationId, { event: 'NO_SHOW', bookingId: b.id });
    return { status: 'NO_SHOW' as const };
  }

  async complete(org: Org, rideId: string, actorUserId: string) {
    await this.asDriver(org, rideId);
    const ride = await this.prisma.ride.findUniqueOrThrow({ where: { id: rideId } });
    if (ride.status !== 'IN_PROGRESS') throw new AppError('RIDE_NOT_LIVE', 'Only a started ride can be completed.', 409);
    const riders = await this.riderIds(rideId, ['BOARDED']);
    await this.prisma.$transaction([
      this.prisma.ride.update({ where: { id: rideId }, data: { status: 'COMPLETED', completedAt: new Date() } }),
      this.prisma.booking.updateMany({ where: { rideId, status: 'BOARDED' }, data: { status: 'COMPLETED' } }),
      // Riders never picked up and never marked: missed, without a reliability penalty.
      this.prisma.booking.updateMany({ where: { rideId, status: 'CONFIRMED' }, data: { status: 'NO_SHOW' } }),
      this.prisma.tripShare.updateMany({ where: { rideId }, data: { expiresAt: new Date(Date.now() + 30 * 60_000) } }),
    ]);
    await this.event(rideId, 'COMPLETED');
    await this.audit.log({ organizationId: org.organizationId, actorUserId, action: 'RIDE_COMPLETED', entityType: 'ride', entityId: rideId });
    const name = await this.driverName(ride.driverMembershipId);
    for (const id of riders) await this.notify.notifyMembership(id, { type: 'RIDE_COMPLETED', title: 'You have arrived', body: `How was the ride with ${name}? Rate it in My trips.`, data: { rideId } });
    this.announce(rideId, org.organizationId, { status: 'COMPLETED', event: 'COMPLETED' });
    return { status: 'COMPLETED' as const };
  }

  async rate(org: Org, rideId: string, b: RatingInput) {
    const v = await this.viewer(org, rideId);
    const ride = await this.prisma.ride.findUniqueOrThrow({ where: { id: rideId } });
    if (ride.status !== 'COMPLETED') throw new AppError('CONFLICT', 'You can rate after the ride is completed.', 409);
    if (ride.completedAt && Date.now() - ride.completedAt.getTime() > 7 * 86_400_000) throw new AppError('CONFLICT', 'Ratings close 7 days after the ride.', 409);
    const okPair =
      v.role === 'RIDER'
        ? b.rateeMembershipId === ride.driverMembershipId
        : v.role === 'DRIVER' && !!(await this.prisma.booking.findFirst({ where: { rideId, riderMembershipId: b.rateeMembershipId, status: 'COMPLETED' } }));
    if (!okPair) throw new AppError('FORBIDDEN', 'You can only rate people from this ride.', 403);
    if (v.role === 'RIDER' && !(await this.prisma.booking.findFirst({ where: { rideId, riderMembershipId: v.membershipId, status: 'COMPLETED' } }))) {
      throw new AppError('FORBIDDEN', 'Only riders who travelled can rate.', 403);
    }
    const r = await this.prisma.rating.create({
      data: { organizationId: org.organizationId, rideId, raterMembershipId: v.membershipId, rateeMembershipId: b.rateeMembershipId, stars: b.stars, tags: b.tags, comment: b.comment },
    });
    return { id: r.id };
  }

  // ── live location + safety checks ──

  async ingest(org: Org, rideId: string, points: LocationPoint[]) {
    await this.asDriver(org, rideId);
    const ride = await this.prisma.ride.findUniqueOrThrow({ where: { id: rideId }, select: { status: true } });
    if (ride.status !== 'IN_PROGRESS') throw new AppError('RIDE_NOT_LIVE', 'Start the ride to share your location.', 409);
    const now = Date.now();
    const clamp = (iso?: string) => new Date(Math.min(now + 60_000, Math.max(now - 10 * 60_000, iso ? new Date(iso).getTime() : now)));
    const sorted = points.map((p) => ({ ...p, at: clamp(p.at) })).sort((a, b) => a.at.getTime() - b.at.getTime());
    await this.prisma.$executeRaw`
      INSERT INTO vehicle_locations (ride_id, recorded_at, location, speed_mps, heading, accuracy_m)
      SELECT ${rideId}::uuid, t.at, ST_SetSRID(ST_MakePoint(t.lng, t.lat), 4326)::geography, t.speed, t.heading, t.acc
      FROM unnest(${sorted.map((p) => p.at)}::timestamptz[], ${sorted.map((p) => p.lat)}::float8[], ${sorted.map((p) => p.lng)}::float8[],
        ${sorted.map((p) => p.speedMps ?? null)}::float8[], ${sorted.map((p) => p.headingDeg ?? null)}::float8[], ${sorted.map((p) => p.accuracyM ?? null)}::float8[])
        AS t(at, lat, lng, speed, heading, acc)`;
    const last = sorted[sorted.length - 1];
    const loc = { rideId, lat: last.lat, lng: last.lng, at: last.at.toISOString(), speedMps: last.speedMps ?? null, headingDeg: last.headingDeg ?? null };
    this.realtime.publish(rideRoom(rideId), REALTIME_EVENTS.location, loc);
    this.realtime.publish(opsRoom(org.organizationId), REALTIME_EVENTS.location, loc);
    const alerts = await this.safetyChecks(org.organizationId, rideId);
    return { saved: sorted.length, alerts };
  }

  /** Long stop ("Everything OK?") and off-route checks on the newest point. One query. */
  private async safetyChecks(organizationId: string, rideId: string) {
    const s = await this.matching.settings(organizationId);
    const [c] = await this.prisma.$queryRaw<{ offM: number | null; spanS: number | null; movedM: number | null; destM: number | null; pickupM: number | null; recentStop: boolean; recentOff: boolean }[]>`
      WITH last AS (SELECT location, recorded_at FROM vehicle_locations WHERE ride_id = ${rideId}::uuid ORDER BY recorded_at DESC LIMIT 1),
      win AS (
        SELECT v.location, v.recorded_at FROM vehicle_locations v, last
        WHERE v.ride_id = ${rideId}::uuid AND v.recorded_at >= last.recorded_at - make_interval(mins => ${s.longStopMinutes}::int)
      )
      SELECT
        (SELECT ST_Distance(r.route_line, last.location) FROM rides r, last WHERE r.id = ${rideId}::uuid) AS "offM",
        (SELECT EXTRACT(EPOCH FROM max(recorded_at) - min(recorded_at))::float FROM win) AS "spanS",
        (SELECT max(ST_Distance(win.location, last.location)) FROM win, last) AS "movedM",
        (SELECT ST_Distance(r.destination, last.location) FROM rides r, last WHERE r.id = ${rideId}::uuid) AS "destM",
        (SELECT min(ST_Distance(b.pickup, last.location)) FROM bookings b, last WHERE b.ride_id = ${rideId}::uuid AND b.status = 'CONFIRMED') AS "pickupM",
        EXISTS (SELECT 1 FROM ride_events e WHERE e.ride_id = ${rideId}::uuid AND e.type IN ('LONG_STOP', 'LONG_STOP_OK') AND e.at > now() - make_interval(mins => ${s.longStopMinutes}::int)) AS "recentStop",
        EXISTS (SELECT 1 FROM ride_events e WHERE e.ride_id = ${rideId}::uuid AND e.type = 'OFF_ROUTE' AND e.at > now() - interval '10 minutes') AS "recentOff"`;
    const alerts: string[] = [];
    const nearStop = (c.destM ?? Infinity) < NEAR_STOP_M || (c.pickupM ?? Infinity) < NEAR_STOP_M;
    if (!c.recentStop && !nearStop && (c.spanS ?? 0) >= s.longStopMinutes * 60 * 0.9 && (c.movedM ?? Infinity) < STOPPED_M) {
      await this.event(rideId, 'LONG_STOP', null, { minutes: s.longStopMinutes });
      const ride = await this.prisma.ride.findUniqueOrThrow({ where: { id: rideId }, select: { driverMembershipId: true } });
      for (const id of [ride.driverMembershipId, ...(await this.riderIds(rideId, ['BOARDED']))]) {
        await this.notify.notifyMembership(id, { type: 'LONG_STOP', title: 'Everything OK?', body: `The car hasn't moved for ${s.longStopMinutes} minutes. Tap "I'm OK" in the trip, or press SOS if you need help.`, data: { rideId } });
      }
      this.announce(rideId, organizationId, { event: 'LONG_STOP' });
      alerts.push('LONG_STOP');
    }
    if (!c.recentOff && (c.offM ?? 0) > OFF_ROUTE_M) {
      await this.event(rideId, 'OFF_ROUTE', null, { meters: Math.round(c.offM ?? 0) });
      this.announce(rideId, organizationId, { event: 'OFF_ROUTE' });
      alerts.push('OFF_ROUTE');
    }
    return alerts;
  }

  async imOk(org: Org, rideId: string) {
    const v = await this.viewer(org, rideId);
    if (v.role === 'ADMIN') throw new AppError('FORBIDDEN', 'Only people in the car can answer this.', 403);
    await this.event(rideId, 'LONG_STOP_OK', v.bookingId, { by: v.role });
    this.announce(rideId, org.organizationId, { event: 'LONG_STOP_OK' });
    return { ok: true };
  }

  // ── live view ──

  async live(org: Org, rideId: string): Promise<LiveRide> {
    const v = await this.viewer(org, rideId);
    return this.liveView(v);
  }

  async liveView(v: Viewer): Promise<LiveRide> {
    const rideId = v.ride.id;
    const ride = await this.prisma.ride.findUniqueOrThrow({ where: { id: rideId }, include: { vehicle: true } });
    const [[geo], events, bookings, sos, settings, driverName, myRating] = await Promise.all([
      this.prisma.$queryRaw<{ route: string | null; lat: number | null; lng: number | null; at: Date | null; speed: number | null; heading: number | null }[]>`
        SELECT ST_AsEncodedPolyline(ST_Simplify(r.route_line::geometry, 0.00003)) AS route,
          ST_Y(l.location::geometry) AS lat, ST_X(l.location::geometry) AS lng, l.recorded_at AS at, l.speed_mps AS speed, l.heading
        FROM rides r
        LEFT JOIN LATERAL (SELECT location, recorded_at, speed_mps, heading FROM vehicle_locations WHERE ride_id = r.id ORDER BY recorded_at DESC LIMIT 1) l ON true
        WHERE r.id = ${rideId}::uuid`,
      this.prisma.rideEvent.findMany({ where: { rideId }, orderBy: { at: 'desc' }, take: 30 }),
      this.prisma.$queryRaw<{ id: string; riderMembershipId: string; name: string; status: string; seats: number; pickupLabel: string; lat: number; lng: number }[]>`
        SELECT b.id, b.rider_membership_id AS "riderMembershipId", u.name, b.status::text AS status, b.seats, b.pickup_label AS "pickupLabel",
          ST_Y(b.pickup::geometry) AS lat, ST_X(b.pickup::geometry) AS lng
        FROM bookings b JOIN memberships m ON m.id = b.rider_membership_id JOIN users u ON u.id = m.user_id
        WHERE b.ride_id = ${rideId}::uuid AND b.status IN ('CONFIRMED', 'BOARDED', 'COMPLETED', 'NO_SHOW')
        ORDER BY b.created_at`,
      this.prisma.sosEvent.findMany({ where: { rideId, status: { not: 'RESOLVED' } }, orderBy: { createdAt: 'desc' } }),
      this.matching.settings(ride.organizationId),
      this.driverName(ride.driverMembershipId),
      v.membershipId ? this.prisma.rating.findMany({ where: { rideId, raterMembershipId: v.membershipId }, select: { rateeMembershipId: true } }) : Promise.resolve([] as { rateeMembershipId: string }[]),
    ]);
    const arrived = new Map(events.filter((e) => e.type === 'ARRIVED_AT_PICKUP' && e.bookingId).map((e) => [e.bookingId!, e.at]));
    const rated = new Set(myRating.map((r) => r.rateeMembershipId));
    const visible = v.role === 'RIDER' ? bookings.filter((b) => b.id === v.bookingId) : bookings;
    return {
      ride: {
        id: ride.id,
        status: ride.status,
        departAt: ride.departAt.toISOString(),
        startedAt: ride.startedAt?.toISOString() ?? null,
        completedAt: ride.completedAt?.toISOString() ?? null,
        from: ride.originLabel,
        to: ride.destinationLabel,
        route: geo?.route ?? null,
        durationSeconds: ride.durationSeconds,
        driver: { membershipId: ride.driverMembershipId, name: driverName },
        vehicle: { make: ride.vehicle.make, model: ride.vehicle.model, color: ride.vehicle.color, plateNumber: ride.vehicle.plateNumber },
      },
      viewer: v.role,
      location: geo?.lat != null && geo.at ? { rideId, lat: geo.lat, lng: geo.lng!, at: geo.at.toISOString(), speedMps: geo.speed, headingDeg: geo.heading } : null,
      events: events.filter((e) => v.role !== 'RIDER' || !e.bookingId || e.bookingId === v.bookingId).map((e) => ({ type: e.type, at: e.at.toISOString(), bookingId: e.bookingId })),
      riders: visible.map((b) => ({
        bookingId: b.id,
        membershipId: b.riderMembershipId,
        name: b.name,
        status: b.status,
        seats: b.seats,
        pickupLabel: b.pickupLabel,
        pickup: { lat: b.lat, lng: b.lng },
        arrivedAt: arrived.get(b.id)?.toISOString() ?? null,
        rated: rated.has(b.riderMembershipId),
      })),
      ratedDriver: rated.has(ride.driverMembershipId),
      sos: (v.role === 'ADMIN' || sos.some((x) => x.raisedByMembershipId === v.membershipId) ? sos : []).map((x) => ({ id: x.id, status: x.status, createdAt: x.createdAt.toISOString() })),
      noShowAfterMinutes: settings.noShowAfterMinutes,
    };
  }

  /** Company admins: every ride in progress with its last position and open SOS. */
  async liveBoard(organizationId: string) {
    return this.prisma.$queryRaw<object[]>`
      SELECT r.id, r.status, r.depart_at AS "departAt", r.started_at AS "startedAt", r.origin_label AS "from", r.destination_label AS "to", u.name AS "driverName",
        v.plate_number AS "plateNumber", ST_Y(l.location::geometry) AS lat, ST_X(l.location::geometry) AS lng, l.recorded_at AS "locationAt",
        (SELECT count(*)::int FROM sos_events s WHERE s.ride_id = r.id AND s.status <> 'RESOLVED') AS "openSos",
        (SELECT e.type::text FROM ride_events e WHERE e.ride_id = r.id ORDER BY e.at DESC LIMIT 1) AS "lastEvent"
      FROM rides r
      JOIN memberships m ON m.id = r.driver_membership_id JOIN users u ON u.id = m.user_id
      JOIN vehicles v ON v.id = r.vehicle_id
      LEFT JOIN LATERAL (SELECT location, recorded_at FROM vehicle_locations WHERE ride_id = r.id ORDER BY recorded_at DESC LIMIT 1) l ON true
      WHERE r.organization_id = ${organizationId}::uuid AND r.status = 'IN_PROGRESS'
      ORDER BY r.started_at`;
  }

  // ── SOS ──

  async sos(org: Org, rideId: string, at: { lat?: number; lng?: number }, actorUserId: string) {
    const v = await this.viewer(org, rideId);
    if (v.role === 'ADMIN') throw new AppError('FORBIDDEN', 'Only people in the car can raise SOS.', 403);
    const ride = await this.prisma.ride.findUniqueOrThrow({ where: { id: rideId } });
    if (ride.status !== 'IN_PROGRESS') throw new AppError('RIDE_NOT_LIVE', 'SOS works during a ride. In danger now? Call 112.', 409);
    const open = await this.prisma.sosEvent.findFirst({ where: { rideId, raisedByMembershipId: v.membershipId, status: { not: 'RESOLVED' } } });
    if (open) return { id: open.id, status: open.status, alreadyOpen: true };
    const [row] = await this.prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO sos_events (id, organization_id, ride_id, raised_by_membership_id, location, status, created_at)
      VALUES (gen_random_uuid(), ${org.organizationId}::uuid, ${rideId}::uuid, ${v.membershipId}::uuid,
        COALESCE(
          CASE WHEN ${at.lat ?? null}::float8 IS NOT NULL THEN ST_SetSRID(ST_MakePoint(${at.lng ?? null}::float8, ${at.lat ?? null}::float8), 4326)::geography END,
          (SELECT location FROM vehicle_locations WHERE ride_id = ${rideId}::uuid ORDER BY recorded_at DESC LIMIT 1)
        ), 'ACTIVE', now())
      RETURNING id`;
    await this.audit.log({ organizationId: org.organizationId, actorUserId, action: 'SOS_RAISED', entityType: 'sos_event', entityId: row.id, after: { rideId } });
    const who = (await this.prisma.membership.findUniqueOrThrow({ where: { id: v.membershipId }, include: { user: { select: { name: true } } } })).user.name;
    const admins = await this.prisma.membership.findMany({ where: { organizationId: org.organizationId, status: 'ACTIVE', roles: { some: { role: { in: [...ADMIN_ROLES] } } } }, select: { id: true } });
    for (const a of admins) {
      await this.notify.notifyMembership(a.id, { type: 'SOS', title: `SOS from ${who}`, body: `${who} pressed SOS during a ride (${ride.originLabel} → ${ride.destinationLabel}). Open Rides to see where they are and call them.`, data: { rideId, sosId: row.id }, email: true });
    }
    this.realtime.publish(opsRoom(org.organizationId), REALTIME_EVENTS.sos, { id: row.id, rideId, status: 'ACTIVE' });
    this.announce(rideId, org.organizationId, { event: 'SOS' });
    return { id: row.id, status: 'ACTIVE' as const, alreadyOpen: false };
  }

  async sosList(organizationId: string, all: boolean) {
    return this.prisma.$queryRaw<object[]>`
      SELECT s.id, s.status, s.created_at AS "createdAt", s.acknowledged_at AS "acknowledgedAt", s.resolved_at AS "resolvedAt", s.notes,
        ST_Y(s.location::geometry) AS lat, ST_X(s.location::geometry) AS lng, s.ride_id AS "rideId",
        u.name AS "raisedBy", (m.id = r.driver_membership_id) AS "byDriver", du.name AS "driverName", v.plate_number AS "plateNumber",
        r.origin_label AS "from", r.destination_label AS "to"
      FROM sos_events s
      JOIN memberships m ON m.id = s.raised_by_membership_id JOIN users u ON u.id = m.user_id
      JOIN rides r ON r.id = s.ride_id
      JOIN memberships dm ON dm.id = r.driver_membership_id JOIN users du ON du.id = dm.user_id
      JOIN vehicles v ON v.id = r.vehicle_id
      WHERE s.organization_id = ${organizationId}::uuid AND (${all} OR s.status <> 'RESOLVED')
      ORDER BY (s.status = 'ACTIVE') DESC, s.created_at DESC LIMIT 50`;
  }

  async sosUpdate(org: Org, id: string, action: 'ack' | 'resolve', actorUserId: string, notes?: string) {
    const s = await this.prisma.sosEvent.findFirst({ where: { id, organizationId: org.organizationId } });
    if (!s) throw new AppError('NOT_FOUND', 'SOS not found.', 404);
    if (s.status === 'RESOLVED') throw new AppError('CONFLICT', 'Already resolved.', 409);
    const data =
      action === 'ack'
        ? { status: 'ACKNOWLEDGED' as const, acknowledgedById: org.membershipId, acknowledgedAt: new Date() }
        : { status: 'RESOLVED' as const, resolvedById: org.membershipId, resolvedAt: new Date(), notes, ...(s.acknowledgedAt ? {} : { acknowledgedById: org.membershipId, acknowledgedAt: new Date() }) };
    const updated = await this.prisma.sosEvent.update({ where: { id }, data });
    await this.audit.log({ organizationId: org.organizationId, actorUserId, action: action === 'ack' ? 'SOS_ACKNOWLEDGED' : 'SOS_RESOLVED', entityType: 'sos_event', entityId: id, after: { notes } });
    if (action === 'ack') await this.notify.notifyMembership(s.raisedByMembershipId, { type: 'SOS_ACK', title: 'Help is on it', body: 'Your company has seen your SOS and is contacting you.', data: { rideId: s.rideId } });
    this.realtime.publish(opsRoom(org.organizationId), REALTIME_EVENTS.sos, { id, rideId: s.rideId, status: updated.status });
    this.realtime.publish(rideRoom(s.rideId), REALTIME_EVENTS.update, { rideId: s.rideId, event: 'SOS' });
    return { id, status: updated.status };
  }

  // ── share live trip ──

  async share(org: Org, rideId: string) {
    const v = await this.viewer(org, rideId);
    if (v.role !== 'RIDER' || !v.bookingId) throw new AppError('FORBIDDEN', 'Riders share their own trip.', 403);
    const ride = await this.prisma.ride.findUniqueOrThrow({ where: { id: rideId } });
    if (['COMPLETED', 'CANCELLED'].includes(ride.status)) throw new AppError('CONFLICT', 'This ride is over.', 409);
    const token = randomBytes(24).toString('base64url');
    const expiresAt = new Date(Math.max(Date.now(), ride.departAt.getTime()) + ((ride.durationSeconds ?? 3600) + 3 * 3600) * 1000);
    await this.prisma.tripShare.create({ data: { rideId, bookingId: v.bookingId, tokenHash: hashToken(token), expiresAt } });
    return { token, url: `${env().WEB_ORIGIN.split(',')[0]}/t/${token}`, expiresAt };
  }

  /** What family sees from a share link: no phone numbers, emails or surnames. */
  async publicTrip(token: string) {
    const s = await this.prisma.tripShare.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!s || s.expiresAt < new Date()) throw new AppError('NOT_FOUND', 'This trip link has expired.', 404);
    const v = await this.liveView({ role: 'RIDER', membershipId: '', bookingId: s.bookingId, ride: { id: s.rideId, organizationId: '', driverMembershipId: '', status: '' } });
    const me = v.riders[0];
    return {
      status: v.ride.status,
      departAt: v.ride.departAt,
      from: v.ride.from,
      to: v.ride.to,
      route: v.ride.route,
      driverFirstName: v.ride.driver.name.split(/\s+/)[0],
      vehicle: v.ride.vehicle,
      location: v.location,
      rider: me ? { firstName: me.name.split(/\s+/)[0], status: me.status, pickupLabel: me.pickupLabel, pickup: me.pickup } : null,
      expiresAt: s.expiresAt.toISOString(),
    };
  }

  /**
   * Nightly GPS housekeeping on the day partitions (schema "gps"): make the next 7 days, then drop days older
   * than 30 (90 when a ride that day had an SOS). Dropping a day is instant, unlike deleting millions of rows.
   */
  async retention() {
    const [made] = await this.prisma.$queryRaw<{ n: number }[]>`SELECT gps.ensure_partitions(7) AS n`;
    const [dropped] = await this.prisma.$queryRaw<{ n: number }[]>`SELECT gps.drop_old_partitions(30, 90) AS n`;
    return { partitionsCreated: made.n, partitionsDropped: dropped.n };
  }
}
