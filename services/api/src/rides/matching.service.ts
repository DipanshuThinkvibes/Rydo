import { Injectable } from '@nestjs/common';
import { DEFAULT_ORG_SETTINGS, orgFeatures, type OrgFeatures, type OrgSettings, type RideMatch, type RideSearch } from '@rydo/shared';
import { PrismaService } from '../prisma/prisma.service';

interface Row {
  id: string;
  departAt: Date;
  durationSeconds: number;
  seatsLeft: number;
  womenOnly: boolean;
  originLabel: string;
  destinationLabel: string;
  pickupM: number;
  dropM: number;
  pf: number;
  df: number;
  wantFrom: Date;
  wantTo: Date;
  driverMembershipId: string;
  driverName: string;
  type: 'CAR' | 'BIKE';
  make: string;
  model: string;
  color: string;
  plateNumber: string;
  hasAc: boolean;
  rating: number | null;
  ratingCount: number;
  requestStatus: 'PENDING' | 'ACCEPTED' | null;
  timezone: string;
  route: string | null;
  preferred: boolean;
}

/**
 * Weights from docs/phase-0 (proposed starting point). Return-trip fit (15%) is not used for a one-way
 * search, so its share went to pickup proximity and time fit.
 */
const W = { pickup: 0.3, time: 0.3, drop: 0.15, rating: 0.15, type: 0.1 };
const clamp = (x: number) => Math.max(0, Math.min(1, x));

/** Finds rides whose road route passes near the pickup and then the drop, inside the rider's time window. */
@Injectable()
export class MatchingService {
  constructor(private readonly prisma: PrismaService) {}

  /** The company's ride rules with RYDO's feature switches applied on top (a switched-off feature wins). */
  async settings(organizationId: string): Promise<OrgSettings & { features: OrgFeatures }> {
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
    const features = orgFeatures(org.features);
    const s = { ...DEFAULT_ORG_SETTINGS, ...(org.settings as Partial<OrgSettings>) };
    if (!features.womenOnly) s.womenOnlyEnabled = false;
    if (!features.costShare) s.costPerKmEstimate = null;
    return { ...s, features };
  }

  async search(org: { organizationId: string; membershipId: string }, s: RideSearch, opts: { onlyRideIds?: string[]; excludeRideIds?: string[] } = {}): Promise<RideMatch[]> {
    const settings = await this.settings(org.organizationId);
    const radius = settings.pickupRadiusMeters;
    const me = await this.prisma.membership.findUniqueOrThrow({ where: { id: org.membershipId }, include: { user: { select: { gender: true } } } });
    const female = me.user.gender === 'FEMALE';
    const only = opts.onlyRideIds ?? null;
    const exclude = opts.excludeRideIds ?? [];

    const rows = await this.prisma.$queryRaw<Row[]>`
      WITH q AS (
        SELECT ST_SetSRID(ST_MakePoint(${s.pickup.lng}, ${s.pickup.lat}), 4326)::geography AS p,
               ST_SetSRID(ST_MakePoint(${s.drop.lng}, ${s.drop.lat}), 4326)::geography AS d
      )
      SELECT r.id, r.depart_at AS "departAt", r.duration_seconds AS "durationSeconds", (r.seats_total - r.seats_booked) AS "seatsLeft",
        r.women_only AS "womenOnly", r.origin_label AS "originLabel", r.destination_label AS "destinationLabel",
        ST_Distance(r.route_line, q.p) AS "pickupM", ST_Distance(r.route_line, q.d) AS "dropM",
        ST_LineLocatePoint(r.route_line::geometry, q.p::geometry) AS pf, ST_LineLocatePoint(r.route_line::geometry, q.d::geometry) AS df,
        ((${s.date}::date + ${s.fromTime}::time) AT TIME ZONE o.timezone) AS "wantFrom",
        ((${s.date}::date + ${s.toTime}::time) AT TIME ZONE o.timezone) AS "wantTo",
        m.id AS "driverMembershipId", u.name AS "driverName",
        v.type::text AS type, v.make, v.model, v.color, v.plate_number AS "plateNumber", v.has_ac AS "hasAc",
        (SELECT avg(stars)::float FROM ratings WHERE ratee_membership_id = m.id) AS rating,
        (SELECT count(*)::int FROM ratings WHERE ratee_membership_id = m.id) AS "ratingCount",
        (SELECT x.status::text FROM ride_requests x WHERE x.ride_id = r.id AND x.rider_membership_id = ${org.membershipId}::uuid AND x.status IN ('PENDING', 'ACCEPTED') ORDER BY x.created_at DESC LIMIT 1) AS "requestStatus",
        o.timezone,
        ST_AsEncodedPolyline(ST_Simplify(r.route_line::geometry, 0.00003)) AS route,
        EXISTS (SELECT 1 FROM preferred_drivers pd WHERE pd.rider_membership_id = ${org.membershipId}::uuid AND pd.driver_membership_id = m.id) AS preferred
      FROM rides r
      CROSS JOIN q
      JOIN organizations o ON o.id = r.organization_id
      JOIN memberships m ON m.id = r.driver_membership_id
      JOIN users u ON u.id = m.user_id
      JOIN vehicles v ON v.id = r.vehicle_id
      WHERE r.organization_id = ${org.organizationId}::uuid
        AND r.status = 'SCHEDULED'
        AND r.driver_membership_id <> ${org.membershipId}::uuid
        AND m.status = 'ACTIVE'
        AND r.seats_total - r.seats_booked >= ${s.seats}
        AND r.depart_at > now()
        AND r.depart_at BETWEEN ((${s.date}::date + ${s.fromTime}::time) AT TIME ZONE o.timezone) - interval '60 minutes'
                            AND ((${s.date}::date + ${s.toTime}::time) AT TIME ZONE o.timezone) + interval '30 minutes'
        AND ST_DWithin(r.route_line, q.p, ${radius}) AND ST_DWithin(r.route_line, q.d, ${radius})
        AND ST_LineLocatePoint(r.route_line::geometry, q.p::geometry) < ST_LineLocatePoint(r.route_line::geometry, q.d::geometry)
        AND (${s.vehicleType ?? null}::text IS NULL OR v.type::text = ${s.vehicleType ?? null}::text)
        AND (NOT r.women_only OR ${female})
        AND (NOT ${s.womenOnly} OR r.women_only)
        AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE (b.blocker_id = ${org.membershipId}::uuid AND b.blocked_id = m.id) OR (b.blocker_id = m.id AND b.blocked_id = ${org.membershipId}::uuid))
        AND (${only}::uuid[] IS NULL OR r.id = ANY(${only}::uuid[]))
        AND NOT (r.id = ANY(${exclude}::uuid[]))
      ORDER BY r.depart_at
      LIMIT 50`;

    return rows.map((r) => this.score(r, radius, s)).sort((a, b) => b.score - a.score).slice(0, 20);
  }

