import { Controller, Get, Header, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { auditQuerySchema } from '@rydo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppError } from '../common/app-error';
import { ZodPipe } from '../common/zod.pipe';
import { Auth, Org, type AuthContext, type OrgContext } from '../common/request-context';
import { OrgScoped } from '../tenancy/decorators';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const rangeSchema = z
  .object({ from: day, to: day })
  .refine((r) => r.from <= r.to, { message: 'Start must be before end', path: ['from'] })
  .refine((r) => (new Date(r.to).getTime() - new Date(r.from).getTime()) / 86_400_000 <= 366, { message: 'Pick at most one year', path: ['to'] });
type Range = z.infer<typeof rangeSchema>;

/** Average car: about 120 g CO2 per km. Every seat shared is one car trip not made. */
const CO2_KG_PER_KM = 0.12;

/** CSV cell: quoted, and safe to open in Excel (no formula injection). */
function cell(v: unknown) {
  let s = v == null ? '' : v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
const csv = (head: string[], rows: unknown[][]) => [head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';

/** Company reports and exports for client admins. Dates are the company's own days. */
@Controller('admin')
export class ReportsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditService,
  ) {}

  @Get('reports/summary')
  @OrgScoped('ORG_ADMIN', 'HR_ADMIN', 'OPS_ADMIN')
  async summary(@Org() org: OrgContext, @Query(new ZodPipe(rangeSchema)) r: Range) {
    const id = org.organizationId;
    const [[t], series, drivers, departments] = await Promise.all([
      this.prisma.$queryRaw<Record<string, number>[]>`
        WITH o AS (SELECT timezone AS tz FROM organizations WHERE id = ${id}::uuid),
        rr AS (SELECT r.* FROM rides r, o WHERE r.organization_id = ${id}::uuid AND (r.depart_at AT TIME ZONE o.tz)::date BETWEEN ${r.from}::date AND ${r.to}::date),
        bb AS (SELECT b.*, rr.distance_meters FROM bookings b JOIN rr ON rr.id = b.ride_id)
        SELECT
          (SELECT count(*)::int FROM rr WHERE status <> 'CANCELLED') AS "ridesOffered",
          (SELECT count(*)::int FROM rr WHERE status = 'COMPLETED') AS "ridesCompleted",
          (SELECT count(*)::int FROM rr WHERE status = 'CANCELLED') AS "ridesCancelled",
          (SELECT COALESCE(sum(seats_total), 0)::int FROM rr WHERE status <> 'CANCELLED') AS "seatsOffered",
          (SELECT COALESCE(sum(seats), 0)::int FROM bb WHERE status IN ('CONFIRMED', 'BOARDED', 'COMPLETED', 'NO_SHOW')) AS "seatsBooked",
          (SELECT count(*)::int FROM bb WHERE status = 'COMPLETED') AS "tripsCompleted",
          (SELECT count(*)::int FROM bb WHERE status = 'NO_SHOW') AS "noShows",
          (SELECT count(*)::int FROM bb WHERE status = 'CANCELLED_BY_RIDER') AS "riderCancels",
          (SELECT count(*)::int FROM bb WHERE status = 'CANCELLED_BY_RIDER' AND late_cancel) AS "lateCancels",
          (SELECT count(DISTINCT rider_membership_id)::int FROM bb WHERE status = 'COMPLETED') AS "activeRiders",
          (SELECT count(DISTINCT driver_membership_id)::int FROM rr WHERE status = 'COMPLETED') AS "activeDrivers",
          (SELECT COALESCE(round(sum(distance_meters * seats) / 1000.0), 0)::int FROM bb WHERE status = 'COMPLETED') AS "sharedKm",
          (SELECT count(*)::int FROM sos_events s JOIN rr ON rr.id = s.ride_id) AS "sosRaised"`,
      this.prisma.$queryRaw<{ day: string; rides: number; bookings: number }[]>`
        WITH o AS (SELECT timezone AS tz FROM organizations WHERE id = ${id}::uuid)
        SELECT to_char(d::date, 'YYYY-MM-DD') AS day,
          (SELECT count(*)::int FROM rides r, o WHERE r.organization_id = ${id}::uuid AND r.status <> 'CANCELLED' AND (r.depart_at AT TIME ZONE o.tz)::date = d::date) AS rides,
          (SELECT COALESCE(sum(b.seats), 0)::int FROM bookings b JOIN rides r ON r.id = b.ride_id, o WHERE r.organization_id = ${id}::uuid
             AND b.status IN ('CONFIRMED', 'BOARDED', 'COMPLETED', 'NO_SHOW') AND (r.depart_at AT TIME ZONE o.tz)::date = d::date) AS bookings
        FROM generate_series(${r.from}::date, ${r.to}::date, interval '1 day') d ORDER BY d`,
      this.prisma.$queryRaw<object[]>`
        SELECT u.name, count(DISTINCT r.id)::int AS rides,
          COALESCE(sum(b.seats) FILTER (WHERE b.status = 'COMPLETED'), 0)::int AS riders,
          (SELECT round(avg(stars)::numeric, 1)::float FROM ratings g WHERE g.ratee_membership_id = r.driver_membership_id) AS rating
        FROM rides r
        JOIN organizations o ON o.id = r.organization_id
        JOIN memberships m ON m.id = r.driver_membership_id JOIN users u ON u.id = m.user_id
        LEFT JOIN bookings b ON b.ride_id = r.id
        WHERE r.organization_id = ${id}::uuid AND r.status = 'COMPLETED'
          AND (r.depart_at AT TIME ZONE o.timezone)::date BETWEEN ${r.from}::date AND ${r.to}::date
        GROUP BY u.name, r.driver_membership_id ORDER BY riders DESC, rides DESC LIMIT 10`,
      this.prisma.$queryRaw<object[]>`
        WITH o AS (SELECT timezone AS tz FROM organizations WHERE id = ${id}::uuid)
        SELECT COALESCE(d.name, 'No department') AS department, count(*)::int AS trips, count(DISTINCT b.rider_membership_id)::int AS riders
        FROM bookings b JOIN rides r ON r.id = b.ride_id JOIN memberships m ON m.id = b.rider_membership_id
        LEFT JOIN departments d ON d.id = m.department_id, o
        WHERE r.organization_id = ${id}::uuid AND b.status = 'COMPLETED' AND (r.depart_at AT TIME ZONE o.tz)::date BETWEEN ${r.from}::date AND ${r.to}::date
        GROUP BY 1 ORDER BY trips DESC LIMIT 20`,
    ]);
    return { data: { range: r, totals: { ...t, co2SavedKg: Math.round((t.sharedKm ?? 0) * CO2_KG_PER_KM) }, series, drivers, departments } };
  }

  @Get('reports/rides.csv')
  @OrgScoped('ORG_ADMIN', 'HR_ADMIN', 'OPS_ADMIN')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async ridesCsv(@Auth() auth: AuthContext, @Org() org: OrgContext, @Query(new ZodPipe(rangeSchema)) r: Range, @Res({ passthrough: true }) res: Response) {
    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT to_char(r.depart_at AT TIME ZONE o.timezone, 'YYYY-MM-DD HH24:MI') AS depart, r.status::text AS status, r.direction::text AS direction,
        r.origin_label AS "from", r.destination_label AS "to", u.name AS driver, v.plate_number AS plate,
        r.seats_total AS seats, r.seats_booked AS booked, round(COALESCE(r.distance_meters, 0) / 1000.0, 1)::float AS km, r.cancel_reason AS "cancelReason"
      FROM rides r JOIN organizations o ON o.id = r.organization_id JOIN memberships m ON m.id = r.driver_membership_id JOIN users u ON u.id = m.user_id JOIN vehicles v ON v.id = r.vehicle_id
      WHERE r.organization_id = ${org.organizationId}::uuid AND (r.depart_at AT TIME ZONE o.timezone)::date BETWEEN ${r.from}::date AND ${r.to}::date
      ORDER BY r.depart_at LIMIT 50000`;
    return this.export(auth, org, res, `rides-${r.from}-to-${r.to}.csv`, ['Departure', 'Status', 'Direction', 'From', 'To', 'Driver', 'Plate', 'Seats', 'Booked', 'Km', 'Cancel reason'], rows);
  }

  @Get('reports/bookings.csv')
  @OrgScoped('ORG_ADMIN', 'HR_ADMIN', 'OPS_ADMIN')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async bookingsCsv(@Auth() auth: AuthContext, @Org() org: OrgContext, @Query(new ZodPipe(rangeSchema)) r: Range, @Res({ passthrough: true }) res: Response) {
    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT to_char(rd.depart_at AT TIME ZONE o.timezone, 'YYYY-MM-DD HH24:MI') AS depart, ru.name AS rider, COALESCE(dp.name, '') AS department,
        du.name AS driver, b.pickup_label AS pickup, b.drop_label AS "drop", b.seats, b.status::text AS status, b.late_cancel AS "lateCancel",
        b.cost_share_est::float AS "costShare", to_char(b.boarded_at AT TIME ZONE o.timezone, 'HH24:MI') AS boarded
      FROM bookings b JOIN rides rd ON rd.id = b.ride_id JOIN organizations o ON o.id = rd.organization_id
      JOIN memberships rm ON rm.id = b.rider_membership_id JOIN users ru ON ru.id = rm.user_id LEFT JOIN departments dp ON dp.id = rm.department_id
      JOIN memberships dm ON dm.id = rd.driver_membership_id JOIN users du ON du.id = dm.user_id
      WHERE rd.organization_id = ${org.organizationId}::uuid AND (rd.depart_at AT TIME ZONE o.timezone)::date BETWEEN ${r.from}::date AND ${r.to}::date
      ORDER BY rd.depart_at LIMIT 50000`;
    return this.export(auth, org, res, `bookings-${r.from}-to-${r.to}.csv`, ['Departure', 'Rider', 'Department', 'Driver', 'Pickup', 'Drop', 'Seats', 'Status', 'Late cancel', 'Cost share (₹)', 'Boarded at'], rows);
  }

  /** Contains work emails: Org and HR admins only. */
  @Get('reports/employees.csv')
  @OrgScoped('ORG_ADMIN', 'HR_ADMIN')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async employeesCsv(@Auth() auth: AuthContext, @Org() org: OrgContext, @Res({ passthrough: true }) res: Response) {
    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT u.name, u.email, COALESCE(d.name, '') AS department, m.status::text AS status,
        (SELECT string_agg(role::text, ' ' ORDER BY role) FROM membership_roles x WHERE x.membership_id = m.id) AS roles,
        round(m.reliability_score)::int AS reliability, COALESCE(p.status::text, '') AS driver,
        to_char(m.created_at, 'YYYY-MM-DD') AS joined
      FROM memberships m JOIN users u ON u.id = m.user_id LEFT JOIN departments d ON d.id = m.department_id LEFT JOIN driver_profiles p ON p.membership_id = m.id
      WHERE m.organization_id = ${org.organizationId}::uuid ORDER BY u.name LIMIT 100000`;
    return this.export(auth, org, res, 'employees.csv', ['Name', 'Email', 'Department', 'Status', 'Roles', 'Reliability', 'Driver status', 'Joined'], rows);
  }

  /** The company's own activity log. */
  @Get('audit')
  @OrgScoped('ORG_ADMIN', 'HR_ADMIN')
  async audit(@Org() org: OrgContext, @Query(new ZodPipe(auditQuerySchema)) q: z.infer<typeof auditQuerySchema>) {
    const where: Prisma.AuditLogWhereInput = {
      organizationId: org.organizationId,
      ...(q.action ? { action: q.action } : {}),
      ...(q.before ? { id: { lt: BigInt(q.before) } } : {}),
    };
    const rows = await this.prisma.auditLog.findMany({ where, orderBy: { id: 'desc' }, take: q.limit + 1 });
    const page = rows.slice(0, q.limit);
    const [users, rydo] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: [...new Set(page.map((r) => r.actorUserId).filter((x): x is string => !!x))] } }, select: { id: true, name: true, email: true } }),
      this.prisma.platformAdmin.findMany({ select: { userId: true } }),
    ]);
    const u = new Map(users.map((x) => [x.id, x]));
    const staff = new Set(rydo.map((x) => x.userId));
    return {
      data: page.map((r) => ({
        id: r.id.toString(),
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        before: r.before,
        after: r.after,
        createdAt: r.createdAt,
        organization: null,
        // RYDO staff show as "RYDO team" to clients, never by personal email.
        actor: r.actorUserId ? (staff.has(r.actorUserId) ? { name: 'RYDO team', email: null } : { name: u.get(r.actorUserId)?.name ?? null, email: u.get(r.actorUserId)?.email ?? null }) : null,
      })),
      meta: { next: rows.length > q.limit ? page[page.length - 1].id.toString() : null },
    };
  }

  private async export(auth: AuthContext, org: OrgContext, res: Response, name: string, head: string[], rows: Record<string, unknown>[]) {
    if (org.support) throw new AppError('SUPPORT_READ_ONLY', 'Exports are not available in support view.', 403);
    await this.auditLog.log({ organizationId: org.organizationId, actorUserId: auth.userId, action: 'REPORT_EXPORTED', entityType: 'report', entityId: name, after: { rows: rows.length } });
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    // BOM so Excel opens the ₹ sign and Indian names correctly.
    return '﻿' + csv(head, rows.map((r) => Object.values(r)));
  }
}
