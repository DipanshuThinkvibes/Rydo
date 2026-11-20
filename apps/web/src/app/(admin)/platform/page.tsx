"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, RequestError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Badge, Card, EmptyState, Notice, Skeleton } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";

interface Health {
  totals: Record<string, number>;
  expiring: { id: string; kind: string; expiresAt: string; driverName: string; organizationId: string; organizationName: string }[];
  pending: { id: string; name: string; members: number; drivers: number }[];
  jobs: { states: Record<string, number>; failed: { name: string; at: string }[] } | null;
}
interface Impact {
  days: number;
  sharedTrips: number;
  ridesShared: number;
  sharedKm: number;
  co2SavedKg: number;
  fuelSavedLitres: number;
  adoptionPct: number;
  activePeople: number;
  members: number;
  clients: number;
  weeks: { week: string; trips: number }[];
  topClients: { id: string; name: string; members: number; activePeople: number; sharedTrips: number; adoptionPct: number; co2SavedKg: number }[];
  quietClients: { id: string; name: string; members: number }[];
  newInquiries: number;
}
interface Safety {
  openReports: number;
  activeSos: number;
  blocked: number;
  flaggedPeople: number;
  repeatRule: { reports: number; days: number };
}
interface Licences {
  active: number;
  expiringSoon: number;
  expired: number;
  suspended: number;
  clientsWithoutShare: number;
  expiringDays: number;
}
interface Flagged {
  id: string;
  name: string;
  organization: { id: string; name: string };
  blocked: boolean;
  recentReportsAgainst: number;
}

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};
const num = (n: number | undefined) => (n ?? 0).toLocaleString("en-IN");

