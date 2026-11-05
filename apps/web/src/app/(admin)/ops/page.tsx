"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, RequestError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { dayChip, fmtKm, fmtMin, fmtTime, isoDay } from "@/lib/format";
import { toPath } from "@/lib/use-now";
import { Badge, EmptyState, Notice, PageHeader, Segmented, Skeleton } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";
import { Plate, Seats, useOffices } from "@/components/trip-bits";
import { MapView, type MapMarker, type MapRoute, type MapVehicle } from "@/components/map/map-view";
import { useRealtime } from "@/lib/realtime";
import { REALTIME_EVENTS, type LiveLocation } from "@rydo/shared";
import { Button, Toggle } from "@/components/ui";
import { fmtWhen } from "@/lib/format";

interface LiveRow { id: string; driverName: string; plateNumber: string; lat: number | null; lng: number | null; openSos: number; lastEvent: string | null }
interface Sos { id: string; status: "ACTIVE" | "ACKNOWLEDGED" | "RESOLVED"; createdAt: string; lat: number | null; lng: number | null; rideId: string; raisedBy: string; byDriver: boolean; driverName: string; plateNumber: string; from: string; to: string }

interface Rider { name: string; pickupLabel: string; status: string; seats: number; lat: number; lng: number }
interface OpsRide {
  id: string;
  direction: "TO_OFFICE" | "TO_HOME" | "OTHER";
  status: "SCHEDULED" | "FULL" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  departAt: string;
  originLabel: string;
  destinationLabel: string;
  seatsTotal: number;
  seatsBooked: number;
  womenOnly: boolean;
  distanceMeters: number | null;
  durationSeconds: number | null;
  driverName: string;
  plateNumber: string;
  vehicle: string;
  route: string | null;
  pendingRequests: number;
  riders: Rider[];
}
type Filter = "all" | "office" | "home" | "requests" | "cancelled";

const initialsOf = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");

