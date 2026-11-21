import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';

type Client = PrismaService | Prisma.TransactionClient;

/**
 * Temporary blocks end by themselves. This puts back anyone whose pause has run out (everyone, or just the given memberships),
 * writes it to the activity log and tells them. It needs nothing but the database, so the sign-in check and the people list
 * can both call it and no background job is needed.
 */
export async function releaseExpiredBlocks(prisma: Client, only: Prisma.MembershipWhereInput = {}) {
  const due = await prisma.membership.findMany({
    where: { platformBlockedAt: { not: null }, platformBlockedUntil: { lte: new Date() }, ...only },
    select: { id: true, userId: true, organizationId: true, status: true, platformBlockReason: true },
  });
  for (const m of due) {
    // Only the first caller to flip it writes the log and the notice.
    const { count } = await prisma.membership.updateMany({
      where: { id: m.id, platformBlockedAt: { not: null }, platformBlockedUntil: { lte: new Date() } },
      data: { status: m.status === 'SUSPENDED' ? 'ACTIVE' : m.status, platformBlockedAt: null, platformBlockReason: null, platformBlockedById: null, platformBlockedUntil: null },
    });
    if (!count) continue;
    await prisma.auditLog.create({
      data: { organizationId: m.organizationId, actorUserId: null, action: 'PLATFORM_MEMBER_UNBLOCKED', entityType: 'membership', entityId: m.id, before: { reason: m.platformBlockReason }, after: { automatic: true, reason: 'The pause ended' } },
    });
    await prisma.notification.create({
      data: { userId: m.userId, organizationId: m.organizationId, type: 'ACCOUNT_UNBLOCKED', title: 'Your RYDO access is back', body: 'The pause on your account has ended. Please check who you ride with, and that your photo and vehicle match.' },
    });
  }
  return due.length;
}
