"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Place, RoutePreview } from "@rydo/shared";
import { api, RequestError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { fmtDay, fmtKm, fmtMin, fmtTime, fmtWhen } from "@/lib/format";
import { toPath } from "@/lib/use-now";
import { Badge, Button, Card, EmptyState, Input, Notice, PageHeader, Skeleton, Stepper, Toggle, fieldClass } from "@/components/ui";
import { Icon } from "@/components/icons";
import { PlaceField, Plate, Seats, useOffices } from "@/components/trip-bits";
import { MapView, type MapMarker, type MapRoute } from "@/components/map/map-view";

interface Vehicle { id: string; type: "CAR" | "BIKE"; carType?: "HATCHBACK" | "SEDAN" | "SUV" | null; make: string; model: string; color: string; plateNumber: string; seatCapacity: number; hasAc: boolean; isDefault: boolean }
interface Doc { id: string; kind: "DRIVING_LICENSE" | "VEHICLE_RC"; number: string | null; expiresAt: string | null; status: "PENDING" | "APPROVED" | "REJECTED"; rejectReason: string | null; vehicleId: string | null }
interface Profile { id: string; status: "PENDING" | "VERIFIED" | "REJECTED" | "EXPIRED"; vehicles: Vehicle[]; documents: Doc[] }
interface DrivingRide { id: string; direction: string; originLabel: string; destinationLabel: string; departAt: string; seatsTotal: number; seatsBooked: number; status: string; distanceMeters: number | null; durationSeconds: number | null; pendingRequests: number; route: string | null }
interface Plan { id: string; originLabel: string; destinationLabel: string; departTime: string; returnTime: string | null; daysOfWeek: number[]; oneOffDate: string | null; seats: number; womenOnly: boolean; active: boolean; upcomingRides: number }

type Msg = { tone: "ok" | "error"; text: string } | undefined;
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const field = `${fieldClass} px-3`;

export default function DrivePage() {
  const { org, reload } = useSession();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [msg, setMsg] = useState<Msg>();

  const fetchProfile = useCallback(() => api<Profile | null>("GET", "/driver/profile"), []);
  useEffect(() => {
    if (org) fetchProfile().then(setProfile, () => setMsg({ tone: "error", text: "Could not load your driver profile." }));
  }, [org, fetchProfile]);

  const run = useCallback(async (fn: () => Promise<unknown>, ok?: string) => {
    setMsg(undefined);
    try {
      await fn();
      setProfile(await fetchProfile());
      if (ok) setMsg({ tone: "ok", text: ok });
      return true;
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof RequestError ? e.message : "That didn't work." });
      return false;
    }
  }, [fetchProfile]);

  if (!org || profile === undefined)
    return (
      <div className="flex max-w-3xl flex-col gap-3">
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-40" />
      </div>
    );

  return (
    <section className={`flex flex-col gap-5 ${profile?.status === "VERIFIED" ? "" : "max-w-3xl"}`}>
      <PageHeader title="Drive" sub="Offer your empty seats to colleagues on your route and share the running cost." />
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {!profile ? (
        <Card className="flex flex-col gap-3">
          <h2 className="text-lg font-extrabold">Become a driver</h2>
          <p className="text-sm text-muted">Add your car or bike and upload your driving license and vehicle RC. Your HR team checks them before you can offer rides.</p>
          <Button className="self-start" onClick={() => run(() => api("POST", "/driver/profile", {}))}>Start</Button>
        </Card>
      ) : profile.status !== "VERIFIED" ? (
        <Onboarding profile={profile} run={run} />
      ) : (
        <Driving profile={profile} onVerifiedRoles={reload} />
      )}
    </section>
  );
}

