"use client";

import { useEffect, useState } from "react";
import type { Place } from "@rydo/shared";
import { api } from "@/lib/api";
import { PlaceSearch } from "@/components/place-search";
import { Icon } from "@/components/icons";

export interface Office {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  isDefault: boolean;
}

/** Company offices, for one-tap pickup/drop. */
export function useOffices() {
  const [offices, setOffices] = useState<Office[]>([]);
  useEffect(() => {
    api<Office[]>("GET", "/admin/offices").then(setOffices, () => setOffices([]));
  }, []);
  return offices;
}

export const StartDot = () => <span aria-hidden="true" className="block h-3.5 w-3.5 rounded-full border-[3.5px] border-ink bg-white" />;
export const EndSquare = () => <span aria-hidden="true" className="block h-3.5 w-3.5 rounded-[4px] bg-ink ring-2 ring-inset ring-lime" />;

/** Pick a place: Google search, office chips, or (optionally) the browser's location. */
export function PlaceField({
  label,
  value,
  onChange,
  offices,
  marker = "start",
  allowLocate = false,
}: {
  label: string;
  value: Place | null;
  onChange: (p: Place | null) => void;
  offices: Office[];
  marker?: "start" | "end";
  allowLocate?: boolean;
}) {
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string>();
  const leading = marker === "start" ? <StartDot /> : <EndSquare />;

  if (value) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-bold">{label}</span>
        <div className="flex h-12 animate-rise items-center gap-3 rounded-2xl border-[1.5px] border-ink bg-white pl-4 pr-1.5">
          {leading}
          <span className="min-w-0 flex-1 truncate font-semibold">{value.label}</span>
          <button type="button" onClick={() => onChange(null)} aria-label={`Change ${label.toLowerCase()}`} className="flex h-9 w-9 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-ink">
            <Icon name="x" size={18} />
          </button>
        </div>
      </div>
    );
  }

  const locate = () => {
    if (!navigator.geolocation) return setLocError("This browser can't share location.");
    setLocating(true);
    setLocError(undefined);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onChange({ label: "My current location", lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        setLocating(false);
        setLocError("Location is blocked. Search the address instead.");
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <PlaceSearch label={label} leading={leading} onPick={(p) => onChange({ label: p.label, lat: p.lat, lng: p.lng })} />
      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
        {allowLocate && (
          <button type="button" onClick={locate} disabled={locating} className="flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-line-strong bg-white px-3 text-xs font-extrabold transition-colors hover:border-ink disabled:opacity-60">
            <Icon name="locate" size={14} />
            {locating ? "Finding you…" : "Use my location"}
          </button>
        )}
        {offices.map((o) => (
          <button key={o.id} type="button" onClick={() => onChange({ label: o.name, lat: o.lat, lng: o.lng })} className="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-surface-2 px-3 text-xs font-extrabold transition-colors hover:bg-lime">
            <Icon name="building" size={14} />
            {o.name}
          </button>
        ))}
      </div>
      {locError && <span className="text-xs font-semibold text-danger">{locError}</span>}
    </div>
  );
}

export function Pin({ pin }: { pin: string }) {
  return (
    <span className="flex gap-1.5" aria-label={`Ride PIN ${pin.split("").join(" ")}`}>
      {pin.split("").map((d, i) => (
        <span key={i} aria-hidden="true" style={{ animationDelay: `${i * 70}ms` }} className="flex h-12 w-10 animate-rise items-center justify-center rounded-xl bg-ink text-2xl font-extrabold text-lime shadow-[0_6px_14px_rgba(11,20,38,.25)]">{d}</span>
      ))}
    </span>
  );
}

export function Plate({ plate }: { plate: string }) {
  return <span className="inline-flex whitespace-nowrap rounded-md border-2 border-ink bg-[#FFFDF0] px-1.5 text-xs font-extrabold tracking-wider">{plate}</span>;
}

/** Filled/empty seat dots, e.g. 1 of 3 booked. */
export function Seats({ booked, total }: { booked: number; total: number }) {
  return (
    <span className="inline-flex items-center gap-1" aria-label={`${booked} of ${total} seats booked`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${i < booked ? "bg-ink" : "bg-line-strong"}`} />
      ))}
    </span>
  );
}
