"use client";

import { useCallback, useEffect, useState } from "react";
import type { SurveyQuestion } from "@rydo/shared";
import { api, RequestError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { fmtDay } from "@/lib/format";
import { Badge, Button, Card, EmptyState, Notice, PageHeader, Textarea } from "@/components/ui";

interface Survey { id: string; title: string; description: string | null; questions: SurveyQuestion[]; closesAt: string | null; answered: boolean }

function SurveyForm({ s, onDone }: { s: Survey; onDone: () => void }) {
  const [answers, setAnswers] = useState<Record<string, number | string>>({});
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFields({});
    setError(undefined);
    try {
      await api("POST", `/me/surveys/${s.id}/responses`, { answers });
      onDone();
    } catch (err) {
      if (err instanceof RequestError) {
        setFields(err.fields ?? {});
        setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 flex flex-col gap-5 border-t border-line pt-4">
      {s.questions.map((q) => (
        <fieldset key={q.id} className="flex flex-col gap-2">
          <legend className="text-sm font-bold">{q.text}{q.type !== "TEXT" && <span className="text-danger"> *</span>}</legend>
          {q.type === "RATING" && (
            <div className="flex gap-2" role="radiogroup" aria-label={q.text}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={answers[q.id] === n} onClick={() => setAnswers({ ...answers, [q.id]: n })} className={`h-11 w-11 rounded-2xl border-[1.5px] font-extrabold ${answers[q.id] === n ? "border-ink bg-ink text-white" : "border-line-strong bg-surface hover:border-ink"}`}>{n}</button>
              ))}
            </div>
          )}
          {q.type === "CHOICE" &&
            q.options.map((o) => (
              <label key={o} className="flex items-center gap-2 text-sm">
                <input type="radio" name={q.id} className="h-4 w-4 accent-[#0B1426]" checked={answers[q.id] === o} onChange={() => setAnswers({ ...answers, [q.id]: o })} /> {o}
              </label>
            ))}
          {q.type === "TEXT" && <Textarea id={`q-${q.id}`} label="" aria-label={q.text} rows={3} maxLength={2000} value={String(answers[q.id] ?? "")} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} />}
          {fields[q.id] && <span className="text-sm font-semibold text-danger">{fields[q.id]}</span>}
        </fieldset>
      ))}
      {error && !Object.keys(fields).length && <Notice tone="error">{error}</Notice>}
      <Button type="submit" loading={busy} className="self-start">Submit answers</Button>
    </form>
  );
}

/** Surveys your company asked you to answer. */
export default function SurveysPage() {
  const { org } = useSession();
  const [items, setItems] = useState<Survey[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(() => api<Survey[]>("GET", "/me/surveys").then(setItems, () => setItems([])), []);
  useEffect(() => {
    if (org) load();
  }, [org, load]);

  return (
    <section className="flex max-w-3xl flex-col gap-5">
      <PageHeader title="Surveys" sub="A minute of your time helps improve commuting at your company. Answers are anonymous in the results." />
      {items?.length === 0 && <EmptyState icon="clipboard" title="No open surveys">When your company sends one, you will get a notification.</EmptyState>}
      {items?.map((s) => (
        <Card key={s.id}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-extrabold">{s.title}</span>
            {s.answered ? <Badge tone="success">answered</Badge> : <Badge tone="lime">new</Badge>}
            {s.closesAt && <span className="ml-auto text-xs text-muted">Closes {fmtDay(s.closesAt)}</span>}
          </div>
          {s.description && <p className="mt-1 text-sm text-muted">{s.description}</p>}
          {!s.answered && open !== s.id && <Button className="mt-3" onClick={() => setOpen(s.id)}>Answer survey</Button>}
          {!s.answered && open === s.id && <SurveyForm s={s} onDone={() => { setOpen(null); load(); }} />}
        </Card>
      ))}
    </section>
  );
}
