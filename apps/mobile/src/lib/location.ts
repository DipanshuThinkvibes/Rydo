import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import type { LatLng } from '@rydo/shared';
import { api } from './api';

export type LocationStatus = 'asking' | 'ok' | 'denied' | 'off';

/** The phone's current position while the screen is open (asks for "while using the app" permission once). */
export function useCurrentLocation(enabled = true) {
  const [coords, setCoords] = useState<LatLng | null>(null);
  const [status, setStatus] = useState<LocationStatus>(enabled ? 'asking' : 'off');

  useEffect(() => {
    if (!enabled) return;
    let sub: Location.LocationSubscription | null = null;
    let alive = true;
    (async () => {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!alive) return;
      if (perm.status !== 'granted') return setStatus('denied');
      setStatus('ok');
      const last = await Location.getLastKnownPositionAsync().catch(() => null);
      if (alive && last) setCoords({ lat: last.coords.latitude, lng: last.coords.longitude });
      sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, timeInterval: 10_000, distanceInterval: 25 }, (p) => {
        if (alive) setCoords({ lat: p.coords.latitude, lng: p.coords.longitude });
      });
      if (!alive) sub.remove();
    })().catch(() => alive && setStatus('denied'));
    return () => {
      alive = false;
      sub?.remove();
    };
  }, [enabled]);

  return { coords, status };
}

/**
 * Driver: sends the phone's real GPS to the ride while the trip screen is open (every ~4 s or 15 m).
 * Background tracking (screen off) needs a development build and comes with the background-GPS task.
 */
export function useGpsSender(rideId: string, active: boolean) {
  const [status, setStatus] = useState<LocationStatus>(active ? 'asking' : 'off');
  const [lastSent, setLastSent] = useState<number | null>(null);
  const [error, setError] = useState<string>();
  const sending = useRef(false);

  useEffect(() => {
    if (!active) {
      setStatus('off');
      return;
    }
    let sub: Location.LocationSubscription | null = null;
    let alive = true;
    (async () => {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!alive) return;
      if (perm.status !== 'granted') return setStatus('denied');
      setStatus('ok');
      sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 4000, distanceInterval: 15 }, (p) => {
        if (sending.current) return;
        sending.current = true;
        const c = p.coords;
        api('POST', `/rides/${rideId}/locations`, {
          points: [
            {
              lat: c.latitude,
              lng: c.longitude,
              at: new Date(p.timestamp).toISOString(),
              ...(c.speed != null && c.speed >= 0 ? { speedMps: Math.min(80, c.speed) } : {}),
              ...(c.heading != null && c.heading >= 0 ? { headingDeg: Math.min(360, c.heading) } : {}),
              ...(c.accuracy != null ? { accuracyM: Math.min(5000, c.accuracy) } : {}),
            },
          ],
        })
          .then(() => (setLastSent(Date.now()), setError(undefined)))
          .catch(() => setError('Could not send your location. Check the connection.'))
          .finally(() => (sending.current = false));
      });
      if (!alive) sub.remove();
    })().catch(() => alive && setStatus('denied'));
    return () => {
      alive = false;
      sub?.remove();
    };
  }, [rideId, active]);

  return { status, lastSent, error };
}
