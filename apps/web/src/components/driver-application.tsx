"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  DRIVER_GUIDELINES,
  FUEL_LABEL,
  FUEL_TYPES,
  LICENSE_ALLOWS,
  LICENSE_CLASS_LABEL,
  MIN_DRIVER_AGE,
  VEHICLE_PHOTO_INFO,
  VEHICLE_PHOTO_KINDS,
  ageOn,
  type LicenseClass,
} from "@rydo/shared";
import { api, RequestError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Badge, Button, Card, Input, Notice, Select, Skeleton, Toggle } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";
import { Plate } from "@/components/trip-bits";
import { PhotoPicker } from "@/components/photo-picker";
import { GOOD_PHOTO } from "@/components/photo-gate";

export interface Check { code: string; group: "VEHICLE" | "DRIVER"; label: string; passed: boolean; detail: string }
export interface VehicleRow {
  id: string;
  type: "CAR" | "BIKE";
  carType?: "HATCHBACK" | "SEDAN" | "SUV" | null;
  make: string;
  model: string;
  color: string;
  plateNumber: string;
  seatCapacity: number;
  hasAc: boolean;
  isDefault: boolean;
  manufactureYear: number | null;
  fuelType: string | null;
  checkStatus: "PENDING" | "VERIFIED" | "REJECTED" | "EXPIRED";
  checkResults: Check[] | null;
}
export type DocKind = "DRIVING_LICENSE" | "VEHICLE_RC" | "INSURANCE" | "VEHICLE_PHOTO_FRONT" | "VEHICLE_PHOTO_SIDE" | "VEHICLE_PHOTO_INSIDE";
export interface DocRow { id: string; kind: DocKind; number: string | null; expiresAt: string | null; status: "PENDING" | "APPROVED" | "REJECTED"; rejectReason: string | null; vehicleId: string | null; expired: boolean; hasBack: boolean }
export interface DriverProfile {
  id: string;
  status: "PENDING" | "VERIFIED" | "REJECTED" | "EXPIRED";
  applicationStatus: "DRAFT" | "NEEDS_FIXES" | "WITH_HR";
  submittedAt: string | null;
  approvalMode: "MANUAL" | "AUTO_TEAM";
  preferences: Record<string, boolean>;
  details: { dateOfBirth: string | null; licenseClass: string | null; drivingSince: number | null };
  readiness: { photo: boolean; license: boolean; vehicle: boolean; rc: boolean; insurance: boolean; photos: boolean; guidelines: boolean; stepsDone: number; stepsTotal: number; canApply: boolean };
  vehicles: VehicleRow[];
  documents: DocRow[];
}
interface ApplyResult { sentToHr: boolean; passed: boolean; vehiclePassed: boolean; checks: Check[]; profile: DriverProfile }

type Msg = { tone: "ok" | "error"; text: string } | undefined;
export type Run = <T>(fn: () => Promise<T>, ok?: string) => Promise<T | null>;

const thisYear = new Date().getFullYear();
const today = () => new Date().toISOString().slice(0, 10);
/** Which step fixes which failed check. */
const STEP_FOR: Record<string, number> = {
  PROFILE_PHOTO: 1, LICENSE_PRESENT: 2, LICENSE_VALID: 2, LICENSE_BACK: 2, LICENSE_CLASS: 2, AGE: 2, EXPERIENCE: 2,
  PLATE_FORMAT: 3, SEATS: 3, YEAR: 3, RC_PRESENT: 4, RC_MATCH: 4, RC_VALID: 4, INSURANCE_PRESENT: 5, INSURANCE_VALID: 5, VEHICLE_PHOTOS: 6, GUIDELINES: 7,
};
const pills = "rounded-full border-[1.5px] px-4 py-2 text-sm font-extrabold transition-colors";
const pill = (on: boolean) => `${pills} ${on ? "border-lime bg-lime text-ink" : "border-line-strong bg-white hover:border-ink"}`;

