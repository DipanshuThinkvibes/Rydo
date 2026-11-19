"use client";

import { useCallback, useEffect, useState } from "react";
import { MAX_EMERGENCY_CONTACTS } from "@rydo/shared";
import { api, RequestError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { fmtWhen } from "@/lib/format";
import { Badge, Button, Card, EmptyState, Input, Notice, PageHeader } from "@/components/ui";

interface Contact { id: string; name: string; phone: string; email: string | null; relation: string | null }
interface Block { membershipId: string; name: string; blockedAt: string }
interface Booking { id: string; status: string; ride: { id: string; departAt: string; status: string; from: string; to: string } }
type Msg = { tone: "ok" | "error"; text: string } | undefined;
const blank = { name: "", phone: "", email: "", relation: "" };

/** People to tell, people to avoid, and sharing a live trip. */
export default function SafetyPage() {
  const { org } = useSession();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<Msg>();
  const [shareMsg, setShareMsg] = useState<Msg>();
  const [ride, setRide] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const fetchAll = useCallback(() => Promise.all([api<Contact[]>("GET", "/me/emergency-contacts"), api<Block[]>("GET", "/me/blocks"), api<Booking[]>("GET", "/me/bookings").catch(() => [] as Booking[])]), []);
  const apply = useCallback(([c, b, bk]: [Contact[], Block[], Booking[]]) => {
    setContacts(c);
    setBlocks(b);
    const live = bk.filter((x) => ["CONFIRMED", "BOARDED"].includes(x.status) && ["SCHEDULED", "FULL", "IN_PROGRESS"].includes(x.ride.status));
    setBookings(live);
    setRide((r) => r || live[0]?.ride.id || "");
  }, []);
  const load = useCallback(() => fetchAll().then(apply), [fetchAll, apply]);
  useEffect(() => {
    if (org) fetchAll().then(apply, () => setMsg({ tone: "error", text: "Could not load your safety settings." }));
  }, [org, fetchAll, apply]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFields({});
    setMsg(undefined);
    const body = { name: form.name, phone: form.phone, email: form.email || undefined, relation: form.relation || undefined };
    try {
      if (editing) await api("PATCH", `/me/emergency-contacts/${editing}`, body);
      else await api("POST", "/me/emergency-contacts", body);
      setForm(blank);
      setEditing(null);
      await load();
    } catch (err) {
      if (err instanceof RequestError) {
        setFields(err.fields ?? {});
        setMsg({ tone: "error", text: err.message });
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await api("DELETE", `/me/emergency-contacts/${id}`);
    setPicked((p) => p.filter((x) => x !== id));
    load();
  }

  async function share() {
    setBusy(true);
    setShareMsg(undefined);
    try {
      const r = await api<{ sentTo: { name: string }[]; skippedNoEmail: { name: string }[] }>("POST", `/rides/${ride}/share/contacts`, { contactIds: picked });
      setShareMsg({ tone: "ok", text: `Live trip link emailed to ${r.sentTo.map((c) => c.name).join(", ")}.${r.skippedNoEmail.length ? ` No email for ${r.skippedNoEmail.map((c) => c.name).join(", ")}.` : ""}` });
    } catch (err) {
      setShareMsg({ tone: "error", text: err instanceof RequestError ? err.message : "Could not share the trip." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex max-w-3xl flex-col gap-6">
      <PageHeader title="Safety" sub="Emergency contacts, sharing a trip with them, and people you would rather not ride with." />

      <Card className="flex flex-col gap-4">
        <h2 className="text-lg font-extrabold">Emergency contacts <span className="text-sm font-normal text-muted">({contacts.length}/{MAX_EMERGENCY_CONTACTS})</span></h2>
        {contacts.length === 0 && <EmptyState icon="phone" title="No contacts yet">Add someone who should know when you travel.</EmptyState>}
        {contacts.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface px-4 py-3">
            <span className="min-w-0 flex-1">
              <span className="block font-extrabold">{c.name} {c.relation && <span className="text-sm font-normal text-muted">· {c.relation}</span>}</span>
              <span className="block text-sm text-muted">{c.phone}{c.email ? ` · ${c.email}` : " · no email (needed to share trips)"}</span>
            </span>
            <Button variant="ghost" className="h-9" onClick={() => { setEditing(c.id); setForm({ name: c.name, phone: c.phone, email: c.email ?? "", relation: c.relation ?? "" }); }}>Edit</Button>
            <Button variant="ghost" className="h-9" onClick={() => remove(c.id)}>Remove</Button>
          </div>
        ))}
        {(editing || contacts.length < MAX_EMERGENCY_CONTACTS) && (
          <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
            <Input id="c-name" label="Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={fields.name} />
            <Input id="c-phone" label="Phone" required placeholder="+91 98765 43210" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} error={fields.phone} />
            <Input id="c-email" label="Email (to send live trips)" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} error={fields.email} />
            <Input id="c-rel" label="Relation" placeholder="Mother, friend…" value={form.relation} onChange={(e) => setForm({ ...form, relation: e.target.value })} />
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" loading={busy}>{editing ? "Save contact" : "Add contact"}</Button>
              {editing && <Button type="button" variant="ghost" onClick={() => { setEditing(null); setForm(blank); }}>Cancel</Button>}
            </div>
          </form>
        )}
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-lg font-extrabold">Share a live trip</h2>
        <p className="-mt-2 text-sm text-muted">Email the live link of your ride to chosen contacts. The link shows the route, vehicle and position, never phone numbers.</p>
        {bookings.length === 0 ? (
          <p className="text-sm text-muted">You have no confirmed upcoming ride to share.</p>
        ) : contacts.length === 0 ? (
          <p className="text-sm text-muted">Add a contact with an email first.</p>
        ) : (
          <>
            <label className="flex flex-col gap-1.5 text-sm font-bold">
              Ride
              <select className="h-12 rounded-2xl border-[1.5px] border-line-strong bg-surface px-3 text-base font-semibold" value={ride} onChange={(e) => setRide(e.target.value)}>
                {bookings.map((b) => <option key={b.ride.id} value={b.ride.id}>{fmtWhen(b.ride.departAt)} · {b.ride.from} → {b.ride.to}</option>)}
              </select>
            </label>
            <div className="flex flex-wrap gap-3">
              {contacts.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="h-5 w-5 accent-[#0B1426]" checked={picked.includes(c.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, c.id] : picked.filter((x) => x !== c.id))} />
                  {c.name} {!c.email && <Badge tone="warning">no email</Badge>}
                </label>
              ))}
            </div>
            {shareMsg && <Notice tone={shareMsg.tone}>{shareMsg.text}</Notice>}
            <Button onClick={share} loading={busy} disabled={!picked.length || !ride} className="self-start">Send live link</Button>
          </>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-extrabold">Blocked people</h2>
        <p className="-mt-1 text-sm text-muted">Blocked colleagues do not appear in your ride search, and you do not appear in theirs. You can also block someone from a chat.</p>
        {blocks.length === 0 && <p className="text-sm text-muted">You have not blocked anyone.</p>}
        {blocks.map((b) => (
          <div key={b.membershipId} className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3">
            <span className="flex-1 font-extrabold">{b.name}</span>
            <span className="text-xs text-muted">{fmtWhen(b.blockedAt)}</span>
            <Button variant="ghost" className="h-9" onClick={async () => { await api("DELETE", `/me/blocks/${b.membershipId}`); load(); }}>Unblock</Button>
          </div>
        ))}
      </Card>
    </section>
  );
}
