"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Place } from "@rydo/shared";
import { api, RequestError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { fmtKm, fmtMin, fmtWhen } from "@/lib/format";
import { Badge, Button, Card, Input, Notice, PageHeader } from "@/components/ui";
import { PlaceField, Plate, useOffices } from "@/components/trip-bits";

interface Vehicle { id: string; type: "CAR" | "BIKE"; make: string; model: string; color: string; plateNumber: string; seatCapacity: number; hasAc: boolean; isDefault: boolean }
interface Doc { id: string; kind: "DRIVING_LICENSE" | "VEHICLE_RC"; number: string | null; expiresAt: string | null; status: "PENDING" | "APPROVED" | "REJECTED"; rejectReason: string | null; vehicleId: string | null }
interface Profile { id: string; status: "PENDING" | "VERIFIED" | "REJECTED" | "EXPIRED"; vehicles: Vehicle[]; documents: Doc[] }
interface DrivingRide { id: string; direction: string; originLabel: string; destinationLabel: string; departAt: string; seatsTotal: number; seatsBooked: number; status: string; distanceMeters: number | null; durationSeconds: number | null; pendingRequests: number }
interface Plan { id: string; originLabel: string; destinationLabel: string; departTime: string; returnTime: string | null; daysOfWeek: number[]; oneOffDate: string | null; seats: number; womenOnly: boolean; active: boolean; upcomingRides: number }

type Msg = { tone: "ok" | "error"; text: string } | undefined;
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const field = "h-12 rounded-2xl border-[1.5px] border-line-strong bg-surface px-3 font-semibold";

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

  if (!org || profile === undefined) return <p className="text-muted">Loading…</p>;

  return (
    <section className="flex max-w-3xl flex-col gap-5">
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
  const [v, setV] = useState({ type: "CAR" as "CAR" | "BIKE", make: "", model: "", color: "", plateNumber: "", seatCapacity: 3, hasAc: true });
  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); run(() => api("POST", "/driver/vehicles", { ...v, seatCapacity: v.type === "BIKE" ? 1 : v.seatCapacity }), "Vehicle added."); }}>
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
  const vehicles = profile.vehicles;
  const [rides, setRides] = useState<DrivingRide[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [msg, setMsg] = useState<Msg>();
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState({ vehicleId: (vehicles.find((v) => v.isDefault) ?? vehicles[0])?.id ?? "", departTime: "08:30", returnTime: "18:30", withReturn: true, days: [1, 2, 3, 4, 5], seats: Math.min(3, vehicles[0]?.seatCapacity ?? 1), womenOnly: false, notes: "" });
  const [origin, setOrigin] = useState<Place | null>(null);
  const [destination, setDestination] = useState<Place | null>(null);

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

  async function act(fn: () => Promise<unknown>, ok: (r: unknown) => string) {
    setBusy(true);
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
      setBusy(false);
    }
  }

  const publish = (e: React.FormEvent) => {
    e.preventDefault();
    if (!origin || !destination) return setMsg({ tone: "error", text: "Choose where you start and where you go." });
    act(
      () => api("POST", "/ride-plans", { vehicleId: plan.vehicleId, origin, destination, departTime: plan.departTime, returnTime: plan.withReturn ? plan.returnTime : undefined, daysOfWeek: plan.days, seats: plan.seats, womenOnly: plan.womenOnly, notes: plan.notes || undefined }),
      (r) => `Published. ${(r as { ridesCreated: number }).ridesCreated} rides are open for the next 14 days.`,
    ).then((ok) => ok && (setOrigin(null), setDestination(null)));
  };
  const vehicle = vehicles.find((v) => v.id === plan.vehicleId);

  return (
    <div className="flex flex-col gap-5">
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-extrabold">My upcoming rides</h2>
        {rides.length === 0 && <p className="text-sm text-muted">No rides yet. Publish one below.</p>}
        <ul className="flex flex-col gap-2">
          {rides.slice(0, 10).map((r) => (
            <li key={r.id}>
              <Link href={`/drive/rides/${r.id}`} className="flex flex-wrap items-center gap-3 rounded-[18px] border border-line bg-white p-4 hover:border-ink">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-extrabold">{fmtWhen(r.departAt)} · {r.direction === "TO_OFFICE" ? "to office" : r.direction === "TO_HOME" ? "back home" : r.destinationLabel}</span>
                  <span className="text-sm text-muted">{r.originLabel} → {r.destinationLabel} · {fmtKm(r.distanceMeters)} · {fmtMin(r.durationSeconds)}</span>
                </span>
                {r.pendingRequests > 0 && <Badge tone="warning">{r.pendingRequests} new {r.pendingRequests === 1 ? "request" : "requests"}</Badge>}
                <Badge tone={r.status === "FULL" ? "success" : "neutral"}>{r.seatsBooked}/{r.seatsTotal} seats</Badge>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <Card>
        <form onSubmit={publish} className="flex flex-col gap-4">
          <h2 className="text-lg font-extrabold">Publish a ride</h2>
          <PlaceField label="From" value={origin} onChange={setOrigin} offices={offices} />
          <PlaceField label="To" value={destination} onChange={setDestination} offices={offices} />
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1.5 text-sm font-bold">
              Leave at
              <input type="time" required value={plan.departTime} onChange={(e) => setPlan({ ...plan, departTime: e.target.value })} className={field} />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-bold">
              <span className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-[#0B1426]" checked={plan.withReturn} onChange={(e) => setPlan({ ...plan, withReturn: e.target.checked })} /> Return at</span>
              <input type="time" disabled={!plan.withReturn} value={plan.returnTime} onChange={(e) => setPlan({ ...plan, returnTime: e.target.value })} className={field} />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-bold">
              Vehicle
              <select className={field} value={plan.vehicleId} onChange={(e) => setPlan({ ...plan, vehicleId: e.target.value })}>
                {vehicles.map((v) => <option key={v.id} value={v.id}>{v.make} {v.model} · {v.plateNumber}</option>)}
              </select>
            </label>
          </div>
          <fieldset className="flex flex-wrap gap-2">
            <legend className="mb-2 text-sm font-bold">Repeat on</legend>
            {DAYS.map((d, i) => {
              const on = plan.days.includes(i + 1);
              return (
                <button key={d} type="button" aria-pressed={on} onClick={() => setPlan({ ...plan, days: on ? plan.days.filter((x) => x !== i + 1) : [...plan.days, i + 1].sort() })} className={`h-10 w-12 rounded-xl border-[1.5px] text-sm font-extrabold ${on ? "border-lime bg-lime" : "border-line-strong"}`}>
                  {d}
                </button>
              );
            })}
          </fieldset>
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1.5 text-sm font-bold">
              Seats to offer
              <select className={field} value={plan.seats} onChange={(e) => setPlan({ ...plan, seats: Number(e.target.value) })}>
                {Array.from({ length: vehicle?.seatCapacity ?? 1 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 pb-3 text-sm font-bold">
              <input type="checkbox" className="h-5 w-5 accent-[#0B1426]" checked={plan.womenOnly} onChange={(e) => setPlan({ ...plan, womenOnly: e.target.checked })} />
              Women riders only
            </label>
          </div>
          <Input id="notes" label="Note for riders (optional)" maxLength={200} placeholder="e.g. Pickup from the bus stop only" value={plan.notes} onChange={(e) => setPlan({ ...plan, notes: e.target.value })} />
          <Button type="submit" disabled={busy || plan.days.length === 0} className="self-start">Publish</Button>
        </form>
      </Card>

      {plans.some((p) => p.active) && (
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-extrabold">My ride plans</h2>
          {plans.filter((p) => p.active).map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-[18px] border border-line bg-white p-4">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-extrabold">{p.daysOfWeek.map((d) => DAYS[d - 1]).join(", ") || p.oneOffDate} · {p.departTime}{p.returnTime ? `, back ${p.returnTime}` : ""}</span>
                <span className="text-sm text-muted">{p.originLabel} → {p.destinationLabel} · {p.seats} seats · {p.upcomingRides} upcoming rides{p.womenOnly ? " · women only" : ""}</span>
              </span>
              <Button variant="ghost" disabled={busy} onClick={() => confirm("Stop this plan? Its future rides are cancelled.") && act(() => api("DELETE", `/ride-plans/${p.id}`), (r) => `Stopped. ${(r as { cancelledRides: number }).cancelledRides} future rides cancelled.`)}>Stop</Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}