/** The journey: apply, vehicle check, HR approval, ready. Shows where the driver is. */
function Tracker({ p, failed }: { p: DriverProfile | null; failed: boolean }) {
  const withHr = p?.applicationStatus === "WITH_HR";
  const stages = [
    { label: "Apply", hint: "Seven short steps", done: withHr || p?.status === "VERIFIED" },
    { label: "Vehicle check", hint: failed || p?.applicationStatus === "NEEDS_FIXES" ? "Things to fix" : "Checked by RYDO first", done: withHr || p?.status === "VERIFIED", bad: failed || p?.applicationStatus === "NEEDS_FIXES" },
    { label: "HR approval", hint: withHr ? (p?.status === "REJECTED" ? "HR asked for a re-upload" : "With your company HR") : "Then your HR approves", done: p?.status === "VERIFIED" },
    { label: "Ready to drive", hint: "Offer rides", done: p?.status === "VERIFIED" },
  ];
  const current = stages.findIndex((s) => !s.done);
  return (
    <ol className="grid gap-2 sm:grid-cols-4" aria-label="Your driver application">
      {stages.map((s, i) => {
        const active = i === (current === -1 ? 3 : current);
        return (
          <li key={s.label} className={`flex items-start gap-3 rounded-2xl p-3 ${s.bad ? "bg-warning-bg" : active ? "bg-lime/40 ring-1 ring-lime" : "bg-surface"}`}>
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${s.done ? "bg-success text-white" : s.bad ? "bg-warning text-white" : active ? "bg-ink text-lime" : "bg-white text-muted"}`}>{s.done ? <Icon name="check" size={15} /> : i + 1}</span>
            <span className="min-w-0"><span className="block text-sm font-extrabold">{s.label}</span><span className="text-xs text-muted">{s.hint}</span></span>
          </li>
        );
      })}
    </ol>
  );
}

export function CheckList({ checks, onFix }: { checks: Check[]; onFix?: (step: number) => void }) {
  return (
    <ul className="flex flex-col gap-2">
      {checks.map((c) => (
        <li key={c.code} className={`flex items-start gap-3 rounded-2xl p-3 text-sm ${c.passed ? "bg-surface" : "bg-warning-bg"}`}>
          <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${c.passed ? "bg-success-bg text-success" : "bg-white text-danger"}`}><Icon name={c.passed ? "check" : "x"} size={13} /></span>
          <span className="min-w-0 flex-1"><b>{c.label}</b><span className="block text-xs text-muted">{c.detail}</span></span>
          {!c.passed && onFix && STEP_FOR[c.code] && <button type="button" onClick={() => onFix(STEP_FOR[c.code])} className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-extrabold shadow-soft hover:bg-surface-2">Fix</button>}
        </li>
      ))}
    </ul>
  );
}

/** Uploads a paper or photo: the front, and the back too when there is one. */
async function sendDocument(fields: Record<string, string | undefined>, front: File, back?: File | null) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) f.append(k, v);
  f.append("file", front);
  if (back) f.append("fileBack", back);
  return api<DocRow>("POST", "/driver/documents", f);
}
const bigFile = (f: File) => (f.size > 5 * 1024 * 1024 ? "Each file must be under 5 MB." : undefined);

/** The vehicle the papers belong to, shown at the top of the RC, insurance and photo screens. */
function VehicleBanner({ v }: { v: VehicleRow }) {
  return (
    <Card className="flex items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2"><Icon name="car" size={19} /></span>
      <p className="min-w-0 flex-1 truncate text-sm font-extrabold">{v.color} {v.make} {v.model} · {v.plateNumber}</p>
    </Card>
  );
}

/** Screen header: a back arrow to the checklist and a title. */
function StepHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <button type="button" onClick={onBack} aria-label="Back to the checklist" className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-soft hover:bg-surface-2"><Icon name="arrowLeft" size={18} /></button>
      <h2 className="text-xl font-extrabold">{title}</h2>
    </div>
  );
}

/** "Add your vehicle first." with a button that goes there. */
function NeedVehicle({ go }: { go: () => void }) {
  return (
    <Card className="flex flex-col items-start gap-3">
      <p className="rounded-2xl bg-surface p-3 text-sm text-muted">Add your vehicle details first.</p>
      <Button onClick={go}>Add vehicle details</Button>
    </Card>
  );
}

/**
 * A paper with a number, an end date and a photo of the front (and the back, where there is one): RC and insurance.
 * Once uploaded it shows a summary, with "Replace" to send a new one.
 */
