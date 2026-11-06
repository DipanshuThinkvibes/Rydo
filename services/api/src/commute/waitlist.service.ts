import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { WaitlistCreate } from '@rydo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/app-error';
import { NotificationsService } from '../notifications/notifications.service';
import { MatchingService } from '../rides/matching.service';
import { BookingService } from '../rides/booking.service';

type Org = { organizationId: string; membershipId: string };
export type WaitCriteria = WaitlistCreate & { leg?: 'TO_OFFICE' | 'TO_HOME' };

/**
 * "Tell me when a seat appears." Checked whenever seats free up (a rider cancels), new rides are published,
 * and every night after rides are generated. First come, first served.
 */
@Injectable()
export class WaitlistService {
  private readonly log = new Logger('Waitlist');

  constructor(
    private readonly prisma: PrismaService,
    private readonly matching: MatchingService,
    private readonly notify: NotificationsService,
    @Inject(forwardRef(() => BookingService)) private readonly booking: BookingService,
  ) {}

  async create(org: Org, b: WaitCriteria) {
    const [row] = await this.prisma.$queryRaw<{ expires: Date }[]>`
      SELECT ((${b.date}::date + ${b.toTime}::time) AT TIME ZONE o.timezone) + interval '30 minutes' AS expires
      FROM organizations o WHERE o.id = ${org.organizationId}::uuid`;
    if (!row || row.expires <= new Date()) throw new AppError('CONFLICT', 'That time has already passed.', 409);
    const same = await this.prisma.waitlistEntry.findFirst({
      where: {
        riderMembershipId: org.membershipId,
        status: 'WAITING',
        AND: [{ criteria: { path: ['date'], equals: b.date } }, { criteria: { path: ['fromTime'], equals: b.fromTime } }, { criteria: { path: ['toTime'], equals: b.toTime } }],
      },
    });
    const entry = same ?? (await this.prisma.waitlistEntry.create({ data: { organizationId: org.organizationId, riderMembershipId: org.membershipId, criteria: b as unknown as Prisma.InputJsonValue, expiresAt: row.expires } }));
    // A matching ride may already exist (e.g. someone just published one).
    await this.check(org.organizationId, { entryIds: [entry.id] });
    return this.prisma.waitlistEntry.findUniqueOrThrow({ where: { id: entry.id } });
  }

  async list(org: Org) {
    await this.prisma.waitlistEntry.updateMany({ where: { riderMembershipId: org.membershipId, status: 'WAITING', expiresAt: { lte: new Date() } }, data: { status: 'EXPIRED' } });
    const rows = await this.prisma.waitlistEntry.findMany({
      where: { riderMembershipId: org.membershipId, createdAt: { gt: new Date(Date.now() - 14 * 86_400_000) } },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    return rows.map((e) => ({ id: e.id, status: e.status, criteria: e.criteria as WaitCriteria, expiresAt: e.expiresAt, notifiedAt: e.notifiedAt, createdAt: e.createdAt }));
  }

  async remove(org: Org, id: string) {
    const r = await this.prisma.waitlistEntry.deleteMany({ where: { id, riderMembershipId: org.membershipId } });
    if (!r.count) throw new AppError('NOT_FOUND', 'Not on the waitlist.', 404);
  }

  /** Try waiting riders against rides with free seats. Returns how many got a seat request or a heads-up. */
  async check(organizationId: string, opts: { date?: string; onlyRideIds?: string[]; entryIds?: string[] } = {}) {
    const entries = await this.prisma.waitlistEntry.findMany({
      where: {
        organizationId,
        status: 'WAITING',
        expiresAt: { gt: new Date() },
        ...(opts.entryIds ? { id: { in: opts.entryIds } } : {}),
        ...(opts.date ? { criteria: { path: ['date'], equals: opts.date } } : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    let done = 0;
    for (const e of entries) {
      const c = e.criteria as WaitCriteria;
      const rider = { organizationId, membershipId: e.riderMembershipId };
      try {
        const matches = await this.matching.search(
          rider,
          { pickup: c.pickup, drop: c.drop, date: c.date, fromTime: c.fromTime, toTime: c.toTime, seats: c.seats, vehicleType: c.vehicleType, womenOnly: c.womenOnly },
          opts.onlyRideIds ? { onlyRideIds: opts.onlyRideIds } : {},
        );
        const best = matches.find((m) => !m.alreadyRequested);
        if (!best) continue;
        if (c.autoRequest) {
          const r = await this.booking.request(rider, best.rideId, { pickup: c.pickup, drop: c.drop, seats: c.seats, autoRematch: true });
          await this.prisma.waitlistEntry.update({ where: { id: e.id }, data: { status: 'MATCHED', notifiedAt: new Date() } });
          await this.notify.notifyMembership(e.riderMembershipId, {
            type: 'WAITLIST_MATCHED',
            title: r.status === 'ACCEPTED' ? `Seat booked with ${best.driver.name}` : `We asked ${best.driver.name} for a seat`,
            body: `A seat opened on a ride leaving ${best.from} that fits your waitlist. ${r.status === 'ACCEPTED' ? 'See it in My trips.' : "You'll hear when they answer."}`,
            data: { rideId: best.rideId },
          });
        } else {
          await this.prisma.waitlistEntry.update({ where: { id: e.id }, data: { status: 'NOTIFIED', notifiedAt: new Date() } });
          await this.notify.notifyMembership(e.riderMembershipId, {
            type: 'WAITLIST_SEAT',
            title: 'A seat opened for you',
            body: `${best.driver.name} has a seat (${best.score}% match). Open Find a ride to request it.`,
            data: { rideId: best.rideId },
          });
        }
        done++;
      } catch (err) {
        this.log.warn(`waitlist ${e.id}: ${(err as Error).message}`);
      }
    }
    return done;
  }

  /** Nightly, after new rides are generated: every company with someone waiting. */
  async checkAll() {
    const orgs = await this.prisma.waitlistEntry.findMany({ where: { status: 'WAITING', expiresAt: { gt: new Date() } }, distinct: ['organizationId'], select: { organizationId: true } });
    let n = 0;
    for (const o of orgs) n += await this.check(o.organizationId);
    return n;
  }
}
