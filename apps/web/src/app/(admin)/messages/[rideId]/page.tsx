"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, apiWithMeta, RequestError } from "@/lib/api";
import { useChatRealtime, type ChatLive } from "@/lib/realtime";
import { useSession } from "@/lib/session";
import { fmtWhen } from "@/lib/format";
import { Avatar, Badge, Button, Card, Notice, Skeleton } from "@/components/ui";
import { Icon } from "@/components/icons";

interface Thread { riderMembershipId: string; as: "DRIVER" | "RIDER"; with: { membershipId: string; name: string }; unread: number; lastMessage: { body: string; at: string } | null; canSend: boolean; archived: boolean }
interface Msg { id: string; body: string; mine: boolean; createdAt: string; readAt: string | null }
interface HistoryMeta { nextBefore: string | null; canSend: boolean; archived: boolean; blocked: boolean }

/** One ride's private chat. Drivers pick a rider on the left; riders only see the driver. New messages arrive live. */
export default function ChatPage({ params }: { params: Promise<{ rideId: string }> }) {
  const { rideId } = use(params);
  const { org } = useSession();
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [rider, setRider] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [meta, setMeta] = useState<HistoryMeta>();
  const [text, setText] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const me = org?.id;

  useEffect(() => {
    if (!org) return;
    api<Thread[]>("GET", `/rides/${rideId}/chat`).then(
      (t) => {
        setThreads(t);
        setRider((cur) => cur ?? t[0]?.riderMembershipId ?? null);
      },
      (e) => {
        setThreads([]);
        setError(e instanceof RequestError ? e.message : "Could not open this chat.");
      },
    );
  }, [org, rideId]);

  const fetchHistory = useCallback((rid: string) => apiWithMeta<Msg[], HistoryMeta>("GET", `/rides/${rideId}/chat/${rid}/messages?limit=40`), [rideId]);
  const showHistory = useCallback((res: { data: Msg[]; meta: HistoryMeta }) => {
    setMsgs(res.data);
    setMeta(res.meta);
  }, []);
  const failed = useCallback((e: unknown) => setError(e instanceof RequestError ? e.message : "Could not load messages."), []);
  const loadHistory = useCallback((rid: string) => fetchHistory(rid).then(showHistory, failed), [fetchHistory, showHistory, failed]);

  useEffect(() => {
    if (rider) fetchHistory(rider).then(showHistory, failed);
  }, [rider, fetchHistory, showHistory, failed]);

  useChatRealtime(rider ? { rideId, riderMembershipId: rider } : null, (m: ChatLive) => {
    if (m.senderMembershipId === me) return; // my own message is added when the send call returns
    setMsgs((cur) => (cur.some((x) => x.id === m.id) ? cur : [...cur, { id: m.id, body: m.body, mine: false, createdAt: m.createdAt, readAt: null }]));
    if (rider) loadHistory(rider); // reading it marks it read for the sender
  }, () => rider && loadHistory(rider));

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs.length]);

  async function older() {
    if (!rider || !meta?.nextBefore) return;
    const res = await apiWithMeta<Msg[], HistoryMeta>("GET", `/rides/${rideId}/chat/${rider}/messages?limit=40&before=${encodeURIComponent(meta.nextBefore)}`);
    setMsgs((cur) => [...res.data, ...cur]);
    setMeta((m) => (m ? { ...m, nextBefore: res.meta.nextBefore } : m));
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!rider || !text.trim()) return;
    setBusy(true);
    setError(undefined);
    try {
      const m = await api<Msg>("POST", `/rides/${rideId}/chat/${rider}/messages`, { body: text });
      setMsgs((cur) => (cur.some((x) => x.id === m.id) ? cur : [...cur, m]));
      setText("");
    } catch (err) {
      setError(err instanceof RequestError ? err.message : "Message not sent.");
    } finally {
      setBusy(false);
    }
  }

  const current = threads?.find((t) => t.riderMembershipId === rider);

  return (
    <section className="flex max-w-4xl flex-col gap-4">
      <Link href="/messages" className="flex w-fit items-center gap-1.5 text-sm font-bold text-muted hover:text-ink">
        <Icon name="arrowLeft" size={16} /> All messages
      </Link>
      {error && <Notice tone="error" onClose={() => setError(undefined)}>{error}</Notice>}
      {!threads && <Skeleton className="h-96" />}
      {threads && threads.length > 0 && (
        <div className={`grid gap-4 ${threads.length > 1 || threads[0].as === "DRIVER" ? "md:grid-cols-[16rem_1fr]" : ""}`}>
          {threads.length > 1 || threads[0].as === "DRIVER" ? (
            <Card className="flex flex-col gap-1 p-2">
              {threads.map((t) => (
                <button key={t.riderMembershipId} type="button" onClick={() => { setMsgs([]); setRider(t.riderMembershipId); }} className={`flex items-center gap-3 rounded-2xl p-2.5 text-left ${t.riderMembershipId === rider ? "bg-surface-2" : "hover:bg-surface"}`}>
                  <Avatar name={t.with.name} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-extrabold">{t.with.name}</span>
                    <span className="block truncate text-xs text-muted">{t.lastMessage?.body ?? "No messages yet"}</span>
                  </span>
                  {t.unread > 0 && <Badge tone="lime">{t.unread}</Badge>}
                </button>
              ))}
            </Card>
          ) : null}
          <Card className="flex h-[32rem] flex-col gap-3 p-0">
            <header className="flex items-center gap-3 border-b border-line p-4">
              <Avatar name={current?.with.name ?? "?"} size={36} />
              <span className="flex-1 font-extrabold">{current?.with.name}</span>
              {meta?.archived && <Badge tone="neutral">Chat closed</Badge>}
              {current && !meta?.blocked && <Button variant="ghost" className="h-8 px-3 text-xs" onClick={async () => { if (window.confirm(`Block ${current.with.name}? You will not see each other in ride search or be able to message.`)) { try { await api("POST", "/me/blocks", { membershipId: current.with.membershipId }); loadHistory(current.riderMembershipId); } catch { setError("Could not block this person."); } } }}>Block</Button>}
              {meta?.blocked && <Badge tone="warning">Blocked</Badge>}
            </header>
            <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-4" role="log" aria-live="polite" aria-label="Messages">
              {meta?.nextBefore && <Button variant="soft" className="h-9 self-center" onClick={older}>Load older messages</Button>}
              {msgs.length === 0 && <p className="m-auto text-sm text-muted">Say hello. Messages are only visible to the two of you.</p>}
              {msgs.map((m) => (
                <div key={m.id} className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${m.mine ? "self-end bg-ink text-white" : "self-start bg-surface-2"}`}>
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p className={`mt-0.5 text-[11px] ${m.mine ? "text-[#B8C2D6]" : "text-muted"}`}>{fmtWhen(m.createdAt)}{m.mine && m.readAt ? " · read" : ""}</p>
                </div>
              ))}
              <div ref={bottom} />
            </div>
            {meta?.canSend ? (
              <form onSubmit={send} className="flex gap-2 border-t border-line p-3">
                <input aria-label="Message" value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder="Write a message" className="h-11 flex-1 rounded-2xl border-[1.5px] border-line-strong bg-surface px-4 outline-none focus:border-ink focus:bg-white" />
                <Button type="submit" loading={busy} disabled={!text.trim()}>Send</Button>
              </form>
            ) : (
              <p className="border-t border-line p-3 text-center text-sm text-muted">{meta?.blocked ? "You can't message this person." : "This chat is closed. The ride is over or the seat was cancelled."}</p>
            )}
          </Card>
        </div>
      )}
    </section>
  );
}
