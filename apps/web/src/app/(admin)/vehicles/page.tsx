"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { FUEL_LABEL } from "@rydo/shared";
import { api, RequestError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Badge, Button, Card, EmptyState, Notice, PageHeader, Skeleton } from "@/components/ui";
import { Icon } from "@/components/icons";
import { Plate } from "@/components/trip-bits";
import { CheckList, PaperCard, VehicleStep, type Check, type DriverProfile, type VehicleRow } from "@/components/driver-application";

type Msg = { tone: "ok" | "error"; text: string } | undefined;
const TONE = { VERIFIED: "success", PENDING: "warning", REJECTED: "warning", EXPIRED: "warning" } as const;
const LABEL = { VERIFIED: "vehicle verified", PENDING: "not checked yet", REJECTED: "needs fixes", EXPIRED: "papers expired" } as const;

/** A driver's vehicles: each is checked (plate, RC, insurance) before it can be used for a ride. */
export default function VehiclesPage() {
  const { org } = useSession();
  const [p, setP] = useState<DriverProfile | null | undefined>(undefined);
  const [msg, setMsg] = useState<Msg>();
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => api<DriverProfile | null>("GET", "/driver/profile").then(setP, () => setP(null)), []);
  useEffect(() => {
    if (org) api<DriverProfile | null>("GET", "/driver/profile").then(setP, () => setP(null));
  }, [org]);

  async function run<T>(key: string, fn: () => Promise<T>, ok?: string): Promise<T | null> {
    setBusy(key);
    setMsg(undefined);
    try {
      const r = await fn();
      if (ok) setMsg({ tone: "ok", text: ok });
      return r;
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof RequestError ? (e.fields ? Object.values(e.fields)[0] : e.message) : "That did not work. Try again." });
      return null;
    } finally {
      setBusy(null);
    }
  }
  const runPaper = async <T,>(fn: () => Promise<T>, ok?: string) => run("paper", fn, ok);

  async function check(v: VehicleRow) {
    const r = await run(v.id, () => api<{ passed: boolean; vehiclePassed: boolean; checks: Check[]; profile: DriverProfile }>("POST", `/driver/vehicles/${v.id}/check`));
    if (!r) return;
    setP(r.profile);
    setMsg(r.vehiclePassed ? { tone: "ok", text: `${v.plateNumber} passed the vehicle check. You can use it for rides.` } : { tone: "error", text: `${v.plateNumber} did not pass. See what to fix below.` });
  }

  if (!org || p === undefined) return <div className="flex max-w-4xl flex-col gap-3"><Skeleton className="h-12 w-48" /><Skeleton className="h-40" /></div>;

  if (!p || p.status !== "VERIFIED")
    return (
      <section className="flex max-w-3xl flex-col gap-5">
        <PageHeader title="Vehicles" sub="Your vehicles and their checks." />
        <EmptyState icon="car" title="Become a driver first">
          Vehicles are checked as part of your driver application. <Link href="/drive" className="font-extrabold text-ink underline">Open Drive</Link> to apply.
        </EmptyState>
      </section>
    );

  return (
    <section className="flex max-w-4xl flex-col gap-5">
      <PageHeader title="Vehicles" sub="Each vehicle is checked before you can use it for a ride: number plate, registration (RC) and insurance." action={!adding && <Button onClick={() => setAdding(true)}><Icon name="plus" size={16} /> Add a vehicle</Button>} />
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      {adding && (
        <VehicleStep p={p} busy={busy === "add"} asDefault={false} onCancel={() => setAdding(false)} onSave={async (v) => {
          const r = await run("add", () => api<DriverProfile>("POST", "/driver/vehicles", v), "Vehicle added. Upload its RC and insurance, then run the check.");
          if (r) { setP(r); setAdding(false); }
        }} />
      )}

      <ul className="flex flex-col gap-4">
        {p.vehicles.map((v) => {
          const rc = p.documents.find((d) => d.kind === "VEHICLE_RC" && d.vehicleId === v.id);
          const ins = p.documents.find((d) => d.kind === "INSURANCE" && d.vehicleId === v.id);
          return (
            <li key={v.id}>
              <Card className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-surface-2"><Icon name={v.type === "CAR" ? "car" : "route"} size={20} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="font-extrabold">{v.color} {v.make} {v.model}{v.manufactureYear ? ` · ${v.manufactureYear}` : ""} {v.isDefault && p.vehicles.length > 1 && <span className="ml-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs">default</span>}</p>
                    <p className="text-sm text-muted"><Plate plate={v.plateNumber} /> · {v.type === "CAR" ? `${v.seatCapacity} passenger seats` : "bike"}{v.fuelType ? ` · ${FUEL_LABEL[v.fuelType as keyof typeof FUEL_LABEL] ?? v.fuelType}` : ""}{v.hasAc ? " · AC" : ""}</p>
                  </div>
                  <Badge tone={TONE[v.checkStatus]}>{LABEL[v.checkStatus]}</Badge>
                  <Button variant={v.checkStatus === "VERIFIED" ? "ghost" : "primary"} className="h-9" loading={busy === v.id} onClick={() => check(v)}>{v.checkStatus === "VERIFIED" ? "Check again" : "Run vehicle check"}</Button>
                </div>

                {v.checkStatus !== "VERIFIED" && <p className="rounded-2xl bg-warning-bg p-3 text-sm font-bold text-warning">This vehicle cannot be used for rides until it passes the check.</p>}

                <div className="grid gap-3 2xl:grid-cols-2">
                  <PaperCard kind="VEHICLE_RC" title="Registration certificate (RC)" hint={`Must match the plate, ${v.plateNumber}.`} vehicleId={v.id} doc={rc} reload={load} run={runPaper} busy={busy === "paper"} />
                  <PaperCard kind="INSURANCE" title="Vehicle insurance" hint="Policy number. Must still be in date." vehicleId={v.id} doc={ins} reload={load} run={runPaper} busy={busy === "paper"} />
                </div>

                {v.checkResults && v.checkResults.length > 0 && (
                  <details className="rounded-2xl bg-surface p-3">
                    <summary className="cursor-pointer text-sm font-extrabold">{v.checkResults.filter((c) => !c.passed).length ? `${v.checkResults.filter((c) => !c.passed).length} to fix` : "All checks passed"} · see the {v.checkResults.length} checks</summary>
                    <div className="mt-3"><CheckList checks={[...v.checkResults].sort((a, b) => Number(a.passed) - Number(b.passed))} /></div>
                  </details>
                )}
              </Card>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
