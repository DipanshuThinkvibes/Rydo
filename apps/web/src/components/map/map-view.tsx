"use client";

import { useEffect, useRef, useState } from "react";
import type { LatLng } from "@rydo/shared";
import { Icon } from "@/components/icons";
import { loadGoogleMaps, mapsAuthFailed, onMapsAuthFailure } from "./google-loader";

/**
 * Vendor-neutral map for RYDO pages. Pages pass routes and markers; only this folder talks to Google.
 * Swapping the map vendor later means rewriting this file and google-loader.ts, nothing else.
 */
export type MarkerKind = "start" | "end" | "pickup" | "drop" | "rider" | "request" | "office" | "me";
export interface MapMarker {
  id: string;
  at: LatLng;
  kind: MarkerKind;
  /** Short text: initials for people, a word for pins. */
  label?: string;
  title?: string;
  active?: boolean;
}
export interface MapRoute {
  id: string;
  path: LatLng[];
  active?: boolean;
  /** Dashed line, e.g. a route being planned. */
  preview?: boolean;
}

const BENGALURU = { lat: 12.9716, lng: 77.5946 };
const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID || "DEMO_MAP_ID";

interface Props {
  routes?: MapRoute[];
  markers?: MapMarker[];
  /** Fit the view to this route or marker when it changes (e.g. the selected card). */
  focusId?: string | null;
  onSelect?: (id: string) => void;
  gesture?: "cooperative" | "greedy";
  className?: string;
  children?: React.ReactNode;
}

type Drawn = { lines: google.maps.Polyline[]; pins: google.maps.marker.AdvancedMarkerElement[]; timer?: ReturnType<typeof setInterval> };

export function MapView({ routes = [], markers = [], focusId = null, onSelect, gesture = "cooperative", className = "", children }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const Pin = useRef<typeof google.maps.marker.AdvancedMarkerElement | null>(null);
  const drawn = useRef<Drawn>({ lines: [], pins: [] });
  const latest = useRef({ routes, markers, onSelect, focusId });
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const gestureRef = useRef(gesture);

  useEffect(() => {
    latest.current = { routes, markers, onSelect, focusId };
  });

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    const off = onMapsAuthFailure(() => setState("error"));
    loadGoogleMaps()
      .then(() => Promise.all([google.maps.importLibrary("maps"), google.maps.importLibrary("marker")]))
      .then(([maps, marker]) => {
        if (cancelled || !el.current) return;
        if (mapsAuthFailed()) return setState("error");
        Pin.current = (marker as google.maps.MarkerLibrary).AdvancedMarkerElement;
        map.current = new (maps as google.maps.MapsLibrary).Map(el.current, {
          center: BENGALURU,
          zoom: 12,
          mapId: MAP_ID,
          disableDefaultUI: true,
          zoomControl: true,
          clickableIcons: false,
          isFractionalZoomEnabled: true,
          gestureHandling: gestureRef.current,
        });
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
      off();
    };
  }, []);

  const drawKey = [
    routes.map((r) => `${r.id}${r.active ? "*" : ""}${r.preview ? "~" : ""}:${r.path.length}`).join("|"),
    markers.map((m) => `${m.id}:${m.kind}:${m.active ? 1 : 0}:${m.label ?? ""}:${m.at.lat.toFixed(5)},${m.at.lng.toFixed(5)}`).join("|"),
  ].join("#");
  const fitKey = [routes.map((r) => `${r.id}:${r.path.length}`).join("|"), markers.map((m) => `${m.id}:${m.at.lat.toFixed(4)},${m.at.lng.toFixed(4)}`).join("|")].join("#");

  // Draw routes and pins.
  useEffect(() => {
    const m = map.current;
    const PinCtor = Pin.current;
    if (state !== "ready" || !m || !PinCtor) return;
    const g = google.maps;
    const { routes: rs, markers: ms } = latest.current;
    const d = drawn.current;
    d.lines.forEach((l) => l.setMap(null));
    d.pins.forEach((p) => (p.map = null));
    if (d.timer) clearInterval(d.timer);
    d.lines = [];
    d.pins = [];

    const ordered = [...rs].sort((a, b) => Number(!!a.active) - Number(!!b.active));
    let animated: google.maps.Polyline | null = null;
    for (const r of ordered) {
      const strong = r.active || r.preview;
      d.lines.push(new g.Polyline({ path: r.path, map: m, strokeColor: "#FFFFFF", strokeOpacity: 1, strokeWeight: strong ? 11 : 7, zIndex: strong ? 3 : 1, clickable: false }));
      const line = new g.Polyline({
        path: r.path,
        map: m,
        strokeColor: strong ? "#0B1426" : "#97A3B6",
        strokeOpacity: r.preview ? 0 : 1,
        strokeWeight: strong ? 6 : 4,
        zIndex: strong ? 4 : 2,
        icons: r.preview ? [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 1, strokeColor: "#0B1426", strokeWeight: 4, scale: 3 }, offset: "0", repeat: "14px" }] : undefined,
      });
      line.addListener("click", () => latest.current.onSelect?.(r.id));
      d.lines.push(line);
      if (r.active && !animated) animated = line;
    }

    // A small car dot travels along the active route.
    if (animated) {
      const dot = { path: g.SymbolPath.CIRCLE, scale: 6.5, fillColor: "#C8F560", fillOpacity: 1, strokeColor: "#0B1426", strokeWeight: 3 };
      let pct = 0;
      animated.set("icons", [{ icon: dot, offset: "0%" }]);
      const line = animated;
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        d.timer = setInterval(() => {
          pct = (pct + 0.5) % 100;
          line.set("icons", [{ icon: dot, offset: `${pct}%` }]);
        }, 50);
      }
    }

    for (const p of ms) {
      const pin = new PinCtor({ map: m, position: p.at, content: pinElement(p), title: p.title ?? p.label ?? "", zIndex: p.active ? 1000 : kindZ[p.kind], gmpClickable: !!latest.current.onSelect });
      pin.addEventListener("gmp-click", () => latest.current.onSelect?.(p.id));
      d.pins.push(pin);
    }
  }, [state, drawKey]);

  // Fit the view when the set of things changes, or to the focused item.
  useEffect(() => {
    if (state !== "ready" || !map.current) return;
    fitTo(map.current, latest.current.routes, latest.current.markers, latest.current.focusId);
  }, [state, fitKey, focusId]);

  useEffect(
    () => () => {
      const d = drawn.current;
      if (d.timer) clearInterval(d.timer);
      d.lines.forEach((l) => l.setMap(null));
      d.pins.forEach((p) => (p.map = null));
    },
    [],
  );

  return (
    <div className={`relative isolate overflow-hidden rounded-[22px] border border-line bg-surface-2 shadow-soft ${className}`}>
      <div ref={el} className="absolute inset-0" />
      {state === "loading" && <div className="skeleton absolute inset-0" aria-hidden="true" />}
      {state === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface-2 p-6 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-muted shadow-soft"><Icon name="globe" /></span>
          <p className="text-sm font-extrabold">Map could not load</p>
          <p className="max-w-xs text-xs text-muted">Check that the browser Maps key is set and allows this site. Everything else still works.</p>
        </div>
      )}
      {state === "ready" && (
        <button
          type="button"
          onClick={() => map.current && fitTo(map.current, latest.current.routes, latest.current.markers, null)}
          className="absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-xl bg-white text-ink shadow-lift transition-transform hover:scale-105"
          aria-label="Show everything on the map"
          title="Show everything"
        >
          <Icon name="locate" size={18} />
        </button>
      )}
      {children && <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 flex flex-wrap gap-2 [&>*]:pointer-events-auto">{children}</div>}
    </div>
  );
}

