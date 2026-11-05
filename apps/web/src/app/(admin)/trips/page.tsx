"use client";

import { useCallback, useEffect, useState } from "react";
import { api, RequestError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { fmtTime, fmtWhen } from "@/lib/format";
import { Badge, Button, Notice, PageHeader } from "@/components/ui";
import { Pin, Plate } from "@/components/trip-bits";

interface Booking {
  id: string;
  status: string;
  seats: number;
  pickupLabel: string;
  dropLabel: string;
  pin: string | null;
  lateCancel: boolean;
  costShareEstimate: number | null;
  ride: { id: string; departAt: string; status: string; from: string; to: string; driverName: string; vehicle: { make: string; model: string; color: string; plateNumber: string } };
}
interface Req {
  id: string;
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "EXPIRED" | "CANCELLED";
  seats: number;
  pickupLabel: string;
  matchScore: number | null;
  expiresAt: string;
  ride: { id: string; departAt: string; from: string; to: string; driverName: string; plateNumber: string };
}

const reqLabel = { PENDING: "waiting for driver", ACCEPTED: "accepted", DECLINED: "declined", EXPIRED: "no answer", CANCELLED: "cancelled" };

export default function TripsPage() {
  const { org } = useSession();
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [requests, setRequests] = useState<Req[]>([]);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string }>();
  const [busy, setBusy] = useState(false);

  const fetchAll = useCallback(() => Promise.all([api<Booking[]>("GET", "/me/bookings"), api<Req[]>("GET", "/me/requests")]), []);
  const show = useCallback(([b, r]: [Booking[], Req[]]) => {
    setBookings(b);
    setRequests(r);
  }, []);
  useEffect(() => {
    if (org) fetchAll().then(show, () => setMsg({ tone: "error", text: "Could not load your trips." }));
  }, [org, fetchAll, show]);

  async function act(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setMsg(undefined);
    try {
      const res = (await fn()) as { late?: boolean } | undefined;
      show(await fetchAll());
      setMsg({ tone: "ok", text: res?.late ? `${ok} It was inside the free-cancel window, so your reliability score went down.` : ok });
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof RequestError ? e.message : "That didn't work." });
    } finally {
      setBusy(false);
    }
  }

  const live = (bookings ?? []).filter((b) => b.status === "CONFIRMED");
  const past = (bookings ?? []).filter((b) => b.status !== "CONFIRMED");
  const pending = requests.filter((r) => r.status === "PENDING");
  const recent = requests.filter((r) => r.status !== "PENDING" && r.status !== "ACCEPTED").slice(0, 6);

  return (
    <section className="flex max-w-3xl flex-col gap-6">
      <PageHeader title="My trips" sub="Your booked rides with their PIN, and requests waiting for a driver." />
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {bookings === null ? (
        <p className="text-muted">Loading…</p>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-extrabold">Booked</h2>
            {live.length === 0 && <p className="text-sm text-muted">No booked rides. Find one in Find a ride.</p>}
            {live.map((b) => (
              <article key={b.id} className="flex flex-col gap-4 rounded-[18px] border border-line bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xl font-extrabold">{fmtWhen(b.ride.departAt)}</p>
                    <p className="text-sm text-muted">{b.ride.from} → {b.ride.to}</p>
                  </div>
                  <Badge tone="success">confirmed</Badge>
                </div>
                <p className="text-sm">
                  <span className="font-extrabold">{b.ride.driverName}</span> · {b.ride.vehicle.color} {b.ride.vehicle.make} {b.ride.vehicle.model} · <Plate plate={b.ride.vehicle.plateNumber} />
                </p>
                <p className="text-sm">Meet at <span className="font-extrabold">{b.pickupLabel}</span>{b.costShareEstimate ? ` · est. share ₹${Math.round(b.costShareEstimate)}` : ""}</p>
                {b.pin && (
                  <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-surface p-4">
                    <Pin pin={b.pin} />
                    <span className="text-sm text-muted">Tell this PIN to the driver only inside the car. The ride starts only with it.</span>
                  </div>
                )}
                <Button variant="ghost" disabled={busy} className="self-start" onClick={() => confirm("Cancel this ride? Cancelling close to departure lowers your reliability score.") && act(() => api("POST", `/bookings/${b.id}/cancel`, {}), "Cancelled.")}>
                  Cancel booking
                </Button>
              </article>
            ))}
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-extrabold">Waiting for a driver</h2>
            {pending.length === 0 && <p className="text-sm text-muted">No open requests.</p>}
            {pending.map((r) => (
              <article key={r.id} className="flex flex-wrap items-center gap-3 rounded-[18px] border border-line bg-white p-4">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-extrabold">{r.ride.driverName} · {fmtWhen(r.ride.departAt)}</span>
                  <span className="text-sm text-muted">Pickup {r.pickupLabel} · answer due by {fmtTime(r.expiresAt)}{r.matchScore ? ` · ${r.matchScore}% match` : ""}</span>
                </span>
                <Badge tone="warning">waiting</Badge>
                <Button variant="ghost" disabled={busy} onClick={() => act(() => api("POST", `/requests/${r.id}/cancel`), "Request cancelled.")}>Cancel</Button>
              </article>
            ))}
          </div>

          {(recent.length > 0 || past.length > 0) && (
            <div className="flex flex-col gap-2">
              <h2 className="text-lg font-extrabold">Recent</h2>
              <ul className="flex flex-col divide-y divide-line rounded-[18px] border border-line bg-white px-4">
                {past.map((b) => (
                  <li key={b.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm">
                    <span>{fmtWhen(b.ride.departAt)} · {b.ride.driverName}</span>
                    <Badge tone="neutral">{b.status.toLowerCase().replace(/_/g, " ")}{b.lateCancel ? " (late)" : ""}</Badge>
                  </li>
                ))}
                {recent.map((r) => (
                  <li key={r.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm">
                    <span>Request · {fmtWhen(r.ride.departAt)} · {r.ride.driverName}</span>
                    <Badge tone="neutral">{reqLabel[r.status]}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}