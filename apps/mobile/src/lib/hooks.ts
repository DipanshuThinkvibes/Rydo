import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import type { LiveLocation, LiveRide } from '@rydo/shared';
import { api } from './api';

/** The current time, refreshed every `everyMs` (for countdowns). */
export function useNow(everyMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}

/**
 * Loads data while the screen is in focus and the app is in the foreground.
 * `pollMs` keeps it fresh (the app polls instead of using sockets for now).
 */
export function useData<T>(load: () => Promise<T>, deps: unknown[], pollMs?: number) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);
  const loader = useRef(load);
  loader.current = load;
  const alive = useRef(true);

  const reload = useCallback(async () => {
    try {
      const d = await loader.current();
      if (alive.current) {
        setData(d);
        setError(null);
      }
      return d;
    } catch (e) {
      if (alive.current) setError(e);
      return undefined;
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      alive.current = true;
      reload();
      let t: ReturnType<typeof setInterval> | undefined;
      if (pollMs) {
        t = setInterval(() => {
          if (AppState.currentState === 'active') reload();
        }, pollMs);
      }
      return () => {
        if (t) clearInterval(t);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reload, pollMs, ...deps]),
  );
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  return { data, setData, error, loading: data === undefined && !error, reload };
}

/** Live state of one ride (position, riders, events), refreshed every 5 s. */
export function useLiveRide(rideId: string | null | undefined, pollMs = 5000) {
  const { data, reload } = useData<LiveRide | null>(() => (rideId ? api<LiveRide>('GET', `/rides/${rideId}/live`) : Promise.resolve(null)), [rideId], pollMs);
  const live = data && data.ride.id === rideId ? data : null;
  const location: LiveLocation | null = live?.location ?? null;
  return { live, location, reload };
}

/** Is the newest long-stop question still unanswered? */
export function openLongStop(events: LiveRide['events'] | undefined) {
  const last = events?.find((e) => e.type === 'LONG_STOP' || e.type === 'LONG_STOP_OK');
  return last?.type === 'LONG_STOP';
}