const kindZ: Record<MarkerKind, number> = { start: 10, end: 10, office: 5, pickup: 30, drop: 30, rider: 20, request: 25, me: 40 };

function fitTo(m: google.maps.Map, routes: MapRoute[], markers: MapMarker[], focusId: string | null) {
  const b = new google.maps.LatLngBounds();
  const focusRoute = focusId ? routes.find((r) => r.id === focusId) : undefined;
  const focusPin = focusId ? markers.find((p) => p.id === focusId) : undefined;
  let n = 0;
  const add = (p: LatLng) => {
    b.extend(p);
    n++;
  };
  if (focusRoute) {
    focusRoute.path.forEach(add);
    markers.filter((p) => p.kind === "pickup" || p.kind === "drop").forEach((p) => add(p.at));
  } else if (focusPin) {
    add(focusPin.at);
  } else {
    routes.forEach((r) => r.path.forEach(add));
    markers.forEach((p) => add(p.at));
  }
  if (n === 0) return;
  if (n === 1) {
    m.panTo(b.getCenter());
    m.setZoom(15);
    return;
  }
  m.fitBounds(b, { top: 64, bottom: 64, left: 48, right: 64 });
}

function pinElement(p: MapMarker): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = `rydo-pin rydo-pin--${p.kind}${p.active ? " is-active" : ""}`;
  const text = (p.label ?? "").slice(0, 24);
  if (p.kind === "pickup" || p.kind === "drop") {
    const pill = document.createElement("span");
    pill.className = "rydo-pin__pill";
    pill.textContent = text || (p.kind === "pickup" ? "Pickup" : "Drop");
    wrap.append(pill);
  } else if (p.kind === "rider" || p.kind === "request") {
    wrap.textContent = text.slice(0, 2).toUpperCase();
  } else if (p.kind === "office") {
    wrap.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C8F560" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M2 21h20M8 7h4M8 11h4M8 15h4"/></svg>';
  }
  return wrap;
}
