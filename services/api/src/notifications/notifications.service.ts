import { Inject, Injectable, Logger } from '@nestjs/common';
import { ADMIN_ROLES, type OrgRoleName } from '@rydo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { MESSAGE_ADAPTER, MessageAdapter } from '../adapters/message.adapter';
import { PUSH_ADAPTER, type PushAdapter } from '../adapters/push.adapter';

export interface Notice {
  type: string;
  title: string;
  body: string;
  data?: object;
  /** Also send an email (for the moments people must not miss). */
  email?: boolean;
  /** Also send a phone push to the person's registered devices. Default true. */
  push?: boolean;
  /** Keep a row in the in-app inbox. Default true. */
  inbox?: boolean;
}

/** In-app inbox, phone push (when Firebase is set up) and email for the moments people must not miss. */
@Injectable()
export class NotificationsService {
  private readonly log = new Logger('Notifications');

  constructor(
    private readonly prisma: PrismaService,
    @Inject(MESSAGE_ADAPTER) private readonly messages: MessageAdapter,
    @Inject(PUSH_ADAPTER) private readonly pushAdapter: PushAdapter,
  ) {}

  async notifyMembership(membershipId: string, n: Notice) {
    const m = await this.prisma.membership.findUniqueOrThrow({ where: { id: membershipId }, include: { user: { select: { id: true, email: true } } } });
    if (n.inbox !== false) {
      await this.prisma.notification.create({
        data: { userId: m.user.id, organizationId: m.organizationId, type: n.type, title: n.title, body: n.body, data: (n.data ?? {}) as object },
      });
    }
    if (n.push !== false) await this.pushTo([m.user.id], n);
    if (n.email) await this.messages.sendEmail({ to: m.user.email, subject: n.title, text: n.body });
  }

  /** Every active admin of a company (Org, HR and Ops admins unless roles are given). */
  async notifyAdmins(organizationId: string, n: Notice, roles: OrgRoleName[] = [...ADMIN_ROLES]) {
    const admins = await this.prisma.membership.findMany({ where: { organizationId, status: 'ACTIVE', roles: { some: { role: { in: roles } } } }, select: { id: true } });
    await this.notifyMany(admins.map((a) => a.id), n);
    return admins.length;
  }

  /** Same message to many people with a few queries (announcements, surveys). */
  async notifyMany(membershipIds: string[], n: Notice) {
    if (!membershipIds.length) return 0;
    const ms = await this.prisma.membership.findMany({ where: { id: { in: membershipIds } }, select: { organizationId: true, user: { select: { id: true, email: true } } } });
    if (n.inbox !== false) {
      await this.prisma.notification.createMany({
        data: ms.map((m) => ({ userId: m.user.id, organizationId: m.organizationId, type: n.type, title: n.title, body: n.body, data: (n.data ?? {}) as object })),
      });
    }
    if (n.push !== false) await this.pushTo(ms.map((m) => m.user.id), n);
    if (n.email) {
      for (let i = 0; i < ms.length; i += 5) {
        await Promise.all(
          ms.slice(i, i + 5).map((m) =>
            this.messages.sendEmail({ to: m.user.email, subject: n.title, text: n.body }).catch((e) => this.log.warn(`Email to one person failed: ${(e as Error).message}`)),
          ),
        );
      }
    }
    return ms.length;
  }

  /** Push never breaks the action that caused it: failures are logged and dead tokens are removed. */
  private async pushTo(userIds: string[], n: Notice) {
    try {
      const tokens = await this.prisma.deviceToken.findMany({ where: { userId: { in: userIds } }, select: { token: true } });
      if (!tokens.length) return;
      const data = Object.fromEntries(Object.entries((n.data ?? {}) as Record<string, unknown>).map(([k, v]) => [k, String(v)]));
      const { invalidTokens } = await this.pushAdapter.send(tokens.map((t) => t.token), { title: n.title, body: n.body, data: { type: n.type, ...data } });
      if (invalidTokens.length) await this.prisma.deviceToken.deleteMany({ where: { token: { in: invalidTokens } } });
    } catch (e) {
      this.log.warn(`Push failed: ${(e as Error).message}`);
    }
  }
}
