"use client";

import { useCallback, useEffect, useState } from "react";
import { INQUIRY_STATUSES } from "@rydo/shared";
import Link from "next/link";
import { api, apiWithMeta, RequestError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { fmtWhen } from "@/lib/format";
import { Badge, Button, Card, EmptyState, Notice, PageHeader, Segmented, Select, Skeleton, Textarea } from "@/components/ui";

type Status = (typeof INQUIRY_STATUSES)[number];
interface Inquiry { id: string; companyName: string; contactName: string; workEmail: string; phone: string | null; companySize: string; city: string | null; message: string | null; status: Status; notes: string | null; createdAt: string }
interface Meta { nextCursor: string | null; counts: Record<Status, number> }
const TONE = { NEW: "warning", CONTACTED: "ink", ONBOARDED: "success", CLOSED: "neutral" } as const;

function Row({ i, onChanged }: { i: Inquiry; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>(i.status);
  const [notes, setNotes] = useState(i.notes ?? "");
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    setErr(undefined);
    try {
      await api("PATCH", `/admin/platform/inquiries/${i.id}`, { status, notes: notes.trim() || undefined });
      setOpen(false);
      onChanged();
    } catch (e) {
      setErr(e instanceof RequestError ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-lg font-extrabold">{i.companyName}</span>
        <Badge tone={TONE[i.status]}>{i.status.toLowerCase()}</Badge>
        <Badge tone="neutral">{i.companySize} people</Badge>
        <span className="ml-auto text-xs text-muted">{fmtWhen(i.createdAt)}</span>
      </div>
      <p className="text-sm"><b>{i.contactName}</b> · <a className="underline" href={`mailto:${i.workEmail}`}>{i.workEmail}</a>{i.phone && <> · {i.phone}</>}{i.city && <> · {i.city}</>}</p>
      {i.message && <p className="rounded-xl bg-surface px-3 py-2 text-sm">{i.message}</p>}
      {i.notes && <p className="text-sm text-muted"><b>Notes:</b> {i.notes}</p>}
      <div className="flex flex-wrap gap-2">
        {!open && <Button variant="ghost" className="h-9" onClick={() => setOpen(true)}>Update</Button>}
        {i.status !== "ONBOARDED" && <Link href="/platform/clients/new" className="inline-flex h-9 items-center rounded-2xl bg-lime px-4 text-sm font-extrabold text-ink">Onboard this company</Link>}
      </div>
      {open && (
        <div className="flex flex-col gap-3 border-t border-line pt-3">
          <Select id={`s-${i.id}`} label="Status" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
            {INQUIRY_STATUSES.map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}
          </Select>
          <Textarea id={`n-${i.id}`} label="Notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          {err && <Notice tone="error">{err}</Notice>}
          <div className="flex gap-2"><Button loading={busy} onClick={save}>Save</Button><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button></div>
        </div>
      )}
    </Card>
  );
}

/** Companies that filled in the Contact us form, waiting to be onboarded. */
export default function InquiriesPage() {
  const { me } = useSession();
  const [filter, setFilter] = useState<"" | Status>("");
  const [items, setItems] = useState<Inquiry[] | null>(null);
  const [meta, setMeta] = useState<Meta>();
  const [error, setError] = useState<string>();

  const fetchPage = useCallback((cursor?: string) => {
    const q = new URLSearchParams({ limit: "20", ...(filter ? { status: filter } : {}), ...(cursor ? { cursor } : {}) });
    return apiWithMeta<Inquiry[], Meta>("GET", `/admin/platform/inquiries?${q}`);
  }, [filter]);
  const load = (cursor?: string) =>
    fetchPage(cursor).then(
      (r) => {
        setItems((cur) => (cursor && cur ? [...cur, ...r.data] : r.data));
        setMeta(r.meta);
      },
      () => setError("Could not load onboarding requests."),
    );
  useEffect(() => {
    if (me?.user.isPlatformAdmin)
      fetchPage().then(
        (r) => {
          setItems(r.data);
          setMeta(r.meta);
        },
        () => setError("Could not load onboarding requests."),
      );
  }, [me, fetchPage]);

  const c = meta?.counts;
  return (
    <section className="flex max-w-4xl flex-col gap-5">
      <PageHeader title="Onboarding requests" sub="Companies that asked for RYDO through the Contact us form." />
      <Segmented label="Status" value={filter} onChange={setFilter} options={[
        { value: "", label: "All" },
        { value: "NEW", label: `New${c ? ` (${c.NEW})` : ""}` },
        { value: "CONTACTED", label: `Contacted${c ? ` (${c.CONTACTED})` : ""}` },
        { value: "ONBOARDED", label: "Onboarded" },
        { value: "CLOSED", label: "Closed" },
      ]} />
      {error && <Notice tone="error">{error}</Notice>}
      {!items && !error && <Skeleton className="h-28" />}
      {items?.length === 0 && <EmptyState icon="clipboard" title="No requests here">New requests from the website show up here, and you are notified by email.</EmptyState>}
      {items?.map((i) => <Row key={i.id} i={i} onChanged={() => load()} />)}
      {meta?.nextCursor && <Button variant="ghost" className="self-center" onClick={() => load(meta.nextCursor!)}>Load more</Button>}
    </section>
  );
}
