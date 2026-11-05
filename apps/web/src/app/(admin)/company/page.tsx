"use client";

import { useEffect, useState } from "react";
import type { OrgSettings } from "@rydo/shared";
import { api, RequestError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Button, Card, Input, Notice, PageHeader } from "@/components/ui";

interface Company {
  id: string;
  name: string;
  emailDomains: string[];
  settings: OrgSettings;
  logoUrl: string | null;
}

type NumberRule = { key: Exclude<keyof OrgSettings, "womenOnlyEnabled" | "costPerKmEstimate">; label: string; unit: string; help: string };
const rules: NumberRule[] = [
  { key: "freeCancelHours", label: "Free cancellation until", unit: "hours before", help: "Cancelling later lowers the person's reliability score." },
  { key: "driverPopupSeconds", label: "Driver has", unit: "seconds to answer", help: "A live request expires after this and goes to the next match." },
  { key: "requestTimeoutMinutes", label: "Scheduled requests expire after", unit: "minutes", help: "For rides booked ahead." },
  { key: "waitFreeMinutes", label: "Driver waits for free", unit: "minutes", help: "At each pickup." },
  { key: "noShowAfterMinutes", label: "Driver can mark no-show after", unit: "minutes", help: "Counted from arriving at the pickup." },
  { key: "pickupRadiusMeters", label: "Pickup can be up to", unit: "metres from the route", help: "Used to find matching rides." },
  { key: "maxDetourMinutes", label: "A pickup may add at most", unit: "minutes", help: "To the driver's trip." },
  { key: "longStopMinutes", label: "Ask \"Everything OK?\" after a stop of", unit: "minutes", help: "During a live trip." },
];

export default function CompanyPage() {
  const { org, can, reload } = useSession();
  const editable = can("ORG_ADMIN");
  const [company, setCompany] = useState<Company>();
  const [name, setName] = useState("");
  const [domains, setDomains] = useState("");
  const [settings, setSettings] = useState<OrgSettings>();
  const [fields, setFields] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string }>();
  const [busy, setBusy] = useState(false);

  function fill(c: Company) {
    setCompany(c);
    setName(c.name);
    setDomains(c.emailDomains.join(", "));
    setSettings(c.settings);
  }

  useEffect(() => {
    if (org) api<Company>("GET", "/admin/org").then(fill).catch(() => setMsg({ tone: "error", text: "Could not load company." }));
  }, [org]);

  async function run(fn: () => Promise<Company>, ok: string) {
    setBusy(true);
    setFields({});
    setMsg(undefined);
    try {
      fill(await fn());
      setMsg({ tone: "ok", text: ok });
      await reload();
    } catch (e) {
      if (e instanceof RequestError) {
        setFields(e.fields ?? {});
        setMsg({ tone: "error", text: e.message });
      }
    } finally {
      setBusy(false);
    }
  }

  if (!org) return <p className="text-muted">Choose a company first.</p>;
  if (!company || !settings) return <p className="text-muted">Loading…</p>;

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    run(
      () => api<Company>("PATCH", "/admin/org", { name, emailDomains: domains.split(",").map((d) => d.trim()).filter(Boolean), settings }),
      "Saved.",
    );
  };

  const uploadLogo = (file: File) => {
    const form = new FormData();
    form.append("file", file);
    run(() => api<Company>("POST", "/admin/org/logo", form), "Logo updated.");
  };

  return (
    <section className="flex max-w-3xl flex-col gap-5">
      <PageHeader title="Company" sub={editable ? "Your company's details and ride rules. Changes apply to new rides." : "Only Org Admins can change these."} />
      <form onSubmit={save} className="flex flex-col gap-5">
        <Card className="flex flex-col gap-4">
          <h2 className="text-lg font-extrabold">Details</h2>
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-line bg-surface">
              {company.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={company.logoUrl} alt={`${company.name} logo`} className="h-full w-full object-contain" />
              ) : (
                <span className="text-xs font-bold text-muted">No logo</span>
              )}
            </span>
            {editable && (
              <label className="inline-flex h-11 cursor-pointer items-center rounded-2xl border-[1.5px] border-line-strong px-4 text-sm font-extrabold hover:border-ink">
                Upload logo
                <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={busy} onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
              </label>
            )}
            <span className="text-xs text-muted">PNG, JPG or WebP, up to 1 MB.</span>
          </div>
          <Input id="name" label="Company name" value={name} disabled={!editable} onChange={(e) => setName(e.target.value)} error={fields.name} />
          <Input id="domains" label="Employee email domains (comma separated)" value={domains} disabled={!editable} onChange={(e) => setDomains(e.target.value)} error={fields.emailDomains ?? fields["emailDomains.0"]} />
          <p className="-mt-2 text-xs text-muted">Only people with these email domains can sign up for this company.</p>
        </Card>

        <Card className="flex flex-col gap-4">
          <h2 className="text-lg font-extrabold">Ride rules</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {rules.map((r) => (
              <div key={r.key} className="flex flex-col gap-1.5">
                <label htmlFor={r.key} className="text-sm font-bold">{r.label}</label>
                <div className="flex items-center gap-2">
                  <input
                    id={r.key}
                    type="number"
                    disabled={!editable}
                    value={settings[r.key]}
                    onChange={(e) => setSettings({ ...settings, [r.key]: Number(e.target.value) })}
                    className="h-11 w-24 rounded-2xl border-[1.5px] border-line-strong bg-surface px-3 text-base font-semibold outline-none focus:border-ink focus:bg-white"
                  />
                  <span className="text-sm text-muted">{r.unit}</span>
                </div>
                {fields[`settings.${r.key}`] ? <span className="text-sm font-semibold text-danger">{fields[`settings.${r.key}`]}</span> : <span className="text-xs text-muted">{r.help}</span>}
              </div>
            ))}
          </div>
          <label className="flex items-center gap-3 text-sm font-bold">
            <input type="checkbox" className="h-5 w-5 accent-[#0B1426]" disabled={!editable} checked={settings.womenOnlyEnabled} onChange={(e) => setSettings({ ...settings, womenOnlyEnabled: e.target.checked })} />
            Offer women-only rides
          </label>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="cost" className="text-sm font-bold">Running cost estimate (₹ per km)</label>
            <input
              id="cost"
              type="number"
              step="0.5"
              disabled={!editable}
              value={settings.costPerKmEstimate ?? ""}
              placeholder="Not set"
              onChange={(e) => setSettings({ ...settings, costPerKmEstimate: e.target.value === "" ? null : Number(e.target.value) })}
              className="h-11 w-32 rounded-2xl border-[1.5px] border-line-strong bg-surface px-3 text-base font-semibold outline-none focus:border-ink focus:bg-white"
            />
            <span className="text-xs text-muted">Leave empty to hide cost estimates from riders.</span>
          </div>
        </Card>

        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        {editable && (
          <Button type="submit" disabled={busy} className="self-start">
            Save changes
          </Button>
        )}
      </form>
    </section>
  );
}