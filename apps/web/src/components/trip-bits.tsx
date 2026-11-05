"use client";

import { useEffect, useState } from "react";
import type { Place } from "@rydo/shared";
import { api } from "@/lib/api";
import { PlaceSearch } from "@/components/place-search";

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

/** Pick a place: office chips or Google search. Shows the chosen place with a change button. */
export function PlaceField({ label, value, onChange, offices }: { label: string; value: Place | null; onChange: (p: Place | null) => void; offices: Office[] }) {
  if (value) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-bold">{label}</span>
        <div className="flex h-12 items-center justify-between gap-3 rounded-2xl border-[1.5px] border-ink bg-white px-4">
          <span className="truncate font-semibold">{value.label}</span>
          <button type="button" onClick={() => onChange(null)} className="shrink-0 text-sm font-bold underline">Change</button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <PlaceSearch label={label} onPick={(p) => onChange({ label: p.label, lat: p.lat, lng: p.lng })} />
      {offices.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {offices.map((o) => (
            <button key={o.id} type="button" onClick={() => onChange({ label: o.name, lat: o.lat, lng: o.lng })} className="h-9 rounded-full bg-surface-2 px-3 text-xs font-extrabold hover:bg-lime">
              Office · {o.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Pin({ pin }: { pin: string }) {
  return (
    <span className="flex gap-1.5" aria-label={`Ride PIN ${pin.split("").join(" ")}`}>
      {pin.split("").map((d, i) => (
        <span key={i} aria-hidden="true" className="flex h-11 w-9 items-center justify-center rounded-xl bg-ink text-xl font-extrabold text-lime">{d}</span>
      ))}
    </span>
  );
}

export function Plate({ plate }: { plate: string }) {
  return <span className="inline-flex rounded-md border-2 border-ink px-1.5 text-xs font-extrabold tracking-wider">{plate}</span>;
}