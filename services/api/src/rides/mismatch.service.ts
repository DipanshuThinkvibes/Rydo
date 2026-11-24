import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { MISMATCH_LABEL, MISMATCH_OPTIONS, MISMATCH_REPEAT_DAYS, type MismatchInput } from '@rydo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppError } from '../common/app-error';
import { NotificationsService } from '../notifications/notifications.service';
import { WaitlistService } from '../commute/waitlist.service';

interface OrgRef {
  organizationId: string;
  membershipId: string;
}

/** Plain words for each reason, used in messages. */
const REASON_TEXT: Record<'RIDER' | 'DRIVER', Record<string, string>> = {
  RIDER: {
    WRONG_PERSON: 'the driver was not the person in the photo',
    WRONG_VEHICLE: 'the vehicle was not the one shown',
    VEHICLE_NOT_VERIFIED: 'the vehicle was not verified',
  },
  DRIVER: { WRONG_PERSON: 'the rider was not the person in the photo' },
};

/**
 * "This is not who or what I was told." A rider or driver cancels at pickup because the person or the vehicle does not match.
 * The booking is cancelled with no penalty for the person who reports; a report goes to the company HR; the person reported
 * gets a warning. A repeat also goes to RYDO's team (Super Admin and Support), who can pause that person for a while.
 */
