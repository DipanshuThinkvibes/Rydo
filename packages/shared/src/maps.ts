import { z } from 'zod';

export const latLngSchema = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
export type LatLng = z.infer<typeof latLngSchema>;

/** A chosen place: what people read plus the map point. */
export const placeSchema = latLngSchema.extend({ label: z.string().trim().min(2).max(200) });
export type Place = z.infer<typeof placeSchema>;

export const autocompleteQuerySchema = z.object({
  q: z.string().trim().min(2).max(120),
  session: z.string().min(8).max(64),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
});

/** Route preview between two points, e.g. while a driver publishes a ride. */
/** A spot on the map to turn into an address (the movable pin). */
export const reverseQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});
/** null label = no address known for that spot (the app then shows the pin's own name). */
export interface ReverseGeocode {
  label: string | null;
}

export const routeQuerySchema = z.object({
  fromLat: z.coerce.number().min(-90).max(90),
  fromLng: z.coerce.number().min(-180).max(180),
  toLat: z.coerce.number().min(-90).max(90),
  toLng: z.coerce.number().min(-180).max(180),
});
export interface RoutePreview {
  route: string;
  distanceMeters: number;
  durationSeconds: number;
}

export interface PlaceSuggestion {
  placeId: string;
  main: string;
  secondary: string;
}

export interface PlaceDetails {
  placeId: string;
  label: string;
  address: string;
  lat: number;
  lng: number;
}