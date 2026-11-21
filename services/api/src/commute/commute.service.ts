import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import type { CommuteDayView, CommuteUpdate, LatLng, LegState, Place } from '@rydo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/app-error';
import { MatchingService } from '../rides/matching.service';
import { BookingService } from '../rides/booking.service';
import { WaitlistService } from './waitlist.service';

type Org = { organizationId: string; membershipId: string };
type Leg = 'TO_OFFICE' | 'TO_HOME';
const hm = (d: Date | null) => (d ? d.toISOString().slice(11, 16) : null);
const shift = (t: string, min: number) => {
  const [h, m] = t.split(':').map(Number);
  const x = Math.max(0, Math.min(23 * 60 + 59, h * 60 + m + min));
  return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
};

/**
 * Commute planner: say once which days you go to the office and when; RYDO finds rides for the week,
 * asks drivers for you, and puts you on the waitlist when nothing fits yet.
 */
@Injectable()
export class CommuteService {
  private readonly log = new Logger('Commute');

  constructor(
    private readonly prisma: PrismaService,
    private readonly matching: MatchingService,
    private readonly waitlist: WaitlistService,
    @Inject(forwardRef(() => BookingService)) private readonly booking: BookingService,
  ) {}

  // ── home ──

  async home(membershipId: string): Promise<Place | null> {
    const [h] = await this.prisma.$queryRaw<Place[]>`
      SELECT name AS label, ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng FROM saved_places
      WHERE membership_id = ${membershipId}::uuid AND label = 'HOME' ORDER BY is_default DESC, created_at DESC LIMIT 1`;
    return h ?? null;
  }

  /** Sets the default home: updates it in place, or saves a new default home (other saved homes stay). */
  async setHome(org: Org, p: Place) {
    const n = await this.prisma.$executeRaw`
      UPDATE saved_places SET name = ${p.label}, address = ${p.label}, location = ST_SetSRID(ST_MakePoint(${p.lng}, ${p.lat}), 4326)::geography
      WHERE membership_id = ${org.membershipId}::uuid AND label = 'HOME' AND is_default`;
    if (n === 0) {
      await this.prisma.$executeRaw`
        INSERT INTO saved_places (id, membership_id, label, name, address, location, is_default, created_at)
        VALUES (gen_random_uuid(), ${org.membershipId}::uuid, 'HOME', ${p.label}, ${p.label}, ST_SetSRID(ST_MakePoint(${p.lng}, ${p.lat}), 4326)::geography, true, now())`;
    }
    return this.home(org.membershipId);
  }

  /** The person's default saved office, else the company's default office. */
  private async office(org: Org): Promise<Place | null> {
    const [mine] = await this.prisma.$queryRaw<Place[]>`
      SELECT name AS label, ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng FROM saved_places
      WHERE membership_id = ${org.membershipId}::uuid AND label = 'OFFICE' ORDER BY is_default DESC, created_at DESC LIMIT 1`;
    if (mine) return mine;
    const [o] = await this.prisma.$queryRaw<Place[]>`
      SELECT name AS label, ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng FROM offices
      WHERE organization_id = ${org.organizationId}::uuid ORDER BY is_default DESC, name LIMIT 1`;
    return o ?? null;
  }

  // ── the week ──

  private async days(organizationId: string, count: number) {
    return (await this.prisma.$queryRaw<{ d: string }[]>`
      SELECT to_char(d::date, 'YYYY-MM-DD') AS d FROM organizations o,
        generate_series((now() AT TIME ZONE o.timezone)::date, (now() AT TIME ZONE o.timezone)::date + ${count - 1}::int, interval '1 day') d
      WHERE o.id = ${organizationId}::uuid ORDER BY d`).map((r) => r.d);
  }

