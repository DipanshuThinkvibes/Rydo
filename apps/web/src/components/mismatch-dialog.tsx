"use client";

import { useState } from "react";
import { MISMATCH_OPTIONS, type MismatchKind } from "@rydo/shared";
import { api, RequestError } from "@/lib/api";
import { Button, Notice } from "@/components/ui";
import { Icon } from "@/components/icons";

interface Result { warning: number; escalated: boolean }

/**
 * "Something does not match": the rider (wrong driver or vehicle) or the driver (wrong rider) cancels with a reason and no penalty.
 * The other person gets a warning, HR is told, and a repeat goes to RYDO's team.
 */
export function MismatchDialog({ bookingId, role, who, onClose, onDone }: { bookingId: string; role: "RIDER" | "DRIVER"; who: string; onClose: () => void; onDone: () => void }) {
  const options = MISMATCH_OPTIONS[role];
  const [kind, setKind] = useState<MismatchKind>(options[0].kind);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<Result | null>(null);

  async function send() {
    setBusy(true);
    setError(undefined);
    try {
      setDone(await api<Result>("POST", `/bookings/${bookingId}/mismatch`, { kind, note: note.trim() || undefined }));
    } catch (e) {
      setError(e instanceof RequestError ? e.message : "The report could not be sent. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Report that something does not match" className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-3 sm:items-center">
      <div className="flex max-h-[90vh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-[24px] bg-white p-5 shadow-lift">
        {done ? (
          <>
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-success-bg text-success"><Icon name="check" size={22} /></span>
            <h2 className="text-xl font-extrabold">Your report was sent</h2>
            <p className="text-sm text-muted">The ride was cancelled and there is no penalty for you. {who} got a warning and your company HR was told.{role === "RIDER" ? " You can search again to find another driver." : ""}</p>
            <Button className="h-12" onClick={onDone}>{role === "RIDER" ? "Find another ride" : "Done"}</Button>
          </>
        ) : (
          <>
            <h2 className="text-xl font-extrabold">Something does not match?</h2>
            <p className="text-sm text-muted">Tell us what is wrong with {who}. Do not get in or let them in if you are not sure.</p>
            <div role="radiogroup" aria-label="What is wrong" className="flex flex-col gap-2">
              {options.map((o) => (
                <button key={o.kind} type="button" role="radio" aria-checked={kind === o.kind} onClick={() => setKind(o.kind)} className={`rounded-2xl border-[1.5px] p-3 text-left ${kind === o.kind ? "border-ink bg-surface" : "border-line-strong bg-white"}`}>
                  <span className="block text-sm font-extrabold">{o.label}</span>
                  <span className="text-xs text-muted">{o.hint}</span>
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="mm-note" className="text-sm font-bold">More detail (optional)</label>
              <textarea id="mm-note" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} className="min-h-20 rounded-2xl border-[1.5px] border-line-strong bg-white p-3 text-sm font-semibold outline-none focus:border-ink" />
            </div>
            <p className="rounded-2xl bg-surface p-3 text-xs text-muted">The ride is cancelled with no penalty for you. {who} gets a warning and your company HR is told. If it happens again, RYDO&apos;s team can pause the account for a while.</p>
            {error && <Notice tone="error">{error}</Notice>}
            <div className="flex gap-2">
              <Button className="h-12 flex-1 !bg-danger" loading={busy} onClick={send}>Cancel and report</Button>
              <Button variant="ghost" className="h-12" onClick={onClose}>Keep ride</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
