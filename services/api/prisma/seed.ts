/**
 * Local demo data. Safe to run again (upserts).
 * Super Admin = SEED_SUPER_ADMIN_EMAIL. Demo company "Acme Tech" uses the reserved domain acme.test,
 * so no real person ever gets these emails (Mailpit catches them locally).
 */
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/auth/password';
import { CreateBucketCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

/** A tiny one-page PDF with a few lines of text, used as a stand-in for scanned documents. */
function samplePdf(lines: string[]) {
  const text = lines.map((l, i) => `BT /F1 ${i === 0 ? 20 : 13} Tf 60 ${740 - i * 30} Td (${l.replace(/[()\\]/g, '')}) Tj ET`).join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

const s3 = new S3Client({
  region: process.env.S3_REGION ?? 'ap-south-1',
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: !!process.env.S3_ENDPOINT,
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY ?? '', secretAccessKey: process.env.S3_SECRET_KEY ?? '' },
});
const bucket = process.env.S3_BUCKET ?? 'rydo-documents';
async function putSample(key: string, lines: string[]) {
  await s3.send(new HeadBucketCommand({ Bucket: bucket })).catch(() => s3.send(new CreateBucketCommand({ Bucket: bucket })));
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: samplePdf(lines), ContentType: 'application/pdf' }));
}

const prisma = new PrismaClient();

