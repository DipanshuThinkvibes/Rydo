import { decodePolyline, type LatLng } from '@rydo/shared';

/**
 * Dates and times shown in the phone's own time zone (RYDO companies are in India, like their phones).
 * Formatted by hand so it looks the same on Hermes for iOS and Android.
 */
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number) => String(n).padStart(2, '0');

/** "8:40 AM" */
export function fmtTime(iso: string | Date) {
  const d = new Date(iso);
  const h = d.getHours();
  return `${h % 12 || 12}:${pad(d.getMinutes())} ${h < 12 ? 'AM' : 'PM'}`;
}

/** "08:30" (24 h) → "8:30 AM" */
export function fmtClock(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`;
}

/** YYYY-MM-DD for today + n days, in phone time. */
export function isoDay(offset = 0, from = new Date()) {
  const d = new Date(from);
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** YYYY-MM-DD → local midday Date (safe from DST edges). */
export const dayDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
};

/** "Today", "Tomorrow" or "Fri 31". */
export function dayLabel(iso: string) {
  if (iso === isoDay(0)) return 'Today';
  if (iso === isoDay(1)) return 'Tomorrow';
  const d = dayDate(iso);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()}`;
}

/** Inside a sentence: "today", "tomorrow", "Fri 31". */
export const dayWord = (isoDate: string) => {
  const d = dayLabel(isoDate);
  return d === 'Today' || d === 'Tomorrow' ? d.toLowerCase() : d;
};

/** Day label for an instant: "Today", "Tomorrow", "Fri 31". */
export const dayOf = (iso: string | Date) => dayLabel(isoDay(0, new Date(iso)));

/** "Tomorrow, 8:40 AM" */
export const fmtWhen = (iso: string | Date) => `${dayOf(iso)}, ${fmtTime(iso)}`;

export const weekdayShort = (iso: string) => WEEKDAYS[dayDate(iso).getDay()].toUpperCase();
export const dayNum = (iso: string) => dayDate(iso).getDate();
export const monthShort = (iso: string) => MONTHS[dayDate(iso).getMonth()];
/** ISO day of week: Monday 1 … Sunday 7. */
export const isoDow = (iso: string) => ((dayDate(iso).getDay() + 6) % 7) + 1;

export const fmtKm = (m: number | null | undefined) => (m == null ? '' : `${(m / 1000).toFixed(1)} km`);
export const fmtMin = (s: number | null | undefined) => (s == null ? '' : `${Math.max(1, Math.round(s / 60))} min`);
export const fmtDistance = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);

/** "Good morning" / "Good afternoon" / "Good evening" */
export function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
/** "Rahul M." stays, "Rahul" → "Rahul" (driver names come shortened from the API). */
export const shortName = (name: string) => name.replace(/\.$/, '');

/** HH:mm plus minutes, clamped to the same day. */
export function addMinutes(hhmm: string, minutes: number) {
  const [h, m] = hhmm.split(':').map(Number);
  const t = Math.max(0, Math.min(23 * 60 + 59, h * 60 + m + minutes));
  return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
}
export const nowHHMM = (plus = 0) => {
  const d = new Date(Date.now() + plus * 60_000);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** "in 12 min", "in 2 h 5 min", "now" */
export function fmtIn(ms: number) {
  if (ms < 60_000) return 'now';
  const m = Math.round(ms / 60_000);
  if (m < 60) return `in ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `in ${h} h${m % 60 ? ` ${m % 60} min` : ''}`;
  const d = Math.round(h / 24);
  return `in ${d} ${d === 1 ? 'day' : 'days'}`;
}

/** Encoded route from the API → points. */
export const toPath = (route: string | null | undefined): LatLng[] => (route ? decodePolyline(route) : []);

/** Straight-line distance in metres. */
export function metersBetween(a: LatLng, b: LatLng) {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function pathLength(path: LatLng[]) {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += metersBetween(path[i - 1], path[i]);
  return total;
}

/** How far along the route a point is (metres from the start), using the nearest route vertex. */
export function progressAlong(path: LatLng[], at: LatLng) {
  if (path.length < 2) return 0;
  let best = 0;
  let bestD = Infinity;
  let run = 0;
  for (let i = 0; i < path.length; i++) {
    if (i > 0) run += metersBetween(path[i - 1], path[i]);
    const d = metersBetween(path[i], at);
    if (d < bestD) {
      bestD = d;
      best = run;
    }
  }
  return best;
}

/** City driving estimate for "arrives in about N min" (no live traffic). */
export const etaSeconds = (meters: number) => meters / 6.5;

/** Rough CO₂ saved by sharing one car trip (≈150 g per km). */
export const co2Kg = (meters: number) => (meters / 1000) * 0.15;
