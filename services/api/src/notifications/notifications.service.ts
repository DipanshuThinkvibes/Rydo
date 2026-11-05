import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MESSAGE_ADAPTER, MessageAdapter } from '../adapters/message.adapter';

/** In-app inbox (always) plus email for the moments people must not miss. Push comes with the mobile app. */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(MESSAGE_ADAPTER) private readonly messages: MessageAdapter,
  ) {}

  async notifyMembership(membershipId: string, n: { type: string; title: string; body: string; data?: object; email?: boolean }) {
    const m = await this.prisma.membership.findUniqueOrThrow({ where: { id: membershipId }, include: { user: { select: { id: true, email: true } } } });
    await this.prisma.notification.create({
      data: { userId: m.user.id, organizationId: m.organizationId, type: n.type, title: n.title, body: n.body, data: (n.data ?? {}) as object },
    });
    if (n.email) await this.messages.sendEmail({ to: m.user.email, subject: n.title, text: n.body });
  }
}