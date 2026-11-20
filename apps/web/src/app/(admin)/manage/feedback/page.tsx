"use client";

import { useCallback, useEffect, useState } from "react";
import { FEEDBACK_STATUSES } from "@rydo/shared";
import { api, apiWithMeta, download, RequestError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { fmtWhen } from "@/lib/format";
import { FEEDBACK_LABEL, ISSUE_LABEL } from "@/lib/labels";
import { Badge, Button, Card, EmptyState, Notice, PageHeader, Segmented, Skeleton } from "@/components/ui";

interface Insights {
  days: number;
  rides: { averageRating: number | null; ratings: number; trend: { week: string; avg: number; count: number }[] };
  feedback: { total: number; byCategory: { category: string; label: string; count: number; averageRating: number | null }[]; byStatus: Record<string, number> };
  issues: { open: number; inProgress: number; resolved: number; avgHours: number | null; byCategory: { category: string; total: number; resolved: number; avgHours: number | null }[]; resolutionTrend: { week: string; avgHours: number; resolved: number }[] };
  surveys: { published: number; avgResponseRate: number | null };
  themes: { word: string; mentions: number }[];
}
interface Entry { id: string; category: string; categoryLabel: string; rating: number | null; comment: string; status: string; adminNote: string | null; from: { name: string }; createdAt: string }

const Tile = ({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) => (
  <Card className="flex flex-col gap-0.5"><span className="text-xs font-bold uppercase tracking-wider text-muted">{label}</span><span className="text-2xl font-extrabold">{value}</span>{sub && <span className="text-xs text-muted">{sub}</span>}</Card>
);

/** Simple horizontal bars: width is the value relative to the biggest. */
function Bars({ rows, unit = "" }: { rows: { label: string; value: number }[]; unit?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[9rem_1fr_3.5rem] items-center gap-2 text-sm">
          <span className="truncate">{r.label}</span>
          <span className="h-3 rounded-full bg-surface-2"><span className="block h-3 rounded-full bg-ink" style={{ width: `${(r.value / max) * 100}%` }} /></span>
          <span className="text-right font-bold tabular-nums">{r.value}{unit}</span>
        </div>
      ))}
    </div>
  );
}

