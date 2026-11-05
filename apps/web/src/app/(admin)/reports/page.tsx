"use client";

import { useEffect, useState } from "react";
import { api, download, RequestError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { isoDay } from "@/lib/format";
import { Badge, Button, Card, EmptyState, Notice, PageHeader, Segmented, Skeleton } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";
import { DayChart } from "@/components/day-chart";

interface Summary {
  totals: Record<string, number>;
  series: { day: string; rides: number; bookings: number }[];
  drivers: { name: string; rides: number; riders: number; rating: number | null }[];
  departments: { department: string; trips: number; riders: number }[];
}
type Preset = "month" | "last" | "30" | "custom";

function rangeFor(p: Preset): { from: string; to: string } {
  const today = isoDay(0);
  const [y, m] = today.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  if (p === "month") return { from: `${y}-${pad(m)}-01`, to: today };
  if (p === "last") {
    const py = m === 1 ? y - 1 : y;
    const pm = m === 1 ? 12 : m - 1;
    const last = new Date(Date.UTC(py, pm, 0)).getUTCDate();
    return { from: `${py}-${pad(pm)}-01`, to: `${py}-${pad(pm)}-${pad(last)}` };
  }
  return { from: isoDay(-29), to: today };
}

/** Company reports: how much RYDO is used, by whom, and CSV exports for HR and finance. */
export default function ReportsPage() {
  const { org, can, support } = useSession();
  const [preset, setPreset] = useState<Preset>("month");
  const [range, setRange] = useState(() => rangeFor("month"));
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<string | null>(null);
  const allowed = can("ORG_ADMIN", "HR_ADMIN", "OPS_ADMIN");

  useEffect(() => {
    if (!org || !allowed) return;
    api<Summary>("GET", `/admin/reports/summary?from=${range.from}&to=${range.to}`).then(
      (d) => (setData(d), setError(undefined)),
      (e) => setError(e instanceof RequestError ? e.message : "Could not load the report."),
    );
  }, [org, allowed, range]);

  if (!org) return null;
  if (!allowed) return <Notice tone="error">Only company admins can see reports.</Notice>;

  const t = data?.totals ?? {};
  const fill = t.seatsOffered ? Math.round(((t.seatsBooked ?? 0) / t.seatsOffered) * 100) : 0;
  const tiles: { k: string; v: string | number; sub?: string; icon: IconName }[] = [
    { k: "Rides offered", v: t.ridesOffered ?? 0, sub: `${t.ridesCompleted ?? 0} completed`, icon: "car" },
    { k: "Seats booked", v: t.seatsBooked ?? 0, sub: `${fill}% of ${t.seatsOffered ?? 0} offered`, icon: "ticket" },
    { k: "Trips taken", v: t.tripsCompleted ?? 0, sub: `${t.activeRiders ?? 0} riders · ${t.activeDrivers ?? 0} drivers`, icon: "users" },
    { k: "Km shared", v: (t.sharedKm ?? 0).toLocaleString("en-IN"), sub: "seat-km not driven alone", icon: "route" },
    { k: "CO₂ saved (est.)", v: `${(t.co2SavedKg ?? 0).toLocaleString("en-IN")} kg`, sub: "at 120 g per car-km", icon: "sparkle" },
    { k: "No-shows · late cancels", v: `${t.noShows ?? 0} · ${t.lateCancels ?? 0}`, sub: t.sosRaised ? `${t.sosRaised} SOS raised` : "no SOS", icon: "alert" },
  ];

  const get = async (kind: "rides" | "bookings" | "employees") => {
    setBusy(kind);
    setError(undefined);
    try {
      await download(kind === "employees" ? "/admin/reports/employees.csv" : `/admin/reports/${kind}.csv?from=${range.from}&to=${range.to}`, `${kind}.csv`);
    } catch (e) {
      setError(e instanceof RequestError ? e.message : "Download failed.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="flex max-w-6xl flex-col gap-6">
      <PageHeader title="Reports" sub="How your company uses RYDO. Exports open in Excel." />

      <div className="flex flex-wrap items-end gap-3">
        <Segmented
          label="Period"
          value={preset}
          onChange={(p) => {
            setPreset(p);
            if (p !== "custom") setRange(rangeFor(p));
          }}
          options={[{ value: "month", label: "This month" }, { value: "last", label: "Last month" }, { value: "30", label: "Last 30 days" }, { value: "custom", label: "Custom" }]}
        />
        {preset === "custom" && (
          <div className="flex animate-rise items-center gap-2">
            <label className="sr-only" htmlFor="r-from">From</label>
            <input id="r-from" type="date" value={range.from} max={range.to} onChange={(e) => e.target.value && setRange({ ...range, from: e.target.value })} className="h-10 rounded-xl border-[1.5px] border-line-strong bg-white px-2 text-sm font-bold" />
            <span className="text-sm font-bold text-muted">to</span>
            <label className="sr-only" htmlFor="r-to">To</label>
            <input id="r-to" type="date" value={range.to} min={range.from} onChange={(e) => e.target.value && setRange({ ...range, to: e.target.value })} className="h-10 rounded-xl border-[1.5px] border-line-strong bg-white px-2 text-sm font-bold" />
          </div>
        )}
      </div>

      {error && <Notice tone="error" onClose={() => setError(undefined)}>{error}</Notice>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {tiles.map((x, i) => (
          <div key={x.k} style={{ animationDelay: `${i * 50}ms` }} className="flex animate-rise flex-col gap-2 rounded-[22px] bg-white p-4 shadow-soft">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-2"><Icon name={x.icon} size={18} /></span>
            {data ? <span className="text-2xl font-extrabold tabular-nums">{x.v}</span> : <Skeleton className="h-8 w-16" />}
            <span className="text-xs font-bold text-muted">{x.k}</span>
            {x.sub && <span className="text-xs text-muted">{x.sub}</span>}
          </div>
        ))}
      </div>

      {data ? <DayChart series={data.series} /> : <Skeleton className="h-64" />}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <h2 className="text-lg font-extrabold">Top drivers</h2>
          {data && data.drivers.length === 0 && <EmptyState icon="wheel" title="No completed rides yet">Drivers appear here after their first completed ride.</EmptyState>}
          {data && data.drivers.length > 0 && (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs font-bold text-muted"><th className="py-1.5 font-bold">Driver</th><th className="py-1.5 text-right font-bold">Rides</th><th className="py-1.5 text-right font-bold">Riders carried</th><th className="py-1.5 text-right font-bold">Rating</th></tr></thead>
              <tbody className="divide-y divide-line">
                {data.drivers.map((d, i) => (
                  <tr key={d.name + i}>
                    <td className="py-2 font-bold">{i === 0 && <Badge tone="lime">top</Badge>} {d.name}</td>
                    <td className="py-2 text-right tabular-nums">{d.rides}</td>
                    <td className="py-2 text-right font-extrabold tabular-nums">{d.riders}</td>
                    <td className="py-2 text-right tabular-nums">{d.rating ? `★ ${d.rating.toFixed(1)}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card className="flex flex-col gap-3">
          <h2 className="text-lg font-extrabold">By department</h2>
          {data && data.departments.length === 0 && <EmptyState icon="layers" title="No trips yet">Trips taken show up here by the rider&apos;s department.</EmptyState>}
          {data && data.departments.length > 0 && (
            <ul className="flex flex-col gap-2">
              {data.departments.map((d) => {
                const maxTrips = data.departments[0].trips || 1;
                return (
                  <li key={d.department} className="flex flex-col gap-1 text-sm">
                    <span className="flex justify-between"><span className="font-bold">{d.department}</span><span className="text-muted">{d.trips} trips · {d.riders} riders</span></span>
                    <span className="h-2 overflow-hidden rounded-full bg-surface-2"><span className="block h-full rounded-full bg-sky" style={{ width: `${(d.trips / maxTrips) * 100}%` }} /></span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <Card className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-lg font-extrabold"><Icon name="ticket" size={18} /> Download CSV</h2>
        <p className="text-sm text-muted">For the period above. Each download is noted in your activity log.{support ? " Not available in support view." : ""}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" loading={busy === "rides"} disabled={!!support} onClick={() => get("rides")}>Rides</Button>
          <Button variant="ghost" loading={busy === "bookings"} disabled={!!support} onClick={() => get("bookings")}>Bookings</Button>
          {can("ORG_ADMIN", "HR_ADMIN") && <Button variant="ghost" loading={busy === "employees"} disabled={!!support} onClick={() => get("employees")}>Employees (all)</Button>}
        </div>
      </Card>
    </section>
  );
}
