"use client";

import { useCallback, useEffect, useState } from "react";
import { apiWithMeta } from "@/lib/api";
import { useSession } from "@/lib/session";
import { fmtWhen } from "@/lib/format";
import { actionLabel, type AuditRow } from "@/lib/platform-types";
import { Badge, Button, EmptyState, Notice, PageHeader, Skeleton } from "@/components/ui";
import { Icon } from "@/components/icons";

/** The company's own activity log: approvals, driver checks, settings, rides, SOS, exports, RYDO support visits. */
export default function CompanyActivityPage() {
  const { org, can } = useSession();
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [more, setMore] = useState(false);
  const allowed = can("ORG_ADMIN", "HR_ADMIN");

  const query = useCallback((before?: string) => apiWithMeta<AuditRow[], { next: string | null }>("GET", `/admin/audit?limit=40${before ? `&before=${before}` : ""}`), []);
  useEffect(() => {
    if (!org || !allowed) return;
    query().then(
      (r) => (setRows(r.data), setNext(r.meta.next)),
      (e) => setError(e instanceof Error ? e.message : "Could not load."),
    );
  }, [org, allowed, query]);

  if (!org) return null;
  if (!allowed) return <Notice tone="error">Only company and HR admins can see the activity log.</Notice>;

  return (
    <section className="flex max-w-5xl flex-col gap-5">
      <PageHeader title="Activity" sub="Every admin action in your company, newest first. It can't be edited or deleted. RYDO support visits show here too." />
      {error && <Notice tone="error">{error}</Notice>}
      {rows === null && [0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}
      {rows && rows.length === 0 && <EmptyState icon="clock" title="No activity yet" />}
      {rows && rows.length > 0 && (
        <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-[22px] bg-white shadow-soft">
          {rows.map((r) => {
            const rydo = r.actor?.name === "RYDO team";
            const alert = r.action.startsWith("SOS_") || r.action.startsWith("SUPPORT_");
            return (
              <li key={r.id}>
                <button type="button" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id} className="flex w-full flex-wrap items-center gap-3 px-5 py-3 text-left text-sm transition-colors hover:bg-surface">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${alert ? "bg-warning-bg text-warning" : "bg-surface-2"}`}><Icon name={alert ? "shield" : "clock"} size={15} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="font-extrabold">{actionLabel(r.action)}</span>
                    <span className="text-muted"> · {r.actor?.name ?? "System"}</span>
                  </span>
                  {rydo && <Badge tone="ink">RYDO</Badge>}
                  <span className="w-36 text-right text-xs text-muted">{fmtWhen(r.createdAt)}</span>
                </button>
                {open === r.id && (
                  <div className="grid animate-rise gap-3 bg-surface px-5 py-3 text-xs sm:grid-cols-2">
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
      {next && (
        <Button
          variant="ghost"
          loading={more}
          className="self-center"
          onClick={async () => {
            setMore(true);
            try {
              const r = await query(next);
              setRows((x) => [...(x ?? []), ...r.data]);
              setNext(r.meta.next);
            } finally {
              setMore(false);
            }
          }}
        >
          Load more
        </Button>
      )}
    </section>
  );
}
