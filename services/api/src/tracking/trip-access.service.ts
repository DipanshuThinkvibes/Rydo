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

  async isOrgAdmin(userId: string, organizationId: string) {
    const m = await this.prisma.membership.findUnique({ where: { organizationId_userId: { organizationId, userId } }, include: { roles: true } });
    return !!m && m.status === 'ACTIVE' && m.roles.some((r) => ADMIN.includes(r.role as OrgRoleName));
  }
}
