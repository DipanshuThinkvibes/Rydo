"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { fmtWhen } from "@/lib/format";
import { Badge, Card, EmptyState, Notice, PageHeader, Skeleton } from "@/components/ui";
import { Icon } from "@/components/icons";

interface Booking { id: string; status: string; ride: { id: string; departAt: string; status: string; from: string; to: string; driverName: string } }
interface Driving { id: string; originLabel: string; destinationLabel: string; departAt: string; seatsBooked: number; status: string }
interface Unread { total: number; threads: { rideId: string; count: number }[] }
type Row = { rideId: string; role: "Rider" | "Driver"; title: string; sub: string; when: string; unread: number };

const LIVE = ["SCHEDULED", "FULL", "IN_PROGRESS"];

/** Every ride where you can chat: your booked rides as a rider, and your rides with riders as a driver. */
export default function MessagesPage() {
  const { org } = useSession();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string>();

  const fetchRows = useCallback(async () => {
    {
      const [bookings, driving, unread] = await Promise.all([
        api<Booking[]>("GET", "/me/bookings"),
        api<Driving[]>("GET", "/rides/driving").catch(() => [] as Driving[]),
        api<Unread>("GET", "/me/chat/unread"),
      ]);
      const count = (id: string) => unread.threads.filter((t) => t.rideId === id).reduce((n, t) => n + t.count, 0);
      const asRider: Row[] = bookings
        .filter((b) => ["CONFIRMED", "BOARDED"].includes(b.status) && LIVE.includes(b.ride.status))
        .map((b) => ({ rideId: b.ride.id, role: "Rider", title: `${b.ride.from} → ${b.ride.to}`, sub: `Driver ${b.ride.driverName}`, when: b.ride.departAt, unread: count(b.ride.id) }));
      const asDriver: Row[] = driving
        .filter((r) => r.seatsBooked > 0 && LIVE.includes(r.status))
        .map((r) => ({ rideId: r.id, role: "Driver", title: `${r.originLabel} → ${r.destinationLabel}`, sub: `${r.seatsBooked} ${r.seatsBooked === 1 ? "rider" : "riders"}`, when: r.departAt, unread: count(r.id) }));
      return [...asRider, ...asDriver].sort((a, b) => a.when.localeCompare(b.when));
    }
  }, []);

  useEffect(() => {
    if (!org) return;
    const run = () => fetchRows().then(setRows, () => setError("Could not load your messages."));
    run();
    const t = setInterval(run, 20_000);
    return () => clearInterval(t);
  }, [org, fetchRows]);

  return (
    <section className="flex max-w-3xl flex-col gap-5">
      <PageHeader title="Messages" sub="Chat opens when a seat is confirmed, between the driver and that rider only. It closes when the ride ends." />
      {error && <Notice tone="error">{error}</Notice>}
      {!rows && !error && <Skeleton className="h-24" />}
      {rows?.length === 0 && (
        <EmptyState icon="chat" title="No chats yet">
          Once a driver accepts your seat, or a rider books your ride, you can message each other here.
        </EmptyState>
      )}
      <div className="flex flex-col gap-3">
        {rows?.map((r) => (
          <Link key={`${r.role}-${r.rideId}`} href={`/messages/${r.rideId}`}>
            <Card className="flex items-center gap-4 transition-shadow hover:shadow-lift">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-surface-2"><Icon name="chat" /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-extrabold">{r.title}</span>
                <span className="block text-sm text-muted">{fmtWhen(r.when)} · {r.sub}</span>
              </span>
              <Badge tone="neutral">{r.role}</Badge>
              {r.unread > 0 && <Badge tone="lime">{r.unread} new</Badge>}
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
