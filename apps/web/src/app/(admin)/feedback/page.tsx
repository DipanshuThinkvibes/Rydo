"use client";

import { useCallback, useEffect, useState } from "react";
import { FEEDBACK_CATEGORIES } from "@rydo/shared";
import { api, RequestError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { fmtWhen } from "@/lib/format";
import { FEEDBACK_LABEL } from "@/lib/labels";
import { Badge, Button, Card, EmptyState, Notice, PageHeader, Select, Textarea } from "@/components/ui";
import { Icon } from "@/components/icons";

interface Item { id: string; category: string; rating: number | null; comment: string; status: string; createdAt: string }

/** The feedback form is always available. */
export default function FeedbackPage() {
  const { org } = useSession();
  const [items, setItems] = useState<Item[] | null>(null);
  const [category, setCategory] = useState<string>("GENERAL");
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string }>();
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api<Item[]>("GET", "/me/feedback").then(setItems, () => setItems([])), []);
  useEffect(() => {
    if (org) load();
  }, [org, load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFields({});
    setMsg(undefined);
    try {
      await api("POST", "/me/feedback", { category, rating: rating || undefined, comment });
      setComment("");
      setRating(0);
      setMsg({ tone: "ok", text: "Thanks! Your feedback was sent." });
      load();
    } catch (err) {
      if (err instanceof RequestError) {
        setFields(err.fields ?? {});
        setMsg({ tone: "error", text: err.message });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex max-w-3xl flex-col gap-5">
      <PageHeader title="Feedback" sub="Tell us what works and what does not. For a specific problem, use Report an issue." />
      <Card>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Select id="fb-cat" label="About" value={category} onChange={(e) => setCategory(e.target.value)}>
            {FEEDBACK_CATEGORIES.map((c) => <option key={c} value={c}>{FEEDBACK_LABEL[c]}</option>)}
          </Select>
          <div>
            <p className="mb-1.5 text-sm font-bold">How satisfied are you? <span className="font-normal text-muted">(optional)</span></p>
            <div className="flex gap-1" role="radiogroup" aria-label="Satisfaction">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => setRating(rating === n ? 0 : n)} className={`rounded-lg p-1 ${n <= rating ? "text-[#EAB308]" : "text-line-strong hover:text-muted"}`}>
                  <Icon name="star" size={28} className={n <= rating ? "fill-current" : ""} />
                </button>
              ))}
            </div>
          </div>
          <Textarea id="fb-text" label="Your feedback" required value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} error={fields.comment} />
          {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
          <Button type="submit" loading={busy} className="self-start">Send feedback</Button>
        </form>
      </Card>

      <h2 className="text-lg font-extrabold">My feedback</h2>
      {items?.length === 0 && <EmptyState icon="star" title="Nothing sent yet" />}
      <div className="flex flex-col gap-3">
        {items?.map((f) => (
          <Card key={f.id} className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-extrabold">{FEEDBACK_LABEL[f.category]}</span>
              {f.rating && <span className="text-sm text-[#B45309]">{"★".repeat(f.rating)}</span>}
              <Badge tone={f.status === "NEW" ? "neutral" : "success"}>{f.status.toLowerCase()}</Badge>
              <span className="ml-auto text-xs text-muted">{fmtWhen(f.createdAt)}</span>
            </div>
            <p className="text-sm">{f.comment}</p>
          </Card>
        ))}
      </div>
    </section>
  );
}
