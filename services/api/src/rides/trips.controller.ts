import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { cancelSchema, rideRequestSchema, rideSearchSchema, type RideRequestInput, type RideSearch } from '@rydo/shared';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/app-error';
import { ZodPipe } from '../common/zod.pipe';
import { Auth, Org, type AuthContext, type OrgContext } from '../common/request-context';
import { OrgScoped } from '../tenancy/decorators';
import { MatchingService } from './matching.service';
import { BookingService } from './booking.service';

/** Rider and driver actions on rides (web now, mobile later). Every query is limited to the caller's company. */
@Controller()
@OrgScoped()
export class TripsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly matching: MatchingService,
    private readonly booking: BookingService,
  ) {}

  // ── Rider ──

  @Post('rides/search')
  @HttpCode(200)
  async search(@Org() org: OrgContext, @Body(new ZodPipe(rideSearchSchema)) body: RideSearch) {
    return { data: await this.matching.search(org, body) };
  }

  @Post('rides/:id/requests')
  async request(@Auth() auth: AuthContext, @Org() org: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(rideRequestSchema)) body: RideRequestInput) {
    return { data: await this.booking.request(org, id, body, auth.userId) };
  }

  @Get('me/requests')
  async myRequests(@Org() org: OrgContext) {
    const rows = await this.prisma.rideRequest.findMany({
      where: { riderMembershipId: org.membershipId, createdAt: { gt: new Date(Date.now() - 7 * 86_400_000) } },
      include: { ride: { include: { vehicle: true } } },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    const drivers = await this.names(rows.map((r) => r.ride.driverMembershipId));
    return {
      data: rows.map((r) => ({
        id: r.id, status: r.status, seats: r.seats, pickupLabel: r.pickupLabel, dropLabel: r.dropLabel, matchScore: r.matchScore, expiresAt: r.expiresAt, createdAt: r.createdAt,
        ride: { id: r.ride.id, departAt: r.ride.departAt, from: r.ride.originLabel, to: r.ride.destinationLabel, driverName: drivers.get(r.ride.driverMembershipId), plateNumber: r.ride.vehicle.plateNumber },
      })),
    };
  }

  @Post('requests/:id/cancel')
  @HttpCode(200)
  async cancelRequest(@Org() org: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.booking.cancelRequest(org, id);
    return { data: { id, status: 'CANCELLED' } };
  }

  @Get('me/bookings')
  async myBookings(@Org() org: OrgContext) {
    const rows = await this.prisma.booking.findMany({
      where: { riderMembershipId: org.membershipId, ride: { departAt: { gt: new Date(Date.now() - 2 * 86_400_000) } } },
      include: { ride: { include: { vehicle: true } } },
      orderBy: { ride: { departAt: 'asc' } },
      take: 30,
    });
    const drivers = await this.names(rows.map((b) => b.ride.driverMembershipId));
    const geo = await this.points('bookings', rows.map((b) => b.id), true);
    return {
      data: rows.map((b) => ({
        id: b.id, status: b.status, seats: b.seats, pickupLabel: b.pickupLabel, dropLabel: b.dropLabel, lateCancel: b.lateCancel,
        pickup: geo.get(b.id)?.pickup ?? null, drop: geo.get(b.id)?.drop ?? null, route: geo.get(b.id)?.route ?? null,
        // The PIN is only for the rider, and only while the booking is live.
        pin: b.status === 'CONFIRMED' ? b.pin : null,
        costShareEstimate: b.costShareEst ? Number(b.costShareEst) : null,
        ride: {
          id: b.ride.id, departAt: b.ride.departAt, status: b.ride.status, from: b.ride.originLabel, to: b.ride.destinationLabel, driverName: drivers.get(b.ride.driverMembershipId),
          vehicle: { make: b.ride.vehicle.make, model: b.ride.vehicle.model, color: b.ride.vehicle.color, plateNumber: b.ride.vehicle.plateNumber },
        },
      })),
    };
  }

  @Post('bookings/:id/cancel')
  @HttpCode(200)
  async cancelBooking(@Auth() auth: AuthContext, @Org() org: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(cancelSchema)) body: z.infer<typeof cancelSchema>) {
    return { data: await this.booking.cancelBooking(org, id, auth.userId, body.reason) };
  }

  // ── Driver ──

  /** One of my rides with its riders and open requests. */
  @Get('rides/:id/manage')
  async manage(@Org() org: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    const ride = await this.prisma.ride.findFirst({
      where: { id, organizationId: org.organizationId, driverMembershipId: org.membershipId },
      include: { vehicle: true, bookings: { where: { status: { in: ['CONFIRMED', 'BOARDED', 'COMPLETED'] } } }, requests: { where: { status: 'PENDING', expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'asc' } } },
    });
    if (!ride) throw new AppError('NOT_FOUND', 'Ride not found.', 404);
    const people = await this.people([...ride.bookings.map((b) => b.riderMembershipId), ...ride.requests.map((r) => r.riderMembershipId)]);
    const [bGeo, rGeo, [line]] = await Promise.all([
      this.points('bookings', ride.bookings.map((b) => b.id)),
      this.points('ride_requests', ride.requests.map((r) => r.id)),
      this.prisma.$queryRaw<{ route: string | null }[]>`SELECT ST_AsEncodedPolyline(ST_Simplify(route_line::geometry, 0.00003)) AS route FROM rides WHERE id = ${ride.id}::uuid`,
    ]);
    return {
      data: {
        id: ride.id, status: ride.status, departAt: ride.departAt, from: ride.originLabel, to: ride.destinationLabel, direction: ride.direction,
        seatsTotal: ride.seatsTotal, seatsBooked: ride.seatsBooked, distanceMeters: ride.distanceMeters, durationSeconds: ride.durationSeconds,
        route: line?.route ?? null,
        vehicle: { make: ride.vehicle.make, model: ride.vehicle.model, plateNumber: ride.vehicle.plateNumber },
        riders: ride.bookings.map((b) => ({ bookingId: b.id, status: b.status, seats: b.seats, pickupLabel: b.pickupLabel, dropLabel: b.dropLabel, pickup: bGeo.get(b.id)?.pickup ?? null, drop: bGeo.get(b.id)?.drop ?? null, ...people.get(b.riderMembershipId) })),
        requests: ride.requests.map((r) => ({ requestId: r.id, seats: r.seats, pickupLabel: r.pickupLabel, dropLabel: r.dropLabel, matchScore: r.matchScore, reasons: r.matchReasons, createdAt: r.createdAt, expiresAt: r.expiresAt, pickup: rGeo.get(r.id)?.pickup ?? null, drop: rGeo.get(r.id)?.drop ?? null, ...people.get(r.riderMembershipId) })),
      },
    };
  }

  @Post('requests/:id/accept')
  @HttpCode(200)
  async accept(@Auth() auth: AuthContext, @Org() org: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.booking.accept(org.membershipId, id, auth.userId) };
  }

  @Post('requests/:id/decline')
  @HttpCode(200)
  async decline(@Auth() auth: AuthContext, @Org() org: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.booking.decline(org.membershipId, id, auth.userId);
    return { data: { id, status: 'DECLINED' } };
  }

  @Post('rides/:id/cancel')
  @HttpCode(200)
  async cancelRide(@Auth() auth: AuthContext, @Org() org: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(cancelSchema)) body: z.infer<typeof cancelSchema>) {
    return { data: await this.booking.cancelRide(org, id, auth.userId, body.reason) };
  }

  // ── helpers ──

  /** Pickup/drop map points for bookings or requests (Prisma cannot read PostGIS columns), plus the ride route if asked. */
  private async points(table: 'bookings' | 'ride_requests', ids: string[], withRoute = false) {
    type P = { id: string; pLat: number; pLng: number; dLat: number; dLng: number; route: string | null };
    if (!ids.length) return new Map<string, { pickup: { lat: number; lng: number }; drop: { lat: number; lng: number }; route: string | null }>();
    const rows =
      table === 'bookings'
        ? await this.prisma.$queryRaw<P[]>`
            SELECT x.id, ST_Y(x.pickup::geometry) AS "pLat", ST_X(x.pickup::geometry) AS "pLng", ST_Y(x."drop"::geometry) AS "dLat", ST_X(x."drop"::geometry) AS "dLng",
              CASE WHEN ${withRoute} THEN ST_AsEncodedPolyline(ST_Simplify(r.route_line::geometry, 0.00003)) END AS route
            FROM bookings x JOIN rides r ON r.id = x.ride_id WHERE x.id = ANY(${ids}::uuid[])`
        : await this.prisma.$queryRaw<P[]>`
            SELECT x.id, ST_Y(x.pickup::geometry) AS "pLat", ST_X(x.pickup::geometry) AS "pLng", ST_Y(x."drop"::geometry) AS "dLat", ST_X(x."drop"::geometry) AS "dLng", NULL::text AS route
            FROM ride_requests x WHERE x.id = ANY(${ids}::uuid[])`;
    return new Map(rows.map((p) => [p.id, { pickup: { lat: p.pLat, lng: p.pLng }, drop: { lat: p.dLat, lng: p.dLng }, route: p.route }]));
  }

  private async names(ids: string[]) {
    const ms = await this.prisma.membership.findMany({ where: { id: { in: [...new Set(ids)] } }, include: { user: { select: { name: true } } } });
    return new Map(ms.map((m) => [m.id, m.user.name]));
  }

  /** Name, department, reliability and rating; never phone or email. */
  private async people(ids: string[]) {
    const unique = [...new Set(ids)];
    const ms = await this.prisma.membership.findMany({ where: { id: { in: unique } }, include: { user: { select: { name: true } }, department: { select: { name: true } } } });
    const ratings = await this.prisma.rating.groupBy({ by: ['rateeMembershipId'], where: { rateeMembershipId: { in: unique } }, _avg: { stars: true }, _count: true });
    const r = new Map(ratings.map((x) => [x.rateeMembershipId, x]));
    return new Map(
      ms.map((m) => [m.id, { name: m.user.name, department: m.department?.name ?? null, reliability: Number(m.reliabilityScore), rating: (r.get(m.id)?._count ?? 0) >= 3 ? r.get(m.id)!._avg.stars : null }]),
    );
  }
}