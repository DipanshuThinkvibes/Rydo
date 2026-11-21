import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MESSAGE_ADAPTER, MessageAdapter } from '../adapters/message.adapter';
import { expiryFlags, latestDocuments } from './documents';

/** Nightly: a verified driver whose license or default-vehicle RC has expired stops being able to drive. */
@Injectable()
export class DocumentExpiryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(MESSAGE_ADAPTER) private readonly messages: MessageAdapter,
  ) {}

  async run() {
    const drivers = await this.prisma.driverProfile.findMany({
      where: { status: 'VERIFIED' },
      include: { documents: true, vehicles: { where: { active: true } }, membership: { include: { user: { select: { email: true } } } } },
    });
    let expired = 0;
    for (const p of drivers) {
      const docs = latestDocuments(p.documents);
      const vehicle = p.vehicles.find((v) => v.isDefault) ?? p.vehicles[0];
      const needed = [
        docs.find((d) => d.kind === 'DRIVING_LICENSE'),
        vehicle && docs.find((d) => d.kind === 'VEHICLE_RC' && d.vehicleId === vehicle.id),
        vehicle && docs.find((d) => d.kind === 'INSURANCE' && d.vehicleId === vehicle.id),
      ];
      const lapsed = needed.filter((d) => d && expiryFlags(d.expiresAt).expired);
      if (!lapsed.length) continue;
      await this.prisma.driverProfile.update({ where: { id: p.id }, data: { status: 'EXPIRED' } });
      if (vehicle) await this.prisma.vehicle.update({ where: { id: vehicle.id }, data: { checkStatus: 'EXPIRED' } });
      await this.audit.log({ organizationId: p.membership.organizationId, action: 'DRIVER_EXPIRED', entityType: 'driver_profile', entityId: p.id, after: { documents: lapsed.map((d) => d!.kind) } });
      await this.messages.sendEmail({
        to: p.membership.user.email,
        subject: 'Your RYDO driver documents have expired',
        text: 'Your license, vehicle RC or insurance has expired, so you cannot offer rides for now. Upload the renewed document in the RYDO app; we check the vehicle again and HR will review it.',
      });
      expired++;
    }
    return { checked: drivers.length, expired };
  }
}