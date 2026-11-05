"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { LatLng } from "@rydo/shared";
import { api, RequestError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { fmtIn, fmtTime, fmtWhen } from "@/lib/format";
import { toPath, useNow } from "@/lib/use-now";
import { Avatar, Badge, Button, EmptyState, Notice, PageHeader, Skeleton } from "@/components/ui";
import { Icon } from "@/components/icons";
import { Pin, Plate } from "@/components/trip-bits";
import { MapView, type MapMarker, type MapRoute } from "@/components/map/map-view";
import { RiderLive, Stars, useLiveRide } from "@/components/trip-live";

interface Booking {
  id: string;
  status: string;
  seats: number;
  pickupLabel: string;
  dropLabel: string;
  pickup: LatLng | null;
  drop: LatLng | null;
  route: string | null;
  pin: string | null;
  lateCancel: boolean;
  costShareEstimate: number | null;
  ride: { id: string; departAt: string; status: string; from: string; to: string; driverName: string; driverMembershipId: string; ratedDriver: boolean; vehicle: { make: string; model: string; color: string; plateNumber: string } };
}
interface Req {
  id: string;
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "EXPIRED" | "CANCELLED";
  seats: number;
  pickupLabel: string;
  matchScore: number | null;
  createdAt: string;
  expiresAt: string;
  ride: { id: string; departAt: string; from: string; to: string; driverName: string; plateNumber: string };
}

const reqLabel = { PENDING: "waiting for driver", ACCEPTED: "accepted", DECLINED: "declined", EXPIRED: "no answer", CANCELLED: "cancelled" };

export default function TripsPage() {
  const { org } = useSession();
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [requests, setRequests] = useState<Req[]>([]);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string }>();
  const [busy, setBusy] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const now = useNow(1000);

  const fetchAll = useCallback(() => Promise.all([api<Booking[]>("GET", "/me/bookings"), api<Req[]>("GET", "/me/requests")]), []);
  const show = useCallback(([b, r]: [Booking[], Req[]]) => {
    setBookings(b);
    setRequests(r);
  }, []);
  useEffect(() => {
    if (!org) return;
    fetchAll().then(show, () => setMsg({ tone: "error", text: "Could not load your trips." }));
    const t = setInterval(() => fetchAll().then(show, () => undefined), 20_000);
    return () => clearInterval(t);
  }, [org, fetchAll, show]);

  async function act(key: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(key);
    setMsg(undefined);
    try {
      const res = (await fn()) as { late?: boolean } | undefined;
      show(await fetchAll());
      setMsg({ tone: "ok", text: res?.late ? `${ok} It was inside the free-cancel window, so your reliability score went down.` : ok });
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof RequestError ? e.message : "That didn't work." });
    } finally {
      setBusy(null);
    }
  }

  const live = useMemo(() => (bookings ?? []).filter((b) => (b.status === "CONFIRMED" || b.status === "BOARDED") && !["COMPLETED", "CANCELLED"].includes(b.ride.status)), [bookings]);
  const past = (bookings ?? []).filter((b) => !live.includes(b));
  const [rating, setRating] = useState<string | null>(null);
  const pending = requests.filter((r) => r.status === "PENDING");
  const recent = requests.filter((r) => r.status !== "PENDING" && r.status !== "ACCEPTED").slice(0, 6);
  const selected = live.find((b) => b.id === picked) ?? live[0];
  const liveState = useLiveRide(selected?.ride.id ?? null);

  const routes: MapRoute[] = selected ? [{ id: selected.id, path: toPath(selected.route), active: true }] : [];
  const markers: MapMarker[] = [];
  if (selected?.pickup) markers.push({ id: "pickup", at: selected.pickup, kind: "pickup", label: "Meet here", title: selected.pickupLabel });
  if (selected?.drop) markers.push({ id: "drop", at: selected.drop, kind: "drop", label: "Drop", title: selected.dropLabel });

  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,440px)] xl:grid-cols-[minmax(0,1fr)_480px]">
      <div className="flex min-w-0 flex-col gap-6">
        <PageHeader title="My trips" sub="Your booked rides with their PIN, and requests waiting for a driver." />
        {msg && <Notice tone={msg.tone} onClose={() => setMsg(undefined)}>{msg.text}</Notice>}

        {bookings === null ? (
          <div className="flex flex-col gap-3" aria-label="Loading">
            <Skeleton className="h-64" />
            <Skeleton className="h-20" />
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3">
              <h2 className="flex items-center gap-2 text-lg font-extrabold">Booked <Badge tone="neutral">{live.length}</Badge></h2>
              {live.length === 0 && (
                <EmptyState icon="ticket" title="No booked rides">
                  <Link href="/ride" className="font-extrabold text-ink underline">Find a ride</Link> and your PIN will show up here.
                </EmptyState>
              )}
              {live.map((b, i) => {
                const active = b.id === selected?.id;
                const until = new Date(b.ride.departAt).getTime() - now;
                return (
                  <article
                    key={b.id}
                    onClick={() => setPicked(b.id)}
                    style={{ animationDelay: `${i * 60}ms` }}
                    className={`flex animate-rise cursor-pointer flex-col gap-4 rounded-[22px] border-2 bg-white p-5 shadow-soft transition-all hover:shadow-lift ${active ? "border-ink" : "border-transparent"}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xl font-extrabold">{fmtWhen(b.ride.departAt)}</p>
                        <p className="text-sm text-muted">{b.ride.from} → {b.ride.to}</p>
                      </div>
                      <span className="flex flex-col items-end gap-1.5">
                        <Badge tone="success">{b.status === "BOARDED" ? "on board" : b.ride.status === "IN_PROGRESS" ? "driver on the way" : "confirmed"}</Badge>
                        {fmtIn(until) && <Badge tone={until < 3_600_000 ? "lime" : "neutral"} dot={until < 3_600_000}>leaves {fmtIn(until)}</Badge>}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Avatar name={b.ride.driverName} size={40} />
                      <span className="min-w-0 text-sm">
                        <span className="block font-extrabold">{b.ride.driverName}</span>
                        <span className="flex flex-wrap items-center gap-1.5 text-muted">{b.ride.vehicle.color} {b.ride.vehicle.make} {b.ride.vehicle.model} <Plate plate={b.ride.vehicle.plateNumber} /></span>
                      </span>
                    </div>
                    <p className="flex items-center gap-2 text-sm">
                      <Icon name="locate" size={16} className="text-muted" />
                      Meet at <span className="font-extrabold">{b.pickupLabel}</span>
                      {b.costShareEstimate ? <Badge tone="neutral">est. share ₹{Math.round(b.costShareEstimate)}</Badge> : null}
                    </p>
                    {active && <RiderLive rideId={b.ride.id} state={liveState} onRated={() => fetchAll().then(show)} />}
                    {b.pin && b.status === "CONFIRMED" && (
                      <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-gradient-to-br from-surface to-surface-2 p-4">
                        <Pin pin={b.pin} />
                        <span className="flex max-w-xs items-start gap-2 text-sm text-muted">
                          <Icon name="shield" size={18} className="mt-0.5 text-ink" />
                          Tell this PIN to the driver only inside the car. The ride starts only with it.
                        </span>
                      </div>
                    )}
                    {b.status === "CONFIRMED" && <Button
                      variant="ghost"
                      loading={busy === b.id}
                      disabled={!!busy}
                      className="self-start"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm("Cancel this ride? Cancelling close to departure lowers your reliability score.")) act(b.id, () => api("POST", `/bookings/${b.id}/cancel`, {}), "Cancelled.");
                      }}
                    >
                      Cancel booking
                    </Button>}
                  </article>
                );
              })}
            </div>

            <div className="flex flex-col gap-3">
              <h2 className="flex items-center gap-2 text-lg font-extrabold">Waiting for a driver <Badge tone={pending.length ? "warning" : "neutral"}>{pending.length}</Badge></h2>
              {pending.length === 0 && <p className="text-sm text-muted">No open requests.</p>}
              {pending.map((r) => {
                const total = new Date(r.expiresAt).getTime() - new Date(r.createdAt).getTime();
                const left = Math.max(0, new Date(r.expiresAt).getTime() - now);
                return (
                  <article key={r.id} className="flex animate-rise flex-col gap-3 overflow-hidden rounded-[22px] bg-white p-4 shadow-soft">
                    <div className="flex flex-wrap items-center gap-3">
                      <Avatar name={r.ride.driverName} tone="orange" size={40} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="font-extrabold">{r.ride.driverName} · {fmtWhen(r.ride.departAt)}</span>
                        <span className="text-sm text-muted">Pickup {r.pickupLabel}{r.matchScore ? ` · ${r.matchScore}% match` : ""}</span>
                      </span>
                      <Badge tone="warning" dot>waiting</Badge>
                      <Button variant="ghost" loading={busy === r.id} disabled={!!busy} onClick={() => act(r.id, () => api("POST", `/requests/${r.id}/cancel`), "Request cancelled.")}>Cancel</Button>
                    </div>
                    <div className="flex items-center gap-3 text-xs font-bold text-muted">
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                        <span className="block h-full rounded-full bg-orange transition-[width] duration-1000 ease-linear" style={{ width: `${total > 0 ? (left / total) * 100 : 0}%` }} />
                      </span>
                      answer due by {fmtTime(r.expiresAt)}
                    </div>
                  </article>
                );
              })}
            </div>

            {(recent.length > 0 || past.length > 0) && (
              <div className="flex flex-col gap-2">
                <h2 className="text-lg font-extrabold">Recent</h2>
                <ul className="flex flex-col divide-y divide-line rounded-[22px] bg-white px-4 shadow-soft">
                  {past.map((b) => (
                    <li key={b.id} className="flex flex-col gap-2 py-3 text-sm">
                      <span className="flex flex-wrap items-center justify-between gap-2">
                        <span className="flex items-center gap-2"><Icon name="ticket" size={16} className="text-muted" />{fmtWhen(b.ride.departAt)} · {b.ride.driverName}</span>
                        <span className="flex items-center gap-2">
                          {b.status === "COMPLETED" && !b.ride.ratedDriver && rating !== b.id && <Button variant="soft" className="h-8 px-3" onClick={() => setRating(b.id)}>★ Rate</Button>}
                          <Badge tone={b.status === "COMPLETED" ? "success" : "neutral"}>{b.status.toLowerCase().replace(/_/g, " ")}{b.lateCancel ? " (late)" : ""}</Badge>
                        </span>
                      </span>
                      {rating === b.id && (
                        <Stars
                          busy={busy === `rate${b.id}`}
                          onRate={(stars, tags) => act(`rate${b.id}`, () => api("POST", `/rides/${b.ride.id}/ratings`, { rateeMembershipId: b.ride.driverMembershipId, stars, tags }), "Thanks for rating.").then(() => setRating(null))}
                        />
                      )}
                    </li>
                  ))}
                  {recent.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                      <span className="flex items-center gap-2"><Icon name="clock" size={16} className="text-muted" />Request · {fmtWhen(r.ride.departAt)} · {r.ride.driverName}</span>
                      <Badge tone="neutral">{reqLabel[r.status]}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>

      <div className="order-first lg:order-none">
        <div className="lg:sticky lg:top-[84px]">
          <MapView routes={routes} markers={markers} vehicles={liveState.location ? [{ id: "car", at: liveState.location, label: selected?.ride.driverName }] : []} followId={liveState.live?.ride.status === "IN_PROGRESS" ? "car" : null} className="h-64 sm:h-80 lg:h-[calc(100vh-108px)]">
            {selected ? (
              <span className="rounded-full bg-white/95 px-3 py-1.5 text-xs font-extrabold shadow-lift backdrop-blur">{fmtWhen(selected.ride.departAt)} · {selected.ride.driverName}</span>
            ) : bookings !== null ? (
              <span className="rounded-full bg-white/95 px-3 py-1.5 text-xs font-extrabold shadow-lift backdrop-blur">Your booked ride shows here</span>
            ) : null}
          </MapView>
        </div>
      </div>
    </section>
  );
}
