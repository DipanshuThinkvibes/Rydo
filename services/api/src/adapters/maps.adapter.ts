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
}
export const MAPS_ADAPTER = Symbol('MAPS_ADAPTER');