function InsightsView() {
  const [days, setDays] = useState("90");
  const [data, setData] = useState<Insights | null>(null);
  useEffect(() => {
    api<Insights>("GET", `/admin/feedback/insights?days=${days}`).then(setData, () => undefined);
  }, [days]);
  if (!data) return <Skeleton className="h-64" />;
  return (
    <div className="flex flex-col gap-5">
      <Segmented label="Period" value={days} onChange={setDays} options={[{ value: "30", label: "30 days" }, { value: "90", label: "90 days" }, { value: "365", label: "1 year" }]} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Average ride rating" value={data.rides.averageRating ? `${data.rides.averageRating} ★` : "–"} sub={`${data.rides.ratings} ratings`} />
        <Tile label="Feedback received" value={data.feedback.total} sub={`${data.feedback.byStatus.NEW ?? 0} new`} />
        <Tile label="Issue resolution" value={data.issues.avgHours != null ? `${data.issues.avgHours} h` : "–"} sub={`${data.issues.open} open · ${data.issues.inProgress} in progress · ${data.issues.resolved} resolved`} />
        <Tile label="Survey response rate" value={data.surveys.avgResponseRate != null ? `${Math.round(data.surveys.avgResponseRate * 100)}%` : "–"} sub={`${data.surveys.published} surveys`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col gap-3"><h2 className="font-extrabold">Ride rating by week</h2>{data.rides.trend.length ? <Bars rows={data.rides.trend.map((t) => ({ label: t.week, value: t.avg }))} unit=" ★" /> : <p className="text-sm text-muted">No ratings in this period.</p>}</Card>
        <Card className="flex flex-col gap-3"><h2 className="font-extrabold">Feedback by topic</h2>{data.feedback.byCategory.length ? <Bars rows={data.feedback.byCategory.map((c) => ({ label: c.label, value: c.count }))} /> : <p className="text-sm text-muted">No feedback yet.</p>}</Card>
        <Card className="flex flex-col gap-3"><h2 className="font-extrabold">Issues by type</h2>{data.issues.byCategory.length ? <Bars rows={data.issues.byCategory.map((c) => ({ label: ISSUE_LABEL[c.category] ?? c.category, value: c.total }))} /> : <p className="text-sm text-muted">No issues reported.</p>}</Card>
        <Card className="flex flex-col gap-3"><h2 className="font-extrabold">Hours to resolve, by week</h2>{data.issues.resolutionTrend.length ? <Bars rows={data.issues.resolutionTrend.map((t) => ({ label: t.week, value: t.avgHours }))} unit=" h" /> : <p className="text-sm text-muted">Nothing resolved in this period.</p>}</Card>
      </div>
      <Card className="flex flex-col gap-3">
        <h2 className="font-extrabold">Words people keep using</h2>
        {data.themes.length ? <div className="flex flex-wrap gap-2">{data.themes.map((t) => <Badge key={t.word} tone="neutral">{t.word} · {t.mentions}</Badge>)}</div> : <p className="text-sm text-muted">Not enough text yet to spot patterns.</p>}
      </Card>
    </div>
  );
}

function Entries() {
  const { support } = useSession();
  const [status, setStatus] = useState<"" | (typeof FEEDBACK_STATUSES)[number]>("");
  const [items, setItems] = useState<Entry[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [err, setErr] = useState<string>();
  const fetchPage = useCallback(
    (cursor?: string) => {
      const q = new URLSearchParams({ limit: "20", ...(status ? { status } : {}), ...(cursor ? { cursor } : {}) });
      return apiWithMeta<Entry[], { nextCursor: string | null }>("GET", `/admin/feedback?${q}`);
    },
    [status],
  );
  const load = (cursor?: string) =>
    fetchPage(cursor).then(
      (r) => {
        setItems((cur) => (cursor && cur ? [...cur, ...r.data] : r.data));
        setNext(r.meta.nextCursor);
      },
      () => setErr("Could not load feedback."),
    );
  useEffect(() => {
    fetchPage().then(
      (r) => {
        setItems(r.data);
        setNext(r.meta.nextCursor);
      },
      () => setErr("Could not load feedback."),
    );
  }, [fetchPage]);

  async function mark(id: string, s: string) {
    try {
      await api("PATCH", `/admin/feedback/${id}`, { status: s });
      load();
    } catch (e) {
      setErr(e instanceof RequestError ? e.message : "Could not update.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented label="Status" value={status} onChange={setStatus} options={[{ value: "", label: "All" }, { value: "NEW", label: "New" }, { value: "REVIEWED", label: "Reviewed" }, { value: "CLOSED", label: "Closed" }]} />
        <Button variant="ghost" className="ml-auto" onClick={() => download("/admin/feedback/export.csv", "rydo-feedback.csv").catch(() => setErr("Download failed."))}>Export CSV</Button>
      </div>
      {err && <Notice tone="error" onClose={() => setErr(undefined)}>{err}</Notice>}
      {items?.length === 0 && <EmptyState icon="star" title="No feedback here" />}
      {items?.map((f) => (
        <Card key={f.id} className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-extrabold">{FEEDBACK_LABEL[f.category] ?? f.categoryLabel}</span>
            {f.rating && <span className="text-sm text-[#B45309]">{"★".repeat(f.rating)}</span>}
            <Badge tone={f.status === "NEW" ? "warning" : "success"}>{f.status.toLowerCase()}</Badge>
            <span className="ml-auto text-xs text-muted">{f.from.name} · {fmtWhen(f.createdAt)}</span>
          </div>
          <p className="text-sm">{f.comment}</p>
          {!support && f.status !== "CLOSED" && (
            <div className="flex gap-2">
              {f.status === "NEW" && <Button variant="ghost" className="h-9" onClick={() => mark(f.id, "REVIEWED")}>Mark reviewed</Button>}
              <Button variant="ghost" className="h-9" onClick={() => mark(f.id, "CLOSED")}>Close</Button>
            </div>
          )}
        </Card>
      ))}
      {next && <Button variant="ghost" className="self-center" onClick={() => load(next)}>Load more</Button>}
    </div>
  );
}

export default function ManageFeedbackPage() {
  const { org } = useSession();
  const [tab, setTab] = useState<"insights" | "entries">("insights");
  if (!org) return null;
  return (
    <section className="flex max-w-5xl flex-col gap-5">
      <PageHeader title="Feedback" sub="What your employees tell you, and the trends behind it." />
      <Segmented label="View" value={tab} onChange={setTab} options={[{ value: "insights", label: "Insights" }, { value: "entries", label: "All feedback" }]} />
      {tab === "insights" ? <InsightsView /> : <Entries />}
    </section>
  );
}
