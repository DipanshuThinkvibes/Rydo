"use client";

import { useCallback, useEffect, useState } from "react";
import { api, RequestError } from "@/lib/api";
import { fmtWhenFriendly } from "@/lib/format";
import { Badge, Button, Input, Notice, Skeleton } from "@/components/ui";
import { Icon } from "@/components/icons";
import { Section, useAccount, type Msg } from "@/components/account-hub";

interface SessionRow {
  id: string;
  client: "WEB" | "MOBILE";
  userAgent: string | null;
  createdAt: string;
  status: "ACTIVE" | "SIGNED_OUT" | "EXPIRED";
  endedAt: string | null;
  current: boolean;
}

/** "Chrome on Windows" from a browser's user-agent text; the mobile app falls back to "RYDO app". */
function deviceName(s: SessionRow) {
  const ua = s.userAgent ?? "";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : null;
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad|iOS/.test(ua) ? "iOS" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : null;
  if (browser && os) return `${browser} on ${os}`;
  return s.client === "MOBILE" ? "RYDO app" : (browser ?? "Web browser");
}

const SHOWN_OTHERS = 3;
const SHOWN_EARLIER = 5;

function DeviceIcon({ s, size = 18 }: { s: SessionRow; size?: number }) {
  return <Icon name={s.client === "MOBILE" ? "phone2" : "laptop"} size={size} />;
}

