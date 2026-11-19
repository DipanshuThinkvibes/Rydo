"use client";

import { useCallback, useEffect, useState } from "react";
import { api, RequestError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { fmtDay } from "@/lib/format";
import { Badge, Button, Card, EmptyState, Input, Notice, PageHeader, Select, Textarea } from "@/components/ui";

interface Result {
  id: string;
  title: string;
  description: string | null;
  status: "DRAFT" | "PUBLISHED" | "CLOSED";
  audience: { roles?: string[] };
  audienceSize: number;
  responses: number;
  responseRate: number | null;
  closesAt: string | null;
  publishedAt: string | null;
  perQuestion?: { id: string; type: string; text: string; answered: number; average?: number | null; distribution?: Record<string, number>; counts?: Record<string, number>; answers?: string[] }[];
}
type Q = { type: "RATING" | "CHOICE" | "TEXT"; text: string; options: string };
const TONE = { DRAFT: "neutral", PUBLISHED: "lime", CLOSED: "ink" } as const;

function ResultView({ id }: { id: string }) {
  const [r, setR] = useState<Result | null>(null);
  useEffect(() => {
    api<Result>("GET", `/admin/surveys/${id}`).then(setR, () => undefined);
  }, [id]);
  if (!r) return <p className="text-sm text-muted">Loading results…</p>;
  return (
    <div className="mt-3 flex flex-col gap-4 border-t border-line pt-3">
      <p className="text-sm"><b>{r.responses}</b> of {r.audienceSize} answered{r.responseRate != null && <> ({Math.round(r.responseRate * 100)}%)</>}. Results are anonymous.</p>
      {r.perQuestion?.map((q) => (
        <div key={q.id} className="flex flex-col gap-1.5">
          <p className="text-sm font-extrabold">{q.text} <span className="font-normal text-muted">({q.answered} answers)</span></p>
          {q.type === "RATING" && <p className="text-sm">Average {q.average ?? "–"} · {Object.entries(q.distribution ?? {}).map(([k, v]) => `${k}★ ${v}`).join("  ")}</p>}
          {q.type === "CHOICE" && Object.entries(q.counts ?? {}).map(([o, n]) => <p key={o} className="text-sm">{o}: <b>{n}</b></p>)}
          {q.type === "TEXT" && (q.answers?.length ? q.answers.map((a, i) => <p key={i} className="rounded-xl bg-surface px-3 py-2 text-sm">{a}</p>) : <p className="text-sm text-muted">No written answers.</p>)}
        </div>
      ))}
    </div>
  );
}

/** Create, publish and read surveys. */
export default function ManageSurveysPage() {
  const { org, support } = useSession();
  const [list, setList] = useState<Result[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [roles, setRoles] = useState("ALL");
  const [questions, setQuestions] = useState<Q[]>([{ type: "RATING", text: "", options: "" }]);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string }>();
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api<Result[]>("GET", "/admin/surveys").then(setList, () => setList([])), []);
  useEffect(() => {
    if (org) load();
  }, [org, load]);

  const setQ = (i: number, patch: Partial<Q>) => setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(undefined);
    try {
      await api("POST", "/admin/surveys", {
        title,
        description: description.trim() || undefined,
        audience: roles === "ALL" ? {} : { roles: [roles] },
        questions: questions.map((q, i) => ({ id: `q${i + 1}`, type: q.type, text: q.text, ...(q.type === "CHOICE" ? { options: q.options.split(",").map((o) => o.trim()).filter(Boolean) } : {}) })),
      });
      setTitle("");
      setDescription("");
      setQuestions([{ type: "RATING", text: "", options: "" }]);
      setShowForm(false);
      load();
    } catch (err) {
      setMsg({ tone: "error", text: err instanceof RequestError ? (Object.values(err.fields ?? {})[0] ?? err.message) : "Could not create the survey." });
    } finally {
      setBusy(false);
    }
  }

  async function act(id: string, what: "publish" | "close" | "delete") {
    setMsg(undefined);
    try {
      if (what === "delete") await api("DELETE", `/admin/surveys/${id}`);
      else await api("POST", `/admin/surveys/${id}/${what}`);
      load();
    } catch (err) {
      setMsg({ tone: "error", text: err instanceof RequestError ? err.message : "Could not do that." });
    }
  }

  return (
    <section className="flex max-w-4xl flex-col gap-5">
      <PageHeader title="Surveys" sub="Ask everyone, or just riders or drivers. Answers are anonymous." action={!support && !showForm ? <Button onClick={() => setShowForm(true)}>New survey</Button> : undefined} />
      {msg && <Notice tone={msg.tone} onClose={() => setMsg(undefined)}>{msg.text}</Notice>}

      {showForm && (
        <Card>
          <form onSubmit={create} className="flex flex-col gap-4">
            <Input id="s-title" label="Title" required value={title} onChange={(e) => setTitle(e.target.value)} />
            <Textarea id="s-desc" label="Short description (optional)" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            <Select id="s-aud" label="Who gets it" value={roles} onChange={(e) => setRoles(e.target.value)}>
              <option value="ALL">Everyone in the company</option>
              <option value="RIDER">Riders</option>
              <option value="DRIVER">Drivers</option>
            </Select>
            {questions.map((q, i) => (
              <div key={i} className="grid gap-3 rounded-2xl bg-surface p-3 sm:grid-cols-[10rem_1fr]">
                <Select id={`q-t-${i}`} label={`Question ${i + 1} type`} value={q.type} onChange={(e) => setQ(i, { type: e.target.value as Q["type"] })}>
                  <option value="RATING">Rating 1 to 5</option>
                  <option value="CHOICE">Pick one</option>
                  <option value="TEXT">Written answer</option>
                </Select>
                <Input id={`q-x-${i}`} label="Question" required value={q.text} onChange={(e) => setQ(i, { text: e.target.value })} />
                {q.type === "CHOICE" && <div className="sm:col-span-2"><Input id={`q-o-${i}`} label="Options, separated by commas" required value={q.options} onChange={(e) => setQ(i, { options: e.target.value })} placeholder="More rides, Better routes, Faster approvals" /></div>}
                {questions.length > 1 && <Button type="button" variant="ghost" className="h-9 w-fit sm:col-span-2" onClick={() => setQuestions((qs) => qs.filter((_, j) => j !== i))}>Remove question</Button>}
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              {questions.length < 20 && <Button type="button" variant="ghost" onClick={() => setQuestions([...questions, { type: "RATING", text: "", options: "" }])}>Add question</Button>}
              <Button type="submit" loading={busy}>Save as draft</Button>
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      {list?.length === 0 && !showForm && <EmptyState icon="clipboard" title="No surveys yet">Create one to hear from your employees.</EmptyState>}
      {list?.map((s) => (
        <Card key={s.id}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-extrabold">{s.title}</span>
            <Badge tone={TONE[s.status]}>{s.status.toLowerCase()}</Badge>
            <span className="ml-auto text-xs text-muted">
              {s.status === "DRAFT" ? "Not sent yet" : `${s.responses}/${s.audienceSize} answered${s.publishedAt ? ` · sent ${fmtDay(s.publishedAt)}` : ""}`}
            </span>
          </div>
          {s.description && <p className="mt-1 text-sm text-muted">{s.description}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {!support && s.status === "DRAFT" && <Button onClick={() => act(s.id, "publish")}>Publish</Button>}
            {!support && s.status === "DRAFT" && <Button variant="ghost" onClick={() => act(s.id, "delete")}>Delete draft</Button>}
            {!support && s.status === "PUBLISHED" && <Button variant="ghost" onClick={() => act(s.id, "close")}>Close</Button>}
            {s.status !== "DRAFT" && <Button variant="ghost" onClick={() => setOpen(open === s.id ? null : s.id)}>{open === s.id ? "Hide results" : "See results"}</Button>}
          </div>
          {open === s.id && <ResultView id={s.id} />}
        </Card>
      ))}
    </section>
  );
}
