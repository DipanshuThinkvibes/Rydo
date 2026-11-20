"use client";

import { useCallback, useEffect, useState } from "react";
import { ISSUE_CATEGORIES } from "@rydo/shared";
import { api, RequestError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { fmtWhen } from "@/lib/format";
import { ISSUE_LABEL as LABEL, ISSUE_TONE as TONE } from "@/lib/labels";
import { Badge, Button, Card, EmptyState, Notice, PageHeader, Select, Textarea } from "@/components/ui";

interface Issue { id: string; category: string; categoryLabel: string; description: string; status: keyof typeof TONE; resolution: string | null; ride: { from?: string; to?: string; departAt?: string } | null; createdAt: string }

/** Report a problem to your company's admins and follow it until it is resolved. */
export default function IssuesPage() {
  const { org } = useSession();
  const [items, setItems] = useState<Issue[] | null>(null);
  const [category, setCategory] = useState<string>("APP_BUG");
  const [description, setDescription] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string }>();
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api<Issue[]>("GET", "/me/issues").then(setItems, () => setItems([])), []);
  useEffect(() => {
    if (org) load();
  }, [org, load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFields({});
    setMsg(undefined);
    try {
      await api("POST", "/me/issues", { category, description });
      setDescription("");
      setMsg({ tone: "ok", text: "Thank you. Your company's admins have been told and will look into it." });
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
      <PageHeader title="Report an issue" sub="Unsafe driving, conduct, a late driver, a wrong route or an app problem. In an emergency during a ride, use SOS on the trip screen." />
      <Card>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Select id="cat" label="What happened?" value={category} onChange={(e) => setCategory(e.target.value)}>
            {ISSUE_CATEGORIES.map((c) => <option key={c} value={c}>{LABEL[c]}</option>)}
          </Select>
          <Textarea id="desc" label="Tell us more" required value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} error={fields.description} hint="At least 10 characters. Do not include passwords." />
          {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
          <Button type="submit" loading={busy} className="self-start">Send report</Button>
        </form>
      </Card>

      <h2 className="text-lg font-extrabold">My reports</h2>
      {items?.length === 0 && <EmptyState icon="flag" title="No reports yet">Anything you report shows up here with its status.</EmptyState>}
      <div className="flex flex-col gap-3">
        {items?.map((i) => (
          <Card key={i.id} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-extrabold">{i.categoryLabel}</span>
              <Badge tone={TONE[i.status]}>{i.status.replace("_", " ").toLowerCase()}</Badge>
              <span className="ml-auto text-xs text-muted">{fmtWhen(i.createdAt)}</span>
            </div>
            <p className="text-sm">{i.description}</p>
            {i.ride?.from && <p className="text-xs text-muted">Ride: {i.ride.from} → {i.ride.to}</p>}
            {i.resolution && <p className="rounded-xl bg-success-bg px-3 py-2 text-sm text-success"><b>Resolved:</b> {i.resolution}</p>}
          </Card>
        ))}
      </div>
    </section>
  );
}
