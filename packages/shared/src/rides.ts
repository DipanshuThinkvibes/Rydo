import { z } from 'zod';
import { placeSchema } from './maps';
import { CAR_TYPES, type CarType } from './drivers';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour time like 08:30');

/** What a verified driver publishes once; rides are generated from it for the next 14 days. */
export const ridePlanSchema = z
  .object({
    vehicleId: z.string().uuid(),
    origin: placeSchema,
    destination: placeSchema,
    departTime: hhmm,
    returnTime: hhmm.optional(),
    daysOfWeek: z.array(z.number().int().min(1).max(7)).max(7).default([]),
    oneOffDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    seats: z.number().int().min(1).max(6),
    womenOnly: z.boolean().default(false),
    notes: z.string().trim().max(200).optional(),
  })
  .refine((p) => p.daysOfWeek.length > 0 || !!p.oneOffDate, { message: 'Pick repeat days or a date', path: ['daysOfWeek'] });
export type RidePlanInput = z.infer<typeof ridePlanSchema>;

export const RIDE_DAYS_AHEAD = 14;

export const rideSearchSchema = z.object({
  pickup: placeSchema,
  drop: placeSchema,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fromTime: hhmm,
  toTime: hhmm,
  seats: z.number().int().min(1).max(4).default(1),
  vehicleType: z.enum(['CAR', 'BIKE']).optional(),
  /** Only these car types (CAR_TYPES). Rides whose car type is not set never match a car-type filter. */
  carTypes: z.array(z.enum(CAR_TYPES)).min(1).max(CAR_TYPES.length).optional(),
  /** true = AC only, false = non-AC only, left out = either. */
  ac: z.boolean().optional(),
  womenOnly: z.boolean().default(false),
});
export type RideSearch = z.infer<typeof rideSearchSchema>;

export interface RideMatch {
  rideId: string;
  score: number;
  reasons: string[];
  departAt: string;
  pickupEta: string;
  dropEta: string;
  pickupDistanceMeters: number;
  dropDistanceMeters: number;
  seatsLeft: number;
  womenOnly: boolean;
  alreadyRequested: boolean;
  /** My own open request on this ride, if any (ACCEPTED = I'm booked). */
  requestStatus: 'PENDING' | 'ACCEPTED' | null;
  /** The rider saved this driver as a preferred driver. */
  preferred: boolean;
  driver: { membershipId: string; name: string; rating: number | null; ratingCount: number };
  vehicle: { type: 'CAR' | 'BIKE'; carType: CarType | null; make: string; model: string; color: string; plateNumber: string; hasAc: boolean };
  from: string;
  to: string;
  /** The driver's road route as an encoded polyline (simplified for maps). */
  route: string | null;
}

export const rideRequestSchema = z.object({
  pickup: placeSchema,
  drop: placeSchema,
  seats: z.number().int().min(1).max(4).default(1),
  autoRematch: z.boolean().default(true),
});
export type RideRequestInput = z.infer<typeof rideRequestSchema>;

export const cancelSchema = z.object({ reason: z.string().trim().max(200).optional() });

export const adminRidesQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(['SCHEDULED', 'FULL', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
});