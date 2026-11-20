"use client";

import { useState } from "react";
import Link from "next/link";
import { DEFAULT_ORG_FEATURES, ORG_FEATURE_INFO, type OfficeInput, type OrgFeatures } from "@rydo/shared";
import { api, RequestError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Badge, Button, Card, Input, Notice, PageHeader, Segmented, Toggle, fieldClass } from "@/components/ui";
import { Icon } from "@/components/icons";
import { PlaceSearch } from "@/components/place-search";
import { MapView } from "@/components/map/map-view";

const STEPS = ["Company", "People", "Offices", "Plan & features", "Review"] as const;
const ZONES = ["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Europe/London", "America/New_York"];

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
function newPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz";
  const a = crypto.getRandomValues(new Uint32Array(10));
  return Array.from(a, (n, i) => (i % 4 === 3 ? String(n % 10) : chars[n % chars.length])).join("") + "7";
}

export default function NewClientPage() {
  const { me } = useSession();
  const [step, setStep] = useState(0);
  const [company, setCompany] = useState({ name: "", slug: "", slugEdited: false, domains: "", timezone: "Asia/Kolkata" });
  const [contact, setContact] = useState({ name: "", email: "", phone: "" });
  const [admin, setAdmin] = useState({ name: "", email: "", password: "", sameAsContact: true });
  const [sendWelcome, setSendWelcome] = useState(true);
  const [offices, setOffices] = useState<OfficeInput[]>([]);
  const [features, setFeatures] = useState<OrgFeatures>(DEFAULT_ORG_FEATURES);
  const [limit, setLimit] = useState<string>("");
  const [radius, setRadius] = useState("1000");
  const [costPerKm, setCostPerKm] = useState("");
  const [error, setError] = useState<{ text: string; fields?: Record<string, string> }>();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ id: string; welcomeSent: boolean } | null>(null);

  if (!me?.user.isPlatformAdmin) return <Notice tone="error">RYDO owner team only.</Notice>;

  // Accepts "acme.com", "@acme.com", a pasted email or a web address, and keeps only the domain.
  const domains = [...new Set(company.domains.split(/[\s,;]+/).map((d) => d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^.*@/, "").replace(/^www\./, "").replace(/[/?#].*$/, "")).filter(Boolean))];
  const badDomain = domains.find((d) => !/^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(d));
  const adminFinal = admin.sameAsContact ? { ...admin, name: contact.name, email: contact.email } : admin;
  const adminDomainOk = !adminFinal.email || domains.includes(adminFinal.email.split("@")[1] ?? "");

  const checks: (() => string | null)[] = [
    () => (company.name.trim().length < 2 ? "Enter the company name." : !/^[a-z0-9-]{2,40}$/.test(company.slug) ? "Short name: 2–40 lowercase letters, digits or dashes." : domains.length === 0 ? "Add at least one email domain, like acme.com." : badDomain ? `"${badDomain}" is not a valid domain. Use something like acme.com.` : null),
    () => (!contact.name.trim() || !/\S+@\S+\.\S+/.test(contact.email) ? "Add the client's contact name and email." : !adminFinal.name.trim() || !/\S+@\S+\.\S+/.test(adminFinal.email) ? "Add the first admin's name and email." : !adminDomainOk ? `The admin must use a company email (${domains.join(", ")}).` : admin.password && !/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(admin.password) ? "Password: 8+ characters with a letter and a digit." : null),
    () => null,
    () => (limit && (!/^\d+$/.test(limit) || Number(limit) < 1) ? "Seat limit must be a whole number, or empty for no limit." : null),
    () => null,
  ];

  const next = () => {
    const msg = checks[step]();
    if (msg) return setError({ text: msg });
    setError(undefined);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  async function create() {
    setBusy(true);
    setError(undefined);
    try {
      const r = await api<{ id: string; welcomeSent: boolean }>("POST", "/admin/platform/clients", {
        company: { name: company.name.trim(), slug: company.slug, emailDomains: domains, timezone: company.timezone },
        contact: { name: contact.name.trim(), email: contact.email.trim(), phone: contact.phone.trim() || undefined },
        admin: { name: adminFinal.name.trim(), email: adminFinal.email.trim(), password: admin.password || undefined },
        offices,
        settings: { pickupRadiusMeters: Number(radius), ...(costPerKm ? { costPerKmEstimate: Number(costPerKm) } : {}) },
        features,
        maxEmployees: limit ? Number(limit) : null,
        sendWelcome,
      });
      setDone(r);
    } catch (e) {
      setError(e instanceof RequestError ? { text: e.message, fields: e.fields } : { text: "That didn't work." });
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <section className="flex max-w-xl flex-col items-center gap-4 py-10 text-center">
        <span className="flex h-16 w-16 animate-rise items-center justify-center rounded-3xl bg-lime shadow-[0_10px_24px_rgba(140,190,40,.35)]"><Icon name="check" size={32} /></span>
        <h1 className="text-3xl font-extrabold">{company.name} is on RYDO</h1>
        <p className="text-muted">
          {done.welcomeSent ? `We emailed ${adminFinal.email} how to sign in.` : `Tell ${adminFinal.name} to sign in with ${adminFinal.email}.`}
          {admin.password ? " Share the temporary password with them privately." : " They set a password with “Forgot password?”."}
        </p>
        {admin.password && (
          <div className="flex w-full flex-col items-center gap-2 rounded-2xl bg-white p-4 shadow-soft">
            <span className="text-xs font-bold uppercase tracking-wider text-muted">Temporary password for {adminFinal.email}</span>
            <code className="rounded-xl bg-surface-2 px-4 py-2 text-xl font-extrabold tracking-wider">{admin.password}</code>
            <Button variant="soft" className="h-9" onClick={() => navigator.clipboard?.writeText(admin.password)}>Copy</Button>
            <span className="text-xs text-warning">Shown only now. Send it privately (not in the welcome email); they should change it after signing in.</span>
          </div>
        )}
        <div className="flex flex-wrap justify-center gap-3">
          <Link href={`/platform/clients/${done.id}`} className="inline-flex h-11 items-center gap-2 rounded-2xl bg-ink px-5 text-sm font-extrabold text-white">Open client <Icon name="arrowRight" size={16} /></Link>
          <Link href="/platform/clients" className="inline-flex h-11 items-center rounded-2xl border-[1.5px] border-line-strong bg-white px-5 text-sm font-extrabold">All clients</Link>
        </div>
      </section>
    );
  }

  return (
    <section className="flex max-w-5xl flex-col gap-5">
      <Link href="/platform/clients" className="flex w-fit items-center gap-1.5 text-sm font-bold text-muted hover:text-ink"><Icon name="arrowLeft" size={16} /> Clients</Link>
      <PageHeader title="Add a client" sub="Set up a company on RYDO in one go. You can change all of this later." />

      <ol className="flex flex-wrap gap-2" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => i < step && setStep(i)}
              disabled={i > step}
              aria-current={i === step ? "step" : undefined}
              className={`flex h-10 items-center gap-2 rounded-full pl-1.5 pr-4 text-sm font-extrabold transition-all ${i === step ? "bg-ink text-white" : i < step ? "bg-lime text-ink" : "bg-white text-muted"}`}
            >
              <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs ${i === step ? "bg-lime text-ink" : i < step ? "bg-ink text-lime" : "bg-surface-2"}`}>{i < step ? <Icon name="check" size={14} /> : i + 1}</span>
              {s}
            </button>
          </li>
        ))}
      </ol>

      {error && <Notice tone="error" onClose={() => setError(undefined)}>{error.text}{error.fields ? ` (${Object.values(error.fields).join(", ")})` : ""}</Notice>}

      <Card key={step} className="animate-rise">
        {step === 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Input id="c-name" label="Company name" placeholder="Acme Technologies" value={company.name} onChange={(e) => setCompany({ ...company, name: e.target.value, slug: company.slugEdited ? company.slug : slugify(e.target.value) })} />
            <Input id="c-slug" label="Short name (used in links)" placeholder="acme" value={company.slug} onChange={(e) => setCompany({ ...company, slug: slugify(e.target.value), slugEdited: true })} />
            <Input id="c-domains" label="Work email domains" placeholder="acme.com, acme.in" value={company.domains} onChange={(e) => setCompany({ ...company, domains: e.target.value })} />
            <label className="flex flex-col gap-1.5 text-sm font-bold">
              Time zone
              <select className={`${fieldClass} px-3`} value={company.timezone} onChange={(e) => setCompany({ ...company, timezone: e.target.value })}>
                {ZONES.map((z) => <option key={z}>{z}</option>)}
              </select>
            </label>
            <p className="text-xs text-muted sm:col-span-2">Only people with these email domains can sign up for this company. {domains.length > 0 && <>Domains: {domains.map((d) => <Badge key={d} tone="neutral">{d}</Badge>)}</>}</p>
          </div>
        )}

        {step === 1 && (
          <div className="flex flex-col gap-5">
            <div>
              <h2 className="mb-3 font-extrabold">Client contact</h2>
              <div className="grid gap-4 sm:grid-cols-3">
                <Input id="ct-name" label="Name" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} />
                <Input id="ct-email" label="Email" type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} />
                <Input id="ct-phone" label="Phone (optional)" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <h2 className="font-extrabold">First company admin</h2>
              <div className="rounded-2xl bg-surface px-4 py-1">
                <Toggle label="The contact is also the admin" checked={admin.sameAsContact} onChange={(v) => setAdmin({ ...admin, sameAsContact: v })} />
              </div>
              {!admin.sameAsContact && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input id="ad-name" label="Admin name" value={admin.name} onChange={(e) => setAdmin({ ...admin, name: e.target.value })} />
                  <Input id="ad-email" label="Admin work email" type="email" value={admin.email} onChange={(e) => setAdmin({ ...admin, email: e.target.value })} />
                </div>
              )}
              {!adminDomainOk && <p className="text-sm font-semibold text-danger">The admin must use a company email ({domains.join(", ")}).</p>}
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[220px] flex-1">
                  <Input id="ad-pass" label="Temporary password (optional)" value={admin.password} onChange={(e) => setAdmin({ ...admin, password: e.target.value })} placeholder="Leave empty: they use “Forgot password?”" />
                </div>
                <Button type="button" variant="soft" onClick={() => setAdmin({ ...admin, password: newPassword() })}><Icon name="sparkle" size={16} /> Generate</Button>
              </div>
              <div className="rounded-2xl bg-surface px-4 py-1">
                <Toggle label="Send a welcome email" hint="Tells the admin how to sign in and what to do first" checked={sendWelcome} onChange={setSendWelcome} />
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="flex flex-col gap-3">
              <PlaceSearch label="Add an office" clearOnPick onPick={(p) => setOffices((o) => [...o, { name: p.label, address: p.address || p.label, lat: p.lat, lng: p.lng, isDefault: o.length === 0 }])} />
              {offices.length === 0 && <p className="text-sm text-muted">Offices make pickup and drop one tap for employees, and decide which rides go &ldquo;to office&rdquo;. You can skip this; the company admin can add them later.</p>}
              <ul className="flex flex-col gap-2">
                {offices.map((o, i) => (
                  <li key={i} className="flex animate-rise items-center gap-3 rounded-2xl bg-surface p-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ink text-lime"><Icon name="building" size={16} /></span>
                    <span className="min-w-0 flex-1">
                      <input aria-label="Office name" value={o.name} onChange={(e) => setOffices((all) => all.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className="w-full bg-transparent font-extrabold outline-none" />
                      <span className="block truncate text-xs text-muted">{o.address}</span>
                    </span>
                    <button type="button" onClick={() => setOffices((all) => all.map((x, j) => ({ ...x, isDefault: j === i })))} className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${o.isDefault ? "bg-lime" : "bg-white text-muted hover:text-ink"}`}>{o.isDefault ? "main office" : "make main"}</button>
                    <button type="button" aria-label={`Remove ${o.name}`} onClick={() => setOffices((all) => all.filter((_, j) => j !== i).map((x, j, arr) => ({ ...x, isDefault: x.isDefault || (arr.every((y) => !y.isDefault) && j === 0) })))} className="rounded-lg p-1.5 text-muted hover:bg-white hover:text-danger"><Icon name="x" size={16} /></button>
                  </li>
                ))}
              </ul>
            </div>
            <MapView markers={offices.map((o, i) => ({ id: String(i), at: o, kind: "office" as const, title: o.name }))} className="h-72 lg:h-[380px]" />
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <h2 className="font-extrabold">Modules</h2>
              <div className="grid gap-3 sm:grid-cols-3">
                {(Object.keys(ORG_FEATURE_INFO) as (keyof OrgFeatures)[]).filter((k) => ORG_FEATURE_INFO[k].module).map((k) => {
                  const info = ORG_FEATURE_INFO[k];
                  const on = features[k];
                  return (
                    <button key={k} type="button" aria-pressed={on} onClick={() => setFeatures({ ...features, [k]: !on })} className={`flex flex-col items-start gap-1 rounded-2xl border-2 p-4 text-left transition-all ${on ? "border-ink bg-white shadow-soft" : "border-line bg-surface hover:border-line-strong"}`}>
                      <span className="flex w-full items-center justify-between gap-2">
                        <span className="font-extrabold">{info.label}</span>
                        <span className={`flex h-6 w-6 items-center justify-center rounded-full ${on ? "bg-lime" : "bg-white"}`}>{on && <Icon name="check" size={14} />}</span>
                      </span>
                      <span className="text-xs text-muted">{info.hint}</span>
                      {info.soon && <Badge tone="neutral">coming later · recorded on plan</Badge>}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <h2 className="font-extrabold">Options</h2>
              <div className="divide-y divide-line rounded-2xl bg-surface px-4 py-1">
                {(Object.keys(ORG_FEATURE_INFO) as (keyof OrgFeatures)[]).filter((k) => !ORG_FEATURE_INFO[k].module).map((k) => (
                  <Toggle key={k} label={ORG_FEATURE_INFO[k].label} hint={ORG_FEATURE_INFO[k].hint} checked={features[k]} onChange={(v) => setFeatures({ ...features, [k]: v })} />
                ))}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Input id="limit" label="Seat limit (active employees)" inputMode="numeric" placeholder="No limit" value={limit} onChange={(e) => setLimit(e.target.value.replace(/\D/g, ""))} />
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-bold">Pickup distance from route</span>
                <Segmented label="Pickup distance" value={radius} onChange={setRadius} options={[{ value: "500", label: "500 m" }, { value: "1000", label: "1 km" }, { value: "2000", label: "2 km" }]} />
              </div>
              <Input id="cost" label="Fuel cost per km (₹, optional)" inputMode="decimal" placeholder="e.g. 9" value={costPerKm} onChange={(e) => setCostPerKm(e.target.value.replace(/[^\d.]/g, ""))} />
            </div>
          </div>
        )}

        {step === 4 && (
          <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
            {[
              ["Company", `${company.name} (${company.slug})`],
              ["Email domains", domains.join(", ")],
              ["Time zone", company.timezone],
              ["Contact", `${contact.name} · ${contact.email}${contact.phone ? ` · ${contact.phone}` : ""}`],
              ["First admin", `${adminFinal.name} · ${adminFinal.email}`],
              ["Sign-in", admin.password ? "Temporary password (share privately)" : "They set it with “Forgot password?”"],
              ["Welcome email", sendWelcome ? "Yes" : "No"],
              ["Offices", offices.length ? offices.map((o) => o.name + (o.isDefault ? " (main)" : "")).join(", ") : "None yet"],
              ["Modules", (["share", "enterprise", "campus"] as const).filter((k) => features[k]).map((k) => ORG_FEATURE_INFO[k].label).join(", ") || "None"],
              ["Options", (["womenOnly", "autoAcceptTeam", "costShare"] as const).map((k) => `${ORG_FEATURE_INFO[k].label}: ${features[k] ? "on" : "off"}`).join(" · ")],
              ["Seat limit", limit ? `${limit} employees` : "No limit"],
              ["Ride rules", `Pickup within ${Number(radius) >= 1000 ? `${Number(radius) / 1000} km` : `${radius} m`}${costPerKm ? ` · ₹${costPerKm}/km` : ""}`],
            ].map(([k, v]) => (
              <div key={k} className="flex flex-col gap-0.5 border-b border-line pb-3">
                <dt className="text-xs font-bold uppercase tracking-wider text-muted">{k}</dt>
                <dd className="font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </Card>

      <div className="flex flex-wrap justify-between gap-3">
        <Button variant="ghost" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}><Icon name="arrowLeft" size={16} /> Back</Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={next}>Next <Icon name="arrowRight" size={16} /></Button>
        ) : (
          <Button variant="lime" loading={busy} onClick={create} className="h-12 px-6 text-base">Create client <Icon name="check" size={18} /></Button>
        )}
      </div>
    </section>
  );
}
