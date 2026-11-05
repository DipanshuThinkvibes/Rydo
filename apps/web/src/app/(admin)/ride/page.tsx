"use client";

import { useMemo, useState } from "react";
import type { Place, RideMatch } from "@rydo/shared";
import { api, RequestError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { dayChip, fmtDay, fmtTime, isoDay, nextWorkday } from "@/lib/format";
import { toPath } from "@/lib/use-now";
import { Avatar, Badge, Button, Card, EmptyState, Notice, PageHeader, Ring, Segmented, Skeleton, Stepper, Toggle } from "@/components/ui";
import { Icon } from "@/components/icons";
import { EndSquare, PlaceField, Plate, StartDot, useOffices } from "@/components/trip-bits";
import { MapView, type MapMarker, type MapRoute } from "@/components/map/map-view";

const PRESETS = [
  { id: "am", label: "Morning", from: "08:00", to: "09:30" },
  { id: "pm", label: "Evening", from: "18:00", to: "19:30" },
] as const;
const timeField = "h-10 w-full rounded-xl border-[1.5px] border-line-strong bg-white px-2.5 text-sm font-bold outline-none focus:border-ink";

export default function FindRidePage() {
  const { org } = useSession();
  const offices = useOffices();
  const [days] = useState(() => Array.from({ length: 10 }, (_, i) => isoDay(i)));
  const [pickup, setPickup] = useState<Place | null>(null);
  const [drop, setDrop] = useState<Place | null>(null);
  const [date, setDate] = useState(nextWorkday);
  const [from, setFrom] = useState("08:00");
  const [to, setTo] = useState("09:30");
  const [seats, setSeats] = useState(1);
  const [vehicleType, setVehicleType] = useState<"" | "CAR" | "BIKE">("");
  const [womenOnly, setWomenOnly] = useState(false);
  const [autoRematch, setAutoRematch] = useState(true);
  const [results, setResults] = useState<RideMatch[] | null>(null);
  const [requested, setRequested] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string }>();
  const [busy, setBusy] = useState(false);
  const [requesting, setRequesting] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [spin, setSpin] = useState(0);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!pickup || !drop) return setMsg({ tone: "error", text: "Choose both pickup and drop." });
    setBusy(true);
    setMsg(undefined);
    setSelected(null);
    try {
      const r = await api<RideMatch[]>("POST", "/rides/search", { pickup, drop, date, fromTime: from, toTime: to, seats, vehicleType: vehicleType || undefined, womenOnly });
      setResults(r);
      setSelected(r[0]?.rideId ?? null);
    } catch (err) {
      setMsg({ tone: "error", text: err instanceof RequestError ? err.message : "Search failed." });
    } finally {
      setBusy(false);
    }
  }

  async function request(m: RideMatch) {
    setRequesting(m.rideId);
    setMsg(undefined);
    try {
      const r = await api<{ status: string }>("POST", `/rides/${m.rideId}/requests`, { pickup, drop, seats, autoRematch });
      setRequested((x) => ({ ...x, [m.rideId]: r.status }));
      const who = m.driver.name.replace(/\.$/, "");
      setMsg({ tone: "ok", text: r.status === "ACCEPTED" ? `Booked with ${who}. See it in My trips.` : `Request sent to ${who}. You'll get a notification when they answer.` });
    } catch (err) {
      setMsg({ tone: "error", text: err instanceof RequestError ? err.message : "That didn't work." });
    } finally {
      setRequesting(null);
    }
  }

  const paths = useMemo(() => new Map((results ?? []).map((m) => [m.rideId, toPath(m.route)])), [results]);
  const activeId = hovered ?? selected;

  const routes: MapRoute[] = (results ?? []).map((m) => ({ id: m.rideId, path: paths.get(m.rideId) ?? [], active: m.rideId === activeId }));
  const markers: MapMarker[] = [];
  if (pickup) markers.push({ id: "pickup", at: pickup, kind: "pickup", label: "Pickup", title: pickup.label });
  if (drop) markers.push({ id: "drop", at: drop, kind: "drop", label: "Drop", title: drop.label });
  if (!pickup && !drop) offices.forEach((o) => markers.push({ id: `office-${o.id}`, at: o, kind: "office", title: o.name }));

  if (!org) return null;

  const swap = () => {
    setPickup(drop);
    setDrop(pickup);
    setSpin((s) => s + 180);
  };
  const preset = PRESETS.find((p) => p.from === from && p.to === to)?.id ?? "custom";

  const selectFromMap = (id: string) => {
    if (!paths.has(id)) return;
    setSelected(id);
    document.getElementById(`ride-${id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(360px,460px)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-5">
        <PageHeader title="Find a ride" sub="Colleagues already driving your way. Best match first." />

        <Card className="animate-rise">
          <form onSubmit={search} className="flex flex-col gap-5">
            <div className="flex flex-col">
              <PlaceField label="Pickup" value={pickup} onChange={setPickup} offices={offices} marker="start" allowLocate />
              <div className="relative z-10 -my-1 flex justify-end">
                <button
                  type="button"
                  onClick={swap}
                  aria-label="Swap pickup and drop"
                  title="Swap"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-white shadow-soft transition-transform duration-300 hover:scale-110"
                  style={{ transform: `rotate(${spin}deg)` }}
                >
                  <Icon name="swap" size={18} />
                </button>
              </div>
              <PlaceField label="Drop" value={drop} onChange={setDrop} offices={offices} marker="end" />
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-bold">Day</span>
              <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="radiogroup" aria-label="Day">
                {days.map((d) => {
                  const c = dayChip(d);
                  const on = d === date;
                  return (
                    <button key={d} type="button" role="radio" aria-checked={on} onClick={() => setDate(d)} className={`flex h-14 min-w-[64px] shrink-0 flex-col items-center justify-center rounded-2xl border-[1.5px] px-2 transition-all ${on ? "border-ink bg-ink text-white shadow-[0_6px_14px_rgba(11,20,38,.2)]" : "border-line-strong bg-white hover:border-ink"}`}>
                      <span className={`text-[11px] font-bold ${on ? "text-lime" : "text-muted"}`}>{c.top}</span>
                      <span className="text-sm font-extrabold">{c.bottom}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-bold">Pickup time window</span>
              <div className="flex flex-wrap items-center gap-2">
                <Segmented
                  label="Time window"
                  value={preset}
                  onChange={(v) => {
                    const p = PRESETS.find((x) => x.id === v);
                    if (p) {
                      setFrom(p.from);
                      setTo(p.to);
                    }
                  }}
                  options={[...PRESETS.map((p) => ({ value: p.id as string, label: p.label })), ...(preset === "custom" ? [{ value: "custom", label: "Custom" }] : [])]}
                />
              </div>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <label className="sr-only" htmlFor="t-from">Earliest</label>
                <input id="t-from" type="time" required value={from} onChange={(e) => setFrom(e.target.value)} className={timeField} />
                <span className="text-sm font-bold text-muted">to</span>
                <label className="sr-only" htmlFor="t-to">Latest</label>
                <input id="t-to" type="time" required value={to} onChange={(e) => setTo(e.target.value)} className={timeField} />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold">Seats</span>
                <Stepper label="Seats" value={seats} onChange={setSeats} min={1} max={3} />
              </div>
              <Segmented label="Vehicle" value={vehicleType} onChange={setVehicleType} options={[{ value: "", label: "Any" }, { value: "CAR", label: "Car" }, { value: "BIKE", label: "Bike" }]} />
            </div>

            <div className="flex flex-col divide-y divide-line rounded-2xl bg-surface px-4 py-1">
              <Toggle label="Women-only rides" hint="Only rides offered for women" checked={womenOnly} onChange={setWomenOnly} />
              <Toggle label="Auto-rematch" hint="If a driver says no, ask the next best one for me" checked={autoRematch} onChange={setAutoRematch} />
            </div>

            <Button type="submit" variant="lime" loading={busy} className="h-12 w-full text-base">
              {!busy && <Icon name="search" size={18} />}
              {busy ? "Finding rides…" : "Find rides"}
            </Button>
          </form>
        </Card>

        {msg && <Notice tone={msg.tone} onClose={() => setMsg(undefined)}>{msg.text}</Notice>}

        {busy && (
          <div className="flex flex-col gap-3" aria-hidden="true">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-40" />)}
          </div>
        )}

        {!busy && results && (
          <div className="flex flex-col gap-3">
            {results.length > 0 && (
              <p className="flex items-center gap-2 text-sm font-bold text-muted">
                <Icon name="sparkle" size={16} />
                {results.length} {results.length === 1 ? "ride matches" : "rides match"} · {fmtDay(`${date}T12:00:00+05:30`)}
              </p>
            )}
            {results.length === 0 && <EmptyState icon="search" title="No rides match yet">Try a wider time window or another day. New rides are published every day.</EmptyState>}
            {results.map((m, i) => {
              const state = requested[m.rideId] ?? m.requestStatus ?? undefined;
              const active = m.rideId === activeId;
              return (
                <article
                  key={m.rideId}
                  id={`ride-${m.rideId}`}
                  onMouseEnter={() => setHovered(m.rideId)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => setSelected(m.rideId)}
                  style={{ animationDelay: `${i * 60}ms` }}
                  className={`flex animate-rise cursor-pointer flex-col gap-4 rounded-[22px] border-2 bg-white p-4 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift ${active ? "border-ink" : "border-transparent"}`}
                >
                  <div className="flex items-center gap-3">
                    <Avatar name={m.driver.name} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="flex items-center gap-2 font-extrabold">
                        <span className="truncate">{m.driver.name}</span>
                        {m.driver.rating ? <span className="text-sm text-muted">★ {m.driver.rating.toFixed(1)}</span> : <Badge tone="neutral">new</Badge>}
                      </span>
                      <span className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
                        {m.vehicle.color} {m.vehicle.make} {m.vehicle.model} <Plate plate={m.vehicle.plateNumber} />
                      </span>
                    </span>
                    <Ring value={m.score / 100} tone={i === 0 ? "lime" : "ink"}>
                      <span className="text-sm font-extrabold">{m.score}<span className="text-[10px]">%</span></span>
                    </Ring>
                  </div>

                  <ol className="relative flex flex-col gap-2.5 pl-6 text-sm">
                    <span aria-hidden="true" className="absolute bottom-2 left-[6px] top-2 border-l-2 border-dotted border-line-strong" />
                    <li className="relative">
                      <span className="absolute -left-6 top-0.5"><StartDot /></span>
                      <span className="font-extrabold">Pickup ~{fmtTime(m.pickupEta)}</span>
                      <span className="text-muted"> · {m.pickupDistanceMeters < 50 ? "right on the route" : `${Math.round(m.pickupDistanceMeters / 10) * 10} m from the route`}</span>
                    </li>
                    <li className="relative">
                      <span className="absolute -left-6 top-0.5"><EndSquare /></span>
                      <span className="font-extrabold">Drop ~{fmtTime(m.dropEta)}</span>
                      <span className="text-muted"> · {m.dropDistanceMeters < 50 ? "at your stop" : `${Math.round(m.dropDistanceMeters / 10) * 10} m walk`}</span>
                    </li>
                  </ol>

                  <div className="flex flex-wrap gap-1.5">
                    {i === 0 && <Badge tone="lime">best match</Badge>}
                    {m.womenOnly && <Badge tone="warning">women-only</Badge>}
                    <Badge tone="neutral">{m.seatsLeft} {m.seatsLeft === 1 ? "seat" : "seats"} left</Badge>
                    <Badge tone="neutral">leaves {fmtTime(m.departAt)}</Badge>
                    {m.vehicle.hasAc && <Badge tone="neutral">AC</Badge>}
                  </div>
                  {active && (
                    <ul className="flex animate-rise flex-col gap-1 text-xs text-muted">
                      {m.reasons.map((r) => (
                        <li key={r} className="flex items-center gap-1.5"><Icon name="check" size={14} className="text-success" />{r}</li>
                      ))}
                    </ul>
                  )}

                  {state ? (
                    <Badge tone={state === "ACCEPTED" ? "success" : "warning"} dot={state !== "ACCEPTED"}>{state === "ACCEPTED" ? "booked" : "requested · waiting for driver"}</Badge>
                  ) : (
                    <Button
                      className="self-stretch sm:self-start"
                      loading={requesting === m.rideId}
                      disabled={!!requesting}
                      onClick={(e) => {
                        e.stopPropagation();
                        request(m);
                      }}
                    >
                      Request {seats === 1 ? "a seat" : `${seats} seats`}
                      <Icon name="arrowRight" size={16} />
                    </Button>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>

      <div className="order-first lg:order-none">
        <div className="lg:sticky lg:top-[84px]">
          <MapView routes={routes} markers={markers} focusId={selected} onSelect={selectFromMap} gesture="greedy" className="h-64 sm:h-80 lg:h-[calc(100vh-108px)]">
            {results && results.length > 0 && (
              <span className="rounded-full bg-white/95 px-3 py-1.5 text-xs font-extrabold shadow-lift backdrop-blur">Tap a route to see that ride</span>
            )}
            {!results && !pickup && !drop && offices.length > 0 && (
              <span className="rounded-full bg-white/95 px-3 py-1.5 text-xs font-extrabold shadow-lift backdrop-blur">Your company offices</span>
            )}
          </MapView>
        </div>
      </div>
    </section>
  );
}
