"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, RequestError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { fmtWhen } from "@/lib/format";
import type { Client } from "@/lib/platform-types";
import { Avatar, Badge, Button, EmptyState, Notice, PageHeader, Skeleton, Textarea, fieldClass } from "@/components/ui";

interface Person {
  id: string;
  name: string;
  email: string;
  organization: { id: string; name: string };
  roles: string[];
  department: string | null;
  status: string;
  blocked: boolean;
  blockedAt: string | null;
  blockReason: string | null;
  reportsAgainst: number;
  recentReportsAgainst: number;
  flagged: boolean;
}
interface PeopleResult {
  total: number;
  page: number;
  pageSize: number;
  rows: Person[];
}
interface Detail extends Person {
  reports: { id: string; category: string; status: string; description: string; createdAt: string }[];
  history: { action: string; createdAt: string; after: { reason?: string } | null }[];
}

const label = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");

export default function PeoplePage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 max-w-6xl" />}>
      <People />
    </Suspense>
  );
}

/** Everyone on every client, shortened and masked. The super admin can block or unblock a person; nothing private is shown. */
function People() {
  const { me } = useSession();
  const params = useSearchParams();
  const [org, setOrg] = useState(params.get("org") ?? "");
  const [text, setText] = useState(params.get("q") ?? "");
  const [q, setQ] = useState(params.get("q") ?? "");
  const [filter, setFilter] = useState(params.get("filter") ?? "");
  const [page, setPage] = useState(1);
  const [clients, setClients] = useState<Client[]>([]);
  const [data, setData] = useState<PeopleResult | null>(null);
  const [error, setError] = useState<string>();
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string }>();

  const fetchPeople = useCallback(() => {
    const p = new URLSearchParams({ page: String(page) });
    if (org) p.set("orgId", org);
    if (q) p.set("q", q);
    if (filter === "blocked") p.set("blocked", "true");
    if (filter === "flagged") p.set("flagged", "true");
    return api<PeopleResult>("GET", `/admin/platform/people?${p}`);
  }, [org, q, filter, page]);

  useEffect(() => {
    if (!me?.user.isPlatformAdmin) return;
    api<Client[]>("GET", "/admin/platform/organizations").then(setClients, () => undefined);
  }, [me]);
  useEffect(() => {
    if (!me?.user.isPlatformAdmin) return;
    fetchPeople().then(setData, (e) => setError(e instanceof Error ? e.message : "Could not load."));
  }, [me, fetchPeople]);

  if (!me?.user.isPlatformAdmin) return <Notice tone="error">RYDO owner team only.</Notice>;

  const reset = () => {
    setData(null);
    setPage(1);
  };

  function toggle(p: Person) {
    setMsg(undefined);
    setReason("");
    if (open === p.id) {
      setOpen(null);
      return;
    }
    setOpen(p.id);
    setDetail(null);
    api<Detail>("GET", `/admin/platform/people/${p.id}`).then(setDetail, () => undefined);
  }

  async function act(p: Person, kind: "block" | "unblock") {
    setBusy(true);
    setMsg(undefined);
    try {
      await api("POST", `/admin/platform/people/${p.id}/${kind}`, { reason });
      setMsg({ tone: "ok", text: kind === "block" ? `${p.name} is blocked in ${p.organization.name}. They were told, and only RYDO can lift it.` : `${p.name} can use ${p.organization.name} again.` });
      setReason("");
      const [list, one] = await Promise.all([fetchPeople(), api<Detail>("GET", `/admin/platform/people/${p.id}`)]);
      setData(list);
      setDetail(one);
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof RequestError ? (e.fields?.reason ?? e.message) : "Something went wrong. Try again." });
    } finally {
      setBusy(false);
    }
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <section className="flex max-w-6xl flex-col gap-5">
      <PageHeader title="People" sub="Employees of every client. Names and emails are shortened, and phone numbers, ID proofs and trips are never shown here." />
      {error && <Notice tone="error">{error}</Notice>}

      <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); reset(); setQ(text.trim()); }}>
        <label className="flex min-w-[200px] flex-1 flex-col gap-1.5 text-sm font-bold">
          Client
          <select className={`${fieldClass} px-3`} value={org} onChange={(e) => { reset(); setOrg(e.target.value); }}>
            <option value="">All clients</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="flex min-w-[200px] flex-1 flex-col gap-1.5 text-sm font-bold">
          Search name or email
          <input className={`${fieldClass} px-3`} value={text} onChange={(e) => setText(e.target.value)} placeholder="Start typing, then press Enter" />
        </label>
        <label className="flex min-w-[160px] flex-col gap-1.5 text-sm font-bold">
          Show
          <select className={`${fieldClass} px-3`} value={filter} onChange={(e) => { reset(); setFilter(e.target.value); }}>
            <option value="">Everyone</option>
            <option value="blocked">Blocked by RYDO</option>
            <option value="flagged">Reported more than once</option>
          </select>
        </label>
      </form>

      {data === null && [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}
      {data && data.rows.length === 0 && <EmptyState icon="users" title="Nobody found">Try another client, search or filter.</EmptyState>}
      {data && data.rows.length > 0 && (
        <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-[22px] bg-white shadow-soft">
          {data.rows.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => toggle(p)} aria-expanded={open === p.id} className="flex w-full flex-wrap items-center gap-3 px-5 py-3 text-left text-sm transition-colors hover:bg-surface">
                <Avatar name={p.name} size={38} tone={p.blocked ? "orange" : "sky"} />
                <span className="min-w-0 flex-1">
                  <span className="font-extrabold">{p.name}</span> <span className="text-muted">{p.email}</span>
                  <span className="block text-xs text-muted">{p.organization.name} · {p.roles.map(label).join(", ")}{p.department ? ` · ${p.department}` : ""}</span>
                </span>
                {p.flagged && <Badge tone="warning">reported {p.recentReportsAgainst}×</Badge>}
                {p.blocked ? <Badge tone="warning">Blocked by RYDO</Badge> : <Badge tone={p.status === "ACTIVE" ? "success" : "neutral"}>{label(p.status)}</Badge>}
              </button>
              {open === p.id && (
                <div className="flex animate-rise flex-col gap-4 bg-surface px-5 py-4 text-sm">
                  {!detail ? <Skeleton className="h-20" /> : (
                    <>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <h3 className="mb-1.5 text-xs font-extrabold uppercase tracking-[2px] text-muted">Reports against them</h3>
                          {detail.reports.length === 0 ? <p className="text-muted">None.</p> : (
                            <ul className="flex flex-col gap-2">
                              {detail.reports.map((r) => (
                                <li key={r.id} className="rounded-xl bg-white p-3">
                                  <p className="font-bold">{label(r.category)} <span className="font-normal text-muted">· {label(r.status)} · {fmtWhen(r.createdAt)}</span></p>
                                  <p className="text-muted">{r.description}</p>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        <div>
                          <h3 className="mb-1.5 text-xs font-extrabold uppercase tracking-[2px] text-muted">Block history</h3>
                          {detail.history.length === 0 ? <p className="text-muted">Never blocked.</p> : (
                            <ul className="flex flex-col gap-2">
                              {detail.history.map((h, i) => (
                                <li key={i} className="rounded-xl bg-white p-3">
                                  <p className="font-bold">{h.action === "PLATFORM_MEMBER_BLOCKED" ? "Blocked" : "Unblocked"} <span className="font-normal text-muted">· {fmtWhen(h.createdAt)}</span></p>
                                  {h.after?.reason && <p className="text-muted">{h.after.reason}</p>}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>

                      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
                      {(p.blocked || p.status === "ACTIVE" || p.status === "SUSPENDED") && (
                        <div className="flex flex-col gap-3 rounded-2xl bg-white p-4">
                          <Textarea label={p.blocked ? "Why are you unblocking? (kept in the activity log)" : "Why are you blocking? (kept in the activity log)"} value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={300} />
                          <p className="text-xs text-muted">{p.blocked ? "They get their access back and are told." : "They lose access to this company at once and are told. The company admin cannot undo it; only you can."}</p>
                          <Button className="self-start" variant={p.blocked ? "primary" : "danger"} loading={busy} disabled={reason.trim().length < 5} onClick={() => act(p, p.blocked ? "unblock" : "block")}>
                            {p.blocked ? "Unblock" : "Block"} {p.name}
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
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
