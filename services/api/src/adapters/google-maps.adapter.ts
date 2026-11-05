import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import type { LatLng, PlaceDetails, PlaceSuggestion } from '@rydo/shared';
import { env } from '../config/env';
import { AppError } from '../common/app-error';
import { MapsAdapter, RouteResult } from './maps.adapter';

/** Google's encoded polyline format to points. */
export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    for (const axis of ['lat', 'lng'] as const) {
      let result = 0, shift = 0, b: number;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 'lat') lat += delta;
      else lng += delta;
    }
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

/** Google Maps Platform: Places API (New) and Routes API. Server key only; it never reaches the apps. */
@Injectable()
export class GoogleMapsAdapter implements MapsAdapter {
  private readonly log = new Logger('Maps');

  private async call<T>(url: string, init: { method?: string; fieldMask: string; body?: unknown }): Promise<T> {
    const key = env().GOOGLE_MAPS_API_KEY;
    if (!key) throw new AppError('MAPS_UNAVAILABLE', 'Maps are not set up yet (GOOGLE_MAPS_API_KEY is empty).', HttpStatus.SERVICE_UNAVAILABLE);
    const res = await fetch(url, {
      method: init.method ?? 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key, 'x-goog-fieldmask': init.fieldMask },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    if (!res.ok) {
      this.log.warn(`Google ${res.status}: ${(await res.text()).slice(0, 300)}`);
      throw new AppError('MAPS_UNAVAILABLE', "Maps didn't answer. Try again in a moment.", HttpStatus.BAD_GATEWAY);
    }
    return (await res.json()) as T;
  }

  async autocomplete(query: string, sessionToken: string, near?: LatLng): Promise<PlaceSuggestion[]> {
    type Res = { suggestions?: { placePrediction?: { placeId: string; structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } }; text?: { text: string } } }[] };
    const res = await this.call<Res>('https://places.googleapis.com/v1/places:autocomplete', {
      fieldMask: 'suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat',
      body: {
        input: query,
        sessionToken,
        includedRegionCodes: ['in'],
        ...(near ? { locationBias: { circle: { center: { latitude: near.lat, longitude: near.lng }, radius: 30000 } } } : {}),
      },
    });
    return (res.suggestions ?? [])
      .map((s) => s.placePrediction)
      .filter((p): p is NonNullable<typeof p> => !!p)
      .map((p) => ({ placeId: p.placeId, main: p.structuredFormat?.mainText?.text ?? p.text?.text ?? '', secondary: p.structuredFormat?.secondaryText?.text ?? '' }));
  }

  async place(placeId: string, sessionToken: string): Promise<PlaceDetails> {
    type Res = { id: string; displayName?: { text: string }; formattedAddress?: string; location: { latitude: number; longitude: number } };
    const p = await this.call<Res>(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?sessionToken=${encodeURIComponent(sessionToken)}`, {
      method: 'GET',
      fieldMask: 'id,displayName,formattedAddress,location',
    });
    return { placeId: p.id, label: p.displayName?.text ?? p.formattedAddress ?? '', address: p.formattedAddress ?? '', lat: p.location.latitude, lng: p.location.longitude };
  }

  async route(origin: LatLng, destination: LatLng, stops: LatLng[] = []): Promise<RouteResult> {
    const waypoint = (p: LatLng) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });
    type Res = { routes?: { distanceMeters: number; duration: string; polyline: { encodedPolyline: string } }[] };
    const res = await this.call<Res>('https://routes.googleapis.com/directions/v2:computeRoutes', {
      fieldMask: 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline',
      body: { origin: waypoint(origin), destination: waypoint(destination), intermediates: stops.map(waypoint), travelMode: 'DRIVE', routingPreference: 'TRAFFIC_UNAWARE' },
    });
    const r = res.routes?.[0];
    if (!r) throw new AppError('MAPS_UNAVAILABLE', 'No road route found between these places.', HttpStatus.UNPROCESSABLE_ENTITY);
    return { distanceMeters: r.distanceMeters, durationSeconds: parseInt(r.duration, 10), path: decodePolyline(r.polyline.encodedPolyline) };
  }
}