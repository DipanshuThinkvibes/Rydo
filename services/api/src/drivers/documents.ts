import type { Document, Vehicle } from '@prisma/client';
import { DOCUMENT_LABEL, EXPIRY_WARNING_DAYS, VEHICLE_PHOTO_KINDS, type DriverStep, type DriverStepStatus } from '@rydo/shared';

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
    hasBack: !!d.backStorageKey,
    vehicleClasses: d.vehicleClasses,
    check: d.checkStatus ? { status: d.checkStatus, notes: d.checkNotes, checkedAt: d.checkedAt?.toISOString() ?? null } : null,
    ...expiryFlags(d.expiresAt),
  };
}

/** The car or bike a driver drives with: the default one, else the first. */
export const mainVehicle = <V extends Pick<Vehicle, 'isDefault'>>(vehicles: V[]) => vehicles.find((v) => v.isDefault) ?? vehicles[0];

/** Kinds that need a back-side photo before HR can verify. */
const NEEDS_BACK: Document['kind'][] = ['DRIVING_LICENSE'];

/** One document's step status: what the driver still has to do, or where HR is with it. */
function stepFor(docs: (Document | undefined)[], label: string): Omit<DriverStep, 'key'> {
  if (docs.some((d) => !d)) {
    const missing = docs.filter((d) => !d).length;
    return docs.length > 1 && missing < docs.length ? { status: 'TODO', note: `${missing} still to add` } : { status: 'TODO', note: null };
  }
  const list = docs as Document[];
  const rejected = list.find((d) => d.status === 'REJECTED');
  if (rejected) return { status: 'NEEDS_ATTENTION', cause: 'REUPLOAD', note: `HR asked for a new upload: ${rejected.rejectReason ?? 'see your email'}` };
  const expired = list.find((d) => expiryFlags(d.expiresAt).expired);
  if (expired) return { status: 'NEEDS_ATTENTION', cause: 'EXPIRED', note: `${label} expired on ${expired.expiresAt!.toISOString().slice(0, 10)}. Upload the renewed one.` };
  const noBack = list.find((d) => NEEDS_BACK.includes(d.kind) && !d.backStorageKey);
  if (noBack) return { status: 'NEEDS_ATTENTION', cause: 'BACK_MISSING', note: 'Add a photo of the back side.' };
  const failed = list.find((d) => d.checkStatus === 'FAILED');
  if (failed) return { status: 'NEEDS_ATTENTION', cause: 'CHECK_FAILED', note: failed.checkNotes.find((n: string) => n.startsWith('✗'))?.slice(2) ?? 'This did not match government records. Check the number and upload again.' };
  if (list.every((d) => d.status === 'APPROVED')) return { status: 'DONE', note: null };
  return { status: 'IN_REVIEW', note: null };
}

/**
 * The checklist the driver app shows (Uber style): photo, licence, vehicle, RC, insurance, vehicle photos, guidelines.
 * Computed here so the app and HR see the same thing.
 */
export function driverChecklist(p: { documents: Document[]; vehicles: Vehicle[]; guidelinesAcceptedAt: Date | null }, hasPhoto: boolean): DriverStep[] {
  const docs = latestDocuments(p.documents);
  const vehicle = mainVehicle(p.vehicles);
  const forVehicle = (kind: Document['kind']) => (vehicle ? docs.find((d) => d.kind === kind && d.vehicleId === vehicle.id) : undefined);
  const step = (key: DriverStep['key'], s: Omit<DriverStep, 'key'>): DriverStep => ({ key, ...s });
  const noVehicle = { status: 'TODO' as const, note: 'Add your vehicle first.' };
  return [
    step('PHOTO', hasPhoto ? { status: 'DONE', note: null } : { status: 'TODO', note: null }),
    step('LICENCE', stepFor([docs.find((d) => d.kind === 'DRIVING_LICENSE')], DOCUMENT_LABEL.DRIVING_LICENSE)),
    step('VEHICLE', vehicle ? { status: 'DONE', note: null } : { status: 'TODO', note: null }),
    step('RC', vehicle ? stepFor([forVehicle('VEHICLE_RC')], DOCUMENT_LABEL.VEHICLE_RC) : noVehicle),
    step('INSURANCE', vehicle ? stepFor([forVehicle('VEHICLE_INSURANCE')], DOCUMENT_LABEL.VEHICLE_INSURANCE) : noVehicle),
    step('VEHICLE_PHOTOS', vehicle ? stepFor(VEHICLE_PHOTO_KINDS.map((k) => forVehicle(k)), 'Vehicle photo') : noVehicle),
    step('GUIDELINES', p.guidelinesAcceptedAt ? { status: 'DONE', note: null } : { status: 'TODO', note: null }),
  ];
}

export const DOC_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };
/** Vehicle photos must be photos. */
export const PHOTO_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
export const DOC_MAX_BYTES = 5 * 1024 * 1024;