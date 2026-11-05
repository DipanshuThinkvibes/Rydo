/**
 * Local demo data. Safe to run again (upserts).
 * Super Admin = SEED_SUPER_ADMIN_EMAIL. Demo company "Acme Tech" uses the reserved domain acme.test,
 * so no real person ever gets these emails (Mailpit catches them locally).
 */
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/auth/password';

const prisma = new PrismaClient();

async function main() {
  const superEmail = (process.env.SEED_SUPER_ADMIN_EMAIL ?? 'admin@rydo.local').toLowerCase();
  // Local-only password for the admin accounts below (web sign-in). Never set on existing passwords.
  const devPassword = process.env.SEED_DEV_PASSWORD ?? 'Rydo@2026';
  const passwordHash = await hashPassword(devPassword);
  const withPassword = async (email: string) => prisma.user.updateMany({ where: { email, passwordHash: null }, data: { passwordHash } });

  const superAdmin = await prisma.user.upsert({ where: { email: superEmail }, update: {}, create: { email: superEmail, name: 'RYDO Admin' } });
  await withPassword(superEmail);
  await prisma.platformAdmin.upsert({ where: { userId_role: { userId: superAdmin.id, role: 'SUPER_ADMIN' } }, update: {}, create: { userId: superAdmin.id, role: 'SUPER_ADMIN' } });

  const acme = await prisma.organization.upsert({
    where: { slug: 'acme' },
    update: {},
    create: { name: 'Acme Tech', slug: 'acme', emailDomains: ['acme.test'], status: 'ACTIVE' },
  });

  const people: { email: string; name: string; status: 'ACTIVE' | 'PENDING'; roles: ('ORG_ADMIN' | 'HR_ADMIN' | 'RIDER' | 'DRIVER')[] }[] = [
    { email: 'hr@acme.test', name: 'Meera Iyer', status: 'ACTIVE', roles: ['ORG_ADMIN', 'HR_ADMIN', 'RIDER'] },
    { email: 'rahul@acme.test', name: 'Rahul M.', status: 'ACTIVE', roles: ['RIDER', 'DRIVER'] },
    { email: 'priya@acme.test', name: 'Priya S.', status: 'ACTIVE', roles: ['RIDER'] },
    { email: 'neha@acme.test', name: 'Neha Joshi', status: 'PENDING', roles: ['RIDER'] },
    { email: 'karthik@acme.test', name: 'Karthik S.', status: 'PENDING', roles: ['RIDER'] },
  ];
  for (const p of people) {
    const user = await prisma.user.upsert({ where: { email: p.email }, update: {}, create: { email: p.email, name: p.name } });
    const m = await prisma.membership.upsert({
      where: { organizationId_userId: { organizationId: acme.id, userId: user.id } },
      update: {},
      create: { organizationId: acme.id, userId: user.id, status: p.status },
    });
    if (p.roles.includes('ORG_ADMIN') || p.roles.includes('HR_ADMIN')) await withPassword(p.email);
    for (const role of p.roles) {
      await prisma.membershipRole.upsert({ where: { membershipId_role: { membershipId: m.id, role } }, update: {}, create: { membershipId: m.id, role } });
    }
  }
  console.log(`Seeded: super admin ${superEmail}, company "Acme Tech" (acme.test) with ${people.length} people. Admin web password: ${devPassword}`);
}

main().finally(() => prisma.$disconnect());