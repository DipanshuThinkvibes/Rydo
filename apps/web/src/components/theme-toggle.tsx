"use client";

import { useSyncExternalStore } from "react";

export type ThemeChoice = "light" | "dark" | "system";
const KEY = "rydo-theme";
const listeners = new Set<() => void>();

function read(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

/** Applies the choice to <html data-theme>. "system" follows the device setting. */
function applyTheme(choice: ThemeChoice) {
  const dark = choice === "dark" || (choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

function setTheme(choice: ThemeChoice) {
  try {
    if (choice === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    /* private mode: the choice just lasts until the page closes */
  }
  applyTheme(choice);
  listeners.forEach((l) => l());
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => void listeners.delete(cb);
};

/** The effective theme ("light" or "dark") plus what the person chose. */
function useTheme() {
  const choice = useSyncExternalStore(subscribe, read, () => "system" as ThemeChoice);
  const dark = useSyncExternalStore(
    subscribe,
    () => document.documentElement.dataset.theme === "dark",
    () => false,
  );
  return { choice, dark };
}

const Sun = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
);
const Moon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
);

/** Small round header button: flips between light and dark. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { dark } = useTheme();
  return (
    <button type="button" onClick={() => setTheme(dark ? "light" : "dark")} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} title={dark ? "Light mode" : "Dark mode"} className={`inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-surface-2 ${className}`}>
      {dark ? <Sun /> : <Moon />}
    </button>
  );
}

/** Light / Dark / Match device picker, for the account page. */
export function ThemePicker() {
  const { choice } = useTheme();
  const opts: { id: ThemeChoice; label: string; swatch: string }[] = [
    { id: "light", label: "Light", swatch: "bg-[#f5f7fa]" },
    { id: "dark", label: "Dark", swatch: "bg-[#0a1020]" },
    { id: "system", label: "Match device", swatch: "bg-gradient-to-r from-[#f5f7fa] from-50% to-[#0a1020] to-50%" },
  ];
  return (
    <div role="radiogroup" aria-label="Appearance" className="grid grid-cols-3 gap-2">
      {opts.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={choice === o.id} onClick={() => setTheme(o.id)} className={`flex flex-col items-center gap-2 rounded-2xl border-[1.5px] p-3 text-sm font-extrabold ${choice === o.id ? "border-ink bg-surface-2" : "border-line-strong hover:border-ink"}`}>
          <span className={`h-10 w-full rounded-lg border border-line-strong ${o.swatch}`} />
          {o.label}
        </button>
      ))}
    </div>
  );
}
