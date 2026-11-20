import { z } from 'zod';

export const driverProfileSchema = z.object({
  approvalMode: z.enum(['MANUAL', 'AUTO_TEAM']).optional(),
  preferences: z
    .object({ ac: z.boolean(), noSmoking: z.boolean(), quiet: z.boolean(), musicOk: z.boolean(), womenRidersOnly: z.boolean() })
    .partial()
    .optional(),
});
export type DriverProfileInput = z.infer<typeof driverProfileSchema>;

/** Indian plates like "KA 01 AB 1234": stored upper-case with single spaces. */
const plate = z
  .string()
  .trim()
  .toUpperCase()
  .transform((s) => s.replace(/\s+/g, ' '))
  .pipe(z.string().regex(/^[A-Z]{2} ?\d{1,2} ?[A-Z]{0,3} ?\d{1,4}$/, 'Enter a plate like KA 01 AB 1234'));

/** Body types a driver can pick for their car (any car fits one of them; OTHER when unsure). */
export const CAR_TYPES = ['HATCHBACK', 'SEDAN', 'COMPACT_SUV', 'SUV', 'MUV', 'LUXURY', 'OTHER'] as const;
export type CarType = (typeof CAR_TYPES)[number];
export const CAR_TYPE_LABEL: Record<CarType, string> = {
  HATCHBACK: 'Hatchback',
  SEDAN: 'Sedan',
  COMPACT_SUV: 'Compact SUV',
  SUV: 'SUV',
  MUV: 'MUV / MPV',
  LUXURY: 'Luxury',
  OTHER: 'Other',
};

export const vehicleSchema = z
  .object({
    type: z.enum(['CAR', 'BIKE']),
    /** Body type (CAR_TYPES). Optional, cars only. */
    carType: z.enum(CAR_TYPES).optional(),
    make: z.string().trim().min(2).max(40),
    model: z.string().trim().min(1).max(40),
    color: z.string().trim().min(3).max(30),
    plateNumber: plate,
    seatCapacity: z.number().int().min(1).max(6),
    hasAc: z.boolean().default(true),
    isDefault: z.boolean().default(true),
  })
  .refine((v) => v.type === 'CAR' || v.seatCapacity === 1, { message: 'A bike carries one passenger', path: ['seatCapacity'] })
  .refine((v) => v.type === 'CAR' || !v.carType, { message: 'Only cars have a car type', path: ['carType'] });
export type VehicleInput = z.infer<typeof vehicleSchema>;

/** Every document a driver can upload. Photos of the vehicle have no number or expiry. */
export const DOCUMENT_KINDS = ['DRIVING_LICENSE', 'VEHICLE_RC', 'VEHICLE_INSURANCE', 'VEHICLE_PHOTO_FRONT', 'VEHICLE_PHOTO_SIDE', 'VEHICLE_PHOTO_INSIDE'] as const;
export type DocumentKindName = (typeof DOCUMENT_KINDS)[number];
/** Kinds that carry a number and an expiry date (and are checked against government records where possible). */
export const PAPER_KINDS = ['DRIVING_LICENSE', 'VEHICLE_RC', 'VEHICLE_INSURANCE'] as const satisfies readonly DocumentKindName[];
export const VEHICLE_PHOTO_KINDS = ['VEHICLE_PHOTO_FRONT', 'VEHICLE_PHOTO_SIDE', 'VEHICLE_PHOTO_INSIDE'] as const satisfies readonly DocumentKindName[];
export const DOCUMENT_LABEL: Record<DocumentKindName, string> = {
  DRIVING_LICENSE: 'Driving licence',
  VEHICLE_RC: 'Vehicle RC',
  VEHICLE_INSURANCE: 'Vehicle insurance',
  VEHICLE_PHOTO_FRONT: 'Front photo (number plate)',
  VEHICLE_PHOTO_SIDE: 'Side photo',
  VEHICLE_PHOTO_INSIDE: 'Inside photo',
};

/** Licence classes printed on Indian driving licences: cars (LMV) and two-wheelers with/without gear. */
export const LICENCE_CLASSES = ['LMV', 'MCWG', 'MCWOG'] as const;
export type LicenceClass = (typeof LICENCE_CLASSES)[number];
export const LICENCE_CLASS_LABEL: Record<LicenceClass, string> = { LMV: 'Car (LMV)', MCWG: 'Bike with gear (MCWG)', MCWOG: 'Scooter without gear (MCWOG)' };
/** Which licence classes allow driving a vehicle type on RYDO. */
export const CLASSES_FOR: Record<'CAR' | 'BIKE', LicenceClass[]> = { CAR: ['LMV'], BIKE: ['MCWG', 'MCWOG'] };

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const future = isoDate.refine((d) => new Date(d) > new Date(), 'This document has already expired');

