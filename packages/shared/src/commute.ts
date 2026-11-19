import { z } from 'zod';
import { placeSchema } from './maps';
import { rideSearchSchema } from './rides';

/** Release 1.1: preferred drivers, waitlist, commute planner. */

export const preferredDriverSchema = z.object({ driverMembershipId: z.string().uuid() });

/** "Tell me (or ask for me) when a seat appears." Same fields as a search. */
export const waitlistCreateSchema = rideSearchSchema.extend({
  /** true: RYDO sends the seat request for you; false: only notifies you. */
  autoRequest: z.boolean().default(true),
});
export type WaitlistCreate = z.infer<typeof waitlistCreateSchema>;

export const homePlaceSchema = placeSchema;

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour time like 08:30');
export const COMMUTE_STATUSES = ['OFFICE', 'WFH', 'LEAVE'] as const;
export const commuteDaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(COMMUTE_STATUSES),
  /** When you want to reach / leave the office. Null = no ride needed that way. */
  toOfficeTime: hhmm.nullable().optional(),
  toHomeTime: hhmm.nullable().optional(),
  autoBook: z.boolean().default(true),
});
export const commuteUpdateSchema = z.object({ days: z.array(commuteDaySchema).min(1).max(31) });
export type CommuteUpdate = z.infer<typeof commuteUpdateSchema>;

export type LegState =
  | { state: 'BOOKED'; rideId: string; driverName: string; departAt: string }
  | { state: 'REQUESTED'; rideId: string; driverName: string; departAt: string }
  | { state: 'WAITLISTED'; waitlistId: string }
  | { state: 'NONE' };

export interface CommuteDayView {
  date: string;
  planned: boolean;
  status: (typeof COMMUTE_STATUSES)[number] | null;
  toOfficeTime: string | null;
  toHomeTime: string | null;
  autoBook: boolean;
  toOffice: LegState;
  toHome: LegState;
}

/** Saved addresses (home, office, other): many per person, one default per kind. */
export const SAVED_PLACE_LABELS = ['HOME', 'OFFICE', 'OTHER'] as const;
export const MAX_SAVED_PLACES = 20;
export const savedPlaceSchema = z.object({
  label: z.enum(SAVED_PLACE_LABELS),
  /** What the person calls it: "Home", "Mom's place", "Acme Tech, ORR". */
  name: z.string().trim().min(1).max(60),
  /** The full address from the place search. */
  address: z.string().trim().min(2).max(200),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  isDefault: z.boolean().optional(),
});
export type SavedPlaceInput = z.infer<typeof savedPlaceSchema>;
export const savedPlaceUpdateSchema = savedPlaceSchema.partial().refine((v) => Object.keys(v).length > 0, { message: 'Nothing to change' });
export type SavedPlaceUpdate = z.infer<typeof savedPlaceUpdateSchema>;

export interface SavedPlace {
  id: string;
  label: (typeof SAVED_PLACE_LABELS)[number];
  name: string;
  address: string;
  lat: number;
  lng: number;
  isDefault: boolean;
  createdAt: string;
}

