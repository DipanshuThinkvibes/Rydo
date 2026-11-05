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