export function PaperCard({ kind, title, hint, vehicleId, doc, numberLabel = "Number", numberPlaceholder, frontLabel = "Front side", frontHint, back = "none", reload, run, busy, onDone }: {
  kind: "VEHICLE_RC" | "INSURANCE";
  title: string;
  hint?: string;
  vehicleId: string;
  doc?: DocRow;
  numberLabel?: string;
  numberPlaceholder?: string;
  frontLabel?: string;
  frontHint?: string;
  back?: "none" | "optional";
  reload: () => Promise<unknown>;
  run: Run;
  busy: boolean;
  onDone?: () => void;
}) {
  const [replace, setReplace] = useState(false);
  const [number, setNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [front, setFront] = useState<File | null>(null);
  const [rear, setRear] = useState<File | null>(null);
  const [err, setErr] = useState<string>();
  const showForm = !doc || doc.status === "REJECTED" || doc.expired || replace;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(undefined);
    if (number.trim().length < 4) return setErr("Enter the number as printed (at least 4 characters).");
    if (!expiry || expiry <= today()) return setErr("Enter an end date in the future.");
    if (!front) return setErr(`Add a photo: ${frontLabel.toLowerCase()}.`);
    const big = bigFile(front) ?? (rear ? bigFile(rear) : undefined);
    if (big) return setErr(big);
    const r = await run(() => sendDocument({ kind, number: number.trim(), expiresAt: expiry, vehicleId }, front, rear), `${title} uploaded.`);
    if (r) {
      setNumber(""); setExpiry(""); setFront(null); setRear(null); setReplace(false);
      await reload();
      onDone?.();
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-xs font-extrabold uppercase tracking-[2px] text-muted">{kind === "VEHICLE_RC" ? "Your RC" : "Your insurance policy"}</h3>
          {doc && !showForm && <p className="mt-1 text-sm">No. <b>{doc.number}</b> · valid till {doc.expiresAt}{doc.hasBack ? " · both sides" : ""}</p>}
        </div>
        {doc ? <Badge tone={doc.expired || doc.status === "REJECTED" ? "warning" : doc.status === "APPROVED" ? "success" : "neutral"}>{doc.expired ? "expired" : doc.status === "PENDING" ? "uploaded" : doc.status.toLowerCase()}</Badge> : <Badge tone="warning">to do</Badge>}
        {doc && !showForm && <Button variant="ghost" className="h-9" onClick={() => setReplace(true)}>Replace</Button>}
      </div>
      {doc?.status === "REJECTED" && doc.rejectReason && <p className="text-sm font-semibold text-danger">HR: “{doc.rejectReason}”</p>}
      {showForm && (
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <Input id={`${kind}-no`} label={numberLabel} placeholder={numberPlaceholder} value={number} onChange={(e) => setNumber(e.target.value)} />
          <Input id={`${kind}-exp`} label="Valid till" type="date" min={today()} value={expiry} onChange={(e) => setExpiry(e.target.value)} />
          <PhotoPicker label={frontLabel} hint={frontHint} file={front} onFile={setFront} allowPdf />
          {back === "optional" && <PhotoPicker label="Back side (smart-card RC)" hint="Skip if your RC is a single page." file={rear} onFile={setRear} allowPdf optional />}
          {hint && <p className="text-xs text-muted">{hint}</p>}
          {err && <p role="alert" className="text-sm font-semibold text-danger">{err}</p>}
          <div className="flex gap-2">
            <Button type="submit" loading={busy} className="h-12 flex-1">{kind === "VEHICLE_RC" ? "Upload RC" : "Upload insurance"}</Button>
            {replace && <Button type="button" variant="ghost" className="h-12" onClick={() => setReplace(false)}>Cancel</Button>}
          </div>
        </form>
      )}
    </Card>
  );
}

/** One of the three vehicle photos: pick it and it is uploaded straight away. */
export function VehiclePhotoSlot({ kind, vehicleId, doc, reload, run }: { kind: (typeof VEHICLE_PHOTO_KINDS)[number]; vehicleId: string; doc?: DocRow; reload: () => Promise<unknown>; run: Run }) {
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState<string>();
  const info = VEHICLE_PHOTO_INFO[kind];

  async function choose(f: File | null) {
    setFile(f);
    setErr(undefined);
    if (!f) return;
    const big = bigFile(f);
    if (big) return setErr(big);
    const r = await run(() => sendDocument({ kind, vehicleId }, f), `${info.title.split(",")[0]} photo added.`);
    if (r) {
      setFile(null);
      await reload();
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-extrabold">{info.title}</h3>
        <Badge tone={doc ? "success" : "warning"}>{doc ? "added" : "to do"}</Badge>
      </div>
      <PhotoPicker label={doc ? "Replace the photo" : "Photo"} hint={info.hint} file={file} onFile={choose} />
      {err && <p role="alert" className="text-sm font-semibold text-danger">{err}</p>}
    </Card>
  );
}

/**
 * Becoming a driver, as a checklist of seven steps you can do in any order. When all seven are done the vehicle is checked
 * first; if it passes, your company HR is asked to approve you.
 */
export function DriverApplication({ initial, onVerified }: { initial: DriverProfile | null; onVerified?: () => void }) {
  const { reload: reloadSession, me } = useSession();
  const [p, setP] = useState<DriverProfile | null>(initial);
  const [step, setStep] = useState<number | null>(null);
  const [msg, setMsg] = useState<Msg>();
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => api<DriverProfile | null>("GET", "/driver/profile").then(setP), []);
  useEffect(() => {
    if (p?.status === "VERIFIED") onVerified?.();
  }, [p?.status, onVerified]);

  const run = useCallback<Run>(async (fn, ok) => {
    setMsg(undefined);
    setBusy(true);
    try {
      const r = await fn();
      if (ok) setMsg({ tone: "ok", text: ok });
      return r;
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof RequestError ? (e.fields ? Object.values(e.fields)[0] : e.message) : "That did not work. Try again." });
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  /** Creates the driver profile the first time anything is saved. */
  const ensure = useCallback(async (): Promise<DriverProfile> => p ?? (await api<DriverProfile>("POST", "/driver/profile", {})), [p]);
  const back = useCallback(() => { setStep(null); }, []);

  const vehicle = p?.vehicles.find((v) => v.isDefault) ?? p?.vehicles[0];
  const withHr = p?.applicationStatus === "WITH_HR" && p.status !== "VERIFIED";
  if (withHr && p) return <WithHr p={p} vehicle={vehicle} reload={reload} run={run} msg={msg} busy={busy} />;

  const r = p?.readiness;
  const rows: { n: number; title: string; sub: string; icon: IconName; done: boolean }[] = [
    { n: 1, title: "Profile photo", sub: "So riders know who is picking them up", icon: "user", done: r ? r.photo : me?.user.hasPhoto === true },
    { n: 2, title: "Driving licence", sub: "Both sides, number and expiry", icon: "badge", done: !!r?.license },
    { n: 3, title: "Vehicle details", sub: "Car or bike, number plate, seats", icon: "car", done: !!r?.vehicle },
    { n: 4, title: "Registration certificate (RC)", sub: vehicle ? "Front and back, number and expiry" : "Add your vehicle first.", icon: "clipboard", done: !!r?.rc },
    { n: 5, title: "Vehicle insurance", sub: vehicle ? "Policy page, number and expiry" : "Add your vehicle first.", icon: "shield", done: !!r?.insurance },
    { n: 6, title: "Vehicle photos", sub: vehicle ? "Front, side and inside" : "Add your vehicle first.", icon: "search", done: !!r?.photos },
    { n: 7, title: "Safety and guidelines", sub: "Short read, then agree", icon: "flag", done: !!r?.guidelines },
  ];
  const done = r?.stepsDone ?? 0;

  async function sendToHr() {
    const res = await run(() => api<ApplyResult>("POST", "/driver/application", {}));
    if (res) { setResult(res); setP(res.profile); if (!res.sentToHr) setStep(null); }
  }

  return (
    <div className="flex flex-col gap-4">
      <Tracker p={p} failed={!!result && !result.passed} />
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      {step === null && (
        <>
          <Card className="flex flex-col gap-3">
            <span className="w-fit rounded-full bg-lime px-3 py-1 text-xs font-extrabold text-ink">{done} of 7 steps in</span>
            <h2 className="text-2xl font-extrabold">Offer your empty seats</h2>
            <p className="text-sm text-muted">Drive colleagues who live on your route. Finish these steps in any order; we check your vehicle first, then your HR checks the rest before your first ride.</p>
            <div className="grid grid-cols-7 gap-1.5" aria-hidden="true">
              {rows.map((x) => <span key={x.n} className={`h-1.5 rounded-full ${x.done ? "bg-ink" : "bg-line-strong"}`} />)}
            </div>
          </Card>

          <Card className="!p-2">
            <ul className="divide-y divide-line">
              {rows.map((x) => {
                const locked = [4, 5, 6].includes(x.n) && !vehicle;
                return (
                  <li key={x.n}>
                    <button type="button" onClick={() => { setMsg(undefined); setStep(locked ? 3 : x.n); }} className="flex w-full items-center gap-3 rounded-2xl px-3 py-3.5 text-left transition-colors hover:bg-surface">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-2"><Icon name={x.icon} size={19} /></span>
                      <span className="min-w-0 flex-1"><span className="block font-extrabold">{x.title}</span><span className="text-sm text-muted">{x.sub}</span></span>
                      <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-extrabold ${x.done ? "bg-lime text-ink" : "bg-surface-2 text-muted"}`}>{x.done ? "done" : "to do"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>

          <RideRules p={p} ensure={ensure} setP={setP} run={run} />

          <Card className="flex flex-col gap-3">
            <Button className="h-12" loading={busy} disabled={!r?.canApply} onClick={sendToHr}>Check my vehicle and send to HR</Button>
            <p className="text-xs text-muted">{r?.canApply ? "We check your vehicle and papers first. If everything passes, your company HR is asked to approve you. If something is wrong, we tell you exactly what to fix and HR hears nothing yet." : "Finish all seven steps to send your application."}</p>
          </Card>

          {result && !result.passed && (
            <Card className="flex flex-col gap-3 ring-1 ring-warning/40">
              <h3 className="flex items-center gap-2 text-lg font-extrabold"><Icon name="alert" size={18} className="text-warning" /> We found {result.checks.filter((c) => !c.passed).length} {result.checks.filter((c) => !c.passed).length === 1 ? "thing" : "things"} to fix</h3>
              <p className="text-sm text-muted">Nothing was sent to HR. Fix these and send again.</p>
              <CheckList checks={[...result.checks].sort((a, b) => Number(a.passed) - Number(b.passed))} onFix={setStep} />
            </Card>
          )}
        </>
      )}

      {step === 1 && <PhotoStep onBack={back} onDone={async () => { await Promise.all([reloadSession(), reload().catch(() => undefined)]); setStep(null); setMsg({ tone: "ok", text: "Profile photo saved." }); }} run={run} busy={busy} />}
      {step === 2 && <LicenceStep p={p} ensure={ensure} busy={busy} run={run} onBack={back} onDone={async () => { await reload(); setStep(null); setMsg({ tone: "ok", text: "Driving licence saved." }); }} />}
      {step === 3 && <VehicleStep p={p} vehicle={vehicle} busy={busy} onBack={back} onSave={async (v) => {
        const prof = await run(async () => { await ensure(); return vehicle ? api<DriverProfile>("PATCH", `/driver/vehicles/${vehicle.id}`, v) : api<DriverProfile>("POST", "/driver/vehicles", v); }, "Vehicle saved.");
        if (prof) { setP(prof); setStep(null); }
      }} />}
      {step === 4 && (p && vehicle ? (
        <div className="flex flex-col gap-4">
          <StepHeader title="Registration certificate (RC)" onBack={back} />
          <VehicleBanner v={vehicle} />
          <PaperCard kind="VEHICLE_RC" title="Registration certificate (RC)" vehicleId={vehicle.id} doc={p.documents.find((d) => d.kind === "VEHICLE_RC" && d.vehicleId === vehicle.id)} numberLabel="Registration number" numberPlaceholder={vehicle.plateNumber.replace(/ /g, "")} frontLabel="Front side" frontHint="Smart-card RC or the paper RC. All corners visible." back="optional" hint={`The registration number must match your plate, ${vehicle.plateNumber}.`} reload={reload} run={run} busy={busy} onDone={() => setStep(null)} />
        </div>
      ) : <NeedVehicle go={() => setStep(3)} />)}
      {step === 5 && (p && vehicle ? (
        <div className="flex flex-col gap-4">
          <StepHeader title="Vehicle insurance" onBack={back} />
          <VehicleBanner v={vehicle} />
          <PaperCard kind="INSURANCE" title="Vehicle insurance" vehicleId={vehicle.id} doc={p.documents.find((d) => d.kind === "INSURANCE" && d.vehicleId === vehicle.id)} numberLabel="Policy number" numberPlaceholder="OG-25-1234-5678-0000001" frontLabel="Policy page with your vehicle number" frontHint="The page that shows the policy number, vehicle number and dates." hint="HR and RYDO check the policy against your vehicle number and dates." reload={reload} run={run} busy={busy} onDone={() => setStep(null)} />
        </div>
      ) : <NeedVehicle go={() => setStep(3)} />)}
      {step === 6 && (p && vehicle ? (
        <div className="flex flex-col gap-4">
          <StepHeader title="Vehicle photos" onBack={back} />
          <p className="text-sm text-muted">Three photos of {vehicle.plateNumber} let HR check the vehicle without an inspection visit.</p>
          {VEHICLE_PHOTO_KINDS.map((k) => <VehiclePhotoSlot key={k} kind={k} vehicleId={vehicle.id} doc={p.documents.find((d) => d.kind === k && d.vehicleId === vehicle.id)} reload={reload} run={run} />)}
          <Button variant="ghost" className="h-12" onClick={back}>Back to checklist</Button>
        </div>
      ) : <NeedVehicle go={() => setStep(3)} />)}
      {step === 7 && <GuidelinesStep p={p} ensure={ensure} busy={busy} run={run} onBack={back} onDone={async () => { await reload(); setStep(null); setMsg({ tone: "ok", text: "Thanks. Safety guidelines agreed." }); }} />}
    </div>
  );
}

/** "Your ride rules": saved as you tap them; riders see them before they ask for a seat. */
function RideRules({ p, ensure, setP, run }: { p: DriverProfile | null; ensure: () => Promise<DriverProfile>; setP: (p: DriverProfile) => void; run: Run }) {
  const prefs = { noSmoking: true, quiet: false, musicOk: true, womenRidersOnly: false, ...(p?.preferences ?? {}) } as Record<string, boolean>;
  const items: [string, string][] = [["noSmoking", "No smoking"], ["quiet", "Quiet rides"], ["musicOk", "Music is fine"], ["womenRidersOnly", "Women riders only"]];
  const save = async (body: object) => {
    const r = await run(async () => {
      const base = await ensure();
      return base.id ? api<DriverProfile>("PATCH", "/driver/profile", body) : base;
    });
    if (r) setP(r);
  };
  return (
    <Card className="flex flex-col gap-3">
      <p className="text-xs font-extrabold uppercase tracking-[2px] text-muted">Your ride rules</p>
      <div className="flex flex-wrap gap-2">
        {items.map(([k, label]) => <button key={k} type="button" aria-pressed={!!prefs[k]} onClick={() => save({ preferences: { [k]: !prefs[k] } })} className={pill(!!prefs[k])}>{label}</button>)}
      </div>
      <Select id="d-mode" label="When someone asks for a seat" value={p?.approvalMode ?? "MANUAL"} onChange={(e) => save({ approvalMode: e.target.value })}>
        <option value="MANUAL">I approve each request myself</option>
        <option value="AUTO_TEAM">Accept people from my own team automatically</option>
      </Select>
      <p className="text-xs text-muted">Riders see these before they request. Change them any time.</p>
    </Card>
  );
}

/** Step 1: the profile photo (also needed for every ride). */
function PhotoStep({ onBack, onDone, run, busy }: { onBack: () => void; onDone: () => void; run: Run; busy: boolean }) {
  const { me } = useSession();
  const [file, setFile] = useState<File | null>(null);
  const [current, setCurrent] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    api<{ photoUrl: string | null }>("GET", "/me/photo").then((r) => setCurrent(r.photoUrl), () => setCurrent(null));
  }, []);
  return (
    <div className="flex flex-col gap-4">
      <StepHeader title="Profile photo" onBack={onBack} />
      <Card className="flex flex-col items-center gap-3 text-center">
        {current ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current} alt="Your profile photo" className="h-32 w-32 rounded-full object-cover" />
        ) : (
          <span className="flex h-32 w-32 items-center justify-center rounded-full bg-ink text-4xl font-extrabold text-white">{(me?.user.name ?? "R").split(" ").map((x) => x[0]).slice(0, 2).join("")}</span>
        )}
        <p className="text-sm text-muted">{current ? "This is the photo riders see." : "No photo yet."}</p>
      </Card>
      <Card className="flex flex-col gap-2">
        <p className="text-xs font-extrabold uppercase tracking-[2px] text-muted">A good photo</p>
        <ul className="flex flex-col gap-1.5 text-sm text-muted">{GOOD_PHOTO.map((t) => <li key={t}>• {t}</li>)}</ul>
      </Card>
      <Card className="flex flex-col gap-3">
        <PhotoPicker label={current ? "Replace your photo" : "Your photo"} file={file} onFile={setFile} selfie />
        <Button loading={busy} disabled={!file} className="h-12" onClick={async () => {
          if (!file) return;
          const f = new FormData();
          f.append("file", file);
          const r = await run(() => api("POST", "/me/photo/file", f));
          if (r) onDone();
        }}>Save my photo</Button>
      </Card>
    </div>
  );
}

/** Step 2: licence number, end date, date of birth, what it covers, and both sides. */
function LicenceStep({ p, ensure, busy, run, onBack, onDone }: { p: DriverProfile | null; ensure: () => Promise<DriverProfile>; busy: boolean; run: Run; onBack: () => void; onDone: () => void }) {
  const doc = p?.documents.find((d) => d.kind === "DRIVING_LICENSE");
  const [replace, setReplace] = useState(false);
  const [number, setNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [dob, setDob] = useState(p?.details.dateOfBirth ?? "");
  const [cls, setCls] = useState<string>(p?.details.licenseClass ?? "");
  const [front, setFront] = useState<File | null>(null);
  const [rear, setRear] = useState<File | null>(null);
  const [err, setErr] = useState<string>();
  const showForm = !doc || doc.status === "REJECTED" || doc.expired || !doc.hasBack || replace;
  const classes: [string, string][] = [["LMV", "Car (LMV)"], ["MCWG", "Bike with gear (MCWG)"], ["MCWOG", "Scooter without gear (MCWOG)"], ["LMV_MCWG", "Car and bike with gear"]];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(undefined);
    if (number.trim().length < 4) return setErr("Enter your licence number as printed.");
    if (!expiry || expiry <= today()) return setErr("Enter an end date in the future.");
    if (!dob) return setErr("Enter your date of birth.");
    if (ageOn(dob) < MIN_DRIVER_AGE) return setErr(`You must be at least ${MIN_DRIVER_AGE} to drive.`);
    if (!cls) return setErr("Choose what your licence covers.");
    if (!front || !rear) return setErr("Add a photo of both the front and the back of your licence.");
    const big = bigFile(front) ?? bigFile(rear);
    if (big) return setErr(big);
    const ok = await run(async () => {
      const base = await ensure();
      await api(base.id ? "PATCH" : "POST", "/driver/profile", { details: { dateOfBirth: dob, licenseClass: cls } });
      return sendDocument({ kind: "DRIVING_LICENSE", number: number.trim(), expiresAt: expiry }, front, rear);
    });
    if (ok) onDone();
  }

  return (
    <div className="flex flex-col gap-4">
      <StepHeader title="Driving licence" onBack={onBack} />
      {doc && !showForm && (
        <Card className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1"><p className="text-sm">No. <b>{doc.number}</b> · valid till {doc.expiresAt} · both sides</p></div>
          <Badge tone={doc.status === "APPROVED" ? "success" : "neutral"}>{doc.status === "PENDING" ? "uploaded" : doc.status.toLowerCase()}</Badge>
          <Button variant="ghost" className="h-9" onClick={() => setReplace(true)}>Replace</Button>
        </Card>
      )}
      {doc?.status === "REJECTED" && doc.rejectReason && <Notice tone="error">HR: “{doc.rejectReason}”</Notice>}
      {showForm && (
        <Card>
          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <p className="text-xs font-extrabold uppercase tracking-[2px] text-muted">Your licence</p>
            <Input id="lic-no" label="Licence number" placeholder="KA0120190012345" value={number} onChange={(e) => setNumber(e.target.value.toUpperCase())} />
            <Input id="lic-exp" label="Valid till" type="date" min={today()} value={expiry} onChange={(e) => setExpiry(e.target.value)} />
            <div className="flex flex-col gap-1.5">
              <Input id="lic-dob" label="Your date of birth" type="date" max={today()} value={dob} onChange={(e) => setDob(e.target.value)} />
              <p className="text-xs text-muted">Needed to check the licence. HR sees your age, never your date of birth.</p>
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-sm font-bold">What your licence covers</p>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Licence class">
                {classes.map(([v, label]) => <button key={v} type="button" aria-pressed={cls === v} onClick={() => setCls(v)} className={pill(cls === v)}>{label}</button>)}
              </div>
            </div>
            <PhotoPicker label="Front side" hint="All four corners visible, no glare, text readable." file={front} onFile={setFront} allowPdf />
            <PhotoPicker label="Back side" file={rear} onFile={setRear} allowPdf />
            <p className="text-xs text-muted">Tip: upload the licence first. It makes checking your other papers quicker.</p>
            {err && <p role="alert" className="text-sm font-semibold text-danger">{err}</p>}
            <div className="flex gap-2">
              <Button type="submit" loading={busy} className="h-12 flex-1">Upload licence</Button>
              {replace && <Button type="button" variant="ghost" className="h-12" onClick={() => setReplace(false)}>Cancel</Button>}
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}

/** Step 3: the vehicle. */
export function VehicleStep({ p, vehicle, busy, onSave, onBack, asDefault = true, onCancel }: { p: DriverProfile | null; vehicle?: VehicleRow; busy: boolean; onSave: (v: object) => Promise<void>; onBack?: () => void; asDefault?: boolean; onCancel?: () => void }) {
  const [editing, setEditing] = useState(!vehicle);
  const [v, setV] = useState({
    type: (vehicle?.type ?? "CAR") as "CAR" | "BIKE",
    carType: (vehicle?.carType ?? "") as "" | "HATCHBACK" | "SEDAN" | "SUV",
    make: vehicle?.make ?? "",
    model: vehicle?.model ?? "",
    color: vehicle?.color ?? "",
    plateNumber: vehicle?.plateNumber ?? "",
    seatCapacity: vehicle?.seatCapacity ?? 3,
    manufactureYear: vehicle?.manufactureYear ? String(vehicle.manufactureYear) : "",
    fuelType: vehicle?.fuelType ?? "",
    hasAc: vehicle?.hasAc ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const licence = p?.details.licenseClass;
  const classOk = !licence || (LICENSE_ALLOWS[v.type] as readonly string[]).includes(licence);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (v.make.trim().length < 2) er.make = "Enter the make, like Honda";
    if (!v.model.trim()) er.model = "Enter the model, like City";
    if (v.color.trim().length < 3) er.color = "Enter the colour, like White";
    if (!/^[A-Za-z]{2} ?\d{2} ?[A-Za-z]{1,3} ?\d{4}$/.test(v.plateNumber.trim()) && !/^\d{2} ?BH ?\d{4} ?[A-Za-z]{1,2}$/i.test(v.plateNumber.trim())) er.plate = "Use a plate like KA 01 AB 1234";
    const y = v.manufactureYear ? Number(v.manufactureYear) : null;
    if (y !== null && (y < 1990 || y > thisYear + 1)) er.year = `Enter a year from 1990 to ${thisYear + 1}`;
    setErrors(er);
    if (Object.keys(er).length) return;
    void onSave({
      type: v.type, carType: v.type === "CAR" && v.carType ? v.carType : undefined, make: v.make.trim(), model: v.model.trim(), color: v.color.trim(),
      plateNumber: v.plateNumber.trim(), seatCapacity: v.type === "BIKE" ? 1 : v.seatCapacity, hasAc: v.hasAc, isDefault: vehicle ? vehicle.isDefault : asDefault,
      manufactureYear: y ?? undefined, fuelType: v.fuelType || undefined,
    });
  }

  if (vehicle && !editing)
    return (
      <div className="flex flex-col gap-4">
        {onBack && <StepHeader title="Vehicle details" onBack={onBack} />}
        <Card className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-extrabold">Your vehicle</h2>
            <Button variant="ghost" className="h-9" onClick={() => setEditing(true)}>Edit</Button>
          </div>
          <p className="text-sm">{vehicle.color} {vehicle.make} {vehicle.model}{vehicle.manufactureYear ? ` · ${vehicle.manufactureYear}` : ""} · <Plate plate={vehicle.plateNumber} /> · {vehicle.type === "CAR" ? `${vehicle.seatCapacity} passenger seats` : "bike"}{vehicle.fuelType ? ` · ${FUEL_LABEL[vehicle.fuelType as keyof typeof FUEL_LABEL] ?? vehicle.fuelType}` : ""}{vehicle.hasAc ? " · AC" : ""}</p>
          <p className="text-xs text-muted">Changing the number plate means the vehicle is checked again.</p>
        </Card>
        {onBack && <Button variant="ghost" className="h-12" onClick={onBack}>Back to checklist</Button>}
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      {onBack && <StepHeader title="Vehicle details" onBack={onBack} />}
      <Card>
        <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
          <p className="text-sm text-muted">Enter the vehicle exactly as on the registration certificate (RC).</p>
          <div className="flex gap-2" role="group" aria-label="Vehicle type">
            {(["CAR", "BIKE"] as const).map((t) => <button key={t} type="button" aria-pressed={v.type === t} onClick={() => setV({ ...v, type: t })} className={`h-11 rounded-full border-[1.5px] px-6 text-sm font-extrabold ${v.type === t ? "border-ink bg-ink text-white" : "border-line-strong bg-white"}`}>{t === "CAR" ? "Car" : "Bike"}</button>)}
          </div>
          {v.type === "CAR" && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Car type">
              {([["HATCHBACK", "Hatchback"], ["SEDAN", "Sedan"], ["SUV", "SUV"]] as const).map(([k, label]) => <button key={k} type="button" aria-pressed={v.carType === k} onClick={() => setV({ ...v, carType: v.carType === k ? "" : k })} className={pill(v.carType === k)}>{label}</button>)}
            </div>
          )}
          {!classOk && <Notice tone="error">Your licence ({LICENSE_CLASS_LABEL[licence as LicenseClass]}) does not cover a {v.type === "CAR" ? "car" : "bike"}. Change it in the licence step, or pick the other vehicle type.</Notice>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Input id="v-make" label="Make" placeholder="Honda" value={v.make} onChange={(e) => setV({ ...v, make: e.target.value })} error={errors.make} />
            <Input id="v-model" label="Model" placeholder="City" value={v.model} onChange={(e) => setV({ ...v, model: e.target.value })} error={errors.model} />
            <Input id="v-color" label="Colour" placeholder="White" value={v.color} onChange={(e) => setV({ ...v, color: e.target.value })} error={errors.color} />
            <Input id="v-plate" label="Number plate" placeholder="KA 01 AB 1234" value={v.plateNumber} onChange={(e) => setV({ ...v, plateNumber: e.target.value.toUpperCase() })} error={errors.plate} />
            <Input id="v-year" label="Year made (optional)" inputMode="numeric" placeholder="2021" maxLength={4} value={v.manufactureYear} onChange={(e) => setV({ ...v, manufactureYear: e.target.value.replace(/\D/g, "") })} error={errors.year} />
            <Select id="v-fuel" label="Fuel (optional)" value={v.fuelType} onChange={(e) => setV({ ...v, fuelType: e.target.value })}>
              <option value="">Not set</option>
              {FUEL_TYPES.map((f) => <option key={f} value={f}>{FUEL_LABEL[f]}</option>)}
            </Select>
          </div>
          {v.type === "CAR" && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-extrabold uppercase tracking-[2px] text-muted">Passenger seats</p>
              <div className="grid grid-cols-6 gap-2" role="group" aria-label="Passenger seats">
                {[1, 2, 3, 4, 5, 6].map((n) => <button key={n} type="button" aria-pressed={v.seatCapacity === n} onClick={() => setV({ ...v, seatCapacity: n })} className={`h-12 rounded-2xl border-[1.5px] text-base font-extrabold ${v.seatCapacity === n ? "border-ink bg-ink text-white" : "border-line-strong bg-white"}`}>{n}</button>)}
              </div>
            </div>
          )}
          <Toggle label="Air conditioning" checked={v.hasAc} onChange={(x) => setV({ ...v, hasAc: x })} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={busy} disabled={!classOk} className="h-12 flex-1">Save vehicle</Button>
            {vehicle ? <Button type="button" variant="ghost" className="h-12" onClick={() => setEditing(false)}>Cancel</Button> : onCancel ? <Button type="button" variant="ghost" className="h-12" onClick={onCancel}>Cancel</Button> : null}
          </div>
        </form>
      </Card>
    </div>
  );
}

/** Step 7: the safety guidelines, then agree. */
function GuidelinesStep({ p, ensure, busy, run, onBack, onDone }: { p: DriverProfile | null; ensure: () => Promise<DriverProfile>; busy: boolean; run: Run; onBack: () => void; onDone: () => void }) {
  const [agree, setAgree] = useState(false);
  const already = !!p?.readiness.guidelines;
  return (
    <div className="flex flex-col gap-4">
      <StepHeader title="Safety and guidelines" onBack={onBack} />
      <ol className="flex flex-col gap-3">
        {DRIVER_GUIDELINES.map((g, i) => (
          <li key={g.title}>
            <Card className="flex items-start gap-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-extrabold text-lime">{i + 1}</span>
              <span><span className="block font-extrabold">{g.title}</span><span className="text-sm text-muted">{g.text}</span></span>
            </Card>
          </li>
        ))}
      </ol>
      <Link href="/terms" target="_blank" className="text-sm font-extrabold underline">Read the full terms of use</Link>
      {already ? (
        <Notice tone="ok">You agreed to the driver guidelines.</Notice>
      ) : (
        <>
          <label className="flex items-start gap-3 rounded-2xl bg-white p-4 text-sm shadow-soft">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#0B1426]" />
            <span>I have read the safety basics and agree to follow the RYDO driver guidelines.</span>
          </label>
          <Button className="h-12" loading={busy} disabled={!agree} onClick={async () => {
            const r = await run(async () => { await ensure(); return api("POST", "/driver/guidelines", { agree: true }); });
            if (r) onDone();
          }}>I agree</Button>
        </>
      )}
    </div>
  );
}

/** After sending: the vehicle is verified and HR has been asked. Shows progress and what was checked. */
function WithHr({ p, vehicle, reload, run, msg, busy }: { p: DriverProfile; vehicle?: VehicleRow; reload: () => Promise<unknown>; run: Run; msg: Msg; busy: boolean }) {
  const asked = p.status === "REJECTED";
  const rejected = p.documents.filter((d) => d.status === "REJECTED");
  return (
    <div className="flex flex-col gap-4">
      <Tracker p={p} failed={false} />
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-extrabold">{asked ? "HR asked you to upload again" : "Your vehicle is verified. HR is reviewing."}</h2>
          <Badge tone={asked ? "warning" : "success"}>{asked ? "action needed" : "with your company HR"}</Badge>
        </div>
        <p className="text-sm text-muted">{asked ? "Upload the papers below again. We check your vehicle again and HR looks at them." : "You do not need to do anything. We will email you when HR decides. You can still renew a paper if you need to."}</p>
      </Card>
      {vehicle && rejected.filter((d) => d.kind === "VEHICLE_RC" || d.kind === "INSURANCE").map((d) => (
        <PaperCard key={d.id} kind={d.kind as "VEHICLE_RC" | "INSURANCE"} title={d.kind === "VEHICLE_RC" ? "Registration certificate (RC)" : "Vehicle insurance"} hint="HR asked for a new copy." vehicleId={vehicle.id} doc={d} back={d.kind === "VEHICLE_RC" ? "optional" : "none"} reload={reload} run={run} busy={busy} />
      ))}
      {vehicle?.checkResults && (
        <Card className="flex flex-col gap-3">
          <h3 className="font-extrabold">What we checked on {vehicle.plateNumber}</h3>
          <CheckList checks={vehicle.checkResults} />
        </Card>
      )}
    </div>
  );
}

export function DriverApplicationSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-20" />
      <Skeleton className="h-40" />
    </div>
  );
}
