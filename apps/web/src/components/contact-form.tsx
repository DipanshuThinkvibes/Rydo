"use client";

import { useState } from "react";
import Link from "next/link";
import { COMPANY_SIZES } from "@rydo/shared";
import { api, RequestError } from "@/lib/api";
import { Button, Input, Notice, Select, Textarea } from "@/components/ui";

const blank = { companyName: "", contactName: "", workEmail: "", phone: "", companySize: "", city: "", message: "", website: "", consent: false };

/** "Contact us": a company asks RYDO to be set up. Goes straight to the RYDO team's onboarding inbox. */
export function ContactForm() {
  const [f, setF] = useState(blank);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFields({});
    setError(undefined);
    try {
      await api("POST", "/public/contact", f);
      setSent(true);
    } catch (err) {
      if (err instanceof RequestError) {
        setFields(err.fields ?? {});
        setError(err.status === 429 ? "Too many requests from this device. Please try again in an hour." : err.message);
      } else setError("We could not send your request. Please check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (sent)
    return (
      <div role="status" className="flex flex-col items-start gap-3 rounded-[28px] bg-lime p-8">
        <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-full bg-ink text-xl text-lime">✓</span>
        <h2 className="text-2xl font-extrabold">Thanks, we got your request.</h2>
        <p className="max-w-md text-ink/80">We sent a confirmation to <b>{f.workEmail}</b>. The RYDO team will contact you within 2 working days to set up your company.</p>
        <Button variant="primary" onClick={() => { setF(blank); setSent(false); }}>Send another request</Button>
      </div>
    );

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4 rounded-[28px] border border-line bg-white p-6 shadow-soft sm:p-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <Input id="companyName" label="Company name" required autoComplete="organization" value={f.companyName} onChange={set("companyName")} error={fields.companyName} />
        <Input id="contactName" label="Your name" required autoComplete="name" value={f.contactName} onChange={set("contactName")} error={fields.contactName} />
        <Input id="workEmail" label="Work email" type="email" required autoComplete="email" placeholder="you@company.com" value={f.workEmail} onChange={set("workEmail")} error={fields.workEmail} />
        <Input id="phone" label="Phone (optional)" type="tel" autoComplete="tel" placeholder="+91 98765 43210" value={f.phone} onChange={set("phone")} error={fields.phone} />
        <Select id="companySize" label="Company size" required value={f.companySize} onChange={set("companySize")}>
          <option value="">Choose…</option>
          {COMPANY_SIZES.map((s) => <option key={s} value={s}>{s} employees</option>)}
        </Select>
        <Input id="city" label="City (optional)" autoComplete="address-level2" value={f.city} onChange={set("city")} error={fields.city} />
      </div>
      {fields.companySize && <p className="-mt-2 text-sm font-semibold text-danger">{fields.companySize}</p>}
      <Textarea id="message" label="Anything we should know? (optional)" value={f.message} onChange={set("message")} maxLength={1500} hint="For example: number of offices, when you would like to start." error={fields.message} />
      {/* Spam trap: hidden from people, bots fill it in. */}
      <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label>Website<input tabIndex={-1} autoComplete="off" value={f.website} onChange={set("website")} /></label>
      </div>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[#0B1426]" checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} />
        <span>I agree that RYDO may contact me about setting up my company. See our <Link href="/privacy" className="font-extrabold underline">privacy policy</Link>.</span>
      </label>
      {fields.consent && <p className="-mt-2 text-sm font-semibold text-danger">{fields.consent}</p>}
      {error && <Notice tone="error">{error}</Notice>}
      <Button type="submit" loading={busy} className="h-12 self-start px-8">Request onboarding</Button>
    </form>
  );
}
