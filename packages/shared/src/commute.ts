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
