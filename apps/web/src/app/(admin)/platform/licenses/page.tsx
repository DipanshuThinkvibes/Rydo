"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { LICENSE_INFO, LICENSE_PRODUCTS, type LicenseProduct } from "@rydo/shared";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { Client } from "@/lib/platform-types";
import { STATE_LABEL, dayLabel, leftLabel, stateTone, type LicenseRow, type LicenseSummary } from "@/lib/licenses";
import { LicenseControls } from "@/components/license-actions";
import { Badge, EmptyState, Notice, PageHeader, Skeleton, fieldClass } from "@/components/ui";
import { Icon } from "@/components/icons";

export default function LicensesPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 max-w-6xl" />}>
      <Licenses />
    </Suspense>
  );
}

/** Every client's licences. RYDO decides what each company may use, and until when. */
function Licenses() {
  const { me } = useSession();
  const params = useSearchParams();
  const [state, setState] = useState(params.get("state") ?? "");
  const [product, setProduct] = useState("");
  const [org, setOrg] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [rows, setRows] = useState<LicenseRow[] | null>(null);
  const [summary, setSummary] = useState<LicenseSummary | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [issueFor, setIssueFor] = useState("");
  const [issueProduct, setIssueProduct] = useState<LicenseProduct>("SHARE");
  const [error, setError] = useState<string>();

  const load = useCallback(() => {
    const p = new URLSearchParams();
    if (state) p.set("state", state);
    if (product) p.set("product", product);
    if (org) p.set("orgId", org);
    api<LicenseSummary>("GET", "/admin/platform/licenses/summary").then(setSummary, () => undefined);
    return api<LicenseRow[]>("GET", `/admin/platform/licenses?${p}`).then(setRows, (e) => setError(e instanceof Error ? e.message : "Could not load."));
  }, [state, product, org]);

  useEffect(() => {
    if (!me?.user.isPlatformAdmin) return;
    api<Client[]>("GET", "/admin/platform/organizations").then(setClients, () => undefined);
  }, [me]);
  useEffect(() => {
    if (!me?.user.isPlatformAdmin) return;
    load();
  }, [me, load]);

  if (!me?.user.isPlatformAdmin) return <Notice tone="error">RYDO owner team only.</Notice>;

  const tiles = [
    { k: "Active licences", v: summary?.active, tone: "text-success", filter: "ACTIVE" },
    { k: `Ending in ${summary?.expiringDays ?? 30} days`, v: summary?.expiringSoon, tone: "text-warning", filter: "EXPIRING" },
    { k: "Expired", v: summary?.expired, tone: "text-danger", filter: "EXPIRED" },
    { k: "Paused", v: summary?.suspended, tone: "text-warning", filter: "SUSPENDED" },
  ];

  return (
    <section className="flex max-w-6xl flex-col gap-5">
      <PageHeader title="Licences" sub="What each client can use, and until when. A product stops for a client the moment its licence ends or is paused." />
      {error && <Notice tone="error">{error}</Notice>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <button key={t.k} type="button" onClick={() => setState(state === t.filter ? "" : t.filter)} aria-pressed={state === t.filter} className={`rounded-[22px] bg-white p-4 text-left shadow-soft transition-shadow hover:shadow-lift ${state === t.filter ? "ring-2 ring-ink" : ""}`}>
            {summary ? <span className={`text-3xl font-extrabold tabular-nums ${t.v ? t.tone : ""}`}>{t.v ?? 0}</span> : <Skeleton className="h-9 w-12" />}
            <span className="mt-1 block text-xs font-bold text-muted">{t.k}</span>
          </button>
        ))}
      </div>
      {summary && summary.clientsWithoutShare > 0 && (
        <Notice tone="error">{summary.clientsWithoutShare} {summary.clientsWithoutShare === 1 ? "client has" : "clients have"} no valid RYDO Share licence, so their employees cannot carpool right now.</Notice>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[200px] flex-1 flex-col gap-1.5 text-sm font-bold">
          Client
          <select className={`${fieldClass} px-3`} value={org} onChange={(e) => { setRows(null); setOrg(e.target.value); }}>
            <option value="">All clients</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="flex min-w-[170px] flex-col gap-1.5 text-sm font-bold">
          Product
          <select className={`${fieldClass} px-3`} value={product} onChange={(e) => { setRows(null); setProduct(e.target.value); }}>
            <option value="">All products</option>
            {LICENSE_PRODUCTS.map((p) => <option key={p} value={p}>{LICENSE_INFO[p].label}</option>)}
          </select>
        </label>
        <label className="flex min-w-[170px] flex-col gap-1.5 text-sm font-bold">
          Status
          <select className={`${fieldClass} px-3`} value={state} onChange={(e) => { setRows(null); setState(e.target.value); }}>
            <option value="">All</option>
            <option value="ACTIVE">Active</option>
            <option value="EXPIRING">Ending soon</option>
            <option value="EXPIRED">Expired</option>
            <option value="SUSPENDED">Paused</option>
            <option value="SCHEDULED">Starts later</option>
            <option value="REVOKED">Revoked</option>
          </select>
        </label>
      </div>

      {rows === null && [0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}
      {rows && rows.length === 0 && <EmptyState icon="badge" title="No licences here">Try another filter, or issue one below.</EmptyState>}
      {rows && rows.length > 0 && (
        <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-[22px] bg-white shadow-soft">
          {rows.map((l) => {
            const key = l.id ?? `${l.organization?.id}-${l.product}`;
            return (
              <li key={key}>
                <button type="button" onClick={() => setOpen(open === key ? null : key)} aria-expanded={open === key} className="flex w-full flex-wrap items-center gap-3 px-5 py-3 text-left text-sm transition-colors hover:bg-surface">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-2"><Icon name="badge" size={17} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="font-extrabold">{l.organization?.name}</span>
                    <span className="block text-xs text-muted">{LICENSE_INFO[l.product].label}</span>
                  </span>
                  <span className="text-xs text-muted">{dayLabel(l.expiresAt)}{leftLabel(l) ? ` · ${leftLabel(l)}` : ""}</span>
                  <Badge tone={stateTone(l.state, l.daysLeft)}>{STATE_LABEL[l.state]}</Badge>
                  <Icon name="arrowRight" size={14} className={`text-muted transition-transform ${open === key ? "rotate-90" : ""}`} />
                </button>
                {open === key && l.organization && (
                  <div className="flex animate-rise flex-col gap-3 bg-surface px-5 py-4">
                    {l.statusReason && <p className="text-sm text-muted">Reason: {l.statusReason}</p>}
                    <LicenseControls orgId={l.organization.id} product={l.product} state={l.state} endsOn={l.expiresAt} onChanged={load} />
                    <Link href={`/platform/clients/${l.organization.id}`} className="text-sm font-extrabold underline">Open {l.organization.name}</Link>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-col gap-3 rounded-[22px] bg-white p-5 shadow-soft">
        <h2 className="text-lg font-extrabold">Issue a licence</h2>
        <p className="text-sm text-muted">Give a client a product it does not have yet, with an end date.</p>
        <div className="flex flex-wrap gap-3">
          <label className="flex min-w-[200px] flex-1 flex-col gap-1.5 text-sm font-bold">
            Client
            <select className={`${fieldClass} px-3`} value={issueFor} onChange={(e) => setIssueFor(e.target.value)}>
              <option value="">Choose a client…</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="flex min-w-[200px] flex-col gap-1.5 text-sm font-bold">
            Product
            <select className={`${fieldClass} px-3`} value={issueProduct} onChange={(e) => setIssueProduct(e.target.value as LicenseProduct)}>
              {LICENSE_PRODUCTS.map((p) => <option key={p} value={p}>{LICENSE_INFO[p].label}</option>)}
            </select>
          </label>
        </div>
        {issueFor && <LicenseControls key={issueFor + issueProduct} orgId={issueFor} product={issueProduct} state="NONE" onChanged={() => { setIssueFor(""); load(); }} />}
      </div>
    </section>
  );
}