function Onboarding({ profile, run }: { profile: Profile; run: (fn: () => Promise<unknown>, ok?: string) => Promise<boolean> }) {
  const vehicle = profile.vehicles.find((v) => v.isDefault) ?? profile.vehicles[0];
  const latest = (kind: Doc["kind"]) => profile.documents.find((d) => d.kind === kind && (kind === "DRIVING_LICENSE" || d.vehicleId === vehicle?.id));
  const status = {
    PENDING: { tone: "warning" as const, text: "Waiting for HR to check your documents." },
    REJECTED: { tone: "neutral" as const, text: "HR asked you to upload again. See the reason below." },
    EXPIRED: { tone: "neutral" as const, text: "A document has expired. Upload the renewed one." },
    VERIFIED: { tone: "success" as const, text: "" },
  }[profile.status];

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-extrabold">Driver status</span>
        <Badge tone={status.tone}>{status.text}</Badge>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-extrabold">1. Your vehicle</h2>
        {vehicle ? (
          <p className="text-sm">{vehicle.color} {vehicle.make} {vehicle.model} · <Plate plate={vehicle.plateNumber} /> · {vehicle.type === "CAR" ? `${vehicle.seatCapacity} passenger seats` : "bike"}{vehicle.hasAc ? " · AC" : ""}</p>
        ) : (
          <VehicleForm run={run} />
        )}
      </Card>

      {vehicle && (
        <Card className="flex flex-col gap-4">
          <h2 className="text-lg font-extrabold">2. Documents</h2>
          <DocUpload kind="DRIVING_LICENSE" label="Driving license" current={latest("DRIVING_LICENSE")} run={run} />
          <DocUpload kind="VEHICLE_RC" label={`Vehicle RC (${vehicle.plateNumber})`} vehicleId={vehicle.id} current={latest("VEHICLE_RC")} run={run} />
        </Card>
      )}
    </div>
  );
}

function VehicleForm({ run }: { run: (fn: () => Promise<unknown>, ok?: string) => Promise<boolean> }) {
  const [v, setV] = useState({ type: "CAR" as "CAR" | "BIKE", carType: "" as "" | "HATCHBACK" | "SEDAN" | "SUV", make: "", model: "", color: "", plateNumber: "", seatCapacity: 3, hasAc: true });
  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); run(() => api("POST", "/driver/vehicles", { ...v, carType: v.type === "CAR" && v.carType ? v.carType : undefined, seatCapacity: v.type === "BIKE" ? 1 : v.seatCapacity }), "Vehicle added."); }}>
      <div className="flex gap-2 sm:col-span-2">
        {(["CAR", "BIKE"] as const).map((t) => (
          <button key={t} type="button" aria-pressed={v.type === t} onClick={() => setV({ ...v, type: t })} className={`h-10 rounded-full border-[1.5px] px-4 text-sm font-extrabold ${v.type === t ? "border-ink bg-ink text-white" : "border-line-strong"}`}>{t === "CAR" ? "Car" : "Bike"}</button>
        ))}
      </div>
      <Input id="v-make" label="Make" required placeholder="Honda" value={v.make} onChange={(e) => setV({ ...v, make: e.target.value })} />
      <Input id="v-model" label="Model" required placeholder="City" value={v.model} onChange={(e) => setV({ ...v, model: e.target.value })} />
      <Input id="v-color" label="Colour" required placeholder="White" value={v.color} onChange={(e) => setV({ ...v, color: e.target.value })} />
      <Input id="v-plate" label="Number plate" required placeholder="KA 01 AB 1234" value={v.plateNumber} onChange={(e) => setV({ ...v, plateNumber: e.target.value })} />
      {v.type === "CAR" && (
        <label className="flex flex-col gap-1.5 text-sm font-bold">
          Car type
          <select className={field} value={v.carType} onChange={(e) => setV({ ...v, carType: e.target.value as typeof v.carType })}>
            <option value="">Not set</option>
            <option value="HATCHBACK">Hatchback</option>
            <option value="SEDAN">Sedan</option>
            <option value="SUV">SUV</option>
          </select>
        </label>
      )}
      {v.type === "CAR" && (
        <label className="flex flex-col gap-1.5 text-sm font-bold">
          Passenger seats
          <select className={field} value={v.seatCapacity} onChange={(e) => setV({ ...v, seatCapacity: Number(e.target.value) })}>
            {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      )}
      <label className="flex items-center gap-2 self-end pb-3 text-sm font-bold">
        <input type="checkbox" className="h-5 w-5 accent-[#0B1426]" checked={v.hasAc} onChange={(e) => setV({ ...v, hasAc: e.target.checked })} />
        AC
      </label>
      <Button type="submit" className="self-start">Add vehicle</Button>
    </form>
  );
}