  async week(org: Org, count = 14): Promise<CommuteDayView[]> {
    const dates = await this.days(org.organizationId, count);
    const [rows, legs, waits] = await Promise.all([
      this.prisma.commuteDay.findMany({ where: { membershipId: org.membershipId, date: { gte: new Date(`${dates[0]}T00:00:00Z`), lte: new Date(`${dates[dates.length - 1]}T00:00:00Z`) } } }),
      this.prisma.$queryRaw<{ day: string; direction: Leg; state: 'BOOKED' | 'REQUESTED'; rideId: string; driverName: string; departAt: Date }[]>`
        SELECT * FROM (
          SELECT to_char(r.depart_at AT TIME ZONE o.timezone, 'YYYY-MM-DD') AS day, r.direction::text AS direction, 'BOOKED' AS state, r.id AS "rideId", u.name AS "driverName", r.depart_at AS "departAt"
          FROM bookings b JOIN rides r ON r.id = b.ride_id JOIN organizations o ON o.id = r.organization_id
          JOIN memberships m ON m.id = r.driver_membership_id JOIN users u ON u.id = m.user_id
          WHERE b.rider_membership_id = ${org.membershipId}::uuid AND b.status IN ('CONFIRMED', 'BOARDED', 'COMPLETED')
          UNION ALL
          SELECT to_char(r.depart_at AT TIME ZONE o.timezone, 'YYYY-MM-DD'), r.direction::text, 'REQUESTED', r.id, u.name, r.depart_at
          FROM ride_requests q JOIN rides r ON r.id = q.ride_id JOIN organizations o ON o.id = r.organization_id
          JOIN memberships m ON m.id = r.driver_membership_id JOIN users u ON u.id = m.user_id
          WHERE q.rider_membership_id = ${org.membershipId}::uuid AND q.status = 'PENDING' AND q.expires_at > now()
        ) x WHERE x.day = ANY(${dates}::text[])`,
      this.prisma.waitlistEntry.findMany({ where: { riderMembershipId: org.membershipId, status: 'WAITING', expiresAt: { gt: new Date() } } }),
    ]);
    const byDate = new Map(rows.map((r) => [r.date.toISOString().slice(0, 10), r]));
    const leg = (date: string, dir: Leg): LegState => {
      const l = legs.find((x) => x.day === date && x.direction === dir && x.state === 'BOOKED') ?? legs.find((x) => x.day === date && x.direction === dir);
      if (l) return { state: l.state, rideId: l.rideId, driverName: l.driverName, departAt: l.departAt.toISOString() };
      const w = waits.find((x) => {
        const c = x.criteria as { date?: string; leg?: Leg };
        return c.date === date && c.leg === dir;
      });
      return w ? { state: 'WAITLISTED', waitlistId: w.id } : { state: 'NONE' };
    };
    return dates.map((date) => {
      const r = byDate.get(date);
      return {
        date,
        planned: !!r,
        status: r?.status ?? null,
        toOfficeTime: hm(r?.toOfficeTime ?? null),
        toHomeTime: hm(r?.toHomeTime ?? null),
        autoBook: r?.autoBook ?? true,
        toOffice: leg(date, 'TO_OFFICE'),
        toHome: leg(date, 'TO_HOME'),
      };
    });
  }

  async update(org: Org, b: CommuteUpdate) {
    const t = (v: string | null | undefined) => (v ? new Date(`1970-01-01T${v}:00Z`) : null);
    await this.prisma.$transaction(
      b.days.map((d) =>
        this.prisma.commuteDay.upsert({
          where: { membershipId_date: { membershipId: org.membershipId, date: new Date(`${d.date}T00:00:00Z`) } },
          update: { status: d.status, toOfficeTime: d.status === 'OFFICE' ? t(d.toOfficeTime) : null, toHomeTime: d.status === 'OFFICE' ? t(d.toHomeTime) : null, autoBook: d.autoBook },
          create: { organizationId: org.organizationId, membershipId: org.membershipId, date: new Date(`${d.date}T00:00:00Z`), status: d.status, toOfficeTime: d.status === 'OFFICE' ? t(d.toOfficeTime) : null, toHomeTime: d.status === 'OFFICE' ? t(d.toHomeTime) : null, autoBook: d.autoBook },
        }),
      ),
    );
    return this.week(org);
  }

