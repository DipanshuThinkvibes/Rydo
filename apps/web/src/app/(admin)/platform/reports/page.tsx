"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { fmtWhen } from "@/lib/format";
import type { Client } from "@/lib/platform-types";
import { Badge, Button, EmptyState, Notice, PageHeader, Skeleton, fieldClass } from "@/components/ui";

interface Report {
  id: string;
  organization: string;
  category: string;
  status: string;
  description: string;
  createdAt: string;
  resolvedAt: string | null;
  reporter: string;
  against: { membershipId: string; name: string; blocked: boolean; reportsAgainst: number; flagged: boolean } | null;
}
interface Result {
  total: number;
  page: number;
  pageSize: number;
  rows: Report[];
}
interface Summary {
  openReports: number;
  activeSos: number;
  blocked: number;
  flaggedPeople: number;
  repeatRule: { reports: number; days: number };
}

const label = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");

/** Complaints from every client in one queue, so a repeat problem is easy to spot. Names are shortened; no places or contact details. */
export default function ReportsPage() {
  const { me } = useSession();
  const [org, setOrg] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [clients, setClients] = useState<Client[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [data, setData] = useState<Result | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!me?.user.platformRole) return;
    api<Client[]>("GET", "/admin/platform/people/companies").then(setClients, () => undefined);
    api<Summary>("GET", "/admin/platform/reports/summary").then(setSummary, () => undefined);
  }, [me]);
  useEffect(() => {
    if (!me?.user.platformRole) return;
    const p = new URLSearchParams({ page: String(page) });
    if (org) p.set("orgId", org);
    if (status) p.set("status", status);
    api<Result>("GET", `/admin/platform/reports?${p}`).then(setData, (e) => setError(e instanceof Error ? e.message : "Could not load."));
  }, [me, org, status, page]);

  if (!me?.user.platformRole) return <Notice tone="error">RYDO team only.</Notice>;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  const tiles = summary
    ? [
        { n: summary.openReports, t: "open reports", href: undefined },
        { n: summary.activeSos, t: "SOS alerts not resolved", href: undefined },
        { n: summary.flaggedPeople, t: `reported ${summary.repeatRule.reports}+ times in ${summary.repeatRule.days} days`, href: "/platform/people?filter=flagged" },
        { n: summary.blocked, t: "blocked by RYDO", href: "/platform/people?filter=blocked" },
      ]
    : [];

  return (
    <section className="flex max-w-6xl flex-col gap-5">
      <PageHeader title="Reports and safety" sub="Complaints from every client. When the same person is reported again, they are flagged so you can look closer and block them if needed." />
      {error && <Notice tone="error">{error}</Notice>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {summary === null && [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
        {tiles.map((t) => {
          const body = (
            <>
              <p className="text-3xl font-extrabold">{t.n}</p>
              <p className="text-xs font-bold text-muted">{t.t}</p>
            </>
          );
          return t.href ? <Link key={t.t} href={t.href} className="rounded-[22px] bg-white p-4 shadow-soft hover:shadow-lift">{body}</Link> : <div key={t.t} className="rounded-[22px] bg-white p-4 shadow-soft">{body}</div>;
        })}
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="flex min-w-[200px] flex-1 flex-col gap-1.5 text-sm font-bold">
          Client
          <select className={`${fieldClass} px-3`} value={org} onChange={(e) => { setData(null); setPage(1); setOrg(e.target.value); }}>
            <option value="">All clients</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="flex min-w-[160px] flex-col gap-1.5 text-sm font-bold">
          Status
          <select className={`${fieldClass} px-3`} value={status} onChange={(e) => { setData(null); setPage(1); setStatus(e.target.value); }}>
            <option value="">All</option>
            <option value="OPEN">Open</option>
            <option value="IN_PROGRESS">In progress</option>
            <option value="RESOLVED">Resolved</option>
          </select>
        </label>
      </div>

      {data === null && [0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}
      {data && data.rows.length === 0 && <EmptyState icon="flag" title="No reports">Nothing matches these filters.</EmptyState>}
      {data && data.rows.length > 0 && (
        <ul className="flex flex-col gap-3">
          {data.rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-2 rounded-[22px] bg-white p-5 shadow-soft">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-extrabold">{label(r.category)}</span>
                <Badge tone={r.status === "RESOLVED" ? "success" : r.status === "OPEN" ? "warning" : "neutral"}>{label(r.status)}</Badge>
                <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-extrabold">{r.organization}</span>
                <span className="ml-auto text-xs text-muted">{fmtWhen(r.createdAt)}</span>
              </div>
              <p className="text-sm">{r.description}</p>
              <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                Reported by <b className="text-ink">{r.reporter}</b>
                {r.against && (
                  <>
                    against <b className="text-ink">{r.against.name}</b>
                    {r.against.flagged && <Badge tone="warning">reported {r.against.reportsAgainst}× — look closer</Badge>}
                    {r.against.blocked && <Badge tone="warning">blocked</Badge>}
                    <Link href={`/platform/people?q=${encodeURIComponent(r.against.name.split(" ")[0])}`} className="font-extrabold text-ink underline">Open in People</Link>
                  </>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}

      {data && data.total > data.pageSize && (
        <div className="flex items-center justify-center gap-3 text-sm font-bold">
          <Button variant="ghost" disabled={page <= 1} onClick={() => { setData(null); setPage(page - 1); }}>Previous</Button>
          <span>Page {page} of {pages}</span>
          <Button variant="ghost" disabled={page >= pages} onClick={() => { setData(null); setPage(page + 1); }}>Next</Button>
        </div>
      )}
    </section>
  );
}