/** RYDO owner home: how much carpooling is happening across all clients, who needs a nudge, and what needs attention. */
export default function PlatformOverview() {
  const { me } = useSession();
  const [h, setH] = useState<Health | null>(null);
  const [impact, setImpact] = useState<Impact | null>(null);
  const [safety, setSafety] = useState<Safety | null>(null);
  const [flagged, setFlagged] = useState<Flagged[] | null>(null);
  const [lic, setLic] = useState<Licences | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!me?.user.isPlatformAdmin) return;
    const load = () => {
      api<Impact>("GET", "/admin/platform/impact").then(setImpact, () => undefined);
      api<Safety>("GET", "/admin/platform/reports/summary").then(setSafety, () => undefined);
      api<Licences>("GET", "/admin/platform/licenses/summary").then(setLic, () => undefined);
      api<{ rows: Flagged[] }>("GET", "/admin/platform/people?flagged=true").then((r) => setFlagged(r.rows), () => setFlagged([]));
      return api<Health>("GET", "/admin/platform/health").then(setH, (e) => setError(e instanceof RequestError ? e.message : "Could not load."));
    };
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [me]);

  if (!me?.user.isPlatformAdmin) return <Notice tone="error">RYDO owner team only.</Notice>;

  const t = h?.totals ?? {};
  const first = me.user.name?.split(" ")[0] ?? "there";
  const failedJobs = h?.jobs?.states.failed ?? 0;
  const maxWeek = Math.max(1, ...(impact?.weeks.map((w) => w.trips) ?? [1]));

  const kpis: { k: string; v: string; sub?: string; icon: IconName; tone: string }[] = [
    { k: "Active clients", v: num(impact?.clients ?? t.activeClients), icon: "globe", tone: "bg-[#dbeafe] text-sky", sub: t.inactiveClients ? `${t.inactiveClients} paused` : undefined },
    { k: "Employees on RYDO", v: num(impact?.members ?? t.activeMembers), icon: "users", tone: "bg-lime/60 text-ink", sub: t.pendingMembers ? `${t.pendingMembers} waiting for HR` : undefined },
    { k: "Using carpool", v: `${impact?.adoptionPct ?? 0}%`, icon: "sparkle", tone: "bg-[#ffedd5] text-orange", sub: impact ? `${num(impact.activePeople)} people, last ${impact.days} days` : undefined },
    { k: "Trips shared", v: num(impact?.sharedTrips), icon: "car", tone: "bg-[#dbeafe] text-sky", sub: impact ? `${num(impact.sharedKm)} km together` : undefined },
    { k: "CO₂ saved", v: `${num(impact?.co2SavedKg)} kg`, icon: "route", tone: "bg-success-bg text-success", sub: "cars kept off the road" },
    { k: "Fuel saved", v: `${num(impact?.fuelSavedLitres)} L`, icon: "ticket", tone: "bg-warning-bg text-warning", sub: `last ${impact?.days ?? 30} days` },
  ];

  const attention: { icon: IconName; text: React.ReactNode; href: string; tone?: "warn" }[] = [];
  if (lic && lic.clientsWithoutShare > 0) attention.push({ icon: "badge", text: <><b>{lic.clientsWithoutShare}</b> {lic.clientsWithoutShare === 1 ? "client has" : "clients have"} no valid Share licence. Their employees cannot carpool.</>, href: "/platform/licenses?state=EXPIRED", tone: "warn" });
  if (lic && lic.expiringSoon > 0) attention.push({ icon: "badge", text: <><b>{lic.expiringSoon}</b> {lic.expiringSoon === 1 ? "licence ends" : "licences end"} within {lic.expiringDays} days</>, href: "/platform/licenses?state=EXPIRING", tone: "warn" });
  if (impact && impact.newInquiries > 0) attention.push({ icon: "clipboard", text: <><b>{impact.newInquiries}</b> new onboarding {impact.newInquiries === 1 ? "request" : "requests"} from companies</>, href: "/platform/inquiries" });
  for (const p of h?.pending ?? []) attention.push({ icon: "building", text: <><b>{p.name}</b>: {[p.members && `${p.members} waiting for HR`, p.drivers && `${p.drivers} ${p.drivers === 1 ? "driver" : "drivers"} to verify`].filter(Boolean).join(" · ")}</>, href: `/platform/clients/${p.id}` });
  for (const c of impact?.quietClients ?? []) attention.push({ icon: "clock", text: <><b>{c.name}</b> has {c.members} {c.members === 1 ? "person" : "people"} but no shared trip yet. Time for a nudge.</>, href: `/platform/clients/${c.id}`, tone: "warn" });
  if (safety && safety.activeSos > 0) attention.push({ icon: "alert", text: <><b>{safety.activeSos}</b> SOS {safety.activeSos === 1 ? "alert is" : "alerts are"} not resolved</>, href: "/platform/reports", tone: "warn" });
  if (failedJobs > 0) attention.push({ icon: "alert", text: <><b>{failedJobs}</b> background {failedJobs === 1 ? "job" : "jobs"} failed in the last 24 hours</>, href: "/platform/activity", tone: "warn" });
  const ready = h !== null && impact !== null;

  return (
    <section className="flex max-w-6xl flex-col gap-6">
      {error && <Notice tone="error">{error}</Notice>}

      <div className="relative overflow-hidden rounded-[28px] bg-ink p-6 text-white shadow-lift sm:p-8">
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-lime/25 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-sky/20 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-xl">
            <p className="text-sm font-bold text-lime">{greeting()}, {first}</p>
            <h1 className="mt-1 text-3xl font-extrabold sm:text-4xl">RYDO overview</h1>
            {impact ? (
              <p className="mt-2 text-[#B8C2D6]">
                In the last {impact.days} days, colleagues at {impact.clients} {impact.clients === 1 ? "company" : "companies"} shared <b className="text-white">{num(impact.sharedTrips)}</b> trips and saved <b className="text-white">{num(impact.co2SavedKg)} kg</b> of CO₂.
              </p>
            ) : (
              <Skeleton className="mt-3 h-5 w-80 bg-white/10" />
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/platform/clients/new" className="inline-flex h-11 items-center gap-2 rounded-2xl bg-lime px-5 text-sm font-extrabold text-ink transition-transform hover:bg-lime-hover active:scale-[.97]">
              <Icon name="plus" size={18} /> Add client
            </Link>
            <Link href="/platform/licenses" className="inline-flex h-11 items-center gap-2 rounded-2xl bg-white/10 px-5 text-sm font-extrabold text-white transition-colors hover:bg-white/20">
              <Icon name="badge" size={18} /> {lic ? `Licences · ${lic.active} active` : "Licences"}
            </Link>
            <Link href="/platform/reports" className="inline-flex h-11 items-center gap-2 rounded-2xl bg-white/10 px-5 text-sm font-extrabold text-white transition-colors hover:bg-white/20">
              <Icon name="flag" size={18} /> Reports
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {kpis.map((s, i) => (
          <div key={s.k} style={{ animationDelay: `${i * 50}ms` }} className="flex animate-rise flex-col gap-2 rounded-[22px] bg-white p-4 shadow-soft">
            <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${s.tone}`}><Icon name={s.icon} size={19} /></span>
            {ready ? <span className="text-2xl font-extrabold tabular-nums sm:text-3xl">{s.v}</span> : <Skeleton className="h-9 w-20" />}
            <span className="text-xs font-bold text-muted">{s.k}</span>
            {ready && s.sub && <span className="text-xs text-muted">{s.sub}</span>}
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="flex flex-col gap-4 lg:col-span-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-lg font-extrabold"><Icon name="car" size={18} /> Shared trips, week by week</h2>
            <Badge tone="neutral">last 8 weeks</Badge>
          </div>
          {!impact && <Skeleton className="h-44" />}
          {impact && impact.weeks.every((w) => w.trips === 0) && <p className="rounded-2xl bg-surface p-6 text-center text-sm text-muted">No shared trips yet. They appear here as soon as colleagues start carpooling.</p>}
          {impact && impact.weeks.some((w) => w.trips > 0) && (
            <div role="img" aria-label={`Shared trips per week: ${impact.weeks.map((w) => `${w.week} ${w.trips}`).join(", ")}`} className="flex h-44 items-end gap-2">
              {impact.weeks.map((w, i) => (
                <div key={w.week} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
                  <span className="text-xs font-extrabold tabular-nums">{w.trips}</span>
                  <div style={{ height: `${Math.max(4, (w.trips / maxWeek) * 100)}%`, animationDelay: `${i * 40}ms` }} className={`w-full animate-rise rounded-t-xl ${i === impact.weeks.length - 1 ? "bg-lime" : "bg-ink/80"}`} />
                  <span className="truncate text-[10px] font-bold text-muted">{w.week}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="flex flex-col gap-3 lg:col-span-2">
          <h2 className="flex items-center gap-2 text-lg font-extrabold"><Icon name="badge" size={18} /> Top clients</h2>
          {!impact && <Skeleton className="h-44" />}
          {impact && impact.topClients.length === 0 && <p className="text-sm text-muted">No clients yet.</p>}
          {impact?.topClients.map((c, i) => (
            <Link key={c.id} href={`/platform/clients/${c.id}`} className="group flex flex-col gap-1.5 rounded-2xl bg-surface p-3 transition-colors hover:bg-surface-2">
              <span className="flex items-center gap-2 text-sm">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink text-xs font-extrabold text-white">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate font-extrabold">{c.name}</span>
                <span className="text-xs font-bold text-muted">{c.sharedTrips} trips</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-line-strong"><span style={{ width: `${Math.max(c.adoptionPct, c.adoptionPct > 0 ? 4 : 0)}%` }} className="block h-full rounded-full bg-lime" /></span>
                <span className="w-24 text-right text-xs text-muted">{c.adoptionPct}% of {c.members} use it</span>
              </span>
            </Link>
          ))}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-lg font-extrabold"><Icon name="alert" size={18} /> Needs attention</h2>
          {!ready && <Skeleton className="h-24" />}
          {ready && attention.length === 0 && (!h || h.expiring.length === 0) && <p className="rounded-2xl bg-success-bg p-4 text-sm font-bold text-success">All clear. Nothing is waiting on you.</p>}
          {attention.map((a, i) => (
            <Link key={i} href={a.href} className="group flex items-center gap-3 rounded-2xl bg-surface p-3 text-sm transition-colors hover:bg-surface-2">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${a.tone === "warn" ? "bg-warning-bg text-warning" : "bg-white"}`}><Icon name={a.icon} size={16} /></span>
              <span className="min-w-0 flex-1">{a.text}</span>
              <Icon name="arrowRight" size={16} className="text-muted transition-transform group-hover:translate-x-1" />
            </Link>
          ))}
          {h && h.expiring.length > 0 && (
            <>
              <h3 className="mt-2 text-sm font-extrabold">Driver documents ending in 30 days</h3>
              <ul className="flex flex-col divide-y divide-line">
                {h.expiring.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span><span className="font-bold">{d.driverName}</span> · {d.kind === "DRIVING_LICENSE" ? "driving license" : "vehicle RC"} · <Link className="underline" href={`/platform/clients/${d.organizationId}`}>{d.organizationName}</Link></span>
                    <Badge tone="warning">ends {d.expiresAt}</Badge>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        <div className="flex flex-col gap-3 rounded-[26px] bg-ink p-5 text-white shadow-lift">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-lg font-extrabold"><Icon name="shield" size={18} /> Safety and reports</h2>
            <Link href="/platform/reports" className="text-sm font-extrabold text-lime hover:underline">Open all</Link>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { n: safety?.openReports, t: "open reports", href: "/platform/reports" },
              { n: safety?.activeSos, t: "SOS not resolved", href: "/platform/reports" },
              { n: safety?.flaggedPeople, t: safety ? `reported ${safety.repeatRule.reports}+ times in ${safety.repeatRule.days} days` : "reported again", href: "/platform/people?filter=flagged" },
              { n: safety?.blocked, t: "blocked by RYDO", href: "/platform/people?filter=blocked" },
            ].map((s) => (
              <Link key={s.t} href={s.href} className="rounded-2xl bg-white/10 p-4 transition-colors hover:bg-white/20">
                {safety ? <span className="text-3xl font-extrabold tabular-nums">{s.n ?? 0}</span> : <Skeleton className="h-9 w-12 bg-white/10" />}
                <span className="mt-1 block text-xs font-bold text-[#B8C2D6]">{s.t}</span>
              </Link>
            ))}
          </div>
          {flagged && flagged.length > 0 && (
            <div className="flex flex-col gap-2 rounded-2xl bg-white/10 p-3">
              <p className="text-sm font-extrabold">People to look at</p>
              {flagged.slice(0, 4).map((p) => (
                <Link key={p.id} href={`/platform/people?q=${encodeURIComponent(p.name.split(" ")[0])}&org=${p.organization.id}`} className="flex flex-wrap items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm hover:bg-white/20">
                  <span className="font-extrabold">{p.name}</span>
                  <span className="text-[#B8C2D6]">{p.organization.name}</span>
                  <span className="ml-auto rounded-full bg-warning-bg px-2.5 py-0.5 text-xs font-extrabold text-warning">reported {p.recentReportsAgainst}×{p.blocked ? " · blocked" : ""}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {h && t.activeClients === 0 && (
        <EmptyState icon="globe" title="No clients yet">
          <Link href="/platform/clients/new" className="font-extrabold text-ink underline">Add your first client</Link> to set up their company on RYDO.
        </EmptyState>
      )}
    </section>
  );
}
