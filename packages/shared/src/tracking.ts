import { z } from 'zod';

/** Phase 4: live trips. Same rules for the web simulator now and the mobile app's GPS later. */

export const locationPointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  /** When the phone took the reading (ISO). The server clamps it to the last 10 minutes. */
  at: z.string().datetime({ offset: true }).optional(),
  speedMps: z.number().min(0).max(80).optional(),
  headingDeg: z.number().min(0).max(360).optional(),
  accuracyM: z.number().min(0).max(5000).optional(),
});
export type LocationPoint = z.infer<typeof locationPointSchema>;
export const locationBatchSchema = z.object({ points: z.array(locationPointSchema).min(1).max(50) });

export const boardSchema = z.object({ pin: z.string().regex(/^\d{4}$/, 'Enter the 4-digit PIN') });
export const sosSchema = z.object({ lat: z.number().min(-90).max(90).optional(), lng: z.number().min(-180).max(180).optional() });
export const resolveSosSchema = z.object({ notes: z.string().trim().min(3).max(500) });
export const ratingSchema = z.object({
  rateeMembershipId: z.string().uuid(),
  stars: z.number().int().min(1).max(5),
  tags: z.array(z.string().trim().min(1).max(30)).max(5).default([]),
  comment: z.string().trim().max(280).optional(),
});
export type RatingInput = z.infer<typeof ratingSchema>;

/** Socket.IO lives under the API prefix so the same cookie and proxy rules apply. */
export const REALTIME_PATH = '/api/v1/realtime';
export const REALTIME_EVENTS = {
  location: 'ride.location',
  update: 'ride.update',
  sos: 'sos',
} as const;

export interface LiveLocation {
  rideId: string;
  lat: number;
  lng: number;
  at: string;
  speedMps: number | null;
  headingDeg: number | null;
}

export interface LiveRide {
  ride: {
    id: string;
    status: 'SCHEDULED' | 'FULL' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
    departAt: string;
    startedAt: string | null;
    completedAt: string | null;
    from: string;
    to: string;
    route: string | null;
    durationSeconds: number | null;
    driver: { membershipId: string; name: string };
    vehicle: { make: string; model: string; color: string; plateNumber: string };
  };
  /** What the caller is to this ride. */
  viewer: 'DRIVER' | 'RIDER' | 'ADMIN';
  location: LiveLocation | null;
  events: { type: string; at: string; bookingId: string | null }[];
  riders: {
    bookingId: string;
    membershipId: string;
    name: string;
    status: string;
    seats: number;
    pickupLabel: string;
    pickup: { lat: number; lng: number } | null;
    arrivedAt: string | null;
    rated: boolean;
  }[];
  /** Rider only: has this rider rated the driver yet. */
  ratedDriver: boolean;
  sos: { id: string; status: string; createdAt: string }[];
  noShowAfterMinutes: number;
}
