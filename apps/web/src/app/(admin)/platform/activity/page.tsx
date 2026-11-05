"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api, apiWithMeta } from "@/lib/api";
import { useSession } from "@/lib/session";
import { fmtWhen } from "@/lib/format";
import { actionLabel, type AuditRow, type Client } from "@/lib/platform-types";
import { Badge, Button, EmptyState, Notice, PageHeader, Skeleton, fieldClass } from "@/components/ui";
import { Icon } from "@/components/icons";

export default function ActivityPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 max-w-6xl" />}>
      <Activity />
    </Suspense>
  );
}

/** Who did what, across every client. Newest first. */
function Activity() {
  const { me } = useSession();
  const params = useSearchParams();
  const [org, setOrg] = useState(params.get("org") ?? "");
  const [action, setAction] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [more, setMore] = useState(false);

  const query = useCallback(
    (before?: string) => {
      const q = new URLSearchParams({ limit: "40" });
      if (org === "rydo") q.set("platformOnly", "true");
      else if (org) q.set("organizationId", org);
      if (action) q.set("action", action);
      if (before) q.set("before", before);
      return apiWithMeta<AuditRow[], { next: string | null }>("GET", `/admin/platform/audit?${q}`);
    },
    [org, action],
  );

  useEffect(() => {
    if (!me?.user.isPlatformAdmin) return;
    api<Client[]>("GET", "/admin/platform/organizations").then(setClients, () => undefined);
    api<string[]>("GET", "/admin/platform/audit/actions").then(setActions, () => undefined);
  }, [me]);

  useEffect(() => {
    if (!me?.user.isPlatformAdmin) return;
    query().then(
      (r) => {
        setRows(r.data);
        setNext(r.meta.next);
      },
      (e) => setError(e instanceof Error ? e.message : "Could not load."),
    );
  }, [me, query]);

  if (!me?.user.isPlatformAdmin) return <Notice tone="error">RYDO owner team only.</Notice>;

  const loadMore = async () => {
    if (!next) return;
    setMore(true);
    try {
      const r = await query(next);
      setRows((x) => [...(x ?? []), ...r.data]);
      setNext(r.meta.next);
    } finally {
      setMore(false);
    }
  };

  return (
    <section className="flex max-w-6xl flex-col gap-5">
      <PageHeader title="Activity" sub="Every admin action on RYDO, across all clients. Nothing here can be edited or deleted." />
      {error && <Notice tone="error">{error}</Notice>}

      <div className="flex flex-wrap gap-3">
        <label className="flex min-w-[220px] flex-1 flex-col gap-1.5 text-sm font-bold">
          Client
          <select className={`${fieldClass} px-3`} value={org} onChange={(e) => { setRows(null); setOrg(e.target.value); }}>
            <option value="">All clients</option>
            <option value="rydo">RYDO only (no client)</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="flex min-w-[220px] flex-1 flex-col gap-1.5 text-sm font-bold">
          Action
          <select className={`${fieldClass} px-3`} value={action} onChange={(e) => { setRows(null); setAction(e.target.value); }}>
            <option value="">All actions</option>
            {actions.map((a) => <option key={a} value={a}>{actionLabel(a)}</option>)}
          </select>
        </label>
      </div>

      {rows === null && [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}
      {rows && rows.length === 0 && <EmptyState icon="clock" title="No activity">Try another client or action.</EmptyState>}
      {rows && rows.length > 0 && (
        <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-[22px] bg-white shadow-soft">
          {rows.map((r) => {
            const support = r.action.startsWith("SUPPORT_");
            return (
              <li key={r.id}>
                <button type="button" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id} className="flex w-full flex-wrap items-center gap-3 px-5 py-3 text-left text-sm transition-colors hover:bg-surface">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${support ? "bg-warning-bg text-warning" : "bg-surface-2"}`}>
                    <Icon name={support ? "shield" : r.organization ? "building" : "globe"} size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="font-extrabold">{actionLabel(r.action)}</span>
                    <span className="text-muted"> · {r.actor?.name ?? "System"}{r.actor?.email ? ` (${r.actor.email})` : ""}</span>
                  </span>
                  {r.organization ? (
                    <Link href={`/platform/clients/${r.organization.id}`} onClick={(e) => e.stopPropagation()} className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-extrabold hover:bg-lime">{r.organization.name}</Link>
                  ) : (
                    <Badge tone="ink">RYDO</Badge>
                  )}
                  <span className="w-36 text-right text-xs text-muted">{fmtWhen(r.createdAt)}</span>
                  <Icon name="arrowRight" size={14} className={`text-muted transition-transform ${open === r.id ? "rotate-90" : ""}`} />
                </button>
                {open === r.id && (
                  <div className="grid animate-rise gap-3 bg-surface px-5 py-3 text-xs sm:grid-cols-2">
                    <p className="sm:col-span-2 text-muted">{r.entityType} · {r.entityId}</p>
                    {r.before != null && <pre className="overflow-x-auto rounded-xl bg-white p-3"><span className="font-bold text-muted">Before{"\n"}</span>{JSON.stringify(r.before, null, 2)}</pre>}
                    {r.after != null && <pre className="overflow-x-auto rounded-xl bg-white p-3"><span className="font-bold text-muted">After{"\n"}</span>{JSON.stringify(r.after, null, 2)}</pre>}
                    {r.before == null && r.after == null && <p className="text-muted">No details recorded.</p>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {next && <Button variant="ghost" loading={more} onClick={loadMore} className="self-center">Load more</Button>}
    </section>
  );
}
