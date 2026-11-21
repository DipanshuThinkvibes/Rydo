"use client";

import { useCallback, useEffect, useState } from "react";
import { MAX_SAVED_PLACES, SAVED_PLACE_LABELS, type Place, type SavedPlace } from "@rydo/shared";
import { api, RequestError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Badge, Button, Card, EmptyState, Input, Notice, PageHeader, Skeleton } from "@/components/ui";
import { Icon } from "@/components/icons";
import { PlaceField, useOffices } from "@/components/trip-bits";

const KIND: Record<(typeof SAVED_PLACE_LABELS)[number], string> = { HOME: "Home", OFFICE: "Office", OTHER: "Other" };

/** Saved addresses: home, office and others. The default home and office are used for ride search and the commute planner. */
export default function PlacesPage() {
  const { org } = useSession();
  const offices = useOffices();
  const [places, setPlaces] = useState<SavedPlace[] | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string }>();
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<(typeof SAVED_PLACE_LABELS)[number]>("HOME");
  const [name, setName] = useState("");
  const [spot, setSpot] = useState<Place | null>(null);

  const load = useCallback(() => api<SavedPlace[]>("GET", "/me/places").then(setPlaces), []);
  useEffect(() => {
    if (org) load().catch(() => setMsg({ tone: "error", text: "Could not load your addresses." }));
  }, [org, load]);

  async function run(key: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(key);
    setMsg(undefined);
    try {
      await fn();
      await load();
      setMsg({ tone: "ok", text: ok });
      return true;
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof RequestError ? (e.fields ? Object.values(e.fields)[0] : e.message) : "That did not work. Try again." });
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!spot) return setMsg({ tone: "error", text: "Search and pick the address first." });
    const ok = await run("add", () => api("POST", "/me/places", { label: kind, name: name.trim() || KIND[kind], address: spot.label, lat: spot.lat, lng: spot.lng }), "Address saved.");
    if (ok) { setAdding(false); setName(""); setSpot(null); }
  }

  if (!org) return <p className="text-muted">Choose a company first.</p>;

  return (
    <section className="flex max-w-3xl flex-col gap-5">
      <PageHeader title="Saved places" sub="Save your home, office and other addresses once. Your default home and office fill in when you search for a ride or plan your week." action={!adding && <Button onClick={() => setAdding(true)} disabled={(places?.length ?? 0) >= MAX_SAVED_PLACES}><Icon name="plus" size={16} /> Add address</Button>} />
      {msg && <Notice tone={msg.tone} onClose={() => setMsg(undefined)}>{msg.text}</Notice>}

      {adding && (
        <Card>
          <form onSubmit={add} className="flex flex-col gap-4" noValidate>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Kind of address">
              {SAVED_PLACE_LABELS.map((k) => (
                <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={`h-11 rounded-full border-[1.5px] px-5 text-sm font-extrabold ${kind === k ? "border-ink bg-ink text-white" : "border-line-strong bg-white"}`}>{KIND[k]}</button>
              ))}
            </div>
            <Input id="pl-name" label="Name" placeholder={kind === "OTHER" ? "Mom's place" : KIND[kind]} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
            <PlaceField label="Address" value={spot} onChange={setSpot} offices={offices} allowLocate />
            <div className="flex gap-2">
              <Button type="submit" loading={busy === "add"} className="h-12 flex-1">Save address</Button>
              <Button type="button" variant="ghost" className="h-12" onClick={() => { setAdding(false); setSpot(null); }}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      {places === null ? (
        <div className="flex flex-col gap-3"><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
      ) : places.length === 0 ? (
        <EmptyState icon="locate" title="No saved addresses yet">Add your home and office to search for rides faster.</EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {places.map((p) => (
            <li key={p.id} className="flex animate-rise flex-wrap items-center gap-3 rounded-[22px] bg-white p-4 shadow-soft">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-2"><Icon name={p.label === "OFFICE" ? "building" : "locate"} size={19} /></span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2 font-extrabold">{p.name} <Badge tone="neutral">{KIND[p.label]}</Badge>{p.isDefault && <Badge tone="lime">default {KIND[p.label].toLowerCase()}</Badge>}</span>
                <span className="block truncate text-sm text-muted">{p.address}</span>
              </span>
              {!p.isDefault && <Button variant="ghost" className="h-9" loading={busy === `d${p.id}`} disabled={!!busy} onClick={() => run(`d${p.id}`, () => api("POST", `/me/places/${p.id}/default`), `${p.name} is now your default ${KIND[p.label].toLowerCase()}.`)}>Make default</Button>}
              <button type="button" aria-label={`Delete ${p.name}`} disabled={!!busy} onClick={() => { if (confirm(`Delete ${p.name}?`)) void run(`x${p.id}`, () => api("DELETE", `/me/places/${p.id}`), "Address deleted."); }} className="flex h-9 w-9 items-center justify-center rounded-xl text-muted hover:bg-surface hover:text-danger"><Icon name="x" size={17} /></button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