  private score(r: Row, radius: number, s: RideSearch): RideMatch {
    const depart = new Date(r.departAt).getTime();
    const pickupEta = new Date(depart + r.pf * r.durationSeconds * 1000);
    const dropEta = new Date(depart + r.df * r.durationSeconds * 1000);
    const from = new Date(r.wantFrom).getTime();
    const to = new Date(r.wantTo).getTime();
    const offMin = pickupEta.getTime() < from ? (from - pickupEta.getTime()) / 60000 : pickupEta.getTime() > to ? (pickupEta.getTime() - to) / 60000 : 0;
    const rating = r.ratingCount >= 3 && r.rating ? r.rating : null;

    const parts = {
      pickup: clamp(1 - r.pickupM / radius),
      time: clamp(1 - offMin / 45),
      drop: clamp(1 - r.dropM / radius),
      rating: rating ? clamp((rating - 1) / 4) : 0.8,
      type: s.vehicleType ? 1 : 0.9,
    };
    // A driver the rider saved as preferred gets +10 (capped at 100), so they come first among similar rides.
    const score = Math.min(100, Math.round(100 * (W.pickup * parts.pickup + W.time * parts.time + W.drop * parts.drop + W.rating * parts.rating + W.type * parts.type)) + (r.preferred ? 10 : 0));

    const time = (d: Date) => new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: r.timezone }).format(d);
    const reasons = [
      r.pickupM < 50 ? 'Passes right by your pickup' : `Pickup ${Math.round(r.pickupM / 10) * 10} m from the route`,
      offMin === 0 ? `Picks you up around ${time(pickupEta)}, in your window` : `Picks you up around ${time(pickupEta)} (${Math.round(offMin)} min ${pickupEta.getTime() < from ? 'early' : 'late'})`,
      r.dropM < 50 ? 'Drops you at your stop' : `Drop ${Math.round(r.dropM / 10) * 10} m from your stop`,
      rating ? `Rated ${rating.toFixed(1)} (${r.ratingCount} rides)` : 'New driver, verified by HR',
    ];
    if (r.womenOnly) reasons.push('Women-only ride');
    if (r.preferred) reasons.unshift('Your preferred driver');

    return {
      rideId: r.id,
      score,
      reasons,
      departAt: new Date(r.departAt).toISOString(),
      pickupEta: pickupEta.toISOString(),
      dropEta: dropEta.toISOString(),
      pickupDistanceMeters: Math.round(r.pickupM),
      dropDistanceMeters: Math.round(r.dropM),
      seatsLeft: r.seatsLeft,
      womenOnly: r.womenOnly,
      alreadyRequested: r.requestStatus !== null,
      requestStatus: r.requestStatus,
      driver: { membershipId: r.driverMembershipId, name: r.driverName, rating, ratingCount: r.ratingCount },
      vehicle: { type: r.type, make: r.make, model: r.model, color: r.color, plateNumber: r.plateNumber, hasAc: r.hasAc },
      from: r.originLabel,
      to: r.destinationLabel,
      route: r.route,
      preferred: r.preferred,
    };
  }
}