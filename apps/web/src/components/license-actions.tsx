"use client";

import { useState } from "react";
import type { LicenseProduct } from "@rydo/shared";
import { api, RequestError } from "@/lib/api";
import { inDays, type LicenseRow } from "@/lib/licenses";
import { Button, Notice, Textarea, fieldClass } from "@/components/ui";

type Mode = "issue" | "pause" | "resume" | "revoke" | null;

const PRESETS: { label: string; days: number | null }[] = [
  { label: "1 month", days: 30 },
  { label: "3 months", days: 91 },
  { label: "6 months", days: 182 },
  { label: "1 year", days: 365 },
  { label: "No end date", days: null },
];

/**
 * The buttons that manage one licence: issue or renew with an end date, pause, resume, revoke.
 * Every change asks for a short reason where it is a pause or revoke, and is kept in the activity log.
 */
export function LicenseControls({ orgId, product, state, endsOn, onChanged }: { orgId: string; product: LicenseProduct; state: LicenseRow["state"]; endsOn?: string | null; onChanged: () => void }) {
  const [mode, setMode] = useState<Mode>(null);
  const [end, setEnd] = useState<string | null>(endsOn ? endsOn.slice(0, 10) : inDays(365));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const base = `/admin/platform/organizations/${orgId}/licenses/${product}`;

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(undefined);
    try {
      await fn();
      setMode(null);
      setReason("");
      onChanged();
    } catch (e) {
      setError(e instanceof RequestError ? (e.fields ? Object.values(e.fields)[0] : e.message) : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const open = (m: Mode) => {
    setError(undefined);
    setMode(mode === m ? null : m);
  };
  const issued = state !== "NONE";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button variant={issued ? "ghost" : "primary"} className="h-9" onClick={() => open("issue")}>{issued ? "Renew or change dates" : "Issue licence"}</Button>
        {state === "ACTIVE" || state === "SCHEDULED" ? <Button variant="ghost" className="h-9" onClick={() => open("pause")}>Pause</Button> : null}
        {state === "SUSPENDED" && <Button variant="ghost" className="h-9" onClick={() => open("resume")}>Resume</Button>}
        {issued && state !== "REVOKED" && <Button variant="ghost" className="h-9 text-danger" onClick={() => open("revoke")}>Revoke</Button>}
      </div>

      {mode === "issue" && (
        <div className="flex animate-rise flex-col gap-3 rounded-2xl bg-surface p-4">
          <p className="text-sm font-bold">Valid until</p>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => {
              const v = p.days === null ? null : inDays(p.days);
              return (
                <button key={p.label} type="button" onClick={() => setEnd(v)} aria-pressed={end === v} className={`rounded-full border-[1.5px] px-3.5 py-1.5 text-sm font-extrabold ${end === v ? "border-ink bg-ink text-white" : "border-line-strong hover:border-ink"}`}>{p.label}</button>
              );
            })}
          </div>
          <label className="flex max-w-xs flex-col gap-1.5 text-sm font-bold">
            Or pick a date
            <input type="date" className={`${fieldClass} px-3`} value={end ?? ""} min={inDays(0)} onChange={(e) => setEnd(e.target.value || null)} />
          </label>
          <p className="text-xs text-muted">{end ? "The licence works through the end of that day." : "The licence has no end date until you change it."}</p>
          <Button className="self-start" loading={busy} onClick={() => run(() => api("PUT", base, { expiresAt: end }))}>{issued ? "Save licence" : "Issue licence"}</Button>
        </div>
      )}

      {(mode === "pause" || mode === "resume" || mode === "revoke") && (
        <div className="flex animate-rise flex-col gap-3 rounded-2xl bg-surface p-4">
          <Textarea label={mode === "pause" ? "Why are you pausing it?" : mode === "resume" ? "Why are you resuming it?" : "Why are you revoking it?"} value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={300} />
          <p className="text-xs text-muted">
            {mode === "pause" && "The company loses this product straight away. You can resume it any time."}
            {mode === "resume" && "The company gets this product back straight away."}
            {mode === "revoke" && "The company loses this product straight away. To bring it back later, issue it again."}
          </p>
          <Button className="self-start" variant={mode === "revoke" ? "danger" : "primary"} loading={busy} disabled={reason.trim().length < 5} onClick={() => run(() => api("POST", `${base}/${mode === "pause" ? "suspend" : mode}`, { reason }))}>
            {mode === "pause" ? "Pause licence" : mode === "resume" ? "Resume licence" : "Revoke licence"}
          </Button>
        </div>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}
