import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformAdmin } from '../tenancy/decorators';

/** Average car: about 120 g CO2 and 8 litres of fuel per 100 km. Every shared seat is one car trip not made. */
const CO2_KG_PER_KM = 0.12;
const FUEL_L_PER_KM = 0.08;
const DAYS = 30;

/** The owner's carpool scoreboard: how much sharing is happening across all clients, and where it is not. Numbers only. */
@Controller('admin/platform')
@PlatformAdmin()
export class PlatformImpactController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('impact')
  async impact() {
    const [[t], weeks, clients, inquiries] = await Promise.all([
      this.prisma.$queryRaw<Record<string, number>[]>`
        WITH recent AS (
          SELECT b.*, r.distance_meters, r.driver_membership_id
          FROM bookings b JOIN rides r ON r.id = b.ride_id
          WHERE b.status = 'COMPLETED' AND r.depart_at >= now() - make_interval(days => ${DAYS}::int))
        SELECT
          (SELECT count(*)::int FROM recent) AS "sharedTrips",
          (SELECT count(DISTINCT ride_id)::int FROM recent) AS "ridesShared",
          (SELECT COALESCE(round(sum(distance_meters * seats) / 1000.0), 0)::int FROM recent) AS "sharedKm",
          (SELECT count(DISTINCT p)::int FROM (SELECT rider_membership_id AS p FROM recent UNION SELECT driver_membership_id FROM recent) x) AS "activePeople",
          (SELECT count(*)::int FROM memberships m JOIN organizations o ON o.id = m.organization_id WHERE m.status = 'ACTIVE' AND o.status = 'ACTIVE') AS "members",
          (SELECT count(*)::int FROM organizations WHERE status = 'ACTIVE') AS "clients"`,
      this.prisma.$queryRaw<{ week: string; trips: number }[]>`
        SELECT to_char(w, 'DD Mon') AS week,
          (SELECT count(*)::int FROM bookings b JOIN rides r ON r.id = b.ride_id
            WHERE b.status = 'COMPLETED' AND r.depart_at >= w AND r.depart_at < w + interval '7 days') AS trips
        FROM generate_series(date_trunc('week', now()) - interval '7 weeks', date_trunc('week', now()), interval '1 week') w ORDER BY w`,
      this.prisma.$queryRaw<{ id: string; name: string; members: number; activePeople: number; sharedTrips: number; sharedKm: number }[]>`
        SELECT o.id, o.name,
          (SELECT count(*)::int FROM memberships m WHERE m.organization_id = o.id AND m.status = 'ACTIVE') AS members,
          (SELECT count(DISTINCT p)::int FROM (
              SELECT b.rider_membership_id AS p FROM bookings b JOIN rides r ON r.id = b.ride_id WHERE r.organization_id = o.id AND b.status = 'COMPLETED' AND r.depart_at >= now() - make_interval(days => ${DAYS}::int)
              UNION SELECT r.driver_membership_id FROM bookings b JOIN rides r ON r.id = b.ride_id WHERE r.organization_id = o.id AND b.status = 'COMPLETED' AND r.depart_at >= now() - make_interval(days => ${DAYS}::int)) x) AS "activePeople",
          (SELECT count(*)::int FROM bookings b JOIN rides r ON r.id = b.ride_id WHERE r.organization_id = o.id AND b.status = 'COMPLETED' AND r.depart_at >= now() - make_interval(days => ${DAYS}::int)) AS "sharedTrips",
          (SELECT COALESCE(round(sum(r.distance_meters * b.seats) / 1000.0), 0)::int FROM bookings b JOIN rides r ON r.id = b.ride_id WHERE r.organization_id = o.id AND b.status = 'COMPLETED' AND r.depart_at >= now() - make_interval(days => ${DAYS}::int)) AS "sharedKm"
        FROM organizations o WHERE o.status = 'ACTIVE' ORDER BY o.name`,
      this.prisma.onboardingInquiry.count({ where: { status: 'NEW' } }),
    ]);

    const adoption = (active: number, members: number) => (members ? Math.round((active / members) * 100) : 0);
    const rows = clients.map((c) => ({ ...c, adoptionPct: adoption(c.activePeople, c.members), co2SavedKg: Math.round(c.sharedKm * CO2_KG_PER_KM) }));
    return {
      data: {
        days: DAYS,
        sharedTrips: t.sharedTrips,
        ridesShared: t.ridesShared,
        sharedKm: t.sharedKm,
        co2SavedKg: Math.round(t.sharedKm * CO2_KG_PER_KM),
        fuelSavedLitres: Math.round(t.sharedKm * FUEL_L_PER_KM),
        adoptionPct: adoption(t.activePeople, t.members),
        activePeople: t.activePeople,
        members: t.members,
        clients: t.clients,
        weeks,
        topClients: [...rows].sort((a, b) => b.sharedTrips - a.sharedTrips || b.adoptionPct - a.adoptionPct).slice(0, 5),
        /** Clients with people on RYDO but no shared trip in the period: they need a nudge from RYDO. */
        quietClients: rows.filter((c) => c.members > 0 && c.sharedTrips === 0).map((c) => ({ id: c.id, name: c.name, members: c.members })),
        newInquiries: inquiries,
      },
    };
  }
}