@Injectable()
export class MismatchService {
  private readonly log = new Logger('Mismatch');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notify: NotificationsService,
    @Inject(forwardRef(() => WaitlistService)) private readonly waitlist: WaitlistService,
  ) {}

  async report(org: OrgRef, actorUserId: string, bookingId: string, body: MismatchInput) {
    const b = await this.prisma.booking.findFirst({ where: { id: bookingId, organizationId: org.organizationId }, include: { ride: { select: { id: true, driverMembershipId: true, status: true, originLabel: true, destinationLabel: true, departAt: true } } } });
    if (!b) throw new AppError('NOT_FOUND', 'Booking not found.', 404);
    const role: 'RIDER' | 'DRIVER' | null = org.membershipId === b.riderMembershipId ? 'RIDER' : org.membershipId === b.ride.driverMembershipId ? 'DRIVER' : null;
    if (!role) throw new AppError('NOT_FOUND', 'Booking not found.', 404);
    if (!MISMATCH_OPTIONS[role].some((o) => o.kind === body.kind)) {
      throw new AppError('VALIDATION_ERROR', role === 'DRIVER' ? 'A driver can report that the rider is not the person in the photo.' : 'Choose one of the reasons shown.', 400, { kind: 'Not a reason you can report' });
    }
    if (b.status !== 'CONFIRMED') throw new AppError('CONFLICT', `This booking is ${b.status.toLowerCase().replace(/_/g, ' ')}.`, 409);
    if (!['SCHEDULED', 'FULL', 'IN_PROGRESS'].includes(b.ride.status)) throw new AppError('CONFLICT', 'This ride is not running any more.', 409);

    const againstId = role === 'RIDER' ? b.ride.driverMembershipId : b.riderMembershipId;
    const reason = REASON_TEXT[role][body.kind];
    const description = `${MISMATCH_LABEL[body.kind][0].toUpperCase()}${MISMATCH_LABEL[body.kind].slice(1)}: ${reason}.${body.note ? ` Note: ${body.note}` : ''}`;
    const since = new Date(Date.now() - MISMATCH_REPEAT_DAYS * 86_400_000);
    const prior = await this.prisma.issueReport.count({ where: { organizationId: org.organizationId, againstMembershipId: againstId, category: 'IDENTITY_MISMATCH', createdAt: { gte: since } } });

    const report = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM rides WHERE id = ${b.rideId}::uuid FOR UPDATE`;
      // Cancelled for a safety reason, so no late-cancel penalty for the person who reports.
      await tx.booking.update({ where: { id: b.id }, data: { status: role === 'RIDER' ? 'CANCELLED_BY_RIDER' : 'CANCELLED_BY_DRIVER', cancelledAt: new Date(), lateCancel: false } });
      await tx.$executeRaw`UPDATE rides SET seats_booked = seats_booked - ${b.seats}, status = CASE WHEN status = 'FULL' THEN 'SCHEDULED'::"RideStatus" ELSE status END, updated_at = now() WHERE id = ${b.rideId}::uuid`;
      const r = await tx.issueReport.create({
        data: { organizationId: org.organizationId, reporterMembershipId: org.membershipId, againstMembershipId: againstId, rideId: b.rideId, category: 'IDENTITY_MISMATCH', description },
      });
      await this.audit.log({ organizationId: org.organizationId, actorUserId, action: 'MISMATCH_REPORTED', entityType: 'booking', entityId: b.id, after: { kind: body.kind, role, reportId: r.id, repeat: prior > 0 } }, tx);
      return r;
    });

    const names = await this.names([org.membershipId, againstId]);
    const reporter = names.get(org.membershipId) ?? 'A colleague';
    const against = names.get(againstId) ?? 'a colleague';
    const trip = `${b.ride.originLabel} to ${b.ride.destinationLabel}`;
    const repeat = prior > 0;

    // 1) the person reported gets a warning; a repeat is a final warning
    await this.notify.notifyMembership(againstId, {
      type: 'SAFETY_WARNING',
      title: repeat ? 'Second report: final warning' : 'A colleague reported that you did not match',
      body: repeat
        ? `${reporter} cancelled your ride (${trip}) because ${reason}. This is the second report in ${MISMATCH_REPEAT_DAYS} days. Your company HR and RYDO's safety team have been told. Another report can lead to a temporary pause of your account.`
        : `${reporter} cancelled your ride (${trip}) because ${reason}. This is a first warning. Please make sure your profile photo${role === 'RIDER' ? ' and your vehicle match what the app shows' : ' is a clear photo of you'}. Your company HR has been told.`,
      data: { bookingId: b.id, reportId: report.id },
      email: true,
    });
    // 2) the company's HR hears about it, every time
    await this.notify.notifyAdmins(
      org.organizationId,
      {
        type: 'SAFETY_REPORT',
        title: `${reporter} reported ${against}: ${MISMATCH_LABEL[body.kind]}`,
        body: `${description} Ride: ${trip}. ${repeat ? `This is a repeat: ${prior + 1} reports against ${against} in ${MISMATCH_REPEAT_DAYS} days. RYDO's team was told too.` : 'This is the first report. A warning was sent.'}`,
        data: { reportId: report.id, bookingId: b.id },
        email: true,
      },
      ['HR_ADMIN', 'ORG_ADMIN'],
    );
    // 3) a repeat goes to RYDO's own team, who can pause the person for a while
    let escalated = false;
    if (repeat) {
      const staff = await this.prisma.platformAdmin.findMany({ select: { userId: true } });
      const org_ = await this.prisma.organization.findUniqueOrThrow({ where: { id: org.organizationId }, select: { name: true } });
      escalated = staff.length > 0;
      await this.notify.notifyUsers([...new Set(staff.map((s) => s.userId))], {
        type: 'SAFETY_ESCALATION',
        title: `Repeat report at ${org_.name}: ${against}`,
        body: `${prior + 1} identity or vehicle mismatch reports in ${MISMATCH_REPEAT_DAYS} days. Open People to review and, if needed, pause the person for a while.`,
        data: { reportId: report.id, membershipId: againstId },
        email: true,
      });
    }
    // 4) the reporter is told it went through; a seat is free again for the waitlist
    await this.notify.notifyMembership(org.membershipId, {
      type: 'SAFETY_REPORT_SENT',
      title: 'Your report was sent',
      body: `The ride was cancelled with no penalty for you. ${against} got a warning and your company HR was told.${role === 'RIDER' ? ' Search again to find another driver.' : ''}`,
      data: { reportId: report.id },
    });
    await this.waitlist.check(org.organizationId, { onlyRideIds: [b.rideId] }).catch((e) => this.log.warn(`waitlist after mismatch: ${(e as Error).message}`));

    return { bookingId: b.id, status: role === 'RIDER' ? 'CANCELLED_BY_RIDER' : 'CANCELLED_BY_DRIVER', reportId: report.id, warning: repeat ? 2 : 1, escalated };
  }

  private async names(ids: string[]) {
    const ms = await this.prisma.membership.findMany({ where: { id: { in: ids } }, include: { user: { select: { name: true } } } });
    return new Map(ms.map((m) => [m.id, m.user.name]));
  }
}
