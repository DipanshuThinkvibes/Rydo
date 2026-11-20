"use client";

import { useCallback, useEffect, useState } from "react";
import { ISSUE_STATUSES } from "@rydo/shared";
import { api, apiWithMeta, RequestError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { fmtWhen } from "@/lib/format";
import { ISSUE_TONE } from "@/lib/labels";
import { Badge, Button, Card, EmptyState, Notice, PageHeader, Segmented, Select, Skeleton, Textarea } from "@/components/ui";

type Status = (typeof ISSUE_STATUSES)[number];
interface Issue {
  id: string;
  categoryLabel: string;
  description: string;
  status: Status;
  resolution: string | null;
  createdAt: string;
  resolvedAt: string | null;
  ride: { from?: string; to?: string; departAt?: string } | null;
  reporter: { name: string };
  against: { name: string } | null;
  assignedTo: { name: string } | null;
}
interface Meta { nextCursor: string | null; counts: Record<Status, number> }

function IssueCard({ i, onChanged, readOnly }: { i: Issue; onChanged: () => void; readOnly: boolean }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>(i.status);
  const [resolution, setResolution] = useState(i.resolution ?? "");
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setErr(undefined);
    try {
      await api("PATCH", `/admin/issues/${i.id}`, { status, resolution: resolution.trim() || undefined });
      setOpen(false);
      onChanged();
    } catch (e) {
      setErr(e instanceof RequestError ? (e.fields?.resolution ?? e.message) : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-extrabold">{i.categoryLabel}</span>
        <Badge tone={ISSUE_TONE[i.status]}>{i.status.replace("_", " ").toLowerCase()}</Badge>
        <span className="ml-auto text-xs text-muted">{fmtWhen(i.createdAt)}</span>
      </div>
      <p className="text-sm">{i.description}</p>
      <p className="text-xs text-muted">
        From <b>{i.reporter.name}</b>
        {i.against && <> about <b>{i.against.name}</b></>}
        {i.ride?.from && <> · ride {i.ride.from} → {i.ride.to}</>}
        {i.assignedTo && <> · handled by {i.assignedTo.name}</>}
      </p>
      {i.resolution && <p className="rounded-xl bg-success-bg px-3 py-2 text-sm text-success"><b>Resolution:</b> {i.resolution}</p>}
      {!readOnly && !open && <Button variant="ghost" className="h-9 self-start" onClick={() => setOpen(true)}>Update</Button>}
      {open && (
        <div className="mt-1 flex flex-col gap-3 border-t border-line pt-3">
          <Select id={`st-${i.id}`} label="Status" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
            {ISSUE_STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ").toLowerCase()}</option>)}
          </Select>
          <Textarea id={`res-${i.id}`} label="How was it resolved? (needed to resolve)" rows={3} value={resolution} onChange={(e) => setResolution(e.target.value)} hint="The reporter is notified of every status change." />
          {err && <Notice tone="error">{err}</Notice>}
          <div className="flex gap-2">
            <Button loading={busy} onClick={save}>Save</Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

/** Issue reports from employees, newest first, worked from open to resolved. */
export default function ManageIssuesPage() {
  const { org, support } = useSession();
  const [filter, setFilter] = useState<"" | Status>("");
  const [items, setItems] = useState<Issue[] | null>(null);
  const [meta, setMeta] = useState<Meta>();
  const [error, setError] = useState<string>();

  const fetchPage = useCallback(
    (cursor?: string) => {
      const q = new URLSearchParams({ limit: "20", ...(filter ? { status: filter } : {}), ...(cursor ? { cursor } : {}) });
      return apiWithMeta<Issue[], Meta>("GET", `/admin/issues?${q}`);
    },
    [filter],
  );
  const load = (cursor?: string) =>
    fetchPage(cursor).then(
      (r) => {
        setItems((cur) => (cursor && cur ? [...cur, ...r.data] : r.data));
        setMeta(r.meta);
      },
      () => setError("Could not load issue reports."),
    );
  useEffect(() => {
    if (org)
      fetchPage().then(
        (r) => {
          setItems(r.data);
          setMeta(r.meta);
        },
        () => setError("Could not load issue reports."),
      );
  }, [org, fetchPage]);

  const c = meta?.counts;
  return (
    <section className="flex max-w-4xl flex-col gap-5">
      <PageHeader title="Issues" sub="Reports from your employees. You are notified of every new one." />
      <Segmented label="Status" value={filter} onChange={setFilter} options={[
        { value: "", label: "All" },
        { value: "OPEN", label: `Open${c ? ` (${c.OPEN})` : ""}` },
        { value: "IN_PROGRESS", label: `In progress${c ? ` (${c.IN_PROGRESS})` : ""}` },
        { value: "RESOLVED", label: `Resolved${c ? ` (${c.RESOLVED})` : ""}` },
      ]} />
      {error && <Notice tone="error">{error}</Notice>}
      {!items && !error && <Skeleton className="h-28" />}
      {items?.length === 0 && <EmptyState icon="flag" title="No reports here">Nothing to handle in this view.</EmptyState>}
      <div className="flex flex-col gap-3">
        {items?.map((i) => <IssueCard key={i.id} i={i} readOnly={!!support} onChanged={() => load()} />)}
      </div>
      {meta?.nextCursor && <Button variant="ghost" className="self-center" onClick={() => load(meta.nextCursor!)}>Load more</Button>}
    </section>
  );
}
