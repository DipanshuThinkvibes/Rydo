import { Injectable } from '@nestjs/common';
import type { OrgRoleName } from '@rydo/shared';
import { PrismaService } from '../prisma/prisma.service';

const ADMIN: OrgRoleName[] = ['ORG_ADMIN', 'OPS_ADMIN', 'HR_ADMIN'];
const RIDER_STATUSES = ['CONFIRMED', 'BOARDED', 'COMPLETED', 'NO_SHOW'] as const;

export interface Viewer {
  role: 'DRIVER' | 'RIDER' | 'ADMIN';
  membershipId: string;
  bookingId: string | null;
  ride: { id: string; organizationId: string; driverMembershipId: string; status: string };
}

export interface ChatThread {
  rideId: string;
  organizationId: string;
  driverMembershipId: string;
  riderMembershipId: string;
  as: 'DRIVER' | 'RIDER';
  canSend: boolean;
  /** Ride over or booking ended: history stays readable, nothing new can be written. */
  archived: boolean;
  blocked: boolean;
}

/** Who may see a ride live: its driver, its booked riders, and the company's admins. Nobody else. */
@Injectable()
export class TripAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** For HTTP routes, where OrgGuard already resolved the membership. */
  async forMembership(org: { organizationId: string; membershipId: string; roles: OrgRoleName[] }, rideId: string): Promise<Viewer | null> {
    const ride = await this.prisma.ride.findFirst({
      where: { id: rideId, organizationId: org.organizationId },
      select: { id: true, organizationId: true, driverMembershipId: true, status: true },
    });
    if (!ride) return null;
    if (ride.driverMembershipId === org.membershipId) return { role: 'DRIVER', membershipId: org.membershipId, bookingId: null, ride };
    const booking = await this.prisma.booking.findFirst({ where: { rideId, riderMembershipId: org.membershipId, status: { in: [...RIDER_STATUSES] } }, select: { id: true } });
    if (booking) return { role: 'RIDER', membershipId: org.membershipId, bookingId: booking.id, ride };
    if (org.roles.some((r) => ADMIN.includes(r))) return { role: 'ADMIN', membershipId: org.membershipId, bookingId: null, ride };
    return null;
  }

  /** For the realtime socket, where we only know the user. */
  async forUser(userId: string, rideId: string): Promise<Viewer | null> {
    const ride = await this.prisma.ride.findUnique({ where: { id: rideId }, select: { organizationId: true } });
    if (!ride) return null;
    const m = await this.prisma.membership.findUnique({
      where: { organizationId_userId: { organizationId: ride.organizationId, userId } },
      include: { roles: true, organization: { select: { status: true } } },
    });
    if (!m || m.status !== 'ACTIVE' || m.organization.status !== 'ACTIVE') return null;
    return this.forMembership({ organizationId: ride.organizationId, membershipId: m.id, roles: m.roles.map((r) => r.role as OrgRoleName) }, rideId);
  }

  /**
   * One-to-one chat between a ride's driver and one rider who has a booking. Only those two people may read it:
   * other riders and admins never can. Writing is allowed only while the booking is live and the ride is not over
   * ("archived" afterwards), and never between people who blocked each other.
   */
  async chatThread(org: { organizationId: string; membershipId: string }, rideId: string, riderMembershipId: string): Promise<ChatThread | null> {
    const ride = await this.prisma.ride.findFirst({ where: { id: rideId, organizationId: org.organizationId }, select: { driverMembershipId: true, status: true } });
    if (!ride || riderMembershipId === ride.driverMembershipId) return null;
    const isDriver = ride.driverMembershipId === org.membershipId;
    const isRider = riderMembershipId === org.membershipId;
    if (!isDriver && !isRider) return null;
    const booking = await this.prisma.booking.findFirst({ where: { rideId, riderMembershipId, status: { in: ['CONFIRMED', 'BOARDED', 'NO_SHOW', 'COMPLETED'] } }, select: { status: true } });
    if (!booking) return null;
    const blocked = await this.prisma.userBlock.findFirst({
      where: { OR: [{ blockerId: ride.driverMembershipId, blockedId: riderMembershipId }, { blockerId: riderMembershipId, blockedId: ride.driverMembershipId }] },
      select: { blockerId: true },
    });
    const live = ['CONFIRMED', 'BOARDED'].includes(booking.status) && ['SCHEDULED', 'FULL', 'IN_PROGRESS'].includes(ride.status);
    return {
      rideId,
      organizationId: org.organizationId,
      driverMembershipId: ride.driverMembershipId,
      riderMembershipId,
      as: isDriver ? 'DRIVER' : 'RIDER',
      canSend: live && !blocked,
      archived: !live,
      blocked: !!blocked,
    };
  }

  /** Same check for the realtime socket, where we only know the user. */
  async chatThreadForUser(userId: string, rideId: string, riderMembershipId: string): Promise<ChatThread | null> {
    const ride = await this.prisma.ride.findUnique({ where: { id: rideId }, select: { organizationId: true } });
    if (!ride) return null;
    const m = await this.prisma.membership.findUnique({ where: { organizationId_userId: { organizationId: ride.organizationId, userId } }, include: { organization: { select: { status: true } } } });
    if (!m || m.status !== 'ACTIVE' || m.organization.status !== 'ACTIVE') return null;
    return this.chatThread({ organizationId: ride.organizationId, membershipId: m.id }, rideId, riderMembershipId);
  }

  async isOrgAdmin(userId: string, organizationId: string) {
    const m = await this.prisma.membership.findUnique({ where: { organizationId_userId: { organizationId, userId } }, include: { roles: true } });
    return !!m && m.status === 'ACTIVE' && m.roles.some((r) => ADMIN.includes(r.role as OrgRoleName));
  }
}
