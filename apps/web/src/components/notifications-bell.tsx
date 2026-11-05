"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { fmtWhen } from "@/lib/format";

interface Item {
  id: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

/** Inbox in the header. Checks every 30 seconds; push notifications arrive with the mobile app. */
export function NotificationsBell() {
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const fetchAll = useCallback(() => fetch("/api/v1/me/notifications", { credentials: "same-origin" }).then((r) => r.json()), []);
  const show = useCallback((res: { data?: Item[]; meta?: { unread: number } }) => {
    setItems(res.data ?? []);
    setUnread(res.meta?.unread ?? 0);
  }, []);

  useEffect(() => {
    fetchAll().then(show, () => undefined);
    const t = setInterval(() => fetchAll().then(show, () => undefined), 30_000);
    return () => clearInterval(t);
  }, [fetchAll, show]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread) {
      await api("POST", "/me/notifications/read").catch(() => undefined);
      setUnread(0);
    }
  }

  return (
    <div className="relative" ref={box}>
      <button type="button" onClick={toggle} aria-expanded={open} aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} className={`relative flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${open ? "bg-ink text-white" : "bg-surface-2 hover:bg-line"}`}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10 21a2 2 0 0 0 4 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center">
            <span className="absolute inset-0 animate-ping-soft rounded-full bg-danger" />
            <span className="relative flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-extrabold text-white ring-2 ring-white">{unread}</span>
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[min(360px,90vw)] origin-top-right animate-rise overflow-hidden rounded-2xl border border-line bg-white shadow-lift">
          <p className="border-b border-line px-4 py-3 text-sm font-extrabold">Notifications</p>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted">Nothing yet.</p>
          ) : (
            <ul className="max-h-96 divide-y divide-line overflow-y-auto">
              {items.map((n) => (
                <li key={n.id} className={`px-4 py-3 ${n.read ? "" : "bg-surface"}`}>
                  <p className="text-sm font-extrabold">{n.title}</p>
                  <p className="text-sm text-muted">{n.body}</p>
                  <p className="mt-1 text-xs text-muted">{fmtWhen(n.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}