import { Inject, Injectable, Logger } from '@nestjs/common';
import { RIDE_DAYS_AHEAD, type LatLng } from '@rydo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { MAPS_ADAPTER, MapsAdapter, RouteResult } from '../adapters/maps.adapter';

interface PlanRow {
  id: string;
  organizationId: string;
  driverMembershipId: string;
  vehicleId: string;
  originLabel: string;
  oLat: number;
  oLng: number;
  destinationLabel: string;
  dLat: number;
  dLng: number;
  departTime: string;
  returnTime: string | null;
  daysOfWeek: number[];
  oneOffDate: string | null;
  seats: number;
  womenOnly: boolean;
  timezone: string;
}

const wkt = (path: LatLng[]) => `SRID=4326;LINESTRING(${path.map((p) => `${p.lng} ${p.lat}`).join(', ')})`;

/** Local calendar dates (YYYY-MM-DD) in a time zone, starting today. */
function localDates(tz: string, days: number) {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  return Array.from({ length: days }, (_, i) => fmt.format(new Date(Date.now() + i * 86_400_000)));
}
/** ISO weekday 1 = Monday … 7 = Sunday for a YYYY-MM-DD date. */
const isoWeekday = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
};

/**
 * Turns ride plans into dated rides for the next 14 days (outbound + optional return).
 * Safe to run any number of times: (ride_plan_id, depart_at) is unique.
 */
@Injectable()
export class RideGeneratorService {
  private readonly log = new Logger('RideGenerator');

  constructor(
    private readonly prisma: PrismaService,
    @Inject(MAPS_ADAPTER) private readonly maps: MapsAdapter,
  ) {}

  private async plans(where: { planId?: string }) {
    return this.prisma.$queryRaw<PlanRow[]>`
      SELECT p.id, p.organization_id AS "organizationId", p.driver_membership_id AS "driverMembershipId", p.vehicle_id AS "vehicleId",
        p.origin_label AS "originLabel", ST_Y(p.origin::geometry) AS "oLat", ST_X(p.origin::geometry) AS "oLng",
        p.destination_label AS "destinationLabel", ST_Y(p.destination::geometry) AS "dLat", ST_X(p.destination::geometry) AS "dLng",
        to_char(p.depart_time, 'HH24:MI') AS "departTime", to_char(p.return_time, 'HH24:MI') AS "returnTime",
        p.days_of_week AS "daysOfWeek", to_char(p.one_off_date, 'YYYY-MM-DD') AS "oneOffDate", p.seats, p.women_only AS "womenOnly", o.timezone
      FROM ride_plans p JOIN organizations o ON o.id = p.organization_id
      WHERE p.active AND o.status = 'ACTIVE' AND (${where.planId ?? null}::uuid IS NULL OR p.id = ${where.planId ?? null}::uuid)`;
  }

  /** TO_OFFICE when the destination is within 1 km of one of the company's offices. */
  private async nearOffice(orgId: string, p: LatLng) {
    const [row] = await this.prisma.$queryRaw<{ near: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM offices WHERE organization_id = ${orgId}::uuid
        AND ST_DWithin(location, ST_SetSRID(ST_MakePoint(${p.lng}, ${p.lat}), 4326)::geography, 1000)) AS near`;
    return row.near;
  }

  async generateForPlan(planId: string) {
    const [plan] = await this.plans({ planId });
    return plan ? this.generate(plan) : 0;
  }

  async generateAll() {
    let created = 0;
    for (const plan of await this.plans({})) {
      try {
        created += await this.generate(plan);
      } catch (e) {
        this.log.error(`Plan ${plan.id}: ${(e as Error).message}`);
      }
    }
    return created;
  }

  private async generate(plan: PlanRow) {
    const origin = { lat: plan.oLat, lng: plan.oLng };
    const destination = { lat: plan.dLat, lng: plan.dLng };
    const dates = localDates(plan.timezone, RIDE_DAYS_AHEAD).filter((d) => (plan.oneOffDate ? d === plan.oneOffDate : plan.daysOfWeek.includes(isoWeekday(d))));
    if (!dates.length) return 0;

    const toOffice = await this.nearOffice(plan.organizationId, destination);
    const fromOffice = !toOffice && (await this.nearOffice(plan.organizationId, origin));
    const legs: { time: string; from: LatLng; to: LatLng; fromLabel: string; toLabel: string; direction: string; route: RouteResult }[] = [
      { time: plan.departTime, from: origin, to: destination, fromLabel: plan.originLabel, toLabel: plan.destinationLabel, direction: toOffice ? 'TO_OFFICE' : fromOffice ? 'TO_HOME' : 'OTHER', route: await this.maps.route(origin, destination) },
    ];
    if (plan.returnTime) {
      legs.push({ time: plan.returnTime, from: destination, to: origin, fromLabel: plan.destinationLabel, toLabel: plan.originLabel, direction: toOffice ? 'TO_HOME' : fromOffice ? 'TO_OFFICE' : 'OTHER', route: await this.maps.route(destination, origin) });
    }

    let created = 0;
    for (const date of dates) {
      for (const leg of legs) {
        created += await this.prisma.$executeRaw`
          INSERT INTO rides (id, organization_id, ride_plan_id, driver_membership_id, vehicle_id, direction,
            origin_label, origin, destination_label, destination, route_line, distance_meters, duration_seconds,
            depart_at, seats_total, seats_booked, women_only, status, created_at, updated_at)
          SELECT gen_random_uuid(), ${plan.organizationId}::uuid, ${plan.id}::uuid, ${plan.driverMembershipId}::uuid, ${plan.vehicleId}::uuid, ${leg.direction}::"RideDirection",
            ${leg.fromLabel}, ST_SetSRID(ST_MakePoint(${leg.from.lng}, ${leg.from.lat}), 4326)::geography,
            ${leg.toLabel}, ST_SetSRID(ST_MakePoint(${leg.to.lng}, ${leg.to.lat}), 4326)::geography,
            ST_GeogFromText(${wkt(leg.route.path)}), ${leg.route.distanceMeters}, ${leg.route.durationSeconds},
            t.depart_at, ${plan.seats}, 0, ${plan.womenOnly}, 'SCHEDULED'::"RideStatus", now(), now()
          FROM (SELECT ((${date}::date + ${leg.time}::time) AT TIME ZONE ${plan.timezone}) AS depart_at) t
          WHERE t.depart_at > now() + interval '10 minutes'
          ON CONFLICT (ride_plan_id, depart_at) DO NOTHING`;
      }
    }
    return created;
  }
}