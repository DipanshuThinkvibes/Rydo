"use client";

import { useCallback, useEffect, useState } from "react";
import { api, RequestError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { fmtWhen } from "@/lib/format";
import { Badge, Button, Card, EmptyState, Input, Notice, PageHeader, Select, Textarea } from "@/components/ui";

interface Item { id: string; at: string; title: string; body: string; recipients: number; email: boolean; audience: { roles?: string[] } }

/** Send a message to everyone, or to riders or drivers only: in the app, as a phone push, and by email if you tick it. */
export default function AnnouncementsPage() {
  const { org, can, support } = useSession();
  const [items, setItems] = useState<Item[] | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [who, setWho] = useState("ALL");
  const [email, setEmail] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string }>();
  const [busy, setBusy] = useState(false);
  const allowed = can("ORG_ADMIN", "HR_ADMIN") && !support;

  const load = useCallback(() => api<Item[]>("GET", "/admin/announcements").then(setItems, () => setItems([])), []);
  useEffect(() => {
    if (org) load();
  }, [org, load]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFields({});
    setMsg(undefined);
    try {
      const r = await api<{ recipients: number }>("POST", "/admin/announcements", { title, body, email, audience: who === "ALL" ? {} : { roles: [who] } });
      setTitle("");
      setBody("");
      setMsg({ tone: "ok", text: `Sent to ${r.recipients} ${r.recipients === 1 ? "person" : "people"}.` });
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
      <PageHeader title="Announcements" sub="Tell your employees something important. They see it in the app and on their phone." />
      {allowed && (
        <Card>
          <form onSubmit={send} className="flex flex-col gap-4">
            <Input id="a-title" label="Title" required value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} error={fields.title} />
            <Textarea id="a-body" label="Message" required value={body} onChange={(e) => setBody(e.target.value)} maxLength={1000} error={fields.body} />
            <Select id="a-who" label="Send to" value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="ALL">Everyone in the company</option>
              <option value="RIDER">Riders</option>
              <option value="DRIVER">Drivers</option>
            </Select>
            <label className="flex items-center gap-2 text-sm font-bold">
              <input type="checkbox" className="h-5 w-5 accent-[#0B1426]" checked={email} onChange={(e) => setEmail(e.target.checked)} /> Also send by email
            </label>
            {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
            <Button type="submit" loading={busy} className="self-start">Send announcement</Button>
          </form>
        </Card>
      )}
      <h2 className="text-lg font-extrabold">Sent so far</h2>
      {items?.length === 0 && <EmptyState icon="megaphone" title="Nothing sent yet" />}
      {items?.map((a) => (
        <Card key={a.id} className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-extrabold">{a.title}</span>
            <Badge tone="neutral">{a.recipients} people</Badge>
            {a.email && <Badge tone="lime">email</Badge>}
            <span className="ml-auto text-xs text-muted">{fmtWhen(a.at)}</span>
          </div>
          <p className="text-sm text-muted">{a.body}</p>
        </Card>
      ))}
    </section>
  );
}
