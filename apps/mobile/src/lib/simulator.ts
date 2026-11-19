import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LatLng } from '@rydo/shared';
import { api } from './api';
import { metersBetween } from './format';

/** Point and heading at `d` metres along a path. */
function along(path: LatLng[]) {
  const cum = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + metersBetween(path[i - 1], path[i]));
  const total = cum[cum.length - 1] ?? 0;
  const at = (d: number) => {
    if (path.length < 2) return { p: path[0], heading: 0 };
    const x = Math.max(0, Math.min(total, d));
    let i = cum.findIndex((c) => c >= x);
    if (i <= 0) i = 1;
    const a = path[i - 1];
    const b = path[i];
    const k = (x - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
    const heading = (Math.atan2(b.lng - a.lng, b.lat - a.lat) * 180) / Math.PI;
    return { p: { lat: a.lat + (b.lat - a.lat) * k, lng: a.lng + (b.lng - a.lng) * k }, heading: (heading + 360) % 360 };
  };
  return { total, at };
}

/**
 * Drives along the route and posts points like the phone's GPS will, every 2 s at 5× speed.
 * Stand-in until background location (expo-location) is added to the app; same API as the web simulator.
 */
export function useDriveSimulator(rideId: string, path: LatLng[], active: boolean, startAt = 0) {
  const [playing, setPlaying] = useState(false);
  const [done, setDone] = useState(0);
  const [error, setError] = useState<string>();
  const dist = useRef(startAt);
  const route = useMemo(() => along(path), [path]);

  const send = useCallback(
    (p: LatLng, heading: number) =>
      api('POST', `/rides/${rideId}/locations`, { points: [{ ...p, at: new Date().toISOString(), speedMps: 11, headingDeg: heading }] }).then(
        () => setError(undefined),
        () => setError('Could not send the location.'),
      ),
    [rideId],
  );

  useEffect(() => {
    if (!active || !playing || route.total === 0) return;
    const t = setInterval(() => {
      dist.current = Math.min(route.total, dist.current + 11 * 5 * 2);
      const { p, heading } = route.at(dist.current);
      send(p, heading);
      setDone(dist.current / route.total);
      if (dist.current >= route.total) setPlaying(false);
    }, 2000);
    return () => clearInterval(t);
  }, [active, playing, route, send]);

  return { playing, setPlaying, done, error };
}
