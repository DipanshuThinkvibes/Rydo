"use client";

import { useEffect, useState } from "react";
import { api, RequestError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Notice, Skeleton, Toggle } from "@/components/ui";
import { Icon } from "@/components/icons";
import { ThemePicker } from "@/components/theme-toggle";
import { Section, usePersonas, type Msg } from "@/components/account-hub";

interface Prefs {
  emailUpdates: boolean;
  pushUpdates: boolean;
}

/** Preferences tab: how RYDO looks and how it talks to you. */
export default function PreferencesPage() {
  const { org } = useSession();
  const personas = usePersonas();
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [msg, setMsg] = useState<Msg>();
  const isAdmin = personas.some((p) => p === "ORG_ADMIN" || p === "HR_ADMIN" || p === "OPS_ADMIN");

  useEffect(() => {
    api<{ notifications: Prefs }>("GET", "/me/settings").then((r) => setPrefs(r.notifications), () => undefined);
  }, []);

  async function save(patch: Partial<Prefs>) {
    if (!prefs) return;
    const before = prefs;
    setPrefs({ ...prefs, ...patch });
    setMsg(undefined);
    try {
      const r = await api<{ notifications: Prefs }>("PATCH", "/me/settings", { notifications: patch });
      setPrefs(r.notifications);
      setMsg({ tone: "ok", text: "Saved." });
    } catch (e) {
      setPrefs(before);
      setMsg({ tone: "error", text: e instanceof RequestError ? e.message : "Could not save. Try again." });
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Section icon="sparkle" title="Appearance" sub="Choose how RYDO looks on this device. Match device follows your phone or computer.">
        <ThemePicker />
      </Section>

      <Section icon="bell" title="Notifications" sub="Everything still lands in your RYDO inbox. Choose how else you hear about it.">
        {!prefs ? (
          <Skeleton className="h-24" />
        ) : (
          <div className="divide-y divide-line rounded-2xl bg-surface px-4 py-1">
            <Toggle label="Email me updates" hint={org ? "Ride requests, changes and announcements, sent to your work email" : "Updates sent to your email"} checked={prefs.emailUpdates} onChange={(v) => save({ emailUpdates: v })} />
            <Toggle label="Phone notifications" hint="Push alerts on the RYDO app" checked={prefs.pushUpdates} onChange={(v) => save({ pushUpdates: v })} />
          </div>
        )}
        <p className="flex items-start gap-2 text-xs text-muted"><Icon name="shield" size={14} className="mt-0.5 shrink-0" /> Safety alerts, such as an SOS on a ride, and account notices, such as a paused account, are always sent.</p>
        {isAdmin && <p className="flex items-start gap-2 text-xs text-muted"><Icon name="bell" size={14} className="mt-0.5 shrink-0" /> As an admin, approval requests and safety alerts for your company always show in your inbox, whatever you choose here.</p>}
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      </Section>
    </div>
  );
}
