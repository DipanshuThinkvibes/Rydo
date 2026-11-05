"use client";

import { useState } from "react";
import { api, RequestError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Button, Card, Input, Notice, PageHeader } from "@/components/ui";

export default function AccountPage() {
  const { me } = useSession();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string }>();
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFields({});
    setMsg(undefined);
    try {
      await api("POST", "/me/password", { currentPassword: current || undefined, newPassword: next });
      setCurrent("");
      setNext("");
      setMsg({ tone: "ok", text: "Password updated." });
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
    <section className="flex max-w-xl flex-col gap-5">
      <PageHeader title="My account" sub={me ? `${me.user.name} · ${me.user.email}` : undefined} />
      <Card>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <h2 className="text-lg font-extrabold">Change password</h2>
          <Input id="current" label="Current password" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} error={fields.currentPassword} />
          <Input id="next" label="New password" type="password" autoComplete="new-password" required value={next} onChange={(e) => setNext(e.target.value)} error={fields.newPassword} />
          <p className="-mt-2 text-xs text-muted">At least 8 characters with a letter and a number.</p>
          {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
          <Button type="submit" disabled={busy} className="self-start">
            Save password
          </Button>
        </form>
      </Card>
    </section>
  );
}