"use client";

import { useCallback, useEffect, useState } from "react";
import { api, RequestError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Badge, Button, Input } from "@/components/ui";

interface Company {
  id: string;
  name: string;
  slug: string;
  emailDomains: string[];
  status: "PENDING" | "ACTIVE" | "SUSPENDED";
  members: number;
}

export default function PlatformPage() {
  const { me } = useSession();
  const [rows, setRows] = useState<Company[] | null>(null);
  const [form, setForm] = useState({ name: "", slug: "", domains: "", adminEmail: "", adminName: "" });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);

  const fetchRows = useCallback(() => api<Company[]>("GET", "/admin/platform/organizations"), []);
  const load = useCallback(() => fetchRows().then(setRows), [fetchRows]);
  useEffect(() => {
    if (me?.user.isPlatformAdmin) fetchRows().then(setRows, () => undefined);
  }, [me, fetchRows]);

  if (!me?.user.isPlatformAdmin) return <p className="text-muted">Only RYDO Super Admins can see companies.</p>;

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFields({});
    setMessage(undefined);
    try {
      const org = await api<{ id: string }>("POST", "/admin/platform/organizations", {
        name: form.name,
        slug: form.slug,
        emailDomains: form.domains.split(",").map((d) => d.trim()).filter(Boolean),
      });
      if (form.adminEmail) await api("POST", `/admin/platform/organizations/${org.id}/admins`, { email: form.adminEmail, name: form.adminName || form.adminEmail });
      setForm({ name: "", slug: "", domains: "", adminEmail: "", adminName: "" });
      setMessage(`${form.name} is live. Its admin can sign in now.`);
      await load();
    } catch (err) {
      if (err instanceof RequestError) {
        setFields(err.fields ?? {});
        setMessage(err.message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(id: string, status: Company["status"]) {
    await api("PATCH", `/admin/platform/organizations/${id}`, { status });
    await load();
  }

  return (
    <section className="flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold">Companies on RYDO</h1>
        <p className="text-sm text-muted">Employees sign up with an email from one of the company&apos;s domains.</p>
      </div>
      <form onSubmit={create} className="grid gap-4 rounded-[18px] border border-line bg-white p-5 sm:grid-cols-2">
        <Input id="name" label="Company name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={fields.name} />
        <Input id="slug" label="Short name (slug)" required value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="acme" error={fields.slug} />
        <Input id="domains" label="Email domains (comma separated)" required value={form.domains} onChange={(e) => setForm({ ...form, domains: e.target.value })} placeholder="acme.com" error={fields.emailDomains ?? fields["emailDomains.0"]} />
        <Input id="adminEmail" label="First Org Admin email (optional)" type="email" value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} />
        <div className="flex items-center gap-4 sm:col-span-2">
          <Button type="submit" disabled={busy}>
            Add company
          </Button>
          {message && <span role="status" className="text-sm font-semibold">{message}</span>}
        </div>
      </form>
      {rows === null ? (
        <p className="text-muted">Loading…</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {rows.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-4 rounded-[18px] border border-line bg-white p-4">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-extrabold">{c.name}</span>
                <span className="text-sm text-muted">
                  {c.emailDomains.join(", ")} · {c.members} people
                </span>
              </span>
              <Badge tone={c.status === "ACTIVE" ? "success" : "warning"}>{c.status.toLowerCase()}</Badge>
              {c.status === "ACTIVE" ? (
                <Button variant="ghost" onClick={() => setStatus(c.id, "SUSPENDED")}>
                  Suspend
                </Button>
              ) : (
                <Button onClick={() => setStatus(c.id, "ACTIVE")}>Activate</Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}