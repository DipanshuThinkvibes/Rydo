"use client";

import { useState } from "react";
import type { Place, RideMatch } from "@rydo/shared";
import { api, RequestError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { fmtDay, fmtTime, initials, nextWorkday } from "@/lib/format";
import { Badge, Button, Card, Notice, PageHeader } from "@/components/ui";
import { PlaceField, Plate, useOffices } from "@/components/trip-bits";

export default function FindRidePage() {
  const { org } = useSession();
  const offices = useOffices();
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

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!pickup || !drop) return setMsg({ tone: "error", text: "Choose both pickup and drop." });
    setBusy(true);
    setMsg(undefined);
    try {
      setResults(await api<RideMatch[]>("POST", "/rides/search", { pickup, drop, date, fromTime: from, toTime: to, seats, vehicleType: vehicleType || undefined, womenOnly }));
    } catch (err) {
      setMsg({ tone: "error", text: err instanceof RequestError ? err.message : "Search failed." });
    } finally {
      setBusy(false);
    }
  }

  async function request(m: RideMatch) {
    setBusy(true);
    setMsg(undefined);
    try {
      const r = await api<{ status: string }>("POST", `/rides/${m.rideId}/requests`, { pickup, drop, seats, autoRematch });
      setRequested((x) => ({ ...x, [m.rideId]: r.status }));
      setMsg({ tone: "ok", text: r.status === "ACCEPTED" ? `Booked with ${m.driver.name.replace(/\.$/, "")}. See it in My trips.` : `Request sent to ${m.driver.name.replace(/\.$/, "")}. You'll get a notification when they answer.` });
    } catch (err) {
      setMsg({ tone: "error", text: err instanceof RequestError ? err.message : "That didn't work." });
    } finally {
      setBusy(false);
    }
  }

  if (!org) return null;
  const swap = () => {
    setPickup(drop);
    setDrop(pickup);
  };

  return (
    <section className="flex max-w-3xl flex-col gap-5">
      <PageHeader title="Find a ride" sub="Colleagues already driving your way. Best match first." />
      <Card>
        <form onSubmit={search} className="flex flex-col gap-4">
          <PlaceField label="Pickup" value={pickup} onChange={setPickup} offices={offices} />
          <div className="-my-1 flex justify-center">
            <button type="button" onClick={swap} className="h-9 rounded-full border border-line px-4 text-xs font-extrabold hover:border-ink" aria-label="Swap pickup and drop">⇅ Swap</button>
          </div>
          <PlaceField label="Drop" value={drop} onChange={setDrop} offices={offices} />
          <div className="grid gap-3 sm:grid-cols-4">
            <label className="flex flex-col gap-1.5 text-sm font-bold">
              Date
              <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="h-12 rounded-2xl border-[1.5px] border-line-strong bg-surface px-3 font-semibold" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-bold">
              Earliest
              <input type="time" required value={from} onChange={(e) => setFrom(e.target.value)} className="h-12 rounded-2xl border-[1.5px] border-line-strong bg-surface px-3 font-semibold" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-bold">
              Latest
              <input type="time" required value={to} onChange={(e) => setTo(e.target.value)} className="h-12 rounded-2xl border-[1.5px] border-line-strong bg-surface px-3 font-semibold" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-bold">
              Seats
              <select value={seats} onChange={(e) => setSeats(Number(e.target.value))} className="h-12 rounded-2xl border-[1.5px] border-line-strong bg-surface px-3 font-semibold">
                {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(["", "CAR", "BIKE"] as const).map((t) => (
              <button key={t} type="button" aria-pressed={vehicleType === t} onClick={() => setVehicleType(t)} className={`h-10 rounded-full border-[1.5px] px-4 text-sm font-extrabold ${vehicleType === t ? "border-ink bg-ink text-white" : "border-line-strong"}`}>
                {t === "" ? "Any vehicle" : t === "CAR" ? "Car" : "Bike"}
              </button>
            ))}
            <label className="flex items-center gap-2 px-2 text-sm font-bold">
              <input type="checkbox" className="h-5 w-5 accent-[#0B1426]" checked={womenOnly} onChange={(e) => setWomenOnly(e.target.checked)} />
              Women-only rides
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm font-bold">
            <input type="checkbox" className="h-5 w-5 accent-[#0B1426]" checked={autoRematch} onChange={(e) => setAutoRematch(e.target.checked)} />
            If the driver says no or doesn&apos;t answer, ask the next best driver for me
          </label>
          <Button type="submit" disabled={busy} className="self-start">{busy ? "Searching…" : "Find rides"}</Button>
        </form>
      </Card>

      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      {results && (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-bold text-muted">
            {results.length ? `${results.length} ${results.length === 1 ? "ride matches" : "rides match"} · ${fmtDay(`${date}T12:00:00+05:30`)}` : ""}
          </p>
          {results.length === 0 && (
            <div className="rounded-[18px] border-[1.5px] border-dashed border-line-strong p-8 text-center text-muted">
              No rides match yet. Try a wider time window or another day.
            </div>
          )}
          {results.map((m, i) => {
            const state = requested[m.rideId] ?? (m.alreadyRequested ? "PENDING" : undefined);
            return (
              <article key={m.rideId} className={`flex flex-col gap-3 rounded-[18px] bg-white p-5 ${i === 0 ? "border-2 border-ink" : "border border-line"}`}>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#DCE6FF] font-extrabold text-[#1E3A8A]">{initials(m.driver.name)}</span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-extrabold">
                      {m.driver.name} {m.driver.rating ? `· ★ ${m.driver.rating.toFixed(1)}` : ""}
                    </span>
                    <span className="text-sm text-muted">
                      {m.vehicle.color} {m.vehicle.make} {m.vehicle.model} · <Plate plate={m.vehicle.plateNumber} /> · {m.seatsLeft} {m.seatsLeft === 1 ? "seat" : "seats"} left
                    </span>
                  </span>
                  <span className="flex flex-col items-end">
                    <span className="text-2xl font-extrabold">{m.score}%</span>
                    <span className="text-xs font-bold text-muted">{i === 0 ? "best match" : "match"}</span>
                  </span>
                </div>
                <p className="text-sm">
                  <span className="font-extrabold">Picks you up ~{fmtTime(m.pickupEta)}</span> · leaves {m.from} at {fmtTime(m.departAt)} · drops ~{fmtTime(m.dropEta)}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {m.womenOnly && <Badge tone="warning">women-only</Badge>}
                  {m.reasons.map((r) => (
                    <span key={r} className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-bold">{r}</span>
                  ))}
                </div>
                {state ? (
                  <Badge tone={state === "ACCEPTED" ? "success" : "warning"}>{state === "ACCEPTED" ? "booked" : "requested · waiting for driver"}</Badge>
                ) : (
                  <Button disabled={busy} className="self-start" onClick={() => request(m)}>Request {seats === 1 ? "a seat" : `${seats} seats`}</Button>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}