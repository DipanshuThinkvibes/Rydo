"use client";

import { useCallback, useEffect, useState } from "react";
import { api, RequestError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Badge, Button, Notice, PageHeader } from "@/components/ui";

interface Vehicle {
  id: string;
  type: "CAR" | "BIKE";
  make: string;
  model: string;
  color: string;
  plateNumber: string;
  seatCapacity: number;
  hasAc: boolean;
  isDefault: boolean;
}
interface Doc {
  id: string;
  kind: "DRIVING_LICENSE" | "VEHICLE_RC";
  number: string | null;
  vehicleId: string | null;
  expiresAt: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  rejectReason: string | null;
  expired: boolean;
  expiringSoon: boolean;
}
interface Driver {
  id: string;
  name: string;
  email: string;
  department: string | null;
  status: "PENDING" | "VERIFIED" | "REJECTED" | "EXPIRED";
  needsReview: boolean;
  hasExpiryWarning: boolean;
  vehicles: Vehicle[];
  documents: Doc[];
}

const tabs = [
  { key: "PENDING", label: "Needs review" },
  { key: "VERIFIED", label: "Verified" },
  { key: "REJECTED", label: "Waiting for re-upload" },
  { key: "", label: "All drivers" },
] as const;
const statusTone = { PENDING: "warning", VERIFIED: "success", REJECTED: "neutral", EXPIRED: "neutral" } as const;
const statusLabel = { PENDING: "waiting for review", VERIFIED: "verified", REJECTED: "re-upload asked", EXPIRED: "expired" };
const kindLabel = { DRIVING_LICENSE: "Driving license", VEHICLE_RC: "Vehicle RC" };

export default function DriversPage() {
  const { org, can } = useSession();
  const [tab, setTab] = useState<(typeof tabs)[number]["key"]>("PENDING");
  const [rows, setRows] = useState<Driver[] | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string }>();
  const [busyId, setBusyId] = useState<string>();

  const fetchRows = useCallback(() => api<Driver[]>("GET", `/admin/drivers${tab ? `?status=${tab}` : ""}`), [tab]);
  const failed = useCallback((e: unknown) => setMsg({ tone: "error", text: e instanceof RequestError ? e.message : "Could not load drivers." }), []);
  useEffect(() => {
    if (org) fetchRows().then(setRows, failed);
  }, [org, fetchRows, failed]);

  async function act(id: string, fn: () => Promise<unknown>, ok: string) {
    setBusyId(id);
    setMsg(undefined);
    try {
      await fn();
      setRows(await fetchRows());
      setMsg({ tone: "ok", text: ok });
      return true;
    } catch (e) {
      failed(e);
      return false;
    } finally {
      setBusyId(undefined);
    }
  }

  /** Opens the document in a new tab through a link that works for 2 minutes. */
  async function view(doc: Doc) {
    const win = window.open("", "_blank");
    try {
      const { url } = await api<{ url: string }>("GET", `/admin/documents/${doc.id}/view-url`);
      if (win) win.location.href = url;
      else window.location.href = url;
    } catch (e) {
      win?.close();
      failed(e);
    }
  }

  if (!org) return <p className="text-muted">Choose a company first.</p>;
  if (!can("ORG_ADMIN", "HR_ADMIN")) return <p className="text-muted">Only HR and Org Admins review drivers.</p>;

  return (
    <section className="flex max-w-4xl flex-col gap-5">
      <PageHeader title="Drivers" sub="Check each driver's license and vehicle RC before they can offer rides. Every document you open is logged." />
      <div role="group" aria-label="Filter" className="flex w-fit flex-wrap gap-1 rounded-2xl bg-surface-2 p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            aria-pressed={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`min-h-10 rounded-xl px-4 text-sm font-extrabold ${tab === t.key ? "bg-white shadow-sm" : "text-muted"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {rows === null ? (
        <p className="text-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-[18px] border-[1.5px] border-dashed border-line-strong p-8 text-center text-muted">
          {tab === "PENDING" ? "Nothing to review. New driver documents will appear here." : "No drivers here."}
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((d) => (
            <DriverCard key={d.id} driver={d} busy={busyId === d.id} onView={view} act={(fn, ok) => act(d.id, fn, ok)} />
          ))}
        </ul>
      )}
    </section>
  );
}

