import { Inject, Injectable } from '@nestjs/common';
import { CHAT_EVENT, CHAT_READ_EVENT, chatRoom, type ChatHistoryQuery, type ChatMessageInput } from '@rydo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AppError } from '../common/app-error';
import type { OrgContext } from '../common/request-context';
import { REALTIME, type RealtimePublisher } from '../tracking/realtime.gateway';
import { TripAccessService } from '../tracking/trip-access.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const THREAD_BOOKINGS = ['CONFIRMED', 'BOARDED', 'NO_SHOW', 'COMPLETED'] as const;

/** Chat between a ride's driver and one confirmed rider. Opens when the seat is confirmed; read-only once the ride is over. */
@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TripAccessService,
    private readonly notify: NotificationsService,
    @Inject(REALTIME) private readonly realtime: RealtimePublisher,
  ) {}

  /** The rider id in the URL may be "me" for a rider opening their own thread. */
  private async thread(org: OrgContext, rideId: string, riderParam: string) {
    if (riderParam !== 'me' && !UUID.test(riderParam)) throw new AppError('VALIDATION_ERROR', 'Bad rider id.', 400, { riderId: 'Use a rider id or "me"' });
    const t = await this.access.chatThread(org, rideId, riderParam === 'me' ? org.membershipId : riderParam);
    if (!t) throw new AppError('NOT_FOUND', 'There is no chat here. Chat opens once a seat is confirmed, between the driver and that rider only.', 404);
    return t;
  }

  /** Who I can talk to on this ride, with the last message and unread count. */
  async threads(org: OrgContext, rideId: string) {
    const ride = await this.prisma.ride.findFirst({ where: { id: rideId, organizationId: org.organizationId }, select: { driverMembershipId: true, status: true } });
    if (!ride) throw new AppError('NOT_FOUND', 'Ride not found.', 404);
    const isDriver = ride.driverMembershipId === org.membershipId;
    const bookings = await this.prisma.booking.findMany({
      where: { rideId, status: { in: [...THREAD_BOOKINGS] }, ...(isDriver ? {} : { riderMembershipId: org.membershipId }) },
      select: { riderMembershipId: true, status: true },
    });
    if (!isDriver && !bookings.length) throw new AppError('NOT_FOUND', 'There is no chat here. Chat opens once a seat is confirmed.', 404);
    const riderIds = [...new Set(bookings.map((b) => b.riderMembershipId))];
    const otherIds = isDriver ? riderIds : [ride.driverMembershipId];
    const [people, stats, blocks] = await Promise.all([
      this.prisma.membership.findMany({ where: { id: { in: otherIds } }, select: { id: true, user: { select: { name: true } } } }),
      this.prisma.$queryRaw<{ riderMembershipId: string; unread: number; lastBody: string; lastAt: Date }[]>`
        SELECT m.rider_membership_id AS "riderMembershipId",
          count(*) FILTER (WHERE m.sender_membership_id <> ${org.membershipId}::uuid AND m.read_at IS NULL)::int AS unread,
          (array_agg(m.body ORDER BY m.created_at DESC))[1] AS "lastBody", max(m.created_at) AS "lastAt"
        FROM messages m
        WHERE m.ride_id = ${rideId}::uuid AND m.rider_membership_id = ANY(${riderIds}::uuid[])
        GROUP BY m.rider_membership_id`,
      this.prisma.userBlock.findMany({
        where: { OR: [{ blockerId: ride.driverMembershipId, blockedId: { in: riderIds } }, { blockedId: ride.driverMembershipId, blockerId: { in: riderIds } }] },
        select: { blockerId: true, blockedId: true },
      }),
    ]);
    const name = new Map(people.map((p) => [p.id, p.user.name]));
    const stat = new Map(stats.map((s) => [s.riderMembershipId, s]));
    const rideLive = ['SCHEDULED', 'FULL', 'IN_PROGRESS'].includes(ride.status);
    return riderIds.map((rid) => {
      const b = bookings.find((x) => x.riderMembershipId === rid)!;
      const blocked = blocks.some((x) => x.blockerId === rid || x.blockedId === rid);
      const live = rideLive && ['CONFIRMED', 'BOARDED'].includes(b.status);
      const s = stat.get(rid);
      return {
        riderMembershipId: rid,
        as: isDriver ? ('DRIVER' as const) : ('RIDER' as const),
        with: { membershipId: isDriver ? rid : ride.driverMembershipId, name: name.get(isDriver ? rid : ride.driverMembershipId) ?? 'Former member' },
        unread: s?.unread ?? 0,
        lastMessage: s ? { body: s.lastBody, at: s.lastAt } : null,
        canSend: live && !blocked,
        archived: !live,
      };
    });
  }

  /** Newest page first in the database, returned oldest to newest for display. Opening it marks the other side's messages read. */
  async history(org: OrgContext, rideId: string, riderParam: string, q: ChatHistoryQuery) {
    const t = await this.thread(org, rideId, riderParam);
    const rows = await this.prisma.message.findMany({
      where: { rideId, riderMembershipId: t.riderMembershipId, ...(q.before ? { createdAt: { lt: new Date(q.before) } } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
    });
    const page = rows.slice(0, q.limit);
    const { count } = await this.prisma.message.updateMany({
      where: { rideId, riderMembershipId: t.riderMembershipId, senderMembershipId: { not: org.membershipId }, readAt: null },
      data: { readAt: new Date() },
    });
    if (count) this.realtime.publish(chatRoom(rideId, t.riderMembershipId), CHAT_READ_EVENT, { rideId, riderMembershipId: t.riderMembershipId, byMembershipId: org.membershipId });
    return {
      data: page.reverse().map((m) => ({ id: m.id, body: m.body, mine: m.senderMembershipId === org.membershipId, createdAt: m.createdAt, readAt: m.readAt })),
      meta: { nextBefore: rows.length > q.limit ? page[0].createdAt.toISOString() : null, canSend: t.canSend, archived: t.archived, blocked: t.blocked, as: t.as },
    };
  }

  async send(org: OrgContext, rideId: string, riderParam: string, b: ChatMessageInput) {
    const t = await this.thread(org, rideId, riderParam);
    if (t.blocked) throw new AppError('FORBIDDEN', "You can't message this person.", 403);
    if (!t.canSend) throw new AppError('CONFLICT', 'This chat is closed because the ride is over or the seat was cancelled.', 409);
    const m = await this.prisma.message.create({
      data: { organizationId: org.organizationId, rideId, senderMembershipId: org.membershipId, riderMembershipId: t.riderMembershipId, body: b.body },
    });
    const out = { id: m.id, rideId, riderMembershipId: t.riderMembershipId, senderMembershipId: org.membershipId, body: m.body, createdAt: m.createdAt };
    this.realtime.publish(chatRoom(rideId, t.riderMembershipId), CHAT_EVENT, out);
    await this.alertRecipient(org, t, out);
    return { id: m.id, body: m.body, mine: true, createdAt: m.createdAt, readAt: null };
  }

  /** One unread chat alert per thread in the inbox (not one per message); the phone still gets every push. */
  private async alertRecipient(org: OrgContext, t: { rideId: string; riderMembershipId: string; driverMembershipId: string; as: 'DRIVER' | 'RIDER' }, msg: { body: string }) {
    const recipientId = t.as === 'DRIVER' ? t.riderMembershipId : t.driverMembershipId;
    const [recipient, sender] = await Promise.all([
      this.prisma.membership.findUnique({ where: { id: recipientId }, select: { userId: true } }),
      this.prisma.membership.findUnique({ where: { id: org.membershipId }, select: { user: { select: { name: true } } } }),
    ]);
    if (!recipient) return;
    const open = await this.prisma.notification.findFirst({
      where: { userId: recipient.userId, type: 'CHAT_MESSAGE', readAt: null, AND: [{ data: { path: ['rideId'], equals: t.rideId } }, { data: { path: ['riderMembershipId'], equals: t.riderMembershipId } }] },
      select: { id: true },
    });
    await this.notify.notifyMembership(recipientId, {
      type: 'CHAT_MESSAGE',
      title: sender?.user.name ?? 'New message',
      body: msg.body.length > 120 ? `${msg.body.slice(0, 117)}…` : msg.body,
      data: { rideId: t.rideId, riderMembershipId: t.riderMembershipId },
      inbox: !open,
    });
  }

  /** Unread messages across live rides (for the badge). Finished rides are archived and not counted. */
  async unread(org: OrgContext) {
    const rows = await this.prisma.$queryRaw<{ rideId: string; riderMembershipId: string; count: number }[]>`
      SELECT m.ride_id AS "rideId", m.rider_membership_id AS "riderMembershipId", count(*)::int AS count
      FROM messages m JOIN rides r ON r.id = m.ride_id
      WHERE m.organization_id = ${org.organizationId}::uuid AND m.read_at IS NULL AND m.sender_membership_id <> ${org.membershipId}::uuid
        AND (r.driver_membership_id = ${org.membershipId}::uuid OR m.rider_membership_id = ${org.membershipId}::uuid)
        AND r.status IN ('SCHEDULED', 'FULL', 'IN_PROGRESS')
      GROUP BY m.ride_id, m.rider_membership_id`;
    return { total: rows.reduce((n, r) => n + r.count, 0), threads: rows };
  }
}
