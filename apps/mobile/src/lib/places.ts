import type { CarType, LatLng, Place, PlaceDetails, PlaceSuggestion, ReverseGeocode, RideMatch, RideSearch, SavedPlace } from '@rydo/shared';
import { api } from './api';
import { addMinutes, isoDay, nowHHMM } from './format';
import type { Office } from './types';

// ── Places ──

let officeCache: Office[] | null = null;
/** The company's offices (cached for the session; every employee may read them). */
export async function getOffices(force = false) {
  if (!officeCache || force) officeCache = await api<Office[]>('GET', '/admin/offices');
  return officeCache;
}
export const officePlace = (o: Office): Place => ({ label: o.name, lat: o.lat, lng: o.lng });

// ── Saved addresses (/me/places): many homes / offices, one default each ──

export const getPlaces = () => api<SavedPlace[]>('GET', '/me/places');
export const savedPlace = (p: SavedPlace): Place => ({ label: p.name, lat: p.lat, lng: p.lng });
export const defaultOf = (places: SavedPlace[] | undefined, label: SavedPlace['label']) =>
  places?.find((p) => p.label === label && p.isDefault) ?? places?.find((p) => p.label === label) ?? null;

/** Default home; default saved office, else the company's default office. */
export function commuteEnds(places: SavedPlace[] | undefined, offices: Office[] | undefined) {
  const home = defaultOf(places, 'HOME');
  const myOffice = defaultOf(places, 'OFFICE');
  const company = offices?.find((o) => o.isDefault) ?? offices?.[0];
  return {
    home: home ? savedPlace(home) : null,
    office: myOffice ? savedPlace(myOffice) : company ? officePlace(company) : null,
  };
}

/** One Google billing session for typing + the final pick. */
export const newPlaceSession = () => `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

export const autocomplete = (q: string, session: string) => api<PlaceSuggestion[]>('GET', `/maps/autocomplete?q=${encodeURIComponent(q)}&session=${session}`);

export async function placeFromSuggestion(s: PlaceSuggestion, session: string): Promise<Place> {
  const d = await api<PlaceDetails>('GET', `/maps/places/${encodeURIComponent(s.placeId)}?session=${session}`);
  return { label: d.label || s.main, lat: d.lat, lng: d.lng };
}

/** The street address under a dropped pin (null when none is known). */
export const reverseGeocode = (at: LatLng) => api<ReverseGeocode>('GET', `/maps/reverse?lat=${at.lat.toFixed(6)}&lng=${at.lng.toFixed(6)}`).then((r) => r.label);

/** Metres between two spots (good enough for "did the pin move"). */
export function metresBetween(a: LatLng, b: LatLng) {
  const r = 6371000, rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

// ── Ride search draft: shared by Plan your ride → Results → Request ──

export interface Draft {
  pickup: Place | null;
  drop: Place | null;
  leaveNow: boolean;
  date: string;
  /** When the rider wants to leave (HH:mm), typed by the rider; '' until typed. */
  time: string;
  seats: number;
  /** Search filters (Find a ride → Filters). */
  womenOnly: boolean;
  vehicleType: 'ANY' | 'CAR' | 'BIKE';
  ac: 'ANY' | 'AC' | 'NON_AC';
  /** Only these car types; empty = any. */
  carTypes: CarType[];
}

/** How many filters are switched on (shown on the Filters button). */
export const activeFilters = (d: Draft) => (d.womenOnly ? 1 : 0) + (d.vehicleType !== 'ANY' ? 1 : 0) + (d.ac !== 'ANY' ? 1 : 0) + (d.vehicleType !== 'BIKE' && d.carTypes.length ? 1 : 0);
export const NO_FILTERS: Pick<Draft, 'womenOnly' | 'vehicleType' | 'ac' | 'carTypes'> = { womenOnly: false, vehicleType: 'ANY', ac: 'ANY', carTypes: [] };

function nextQuarter() {
  const t = nowHHMM(20);
  const [h, m] = t.split(':').map(Number);
  const q = Math.ceil(m / 15) * 15;
  return addMinutes(`${String(h).padStart(2, '0')}:00`, q);
}

const fresh = (): Draft => ({ pickup: null, drop: null, leaveNow: false, date: isoDay(1), time: '', seats: 1, ...NO_FILTERS });

export const draft: { value: Draft; search: RideSearch | null; results: RideMatch[]; chosen: RideMatch | null } = {
  value: fresh(),
  search: null,
  results: [],
  chosen: null,
};

export function updateDraft(p: Partial<Draft>) {
  draft.value = { ...draft.value, ...p };
}

/** The search body for the API: a window from 15 min before to 45 min after the wanted time. */
export function searchBody(d: Draft): RideSearch | null {
  if (!d.pickup || !d.drop || (!d.leaveNow && !d.time)) return null;
  const date = d.leaveNow ? isoDay(0) : d.date;
  const time = d.leaveNow ? nextQuarter() : d.time;
  const from = d.leaveNow ? nowHHMM() : addMinutes(time, -15);
  return {
    pickup: d.pickup,
    drop: d.drop,
    date,
    fromTime: from,
    toTime: addMinutes(time, d.leaveNow ? 60 : 45),
    seats: d.seats,
    womenOnly: d.womenOnly,
    ...(d.vehicleType !== 'ANY' ? { vehicleType: d.vehicleType } : {}),
    ...(d.ac !== 'ANY' ? { ac: d.ac === 'AC' } : {}),
    ...(d.vehicleType !== 'BIKE' && d.carTypes.length ? { carTypes: d.carTypes } : {}),
  };
}
