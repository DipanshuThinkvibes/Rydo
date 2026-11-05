"use client";

import { useCallback, useEffect, useState } from "react";
import { api, RequestError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Badge, Button, Card, Input, Notice, PageHeader } from "@/components/ui";
import { PlaceSearch } from "@/components/place-search";

interface Office {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  isDefault: boolean;
}
interface Department {
  id: string;
  name: string;
  members: number;
}

const emptyOffice = { name: "", address: "", coords: "", isDefault: false };
const fmt = (lat: number, lng: number) => `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

export default function StructurePage() {
  const { org, can } = useSession();
  const editOffices = can("ORG_ADMIN");
  const editDepts = can("ORG_ADMIN", "HR_ADMIN");
  const [offices, setOffices] = useState<Office[]>();
  const [departments, setDepartments] = useState<Department[]>();
  const [office, setOffice] = useState(emptyOffice);
  const [deptName, setDeptName] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string }>();
  const [fields, setFields] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string }>();
  const [busy, setBusy] = useState(false);

  const fetchAll = useCallback(() => Promise.all([api<Office[]>("GET", "/admin/offices"), api<Department[]>("GET", "/admin/departments")]), []);
  const show = useCallback(([o, d]: [Office[], Department[]]) => {
    setOffices(o);
    setDepartments(d);
  }, []);
  const load = useCallback(() => fetchAll().then(show), [fetchAll, show]);
  useEffect(() => {
    if (org) fetchAll().then(show, () => setMsg({ tone: "error", text: "Could not load offices and teams." }));
  }, [org, fetchAll, show]);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setFields({});
    setMsg(undefined);
    try {
      await fn();
      await load();
      setMsg({ tone: "ok", text: ok });
      return true;
    } catch (e) {
      if (e instanceof RequestError) {
        setFields(e.fields ?? {});
        setMsg({ tone: "error", text: e.message });
      }
      return false;
    } finally {
      setBusy(false);
    }
  }

  /** Accepts "12.9259, 77.6766" as copied from Google Maps (right-click on the map). */
  function parseCoords(s: string) {
    const m = s.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
    return m ? { lat: Number(m[1]), lng: Number(m[2]) } : null;
  }

  async function addOffice(e: React.FormEvent) {
    e.preventDefault();
    const c = parseCoords(office.coords);
    if (!c) {
      setFields({ coords: "Paste coordinates like 12.9259, 77.6766" });
      return;
    }
    if (await run(() => api("POST", "/admin/offices", { name: office.name, address: office.address, isDefault: office.isDefault, ...c }), "Office added.")) setOffice(emptyOffice);
  }

  if (!org) return <p className="text-muted">Choose a company first.</p>;

  return (
    <section className="flex max-w-4xl flex-col gap-6">
      <PageHeader title="Offices & teams" sub="Offices are where rides start or end. Departments group employees for reports and auto-accept." />
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      <Card className="flex flex-col gap-4">
        <h2 className="text-lg font-extrabold">Offices</h2>
        {offices === undefined ? (
          <p className="text-muted">Loading…</p>
        ) : offices.length === 0 ? (
          <p className="text-sm text-muted">No offices yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {offices.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-3 py-3">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-extrabold">
                    {o.name} {o.isDefault && <Badge tone="success">default</Badge>}
                  </span>
                  <span className="text-sm text-muted">
                    {o.address} ·{" "}
                    <a className="underline" href={`https://www.google.com/maps?q=${o.lat},${o.lng}`} target="_blank" rel="noreferrer">
                      {o.lat.toFixed(4)}, {o.lng.toFixed(4)}
                    </a>
                  </span>
                </span>
                {editOffices && !o.isDefault && (
                  <Button variant="ghost" disabled={busy} onClick={() => run(() => api("PATCH", `/admin/offices/${o.id}`, { name: o.name, address: o.address, lat: o.lat, lng: o.lng, isDefault: true }), `${o.name} is now the default office.`)}>
                    Make default
                  </Button>
                )}
                {editOffices && (
                  <Button variant="ghost" disabled={busy} onClick={() => confirm(`Delete ${o.name}?`) && run(() => api("DELETE", `/admin/offices/${o.id}`), "Office deleted.")}>
                    Delete
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {editOffices && (
          <form onSubmit={addOffice} className="grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
            <Input id="o-name" label="Office name" required value={office.name} onChange={(e) => setOffice({ ...office, name: e.target.value })} error={fields.name} />
            <Input id="o-address" label="Address" required value={office.address} onChange={(e) => setOffice({ ...office, address: e.target.value })} error={fields.address} />
            <div className="sm:col-span-2">
              <PlaceSearch
                key={office.coords ? "picked" : "empty"}
                label="Find the office on the map"
                placeholder="e.g. Embassy Tech Village, Bellandur"
                onPick={(p) => setOffice({ ...office, name: office.name || p.label, address: p.address, coords: fmt(p.lat, p.lng) })}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Input id="o-coords" label="Map point" required placeholder="Pick a search result, or paste 12.9259, 77.6766" value={office.coords} onChange={(e) => setOffice({ ...office, coords: e.target.value })} error={fields.coords ?? fields.lat ?? fields.lng} />
              {office.coords && parseCoords(office.coords) && (
                <a className="text-xs font-bold underline" href={`https://www.google.com/maps?q=${office.coords.replace(/\s/g, "")}`} target="_blank" rel="noreferrer">Check this point on Google Maps</a>
              )}
            </div>
            <label className="flex items-center gap-3 self-center text-sm font-bold">
              <input type="checkbox" className="h-5 w-5 accent-[#0B1426]" checked={office.isDefault} onChange={(e) => setOffice({ ...office, isDefault: e.target.checked })} />
              Default office
            </label>
            <Button type="submit" disabled={busy} className="self-start">Add office</Button>
          </form>
        )}
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-lg font-extrabold">Departments</h2>
        {departments === undefined ? (
          <p className="text-muted">Loading…</p>
        ) : departments.length === 0 ? (
          <p className="text-sm text-muted">No departments yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {departments.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 py-3">
                {renaming?.id === d.id ? (
                  <form
                    className="flex flex-1 gap-2"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (await run(() => api("PATCH", `/admin/departments/${d.id}`, { name: renaming.name }), "Department renamed.")) setRenaming(undefined);
                    }}
                  >
                    <label htmlFor={`rename-${d.id}`} className="sr-only">New name</label>
                    <input id={`rename-${d.id}`} autoFocus value={renaming.name} onChange={(e) => setRenaming({ id: d.id, name: e.target.value })} className="h-10 flex-1 rounded-xl border-[1.5px] border-line-strong px-3 text-sm font-semibold" />
                    <Button type="submit" disabled={busy}>Save</Button>
                    <Button type="button" variant="ghost" onClick={() => setRenaming(undefined)}>Cancel</Button>
                  </form>
                ) : (
                  <>
                    <span className="flex-1 font-extrabold">
                      {d.name} <span className="text-sm font-semibold text-muted">· {d.members} {d.members === 1 ? "person" : "people"}</span>
                    </span>
                    {editDepts && (
                      <>
                        <Button variant="ghost" onClick={() => setRenaming({ id: d.id, name: d.name })}>Rename</Button>
                        <Button variant="ghost" disabled={busy} onClick={() => confirm(`Delete ${d.name}? Its people will have no department.`) && run(() => api("DELETE", `/admin/departments/${d.id}`), "Department deleted.")}>
                          Delete
                        </Button>
                      </>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        {editDepts && (
          <form
            className="flex flex-wrap items-end gap-3 border-t border-line pt-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await run(() => api("POST", "/admin/departments", { name: deptName }), "Department added.")) setDeptName("");
            }}
          >
            <div className="flex-[1_1_240px]">
              <Input id="d-name" label="New department" required value={deptName} onChange={(e) => setDeptName(e.target.value)} error={fields.name} />
            </div>
            <Button type="submit" disabled={busy}>Add department</Button>
          </form>
        )}
      </Card>
    </section>
  );
}