  /** Finds rides for every office day in the next `horizon` days that has no ride yet. */
  async plan(org: Org, horizon = 7) {
    const [home, office] = await Promise.all([this.home(org.membershipId), this.office(org)]);
    if (!home) throw new AppError('CONFLICT', 'Set your home first, so RYDO knows where to pick you up.', 409);
    if (!office) throw new AppError('CONFLICT', 'Your company has no office on RYDO yet. Ask your admin to add one.', 409);
    const week = await this.week(org, horizon);
    const [tz] = await this.prisma.$queryRaw<{ tz: string }[]>`SELECT timezone AS tz FROM organizations WHERE id = ${org.organizationId}::uuid`;
    const result = { requested: 0, booked: 0, waitlisted: 0, alreadySet: 0 };
    for (const d of week) {
      if (d.status !== 'OFFICE' || !d.autoBook) continue;
      const legs: [Leg, string | null, LegState, Place, Place, number, number][] = [
        ['TO_OFFICE', d.toOfficeTime, d.toOffice, home, office, -30, 30],
        ['TO_HOME', d.toHomeTime, d.toHome, office, home, -15, 45],
      ];
      for (const [legName, time, state, from, to, before, after] of legs) {
        if (!time) continue;
        if (state.state !== 'NONE') {
          result.alreadySet++;
          continue;
        }
        const [{ past }] = await this.prisma.$queryRaw<{ past: boolean }[]>`SELECT ((${d.date}::date + ${shift(time, after)}::time) AT TIME ZONE ${tz.tz}) < now() + interval '10 minutes' AS past`;
        if (past) continue;
        const search = { pickup: from, drop: to, date: d.date, fromTime: shift(time, before), toTime: shift(time, after), seats: 1, womenOnly: false };
        try {
          const best = (await this.matching.search(org, search)).find((m) => !m.alreadyRequested);
          if (best) {
            const r = await this.booking.request(org, best.rideId, { pickup: from, drop: to, seats: 1, autoRematch: true });
            if (r.status === 'ACCEPTED') result.booked++;
            else result.requested++;
          } else {
            const w = await this.waitlist.create(org, { ...search, vehicleType: undefined, autoRequest: true, leg: legName });
            if (w.status === 'MATCHED') result.requested++;
            else result.waitlisted++;
          }
        } catch (e) {
          this.log.warn(`plan ${d.date} ${legName}: ${(e as Error).message}`);
        }
      }
    }
    return result;
  }

  /** Nightly: plan the next two days for everyone who switched auto-book on. */
  async planAll(horizon = 2) {
    const people = await this.prisma.commuteDay.findMany({
      where: { status: 'OFFICE', autoBook: true, date: { gte: new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z') } },
      distinct: ['membershipId'],
      select: { membershipId: true, organizationId: true },
    });
    let n = 0;
    for (const p of people) {
      const r = await this.plan({ organizationId: p.organizationId, membershipId: p.membershipId }, horizon).catch(() => null);
      if (r) n += r.requested + r.booked + r.waitlisted;
    }
    return n;
  }

  // ── preferred drivers ──

  async preferred(org: Org) {
    return this.prisma.$queryRaw<object[]>`
      SELECT pd.driver_membership_id AS "membershipId", u.name,
        (SELECT round(avg(stars)::numeric, 1)::float FROM ratings g WHERE g.ratee_membership_id = pd.driver_membership_id HAVING count(*) >= 3) AS rating,
        (SELECT count(*)::int FROM bookings b JOIN rides r ON r.id = b.ride_id WHERE b.rider_membership_id = ${org.membershipId}::uuid AND r.driver_membership_id = pd.driver_membership_id AND b.status = 'COMPLETED') AS "ridesTogether",
        (p.status = 'VERIFIED' AND m.status = 'ACTIVE') AS available
      FROM preferred_drivers pd JOIN memberships m ON m.id = pd.driver_membership_id JOIN users u ON u.id = m.user_id
      LEFT JOIN driver_profiles p ON p.membership_id = m.id
      WHERE pd.rider_membership_id = ${org.membershipId}::uuid AND m.organization_id = ${org.organizationId}::uuid
      ORDER BY pd.created_at DESC`;
  }

  async addPreferred(org: Org, driverMembershipId: string) {
    if (driverMembershipId === org.membershipId) throw new AppError('CONFLICT', "You can't add yourself.", 409);
    const [m, p] = await Promise.all([
      this.prisma.membership.findFirst({ where: { id: driverMembershipId, organizationId: org.organizationId, status: 'ACTIVE' }, select: { id: true } }),
      this.prisma.driverProfile.findUnique({ where: { membershipId: driverMembershipId }, select: { status: true } }),
    ]);
    if (!m || p?.status !== 'VERIFIED') throw new AppError('NOT_FOUND', 'Driver not found.', 404);
    await this.prisma.preferredDriver.upsert({ where: { riderMembershipId_driverMembershipId: { riderMembershipId: org.membershipId, driverMembershipId } }, update: {}, create: { riderMembershipId: org.membershipId, driverMembershipId } });
    return this.preferred(org);
  }

  async removePreferred(org: Org, driverMembershipId: string) {
    await this.prisma.preferredDriver.deleteMany({ where: { riderMembershipId: org.membershipId, driverMembershipId } });
    return this.preferred(org);
  }
}

export type { LatLng };