/**
 * Form fields sent with a document upload (multipart: "file" is the front or the photo, "back" the back side).
 * Multipart sends text only, so vehicleClasses comes as "LMV,MCWG".
 */
export const documentMetaSchema = z
  .object({
    kind: z.enum(DOCUMENT_KINDS),
    number: z.string().trim().toUpperCase().min(4).max(40).optional(),
    expiresAt: future.optional(),
    vehicleId: z.string().uuid().optional(),
    /** Driving licence only: the holder's date of birth, which licence checks need. */
    dateOfBirth: isoDate.refine((d) => new Date(d) < new Date(), 'Enter your date of birth').optional(),
    /** Driving licence only. */
    vehicleClasses: z
      .string()
      .transform((s) => s.split(',').map((x) => x.trim().toUpperCase()).filter(Boolean))
      .refine((a) => a.length > 0 && a.every((c) => (LICENCE_CLASSES as readonly string[]).includes(c)), 'Pick what your licence covers')
      .transform((a) => a as LicenceClass[])
      .optional(),
  })
  .superRefine((m, ctx) => {
    const paper = (PAPER_KINDS as readonly string[]).includes(m.kind);
    if (paper && !m.number) ctx.addIssue({ code: 'custom', path: ['number'], message: 'Enter the number on the document' });
    if (paper && !m.expiresAt) ctx.addIssue({ code: 'custom', path: ['expiresAt'], message: 'Enter the date it is valid till' });
    if (m.kind !== 'DRIVING_LICENSE' && !m.vehicleId) ctx.addIssue({ code: 'custom', path: ['vehicleId'], message: 'Pick your vehicle' });
    if (m.kind === 'DRIVING_LICENSE' && !m.dateOfBirth) ctx.addIssue({ code: 'custom', path: ['dateOfBirth'], message: 'Enter your date of birth' });
    if (m.kind === 'DRIVING_LICENSE' && !m.vehicleClasses?.length) ctx.addIssue({ code: 'custom', path: ['vehicleClasses'], message: 'Pick what your licence covers' });
  });
export type DocumentMeta = z.infer<typeof documentMetaSchema>;

/** HR's "Verify driver". Checks that failed against government records need an explicit yes. */
export const verifyDriverSchema = z.object({ ignoreFailedChecks: z.boolean().default(false) });
export type VerifyDriver = z.infer<typeof verifyDriverSchema>;

/** Result of checking a document against government records (Sarathi for licences, Vahan for vehicles). */
export const CHECK_STATUSES = ['PASSED', 'WARNING', 'FAILED', 'UNAVAILABLE'] as const;
export type CheckStatusName = (typeof CHECK_STATUSES)[number];
export interface DocumentCheckView {
  status: CheckStatusName;
  /** Plain sentences for HR, e.g. "Name on the licence matches", "Insurance valid till 2027-03-01". */
  notes: string[];
  checkedAt: string;
}

/** The steps of becoming a driver, as the app's checklist shows them (computed by the API). */
export const DRIVER_STEPS = ['PHOTO', 'LICENCE', 'VEHICLE', 'RC', 'INSURANCE', 'VEHICLE_PHOTOS', 'GUIDELINES'] as const;
export type DriverStepName = (typeof DRIVER_STEPS)[number];
export type DriverStepStatus = 'TODO' | 'IN_REVIEW' | 'DONE' | 'NEEDS_ATTENTION';
export interface DriverStep {
  key: DriverStepName;
  status: DriverStepStatus;
  /** Why it needs attention: HR's reason, an expiry, or a failed check. */
  note: string | null;
  /** Set when status is NEEDS_ATTENTION. Only CHECK_FAILED can be overridden by HR. */
  cause?: 'REUPLOAD' | 'EXPIRED' | 'BACK_MISSING' | 'CHECK_FAILED';
}

export const driverListQuerySchema = z.object({
  status: z.enum(['PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED']).optional(),
  q: z.string().trim().max(100).optional(),
});

export const requestReuploadSchema = z.object({
  documentIds: z.array(z.string().uuid()).min(1, 'Pick at least one document'),
  reason: z.string().trim().min(3).max(300),
});
export type RequestReupload = z.infer<typeof requestReuploadSchema>;

/** Documents expiring within this many days are flagged to HR. */
export const EXPIRY_WARNING_DAYS = 30;