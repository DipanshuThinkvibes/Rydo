"use client";

import { useState } from "react";
import Link from "next/link";
import { RequestError } from "@/lib/api";
import { digitsOnly, emailDomain, formatAadhaar, ID_PROOFS, ID_TYPES, isEmail, isPersonName, isValidEmployeeId, isValidIndianMobile, type IdType } from "@/lib/validators";
import type { CompanyInfo, EmployeeDetails } from "@/lib/signup-api";
import { Button, Input, Notice, Select } from "@/components/ui";

/** The employee details form: used by sign-up (then HR approves) and by an HR invite link (account made straight away). */
/** Step 2: the employee's details. */
export function DetailsStep({ company, initial, onBack, onSubmit, viaGoogle, withPassword = false, submitLabel, heading = "Your details" }: { company: CompanyInfo; initial: EmployeeDetails; onBack?: () => void; onSubmit: (d: EmployeeDetails, password: string) => Promise<void>; viaGoogle: boolean; /** Ask for a password too (invite-link form: the account is created straight away). */ withPassword?: boolean; submitLabel?: string; heading?: string }) {
  const [d, setD] = useState(initial);
  const [consent, setConsent] = useState(false);
  const [password, setPassword] = useState("");
  const [showId, setShowId] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const set = (k: keyof EmployeeDetails, v: string) => setD((cur) => ({ ...cur, [k]: v }));
  const rule = ID_PROOFS[d.idType];

  function validate(x: EmployeeDetails) {
    const e: Record<string, string> = {};
    if (!isPersonName(x.fullName)) e.fullName = "Enter your full name";
    if (!isEmail(x.workEmail)) e.workEmail = "Enter your work email";
    else if (!company.domains.includes(emailDomain(x.workEmail))) e.workEmail = `Use your ${company.name} email (ends with @${company.domains[0]})`;
    if (!isValidIndianMobile(x.phone)) e.phone = "Enter a 10-digit mobile number";
    const idError = ID_PROOFS[x.idType].check(x.idNumber);
    if (idError) e.idNumber = idError;
    if (!isValidEmployeeId(x.employeeId)) e.employeeId = "Enter your employee ID (letters and numbers)";
    if (!x.department) e.department = "Choose your department";
    if (x.designation.trim().length < 2) e.designation = "Enter your job title";
    if (!x.office) e.office = "Choose your office";
    if (!isPersonName(x.managerName)) e.managerName = "Enter your manager's name";
    if (!isEmail(x.managerEmail)) e.managerEmail = "Enter your manager's work email";
    else if (!company.domains.includes(emailDomain(x.managerEmail))) e.managerEmail = `Your manager's email should end with @${company.domains[0]}`;
    else if (x.managerEmail.trim().toLowerCase() === x.workEmail.trim().toLowerCase()) e.managerEmail = "Your manager's email must be different from yours";
    if (withPassword && (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password))) e.password = "At least 8 characters, with a letter and a number";
    if (!consent) e.consent = "Please agree to continue";
    return e;
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const e = validate(d);
    setErrors(e);
    setServerError(undefined);
    if (Object.keys(e).length) {
      document.getElementById(`f-${Object.keys(e)[0]}`)?.focus();
      return;
    }
    setBusy(true);
    try {
      await onSubmit({ ...d, workEmail: d.workEmail.trim().toLowerCase(), managerEmail: d.managerEmail.trim().toLowerCase(), idNumber: rule.clean(d.idNumber), phone: digitsOnly(d.phone).slice(-10) }, password);
    } catch (err) {
      setServerError(err instanceof RequestError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const field = (id: keyof EmployeeDetails) => ({ id: `f-${id}`, value: d[id], error: errors[id], onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(id, e.target.value), "aria-invalid": errors[id] ? true : undefined });

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold">{heading}</h1>
        <p className="mt-1.5 text-sm text-muted">Registering with <b>{company.name}</b>.{onBack && <> <button type="button" onClick={onBack} className="font-extrabold text-ink underline">Change company</button></>}</p>
      </div>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 text-xs font-extrabold uppercase tracking-[2px] text-muted">About you</legend>
        <Input label="Full name" autoComplete="name" placeholder="As on your ID" {...field("fullName")} />
        {viaGoogle ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-bold">Work email</span>
            <div className="flex h-12 items-center justify-between gap-2 rounded-2xl border-[1.5px] border-line-strong bg-surface-2 px-4 font-semibold"><span className="truncate">{d.workEmail}</span><span className="shrink-0 rounded-full bg-success-bg px-2.5 py-0.5 text-xs font-extrabold text-success">Verified by Google</span></div>
          </div>
        ) : (
          <Input label="Work email" type="email" autoComplete="email" placeholder={`name@${company.domains[0]}`} {...field("workEmail")} />
        )}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="f-phone" className="text-sm font-bold">Phone number</label>
          <div className="flex gap-2">
            <span className="flex h-12 items-center rounded-2xl border-[1.5px] border-line-strong bg-surface-2 px-3.5 font-bold" aria-hidden="true">+91</span>
            <input id="f-phone" type="tel" inputMode="numeric" autoComplete="tel-national" placeholder="98765 43210" value={d.phone} onChange={(e) => set("phone", digitsOnly(e.target.value).slice(0, 10))} aria-invalid={errors.phone ? true : undefined} className="h-12 min-w-0 flex-1 rounded-2xl border-[1.5px] border-line-strong bg-surface px-4 text-base font-semibold outline-none focus:border-ink focus:bg-white" />
          </div>
          {errors.phone ? <span className="text-sm font-semibold text-danger">{errors.phone}</span> : <span className="text-xs text-muted">Private. Never shown to other employees.</span>}
        </div>
        <Select id="f-idType" label="ID proof" value={d.idType} onChange={(e) => { setD((cur) => ({ ...cur, idType: e.target.value as IdType, idNumber: "" })); setErrors((cur) => ({ ...cur, idNumber: "" })); }}>
          {ID_TYPES.map((t) => <option key={t} value={t}>{ID_PROOFS[t].label}</option>)}
        </Select>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="f-idNumber" className="text-sm font-bold">{rule.label} number</label>
          <div className="flex gap-2">
            <input id="f-idNumber" type={showId ? "text" : "password"} inputMode={d.idType === "AADHAAR" ? "numeric" : "text"} autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder={rule.placeholder} value={d.idType === "AADHAAR" ? formatAadhaar(d.idNumber) : d.idNumber} onChange={(e) => set("idNumber", rule.clean(e.target.value))} aria-invalid={errors.idNumber ? true : undefined} className="h-12 min-w-0 flex-1 rounded-2xl border-[1.5px] border-line-strong bg-surface px-4 text-base font-semibold tracking-wider outline-none focus:border-ink focus:bg-white" />
            <button type="button" onClick={() => setShowId(!showId)} aria-pressed={showId} className="h-12 rounded-2xl border-[1.5px] border-line-strong px-4 text-sm font-extrabold hover:border-ink">{showId ? "Hide" : "Show"}</button>
          </div>
          {errors.idNumber ? <span className="text-sm font-semibold text-danger">{errors.idNumber}</span> : <span className="text-xs text-muted">{rule.hint}. Only the last 4 characters are stored, and never shown to other employees.</span>}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 text-xs font-extrabold uppercase tracking-[2px] text-muted">At work</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Employee ID" autoComplete="off" placeholder="For example AT-10234" {...field("employeeId")} />
          <Input label="Job title" autoComplete="organization-title" placeholder="For example Software engineer" {...field("designation")} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            {company.departments.length ? (
              <Select id="f-department" label="Department" value={d.department} onChange={(e) => set("department", e.target.value)} aria-invalid={errors.department ? true : undefined}>
                <option value="">Choose…</option>
                {company.departments.map((x) => <option key={x}>{x}</option>)}
              </Select>
            ) : (
              <Input label="Department" placeholder="For example Engineering" {...field("department")} />
            )}
            {errors.department && <span className="text-sm font-semibold text-danger">{errors.department}</span>}
          </div>
          <div className="flex flex-col gap-1.5">
            {company.offices.length ? (
              <Select id="f-office" label="Office" value={d.office} onChange={(e) => set("office", e.target.value)} aria-invalid={errors.office ? true : undefined}>
                <option value="">Choose…</option>
                {company.offices.map((x) => <option key={x}>{x}</option>)}
              </Select>
            ) : (
              <Input label="Office" placeholder="For example Head office" {...field("office")} />
            )}
            {errors.office && <span className="text-sm font-semibold text-danger">{errors.office}</span>}
          </div>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 text-xs font-extrabold uppercase tracking-[2px] text-muted">Reporting manager</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Manager's name" autoComplete="off" {...field("managerName")} />
          <Input label="Manager's work email" type="email" autoComplete="off" placeholder={`manager@${company.domains[0]}`} {...field("managerEmail")} />
        </div>
      </fieldset>

            {withPassword && (
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-1 text-xs font-extrabold uppercase tracking-[2px] text-muted">Your password</legend>
          <Input id="f-password" label="Choose a password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} />
          <p className="-mt-2 text-xs text-muted">You will sign in with your work email and this password.</p>
        </fieldset>
      )}

      <div className="flex flex-col gap-1.5">
        <label className="flex items-start gap-3 text-sm">
          <input id="f-consent" type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[#0B1426]" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>I confirm these details are correct, and I agree to the <Link href="/terms" className="font-extrabold underline">terms</Link> and <Link href="/privacy" className="font-extrabold underline">privacy policy</Link>.</span>
        </label>
        {errors.consent && <span className="text-sm font-semibold text-danger">{errors.consent}</span>}
      </div>

      {Object.keys(errors).length > 0 && <Notice tone="error">Please fix the highlighted fields.</Notice>}
      {serverError && <Notice tone="error">{serverError}</Notice>}
      <div className="flex gap-3">
        {onBack && <Button type="button" variant="ghost" className="h-12" onClick={onBack}>Back</Button>}
        <Button type="submit" loading={busy} className="h-12 flex-1">{submitLabel ?? (viaGoogle ? "Send request to HR" : "Send verification code")}</Button>
      </div>
    </form>
  );
}
