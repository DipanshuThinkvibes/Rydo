"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { REALTIME_EVENTS, type LatLng, type LiveLocation, type LiveRide } from "@rydo/shared";
import { api, RequestError } from "@/lib/api";
import { useRealtime, metersBetween } from "@/lib/realtime";
import { fmtTime } from "@/lib/format";
import { toPath, useNow } from "@/lib/use-now";
import { Avatar, Badge, Button, Card, Notice, Segmented } from "@/components/ui";
import { Icon } from "@/components/icons";

type Msg = { tone: "ok" | "error"; text: string } | undefined;
const errText = (e: unknown, fallback = "That didn't work.") => (e instanceof RequestError ? e.message : fallback);

/** Live state of one ride: first load over HTTP, then pushed updates over the socket. */
export function useLiveRide(rideId: string | null) {
  const [live, setLive] = useState<LiveRide | null>(null);
  const [location, setLocation] = useState<LiveLocation | null>(null);
  const reload = useCallback(() => {
    if (!rideId) return Promise.resolve();
    return api<LiveRide>("GET", `/rides/${rideId}/live`).then(
      (l) => {
        setLive(l);
        if (l.location) setLocation((cur) => (!cur || cur.at < l.location!.at ? l.location : cur));
      },
      () => undefined,
    );
  }, [rideId]);
  useEffect(() => {
    if (!rideId) return;
    reload();
    const t = setInterval(reload, 30_000);
    return () => clearInterval(t);
  }, [rideId, reload]);
  useRealtime(rideId ? { rideId } : null, {
    [REALTIME_EVENTS.location]: (d: LiveLocation) => setLocation(d),
    [REALTIME_EVENTS.update]: () => {
      reload();
    },
  });
  return { live: live && live.ride.id === rideId ? live : null, location: location && location.rideId === rideId ? location : null, reload };
}

/** Is the newest long-stop question still unanswered? */
export function openLongStop(events: LiveRide["events"]) {
  const last = events.find((e) => e.type === "LONG_STOP" || e.type === "LONG_STOP_OK");
  return last?.type === "LONG_STOP";
}

// ── simulator: drives along the route and posts points like a phone would ──

function along(path: LatLng[]) {
  const cum = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + metersBetween(path[i - 1], path[i]));
  const total = cum[cum.length - 1] ?? 0;
  const at = (d: number) => {
    if (path.length < 2) return { p: path[0], heading: 0 };
    const x = Math.max(0, Math.min(total, d));
    let i = cum.findIndex((c) => c >= x);
    if (i <= 0) i = 1;
    const a = path[i - 1];
    const b = path[i];
    const seg = cum[i] - cum[i - 1] || 1;
    const k = (x - cum[i - 1]) / seg;
    const heading = (Math.atan2(b.lng - a.lng, b.lat - a.lat) * 180) / Math.PI;
    return { p: { lat: a.lat + (b.lat - a.lat) * k, lng: a.lng + (b.lng - a.lng) * k }, heading: (heading + 360) % 360 };
  };
  return { total, at };
}

function useLocationSender(rideId: string, path: LatLng[], active: boolean, onError: (m: string) => void) {
  const [mode, setMode] = useState<"sim" | "device" | "off">("sim");
  const [speed, setSpeed] = useState<"1" | "5" | "20">("5");
  const [playing, setPlaying] = useState(false);
  const [done, setDone] = useState(0);
  const dist = useRef(0);
  const route = useMemo(() => along(path), [path]);
  const send = useCallback(
    (points: { lat: number; lng: number; speedMps?: number; headingDeg?: number; accuracyM?: number }[]) =>
      api("POST", `/rides/${rideId}/locations`, { points: points.map((p) => ({ ...p, at: new Date().toISOString() })) }).catch((e) => onError(errText(e, "Could not send location."))),
    [rideId, onError],
  );

  useEffect(() => {
    if (!active || mode !== "sim" || !playing || route.total === 0) return;
    const t = setInterval(() => {
      const mps = 11 * Number(speed);
      dist.current = Math.min(route.total, dist.current + mps * 2);
      const { p, heading } = route.at(dist.current);
      send([{ ...p, speedMps: 11, headingDeg: heading }]);
      setDone(dist.current / route.total);
      if (dist.current >= route.total) setPlaying(false);
    }, 2000);
    return () => clearInterval(t);
  }, [active, mode, playing, speed, route, send]);

  useEffect(() => {
    if (!active || mode !== "device" || !navigator.geolocation) return;
    let last = 0;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        if (Date.now() - last < 3000) return;
        last = Date.now();
        send([{ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracyM: pos.coords.accuracy, speedMps: pos.coords.speed ?? undefined, headingDeg: pos.coords.heading ?? undefined }]);
      },
      () => onError("Location is blocked in this browser. Use the simulator instead."),
      { enableHighAccuracy: true },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [active, mode, send, onError]);

  return { mode, setMode, speed, setSpeed, playing, setPlaying, done, reset: () => ((dist.current = 0), setDone(0)) };
}