function DriverCard({ driver: d, busy, onView, act }: { driver: Driver; busy: boolean; onView: (doc: Doc) => void; act: (fn: () => Promise<unknown>, ok: string) => Promise<boolean> }) {
  const [asking, setAsking] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const plate = (id: string | null) => d.vehicles.find((v) => v.id === id)?.plateNumber;

  return (
    <li className="flex flex-col gap-4 rounded-[18px] border border-line bg-white p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#FFEDD5] font-extrabold text-[#9A3412]">
          {d.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-extrabold">{d.name}</span>
          <span className="truncate text-sm text-muted">
            {d.email}
            {d.department ? ` · ${d.department}` : ""}
          </span>
        </span>
        {d.hasExpiryWarning && <Badge tone="warning">document expiring</Badge>}
        <Badge tone={statusTone[d.status]}>{statusLabel[d.status]}</Badge>
      </div>

      {d.vehicles.map((v) => (
        <p key={v.id} className="rounded-2xl bg-surface px-4 py-3 text-sm">
          <span className="font-extrabold">{v.plateNumber}</span> · {v.color} {v.make} {v.model} · {v.type === "CAR" ? `${v.seatCapacity} seats` : "bike"}
          {v.hasAc ? " · AC" : ""}
          {v.isDefault && d.vehicles.length > 1 ? " · default" : ""}
        </p>
      ))}

      <table className="w-full text-left text-sm">
        <caption className="sr-only">Documents of {d.name}</caption>
        <thead className="text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="py-2 font-extrabold">Document</th>
            <th className="py-2 font-extrabold">Number</th>
            <th className="py-2 font-extrabold">Valid till</th>
            <th className="py-2 font-extrabold">Status</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {d.documents.length === 0 && (
            <tr>
              <td colSpan={5} className="py-3 text-muted">No documents uploaded yet.</td>
            </tr>
          )}
          {d.documents.map((doc) => (
            <tr key={doc.id}>
              <td className="py-3 font-bold">
                {kindLabel[doc.kind]}
                {doc.kind === "VEHICLE_RC" && plate(doc.vehicleId) ? <span className="block text-xs font-semibold text-muted">{plate(doc.vehicleId)}</span> : null}
              </td>
              <td className="py-3">{doc.number}</td>
              <td className="py-3">
                {doc.expiresAt}
                {doc.expired && <span className="ml-2 font-extrabold text-danger">expired</span>}
                {doc.expiringSoon && <span className="ml-2 font-extrabold text-warning">expires soon</span>}
              </td>
              <td className="py-3">
                <Badge tone={doc.status === "APPROVED" ? "success" : doc.status === "PENDING" ? "warning" : "neutral"}>{doc.status.toLowerCase()}</Badge>
                {doc.rejectReason && doc.status === "REJECTED" && <span className="block text-xs text-muted">“{doc.rejectReason}”</span>}
              </td>
              <td className="py-3 text-right">
                <Button variant="ghost" className="h-9" onClick={() => onView(doc)}>View</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {asking ? (
        <form
          className="flex flex-col gap-3 rounded-2xl bg-surface p-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await act(() => api("POST", `/admin/drivers/${d.id}/request-reupload`, { documentIds: picked, reason }), `Asked ${d.name} to re-upload.`)) setAsking(false);
          }}
        >
          <fieldset className="flex flex-wrap gap-2">
            <legend className="mb-2 text-sm font-bold">Which documents need a new upload?</legend>
            {d.documents.map((doc) => (
              <label key={doc.id} className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-full border-[1.5px] px-3 text-sm font-bold ${picked.includes(doc.id) ? "border-ink bg-ink text-white" : "border-line-strong bg-white"}`}>
                <input type="checkbox" className="sr-only" checked={picked.includes(doc.id)} onChange={() => setPicked((p) => (p.includes(doc.id) ? p.filter((x) => x !== doc.id) : [...p, doc.id]))} />
                {kindLabel[doc.kind]}
              </label>
            ))}
          </fieldset>
          <label htmlFor={`reason-${d.id}`} className="text-sm font-bold">Reason (the driver sees this)</label>
          <textarea id={`reason-${d.id}`} required minLength={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. The photo is blurry, the number isn't readable" className="min-h-20 rounded-2xl border-[1.5px] border-line-strong bg-white p-3 text-sm font-semibold outline-none focus:border-ink" />
          <span className="flex gap-2">
            <Button type="submit" disabled={busy || picked.length === 0}>Send request</Button>
            <Button type="button" variant="ghost" onClick={() => setAsking(false)}>Cancel</Button>
          </span>
        </form>
      ) : (
        d.documents.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {d.needsReview && (
              <Button disabled={busy} onClick={() => act(() => api("POST", `/admin/drivers/${d.id}/verify`), `${d.name} is now a verified driver.`)}>
                Verify driver
              </Button>
            )}
            <Button variant="ghost" disabled={busy} onClick={() => { setPicked([]); setReason(""); setAsking(true); }}>
              Ask to re-upload
            </Button>
          </div>
        )
      )}
    </li>
  );
}