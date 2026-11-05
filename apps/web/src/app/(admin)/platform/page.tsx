"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, RequestError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { fmtTime } from "@/lib/format";
import { Badge, Card, EmptyState, Notice, PageHeader, Skeleton } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";

interface Health {
  totals: Record<string, number>;
  usage: { provider: string; sku: string; today: number; month: number }[];
  expiring: { id: string; kind: string; expiresAt: string; driverName: string; organizationId: string; organizationName: string }[];
  pending: { id: string; name: string; members: number; drivers: number }[];
  jobs: { states: Record<string, number>; failed: { name: string; at: string }[] } | null;
}

const SKU: Record<string, string> = { autocomplete: "Address search", place_details: "Place details", routes: "Routes" };

/** RYDO owner overview: the whole platform on one screen. */
export default function PlatformOverview() {
  const { me } = useSession();
  const [h, setH] = useState<Health | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!me?.user.isPlatformAdmin) return;
    const load = () => api<Health>("GET", "/admin/platform/health").then(setH, (e) => setError(e instanceof RequestError ? e.message : "Could not load."));
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [me]);

  if (!me?.user.isPlatformAdmin) return <Notice tone="error">RYDO owner team only.</Notice>;

  const t = h?.totals ?? {};
  const tiles: { k: string; v: number | undefined; icon: IconName; sub?: string }[] = [
    { k: "Active clients", v: t.activeClients, icon: "globe", sub: t.inactiveClients ? `${t.inactiveClients} paused` : undefined },
    { k: "Employees on RYDO", v: t.activeMembers, icon: "users", sub: t.pendingMembers ? `${t.pendingMembers} waiting for HR` : undefined },
    { k: "Verified drivers", v: t.verifiedDrivers, icon: "badge", sub: t.pendingDrivers ? `${t.pendingDrivers} to check` : undefined },
    { k: "Rides today", v: t.ridesToday, icon: "car" },
    { k: "Seats booked today", v: t.bookingsToday, icon: "ticket" },
    { k: "Open requests", v: t.openRequests, icon: "clock", sub: t.cancellations24h ? `${t.cancellations24h} cancelled in 24 h` : undefined },
  ];
  const failed = h?.jobs?.states.failed ?? 0;

  return (
    <section className="flex max-w-6xl flex-col gap-6">
      <PageHeader
        title="RYDO overview"
        sub="Every client on one screen. Refreshes every minute."
        action={
          <Link href="/platform/clients/new" className="inline-flex h-11 items-center gap-2 rounded-2xl bg-lime px-5 text-sm font-extrabold text-ink shadow-[0_6px_16px_rgba(140,190,40,.28)] transition-transform hover:bg-lime-hover active:scale-[.97]">
            <Icon name="plus" size={18} /> Add client
          </Link>
        }
      />
      {error && <Notice tone="error">{error}</Notice>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {tiles.map((s, i) => (
          <div key={s.k} style={{ animationDelay: `${i * 50}ms` }} className="flex animate-rise flex-col gap-2 rounded-[22px] bg-white p-4 shadow-soft">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-2"><Icon name={s.icon} size={18} /></span>
            {h ? <span className="text-3xl font-extrabold tabular-nums">{s.v ?? 0}</span> : <Skeleton className="h-9 w-16" />}
            <span className="text-xs font-bold text-muted">{s.k}</span>
            {s.sub && <span className="text-xs font-bold text-warning">{s.sub}</span>}
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-lg font-extrabold"><Icon name="alert" size={18} /> Needs attention</h2>
          {!h && <Skeleton className="h-24" />}
          {h && h.pending.length === 0 && h.expiring.length === 0 && <p className="text-sm text-muted">Nothing waiting. All clients are up to date.</p>}
          {h?.pending.map((p) => (
            <Link key={p.id} href={`/platform/clients/${p.id}`} className="group flex items-center gap-3 rounded-2xl bg-surface p-3 transition-colors hover:bg-surface-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white"><Icon name="building" size={16} /></span>
              <span className="min-w-0 flex-1 text-sm">
                <span className="block font-extrabold">{p.name}</span>
                <span className="text-muted">{[p.members && `${p.members} ${p.members === 1 ? "employee" : "employees"} waiting for HR`, p.drivers && `${p.drivers} ${p.drivers === 1 ? "driver" : "drivers"} to verify`].filter(Boolean).join(" · ")}</span>
              </span>
              <Icon name="arrowRight" size={16} className="text-muted transition-transform group-hover:translate-x-1" />
            </Link>
          ))}
          {h && h.expiring.length > 0 && (
            <>
              <h3 className="mt-2 text-sm font-extrabold">Driver documents expiring in 30 days</h3>
              <ul className="flex flex-col divide-y divide-line">
                {h.expiring.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span>
                      <span className="font-bold">{d.driverName}</span> · {d.kind === "DRIVING_LICENSE" ? "driving license" : "vehicle RC"} · <Link className="underline" href={`/platform/clients/${d.organizationId}`}>{d.organizationName}</Link>
                    </span>
                    <Badge tone="warning">ends {d.expiresAt}</Badge>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        <div className="flex flex-col gap-6">
          <Card className="flex flex-col gap-3">
            <h2 className="flex items-center gap-2 text-lg font-extrabold"><Icon name="route" size={18} /> Google Maps this month</h2>
            {!h && <Skeleton className="h-20" />}
            {h && h.usage.length === 0 && <p className="text-sm text-muted">No maps calls counted yet this month.</p>}
            {h && h.usage.length > 0 && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-bold text-muted">
                    <th className="py-1.5 font-bold">Call</th>
                    <th className="py-1.5 text-right font-bold">Today</th>
                    <th className="py-1.5 text-right font-bold">This month</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {h.usage.map((u) => (
                    <tr key={u.provider + u.sku}>
                      <td className="py-2 font-bold">{SKU[u.sku] ?? u.sku}</td>
                      <td className="py-2 text-right tabular-nums">{u.today}</td>
                      <td className="py-2 text-right font-extrabold tabular-nums">{u.month.toLocaleString("en-IN")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="text-xs text-muted">Counted by RYDO for each call. Check Google Cloud billing for the exact bill.</p>
          </Card>

          <Card className="flex flex-col gap-3">
            <h2 className="flex items-center gap-2 text-lg font-extrabold"><Icon name="layers" size={18} /> Background jobs (24 h)</h2>
            {!h && <Skeleton className="h-16" />}
            {h && !h.jobs && <p className="text-sm text-muted">Job runner is off on this server.</p>}
            {h?.jobs && (
              <>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(h.jobs.states).length === 0 && <span className="text-sm text-muted">No jobs ran in the last 24 hours.</span>}
                  {Object.entries(h.jobs.states).map(([state, n]) => (
                    <Badge key={state} tone={state === "failed" ? "warning" : state === "completed" ? "success" : "neutral"}>{state} · {n}</Badge>
                  ))}
                </div>
                {failed > 0 && (
                  <ul className="text-sm">
                    {h.jobs.failed.map((f, i) => <li key={i} className="flex items-center gap-2 text-danger"><Icon name="alert" size={14} />{f.name} failed at {fmtTime(f.at)}</li>)}
                  </ul>
                )}
              </>
            )}
          </Card>
        </div>
      </div>

      {h && h.totals.activeClients === 0 && (
        <EmptyState icon="globe" title="No clients yet">
          <Link href="/platform/clients/new" className="font-extrabold text-ink underline">Add your first client</Link> to set up their company on RYDO.
        </EmptyState>
      )}
    </section>
  );
}
