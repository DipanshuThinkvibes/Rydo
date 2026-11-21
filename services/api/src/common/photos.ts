import { StorageAdapter } from '../adapters/storage.adapter';
import { PrismaService } from '../prisma/prisma.service';

/** How long a photo link works. Short: the page asks again when it reloads. */
const SECONDS = 600;

/** Profile photos by membership: a short-lived link for each person who has one, null for those who do not. */
export async function profilePhotoUrls(prisma: PrismaService, storage: StorageAdapter, membershipIds: string[]): Promise<Map<string, string | null>> {
  const ids = [...new Set(membershipIds)];
  const out = new Map<string, string | null>(ids.map((i) => [i, null]));
  if (!ids.length) return out;
  const rows = await prisma.membership.findMany({ where: { id: { in: ids } }, select: { id: true, user: { select: { photoKey: true } } } });
  await Promise.all(
    rows.map(async (r) => {
      if (r.user.photoKey) out.set(r.id, await storage.signedReadUrl(r.user.photoKey, SECONDS).catch(() => null));
    }),
  );
  return out;
}

/** The front photo of each vehicle (the one where the number plate is readable), if its driver uploaded one. */
export async function vehicleFrontPhotoUrls(prisma: PrismaService, storage: StorageAdapter, vehicleIds: string[]): Promise<Map<string, string | null>> {
  const ids = [...new Set(vehicleIds)];
  const out = new Map<string, string | null>(ids.map((i) => [i, null]));
  if (!ids.length) return out;
  const docs = await prisma.document.findMany({ where: { vehicleId: { in: ids }, kind: 'VEHICLE_PHOTO_FRONT' }, orderBy: { createdAt: 'asc' }, select: { vehicleId: true, storageKey: true } });
  const latest = new Map<string, string>();
  for (const d of docs) if (d.vehicleId) latest.set(d.vehicleId, d.storageKey); // oldest first, so the newest wins
  await Promise.all([...latest].map(async ([v, key]) => out.set(v, await storage.signedReadUrl(key, SECONDS).catch(() => null))));
  return out;
}