/** Company Ops view: every ride of one day on a map, with seats, riders and waiting requests. */
export default function OpsRidesPage() {
  const { org, can } = useSession();
  const offices = useOffices();
  const [days] = useState(() => Array.from({ length: 9 }, (_, i) => isoDay(i - 1)));
  const [date, setDate] = useState(() => isoDay(0));
  const [rides, setRides] = useState<OpsRide[] | null>(null);
  const [error, setError] = useState<string>();
  const [filter, setFilter] = useState<Filter>("all");
  const [hover, setHover] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [board, setBoard] = useState<LiveRow[]>([]);
  const [cars, setCars] = useState<Record<string, LiveLocation>>({});
  const [sos, setSos] = useState<Sos[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [sosBusy, setSosBusy] = useState<string | null>(null);
  const [showLive, setShowLive] = useState(true);

  const allowed = can("ORG_ADMIN", "OPS_ADMIN", "HR_ADMIN");
  const fetchDay = useCallback((d: string) => api<OpsRide[]>("GET", `/admin/rides?date=${d}`), []);
  useEffect(() => {
    if (!org || !allowed) return;
    let live = true;
    const load = () =>
      fetchDay(date).then(
        (r) => live && (setRides(r), setError(undefined)),
        (e) => live && setError(e instanceof RequestError ? e.message : "Could not load rides."),
      );
    load();
    const t = setInterval(load, 30_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [org, allowed, date, fetchDay]);

  const loadLive = useCallback(() => {
    api<LiveRow[]>("GET", "/admin/rides/live").then(setBoard, () => undefined);
    api<Sos[]>("GET", "/admin/sos").then(setSos, () => undefined);
  }, []);
  useEffect(() => {
    if (!org || !allowed) return;
    loadLive();
    const t = setInterval(loadLive, 60_000);
    return () => clearInterval(t);
  }, [org, allowed, loadLive]);
  useRealtime(org && allowed ? { opsOrgId: org.organization.id } : null, {
    [REALTIME_EVENTS.location]: (d: LiveLocation) => setCars((c) => ({ ...c, [d.rideId]: d })),
    [REALTIME_EVENTS.update]: () => {
      loadLive();
      fetchDay(date).then(setRides, () => undefined);
    },
    [REALTIME_EVENTS.sos]: () => loadLive(),
  });
  const sosAct = async (id: string, action: "ack" | "resolve") => {
    setSosBusy(id + action);
    try {
      await api("POST", `/admin/sos/${id}/${action}`, action === "resolve" ? { notes: notes[id] ?? "" } : undefined);
      loadLive();
    } catch (e) {
      setError(e instanceof RequestError ? e.message : "That didn't work.");
    } finally {
      setSosBusy(null);
    }
  };

  const paths = useMemo(() => new Map((rides ?? []).map((r) => [r.id, toPath(r.route)])), [rides]);
  const list = rides ?? [];
  const shown = list.filter((r) =>
    filter === "office" ? r.direction === "TO_OFFICE" && r.status !== "CANCELLED"
    : filter === "home" ? r.direction === "TO_HOME" && r.status !== "CANCELLED"
    : filter === "requests" ? r.pendingRequests > 0
    : filter === "cancelled" ? r.status === "CANCELLED"
    : true,
  );
  const live = list.filter((r) => r.status !== "CANCELLED");
  const offered = live.reduce((a, r) => a + r.seatsTotal, 0);
  const booked = live.reduce((a, r) => a + r.seatsBooked, 0);
  const tiles: { k: string; v: string | number; icon: IconName; sub?: string; hot?: boolean }[] = [
    { k: "Rides", v: live.length, icon: "car", sub: list.length - live.length ? `${list.length - live.length} cancelled` : undefined },
    { k: "Seats booked", v: `${booked}/${offered}`, icon: "users", sub: offered ? `${Math.round((booked / offered) * 100)}% full` : undefined },
    { k: "Riders", v: live.reduce((a, r) => a + r.riders.length, 0), icon: "ticket" },
    { k: "Waiting requests", v: live.reduce((a, r) => a + r.pendingRequests, 0), icon: "clock", hot: live.some((r) => r.pendingRequests > 0) },
  ];

  const focus = hover ?? selected;
  const sel = list.find((r) => r.id === selected);
  const routes: MapRoute[] = shown.filter((r) => r.status !== "CANCELLED").map((r) => ({ id: r.id, path: paths.get(r.id) ?? [], active: r.id === focus }));
  const markers: MapMarker[] = offices.map((o) => ({ id: `o-${o.id}`, at: o, kind: "office" as const, title: o.name }));
  sel?.riders.forEach((p, i) => markers.push({ id: `p-${i}`, at: p, kind: "rider", label: initialsOf(p.name), title: `${p.name} · ${p.pickupLabel}` }));
  sos.forEach((s) => s.lat != null && s.lng != null && markers.push({ id: `sos-${s.id}`, at: { lat: s.lat, lng: s.lng }, kind: "sos", title: `SOS · ${s.raisedBy}` }));
  const vehicles: MapVehicle[] = showLive
    ? board.flatMap((b) => {
        const c = cars[b.id] ?? (b.lat != null && b.lng != null ? { lat: b.lat, lng: b.lng } : null);
        return c ? [{ id: b.id, at: { lat: c.lat, lng: c.lng }, label: `${b.driverName} · ${b.plateNumber}`, alert: b.openSos > 0 }] : [];
      })
    : [];

  if (!org) return null;
  if (!allowed) return <Notice tone="error">Only company admins can see all rides.</Notice>;

  const pick = (id: string) => {
    if (!paths.has(id)) return;
    setSelected((s) => (s === id ? null : id));
    document.getElementById(`ops-${id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,460px)] xl:grid-cols-[minmax(0,1fr)_540px]">
      <div className="flex min-w-0 flex-col gap-5">
        <PageHeader title="Rides" sub="Every carpool in your company for the day. Refreshes every 30 seconds." />

        <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="radiogroup" aria-label="Day">
          {days.map((d) => {
            const c = d === isoDay(-1) ? { top: "Yesterday", bottom: dayChip(d).bottom } : dayChip(d);
            const on = d === date;
            return (
              <button key={d} type="button" role="radio" aria-checked={on} onClick={() => { setRides(null); setSelected(null); setDate(d); }} className={`flex h-14 min-w-[72px] shrink-0 flex-col items-center justify-center rounded-2xl border-[1.5px] px-2 transition-all ${on ? "border-ink bg-ink text-white" : "border-line-strong bg-white hover:border-ink"}`}>
                <span className={`text-[11px] font-bold ${on ? "text-lime" : "text-muted"}`}>{c.top}</span>
                <span className="text-sm font-extrabold">{c.bottom}</span>
              </button>
            );
          })}
        </div>

        {error && <Notice tone="error">{error}</Notice>}

        {sos.length > 0 && (
          <div className="flex animate-rise flex-col gap-3 rounded-[22px] border-2 border-danger bg-red-50 p-4">
            <h2 className="flex items-center gap-2 text-lg font-extrabold text-danger"><Icon name="alert" /> SOS · {sos.length} open</h2>
            {sos.map((s) => (
              <div key={s.id} className="flex flex-col gap-2 rounded-2xl bg-white p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span><span className="font-extrabold">{s.raisedBy}</span> {s.byDriver ? "(driver)" : "(rider)"} · {s.driverName} <Plate plate={s.plateNumber} /> · {fmtWhen(s.createdAt)}</span>
                  <Badge tone={s.status === "ACTIVE" ? "warning" : "neutral"} dot={s.status === "ACTIVE"}>{s.status.toLowerCase()}</Badge>
                </div>
                <span className="text-muted">{s.from} → {s.to}</span>
                <div className="flex flex-wrap items-center gap-2">
                  {s.status === "ACTIVE" && <Button className="h-9" loading={sosBusy === s.id + "ack"} onClick={() => sosAct(s.id, "ack")}>I&apos;m on it</Button>}
                  <input aria-label="What happened" placeholder="What happened? (to close it)" value={notes[s.id] ?? ""} onChange={(e) => setNotes({ ...notes, [s.id]: e.target.value })} className="h-9 min-w-[200px] flex-1 rounded-xl border border-line-strong px-3 font-semibold outline-none focus:border-ink" />
                  <Button variant="ghost" className="h-9" disabled={(notes[s.id] ?? "").trim().length < 3} loading={sosBusy === s.id + "resolve"} onClick={() => sosAct(s.id, "resolve")}>Resolve</Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {board.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-[22px] bg-ink p-4 text-white">
            <span className="relative flex h-2.5 w-2.5"><span className="absolute inset-0 animate-ping-soft rounded-full bg-lime" /><span className="relative h-2.5 w-2.5 rounded-full bg-lime" /></span>
            <span className="flex-1 font-bold">{board.length} {board.length === 1 ? "ride is" : "rides are"} on the road right now</span>
            <div className="rounded-xl bg-white px-3 text-ink"><Toggle label="Show cars" checked={showLive} onChange={setShowLive} /></div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {tiles.map((t, i) => (
            <div key={t.k} style={{ animationDelay: `${i * 50}ms` }} className={`flex animate-rise flex-col gap-2 rounded-[22px] p-4 shadow-soft ${t.hot ? "bg-lime" : "bg-white"}`}>
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${t.hot ? "bg-ink text-lime" : "bg-surface-2"}`}><Icon name={t.icon} size={18} /></span>
              {rides ? <span className="text-3xl font-extrabold tabular-nums">{t.v}</span> : <Skeleton className="h-9 w-16" />}
              <span className="text-xs font-bold text-muted">{t.k}</span>
              {t.sub && <span className="text-xs font-bold text-muted">{t.sub}</span>}
            </div>
          ))}
        </div>

        <Segmented
          label="Show"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "office", label: "To office" },
            { value: "home", label: "Back home" },
            { value: "requests", label: "Waiting requests" },
            { value: "cancelled", label: "Cancelled" },
          ]}
        />

        {rides === null && [0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}
        {rides !== null && shown.length === 0 && <EmptyState icon="car" title="No rides here">{list.length ? "Try another filter." : "Nobody has published a ride for this day yet."}</EmptyState>}
        <ul className="flex flex-col gap-2">
          {shown.map((r, i) => {
            const open = r.id === selected;
            const cancelled = r.status === "CANCELLED";
            return (
              <li key={r.id} id={`ops-${r.id}`} style={{ animationDelay: `${i * 30}ms` }} className="animate-rise">
                <div
                  role="button"
                  tabIndex={0}
                  aria-expanded={open}
                  onClick={() => pick(r.id)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), pick(r.id))}
                  onMouseEnter={() => setHover(r.id)}
                  onMouseLeave={() => setHover(null)}
                  className={`flex cursor-pointer flex-col gap-3 rounded-[22px] border-2 bg-white p-3 pr-4 shadow-soft transition-all hover:shadow-lift ${open ? "border-ink" : "border-transparent"} ${cancelled ? "opacity-60" : ""}`}
                >
                  <div className="flex items-center gap-4">
                    <span className={`flex h-14 w-16 shrink-0 flex-col items-center justify-center rounded-2xl ${r.direction === "TO_OFFICE" ? "bg-ink text-white" : "bg-surface-2"}`}>
                      <span className="text-base font-extrabold leading-none">{fmtTime(r.departAt).replace(/\s?[ap]m/i, "")}</span>
                      <span className={`mt-1 text-[10px] font-bold uppercase ${r.direction === "TO_OFFICE" ? "text-lime" : "text-muted"}`}>{fmtTime(r.departAt).slice(-2)}</span>
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="flex flex-wrap items-center gap-2 font-extrabold">
                        {r.driverName} <Plate plate={r.plateNumber} />
                      </span>
                      <span className="truncate text-sm text-muted">{r.originLabel} → {r.destinationLabel}{r.distanceMeters ? ` · ${fmtKm(r.distanceMeters)} · ${fmtMin(r.durationSeconds)}` : ""}</span>
                    </span>
                    <span className="flex flex-col items-end gap-1.5">
                      <span className="flex flex-wrap justify-end gap-1">
                        {cancelled && <Badge tone="neutral">cancelled</Badge>}
                        {r.status === "FULL" && <Badge tone="success">full</Badge>}
                        {r.womenOnly && <Badge tone="warning">women-only</Badge>}
                        {r.pendingRequests > 0 && <Badge tone="warning" dot>{r.pendingRequests} waiting</Badge>}
                      </span>
                      <Seats booked={r.seatsBooked} total={r.seatsTotal} />
                    </span>
                  </div>
                  {open && (
                    <div className="flex animate-rise flex-col gap-2 border-t border-line pt-3 text-sm">
                      <span className="text-xs font-bold uppercase tracking-wider text-muted">{r.vehicle} · riders</span>
                      {r.riders.length === 0 && <span className="text-muted">No riders booked yet.</span>}
                      {r.riders.map((p, j) => (
                        <span key={j} className="flex items-center gap-2">
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sky text-[10px] font-extrabold text-white">{initialsOf(p.name)}</span>
                          <span className="font-bold">{p.name}</span>
                          <span className="truncate text-muted">· {p.pickupLabel}</span>
                          <Badge tone={p.status === "NO_SHOW" ? "warning" : "neutral"}>{p.status.toLowerCase().replace("_", " ")}</Badge>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="order-first lg:order-none">
        <div className="lg:sticky lg:top-[84px]">
          <MapView routes={routes} markers={markers} vehicles={vehicles} focusId={selected} onSelect={(id) => (id.startsWith("sos-") ? undefined : pick(id))} gesture="greedy" className="h-64 sm:h-80 lg:h-[calc(100vh-108px)]">
            <span className="rounded-full bg-white/95 px-3 py-1.5 text-xs font-extrabold shadow-lift backdrop-blur">
              {sel ? `${fmtTime(sel.departAt)} · ${sel.driverName} · ${sel.riders.length} ${sel.riders.length === 1 ? "rider" : "riders"}` : `${routes.length} routes · tap one to see riders`}
            </span>
          </MapView>
        </div>
      </div>
    </section>
  );
}
