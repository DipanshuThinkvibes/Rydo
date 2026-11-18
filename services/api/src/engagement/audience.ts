import type { Audience } from '@rydo/shared';
import type { PrismaService } from '../prisma/prisma.service';

/** Active people of one company who match a segment. No segment = everyone active. */
export async function audienceMembershipIds(prisma: PrismaService, organizationId: string, audience: Audience): Promise<string[]> {
  const rows = await prisma.membership.findMany({
    where: {
      organizationId,
      status: 'ACTIVE',
      ...(audience.roles?.length ? { roles: { some: { role: { in: audience.roles } } } } : {}),
      ...(audience.departmentIds?.length ? { departmentId: { in: audience.departmentIds } } : {}),
    },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/** Does one person belong to a segment? (Used to decide who may see and answer a survey.) */
export function inAudience(m: { departmentId: string | null; roles: string[] }, audience: Audience) {
  if (audience.roles?.length && !audience.roles.some((r) => m.roles.includes(r))) return false;
  if (audience.departmentIds?.length && (!m.departmentId || !audience.departmentIds.includes(m.departmentId))) return false;
  return true;
}
