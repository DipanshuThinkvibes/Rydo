import type { CarType, DocumentCheckView, DocumentKindName, DriverStep, DriverStepName, LicenseClass } from '@rydo/shared';
import { api } from './api';
import { appendFile, type Picked } from './photo';
import type { Vehicle } from './types';
import type { IconName } from '@/components/icons';

/** A driver document as GET /driver/profile and GET /admin/drivers return it. */
export interface DriverDocument {
  id: string;
  kind: DocumentKindName;
  number: string | null;
  vehicleId: string | null;
  expiresAt: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectReason: string | null;
  uploadedAt: string;
  hasBack: boolean;
  /** Government records check (licence, RC, insurance); null for photos. */
  check: DocumentCheckView | null;
  expired: boolean;
  expiringSoon: boolean;
}

export type DriverVehicle = Vehicle & { carType?: CarType | null };

/** GET /driver/profile (null until the driver starts). */
export interface DriverSignup {
  id: string;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'EXPIRED';
  approvalMode: 'MANUAL' | 'AUTO_TEAM';
  preferences: Partial<Record<'ac' | 'noSmoking' | 'quiet' | 'musicOk' | 'womenRidersOnly', boolean>>;
  verifiedAt: string | null;
  guidelinesAcceptedAt: string | null;
  /** Saved on the licence step; checked for age and vehicle type. */
  details: { dateOfBirth: string | null; licenseClass: LicenseClass | null; drivingSince: number | null } | null;
  vehicles: DriverVehicle[];
  documents: DriverDocument[];
  checklist: DriverStep[];
}

/** One row of HR's review queue (GET /admin/drivers). */
export interface DriverForReview {
  id: string;
  membershipId: string;
  name: string;
  email: string;
  department: string | null;
  status: DriverSignup['status'];
  needsReview: boolean;
  hasExpiryWarning: boolean;
  hasPhoto: boolean;
  guidelinesAcceptedAt: string | null;
  details: { licenseClass: LicenseClass | null; drivingSince: number | null; age: number | null } | null;
  checklist: DriverStep[];
  vehicles: DriverVehicle[];
  documents: DriverDocument[];
}

/** What each checklist step is called in the app (same order as the API's checklist). */
export const STEP_INFO: Record<DriverStepName, { title: string; sub: string; icon: IconName }> = {
  PHOTO: { title: 'Profile photo', sub: 'So riders know who is picking them up', icon: 'star' },
  LICENCE: { title: 'Driving licence', sub: 'Both sides, number and expiry', icon: 'shield' },
  VEHICLE: { title: 'Vehicle details', sub: 'Car or bike, number plate, seats', icon: 'car' },
  RC: { title: 'Registration certificate (RC)', sub: 'The RC of this vehicle', icon: 'building' },
  INSURANCE: { title: 'Vehicle insurance', sub: 'Policy number and expiry', icon: 'lock' },
  VEHICLE_PHOTOS: { title: 'Vehicle photos', sub: 'Front with plate, side and inside', icon: 'search' },
  GUIDELINES: { title: 'Safety and guidelines', sub: 'Short read, then agree', icon: 'flag' },
};

export const STATUS_LOOK: Record<DriverStep['status'], { label: string; tone: 'success' | 'warning' | 'neutral' | 'danger' }> = {
  DONE: { label: 'done', tone: 'success' },
  IN_REVIEW: { label: 'with HR', tone: 'warning' },
  TODO: { label: 'to do', tone: 'neutral' },
  NEEDS_ATTENTION: { label: 'needs attention', tone: 'danger' },
};

/** "✓ …", "! …", "✗ …" notes from the records check, split into level and text. */
export const noteParts = (n: string) => ({ level: n.startsWith('✓') ? 'ok' : n.startsWith('✗') ? 'fail' : 'warn', text: n.slice(2) }) as const;

export const mainVehicle = (vehicles: DriverVehicle[]) => vehicles.find((v) => v.isDefault) ?? vehicles[0];

/** The newest document of a kind (for a vehicle where it belongs to one). */
export const latestOf = (docs: DriverDocument[], kind: DocumentKindName, vehicleId?: string) =>
  docs.filter((d) => d.kind === kind && (kind === 'DRIVING_LICENSE' || d.vehicleId === vehicleId)).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))[0];

/** POST /driver/documents as multipart: fields, "file" (front or photo) and optional "fileBack". */
export async function uploadDocument(
  fields: { kind: DocumentKindName; number?: string; expiresAt?: string; vehicleId?: string },
  front: Picked,
  back?: Picked | null,
) {
  const form = new FormData();
  form.append('kind', fields.kind);
  if (fields.number) form.append('number', fields.number.trim());
  if (fields.expiresAt) form.append('expiresAt', fields.expiresAt.trim());
  if (fields.vehicleId) form.append('vehicleId', fields.vehicleId);
  await appendFile(form, 'file', front);
  if (back) await appendFile(form, 'fileBack', back);
  return api<DriverDocument>('POST', '/driver/documents', form);
}

/** YYYY-MM-DD typed by hand: right shape and a real date. */
export const isIsoDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s.trim()) && !Number.isNaN(new Date(s.trim()).getTime());