function DocUpload({ kind, label, vehicleId, current, run }: { kind: Doc["kind"]; label: string; vehicleId?: string; current?: Doc; run: (fn: () => Promise<unknown>, ok?: string) => Promise<boolean> }) {
  const [number, setNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const done = current && current.status !== "REJECTED";

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-extrabold">{label}</span>
        {current && <Badge tone={current.status === "APPROVED" ? "success" : current.status === "PENDING" ? "warning" : "neutral"}>{current.status === "PENDING" ? "uploaded · waiting for HR" : current.status.toLowerCase()}</Badge>}
      </div>
      {current?.status === "REJECTED" && current.rejectReason && <p className="text-sm font-semibold text-danger">HR: “{current.rejectReason}”</p>}
      {current && done && <p className="text-sm text-muted">No. {current.number} · valid till {current.expiresAt}</p>}
      {!done && (
        <form
          className="grid gap-3 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!file) return;
            const f = new FormData();
            f.append("kind", kind);
            f.append("number", number);
            f.append("expiresAt", expiry);
            if (vehicleId) f.append("vehicleId", vehicleId);
            f.append("file", file);
            run(() => api("POST", "/driver/documents", f), `${label} uploaded. HR will check it.`);
          }}
        >
          <Input id={`${kind}-no`} label="Number" required value={number} onChange={(e) => setNumber(e.target.value)} />
          <Input id={`${kind}-exp`} label="Valid till" type="date" required value={expiry} onChange={(e) => setExpiry(e.target.value)} />
          <label className="flex flex-col gap-1.5 text-sm font-bold">
            Photo or PDF
            <input type="file" required accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm font-semibold file:mr-3 file:h-10 file:rounded-xl file:border-0 file:bg-ink file:px-3 file:font-bold file:text-white" />
          </label>
          <Button type="submit" className="self-start">Upload</Button>
        </form>
      )}
    </div>
  );
}

