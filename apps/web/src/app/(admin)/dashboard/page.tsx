"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, apiWithMeta } from "@/lib/api";
import { useSession } from "@/lib/session";
import { fmtWhen } from "@/lib/format";
import { Badge, Card, PageHeader, Skeleton } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";

interface Booking { id: string; status: string; ride: { id: string; departAt: string; status: string; from: string; to: string; driverName: string } }
interface Driving { id: string; originLabel: string; destinationLabel: string; departAt: string; seatsBooked: number; seatsTotal: number; status: string; pendingRequests: number }
interface Data {
  bookings: Booking[];
  driving: Driving[];
  unreadChat: number;
  unreadNotices: number;
  openSurveys: number;
}

const LIVE = ["SCHEDULED", "FULL", "IN_PROGRESS"];

function Tile({ href, icon, label, value, hint }: { href: string; icon: IconName; label: string; value: number | string; hint?: string }) {
  return (
    <Link href={href}>
      <Card className="flex h-full items-center gap-4 transition-shadow hover:shadow-lift">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface-2"><Icon name={icon} /></span>
        <span>
          <span className="block text-2xl font-extrabold leading-none">{value}</span>
          <span className="mt-1 block text-sm font-bold">{label}</span>
          {hint && <span className="block text-xs text-muted">{hint}</span>}
        </span>
      </Card>
    </Link>
  );
}

