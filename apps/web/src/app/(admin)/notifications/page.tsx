"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiWithMeta, api } from "@/lib/api";
import { fmtWhen } from "@/lib/format";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui";

interface Item { id: string; type: string; title: string; body: string; data: { rideId?: string; issueId?: string; surveyId?: string } | null; read: boolean; createdAt: string }

/** Where a notification leads, when it points somewhere. */
function target(n: Item) {
  if (n.type === "CHAT_MESSAGE" && n.data?.rideId) return `/messages/${n.data.rideId}`;
  if (n.type === "SURVEY") return "/surveys";
  if (n.type === "ISSUE_UPDATE") return "/issues";
  if (n.type === "ISSUE_REPORTED") return "/manage/issues";
  return null;
}

/** The full inbox (the bell in the header shows the latest few). */
export default function NotificationsPage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [unread, setUnread] = useState(0);
  const load = useCallback(() => apiWithMeta<Item[], { unread: number }>("GET", "/me/notifications").then((r) => { setItems(r.data); setUnread(r.meta.unread); }, () => setItems([])), []);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <section className="flex max-w-3xl flex-col gap-5">
      <PageHeader title="Notifications" sub={unread ? `${unread} unread` : "You are all caught up"} action={unread ? <Button variant="ghost" onClick={async () => { await api("POST", "/me/notifications/read"); load(); }}>Mark all read</Button> : undefined} />
      {items?.length === 0 && <EmptyState icon="bell" title="Nothing here yet">Ride requests, chat messages, issue updates and announcements show up here.</EmptyState>}
      <div className="flex flex-col gap-3">
        {items?.map((n) => {
          const to = target(n);
          const body = (
            <Card className={`flex flex-col gap-1 ${n.read ? "" : "border-l-4 border-l-lime"}`}>
              <div className="flex items-center gap-2">
                <span className="font-extrabold">{n.title}</span>
                {!n.read && <Badge tone="lime">new</Badge>}
                <span className="ml-auto text-xs text-muted">{fmtWhen(n.createdAt)}</span>
              </div>
              <p className="text-sm text-muted">{n.body}</p>
            </Card>
          );
          return to ? <Link key={n.id} href={to}>{body}</Link> : <div key={n.id}>{body}</div>;
        })}
      </div>
    </section>
  );
}
