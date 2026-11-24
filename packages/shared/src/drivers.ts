import { z } from 'zod';

export const driverProfileSchema = z.object({
  approvalMode: z.enum(['MANUAL', 'AUTO_TEAM']).optional(),
  /** Draft details, saved as the driver fills the form in. */
  details: z.lazy(() => driverDetailsSchema.partial()).optional(),
  preferences: z
    .object({ ac: z.boolean(), noSmoking: z.boolean(), quiet: z.boolean(), musicOk: z.boolean(), womenRidersOnly: z.boolean() })
    .partial()
    .optional(),
});
export type DriverProfileInput = z.infer<typeof driverProfileSchema>;

export const FUEL_TYPES = ['PETROL', 'DIESEL', 'CNG', 'ELECTRIC', 'HYBRID'] as const;
export const FUEL_LABEL: Record<(typeof FUEL_TYPES)[number], string> = { PETROL: 'Petrol', DIESEL: 'Diesel', CNG: 'CNG', ELECTRIC: 'Electric', HYBRID: 'Hybrid' };

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
    /** Year the vehicle was made. Optional, but checked when given. */
    manufactureYear: z.number().int().min(1990, 'Enter a year from 1990').max(new Date().getFullYear() + 1, 'That year is in the future').optional(),
    fuelType: z.enum(FUEL_TYPES).optional(),
  })
  .refine((v) => v.type === 'CAR' || v.seatCapacity === 1, { message: 'A bike carries one passenger', path: ['seatCapacity'] })
  .refine((v) => v.type === 'CAR' || !v.carType, { message: 'Only cars have a car type', path: ['carType'] });
export type VehicleInput = z.infer<typeof vehicleSchema>;

/** Papers with a number and an end date, and the three photos that let HR check a vehicle without a visit. */
export const PAPER_KINDS = ['DRIVING_LICENSE', 'VEHICLE_RC', 'INSURANCE'] as const;
export const VEHICLE_PHOTO_KINDS = ['VEHICLE_PHOTO_FRONT', 'VEHICLE_PHOTO_SIDE', 'VEHICLE_PHOTO_INSIDE'] as const;
export const VEHICLE_PHOTO_INFO: Record<(typeof VEHICLE_PHOTO_KINDS)[number], { title: string; hint: string }> = {
  VEHICLE_PHOTO_FRONT: { title: 'Front, number plate readable', hint: 'Stand 2 to 3 metres in front of the vehicle.' },
  VEHICLE_PHOTO_SIDE: { title: 'Side, whole vehicle', hint: 'From the left or right, in daylight.' },
  VEHICLE_PHOTO_INSIDE: { title: 'Inside, seats visible', hint: 'From the back door, so riders see the seats.' },
};
export const DOCUMENT_KINDS = [...PAPER_KINDS, ...VEHICLE_PHOTO_KINDS] as const;
export type DocumentKindName = (typeof DOCUMENT_KINDS)[number];
export const DOCUMENT_LABEL: Record<DocumentKindName, string> = {
  DRIVING_LICENSE: 'Driving licence',
  VEHICLE_RC: 'Vehicle RC',
  INSURANCE: 'Vehicle insurance',
  VEHICLE_PHOTO_FRONT: 'Front photo (number plate)',
  VEHICLE_PHOTO_SIDE: 'Side photo',
  VEHICLE_PHOTO_INSIDE: 'Inside photo',
};

/** Form fields sent with a document photo (multipart). Papers need a number and an end date; vehicle photos need neither. */
export const documentMetaSchema = z
  .object({
    kind: z.enum(DOCUMENT_KINDS),
    number: z.string().trim().min(4).max(40).optional(),
    expiresAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
      .refine((d) => new Date(d) > new Date(), 'This document has already expired')
      .optional(),
    vehicleId: z.string().uuid().optional(),
  })
  .superRefine((v, ctx) => {
    if ((PAPER_KINDS as readonly string[]).includes(v.kind)) {
      if (!v.number) ctx.addIssue({ code: 'custom', path: ['number'], message: 'Enter the number as printed (at least 4 characters)' });
      if (!v.expiresAt) ctx.addIssue({ code: 'custom', path: ['expiresAt'], message: 'Enter the end date' });
    }
  });
export type DocumentMeta = z.infer<typeof documentMetaSchema>;

/** Licence classes. A car needs LMV; a bike needs a motorcycle class. */
export const LICENSE_CLASSES = ['LMV', 'MCWG', 'MCWOG', 'LMV_MCWG'] as const;
export type LicenseClass = (typeof LICENSE_CLASSES)[number];
export const LICENSE_CLASS_LABEL: Record<LicenseClass, string> = {
  LMV: 'Light motor vehicle (car)',
  MCWG: 'Motorcycle with gear',
  MCWOG: 'Motorcycle without gear',
  LMV_MCWG: 'Car and motorcycle with gear',
};
/** Which classes may drive which vehicle. */
export const LICENSE_ALLOWS: Record<'CAR' | 'BIKE', readonly LicenseClass[]> = { CAR: ['LMV', 'LMV_MCWG'], BIKE: ['MCWG', 'MCWOG', 'LMV_MCWG'] };
export const MIN_DRIVER_AGE = 18;

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
/** Whole years between a date of birth and today. */
export function ageOn(dob: string | Date, today: Date = new Date()) {
  const d = new Date(dob);
  let a = today.getFullYear() - d.getFullYear();
  if (today.getMonth() < d.getMonth() || (today.getMonth() === d.getMonth() && today.getDate() < d.getDate())) a--;
  return a;
}