/** Home for employees: your next ride, what needs attention, and the usual things to do. */
export default function DashboardPage() {
  const { me, org, isAdmin, features } = useSession();
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!org) return;
    Promise.all([
      api<Booking[]>("GET", "/me/bookings").catch(() => [] as Booking[]),
      api<Driving[]>("GET", "/rides/driving").catch(() => [] as Driving[]),
      api<{ total: number }>("GET", "/me/chat/unread").catch(() => ({ total: 0 })),
      apiWithMeta<unknown[], { unread: number }>("GET", "/me/notifications").catch(() => ({ data: [], meta: { unread: 0 } })),
      api<{ answered: boolean }[]>("GET", "/me/surveys").catch(() => []),
    ]).then(
      ([bookings, driving, chat, notices, surveys]) =>
        setData({ bookings, driving, unreadChat: chat.total, unreadNotices: notices.meta.unread, openSurveys: surveys.filter((s) => !s.answered).length }),
      () => setFailed(true),
    );
  }, [org]);

  const first = (me?.user.name ?? "").split(" ")[0];
  const upcoming = data
    ? [
        ...data.bookings.filter((b) => ["CONFIRMED", "BOARDED"].includes(b.status) && LIVE.includes(b.ride.status)).map((b) => ({ key: b.id, rideId: b.ride.id, role: "Rider" as const, from: b.ride.from, to: b.ride.to, at: b.ride.departAt, status: b.ride.status, sub: `Driver ${b.ride.driverName}`, href: "/trips" })),
        ...data.driving.filter((r) => LIVE.includes(r.status)).map((r) => ({ key: r.id, rideId: r.id, role: "Driver" as const, from: r.originLabel, to: r.destinationLabel, at: r.departAt, status: r.status, sub: `${r.seatsBooked}/${r.seatsTotal} seats booked`, href: `/drive/rides/${r.id}` })),
      ].sort((a, b) => a.at.localeCompare(b.at))
    : [];
  const next = upcoming[0];
  const pendingRequests = data?.driving.reduce((n, r) => n + (LIVE.includes(r.status) ? r.pendingRequests : 0), 0) ?? 0;

  return (
    <section className="flex max-w-5xl flex-col gap-6">
      <PageHeader title={first ? `Hi, ${first}` : "Dashboard"} sub={org ? `${org.organization.name} · here is what needs your attention` : undefined} />
      {failed && <p className="text-sm text-danger">Could not load your dashboard. Try again in a moment.</p>}
      {!data && !failed && <Skeleton className="h-40" />}

      {data && (
        <>
          {next ? (
            <Card className="flex flex-col gap-3 bg-ink text-white">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="lime">Next ride</Badge>
                <Badge tone="neutral">{next.role}</Badge>
                {next.status === "IN_PROGRESS" && <Badge tone="success" dot>live now</Badge>}
                <span className="ml-auto text-sm text-[#B8C2D6]">{fmtWhen(next.at)}</span>
              </div>
              <p className="text-2xl font-extrabold">{next.from} → {next.to}</p>
              <p className="text-sm text-[#B8C2D6]">{next.sub}</p>
              <div className="flex flex-wrap gap-2">
                <Link href={next.href} className="inline-flex h-10 items-center rounded-2xl bg-lime px-5 text-sm font-extrabold text-ink">{next.status === "IN_PROGRESS" ? "Open live trip" : "View ride"}</Link>
                <Link href={`/messages/${next.rideId}`} className="inline-flex h-10 items-center rounded-2xl border-[1.5px] border-white/30 px-5 text-sm font-extrabold">Messages</Link>
              </div>
            </Card>
          ) : (
            <Card className="flex flex-wrap items-center gap-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-2"><Icon name="car" /></span>
              <span className="min-w-0 flex-1"><span className="block text-lg font-extrabold">No ride planned yet</span><span className="text-sm text-muted">Find a colleague going your way, or offer your own seats.</span></span>
              {features.share && <Link href="/ride" className="inline-flex h-11 items-center rounded-2xl bg-ink px-5 text-sm font-extrabold text-white">Find a ride</Link>}
            </Card>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile href="/messages" icon="chat" label="Unread messages" value={data.unreadChat} />
            <Tile href="/notifications" icon="bell" label="New notifications" value={data.unreadNotices} />
            <Tile href="/surveys" icon="clipboard" label="Surveys to answer" value={data.openSurveys} />
            <Tile href="/drive" icon="wheel" label="Seat requests" value={pendingRequests} hint="waiting for your answer" />
          </div>

          {upcoming.length > 1 && (
            <div className="flex flex-col gap-2">
              <h2 className="text-lg font-extrabold">Coming up</h2>
              {upcoming.slice(1, 5).map((u) => (
                <Link key={u.key} href={u.href}>
                  <Card className="flex flex-wrap items-center gap-3 py-3 transition-shadow hover:shadow-lift">
                    <Badge tone="neutral">{u.role}</Badge>
                    <span className="min-w-0 flex-1 truncate font-extrabold">{u.from} → {u.to}</span>
                    <span className="text-sm text-muted">{fmtWhen(u.at)}</span>
                  </Card>
                </Link>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <h2 className="text-lg font-extrabold">Quick actions</h2>
            <div className="flex flex-wrap gap-2">
              {features.share && (
                <>
                  <Link href="/ride" className="inline-flex h-11 items-center gap-2 rounded-2xl bg-ink px-5 text-sm font-extrabold text-white"><Icon name="search" size={16} /> Find a ride</Link>
                  <Link href="/drive" className="inline-flex h-11 items-center gap-2 rounded-2xl bg-surface-2 px-5 text-sm font-extrabold"><Icon name="wheel" size={16} /> Offer a ride</Link>
                  <Link href="/commute" className="inline-flex h-11 items-center gap-2 rounded-2xl bg-surface-2 px-5 text-sm font-extrabold"><Icon name="calendar" size={16} /> Plan my week</Link>
                </>
              )}
              <Link href="/safety" className="inline-flex h-11 items-center gap-2 rounded-2xl bg-surface-2 px-5 text-sm font-extrabold"><Icon name="shield" size={16} /> Safety</Link>
              <Link href="/issues" className="inline-flex h-11 items-center gap-2 rounded-2xl bg-surface-2 px-5 text-sm font-extrabold"><Icon name="flag" size={16} /> Report an issue</Link>
              {isAdmin && <Link href="/ops" className="inline-flex h-11 items-center gap-2 rounded-2xl bg-lime px-5 text-sm font-extrabold text-ink"><Icon name="route" size={16} /> Admin: today&apos;s rides</Link>}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
