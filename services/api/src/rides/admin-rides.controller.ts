import { Controller, Get, Query } from '@nestjs/common';
import { adminRidesQuerySchema } from '@rydo/shared';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { ZodPipe } from '../common/zod.pipe';
import { Org, type OrgContext } from '../common/request-context';
import { OrgScoped } from '../tenancy/decorators';

/** Ops view of the company's rides for one day (company time zone). */
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
        u.name AS "driverName", v.plate_number AS "plateNumber", v.make || ' ' || v.model AS vehicle
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