/** Security tab: password, email proof, and a clear picture of where you are signed in. */
export default function SecurityPage() {
  const { emailState } = useAccount();
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [sMsg, setSMsg] = useState<Msg>();
  const [busy, setBusy] = useState<string | null>(null);
  const [allOthers, setAllOthers] = useState(false);
  const [showEarlier, setShowEarlier] = useState(false);
  const [moreEarlier, setMoreEarlier] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pwMsg, setPwMsg] = useState<Msg>();

  const loadSessions = useCallback(() => api<SessionRow[]>("GET", "/me/sessions").then(setSessions, () => setSessions([])), []);
  useEffect(() => {
    api<SessionRow[]>("GET", "/me/sessions").then(setSessions, () => setSessions([]));
  }, []);

  async function signOut(id: string | "others") {
    setBusy(id);
    setSMsg(undefined);
    try {
      if (id === "others") {
        const r = await api<{ signedOut: number }>("POST", "/me/sessions/revoke-others");
        setSMsg({ tone: "ok", text: r.signedOut ? `Signed out of ${r.signedOut} other ${r.signedOut === 1 ? "device" : "devices"}.` : "No other devices were signed in." });
      } else {
        await api("DELETE", `/me/sessions/${id}`);
        setSMsg({ tone: "ok", text: "That device is signed out." });
      }
      await loadSessions();
    } catch (e) {
      setSMsg({ tone: "error", text: e instanceof RequestError ? e.message : "Something went wrong. Try again." });
    } finally {
      setBusy(null);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy("pw");
    setFields({});
    setPwMsg(undefined);
    try {
      await api("POST", "/me/password", { currentPassword: current || undefined, newPassword: next });
      setCurrent("");
      setNext("");
      setPwMsg({ tone: "ok", text: "Password updated." });
    } catch (err) {
      if (err instanceof RequestError) {
        setFields(err.fields ?? {});
        setPwMsg({ tone: "error", text: err.message });
      }
    } finally {
      setBusy(null);
    }
  }

  const here = sessions?.find((s) => s.current);
  const others = sessions?.filter((s) => !s.current && s.status === "ACTIVE") ?? [];
  const earlier = sessions?.filter((s) => s.status !== "ACTIVE") ?? [];
  const shownOthers = allOthers ? others : others.slice(0, SHOWN_OTHERS);
  const shownEarlier = moreEarlier ? earlier : earlier.slice(0, SHOWN_EARLIER);

  return (
    <div className="grid gap-5 lg:grid-cols-5">
      <div className="flex flex-col gap-5 lg:col-span-2">
        <Section icon="shield" title="Password" sub="Use at least 8 characters with a letter and a number.">
          <form onSubmit={changePassword} className="flex flex-col gap-3">
            <Input id="current" label="Current password" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} error={fields.currentPassword} />
            <Input id="next" label="New password" type="password" autoComplete="new-password" required value={next} onChange={(e) => setNext(e.target.value)} error={fields.newPassword} />
            <p className="text-xs text-muted">Never set a password? Leave the current one empty.</p>
            {pwMsg && <Notice tone={pwMsg.tone}>{pwMsg.text}</Notice>}
            <Button type="submit" loading={busy === "pw"} className="self-start">Save password</Button>
          </form>
        </Section>

        <Section icon="check" title="Sign-in checks">
          <ul className="flex flex-col gap-2 text-sm">
            <li className="flex items-center justify-between gap-2 rounded-2xl bg-surface p-3"><span className="font-extrabold">Email verified</span><Badge tone={emailState?.verified ? "success" : "warning"}>{emailState?.verified ? "Yes" : "Not yet"}</Badge></li>
            <li className="flex items-center justify-between gap-2 rounded-2xl bg-surface p-3"><span className="font-extrabold">Email code sign-in</span><Badge tone="success">On</Badge></li>
          </ul>
          {!emailState?.verified && <p className="text-xs text-muted">Verify your email on the Profile tab to complete this.</p>}
        </Section>
      </div>

      <div className="flex flex-col gap-5 lg:col-span-3">
        <Section icon="laptop" title="Where you are signed in" sub="Your current device, other devices that are signed in, and recent sessions that ended.">
          {sessions === null && <Skeleton className="h-28" />}

          {here && (
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-lime/40 via-lime/15 to-transparent p-5 ring-1 ring-lime/50">
              <div className="flex flex-wrap items-center gap-4">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white shadow-soft"><DeviceIcon s={here} size={26} /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-extrabold uppercase tracking-[2px] text-muted">This device</p>
                  <p className="truncate text-xl font-extrabold">{deviceName(here)}</p>
                  <p className="text-sm text-muted">Signed in {fmtWhenFriendly(here.createdAt)}</p>
                </div>
                <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-extrabold text-success shadow-soft">
                  <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping-soft rounded-full bg-success opacity-60" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success" /></span>
                  Active now
                </span>
              </div>
            </div>
          )}
          {sessions && !here && <p className="rounded-2xl bg-surface p-4 text-sm text-muted">We could not tell which device is yours. Reload the page.</p>}

          {sessions && (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-extrabold">Other devices <span className="ml-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs">{others.length}</span></h3>
                {others.length > 0 && <Button variant="ghost" className="h-9" loading={busy === "others"} onClick={() => signOut("others")}>Sign out all others</Button>}
              </div>
              {others.length === 0 ? (
                <p className="flex items-center gap-2 rounded-2xl bg-surface p-4 text-sm text-muted"><Icon name="check" size={15} className="text-success" /> No other device is signed in. Only this one.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {shownOthers.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface p-3 text-sm">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white"><DeviceIcon s={s} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-extrabold">{deviceName(s)}</span>
                        <span className="text-xs text-muted">Signed in {fmtWhenFriendly(s.createdAt)}</span>
                      </span>
                      <Button variant="ghost" className="h-9" loading={busy === s.id} onClick={() => signOut(s.id)}>Sign out</Button>
                    </li>
                  ))}
                </ul>
              )}
              {others.length > SHOWN_OTHERS && (
                <button type="button" onClick={() => setAllOthers(!allOthers)} className="self-start text-sm font-extrabold underline">{allOthers ? "Show fewer" : `Show all ${others.length}`}</button>
              )}
            </div>
          )}

          {sMsg && <Notice tone={sMsg.tone}>{sMsg.text}</Notice>}

          {earlier.length > 0 && (
            <div className="flex flex-col gap-2 border-t border-line pt-4">
              <button type="button" onClick={() => setShowEarlier(!showEarlier)} aria-expanded={showEarlier} className="flex items-center justify-between gap-2 text-left">
                <span className="text-sm font-extrabold">Earlier sessions <span className="ml-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs">{earlier.length}</span><span className="ml-2 text-xs font-bold text-muted">not signed in any more, last 30 days</span></span>
                <Icon name="arrowRight" size={15} className={`text-muted transition-transform ${showEarlier ? "rotate-90" : ""}`} />
              </button>
              {showEarlier && (
                <>
                  <ul className="flex animate-rise flex-col divide-y divide-line">
                    {shownEarlier.map((s) => (
                      <li key={s.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted"><DeviceIcon s={s} size={15} /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-bold text-muted">{deviceName(s)}</span>
                          <span className="text-xs text-muted">Signed in {fmtWhenFriendly(s.createdAt)}</span>
                        </span>
                        <span className="text-right text-xs text-muted">
                          <Badge tone="neutral">{s.status === "EXPIRED" ? "Expired" : "Signed out"}</Badge>
                          {s.endedAt && <span className="mt-0.5 block">{fmtWhenFriendly(s.endedAt)}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {earlier.length > SHOWN_EARLIER && (
                    <button type="button" onClick={() => setMoreEarlier(!moreEarlier)} className="self-start text-sm font-extrabold underline">{moreEarlier ? "Show fewer" : `Show all ${earlier.length}`}</button>
                  )}
                </>
              )}
            </div>
          )}

          <p className="text-xs text-muted">See a device you do not recognise? Sign it out, then change your password.</p>
        </Section>
      </div>
    </div>
  );
}
