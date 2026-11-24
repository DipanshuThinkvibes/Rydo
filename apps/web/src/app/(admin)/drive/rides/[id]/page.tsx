"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { LatLng } from "@rydo/shared";
import { api, RequestError } from "@/lib/api";
import { fmtIn, fmtKm, fmtMin, fmtWhen } from "@/lib/format";
import { toPath, useNow } from "@/lib/use-now";
import { Avatar, Badge, Button, EmptyState, Notice, Ring, Skeleton } from "@/components/ui";
import { Icon } from "@/components/icons";
import { Plate, Seats } from "@/components/trip-bits";
import { MapView, type MapMarker } from "@/components/map/map-view";
import { DriverTrip, useLiveRide } from "@/components/trip-live";
import { MismatchDialog } from "@/components/mismatch-dialog";

interface Person { name: string; photoUrl?: string | null; department: string | null; reliability: number; rating: number | null }
interface Ride {
  id: string; status: string; departAt: string; from: string; to: string; seatsTotal: number; seatsBooked: number; distanceMeters: number | null; durationSeconds: number | null;
  route: string | null;
  vehicle: { make: string; model: string; plateNumber: string };
  riders: (Person & { bookingId: string; status: string; seats: number; pickupLabel: string; dropLabel: string; pickup: LatLng | null; drop: LatLng | null })[];
  requests: (Person & { requestId: string; seats: number; pickupLabel: string; dropLabel: string; matchScore: number | null; createdAt: string; expiresAt: string; pickup: LatLng | null; drop: LatLng | null })[];
}

function Countdown({ from, until, now }: { from: string; until: string; now: number }) {
  const total = Math.max(1, new Date(until).getTime() - new Date(from).getTime());
  const s = Math.max(0, Math.round((new Date(until).getTime() - now) / 1000));
  const urgent = s <= 60;
  return (
    <Ring value={(s * 1000) / total} size={56} tone={urgent ? "orange" : "ink"}>
      <span className={`text-xs font-extrabold tabular-nums ${urgent ? "text-orange" : ""}`}>{s > 120 ? `${Math.ceil(s / 60)}m` : `${s}s`}</span>
    </Ring>
  );
}

