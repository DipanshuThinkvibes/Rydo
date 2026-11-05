"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, RequestError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Button, Input, Logo } from "@/components/ui";

type Mode = "password" | "email" | "code";

export default function SignInPage() {
  const router = useRouter();
  const { reload } = useSession();
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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

  const finish = async () => {
    await reload();
    router.replace("/");
  };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "password") {
      run(async () => {
        await api("POST", "/auth/password/login", { email, password, client: "WEB" });
        await finish();
      });
    } else if (mode === "email") {
      run(async () => {
        await api("POST", "/auth/otp/request", { email });
        setMode("code");
      });
    } else {
      run(async () => {
        await api("POST", "/auth/otp/verify", { email, code, client: "WEB" });
        await finish();
      });
    }
  }

  const switchTo = (m: Mode) => {
    setMode(m);
    setError(undefined);
    setCode("");
  };

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-md rounded-[28px] bg-white p-8 shadow-[0_10px_30px_rgba(11,20,38,.08)]">
        <Logo />
        <h1 className="mt-8 text-2xl font-extrabold">{mode === "code" ? "Enter the code" : "Admin sign in"}</h1>
        <p className="mt-1.5 text-sm text-muted">
          {mode === "code" ? `We sent a 6-digit code to ${email}.` : "For HR, operations and company admins. Riders and drivers use the RYDO app."}
        </p>
        <form className="mt-6 flex flex-col gap-4" onSubmit={submit}>
          {mode !== "code" && (
            <Input id="email" label="Work email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
          )}
          {mode === "password" && (
            <Input id="password" label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          )}
          {mode === "code" && (
            <Input id="code" label="6-digit code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
          )}
          {error && (
            <p role="alert" className="text-sm font-semibold text-danger">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy}>
            {busy ? "Please wait…" : mode === "email" ? "Send code" : "Sign in"}
          </Button>
          <button type="button" className="min-h-11 text-sm font-bold underline" onClick={() => switchTo(mode === "password" ? "email" : "password")}>
            {mode === "password" ? "Sign in with an email code instead" : "Sign in with a password instead"}
          </button>
        </form>
      </div>
    </main>
  );
}