// ── shared bits ──

export function Stars({ onRate, busy }: { onRate: (stars: number, tags: string[]) => void; busy?: boolean }) {
  const [stars, setStars] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const TAGS = ["On time", "Safe driving", "Friendly", "Clean car", "Good chat"];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1" role="radiogroup" aria-label="Stars">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={stars === n} aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => setStars(n)} className={`text-3xl leading-none transition-transform hover:scale-110 ${n <= stars ? "text-[#F59E0B]" : "text-line-strong"}`}>
            ★
          </button>
        ))}
      </div>
      {stars > 0 && (
        <div className="flex animate-rise flex-wrap gap-1.5">
          {TAGS.map((t) => (
            <button key={t} type="button" aria-pressed={tags.includes(t)} onClick={() => setTags((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t]))} className={`rounded-full px-3 py-1 text-xs font-extrabold ${tags.includes(t) ? "bg-ink text-white" : "bg-surface-2"}`}>
              {t}
            </button>
          ))}
          <Button className="h-8 px-3" loading={busy} onClick={() => onRate(stars, tags)}>Send</Button>
        </div>
      )}
    </div>
  );
}

export function SosButton({ rideId, onDone }: { rideId: string; onDone: (m: Msg) => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const send = () => {
    setBusy(true);
    const go = (at?: GeolocationPosition) =>
      api<{ alreadyOpen: boolean }>("POST", `/rides/${rideId}/sos`, at ? { lat: at.coords.latitude, lng: at.coords.longitude } : {})
        .then((r) => onDone({ tone: "ok", text: r.alreadyOpen ? "Your SOS is already with your company. They will call you." : "SOS sent. Your company's admins have your location and will call you. In danger now? Call 112." }))
        .catch((e) => onDone({ tone: "error", text: errText(e) }))
        .finally(() => {
          setBusy(false);
          setConfirming(false);
        });
    if (navigator.geolocation) navigator.geolocation.getCurrentPosition((p) => go(p), () => go(), { timeout: 4000 });
    else go();
  };
  if (!confirming)
    return (
      <Button variant="danger" onClick={() => setConfirming(true)} className="gap-1.5">
        <Icon name="alert" size={16} /> SOS
      </Button>
    );
  return (
    <div className="flex animate-rise flex-wrap items-center gap-2 rounded-2xl bg-red-50 p-3">
      <span className="text-sm font-bold text-danger">Send SOS to your company now?</span>
      <Button variant="danger" loading={busy} onClick={send}>Yes, send SOS</Button>
      <Button variant="ghost" onClick={() => setConfirming(false)}>No</Button>
    </div>
  );
}

// ── driver ──

export type LiveState = ReturnType<typeof useLiveRide>;

export function DriverTrip({ rideId, status, departAt, onChanged, state }: { rideId: string; status: string; departAt: string; onChanged: () => void; state: LiveState }) {
  const { live, location, reload } = state;
  const [msg, setMsg] = useState<Msg>();
  const [busy, setBusy] = useState<string | null>(null);
  const [pins, setPins] = useState<Record<string, string>>({});
  const now = useNow(1000);
  const path = useMemo(() => toPath(live?.ride.route), [live?.ride.route]);
  const onError = useCallback((m: string) => setMsg({ tone: "error", text: m }), []);
  const inProgress = (live?.ride.status ?? status) === "IN_PROGRESS";
  const sender = useLocationSender(rideId, path, inProgress, onError);

  async function act(key: string, fn: () => Promise<unknown>, ok?: string) {
    setBusy(key);
    setMsg(undefined);
    try {
      await fn();
      await reload();
      onChanged();
      if (ok) setMsg({ tone: "ok", text: ok });
    } catch (e) {
      setMsg({ tone: "error", text: errText(e) });
    } finally {
      setBusy(null);
    }
  }

  const startFrom = new Date(departAt).getTime() - 30 * 60_000;
  const st = live?.ride.status ?? status;

  if (st === "SCHEDULED" || st === "FULL") {
    const canStart = now >= startFrom;
    return (
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold">Ready to go?</h2>
          <p className="text-sm text-muted">{canStart ? "Start the ride when you leave. Riders get a message and can watch your car." : `You can start from ${fmtTime(new Date(startFrom))}.`}</p>
        </div>
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        <Button variant="lime" disabled={!canStart} loading={busy === "start"} onClick={() => act("start", () => api("POST", `/rides/${rideId}/start`), "Ride started. Drive safe!")} className="h-12 px-6 text-base">
          <Icon name="car" size={18} /> Start ride
        </Button>
      </Card>
    );
  }
  if (!live) return null;

  const longStop = openLongStop(live.events);
  const waiting = live.riders.filter((r) => r.status === "CONFIRMED");
  return (
    <div className="flex flex-col gap-4">
      {msg && <Notice tone={msg.tone} onClose={() => setMsg(undefined)}>{msg.text}</Notice>}
      {st === "IN_PROGRESS" && (
        <>
          {longStop && (
            <div className="flex animate-rise flex-wrap items-center gap-3 rounded-2xl bg-warning-bg p-4 text-warning">
              <Icon name="alert" />
              <span className="flex-1 font-bold">You haven&apos;t moved for a while. Everything OK?</span>
              <Button variant="ghost" loading={busy === "ok"} onClick={() => act("ok", () => api("POST", `/rides/${rideId}/ok`))}>I&apos;m OK</Button>
            </div>
          )}
          <Card className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-lg font-extrabold"><span className="relative flex h-2.5 w-2.5"><span className="absolute inset-0 animate-ping-soft rounded-full bg-success" /><span className="relative h-2.5 w-2.5 rounded-full bg-success" /></span> Live · sharing location</h2>
              <Segmented label="Location source" value={sender.mode} onChange={sender.setMode} options={[{ value: "sim", label: "Simulator" }, { value: "device", label: "This device" }, { value: "off", label: "Off" }]} />
            </div>
            {sender.mode === "sim" && (
              <div className="flex flex-wrap items-center gap-3">
                <Button variant={sender.playing ? "ghost" : "primary"} onClick={() => sender.setPlaying(!sender.playing)} disabled={path.length < 2}>
                  {sender.playing ? "Pause" : sender.done > 0 ? "Resume drive" : "Simulate drive"}
                </Button>
                <Segmented label="Speed" value={sender.speed} onChange={sender.setSpeed} options={[{ value: "1", label: "1×" }, { value: "5", label: "5×" }, { value: "20", label: "20×" }]} />
                <span className="h-2 min-w-[120px] flex-1 overflow-hidden rounded-full bg-surface-2"><span className="block h-full rounded-full bg-ink transition-[width] duration-1000" style={{ width: `${sender.done * 100}%` }} /></span>
                <span className="text-xs font-bold text-muted">{Math.round(sender.done * 100)}%</span>
              </div>
            )}
            <p className="text-xs text-muted">No phone yet: the simulator drives along the route and sends points like the app will. {location ? `Last update ${fmtTime(location.at)}.` : ""}</p>
          </Card>
        </>
      )}

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-extrabold">Pickups</h2>
        {live.riders.length === 0 && <p className="text-sm text-muted">No riders on this ride.</p>}
        {live.riders.map((r) => {
          const noShowAt = r.arrivedAt ? new Date(r.arrivedAt).getTime() + live.noShowAfterMinutes * 60_000 : null;
          const away = location && r.pickup ? metersBetween(location, r.pickup) : null;
          return (
            <div key={r.bookingId} className="flex flex-col gap-3 rounded-2xl bg-surface p-3">
              <div className="flex items-center gap-3">
                <Avatar name={r.name} size={40} />
                <span className="min-w-0 flex-1 text-sm">
                  <span className="block font-extrabold">{r.name}</span>
                  <span className="block truncate text-muted">{r.pickupLabel}{away != null && r.status === "CONFIRMED" ? ` · ${away < 1000 ? `${Math.round(away)} m` : `${(away / 1000).toFixed(1)} km`} away` : ""}</span>
                </span>
                <Badge tone={r.status === "BOARDED" || r.status === "COMPLETED" ? "success" : r.status === "NO_SHOW" ? "warning" : "neutral"}>
                  {r.status === "CONFIRMED" ? (r.arrivedAt ? "you're at pickup" : "to pick up") : r.status === "BOARDED" ? "on board" : r.status.toLowerCase().replace("_", " ")}
                </Badge>
              </div>
              {st === "IN_PROGRESS" && r.status === "CONFIRMED" && !r.arrivedAt && (
                <Button variant="ghost" className="self-start" loading={busy === `arr${r.bookingId}`} onClick={() => act(`arr${r.bookingId}`, () => api("POST", `/bookings/${r.bookingId}/arrived`), `${r.name} was told you're at the pickup.`)}>
                  <Icon name="locate" size={16} /> I&apos;m at the pickup
                </Button>
              )}
              {st === "IN_PROGRESS" && r.status === "CONFIRMED" && r.arrivedAt && (
                <form
                  className="flex flex-wrap items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    act(`pin${r.bookingId}`, () => api("POST", `/bookings/${r.bookingId}/board`, { pin: pins[r.bookingId] ?? "" }), `${r.name} is on board.`);
                  }}
                >
                  <label className="sr-only" htmlFor={`pin-${r.bookingId}`}>Rider PIN</label>
                  <input id={`pin-${r.bookingId}`} inputMode="numeric" maxLength={4} placeholder="PIN" value={pins[r.bookingId] ?? ""} onChange={(e) => setPins({ ...pins, [r.bookingId]: e.target.value.replace(/\D/g, "") })} className="h-11 w-28 rounded-xl border-[1.5px] border-line-strong bg-white text-center text-xl font-extrabold tracking-[0.4em] outline-none focus:border-ink" />
                  <Button type="submit" loading={busy === `pin${r.bookingId}`} disabled={(pins[r.bookingId] ?? "").length !== 4}>Check PIN</Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={!!noShowAt && now < noShowAt}
                    loading={busy === `ns${r.bookingId}`}
                    onClick={() => act(`ns${r.bookingId}`, () => api("POST", `/bookings/${r.bookingId}/no-show`), `${r.name} marked as no-show.`)}
                  >
                    {noShowAt && now < noShowAt ? `No-show in ${Math.ceil((noShowAt - now) / 1000)}s` : "Mark no-show"}
                  </Button>
                </form>
              )}
              {st === "COMPLETED" && r.status === "COMPLETED" && !r.rated && (
                <Stars busy={busy === `rate${r.bookingId}`} onRate={(stars, tags) => act(`rate${r.bookingId}`, () => api("POST", `/rides/${rideId}/ratings`, { rateeMembershipId: r.membershipId, stars, tags }), "Thanks for rating.")} />
              )}
            </div>
          );
        })}
      </Card>

      {st === "IN_PROGRESS" && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="lime"
            className="h-12 px-6 text-base"
            loading={busy === "done"}
            onClick={() => (waiting.length === 0 || confirm(`${waiting.length} rider(s) were not picked up. They will be marked as missed. Complete the ride?`)) && act("done", () => api("POST", `/rides/${rideId}/complete`), "Ride completed. Thanks for sharing your car!")}
          >
            <Icon name="check" size={18} /> Complete ride
          </Button>
          <SosButton rideId={rideId} onDone={setMsg} />
        </div>
      )}
    </div>
  );
}

