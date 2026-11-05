"use client";

import { useEffect, useState } from "react";
import { decodePolyline, type LatLng } from "@rydo/shared";

/** The current time, refreshed every `everyMs` (for countdowns). */
export function useNow(everyMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}

/** Encoded route from the API → map points. */
export const toPath = (route: string | null | undefined): LatLng[] => (route ? decodePolyline(route) : []);