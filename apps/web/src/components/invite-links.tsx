"use client";

import { useCallback, useEffect, useState } from "react";
import { INVITE_HOURS, type InviteView } from "@rydo/shared";
import { api, RequestError } from "@/lib/api";
import { fmtWhen } from "@/lib/format";
import { Badge, Button, Card, Notice } from "@/components/ui";
import { Icon } from "@/components/icons";

const tone = { ACTIVE: "success", EXPIRED: "neutral", REVOKED: "neutral", FULL: "warning" } as const;
const label = { ACTIVE: "open", EXPIRED: "expired", REVOKED: "cancelled", FULL: "full" } as const;

/**
 * HR makes an invite link; employees open it, fill the form and get an account straight away (no approval).
 * Each link works for 24 hours. The full link is shown only when it is made.
 */
export function InviteLinks({ onChanged }: { onChanged?: () => void }) {
  const [links, setLinks] = useState<InviteView[] | null>(null);
  const [fresh, setFresh] = useState<{ url: string; expiresAt: string } | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string }>();
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => api<InviteView[]>("GET", "/admin/invites").then(setLinks), []);
  useEffect(() => {
    load().catch(() => setLinks([]));
  }, [load]);

  async function make() {
    setBusy("make");
    setMsg(undefined);
    try {
      setFresh(await api<{ id: string; url: string; expiresAt: string }>("POST", "/admin/invites", {}));
      await load();
      onChanged?.();
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof RequestError ? e.message : "Could not make the link." });
    } finally {
      setBusy(null);
    }
  }

  async function revoke(id: string) {
    setBusy(id);
    setMsg(undefined);
    try {
      await api("POST", `/admin/invites/${id}/revoke`);
      setFresh(null);
      await load();
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof RequestError ? e.message : "Could not cancel the link." });
    } finally {
      setBusy(null);
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setMsg({ tone: "ok", text: "Link copied. Send it to the employees you want to invite." });
    } catch {
      setMsg({ tone: "error", text: "Could not copy. Select the link and copy it by hand." });
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-2"><Icon name="plus" size={19} /></span>
        <div className="min-w-0 flex-1">
          <h2 className="font-extrabold">Invite employees with a link</h2>
          <p className="text-sm text-muted">They fill a short form and their account is ready at once, with no approval. You are told about each new account. A link works for {INVITE_HOURS} hours.</p>
        </div>
        <Button onClick={make} loading={busy === "make"} disabled={!!busy}>Make a link</Button>
      </div>
      {msg && <Notice tone={msg.tone} onClose={() => setMsg(undefined)}>{msg.text}</Notice>}
      {fresh && (
        <div className="flex flex-col gap-2 rounded-2xl bg-lime/30 p-4">
          <p className="text-sm font-extrabold">Your new link (shown only now)</p>
          <div className="flex flex-wrap items-center gap-2">
            <input readOnly value={fresh.url} onFocus={(e) => e.target.select()} aria-label="Invite link" className="h-11 min-w-0 flex-[1_1_260px] rounded-2xl border-[1.5px] border-line-strong bg-white px-3 text-sm font-semibold" />
            <Button onClick={() => copy(fresh.url)}>Copy link</Button>
          </div>
          <p className="text-xs text-muted">Works until {fmtWhen(fresh.expiresAt)}. Anyone with this link and a work email of your company can join, so share it only with your team.</p>
        </div>
      )}
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="w-fit text-sm font-extrabold underline">{open ? "Hide" : "Show"} recent links{links ? ` (${links.length})` : ""}</button>
      {open && (links === null ? <p className="text-sm text-muted">Loading…</p> : links.length === 0 ? <p className="text-sm text-muted">No links made yet.</p> : (
        <ul className="flex flex-col divide-y divide-line">
          {links.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block font-bold">Made {fmtWhen(l.createdAt)} by {l.createdBy}</span>
                <span className="text-xs text-muted">{l.status === "ACTIVE" ? `Ends ${fmtWhen(l.expiresAt)}` : `Ended`} · {l.usedCount} joined</span>
              </span>
              <Badge tone={tone[l.status]}>{label[l.status]}</Badge>
              {l.status === "ACTIVE" && <Button variant="ghost" className="h-9" loading={busy === l.id} disabled={!!busy} onClick={() => revoke(l.id)}>Cancel link</Button>}
            </li>
          ))}
        </ul>
      ))}
    </Card>
  );
}