// ── rider ──

export function RiderLive({ rideId, onRated, state }: { rideId: string; onRated?: () => void; state: LiveState }) {
  const { live, location, reload } = state;
  const [msg, setMsg] = useState<Msg>();
  const [share, setShare] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  if (!live) return null;
  const me = live.riders[0];
  const st = live.ride.status;
  const away = location && me?.pickup ? metersBetween(location, me.pickup) : null;
  const longStop = openLongStop(live.events);
  const line =
    st === "SCHEDULED" || st === "FULL"
      ? `${live.ride.driver.name} leaves at ${fmtTime(live.ride.departAt)}. You'll see the car here once the ride starts.`
      : st === "IN_PROGRESS" && me?.status === "CONFIRMED" && me.arrivedAt
        ? `${live.ride.driver.name} is at ${me.pickupLabel}. Say your PIN only inside the car.`
        : st === "IN_PROGRESS" && me?.status === "CONFIRMED"
          ? `${live.ride.driver.name} is on the way${away != null ? ` · ${away < 1000 ? `${Math.round(away)} m` : `${(away / 1000).toFixed(1)} km`} away` : ""}.`
          : st === "IN_PROGRESS" && me?.status === "BOARDED"
            ? `You're on board. Heading to ${live.ride.to}.`
            : st === "COMPLETED"
              ? "You've arrived."
              : "";

  const doShare = async () => {
    setBusy("share");
    try {
      const r = await api<{ url: string }>("POST", `/rides/${rideId}/share`);
      setShare(r.url);
      await navigator.clipboard?.writeText(r.url).catch(() => undefined);
      setMsg({ tone: "ok", text: "Link copied. Anyone with it can watch this trip until it ends." });
    } catch (e) {
      setMsg({ tone: "error", text: errText(e) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-ink p-4 text-white" onClick={(e) => e.stopPropagation()}>
      <p className="flex items-center gap-2 font-bold">
        {st === "IN_PROGRESS" && <span className="relative flex h-2.5 w-2.5"><span className="absolute inset-0 animate-ping-soft rounded-full bg-lime" /><span className="relative h-2.5 w-2.5 rounded-full bg-lime" /></span>}
        {line}
      </p>
      {msg && <Notice tone={msg.tone} onClose={() => setMsg(undefined)}>{msg.text}</Notice>}
      {longStop && st === "IN_PROGRESS" && me?.status === "BOARDED" && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-warning-bg p-3 text-sm font-bold text-warning">
          The car hasn&apos;t moved for a while. Everything OK?
          <Button variant="ghost" className="h-9" loading={busy === "ok"} onClick={() => (setBusy("ok"), api("POST", `/rides/${rideId}/ok`).then(reload).finally(() => setBusy(null)))}>I&apos;m OK</Button>
        </div>
      )}
      {st !== "COMPLETED" && st !== "CANCELLED" && (
        <div className="flex flex-wrap gap-2">
          <Button variant="lime" className="h-10" loading={busy === "share"} onClick={doShare}><Icon name="route" size={16} /> Share live trip</Button>
          {st === "IN_PROGRESS" && <SosButton rideId={rideId} onDone={setMsg} />}
        </div>
      )}
      {share && <code className="truncate rounded-lg bg-white/10 px-2 py-1 text-xs">{share}</code>}
      {st === "COMPLETED" && me?.status === "COMPLETED" && !live.ratedDriver && (
        <div className="flex flex-col gap-2 rounded-xl bg-white p-3 text-ink">
          <span className="text-sm font-extrabold">Rate {live.ride.driver.name}</span>
          <Stars
            busy={busy === "rate"}
            onRate={(stars, tags) => {
              setBusy("rate");
              api("POST", `/rides/${rideId}/ratings`, { rateeMembershipId: live.ride.driver.membershipId, stars, tags })
                .then(() => (setMsg({ tone: "ok", text: "Thanks for rating." }), reload(), onRated?.()))
                .catch((e) => setMsg({ tone: "error", text: errText(e) }))
                .finally(() => setBusy(null));
            }}
          />
        </div>
      )}
    </div>
  );
}