export default function ManageRidePage() {
  const { id } = useParams<{ id: string }>();
  const [ride, setRide] = useState<Ride | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string }>();
  const [busy, setBusy] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [reporting, setReporting] = useState<{ id: string; name: string } | null>(null);
  const now = useNow(1000);
  const liveState = useLiveRide(id);

  const fetchRide = useCallback(() => api<Ride>("GET", `/rides/${id}/manage`), [id]);
  useEffect(() => {
    fetchRide().then(setRide, (e) => setMsg({ tone: "error", text: e instanceof RequestError ? e.message : "Could not load this ride." }));
    const t = setInterval(() => fetchRide().then(setRide, () => undefined), 10_000);
    return () => clearInterval(t);
  }, [fetchRide]);

  async function act(key: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(key);
    setMsg(undefined);
    try {
      await fn();
      setRide(await fetchRide());
      setMsg({ tone: "ok", text: ok });
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof RequestError ? e.message : "That didn't work." });
    } finally {
      setBusy(null);
    }
  }

  if (!ride)
    return msg ? (
      <Notice tone="error">{msg.text}</Notice>
    ) : (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_480px]">
        <div className="flex flex-col gap-3"><Skeleton className="h-24" /><Skeleton className="h-40" /></div>
        <Skeleton className="h-80 lg:h-[calc(100vh-108px)]" />
      </div>
    );

  const open = ["SCHEDULED", "FULL"].includes(ride.status);
  const path = toPath(ride.route);
  const markers: MapMarker[] = [];
  if (path.length) {
    markers.push({ id: "start", at: path[0], kind: "start", title: ride.from });
    markers.push({ id: "end", at: path[path.length - 1], kind: "end", title: ride.to });
  }
  ride.riders.forEach((r) => r.pickup && markers.push({ id: r.bookingId, at: r.pickup, kind: "rider", label: initialsOf(r.name), title: `${r.name} · ${r.pickupLabel}`, active: hover === r.bookingId }));
  ride.requests.forEach((r) => r.pickup && markers.push({ id: r.requestId, at: r.pickup, kind: "request", label: initialsOf(r.name), title: `${r.name} (request) · ${r.pickupLabel}`, active: hover === r.requestId }));
  const until = new Date(ride.departAt).getTime() - now;

  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,440px)] xl:grid-cols-[minmax(0,1fr)_520px]">
      <div className="flex min-w-0 flex-col gap-5">
        <Link href="/drive" className="flex w-fit items-center gap-1.5 text-sm font-bold text-muted hover:text-ink"><Icon name="arrowLeft" size={16} /> Back to Drive</Link>
        <div className="flex animate-rise flex-col gap-4 rounded-[22px] bg-ink p-5 text-white shadow-lift">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-extrabold">{fmtWhen(ride.departAt)}</h1>
              <p className="text-sm text-[#B8C2D6]">{ride.from} → {ride.to}</p>
            </div>
            <span className="flex flex-col items-end gap-1.5">
              <Badge tone={ride.status === "CANCELLED" ? "neutral" : "lime"}>{ride.status.toLowerCase()}</Badge>
              {open && fmtIn(until) && <span className="text-xs font-bold text-lime">leaves {fmtIn(until)}</span>}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { k: "Distance", v: fmtKm(ride.distanceMeters) || "—" },
              { k: "Drive time", v: fmtMin(ride.durationSeconds) || "—" },
              { k: "Seats", v: `${ride.seatsBooked}/${ride.seatsTotal}` },
            ].map((s) => (
              <div key={s.k} className="rounded-2xl bg-white/5 px-2 py-3">
                <p className="text-lg font-extrabold">{s.v}</p>
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#8F9BB3]">{s.k}</p>
              </div>
            ))}
          </div>
          <p className="flex flex-wrap items-center gap-2 text-sm text-[#B8C2D6]">
            <Icon name="car" size={16} /> {ride.vehicle.make} {ride.vehicle.model} <span className="text-ink"><Plate plate={ride.vehicle.plateNumber} /></span>
          </p>
        </div>
        {msg && <Notice tone={msg.tone} onClose={() => setMsg(undefined)}>{msg.text}</Notice>}

        <DriverTrip rideId={ride.id} status={ride.status} departAt={ride.departAt} state={liveState} onChanged={() => fetchRide().then(setRide, () => undefined)} />

        {open && <div className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-lg font-extrabold">
            Requests {ride.requests.length > 0 && <Badge tone="warning" dot>{ride.requests.length} waiting</Badge>}
          </h2>
          {ride.requests.length === 0 && <p className="flex items-center gap-2 text-sm text-muted"><span className="h-2 w-2 animate-pulse rounded-full bg-success" /> No requests waiting. This page refreshes by itself.</p>}
          {ride.requests.map((r) => (
            <article
              key={r.requestId}
              onMouseEnter={() => setHover(r.requestId)}
              onMouseLeave={() => setHover(null)}
              className="flex animate-rise flex-col gap-3 rounded-[22px] border-2 border-orange/30 bg-white p-4 shadow-soft transition-shadow hover:shadow-lift"
            >
              <div className="flex items-center gap-3">
                <Avatar name={r.name} tone="orange" size={64} photoUrl={r.photoUrl} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-extrabold">{r.name}{r.rating ? <span className="text-muted"> · ★ {r.rating.toFixed(1)}</span> : ""}</span>
                  <span className="text-sm text-muted">{r.department ?? "No department"} · reliability {Math.round(r.reliability)}%</span>
                  {!r.photoUrl && <span className="text-xs font-bold text-warning">No profile photo</span>}
                </span>
                <Countdown from={r.createdAt} until={r.expiresAt} now={now} />
              </div>
              <p className="flex flex-wrap items-center gap-1.5 text-sm">
                <Icon name="locate" size={16} className="text-muted" /> Pickup <span className="font-extrabold">{r.pickupLabel}</span>
                <span className="text-muted">· drop {r.dropLabel} · {r.seats} {r.seats === 1 ? "seat" : "seats"}</span>
                {r.matchScore ? <Badge tone="lime">{r.matchScore}% match</Badge> : null}
              </p>
              <div className="flex gap-2">
                <Button className="flex-1 sm:flex-none" loading={busy === `a${r.requestId}`} disabled={!!busy} onClick={() => act(`a${r.requestId}`, () => api("POST", `/requests/${r.requestId}/accept`), `${r.name} is in. They got the ride PIN.`)}>
                  <Icon name="check" size={16} /> Accept
                </Button>
                <Button variant="ghost" className="flex-1 sm:flex-none" loading={busy === `d${r.requestId}`} disabled={!!busy} onClick={() => act(`d${r.requestId}`, () => api("POST", `/requests/${r.requestId}/decline`), "Declined.")}>
                  Decline
                </Button>
              </div>
            </article>
          ))}
        </div>}

        {open && <div className="flex flex-col gap-3">
          <h2 className="flex items-center gap-3 text-lg font-extrabold">Riders <Seats booked={ride.seatsBooked} total={ride.seatsTotal} /></h2>
          {ride.riders.length === 0 && <EmptyState icon="users" title="No one booked yet">Riders who match your route will send requests here.</EmptyState>}
          {ride.riders.map((r) => (
            <div key={r.bookingId} onMouseEnter={() => setHover(r.bookingId)} onMouseLeave={() => setHover(null)} className="flex animate-rise items-center gap-3 rounded-[22px] bg-white p-4 shadow-soft transition-shadow hover:shadow-lift">
              <Avatar name={r.name} size={56} photoUrl={r.photoUrl} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-extrabold">{r.name}</span>
                <span className="text-sm text-muted">Pickup {r.pickupLabel} · {r.seats} {r.seats === 1 ? "seat" : "seats"}</span>
              </span>
              <Badge tone="success">{r.status.toLowerCase()}</Badge>
              {r.status === "CONFIRMED" && <button type="button" onClick={() => setReporting({ id: r.bookingId, name: r.name })} className="rounded-full border-[1.5px] border-danger/40 px-3 py-1.5 text-xs font-extrabold text-danger hover:border-danger">Not this person</button>}
            </div>
          ))}
        </div>}

        {open && (
          <Button
            variant="ghost"
            loading={busy === "cancel"}
            disabled={!!busy}
            className="self-start border-danger/40 text-danger hover:border-danger"
            onClick={() => {
              const reason = prompt("Why are you cancelling? Riders will see this.", "Plans changed");
              if (reason !== null) act("cancel", () => api("POST", `/rides/${ride.id}/cancel`, { reason }), "Ride cancelled. Riders were told.");
            }}
          >
            Cancel this ride
          </Button>
        )}
      </div>

      <div className="order-first lg:order-none">
        <div className="lg:sticky lg:top-[84px]">
          <MapView routes={path.length ? [{ id: ride.id, path, active: true }] : []} markers={markers} onSelect={setHover} vehicles={liveState.location ? [{ id: "car", at: liveState.location, label: "Your car" }] : []} followId={ride.status === "IN_PROGRESS" ? "car" : null} className="h-64 sm:h-80 lg:h-[calc(100vh-108px)]">
            <span className="flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-extrabold shadow-lift backdrop-blur"><span className="h-2.5 w-2.5 rounded-full bg-orange" /> request</span>
            <span className="flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-extrabold shadow-lift backdrop-blur"><span className="h-2.5 w-2.5 rounded-full bg-sky" /> booked rider</span>
          </MapView>
        </div>
      </div>
      {reporting && <MismatchDialog bookingId={reporting.id} role="DRIVER" who={reporting.name} onClose={() => setReporting(null)} onDone={() => { setReporting(null); void fetchRide().then(setRide, () => undefined); }} />}
    </section>
  );
}

const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
