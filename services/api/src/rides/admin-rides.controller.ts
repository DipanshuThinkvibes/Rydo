import { Controller, Get, Query } from '@nestjs/common';
import { adminRidesQuerySchema } from '@rydo/shared';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { ZodPipe } from '../common/zod.pipe';
import { Org, type OrgContext } from '../common/request-context';
import { OrgScoped } from '../tenancy/decorators';

/** Ops view of the company's rides for one day (company time zone): routes for the map, riders and waiting requests. One query. */
@Controller('admin/rides')
@OrgScoped('ORG_ADMIN', 'OPS_ADMIN', 'HR_ADMIN')
export class AdminRidesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Org() org: OrgContext, @Query(new ZodPipe(adminRidesQuerySchema)) q: z.infer<typeof adminRidesQuerySchema>) {
    const rows = await this.prisma.$queryRaw<object[]>`
      SELECT r.id, r.direction, r.status, r.depart_at AS "departAt", r.origin_label AS "originLabel", r.destination_label AS "destinationLabel",
        r.seats_total AS "seatsTotal", r.seats_booked AS "seatsBooked", r.women_only AS "womenOnly",
        r.distance_meters AS "distanceMeters", r.duration_seconds AS "durationSeconds",
        u.name AS "driverName", v.plate_number AS "plateNumber", v.make || ' ' || v.model AS vehicle,
        ST_AsEncodedPolyline(ST_Simplify(r.route_line::geometry, 0.0001)) AS route,
        (SELECT count(*)::int FROM ride_requests q WHERE q.ride_id = r.id AND q.status = 'PENDING' AND q.expires_at > now()) AS "pendingRequests",
        (SELECT COALESCE(json_agg(json_build_object('name', ru.name, 'pickupLabel', b.pickup_label, 'status', b.status, 'seats', b.seats,
            'lat', ST_Y(b.pickup::geometry), 'lng', ST_X(b.pickup::geometry)) ORDER BY b.created_at), '[]'::json)
          FROM bookings b JOIN memberships rm ON rm.id = b.rider_membership_id JOIN users ru ON ru.id = rm.user_id
          WHERE b.ride_id = r.id AND b.status IN ('CONFIRMED', 'BOARDED', 'COMPLETED', 'NO_SHOW')) AS riders
      FROM rides r
      JOIN organizations o ON o.id = r.organization_id
      JOIN memberships m ON m.id = r.driver_membership_id
      JOIN users u ON u.id = m.user_id
      JOIN vehicles v ON v.id = r.vehicle_id
      WHERE r.organization_id = ${org.organizationId}::uuid
        AND (r.depart_at AT TIME ZONE o.timezone)::date = ${q.date}::date
        AND (${q.status ?? null}::text IS NULL OR r.status::text = ${q.status ?? null}::text)
      ORDER BY r.depart_at
      LIMIT 500`;
    return { data: rows };
  }
}