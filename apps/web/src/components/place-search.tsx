"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { PlaceDetails, PlaceSuggestion } from "@rydo/shared";
import { api, RequestError } from "@/lib/api";
import { Icon } from "@/components/icons";

const newSession = () => crypto.randomUUID();

/** Address search backed by Google Places through the RYDO API. Typing + the final pick count as one Google search. */
export function PlaceSearch({
  label,
  onPick,
  placeholder = "Search an address or landmark",
  leading,
  hideLabel = false,
  autoFocus = false,
  clearOnPick = false,
}: {
  label: string;
  onPick: (p: PlaceDetails) => void;
  placeholder?: string;
  leading?: React.ReactNode;
  hideLabel?: boolean;
  autoFocus?: boolean;
  /** Empty the box after a pick (for "add another" lists). */
  clearOnPick?: boolean;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<PlaceSuggestion[]>([]);
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string>();
  const session = useRef(newSession());
  const picked = useRef<string | null>(null);

  useEffect(() => {
    if (query.trim().length < 2 || query === picked.current) return;
    const t = setTimeout(() => {
      setSearching(true);
      api<PlaceSuggestion[]>("GET", `/maps/autocomplete?q=${encodeURIComponent(query.trim())}&session=${session.current}`).then(
        (s) => {
          setItems(s);
          setActive(-1);
          setOpen(true);
          setError(undefined);
          setSearching(false);
        },
        (e) => {
          setError(e instanceof RequestError ? e.message : "Search failed.");
          setSearching(false);
        },
      );
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  async function pick(s: PlaceSuggestion) {
    setOpen(false);
    picked.current = clearOnPick ? "" : `${s.main}, ${s.secondary}`;
    setQuery(picked.current);
    try {
      onPick(await api<PlaceDetails>("GET", `/maps/places/${encodeURIComponent(s.placeId)}?session=${session.current}`));
    } catch (e) {
      setError(e instanceof RequestError ? e.message : "Could not load that place.");
    } finally {
      session.current = newSession();
    }
  }

  return (
    <div className="relative flex flex-col gap-1.5">
      <label htmlFor={id} className={hideLabel ? "sr-only" : "text-sm font-bold"}>{label}</label>
      <div className="relative">
        {leading && <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2">{leading}</span>}
        <input
          id={id}
          role="combobox"
          aria-expanded={open && items.length > 0}
          aria-controls={`${id}-list`}
          aria-activedescendant={active >= 0 ? `${id}-opt-${active}` : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          autoFocus={autoFocus}
          value={query}
          placeholder={placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            if (e.target.value.trim().length < 2) setOpen(false);
          }}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onFocus={() => items.length > 0 && query !== picked.current && setOpen(true)}
          onKeyDown={(e) => {
            if (!open || !items.length) return;
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            if (e.key === "Enter" && active >= 0) { e.preventDefault(); pick(items[active]); }
            if (e.key === "Escape") setOpen(false);
          }}
          className={`h-12 w-full rounded-2xl border-[1.5px] border-line-strong bg-white pr-10 text-base font-semibold outline-none transition-colors placeholder:font-medium placeholder:text-muted/70 focus:border-ink ${leading ? "pl-11" : "pl-4"}`}
        />
        <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted">
          {searching ? <span aria-hidden="true" className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" /> : <Icon name="search" size={18} />}
        </span>
      </div>
      {open && items.length > 0 && (
        <ul id={`${id}-list`} role="listbox" className="absolute top-full z-30 mt-1.5 w-full animate-rise overflow-hidden rounded-2xl border border-line bg-white p-1.5 shadow-lift">
          {items.map((s, i) => (
            <li
              key={s.placeId}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); pick(s); }}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 ${i === active ? "bg-surface-2" : ""}`}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21s-7-6.1-7-11.5a7 7 0 0 1 14 0C19 14.9 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-extrabold">{s.main}</span>
                <span className="block truncate text-xs text-muted">{s.secondary}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {error && <span className="text-sm font-semibold text-danger">{error}</span>}
    </div>
  );
}
