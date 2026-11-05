import type { Document } from '@prisma/client';
import { EXPIRY_WARNING_DAYS } from '@rydo/shared';

/** The newest document per (kind, vehicle). Older uploads are kept as history. */
export function latestDocuments(docs: Document[]) {
  const latest = new Map<string, Document>();
  for (const d of [...docs].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) latest.set(`${d.kind}:${d.vehicleId ?? ''}`, d);
  return [...latest.values()];
}

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

export function expiryFlags(expiresAt: Date | null) {
  if (!expiresAt) return { expired: false, expiringSoon: false };
  const today = startOfToday();
  const soon = new Date(today.getTime() + EXPIRY_WARNING_DAYS * 86_400_000);
  return { expired: expiresAt < today, expiringSoon: expiresAt >= today && expiresAt <= soon };
}

export function documentView(d: Document) {
  return {
    id: d.id,
    kind: d.kind,
    number: d.number,
    vehicleId: d.vehicleId,
    expiresAt: d.expiresAt?.toISOString().slice(0, 10) ?? null,
    status: d.status,
    rejectReason: d.rejectReason,
    uploadedAt: d.createdAt,
    ...expiryFlags(d.expiresAt),
  };
}

export const DOC_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };
export const DOC_MAX_BYTES = 5 * 1024 * 1024;