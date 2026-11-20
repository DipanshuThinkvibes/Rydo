"use client";

import { useEffect, useRef } from "react";

type Gsi = {
  accounts: { id: { initialize: (o: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: string }) => void; renderButton: (el: HTMLElement, o: Record<string, unknown>) => void } };
};
declare global {
  interface Window {
    google?: Gsi;
  }
}

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
let loading: Promise<void> | null = null;

/** Loads Google's sign-in script once. */
function loadGoogle() {
  if (window.google) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error("load"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

const GoogleG = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3A12 12 0 1 1 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7A20 20 0 1 0 44 24c0-1.3-.1-2.6-.4-3.9z" />
    <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8A12 12 0 0 1 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7A20 20 0 0 0 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2A12 12 0 0 1 12.7 28l-6.5 5A20 20 0 0 0 24 44z" />
    <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3a12 12 0 0 1-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
  </svg>
);

/**
 * "Continue with Google". With a Google client id it shows Google's own button; without one it shows a look-alike
 * that explains Google sign-in is not set up yet, so people are never left guessing.
 */
export function GoogleButton({ text = "continue_with", onCredential, onError, disabled }: { text?: "signin_with" | "signup_with" | "continue_with"; onCredential: (idToken: string) => void; onError: (message: string) => void; disabled?: boolean }) {
  const holder = useRef<HTMLDivElement>(null);
  const cb = useRef({ onCredential, onError });
  useEffect(() => {
    cb.current = { onCredential, onError };
  });

  useEffect(() => {
    if (!CLIENT_ID || !holder.current) return;
    const el = holder.current;
    let live = true;
    loadGoogle().then(
      () => {
        if (!live || !window.google) return;
        window.google.accounts.id.initialize({ client_id: CLIENT_ID, callback: (r) => cb.current.onCredential(r.credential) });
        el.innerHTML = "";
        window.google.accounts.id.renderButton(el, { type: "standard", theme: "outline", size: "large", text, shape: "pill", logo_alignment: "left", width: Math.min(400, el.clientWidth || 360) });
      },
      () => cb.current.onError("We could not load Google sign-in. Check your connection, or use your email instead."),
    );
    return () => {
      live = false;
    };
  }, [text]);

  if (!CLIENT_ID) {
    const label = text === "signup_with" ? "Sign up with Google" : text === "signin_with" ? "Sign in with Google" : "Continue with Google";
    return (
      <button type="button" disabled={disabled} onClick={() => onError("Google sign-in is not set up yet. Please use your email instead.")} className="flex h-12 w-full items-center justify-center gap-3 rounded-full border-[1.5px] border-line-strong bg-white font-extrabold hover:border-ink">
        <GoogleG /> {label}
      </button>
    );
  }
  return <div ref={holder} aria-label="Google sign-in" className={`flex min-h-11 w-full justify-center ${disabled ? "pointer-events-none opacity-50" : ""}`} />;
}

/** "or" line between the form and the Google button. */
export function OrDivider() {
  return (
    <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-[2px] text-muted" role="separator">
      <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
    </div>
  );
}
