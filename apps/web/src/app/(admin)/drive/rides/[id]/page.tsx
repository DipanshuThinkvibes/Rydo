"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, RequestError } from "@/lib/api";
import { fmtKm, fmtMin, fmtWhen, initials } from "@/lib/format";
import { Badge, Button, Notice } from "@/components/ui";
import { Plate } from "@/components/trip-bits";

interface Person { name: string; department: string | null; reliability: number; rating: number | null }
interface Ride {
  id: string; status: string; departAt: string; from: string; to: string; seatsTotal: number; seatsBooked: number; distanceMeters: number | null; durationSeconds: number | null;
  vehicle: { make: string; model: string; plateNumber: string };
  riders: (Person & { bookingId: string; status: string; seats: number; pickupLabel: string; dropLabel: string })[];
  requests: (Person & { requestId: string; seats: number; pickupLabel: string; dropLabel: string; matchScore: number | null; reasons: string[] | null; expiresAt: string })[];
}

function Countdown({ until }: { until: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.round((new Date(until).getTime() - now) / 1000));
  return <span className="font-extrabold tabular-nums">{s > 120 ? `${Math.ceil(s / 60)} min` : `${s}s`} left</span>;
}

export default function ManageRidePage() {
  const { id } = useParams<{ id: string }>();
  const [ride, setRide] = useState<Ride | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string }>();
  const [busy, setBusy] = useState(false);

  const fetchRide = useCallback(() => api<Ride>("GET", `/rides/${id}/manage`), [id]);
  useEffect(() => {
    fetchRide().then(setRide, (e) => setMsg({ tone: "error", text: e instanceof RequestError ? e.message : "Could not load this ride." }));
    const t = setInterval(() => fetchRide().then(setRide, () => undefined), 10_000);
    return () => clearInterval(t);
  }, [fetchRide]);

  async function act(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setMsg(undefined);
    try {
      await fn();
      setRide(await fetchRide());
      setMsg({ tone: "ok", text: ok });
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof RequestError ? e.message : "That didn't work." });
    } finally {
      setBusy(false);
    }
  }

  if (!ride) return msg ? <Notice tone="error">{msg.text}</Notice> : <p className="text-muted">Loading…</p>;
  const open = ["SCHEDULED", "FULL"].includes(ride.status);

  return (
    <section className="flex max-w-3xl flex-col gap-5">
      <Link href="/drive" className="text-sm font-bold underline">← Back to Drive</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">{fmtWhen(ride.departAt)}</h1>
          <p className="text-sm text-muted">{ride.from} → {ride.to} · {fmtKm(ride.distanceMeters)} · {fmtMin(ride.durationSeconds)} · {ride.vehicle.make} {ride.vehicle.model} <Plate plate={ride.vehicle.plateNumber} /></p>
        </div>
        <Badge tone={ride.status === "CANCELLED" ? "neutral" : "success"}>{ride.status.toLowerCase()} · {ride.seatsBooked}/{ride.seatsTotal} seats</Badge>
      </div>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-extrabold">Requests</h2>
        {ride.requests.length === 0 && <p className="text-sm text-muted">No requests waiting. This page refreshes by itself.</p>}
        {ride.requests.map((r) => (
          <article key={r.requestId} className="flex flex-col gap-3 rounded-[18px] border-2 border-ink bg-white p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#FFEDD5] font-extrabold text-[#9A3412]">{initials(r.name)}</span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-extrabold">{r.name}{r.rating ? ` · ★ ${r.rating.toFixed(1)}` : ""}</span>
                <span className="text-sm text-muted">{r.department ?? "No department"} · reliability {Math.round(r.reliability)}%</span>
              </span>
              <span className="text-sm"><Countdown until={r.expiresAt} /></span>
            </div>
            <p className="text-sm">Pickup <span className="font-extrabold">{r.pickupLabel}</span> · drop {r.dropLabel} · {r.seats} {r.seats === 1 ? "seat" : "seats"}{r.matchScore ? ` · ${r.matchScore}% match` : ""}</p>
            <div className="flex gap-2">
              <Button disabled={busy} onClick={() => act(() => api("POST", `/requests/${r.requestId}/accept`), `${r.name} is in. They got the ride PIN.`)}>Accept</Button>
              <Button variant="ghost" disabled={busy} onClick={() => act(() => api("POST", `/requests/${r.requestId}/decline`), "Declined.")}>Decline</Button>
            </div>
          </article>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-extrabold">Riders</h2>
        {ride.riders.length === 0 && <p className="text-sm text-muted">No one booked yet.</p>}
        {ride.riders.map((r) => (
          <div key={r.bookingId} className="flex flex-wrap items-center gap-3 rounded-[18px] border border-line bg-white p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#DCE6FF] font-extrabold text-[#1E3A8A]">{initials(r.name)}</span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-extrabold">{r.name}</span>
              <span className="text-sm text-muted">Pickup {r.pickupLabel} · {r.seats} {r.seats === 1 ? "seat" : "seats"}</span>
            </span>
            <Badge tone="success">{r.status.toLowerCase()}</Badge>
          </div>
        ))}
      </div>

      {open && (
        <Button
          variant="danger"
          disabled={busy}
          className="self-start"
          onClick={() => {
            const reason = prompt("Why are you cancelling? Riders will see this.", "Plans changed");
            if (reason !== null) act(() => api("POST", `/rides/${ride.id}/cancel`, { reason }), "Ride cancelled. Riders were told.");
          }}
        >
          Cancel this ride
        </Button>
      )}
    </section>
  );
}