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

export const vehicleSchema = z
  .object({
    type: z.enum(['CAR', 'BIKE']),
    /** Hatchback / Sedan / SUV. Optional, cars only. */
    carType: z.enum(['HATCHBACK', 'SEDAN', 'SUV']).optional(),
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

/** Form fields sent with a document photo (multipart). */
export const documentMetaSchema = z.object({
  kind: z.enum(['DRIVING_LICENSE', 'VEHICLE_RC']),
  number: z.string().trim().min(4).max(40),
  expiresAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
    .refine((d) => new Date(d) > new Date(), 'This document has already expired'),
  vehicleId: z.string().uuid().optional(),
});
export type DocumentMeta = z.infer<typeof documentMetaSchema>;

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