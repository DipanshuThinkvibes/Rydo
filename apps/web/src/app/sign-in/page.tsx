"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, RequestError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Button, Input, Logo } from "@/components/ui";

export default function SignInPage() {
  const router = useRouter();
  const { reload } = useSession();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(undefined);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof RequestError ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const sendCode = () =>
    run(async () => {
      await api("POST", "/auth/otp/request", { email });
      setStep("code");
    });

  const verify = () =>
    run(async () => {
      await api("POST", "/auth/otp/verify", { email, code, client: "WEB" });
      await reload();
      router.replace("/");
    });

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-md rounded-[28px] bg-white p-8 shadow-[0_10px_30px_rgba(11,20,38,.08)]">
        <Logo />
        <h1 className="mt-8 text-2xl font-extrabold">{step === "email" ? "Admin sign in" : "Enter the code"}</h1>
        <p className="mt-1.5 text-sm text-muted">
          {step === "email" ? "For HR, operations and company admins. Riders and drivers use the RYDO app." : `We sent a 6-digit code to ${email}.`}
        </p>
        <form
          className="mt-6 flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (step === "email") sendCode();
            else verify();
          }}
        >
          {step === "email" ? (
            <Input id="email" label="Work email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
          ) : (
            <Input id="code" label="6-digit code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
          )}
          {error && (
            <p role="alert" className="text-sm font-semibold text-danger">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy}>
            {busy ? "Please wait…" : step === "email" ? "Send code" : "Sign in"}
          </Button>
          {step === "code" && (
            <button type="button" className="min-h-11 text-sm font-bold underline" onClick={() => { setStep("email"); setCode(""); }}>
              Use a different email
            </button>
          )}
        </form>
      </div>
    </main>
  );
}