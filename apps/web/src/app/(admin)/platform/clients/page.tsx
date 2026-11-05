"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, RequestError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { fmtDay } from "@/lib/format";
import { statusTone, type Client } from "@/lib/platform-types";
import { Avatar, Badge, EmptyState, Notice, PageHeader, Segmented, Skeleton } from "@/components/ui";
import { Icon } from "@/components/icons";

/** All RYDO clients with live numbers. */
export default function ClientsPage() {
  const { me } = useSession();
  const router = useRouter();
  const [clients, setClients] = useState<Client[] | null>(null);
  const [error, setError] = useState<string>();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "ACTIVE" | "SUSPENDED">("all");

  useEffect(() => {
    if (me?.user.isPlatformAdmin) api<Client[]>("GET", "/admin/platform/organizations").then(setClients, (e) => setError(e instanceof RequestError ? e.message : "Could not load clients."));
  }, [me]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (clients ?? []).filter((c) => (status === "all" || c.status === status) && (!term || c.name.toLowerCase().includes(term) || c.emailDomains.some((d) => d.includes(term)) || c.slug.includes(term)));
  }, [clients, q, status]);

  if (!me?.user.isPlatformAdmin) return <Notice tone="error">RYDO owner team only.</Notice>;

  return (
    <section className="flex max-w-6xl flex-col gap-5">
      <PageHeader
        title="Clients"
        sub="Companies using RYDO. Open one to change its plan, features or admins."
        action={
          <Link href="/platform/clients/new" className="inline-flex h-11 items-center gap-2 rounded-2xl bg-lime px-5 text-sm font-extrabold text-ink shadow-[0_6px_16px_rgba(140,190,40,.28)] hover:bg-lime-hover active:scale-[.97]">
            <Icon name="plus" size={18} /> Add client
          </Link>
        }
      />
      {error && <Notice tone="error">{error}</Notice>}

      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-[240px] flex-1">
          <span className="sr-only">Search clients</span>
          <Icon name="search" size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email domain" className="h-11 w-full rounded-2xl border-[1.5px] border-line-strong bg-white pl-10 pr-4 text-sm font-semibold outline-none focus:border-ink" />
        </label>
        <Segmented label="Status" value={status} onChange={setStatus} options={[{ value: "all", label: "All" }, { value: "ACTIVE", label: "Active" }, { value: "SUSPENDED", label: "Paused" }]} />
      </div>

      {clients === null && [0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}
      {clients !== null && shown.length === 0 && (
        <EmptyState icon="globe" title={clients.length ? "No client matches" : "No clients yet"}>
          {clients.length ? "Try another name or domain." : "Add your first client to set them up on RYDO."}
        </EmptyState>
      )}

      {shown.length > 0 && (
        <div className="overflow-x-auto rounded-[22px] bg-white shadow-soft">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wider text-muted">
                <th className="px-5 py-3 font-bold">Client</th>
                <th className="px-3 py-3 font-bold">Status</th>
                <th className="px-3 py-3 text-right font-bold">Employees</th>
                <th className="px-3 py-3 text-right font-bold">Drivers</th>
                <th className="px-3 py-3 text-right font-bold">Rides next 7 days</th>
                <th className="px-3 py-3 text-right font-bold">Bookings 7 days</th>
                <th className="px-3 py-3 font-bold">Modules</th>
                <th className="px-5 py-3 font-bold">Last activity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {shown.map((c, i) => {
                const s = c.stats;
                const nearLimit = c.maxEmployees && s ? s.activeMembers / c.maxEmployees >= 0.9 : false;
                return (
                  <tr
                    key={c.id}
                    tabIndex={0}
                    onClick={() => router.push(`/platform/clients/${c.id}`)}
                    onKeyDown={(e) => e.key === "Enter" && router.push(`/platform/clients/${c.id}`)}
                    style={{ animationDelay: `${i * 30}ms` }}
                    className="animate-rise cursor-pointer transition-colors hover:bg-surface focus-visible:bg-surface focus-visible:outline-none"
                  >
                    <td className="px-5 py-3.5">
                      <span className="flex items-center gap-3">
                        <Avatar name={c.name} tone="ink" size={38} />
                        <span className="min-w-0">
                          <span className="block font-extrabold">{c.name}</span>
                          <span className="block truncate text-xs text-muted">{c.emailDomains.join(", ")}</span>
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-3.5"><Badge tone={statusTone(c.status)}>{c.status === "SUSPENDED" ? "paused" : c.status.toLowerCase()}</Badge></td>
                    <td className="px-3 py-3.5 text-right tabular-nums">
                      <span className={`font-extrabold ${nearLimit ? "text-warning" : ""}`}>{s?.activeMembers ?? 0}</span>
                      {c.maxEmployees ? <span className="text-muted"> / {c.maxEmployees}</span> : null}
                      {s?.pendingMembers ? <span className="block text-xs font-bold text-warning">{s.pendingMembers} waiting</span> : null}
                    </td>
                    <td className="px-3 py-3.5 text-right tabular-nums">
                      <span className="font-extrabold">{s?.verifiedDrivers ?? 0}</span>
                      {s?.pendingDrivers ? <span className="block text-xs font-bold text-warning">{s.pendingDrivers} to check</span> : null}
                    </td>
                    <td className="px-3 py-3.5 text-right font-extrabold tabular-nums">{s?.ridesNext7 ?? 0}</td>
                    <td className="px-3 py-3.5 text-right font-extrabold tabular-nums">{s?.bookingsLast7 ?? 0}</td>
                    <td className="px-3 py-3.5">
                      <span className="flex flex-wrap gap-1">
                        {c.features.share && <Badge tone="lime">Share</Badge>}
                        {c.features.enterprise && <Badge tone="neutral">Enterprise</Badge>}
                        {c.features.campus && <Badge tone="neutral">Campus</Badge>}
                        {!c.features.share && !c.features.enterprise && !c.features.campus && <span className="text-xs text-muted">none</span>}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-muted">{s?.lastActivityAt ? fmtDay(s.lastActivityAt) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