async function main() {
  const superEmail = (process.env.SEED_SUPER_ADMIN_EMAIL ?? 'admin@rydo.local').toLowerCase();
  // Local-only password for every demo account below (web sign-in). Never overwrites a password someone set.
  const devPassword = process.env.SEED_DEV_PASSWORD ?? 'Rydo@2026';
  const passwordHash = await hashPassword(devPassword);
  const withPassword = async (email: string) => prisma.user.updateMany({ where: { email, passwordHash: null }, data: { passwordHash } });

  const superAdmin = await prisma.user.upsert({ where: { email: superEmail }, update: {}, create: { email: superEmail, name: 'RYDO Admin' } });
  await withPassword(superEmail);
  await prisma.platformAdmin.upsert({ where: { userId_role: { userId: superAdmin.id, role: 'SUPER_ADMIN' } }, update: {}, create: { userId: superAdmin.id, role: 'SUPER_ADMIN' } });

  const acme = await prisma.organization.upsert({
    where: { slug: 'acme' },
    update: {},
    create: { name: 'Acme Tech', slug: 'acme', emailDomains: ['acme.test'], status: 'ACTIVE', licenses: { create: [{ product: 'SHARE', notes: 'Demo licence' }] } },
  });

  const people: { email: string; name: string; status: 'ACTIVE' | 'PENDING'; roles: ('ORG_ADMIN' | 'HR_ADMIN' | 'OPS_ADMIN' | 'RIDER' | 'DRIVER')[]; gender?: 'FEMALE' | 'MALE' }[] = [
    { email: 'hr@acme.test', name: 'Meera Iyer', status: 'ACTIVE', roles: ['ORG_ADMIN', 'HR_ADMIN'] },
    { email: 'ops@acme.test', name: 'Omkar Ops', status: 'ACTIVE', roles: ['OPS_ADMIN'] },
    { email: 'rahul@acme.test', name: 'Rahul M.', status: 'ACTIVE', roles: ['RIDER'], gender: 'MALE' },
    { email: 'sneha@acme.test', name: 'Sneha R.', status: 'ACTIVE', roles: ['RIDER', 'DRIVER'], gender: 'FEMALE' },
    { email: 'priya@acme.test', name: 'Priya S.', status: 'ACTIVE', roles: ['RIDER'], gender: 'FEMALE' },
    { email: 'arjun@acme.test', name: 'Arjun T.', status: 'ACTIVE', roles: ['RIDER'], gender: 'MALE' },
    { email: 'neha@acme.test', name: 'Neha Joshi', status: 'PENDING', roles: ['RIDER'] },
    { email: 'karthik@acme.test', name: 'Karthik S.', status: 'PENDING', roles: ['RIDER'] },
  ];
  for (const p of people) {
    const user = await prisma.user.upsert({ where: { email: p.email }, update: p.gender ? { gender: p.gender } : {}, create: { email: p.email, name: p.name, gender: p.gender } });
    const m = await prisma.membership.upsert({
      where: { organizationId_userId: { organizationId: acme.id, userId: user.id } },
      update: {},
      create: { organizationId: acme.id, userId: user.id, status: p.status },
    });
    await withPassword(p.email);
    for (const role of p.roles) {
      await prisma.membershipRole.upsert({ where: { membershipId_role: { membershipId: m.id, role } }, update: {}, create: { membershipId: m.id, role } });
    }
  }
  // Demo drivers for the HR review page: Rahul waits for verification, Sneha is verified but her license expires soon.
  const day = 86_400_000;
  const drivers = [
    { email: 'rahul@acme.test', status: 'PENDING' as const, car: { make: 'Honda', model: 'City', color: 'White', plateNumber: 'KA 01 AB 1234', seatCapacity: 3 }, licenseExpiry: new Date(Date.now() + 900 * day), rcExpiry: new Date(Date.now() + 2000 * day) },
    { email: 'sneha@acme.test', status: 'VERIFIED' as const, car: { make: 'Hyundai', model: 'i20', color: 'Grey', plateNumber: 'KA 03 MN 4521', seatCapacity: 3 }, licenseExpiry: new Date(Date.now() + 20 * day), rcExpiry: new Date(Date.now() + 1500 * day) },
  ];
  for (const d of drivers) {
    const m = await prisma.membership.findFirstOrThrow({ where: { organizationId: acme.id, user: { email: d.email } }, include: { user: true } });
    if (await prisma.driverProfile.findUnique({ where: { membershipId: m.id } })) continue;
    const profile = await prisma.driverProfile.create({ data: { membershipId: m.id, status: d.status, verifiedAt: d.status === 'VERIFIED' ? new Date() : null, guidelinesAcceptedAt: new Date() } });
    const vehicle = await prisma.vehicle.create({ data: { organizationId: acme.id, driverProfileId: profile.id, type: 'CAR', hasAc: true, isDefault: true, ...d.car } });
    const docStatus = d.status === 'VERIFIED' ? 'APPROVED' : 'PENDING';
    const licenseKey = `orgs/${acme.id}/drivers/${profile.id}/driving_license-sample.pdf`;
    const rcKey = `orgs/${acme.id}/drivers/${profile.id}/vehicle_rc-sample.pdf`;
    const licenseBackKey = `orgs/${acme.id}/drivers/${profile.id}/driving_license-sample-back.pdf`;
    const insuranceKey = `orgs/${acme.id}/drivers/${profile.id}/vehicle_insurance-sample.pdf`;
    const photoKey = (side: string) => `orgs/${acme.id}/drivers/${profile.id}/vehicle_photo_${side}-sample.pdf`;
    const insuranceExpiry = new Date(Date.now() + 300 * day);
    try {
      await putSample(licenseKey, ['SAMPLE DRIVING LICENSE', `Name: ${m.user.name}`, 'DL No: KA0120190001234', `Valid till: ${d.licenseExpiry.toISOString().slice(0, 10)}`, 'Demo document - not real']);
      await putSample(rcKey, ['SAMPLE REGISTRATION CERTIFICATE', `Owner: ${m.user.name}`, `Reg No: ${d.car.plateNumber}`, `${d.car.make} ${d.car.model}, ${d.car.color}`, 'Demo document - not real']);
      await putSample(licenseBackKey, ['SAMPLE DRIVING LICENSE - BACK', 'Classes: LMV, MCWG', 'Demo document - not real']);
      await putSample(insuranceKey, ['SAMPLE MOTOR INSURANCE POLICY', `Insured: ${m.user.name}`, `Vehicle: ${d.car.plateNumber}`, `Valid till: ${insuranceExpiry.toISOString().slice(0, 10)}`, 'Demo document - not real']);
      for (const side of ['front', 'side', 'inside']) await putSample(photoKey(side), [`SAMPLE VEHICLE PHOTO (${side.toUpperCase()})`, `${d.car.make} ${d.car.model} ${d.car.plateNumber}`, 'Demo document - not real']);
    } catch (e) {
      console.warn(`Could not upload sample documents (is storage running?): ${(e as Error).message}`);
    }
    await prisma.document.createMany({
      data: [
        { organizationId: acme.id, driverProfileId: profile.id, kind: 'DRIVING_LICENSE', storageKey: licenseKey, backStorageKey: licenseBackKey, number: 'KA0120190001234', expiresAt: d.licenseExpiry, dateOfBirth: new Date('1992-04-15'), vehicleClasses: ['LMV', 'MCWG'], status: docStatus },
        { organizationId: acme.id, driverProfileId: profile.id, vehicleId: vehicle.id, kind: 'VEHICLE_RC', storageKey: rcKey, number: `RC-${d.car.plateNumber.replace(/ /g, '')}`, expiresAt: d.rcExpiry, status: docStatus },
        { organizationId: acme.id, driverProfileId: profile.id, vehicleId: vehicle.id, kind: 'VEHICLE_INSURANCE', storageKey: insuranceKey, number: `POL-${d.car.plateNumber.replace(/ /g, '')}`, expiresAt: insuranceExpiry, status: docStatus },
        { organizationId: acme.id, driverProfileId: profile.id, vehicleId: vehicle.id, kind: 'VEHICLE_PHOTO_FRONT', storageKey: photoKey('front'), status: docStatus },
        { organizationId: acme.id, driverProfileId: profile.id, vehicleId: vehicle.id, kind: 'VEHICLE_PHOTO_SIDE', storageKey: photoKey('side'), status: docStatus },
        { organizationId: acme.id, driverProfileId: profile.id, vehicleId: vehicle.id, kind: 'VEHICLE_PHOTO_INSIDE', storageKey: photoKey('inside'), status: docStatus },
      ],
    });
  }

  console.log(`Seeded: super admin ${superEmail}, company "Acme Tech" (acme.test) with ${people.length} people. Admin web password: ${devPassword}`);
}

main().finally(() => prisma.$disconnect());