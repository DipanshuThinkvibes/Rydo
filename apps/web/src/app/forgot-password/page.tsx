"use client";

import { useState } from "react";
import Link from "next/link";
import { api, RequestError } from "@/lib/api";
import { Button, Input, Logo, Notice } from "@/components/ui";

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<"email" | "reset" | "done">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    setFields({});
    try {
      if (step === "email") {
        await api("POST", "/auth/otp/request", { email });
        setStep("reset");
      } else {
        await api("POST", "/auth/password/reset", { email, code, newPassword: password });
        setStep("done");
      }
    } catch (err) {
      if (err instanceof RequestError) {
        setError(err.message);
        setFields(err.fields ?? {});
      } else setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-md rounded-[28px] bg-white p-8 shadow-[0_10px_30px_rgba(11,20,38,.08)]">
        <Logo />
        <h1 className="mt-8 text-2xl font-extrabold">{step === "done" ? "Password changed" : "Reset your password"}</h1>
        {step === "done" ? (
          <div className="mt-4 flex flex-col gap-4">
            <p className="text-sm text-muted">You&apos;ve been signed out everywhere else. Sign in with your new password.</p>
            <Link href="/sign-in" className="inline-flex h-11 items-center justify-center rounded-2xl bg-ink px-5 text-sm font-extrabold text-white hover:bg-ink-2">
              Go to sign in
            </Link>
          </div>
        ) : (
          <form className="mt-6 flex flex-col gap-4" onSubmit={submit}>
            <p className="text-sm text-muted">{step === "email" ? "We'll email you a 6-digit code." : `Enter the code sent to ${email} and choose a new password.`}</p>
            {step === "email" ? (
              <Input id="email" label="Work email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            ) : (
              <>
                <Input id="code" label="6-digit code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} error={fields.code} />
                <Input id="password" label="New password" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} error={fields.newPassword} />
                <p className="-mt-2 text-xs text-muted">At least 8 characters with a letter and a number.</p>
              </>
            )}
            {error && <Notice tone="error">{error}</Notice>}
            <Button type="submit" disabled={busy}>
              {busy ? "Please wait…" : step === "email" ? "Send code" : "Set new password"}
            </Button>
            <Link href="/sign-in" className="text-center text-sm font-bold underline">
              Back to sign in
            </Link>
          </form>
        )}
      </div>
    </main>
  );
}