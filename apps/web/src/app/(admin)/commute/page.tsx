"use client";

import { useCallback, useEffect, useState } from "react";
import type { CommuteDayView, LegState, Place } from "@rydo/shared";
import { api, RequestError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { dayChip, fmtTime } from "@/lib/format";
import { Avatar, Badge, Button, Card, EmptyState, Notice, PageHeader, Segmented, Skeleton } from "@/components/ui";
import { Icon } from "@/components/icons";
import { PlaceField, useOffices } from "@/components/trip-bits";

type Msg = { tone: "ok" | "error"; text: string } | undefined;
type Status = "OFFICE" | "WFH" | "LEAVE" | "";
interface Wait { id: string; status: "WAITING" | "NOTIFIED" | "MATCHED" | "EXPIRED"; criteria: { date: string; fromTime: string; toTime: string; pickup: Place; drop: Place; leg?: string }; expiresAt: string }
interface Fav { membershipId: string; name: string; rating: number | null; ridesTogether: number; available: boolean }

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const timeField = "h-9 w-[92px] rounded-lg border-[1.5px] border-line-strong bg-white px-2 text-sm font-bold outline-none focus:border-ink disabled:opacity-40";
const isoDow = (d: string) => {
  const n = new Date(`${d}T12:00:00Z`).getUTCDay();
  return n === 0 ? 7 : n;
};

function LegChip({ leg, label }: { leg: LegState; label: string }) {
  const style =
    leg.state === "BOOKED" ? "bg-success-bg text-success" : leg.state === "REQUESTED" ? "bg-warning-bg text-warning" : leg.state === "WAITLISTED" ? "bg-[#DCE6FF] text-[#1E3A8A]" : "bg-surface-2 text-muted";
  const text =
    leg.state === "BOOKED" ? `Booked · ${leg.driverName} ${fmtTime(leg.departAt)}`
    : leg.state === "REQUESTED" ? `Asked ${leg.driverName} · ${fmtTime(leg.departAt)}`
    : leg.state === "WAITLISTED" ? "On waitlist"
    : "No ride yet";
  return (
    <span className={`inline-flex max-w-full items-center gap-1.5 truncate rounded-full px-2.5 py-1 text-xs font-extrabold ${style}`}>
      <span className="text-[10px] uppercase opacity-70">{label}</span> {text}
    </span>
  );
}

/** Commute planner: plan the office week once; RYDO finds, requests or waitlists the rides. */
export default function MyWeekPage() {
  const { org, features } = useSession();
  const offices = useOffices();
  const [home, setHome] = useState<Place | null | undefined>(undefined);
  const [week, setWeek] = useState<CommuteDayView[] | null>(null);
  const [waits, setWaits] = useState<Wait[]>([]);
  const [favs, setFavs] = useState<Fav[]>([]);
  const [msg, setMsg] = useState<Msg>();
  const [busy, setBusy] = useState<string | null>(null);
  const [usual, setUsual] = useState({ days: [1, 2, 3, 4, 5], toOffice: "08:30", toHome: "18:30" });

  const load = useCallback(() => {
    api<Place | null>("GET", "/me/home").then(setHome, () => setHome(null));
    api<CommuteDayView[]>("GET", "/me/commute?days=14").then(setWeek, () => setWeek([]));
    api<Wait[]>("GET", "/me/waitlist").then(setWaits, () => undefined);
    api<Fav[]>("GET", "/me/preferred-drivers").then(setFavs, () => undefined);
  }, []);
  useEffect(() => {
    if (org && features.share) load();
  }, [org, features.share, load]);

  async function act<T>(key: string, fn: () => Promise<T>, ok?: (r: T) => string) {
    setBusy(key);
    setMsg(undefined);
    try {
      const r = await fn();
      if (ok) setMsg({ tone: "ok", text: ok(r) });
      return r;
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof RequestError ? e.message : "That didn't work." });
      return undefined;
    } finally {
      setBusy(null);
    }
  }

  if (!org) return null;
  if (!features.share) return <Notice tone="error">Carpool is not switched on for your company.</Notice>;

  const saveDay = (d: CommuteDayView, patch: Partial<{ status: Status; toOfficeTime: string | null; toHomeTime: string | null }>) => {
    const next = { ...d, ...patch };
    const status = (next.status ?? "") as Status;
    if (!status) return;
    act(`day${d.date}`, () => api<CommuteDayView[]>("PUT", "/me/commute", { days: [{ date: d.date, status, toOfficeTime: status === "OFFICE" ? next.toOfficeTime ?? usual.toOffice : null, toHomeTime: status === "OFFICE" ? next.toHomeTime ?? usual.toHome : null, autoBook: true }] })).then((w) => w && setWeek(w));
  };
  const applyUsual = () =>
    act(
      "usual",
      () =>
        api<CommuteDayView[]>("PUT", "/me/commute", {
          days: (week ?? []).map((d) => (usual.days.includes(isoDow(d.date)) ? { date: d.date, status: "OFFICE", toOfficeTime: usual.toOffice, toHomeTime: usual.toHome, autoBook: true } : { date: d.date, status: "WFH", autoBook: true })),
        }),
      () => "Your next two weeks are set. Now tap “Find rides for my week”.",
    ).then((w) => w && setWeek(w));
  const plan = () =>
    act("plan", () => api<{ requested: number; booked: number; waitlisted: number; alreadySet: number }>("POST", "/me/commute/plan"), (r) => {
      const parts = [r.booked && `${r.booked} booked`, r.requested && `${r.requested} requested`, r.waitlisted && `${r.waitlisted} on the waitlist`].filter(Boolean);
      return parts.length ? `Done: ${parts.join(", ")}. Drivers answer in My trips; waitlisted legs get a seat as soon as one opens.` : "Nothing new to book: every office day this week already has a ride or a waitlist place.";
    }).then(() => load());

  const officeDays = (week ?? []).filter((d) => d.status === "OFFICE").length;

  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]">
      <div className="flex min-w-0 flex-col gap-5">
        <PageHeader
          title="My week"
          sub="Tell RYDO your office days once. It finds rides, asks drivers for you, and waitlists the rest."
          action={
            <Button variant="lime" className="h-12 px-5" loading={busy === "plan"} disabled={!home || officeDays === 0} onClick={plan}>
              <Icon name="sparkle" size={18} /> Find rides for my week
            </Button>
          }
        />
        {msg && <Notice tone={msg.tone} onClose={() => setMsg(undefined)}>{msg.text}</Notice>}

        <Card className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-lg font-extrabold"><Icon name="locate" size={18} /> Home</h2>
          {home === undefined ? (
            <Skeleton className="h-12" />
          ) : (
            <PlaceField
              label="Where should drivers pick you up?"
              value={home}
              offices={offices}
              allowLocate
              onChange={(p) => {
                if (!p) return setHome(null);
                act("home", () => api<Place>("PUT", "/me/home", p), () => "Home saved.").then((h) => h && setHome(h));
              }}
            />
          )}
          {!home && home !== undefined && <p className="text-xs text-muted">Needed before RYDO can plan your week. Only drivers you ride with see your pickup point.</p>}
        </Card>

        <Card className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-lg font-extrabold"><Icon name="calendar" size={18} /> My usual week</h2>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Office days">
            {DAYS.map((d, i) => {
              const on = usual.days.includes(i + 1);
              return (
                <button key={d} type="button" aria-pressed={on} onClick={() => setUsual({ ...usual, days: on ? usual.days.filter((x) => x !== i + 1) : [...usual.days, i + 1] })} className={`h-10 w-12 rounded-xl text-sm font-extrabold transition-all ${on ? "bg-ink text-lime" : "bg-surface-2 text-muted"}`}>
                  {d}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm font-bold">
            <label className="flex items-center gap-2">To office around <input type="time" value={usual.toOffice} onChange={(e) => setUsual({ ...usual, toOffice: e.target.value })} className={timeField} /></label>
            <label className="flex items-center gap-2">Back home around <input type="time" value={usual.toHome} onChange={(e) => setUsual({ ...usual, toHome: e.target.value })} className={timeField} /></label>
            <Button variant="ghost" loading={busy === "usual"} onClick={applyUsual}>Apply to the next 2 weeks</Button>
          </div>
        </Card>

        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-extrabold">Next 14 days</h2>
          {week === null && [0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}
          {week?.map((d, i) => {
            const c = dayChip(d.date);
            const status = (d.status ?? "") as Status;
            return (
              <div key={d.date} style={{ animationDelay: `${i * 25}ms` }} className={`flex animate-rise flex-wrap items-center gap-3 rounded-[20px] bg-white p-3 shadow-soft ${busy === `day${d.date}` ? "opacity-60" : ""}`}>
                <span className={`flex h-12 w-14 shrink-0 flex-col items-center justify-center rounded-2xl ${status === "OFFICE" ? "bg-ink text-white" : "bg-surface-2"}`}>
                  <span className={`text-[10px] font-bold uppercase ${status === "OFFICE" ? "text-lime" : "text-muted"}`}>{c.top}</span>
                  <span className="text-sm font-extrabold">{c.bottom}</span>
                </span>
                <Segmented
                  label={`Plan for ${c.top} ${c.bottom}`}
                  value={status || ("" as Status)}
                  onChange={(v) => saveDay(d, { status: v })}
                  options={[{ value: "OFFICE" as Status, label: "Office" }, { value: "WFH" as Status, label: "Home" }, { value: "LEAVE" as Status, label: "Leave" }, ...(status ? [] : [{ value: "" as Status, label: "—" }])]}
                />
                {status === "OFFICE" && (
                  <span className="flex flex-wrap items-center gap-2">
                    <input aria-label="To office time" type="time" defaultValue={d.toOfficeTime ?? ""} onBlur={(e) => e.target.value !== (d.toOfficeTime ?? "") && saveDay(d, { toOfficeTime: e.target.value || null })} className={timeField} />
                    <input aria-label="Back home time" type="time" defaultValue={d.toHomeTime ?? ""} onBlur={(e) => e.target.value !== (d.toHomeTime ?? "") && saveDay(d, { toHomeTime: e.target.value || null })} className={timeField} />
                  </span>
                )}
                <span className="flex min-w-0 flex-1 flex-wrap justify-end gap-1.5">
                  {(status === "OFFICE" || d.toOffice.state !== "NONE") && <LegChip leg={d.toOffice} label="to office" />}
                  {(status === "OFFICE" || d.toHome.state !== "NONE") && <LegChip leg={d.toHome} label="home" />}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-5 lg:sticky lg:top-[84px] lg:self-start">
        <Card className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-lg font-extrabold"><Icon name="clock" size={18} /> My waitlist</h2>
          {waits.filter((w) => w.status !== "EXPIRED").length === 0 && <p className="text-sm text-muted">Nothing waiting. In Find a ride, tap “Join waitlist” when no seat fits.</p>}
          {waits
            .filter((w) => w.status !== "EXPIRED")
            .map((w) => (
              <div key={w.id} className="flex items-center gap-3 rounded-2xl bg-surface p-3 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block font-extrabold">{dayChip(w.criteria.date).top} {dayChip(w.criteria.date).bottom} · {w.criteria.fromTime}–{w.criteria.toTime}</span>
                  <span className="block truncate text-xs text-muted">{w.criteria.pickup.label} → {w.criteria.drop.label}</span>
                </span>
                <Badge tone={w.status === "MATCHED" ? "success" : w.status === "NOTIFIED" ? "lime" : "neutral"} dot={w.status === "WAITING"}>{w.status === "MATCHED" ? "seat asked" : w.status === "NOTIFIED" ? "seat open" : "waiting"}</Badge>
                {w.status === "WAITING" && (
                  <button type="button" aria-label="Leave waitlist" onClick={() => act(`w${w.id}`, () => api("DELETE", `/me/waitlist/${w.id}`)).then(load)} className="rounded-lg p-1 text-muted hover:bg-white hover:text-danger">
                    <Icon name="x" size={16} />
                  </button>
                )}
              </div>
            ))}
        </Card>

        <Card className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-lg font-extrabold"><span className="text-danger">♥</span> Preferred drivers</h2>
          {favs.length === 0 && <EmptyState icon="users" title="None yet">Tap ♡ on a ride in Find a ride. Their rides then show first for you.</EmptyState>}
          {favs.map((f) => (
            <div key={f.membershipId} className="flex items-center gap-3 rounded-2xl bg-surface p-3 text-sm">
              <Avatar name={f.name} size={36} />
              <span className="min-w-0 flex-1">
                <span className="block font-extrabold">{f.name}{f.rating ? <span className="text-muted"> · ★ {f.rating.toFixed(1)}</span> : null}</span>
                <span className="block text-xs text-muted">{f.ridesTogether} {f.ridesTogether === 1 ? "ride" : "rides"} together{f.available ? "" : " · not driving now"}</span>
              </span>
              <button type="button" aria-label={`Remove ${f.name}`} onClick={() => act(`f${f.membershipId}`, () => api<Fav[]>("DELETE", `/me/preferred-drivers/${f.membershipId}`)).then((r) => r && setFavs(r))} className="rounded-lg p-1 text-muted hover:bg-white hover:text-danger">
                <Icon name="x" size={16} />
              </button>
            </div>
          ))}
        </Card>
      </div>
    </section>
  );
}
