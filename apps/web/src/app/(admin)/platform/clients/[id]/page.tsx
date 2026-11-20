"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { LICENSE_INFO, ORG_FEATURE_INFO, type OrgFeatures } from "@rydo/shared";
import { LicenseControls } from "@/components/license-actions";
import { STATE_LABEL, dayLabel, leftLabel, stateTone, type LicenseRow } from "@/lib/licenses";
import { api, RequestError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { fmtDay, fmtTime, fmtWhen } from "@/lib/format";
import { actionLabel, statusTone, type ClientDetail } from "@/lib/platform-types";
import { Avatar, Badge, Button, Card, Input, Notice, Skeleton, Toggle } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";
import { MapView } from "@/components/map/map-view";
import { DayChart } from "@/components/day-chart";

type Msg = { tone: "ok" | "error"; text: string } | undefined;

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { me, startSupport } = useSession();
  const router = useRouter();
  const [c, setC] = useState<ClientDetail | null>(null);
  const [msg, setMsg] = useState<Msg>();
  const [busy, setBusy] = useState<string | null>(null);
  const [supportForm, setSupportForm] = useState<{ reason: string; minutes: string } | null>(null);

  const load = useCallback(() => api<ClientDetail>("GET", `/admin/platform/organizations/${id}`), [id]);
  useEffect(() => {
    if (me?.user.isPlatformAdmin) load().then(setC, (e) => setMsg({ tone: "error", text: e instanceof RequestError ? e.message : "Could not load this client." }));
  }, [me, load]);

  async function act(key: string, fn: () => Promise<unknown>, ok?: string) {
    setBusy(key);
    setMsg(undefined);
    try {
      await fn();
      setC(await load());
      if (ok) setMsg({ tone: "ok", text: ok });
      return true;
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof RequestError ? e.message : "That didn't work." });
      return false;
    } finally {
      setBusy(null);
    }
  }

  if (!me?.user.isPlatformAdmin) return <Notice tone="error">RYDO owner team only.</Notice>;
  if (!c)
    return msg ? (
      <Notice tone="error">{msg.text}</Notice>
    ) : (
      <div className="flex max-w-6xl flex-col gap-4"><Skeleton className="h-40" /><Skeleton className="h-64" /></div>
    );

  const s = c.stats;
  const patch = (body: object, ok: string) => act("patch", () => api("PATCH", `/admin/platform/organizations/${c.id}`, body), ok);
  const openSupport = async (reason: string, minutes: number) => {
    setBusy("support");
    try {
      const g = await api<{ expiresAt: string }>("POST", `/admin/platform/organizations/${c.id}/support`, { reason, minutes });
      startSupport({ orgId: c.id, orgName: c.name, expiresAt: g.expiresAt });
      router.push("/employees");
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof RequestError ? e.message : "Could not start support view." });
      setBusy(null);
    }
  };
  const tiles: { k: string; v: string | number; sub?: string; icon: IconName; warn?: boolean }[] = [
    { k: "Employees", v: c.maxEmployees ? `${s?.activeMembers ?? 0}/${c.maxEmployees}` : s?.activeMembers ?? 0, sub: s?.pendingMembers ? `${s.pendingMembers} waiting for HR` : undefined, icon: "users", warn: !!c.maxEmployees && (s?.activeMembers ?? 0) >= c.maxEmployees * 0.9 },
    { k: "Verified drivers", v: s?.verifiedDrivers ?? 0, sub: s?.pendingDrivers ? `${s.pendingDrivers} to check` : undefined, icon: "badge" },
    { k: "Rides next 7 days", v: s?.ridesNext7 ?? 0, sub: `${s?.ridesLast7 ?? 0} in the last 7`, icon: "car" },
    { k: "Bookings, 7 days", v: s?.bookingsLast7 ?? 0, icon: "ticket" },
  ];

  return (
    <section className="flex max-w-6xl flex-col gap-6">
      <Link href="/platform/clients" className="flex w-fit items-center gap-1.5 text-sm font-bold text-muted hover:text-ink"><Icon name="arrowLeft" size={16} /> Clients</Link>

      <div className="relative flex animate-rise flex-col gap-5 overflow-hidden rounded-[22px] bg-ink p-6 text-white shadow-lift">
        <span aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-lime/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar name={c.name} tone="lime" size={56} />
            <div>
              <h1 className="flex flex-wrap items-center gap-2 text-2xl font-extrabold">
                {c.name} <Badge tone={c.status === "ACTIVE" ? "lime" : statusTone(c.status)}>{c.status === "SUSPENDED" ? "paused" : c.status.toLowerCase()}</Badge>
              </h1>
              <p className="text-sm text-[#B8C2D6]">{c.emailDomains.join(", ")} · {c.timezone} · client since {fmtDay(c.createdAt)}</p>
              {c.contact.name && <p className="mt-1 text-sm text-[#B8C2D6]">Contact: <span className="font-bold text-white">{c.contact.name}</span> · {c.contact.email}{c.contact.phone ? ` · ${c.contact.phone}` : ""}</p>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="lime" onClick={() => setSupportForm(supportForm ? null : { reason: "", minutes: "60" })} disabled={c.status !== "ACTIVE"} title={c.status !== "ACTIVE" ? "Activate the client first" : undefined} aria-expanded={!!supportForm}>
              <Icon name="shield" size={16} /> Open support view
            </Button>
            {c.status === "ACTIVE" ? (
              <Button variant="ghost" className="border-white/20 bg-white/5 text-white hover:border-white" loading={busy === "patch"} onClick={() => confirm(`Pause ${c.name}? Nobody at the company can use RYDO until you activate it again.`) && patch({ status: "SUSPENDED" }, "Client paused.")}>
                Pause client
              </Button>
            ) : (
              <Button variant="ghost" className="border-white/20 bg-white/5 text-white hover:border-white" loading={busy === "patch"} onClick={() => patch({ status: "ACTIVE" }, "Client is active again.")}>
                Activate
              </Button>
            )}
          </div>
        </div>
        {supportForm && (
          <form
            className="relative flex animate-rise flex-col gap-3 rounded-2xl bg-white/5 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              openSupport(supportForm.reason, Number(supportForm.minutes));
            }}
          >
            <label className="flex flex-col gap-1.5 text-sm font-bold">
              Why do you need to look inside {c.name}?
              <input autoFocus required minLength={5} maxLength={300} value={supportForm.reason} onChange={(e) => setSupportForm({ ...supportForm, reason: e.target.value })} placeholder="e.g. HR asked why an approval fails" className="h-11 rounded-xl border border-white/15 bg-white/10 px-3 font-semibold text-white outline-none placeholder:text-white/40 focus:border-lime" />
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-bold">For</span>
              {["30", "60", "120"].map((m) => (
                <button key={m} type="button" aria-pressed={supportForm.minutes === m} onClick={() => setSupportForm({ ...supportForm, minutes: m })} className={`h-9 rounded-xl px-3 text-sm font-extrabold ${supportForm.minutes === m ? "bg-lime text-ink" : "bg-white/10 text-white"}`}>{m === "120" ? "2 hours" : `${m} min`}</button>
              ))}
              <Button type="submit" variant="lime" loading={busy === "support"} className="ml-auto h-9">Start read-only view</Button>
            </div>
            <p className="text-xs text-[#B8C2D6]">You will see their admin screens but can&apos;t change anything. The reason and times are saved in the activity log, which the client can see.</p>
          </form>
        )}
        {c.support && <p className="relative flex items-center gap-2 text-xs font-bold text-lime"><Icon name="shield" size={14} /> Your support session is open until {fmtTime(c.support.expiresAt)}.</p>}
      </div>

      {msg && <Notice tone={msg.tone} onClose={() => setMsg(undefined)}>{msg.text}</Notice>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t, i) => (
          <div key={t.k} style={{ animationDelay: `${i * 50}ms` }} className="flex animate-rise flex-col gap-2 rounded-[22px] bg-white p-4 shadow-soft">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-2"><Icon name={t.icon} size={18} /></span>
            <span className={`text-3xl font-extrabold tabular-nums ${t.warn ? "text-warning" : ""}`}>{t.v}</span>
            <span className="text-xs font-bold text-muted">{t.k}</span>
            {t.sub && <span className="text-xs font-bold text-warning">{t.sub}</span>}
          </div>
        ))}
      </div>

      <DayChart series={c.series} />

      <LicensesCard orgId={c.id} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Features c={c} busy={busy === "patch"} onToggle={(k, v) => patch({ features: { [k]: v } }, `${ORG_FEATURE_INFO[k].label} switched ${v ? "on" : "off"}.`)} />
        <PlanForm c={c} busy={busy === "plan"} onSave={(body) => act("plan", () => api("PATCH", `/admin/platform/organizations/${c.id}`, body), "Saved.")} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Admins c={c} busy={busy === "admin"} onAdd={(body) => act("admin", () => api("POST", `/admin/platform/organizations/${c.id}/admins`, body), `${body.name} is now an admin.`)} />
        <Card className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-lg font-extrabold"><Icon name="building" size={18} /> Offices <Badge tone="neutral">{c.offices.length}</Badge></h2>
          {c.offices.length === 0 ? (
            <p className="text-sm text-muted">No offices yet. The company admin adds them under Offices &amp; teams.</p>
          ) : (
            <>
              <MapView markers={c.offices.map((o) => ({ id: o.id, at: o, kind: "office" as const, title: o.name }))} className="h-56" />
              <ul className="flex flex-col gap-1 text-sm">
                {c.offices.map((o) => <li key={o.id} className="flex items-center gap-2"><span className="font-bold">{o.name}</span>{o.isDefault && <Badge tone="lime">main</Badge>}<span className="truncate text-muted">{o.address}</span></li>)}
              </ul>
            </>
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-lg font-extrabold"><Icon name="route" size={18} /> Ride rules <span className="text-xs font-bold text-muted">set by the client</span></h2>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            {[
              ["Pickup distance", `${c.settings.pickupRadiusMeters} m`],
              ["Free cancel window", `${c.settings.freeCancelHours} h`],
              ["Driver pop-up", `${c.settings.driverPopupSeconds} s`],
              ["Request timeout", `${c.settings.requestTimeoutMinutes} min`],
              ["Women-only allowed", c.settings.womenOnlyEnabled && c.features.womenOnly ? "Yes" : "No"],
              ["Fuel cost per km", c.settings.costPerKmEstimate && c.features.costShare ? `₹${c.settings.costPerKmEstimate}` : "Not shown"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-2xl bg-surface p-3">
                <dt className="text-xs font-bold text-muted">{k}</dt>
                <dd className="font-extrabold">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-lg font-extrabold"><Icon name="clock" size={18} /> Recent activity</h2>
            <Link href={`/platform/activity?org=${c.id}`} className="text-sm font-bold underline">See all</Link>
          </div>
          {c.recent.length === 0 && <p className="text-sm text-muted">Nothing yet.</p>}
          <ul className="flex flex-col divide-y divide-line">
            {c.recent.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span><span className="font-bold">{actionLabel(a.action)}</span>{a.actor && <span className="text-muted"> · {a.actor.name}</span>}</span>
                <span className="text-xs text-muted">{fmtWhen(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </section>
  );
}

/** What this client may use. Each product works only while its licence is valid. */
function LicensesCard({ orgId }: { orgId: string }) {
  const [rows, setRows] = useState<LicenseRow[] | null>(null);
  const load = useCallback(() => api<LicenseRow[]>("GET", `/admin/platform/organizations/${orgId}/licenses`).then(setRows, () => setRows([])), [orgId]);
  useEffect(() => {
    load();
  }, [load]);
  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-extrabold"><Icon name="badge" size={18} /> Licences</h2>
        <p className="text-xs text-muted">This client can use a product only while its licence is valid. When a licence ends or is paused, that product stops for every employee right away.</p>
      </div>
      {rows === null && <Skeleton className="h-32" />}
      <div className="grid gap-4 lg:grid-cols-3">
        {rows?.map((l) => (
          <div key={l.product} className="flex flex-col gap-3 rounded-2xl bg-surface p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-extrabold">{LICENSE_INFO[l.product].label}{LICENSE_INFO[l.product].soon ? " (coming later)" : ""}</p>
                <p className="text-xs text-muted">{LICENSE_INFO[l.product].hint}</p>
              </div>
              <Badge tone={stateTone(l.state, l.daysLeft)}>{STATE_LABEL[l.state]}</Badge>
            </div>
            {l.state !== "NONE" && (
              <p className="text-sm">
                <span className="text-muted">Valid until</span> <b>{dayLabel(l.expiresAt)}</b>
                {leftLabel(l) && <span className="ml-1 text-xs font-bold text-warning">{leftLabel(l)}</span>}
                {l.statusReason && (l.state === "SUSPENDED" || l.state === "REVOKED") && <span className="mt-1 block text-xs text-muted">{l.statusReason}</span>}
              </p>
            )}
            <LicenseControls orgId={orgId} product={l.product} state={l.state} endsOn={l.expiresAt} onChanged={load} />
          </div>
        ))}
      </div>
    </Card>
  );
}

function Features({ c, busy, onToggle }: { c: ClientDetail; busy: boolean; onToggle: (k: keyof OrgFeatures, v: boolean) => void }) {
  const keys = (Object.keys(ORG_FEATURE_INFO) as (keyof OrgFeatures)[]).filter((k) => !ORG_FEATURE_INFO[k].module);
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-lg font-extrabold"><Icon name="layers" size={18} /> Options {busy && <span className="text-xs font-bold text-muted">saving…</span>}</h2>
      <p className="text-xs text-muted">Only RYDO can change these. Products themselves are controlled by the licences above.</p>
      <div className="divide-y divide-line rounded-2xl bg-surface px-4 py-1">
        {keys.map((k) => (
          <div key={k} className="flex items-center gap-2">
            <div className="flex-1">
              <Toggle label={ORG_FEATURE_INFO[k].label + (ORG_FEATURE_INFO[k].soon ? " (coming later)" : "")} hint={ORG_FEATURE_INFO[k].hint} checked={c.features[k]} onChange={(v) => onToggle(k, v)} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function PlanForm({ c, busy, onSave }: { c: ClientDetail; busy: boolean; onSave: (body: object) => Promise<boolean> }) {
  const [f, setF] = useState({ limit: c.maxEmployees ? String(c.maxEmployees) : "", name: c.contact.name ?? "", email: c.contact.email ?? "", phone: c.contact.phone ?? "", notes: c.notes ?? "" });
  return (
    <Card>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ maxEmployees: f.limit ? Number(f.limit) : null, contactName: f.name || null, contactEmail: f.email || null, contactPhone: f.phone || null, notes: f.notes || null });
        }}
      >
        <h2 className="flex items-center gap-2 text-lg font-extrabold"><Icon name="ticket" size={18} /> Plan and contact</h2>
        <Input id="p-limit" label="Seat limit (active employees)" inputMode="numeric" placeholder="No limit" value={f.limit} onChange={(e) => setF({ ...f, limit: e.target.value.replace(/\D/g, "") })} />
        <div className="grid gap-3 sm:grid-cols-3">
          <Input id="p-name" label="Contact name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <Input id="p-email" label="Contact email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          <Input id="p-phone" label="Phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        </div>
        <label className="flex flex-col gap-1.5 text-sm font-bold">
          Internal notes (RYDO only)
          <textarea rows={3} maxLength={2000} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} className="rounded-2xl border-[1.5px] border-line-strong bg-surface p-3 text-sm font-semibold outline-none focus:border-ink focus:bg-white" placeholder="Contract dates, special terms, who to call…" />
        </label>
        <Button type="submit" loading={busy} className="self-start">Save</Button>
      </form>
    </Card>
  );
}

function Admins({ c, busy, onAdd }: { c: ClientDetail; busy: boolean; onAdd: (body: { name: string; email: string; password?: string }) => Promise<boolean> }) {
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [open, setOpen] = useState(false);
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-extrabold"><Icon name="users" size={18} /> Company admins</h2>
        <Button variant="soft" className="h-9" onClick={() => setOpen((o) => !o)}><Icon name={open ? "x" : "plus"} size={16} /> {open ? "Close" : "Add admin"}</Button>
      </div>
      <ul className="flex flex-col gap-2">
        {c.admins.map((a) => (
          <li key={a.membershipId} className="flex items-center gap-3 rounded-2xl bg-surface p-3">
            <Avatar name={a.name} size={36} />
            <span className="min-w-0 flex-1 text-sm">
              <span className="block font-extrabold">{a.name}</span>
              <span className="block truncate text-muted">{a.email}</span>
            </span>
            <span className="flex flex-wrap justify-end gap-1">
              {a.roles.filter((r) => r.endsWith("ADMIN")).map((r) => <Badge key={r} tone="neutral">{r.replace("_ADMIN", "").toLowerCase()}</Badge>)}
              {!a.hasPassword && <Badge tone="warning">no password yet</Badge>}
              {a.status !== "ACTIVE" && <Badge tone="warning">{a.status.toLowerCase()}</Badge>}
            </span>
          </li>
        ))}
      </ul>
      {open && (
        <form
          className="grid animate-rise gap-3 rounded-2xl border border-line p-3 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await onAdd({ name: f.name, email: f.email, password: f.password || undefined })) {
              setF({ name: "", email: "", password: "" });
              setOpen(false);
            }
          }}
        >
          <Input id="a-name" label="Name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <Input id="a-email" label={`Work email (${c.emailDomains[0]})`} type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          <Input id="a-pass" label="Temporary password (optional)" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          <Button type="submit" loading={busy} className="self-end">Add admin</Button>
        </form>
      )}
    </Card>
  );
}
