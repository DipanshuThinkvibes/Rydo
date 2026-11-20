"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RequestError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { digitsOnly, emailDomain, formatAadhaar, ID_PROOFS, ID_TYPES, isEmail, isPersonName, isValidEmployeeId, isValidIndianMobile, type IdType } from "@/lib/validators";
import { requestEmailCode, searchCompanies, submitRegistration, verifyEmailCode, type CompanyInfo, type EmployeeDetails } from "@/lib/signup-api";
import { Button, Input, Logo, Notice, Select } from "@/components/ui";
import { GoogleButton, OrDivider } from "@/components/google-button";
import { googleAuth } from "@/lib/google-auth";

type Step = 1 | 2 | 3 | 4;
const STEPS = ["Your company", "Your details", "Verify email", "Done"];
const blank: EmployeeDetails = { fullName: "", workEmail: "", phone: "", idType: "AADHAAR", idNumber: "", employeeId: "", managerName: "", managerEmail: "", department: "", designation: "", office: "" };

/** Left panel on wide screens: where you are in the sign-up. */
function Progress({ step }: { step: Step }) {
  return (
    <ol className="relative mt-8 flex flex-col gap-4" aria-label="Sign-up progress">
      {STEPS.map((s, i) => {
        const n = i + 1;
        const done = n < step;
        const here = n === step;
        return (
          <li key={s} aria-current={here ? "step" : undefined} className="flex items-center gap-3">
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${done ? "bg-lime text-ink" : here ? "border-2 border-lime text-lime" : "border-2 border-white/20 text-[#8F9BB3]"}`}>{done ? "✓" : n}</span>
            <span className={`font-bold ${here ? "text-white" : done ? "text-[#E5E9F0]" : "text-[#8F9BB3]"}`}>{s}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** Step 1: find your company. */
function CompanyStep({ onPick, onGoogle }: { onPick: (c: CompanyInfo) => void; onGoogle: (idToken: string, c: CompanyInfo) => Promise<void> }) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<CompanyInfo[] | null>(null);
  const [picked, setPicked] = useState<CompanyInfo | null>(null);
  const latest = useRef(0);
  const [googleError, setGoogleError] = useState<string>();
  const [googleBusy, setGoogleBusy] = useState(false);

  function change(v: string) {
    setQ(v);
    setPicked(null);
    setGoogleError(undefined);
    const id = ++latest.current;
    if (v.trim().length < 2) {
      setFound(null);
      return;
    }
    searchCompanies(v).then((r) => id === latest.current && setFound(r));
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-extrabold">Find your company</h1>
        <p className="mt-1.5 text-sm text-muted">Type the name of the company you work for. It must already be on RYDO.</p>
      </div>
      <div className="relative">
        <Input id="company" label="Company name" autoComplete="organization" placeholder="For example Acme Tech" value={q} onChange={(e) => change(e.target.value)} aria-describedby="company-hint" />
        <span id="company-hint" className="sr-only">Suggestions appear below as you type</span>
      </div>

      {found && found.length > 0 && !picked && (
        <ul className="flex flex-col gap-2" aria-label="Companies on RYDO">
          {found.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => { setPicked(c); setQ(c.name); }} className="flex w-full items-center gap-3 rounded-2xl border-[1.5px] border-line-strong bg-white p-3 text-left hover:border-ink">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2 font-extrabold">{c.name[0]}</span>
                <span><span className="block font-extrabold">{c.name}</span><span className="text-xs text-muted">Work email ends with @{c.domains[0]}</span></span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {found && found.length === 0 && q.trim().length >= 2 && (
        <Notice tone="error">
          We could not find “{q.trim()}” on RYDO. Check the spelling, or <Link href="/contact" className="font-extrabold underline">ask us to onboard your company</Link>.
        </Notice>
      )}

      {picked && (
        <div role="status" className="flex items-start gap-3 rounded-2xl bg-success-bg p-4 text-success">
          <span aria-hidden="true" className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success text-xs text-white">✓</span>
          <span className="text-sm"><b>{picked.name} is on RYDO.</b> Use your work email ending in <b>@{picked.domains[0]}</b> to register.</span>
        </div>
      )}

      <Button className="h-12" disabled={!picked} onClick={() => picked && onPick(picked)}>Continue with the form</Button>

      {picked && (
        <div className="flex flex-col gap-3">
          <OrDivider />
          <GoogleButton
            text="signup_with"
            disabled={googleBusy}
            onError={(m) => setGoogleError(m)}
            onCredential={(token) => {
              setGoogleError(undefined);
              setGoogleBusy(true);
              onGoogle(token, picked)
                .catch((err) => setGoogleError(err instanceof RequestError ? err.message : "Something went wrong. Please try again."))
                .finally(() => setGoogleBusy(false));
            }}
          />
          <p className="text-center text-xs text-muted">Use your <b>@{picked.domains[0]}</b> Google account. Other Google accounts are not accepted.</p>
          {googleError && <Notice tone="error">{googleError}</Notice>}
        </div>
      )}
      <p className="text-center text-sm text-muted">Not on RYDO yet? <Link href="/contact" className="font-extrabold text-ink underline">Contact us</Link></p>
    </div>
  );
}

/** Step 2: the employee's details. */
function DetailsStep({ company, initial, onBack, onSubmit, viaGoogle }: { company: CompanyInfo; initial: EmployeeDetails; onBack: () => void; onSubmit: (d: EmployeeDetails) => Promise<void>; viaGoogle: boolean }) {
  const [d, setD] = useState(initial);
  const [consent, setConsent] = useState(false);
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
      await onSubmit({ ...d, workEmail: d.workEmail.trim().toLowerCase(), managerEmail: d.managerEmail.trim().toLowerCase(), idNumber: rule.clean(d.idNumber), phone: digitsOnly(d.phone).slice(-10) });
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
        <h1 className="text-2xl font-extrabold">Your details</h1>
        <p className="mt-1.5 text-sm text-muted">Registering with <b>{company.name}</b>. <button type="button" onClick={onBack} className="font-extrabold text-ink underline">Change company</button></p>
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
            <Select id="f-department" label="Department" value={d.department} onChange={(e) => set("department", e.target.value)} aria-invalid={errors.department ? true : undefined}>
              <option value="">Choose…</option>
              {company.departments.map((x) => <option key={x}>{x}</option>)}
            </Select>
            {errors.department && <span className="text-sm font-semibold text-danger">{errors.department}</span>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Select id="f-office" label="Office" value={d.office} onChange={(e) => set("office", e.target.value)} aria-invalid={errors.office ? true : undefined}>
              <option value="">Choose…</option>
              {company.offices.map((x) => <option key={x}>{x}</option>)}
            </Select>
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
        <Button type="button" variant="ghost" className="h-12" onClick={onBack}>Back</Button>
        <Button type="submit" loading={busy} className="h-12 flex-1">{viaGoogle ? "Send request to HR" : "Send verification code"}</Button>
      </div>
    </form>
  );
}

/** Step 3: confirm the email with the 6-digit code. */
function VerifyStep({ email, onVerified, onBack }: { email: string; onVerified: () => Promise<void>; onBack: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [cool, setCool] = useState(30);
  const [resent, setResent] = useState(false);
  const [verified, setVerified] = useState(false); // the code was right; only sending the request to HR is left

  useEffect(() => {
    if (cool <= 0) return;
    const t = setTimeout(() => setCool((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cool]);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      if (!verified) {
        await verifyEmailCode(email, code);
        setVerified(true);
      }
      await onVerified();
    } catch (err) {
      setError(err instanceof RequestError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setError(undefined);
    try {
      await requestEmailCode(email);
      setResent(true);
      setCool(30);
    } catch (err) {
      setError(err instanceof RequestError ? err.message : "Could not resend the code.");
    }
  }

  return (
    <form onSubmit={verify} className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-extrabold">Verify your email</h1>
        <p className="mt-1.5 text-sm text-muted">We sent a 6-digit code to <b className="text-ink">{email}</b>. It can take a minute to arrive.</p>
      </div>
      <Input id="code" label="6-digit code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={code} onChange={(e) => setCode(digitsOnly(e.target.value))} />
      {resent && !error && <Notice tone="ok">A new code was sent.</Notice>}
      {verified && <Notice tone="ok">Your email is verified.</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      <Button type="submit" loading={busy} disabled={!verified && code.length !== 6} className="h-12">{verified ? "Try sending again" : "Verify and finish"}</Button>
      <div className="flex items-center justify-between text-sm">
        <button type="button" onClick={onBack} className="font-bold underline">Change my details</button>
        <button type="button" onClick={resend} disabled={cool > 0} className="font-bold underline disabled:cursor-not-allowed disabled:no-underline disabled:opacity-50">{cool > 0 ? `Resend code in ${cool}s` : "Resend code"}</button>
      </div>
    </form>
  );
}

/** Step 4: what happens next. */
function DoneStep({ company, details }: { company: CompanyInfo; details: EmployeeDetails }) {
  const router = useRouter();
  return (
    <div role="status" className="flex flex-col gap-5">
      <span aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-full bg-lime text-2xl">✓</span>
      <div>
        <h1 className="text-2xl font-extrabold">Thank you, {details.fullName.split(" ")[0]}!</h1>
        <p className="mt-1.5 text-sm text-muted">Your request has been sent to the HR team at <b className="text-ink">{company.name}</b>. Once they approve your account, we will inform you by email at <b className="text-ink">{details.workEmail}</b>.</p>
      </div>
      <ol className="flex flex-col gap-3 rounded-2xl bg-surface p-4 text-sm" aria-label="What happens next">
        <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-lime text-xs font-extrabold">✓</span><span><b>Email verified</b> and your request sent to HR</span></li>
        <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-line-strong text-xs font-extrabold">2</span><span>{company.name} HR reviews your details</span></li>
        <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-line-strong text-xs font-extrabold">3</span><span>We email you, and you can start finding and offering rides</span></li>
      </ol>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted">Employee ID</dt><dd className="font-bold">{details.employeeId}</dd>
        <dt className="text-muted">Department</dt><dd className="font-bold">{details.department}</dd>
        <dt className="text-muted">Reporting manager</dt><dd className="font-bold">{details.managerName}</dd>
      </dl>
      <Button className="h-12" onClick={() => router.replace("/")}>Continue</Button>
    </div>
  );
}

export default function SignUpPage() {
  const { reload } = useSession();
  const [step, setStep] = useState<Step>(1);
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [details, setDetails] = useState<EmployeeDetails>(blank);
  /** Signed up with Google: the email is already proven, so there is no code step. */
  const [viaGoogle, setViaGoogle] = useState(false);

  return (
    <main className="grid flex-1 lg:grid-cols-[1fr_1.4fr]">
      <aside className="relative hidden overflow-hidden bg-ink p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <span aria-hidden="true" className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-lime/15 blur-3xl" />
        <Link href="/welcome" className="relative w-fit"><Logo light /></Link>
        <div className="relative">
          <p className="text-4xl font-extrabold leading-tight">Join your team<br />on RYDO.</p>
          <p className="mt-3 max-w-sm text-[#B8C2D6]">Register once with your work details. Your company&apos;s HR approves you before your first ride.</p>
          <Progress step={step} />
        </div>
        <p className="relative text-sm text-[#8F9BB3]">Already registered? <Link href="/sign-in" className="font-extrabold text-lime underline">Log in</Link></p>
      </aside>

      <div className="flex items-start justify-center p-4 sm:p-8 lg:items-center">
        <div className="w-full max-w-xl rounded-[28px] bg-white p-6 shadow-lift sm:p-8">
          <div className="mb-6 flex items-center justify-between lg:hidden">
            <Link href="/welcome"><Logo /></Link>
            <span className="text-sm font-bold text-muted">Step {step} of 4</span>
          </div>
          <div className="mb-6 h-1.5 overflow-hidden rounded-full bg-surface-2 lg:hidden" aria-hidden="true"><div className="h-full rounded-full bg-lime transition-all" style={{ width: `${step * 25}%` }} /></div>

          {step === 1 && (
            <CompanyStep
              onPick={(c) => { setCompany(c); setViaGoogle(false); setStep(2); }}
              onGoogle={async (idToken, c) => {
                // The server refuses any Google account that is not from this company's domain.
                const res = await googleAuth(idToken, "signup", c.domains[0]);
                await reload();
                setCompany(c);
                setViaGoogle(true);
                setDetails({ ...blank, fullName: res.user.name, workEmail: res.user.email });
                setStep(2);
              }}
            />
          )}
          {step === 2 && company && (
            <DetailsStep
              company={company}
              initial={details}
              viaGoogle={viaGoogle}
              onBack={() => setStep(1)}
              onSubmit={async (d) => {
                setDetails(d);
                if (viaGoogle) {
                  await submitRegistration(d); // already signed in with Google: ask HR right away
                  await reload();
                  setStep(4);
                } else {
                  await requestEmailCode(d.workEmail);
                  setStep(3);
                }
              }}
            />
          )}
          {step === 3 && (
            <VerifyStep
              email={details.workEmail}
              onBack={() => setStep(2)}
              onVerified={async () => {
                // Email is confirmed: save the details and ask the company's HR to approve.
                await submitRegistration(details);
                await reload();
                setStep(4);
              }}
            />
          )}
          {step === 4 && company && <DoneStep company={company} details={details} />}
          {step === 1 && <p className="mt-6 text-center text-sm text-muted lg:hidden">Already registered? <Link href="/sign-in" className="font-extrabold text-ink underline">Log in</Link></p>}
        </div>
      </div>
    </main>
  );
}
