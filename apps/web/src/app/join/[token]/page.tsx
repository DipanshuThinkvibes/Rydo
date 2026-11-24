"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api, RequestError } from "@/lib/api";
import type { CompanyInfo, EmployeeDetails } from "@/lib/signup-api";
import { DetailsStep } from "@/components/employee-details-form";
import { Logo, Notice, Skeleton } from "@/components/ui";

interface InviteInfo { company: string; domains: string[]; departments: string[]; offices: string[]; expiresAt: string }

const blank: EmployeeDetails = { fullName: "", workEmail: "", phone: "", gender: "", idType: "AADHAAR", idNumber: "", employeeId: "", managerName: "", managerEmail: "", department: "", designation: "", office: "" };

/** The form behind an HR invite link. Submitting creates the account at once: no approval step. Links end after 24 hours. */
export default function JoinPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [problem, setProblem] = useState<string>();

  useEffect(() => {
    api<InviteInfo>("GET", `/public/invites/${token}`).then(setInfo, (e) => setProblem(e instanceof RequestError ? e.message : "This invite link could not be opened."));
  }, [token]);

  const company: CompanyInfo | null = info ? { id: "", name: info.company, domains: info.domains, departments: info.departments, offices: info.offices } : null;

  async function join(d: EmployeeDetails, password: string) {
    await api("POST", `/public/invites/${token}/join`, {
      fullName: d.fullName,
      email: d.workEmail,
      password,
      phone: d.phone,
      gender: d.gender,
      idType: d.idType,
      idLast4: d.idNumber.slice(-4),
      employeeId: d.employeeId,
      designation: d.designation,
      department: d.department,
      office: d.office,
      managerName: d.managerName,
      managerEmail: d.managerEmail,
      client: "WEB",
    });
    // The sign-in cookies are set, so the app opens in the new account.
    router.push("/");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 p-4 sm:p-8">
      <Link href="/" aria-label="RYDO home" className="w-fit"><Logo /></Link>
      {problem ? (
        <div className="flex flex-col gap-4 rounded-[28px] bg-white p-6 shadow-soft">
          <h1 className="text-2xl font-extrabold">This link cannot be used</h1>
          <Notice tone="error">{problem}</Notice>
          <p className="text-sm text-muted">Invite links work for 24 hours. Ask your HR team to send you a new one. If you already have an account, <Link href="/sign-in" className="font-extrabold underline">sign in</Link>.</p>
        </div>
      ) : !company || !info ? (
        <div className="flex flex-col gap-3"><Skeleton className="h-24" /><Skeleton className="h-72" /></div>
      ) : (
        <div className="flex flex-col gap-5 rounded-[28px] bg-white p-5 shadow-soft sm:p-8">
          <p className="w-fit rounded-full bg-lime px-3 py-1 text-xs font-extrabold text-ink">You were invited by {info.company}</p>
          <DetailsStep company={company} initial={blank} onSubmit={join} viaGoogle={false} withPassword heading="Create your RYDO account" submitLabel="Create my account" />
          <p className="text-xs text-muted">Your account is ready as soon as you submit. This link works until {new Date(info.expiresAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}. Already registered? <Link href="/sign-in" className="font-extrabold underline">Sign in</Link>.</p>
        </div>
      )}
    </main>
  );
}
