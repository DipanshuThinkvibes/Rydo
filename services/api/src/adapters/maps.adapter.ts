import type { LatLng, PlaceDetails, PlaceSuggestion } from '@rydo/shared';

export interface RouteResult {
  distanceMeters: number;
  durationSeconds: number;
  /** The road path, decoded, first point = origin. */
  path: LatLng[];
}

/** Maps, places and routing. Only adapters may call a maps vendor. */
export interface MapsAdapter {
  autocomplete(query: string, sessionToken: string, near?: LatLng): Promise<PlaceSuggestion[]>;
  place(placeId: string, sessionToken: string): Promise<PlaceDetails>;
  route(origin: LatLng, destination: LatLng, stops?: LatLng[]): Promise<RouteResult>;
  /** The street address at a spot (where a pin was dropped), or null when the vendor knows none. */
  reverse(at: LatLng): Promise<string | null>;
}
export const MAPS_ADAPTER = Symbol('MAPS_ADAPTER');