/** About the driver. Saved as a draft while filling in; sent with the declaration when applying. */
export const driverDetailsSchema = z.object({
  dateOfBirth: day.refine((d) => ageOn(d) >= MIN_DRIVER_AGE, `You must be at least ${MIN_DRIVER_AGE} to drive`).refine((d) => ageOn(d) <= 80, 'Check the date of birth'),
  licenseClass: z.enum(LICENSE_CLASSES),
  /** Optional: the checklist does not ask for it, but it is kept if given. */
  drivingSince: z.number().int().min(1960, 'Enter a year from 1960').max(new Date().getFullYear(), 'That year is in the future').optional(),
});
export type DriverDetails = z.infer<typeof driverDetailsSchema>;

/**
 * Sent when the driver sends the application to HR. The details are normally already saved, so everything here is optional
 * (it can still carry them). The safety guidelines are agreed separately (see driverGuidelinesSchema).
 */
export const driverApplySchema = driverDetailsSchema.partial();
export const driverGuidelinesSchema = z.object({ agree: z.literal(true, { errorMap: () => ({ message: 'Please agree to the guidelines to continue' }) }) });
export type DriverApply = z.infer<typeof driverApplySchema>;

/** HR's "Verify driver". Government-record checks that failed need an explicit yes. */
export const verifyDriverSchema = z.object({ ignoreFailedChecks: z.boolean().default(false) });
export type VerifyDriver = z.infer<typeof verifyDriverSchema>;

/** Result of checking a paper against government records (Sarathi for licences, Vahan for vehicles). */
export const CHECK_STATUSES = ['PASSED', 'WARNING', 'FAILED', 'UNAVAILABLE'] as const;
export type CheckStatusName = (typeof CHECK_STATUSES)[number];
export interface DocumentCheckView {
  status: CheckStatusName;
  /** Plain sentences for HR, starting with "✓ ", "! " or "✗ ", e.g. "✓ Name matches (RAHUL MEHTA)." */
  notes: string[];
  checkedAt: string | null;
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
/** The safety guidelines every driver reads and agrees to (the last step of the checklist). */
export const DRIVER_GUIDELINES: { title: string; text: string }[] = [
  { title: 'Check the PIN', text: 'Every rider has a 4-digit PIN. Ask for it before they get in; the ride starts only with the right PIN.' },
  { title: 'Check who gets in', text: "Look at the rider's photo in the app. If the person or the vehicle does not match, do not start the ride: cancel and report it." },
  { title: 'SOS is one tap away', text: "If something feels wrong, press SOS in the trip screen. Your company's admins are alerted at once with your location. In an emergency, call 112 first." },
  { title: 'Respect women-only rides', text: 'If you offer women-only rides, only women riders can book them. Never pressure anyone about a seat.' },
  { title: 'Costs are shared, not charged', text: 'RYDO does not take payments. Any cost-share figure is an estimate to agree together. No cash demands, no surge.' },
  { title: 'Drive safely and on time', text: 'Valid licence, insurance and a roadworthy vehicle, always. No phone while driving. Late cancellations lower your reliability score.' },
];

/** Why a rider or driver cancels at pickup because something does not match. */
export const MISMATCH_KINDS = ['WRONG_PERSON', 'WRONG_VEHICLE', 'VEHICLE_NOT_VERIFIED'] as const;
export type MismatchKind = (typeof MISMATCH_KINDS)[number];
export const mismatchSchema = z.object({ kind: z.enum(MISMATCH_KINDS), note: z.string().trim().max(300).optional() });
export type MismatchInput = z.infer<typeof mismatchSchema>;
/** What each side can report, in their own words. A driver can only report the rider; a rider can report the driver or the vehicle. */
export const MISMATCH_OPTIONS: Record<'RIDER' | 'DRIVER', { kind: MismatchKind; label: string; hint: string }[]> = {
  RIDER: [
    { kind: 'WRONG_PERSON', label: 'The driver is not the person in the photo', hint: 'You can cancel and find another driver.' },
    { kind: 'WRONG_VEHICLE', label: 'The vehicle is not the one shown', hint: 'The plate, colour or model is different.' },
    { kind: 'VEHICLE_NOT_VERIFIED', label: 'The vehicle is not verified', hint: 'It does not show as a verified vehicle.' },
  ],
  DRIVER: [{ kind: 'WRONG_PERSON', label: 'The rider is not the person in the photo', hint: 'The person who came is not the person who booked.' }],
};
export const MISMATCH_LABEL: Record<MismatchKind, string> = { WRONG_PERSON: 'wrong person', WRONG_VEHICLE: 'wrong vehicle', VEHICLE_NOT_VERIFIED: 'vehicle not verified' };
/** Two reports like this within this many days go to RYDO staff, who can pause the person for a while. */
export const MISMATCH_REPEAT_DAYS = 90;

/** How long RYDO staff can pause a person. null = until RYDO lifts it (Super Admin only). */
export const BLOCK_DAYS = [1, 3, 7, 14, 30] as const;
export const SUPPORT_MAX_BLOCK_DAYS = 30;
