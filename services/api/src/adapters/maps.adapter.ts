/** Maps, places and routing. Google Maps implementation arrives in Phase 3; nothing else may call a maps vendor. */
export interface LatLng {
  lat: number;
  lng: number;
}
export interface MapsAdapter {
  autocomplete(query: string, sessionToken: string, near?: LatLng): Promise<{ placeId: string; label: string }[]>;
  place(placeId: string, sessionToken: string): Promise<{ label: string; location: LatLng }>;
  route(origin: LatLng, destination: LatLng, stops?: LatLng[]): Promise<{ distanceMeters: number; durationSeconds: number; polyline: LatLng[] }>;
}
export const MAPS_ADAPTER = Symbol('MAPS_ADAPTER');