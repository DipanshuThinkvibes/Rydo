"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, RequestError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Button, Input, Logo } from "@/components/ui";
import { GoogleButton, OrDivider } from "@/components/google-button";
import { googleAuth } from "@/lib/google-auth";
import { clearEnd, readEnd } from "@/lib/session-end";

type Mode = "password" | "email" | "code";

const noSubscribe = () => () => undefined;

export default function SignInPage() {
  const router = useRouter();
  // Why we are here: the website signs out after 2 hours without use, or the sign-in was ended elsewhere.
  const endReason = useSyncExternalStore(noSubscribe, readEnd, () => null);
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
    clearEnd();
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
    <main className="grid flex-1 lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-ink p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <span aria-hidden="true" className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-lime/15 blur-3xl" />
        <span aria-hidden="true" className="absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-[#2563eb]/20 blur-3xl" />
        <Logo light />
        <svg viewBox="0 0 400 260" className="relative w-full max-w-lg" aria-hidden="true">
          <path d="M30 220 C 110 220, 90 120, 180 120 S 280 40, 370 40" fill="none" stroke="#1E2A44" strokeWidth="14" strokeLinecap="round" />
          <path d="M30 220 C 110 220, 90 120, 180 120 S 280 40, 370 40" fill="none" stroke="#C8F560" strokeWidth="5" strokeLinecap="round" strokeDasharray="10 12">
            <animate attributeName="stroke-dashoffset" from="220" to="0" dur="6s" repeatCount="indefinite" />
          </path>
          <circle cx="30" cy="220" r="11" fill="#fff" stroke="#0B1426" strokeWidth="5" />
          <rect x="358" y="28" width="24" height="24" rx="6" fill="#0B1426" stroke="#C8F560" strokeWidth="4" />
          <g transform="translate(160 96)"><rect width="76" height="30" rx="15" fill="#C8F560" /><text x="38" y="20" textAnchor="middle" fontSize="13" fontWeight="800" fill="#0B1426">Pickup</text></g>
        </svg>
        <div className="relative">
          <p className="text-4xl font-extrabold leading-tight">Ride to work<br />with your team.</p>
          <p className="mt-3 max-w-sm text-[#B8C2D6]">Colleagues already driving your way, verified by HR. Share the seat, split the cost.</p>
        </div>
      </aside>
      <div className="flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-rise rounded-[28px] bg-white p-8 shadow-lift">
        <Logo />
        <h1 className="mt-8 text-2xl font-extrabold">{mode === "code" ? "Enter the code" : "Sign in to RYDO"}</h1>
        <p className="mt-1.5 text-sm text-muted">
          {mode === "code" ? `We sent a 6-digit code to ${email}.` : "Use your work email. Riders, drivers and admins all sign in here."}
        </p>
        {endReason && (
          <p role="status" className="mt-5 flex items-start gap-2 rounded-2xl bg-warning-bg p-3 text-sm font-bold text-warning">
            {endReason === "idle" ? "You were signed out because you were away for 2 hours. Sign in to carry on." : "Your session ended, for example because you were signed out on another device. Please sign in again."}
          </p>
        )}
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
          <Button type="submit" loading={busy} className="h-12">
            {busy ? "Please wait…" : mode === "email" ? "Send code" : "Sign in"}
          </Button>
          {mode === "password" && (
            <Link href="/forgot-password" className="text-center text-sm font-bold text-muted underline">
              Forgot password?
            </Link>
          )}
          <button type="button" className="min-h-11 text-sm font-bold underline" onClick={() => switchTo(mode === "password" ? "email" : "password")}>
            {mode === "password" ? "Sign in with an email code instead" : "Sign in with a password instead"}
          </button>
        </form>
        {mode !== "code" && (
          <div className="mt-5 flex flex-col gap-4">
            <OrDivider />
            <GoogleButton
              text="signin_with"
              disabled={busy}
              onError={(m) => setError(m)}
              onCredential={(token) =>
                run(async () => {
                  await googleAuth(token, "login");
                  clearEnd();
                  await reload();
                  router.replace("/");
                })
              }
            />
          </div>
        )}
        <p className="mt-5 border-t border-line pt-4 text-center text-sm text-muted">
          New to RYDO? <Link href="/sign-up" className="font-extrabold text-ink underline">Sign up</Link> · <Link href="/contact" className="font-extrabold text-ink underline">Bring RYDO to your company</Link>
        </p>
      </div>
      </div>
    </main>
  );
}