function Driving({ profile, onVerifiedRoles }: { profile: Profile; onVerifiedRoles: () => Promise<void> }) {
  const offices = useOffices();
  const { features } = useSession();
  const vehicles = profile.vehicles;
  const [rides, setRides] = useState<DrivingRide[] | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [msg, setMsg] = useState<Msg>();
  const [busy, setBusy] = useState<string | null>(null);
  const [plan, setPlan] = useState({ vehicleId: (vehicles.find((v) => v.isDefault) ?? vehicles[0])?.id ?? "", departTime: "08:30", returnTime: "18:30", withReturn: true, days: [1, 2, 3, 4, 5], seats: Math.min(3, vehicles[0]?.seatCapacity ?? 1), womenOnly: false, notes: "" });
  const [origin, setOrigin] = useState<Place | null>(null);
  const [destination, setDestination] = useState<Place | null>(null);
  const [preview, setPreview] = useState<(RoutePreview & { key: string }) | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  const fetchAll = useCallback(() => Promise.all([api<DrivingRide[]>("GET", "/rides/driving"), api<Plan[]>("GET", "/ride-plans/mine")]), []);
  const show = useCallback(([r, p]: [DrivingRide[], Plan[]]) => {
    setRides(r);
    setPlans(p);
  }, []);
  useEffect(() => {
    fetchAll().then(show, () => undefined);
    onVerifiedRoles().catch(() => undefined);
    const t = setInterval(() => fetchAll().then(show, () => undefined), 20_000);
    return () => clearInterval(t);
  }, [fetchAll, show, onVerifiedRoles]);

  // Road route preview while publishing.
  const previewKey = origin && destination ? `${origin.lat},${origin.lng}>${destination.lat},${destination.lng}` : null;
  useEffect(() => {
    if (!origin || !destination || !previewKey) return;
    const q = new URLSearchParams({ fromLat: String(origin.lat), fromLng: String(origin.lng), toLat: String(destination.lat), toLng: String(destination.lng) });
    api<RoutePreview>("GET", `/maps/route?${q}`).then((r) => setPreview({ ...r, key: previewKey }), () => undefined);
  }, [origin, destination, previewKey]);
  const livePreview = preview && preview.key === previewKey ? preview : null;

  async function act(key: string, fn: () => Promise<unknown>, ok: (r: unknown) => string) {
    setBusy(key);
    setMsg(undefined);
    try {
      const res = await fn();
      show(await fetchAll());
      setMsg({ tone: "ok", text: ok(res) });
      return true;
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof RequestError ? e.message : "That didn't work." });
      return false;
    } finally {
      setBusy(null);
    }
  }

  const publish = (e: React.FormEvent) => {
    e.preventDefault();
    if (!origin || !destination) return setMsg({ tone: "error", text: "Choose where you start and where you go." });
    act(
      "publish",
      () => api("POST", "/ride-plans", { vehicleId: plan.vehicleId, origin, destination, departTime: plan.departTime, returnTime: plan.withReturn ? plan.returnTime : undefined, daysOfWeek: plan.days, seats: plan.seats, womenOnly: plan.womenOnly, notes: plan.notes || undefined }),
      (r) => `Published. ${(r as { ridesCreated: number }).ridesCreated} rides are open for the next 14 days.`,
    ).then((ok) => ok && (setOrigin(null), setDestination(null)));
  };
  const vehicle = vehicles.find((v) => v.id === plan.vehicleId);

  const list = rides ?? [];
  const shown = list.slice(0, 10);
  const paths = useMemo(() => new Map((rides ?? []).map((r) => [r.id, toPath(r.route)])), [rides]);
  const focus = hover ?? shown[0]?.id ?? null;
  const focusRide = list.find((r) => r.id === focus);
  const stats = [
    { k: "Upcoming rides", v: list.length, icon: "calendar" as const },
    { k: "Seats booked", v: list.reduce((a, r) => a + r.seatsBooked, 0), icon: "users" as const },
    { k: "New requests", v: list.reduce((a, r) => a + r.pendingRequests, 0), icon: "sparkle" as const, hot: list.some((r) => r.pendingRequests > 0) },
  ];

  let routes: MapRoute[] = [];
  const markers: MapMarker[] = [];
  if (livePreview || origin || destination) {
    if (livePreview) routes = [{ id: "preview", path: toPath(livePreview.route), preview: true }];
    if (origin) markers.push({ id: "o", at: origin, kind: "pickup", label: "Start", title: origin.label });
    if (destination) markers.push({ id: "d", at: destination, kind: "drop", label: "End", title: destination.label });
  } else if (focusRide) {
    const path = paths.get(focusRide.id) ?? [];
    routes = [{ id: focusRide.id, path, active: true }];
    if (path.length) {
      markers.push({ id: "s", at: path[0], kind: "start", title: focusRide.originLabel });
      markers.push({ id: "e", at: path[path.length - 1], kind: "end", title: focusRide.destinationLabel });
    }
  } else {
    offices.forEach((o) => markers.push({ id: o.id, at: o, kind: "office", title: o.name }));
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,440px)] xl:grid-cols-[minmax(0,1fr)_500px]">
      <div className="flex min-w-0 flex-col gap-6">
        {msg && <Notice tone={msg.tone} onClose={() => setMsg(undefined)}>{msg.text}</Notice>}

        <div className="grid grid-cols-3 gap-3">
          {stats.map((s, i) => (
            <div key={s.k} style={{ animationDelay: `${i * 60}ms` }} className={`flex animate-rise flex-col gap-2 rounded-[22px] p-4 shadow-soft ${s.hot ? "bg-lime" : "bg-white"}`}>
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${s.hot ? "bg-ink text-lime" : "bg-surface-2"}`}><Icon name={s.icon} size={18} /></span>
              <span className="text-2xl font-extrabold tabular-nums">{rides ? s.v : "–"}</span>
              <span className="text-xs font-bold text-muted">{s.k}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-extrabold">My upcoming rides</h2>
          {rides === null && [0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}
          {rides !== null && list.length === 0 && <EmptyState icon="route" title="No rides yet">Publish your daily route below. Rides open for the next 14 days.</EmptyState>}
          <ul className="flex flex-col gap-2">
            {shown.map((r, i) => (
              <li key={r.id} style={{ animationDelay: `${i * 40}ms` }} className="animate-rise">
                <Link
                  href={`/drive/rides/${r.id}`}
                  onMouseEnter={() => setHover(r.id)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(r.id)}
                  className={`group flex items-center gap-4 rounded-[22px] border-2 bg-white p-3 pr-4 shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-lift ${focus === r.id && !origin && !destination ? "border-ink" : "border-transparent"}`}
                >
                  <span className={`flex h-14 w-16 shrink-0 flex-col items-center justify-center rounded-2xl ${r.direction === "TO_OFFICE" ? "bg-ink text-white" : "bg-surface-2"}`}>
                    <span className="text-base font-extrabold leading-none">{fmtTime(r.departAt).replace(/\s?[ap]m/i, "")}</span>
                    <span className={`mt-1 text-[10px] font-bold uppercase ${r.direction === "TO_OFFICE" ? "text-lime" : "text-muted"}`}>{fmtDay(r.departAt).split(",")[0]} {fmtTime(r.departAt).slice(-2)}</span>
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex items-center gap-2 font-extrabold">
                      <Icon name={r.direction === "TO_OFFICE" ? "building" : "route"} size={16} className="text-muted" />
                      {r.direction === "TO_OFFICE" ? "To office" : r.direction === "TO_HOME" ? "Back home" : r.destinationLabel}
                    </span>
                    <span className="truncate text-sm text-muted">{r.originLabel} → {r.destinationLabel} · {fmtKm(r.distanceMeters)} · {fmtMin(r.durationSeconds)}</span>
                  </span>
                  {r.pendingRequests > 0 && <Badge tone="warning" dot>{r.pendingRequests} new</Badge>}
                  <Seats booked={r.seatsBooked} total={r.seatsTotal} />
                  <Icon name="arrowRight" size={18} className="text-muted transition-transform group-hover:translate-x-1" />
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <Card>
          <form onSubmit={publish} className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-extrabold">Publish a ride</h2>
              {livePreview && <Badge tone="lime">{fmtKm(livePreview.distanceMeters)} · {fmtMin(livePreview.durationSeconds)} drive</Badge>}
            </div>
            <PlaceField label="From" value={origin} onChange={setOrigin} offices={offices} marker="start" allowLocate />
            <PlaceField label="To" value={destination} onChange={setDestination} offices={offices} marker="end" />
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1.5 text-sm font-bold">
                Leave at
                <input type="time" required value={plan.departTime} onChange={(e) => setPlan({ ...plan, departTime: e.target.value })} className={field} />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-bold">
                <span className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-[#0B1426]" checked={plan.withReturn} onChange={(e) => setPlan({ ...plan, withReturn: e.target.checked })} /> Return at</span>
                <input type="time" disabled={!plan.withReturn} value={plan.returnTime} onChange={(e) => setPlan({ ...plan, returnTime: e.target.value })} className={`${field} disabled:opacity-50`} />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-bold">
                Vehicle
                <select className={field} value={plan.vehicleId} onChange={(e) => setPlan({ ...plan, vehicleId: e.target.value })}>
                  {vehicles.map((v) => <option key={v.id} value={v.id}>{v.make} {v.model} · {v.plateNumber}</option>)}
                </select>
              </label>
            </div>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-bold">Repeat on</legend>
              <div className="flex flex-wrap gap-2">
                {DAYS.map((d, i) => {
                  const on = plan.days.includes(i + 1);
                  return (
                    <button key={d} type="button" aria-pressed={on} onClick={() => setPlan({ ...plan, days: on ? plan.days.filter((x) => x !== i + 1) : [...plan.days, i + 1].sort() })} className={`h-11 w-12 rounded-xl text-sm font-extrabold transition-all active:scale-95 ${on ? "bg-ink text-lime shadow-[0_6px_14px_rgba(11,20,38,.2)]" : "bg-surface-2 text-muted hover:text-ink"}`}>
                      {d}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold">Seats to offer</span>
                <Stepper label="Seats" value={plan.seats} onChange={(n) => setPlan({ ...plan, seats: n })} min={1} max={vehicle?.seatCapacity ?? 1} />
              </div>
            </div>
            <div className={`rounded-2xl bg-surface px-4 py-1 ${features.womenOnly ? "" : "hidden"}`}>
              <Toggle label="Women riders only" hint="Only women colleagues can book" checked={plan.womenOnly} onChange={(v) => setPlan({ ...plan, womenOnly: v })} />
            </div>
            <Input id="notes" label="Note for riders (optional)" maxLength={200} placeholder="e.g. Pickup from the bus stop only" value={plan.notes} onChange={(e) => setPlan({ ...plan, notes: e.target.value })} />
            <Button type="submit" variant="lime" loading={busy === "publish"} disabled={!!busy || plan.days.length === 0} className="h-12 text-base sm:self-start">
              Publish ride <Icon name="arrowRight" size={18} />
            </Button>
          </form>
        </Card>

        {plans.some((p) => p.active) && (
          <div className="flex flex-col gap-2">
            <h2 className="text-lg font-extrabold">My ride plans</h2>
            {plans.filter((p) => p.active).map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-[22px] bg-white p-4 shadow-soft">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2"><Icon name="calendar" size={18} /></span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-extrabold">{p.daysOfWeek.map((d) => DAYS[d - 1]).join(", ") || p.oneOffDate} · {p.departTime}{p.returnTime ? `, back ${p.returnTime}` : ""}</span>
                  <span className="text-sm text-muted">{p.originLabel} → {p.destinationLabel} · {p.seats} seats · {p.upcomingRides} upcoming rides{p.womenOnly ? " · women only" : ""}</span>
                </span>
                <Button variant="ghost" loading={busy === p.id} disabled={!!busy} onClick={() => confirm("Stop this plan? Its future rides are cancelled.") && act(p.id, () => api("DELETE", `/ride-plans/${p.id}`), (r) => `Stopped. ${(r as { cancelledRides: number }).cancelledRides} future rides cancelled.`)}>Stop</Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="order-first lg:order-none">
        <div className="lg:sticky lg:top-[84px]">
          <MapView routes={routes} markers={markers} className="h-64 sm:h-80 lg:h-[calc(100vh-108px)]">
            <span className="rounded-full bg-white/95 px-3 py-1.5 text-xs font-extrabold shadow-lift backdrop-blur">
              {origin || destination ? (livePreview ? "Route preview" : "Pick both ends to preview the route") : focusRide ? `${fmtWhen(focusRide.departAt)} · ${focusRide.direction === "TO_OFFICE" ? "to office" : "back home"}` : "Your company offices"}
            </span>
          </MapView>
        </div>
      </div>
    </div>
  );
}