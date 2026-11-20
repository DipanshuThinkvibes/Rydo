import { INestApplication } from '@nestjs/common';
import { OrgRole } from '@prisma/client';
import { FakeMessages, signIn } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

export const HOME = { lat: 12.9116, lng: 77.6474 };
export const MID = { lat: 12.9188, lng: 77.662 };
export const OFFICE = { lat: 12.9259, lng: 77.6766 };
export const tomorrow = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(Date.now() + 86_400_000));
export const pt = (p: { lat: number; lng: number }) => `ST_SetSRID(ST_MakePoint(${p.lng}, ${p.lat}), 4326)::geography`;

/**
 * A small company for the engagement tests: a driver with one ride tomorrow at 08:30, two riders (priya, arjun) with
 * confirmed seats, a rider without a seat (kiran), HR and Ops admins, and a second company for cross-company checks.
 */
export async function buildWorld(app: INestApplication, messages: FakeMessages, prisma: PrismaService, suffix = 'e') {
  const domain = `${suffix}.test`;
  const org = (await prisma.organization.create({ data: { licenses: { create: [{ product: 'SHARE' }] }, name: `${suffix} Co`, slug: suffix, emailDomains: [domain], status: 'ACTIVE' } })).id;
  const other = (await prisma.organization.create({ data: { licenses: { create: [{ product: 'SHARE' }] }, name: `${suffix} Other`, slug: `${suffix}-o`, emailDomains: [`o-${domain}`], status: 'ACTIVE' } })).id;
  const tokens: Record<string, string> = {};
  const ms: Record<string, string> = {};
  const users: Record<string, string> = {};
  const emails: Record<string, string> = {};

  async function person(key: string, roles: OrgRole[], orgId = org) {
    const email = (orgId === org ? `${key}@${domain}` : `${key}@o-${domain}`).toLowerCase(); // the API lower-cases emails
    const user = await prisma.user.create({ data: { email, name: `${key} person` } });
    users[key] = user.id;
    emails[key] = email;
    ms[key] = (await prisma.membership.create({ data: { organizationId: orgId, userId: user.id, status: 'ACTIVE', roles: { create: roles.map((role) => ({ role })) } } })).id;
    tokens[key] = (await signIn(app, messages, email)).accessToken;
  }
  const as = (key: string, orgId = org) => ({ Authorization: `Bearer ${tokens[key]}`, 'x-org-id': orgId });

  await prisma.$executeRawUnsafe(`INSERT INTO offices (id, organization_id, name, address, location, is_default) VALUES (gen_random_uuid(), '${org}', 'Office', 'ORR', ${pt(OFFICE)}, true)`);
  await person('driver', ['RIDER', 'DRIVER']);
  for (const k of ['priya', 'arjun', 'kiran', 'stranger']) await person(k, ['RIDER']);
  await person('hr', ['HR_ADMIN']);
  await person('ops', ['OPS_ADMIN']);
  await person('outsider', ['ORG_ADMIN'], other);
  await person('outsiderRider', ['RIDER'], other);

  const profile = await prisma.driverProfile.create({ data: { membershipId: ms.driver, status: 'VERIFIED' } });
  const vehicle = await prisma.vehicle.create({
    data: { organizationId: org, driverProfileId: profile.id, type: 'CAR', carType: 'SEDAN', make: 'Honda', model: 'City', color: 'White', plateNumber: 'KA 01 EE 0001', seatCapacity: 3, hasAc: true, isDefault: true },
  });
  const [r] = await prisma.$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO rides (id, organization_id, driver_membership_id, vehicle_id, direction, origin_label, origin, destination_label, destination, route_line,
      distance_meters, duration_seconds, depart_at, seats_total, seats_booked, women_only, status, created_at, updated_at)
    VALUES (gen_random_uuid(), '${org}', '${ms.driver}', '${vehicle.id}', 'TO_OFFICE', 'Home', ${pt(HOME)}, 'Office', ${pt(OFFICE)},
      ST_GeogFromText('LINESTRING(${HOME.lng} ${HOME.lat}, ${MID.lng} ${MID.lat}, ${OFFICE.lng} ${OFFICE.lat})'),
      3500, 1200, ('${tomorrow}'::date + time '08:30') AT TIME ZONE 'Asia/Kolkata', 3, 2, false, 'SCHEDULED', now(), now()) RETURNING id`);
  const rideId = r.id;

  const bookings: Record<string, string> = {};
  async function book(key: string, pin: string) {
    const [rq] = await prisma.$queryRawUnsafe<{ id: string }[]>(`
      INSERT INTO ride_requests (id, organization_id, ride_id, rider_membership_id, seats, pickup_label, pickup, drop_label, drop, auto_rematch, status, expires_at, created_at)
      VALUES (gen_random_uuid(), '${org}', '${rideId}', '${ms[key]}', 1, 'Stop', ${pt(MID)}, 'Office', ${pt(OFFICE)}, false, 'ACCEPTED', now(), now()) RETURNING id`);
    const [b] = await prisma.$queryRawUnsafe<{ id: string }[]>(`
      INSERT INTO bookings (id, organization_id, ride_id, request_id, rider_membership_id, seats, pickup_label, pickup, drop_label, drop, pin, status, created_at, updated_at)
      VALUES (gen_random_uuid(), '${org}', '${rideId}', '${rq.id}', '${ms[key]}', 1, 'Stop', ${pt(MID)}, 'Office', ${pt(OFFICE)}, '${pin}', 'CONFIRMED', now(), now()) RETURNING id`);
    bookings[key] = b.id;
  }
  await book('priya', '1111');
  await book('arjun', '2222');

  return { org, other, tokens, ms, users, emails, as, rideId, vehicleId: vehicle.id, bookings, person, domain };
}
export type World = Awaited<ReturnType<typeof buildWorld>>;
