"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { LiveLocation } from "@rydo/shared";
import { fmtTime } from "@/lib/format";
import { toPath } from "@/lib/use-now";
import { metersBetween } from "@/lib/realtime";
import { Badge, Logo, Skeleton } from "@/components/ui";
import { Plate } from "@/components/trip-bits";
import { MapView, type MapMarker } from "@/components/map/map-view";

interface PublicTrip {
  status: string;
  departAt: string;
  from: string;
  to: string;
  route: string | null;
  driverFirstName: string;
  vehicle: { make: string; model: string; color: string; plateNumber: string };
  location: LiveLocation | null;
  rider: { firstName: string; status: string; pickupLabel: string; pickup: { lat: number; lng: number } | null } | null;
  expiresAt: string;
}

/** What family sees from a shared link. No sign-in. Refreshes every 5 seconds. */
export default function SharedTripPage() {
  const { token } = useParams<{ token: string }>();
  const [trip, setTrip] = useState<PublicTrip | null>(null);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    let live = true;
    const load = () =>
      fetch(`/api/v1/public/trips/${encodeURIComponent(token)}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
        .then((j) => live && setTrip(j.data))
        .catch(() => live && setGone(true));
    load();
    const t = setInterval(load, 5000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [token]);

  if (gone && !trip)
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <Logo />
        <h1 className="text-2xl font-extrabold">This trip link has ended</h1>
        <p className="text-muted">Trip links stop working shortly after the ride is over.</p>
      </main>
    );
  if (!trip) return <main className="flex flex-1 flex-col gap-4 p-4"><Skeleton className="h-16" /><Skeleton className="h-96" /></main>;

  const r = trip.rider;
  const name = r?.firstName ?? "Your person";
  const away = trip.location && r?.pickup ? metersBetween(trip.location, r.pickup) : null;
  const status =
    trip.status === "COMPLETED" ? `${name} has arrived.`
    : trip.status === "CANCELLED" ? "This ride was cancelled."
    : trip.status !== "IN_PROGRESS" ? `The ride leaves at ${fmtTime(trip.departAt)}.`
    : r?.status === "BOARDED" ? `${name} is in the car, on the way to ${trip.to}.`
    : `${trip.driverFirstName} is on the way to pick up ${name}${away != null ? ` (${away < 1000 ? `${Math.round(away)} m` : `${(away / 1000).toFixed(1)} km`} away)` : ""}.`;
  const markers: MapMarker[] = [];
  if (r?.pickup && r.status !== "BOARDED") markers.push({ id: "pickup", at: r.pickup, kind: "pickup", label: "Pickup", title: r.pickupLabel });
  const path = toPath(trip.route);
  if (path.length) markers.push({ id: "end", at: path[path.length - 1], kind: "drop", label: "Drop", title: trip.to });

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Logo />
        <Badge tone={trip.status === "IN_PROGRESS" ? "lime" : "neutral"} dot={trip.status === "IN_PROGRESS"}>{trip.status === "IN_PROGRESS" ? "live" : trip.status.toLowerCase()}</Badge>
      </header>
      <section className="flex animate-rise flex-col gap-2 rounded-[22px] bg-ink p-5 text-white shadow-lift">
        <p className="text-xl font-extrabold">{status}</p>
        <p className="text-sm text-[#B8C2D6]">{trip.from} → {trip.to}</p>
        <p className="flex flex-wrap items-center gap-2 text-sm">
          Driver {trip.driverFirstName} · {trip.vehicle.color} {trip.vehicle.make} {trip.vehicle.model} <span className="text-ink"><Plate plate={trip.vehicle.plateNumber} /></span>
        </p>
        {trip.location && <p className="text-xs text-[#8F9BB3]">Last update {fmtTime(trip.location.at)}</p>}
      </section>
      <MapView routes={path.length ? [{ id: "r", path, active: true }] : []} markers={markers} vehicles={trip.location ? [{ id: "car", at: trip.location, label: `${trip.driverFirstName}'s car` }] : []} className="min-h-[420px] flex-1" />
      <p className="text-center text-xs text-muted">Shared from RYDO by {name}. This link stops working at {fmtTime(trip.expiresAt)}.</p>
    </main>
  );
}
