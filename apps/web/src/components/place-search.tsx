"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { PlaceDetails, PlaceSuggestion } from "@rydo/shared";
import { api, RequestError } from "@/lib/api";

const newSession = () => crypto.randomUUID();

/** Address search backed by Google Places through the RYDO API. Typing + the final pick count as one Google search. */
export function PlaceSearch({ label, onPick, placeholder = "Search an address or landmark" }: { label: string; onPick: (p: PlaceDetails) => void; placeholder?: string }) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<PlaceSuggestion[]>([]);
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const session = useRef(newSession());
  const picked = useRef<string | null>(null);

  useEffect(() => {
    if (query.trim().length < 2 || query === picked.current) return;
    const t = setTimeout(() => {
      api<PlaceSuggestion[]>("GET", `/maps/autocomplete?q=${encodeURIComponent(query.trim())}&session=${session.current}`).then(
        (s) => {
          setItems(s);
          setActive(-1);
          setOpen(true);
          setError(undefined);
        },
        (e) => setError(e instanceof RequestError ? e.message : "Search failed."),
      );
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  async function pick(s: PlaceSuggestion) {
    setOpen(false);
    picked.current = `${s.main}, ${s.secondary}`;
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
      <label htmlFor={id} className="text-sm font-bold">{label}</label>
      <input
        id={id}
        role="combobox"
        aria-expanded={open && items.length > 0}
        aria-controls={`${id}-list`}
        aria-activedescendant={active >= 0 ? `${id}-opt-${active}` : undefined}
        autoComplete="off"
        value={query}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          if (e.target.value.trim().length < 2) setOpen(false);
        }}
        onKeyDown={(e) => {
          if (!open || !items.length) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          if (e.key === "Enter" && active >= 0) { e.preventDefault(); pick(items[active]); }
          if (e.key === "Escape") setOpen(false);
        }}
        className="h-12 rounded-2xl border-[1.5px] border-line-strong bg-surface px-4 text-base font-semibold outline-none focus:border-ink focus:bg-white"
      />
      {open && items.length > 0 && (
        <ul id={`${id}-list`} role="listbox" className="absolute top-full z-10 mt-1 w-full overflow-hidden rounded-2xl border border-line bg-white shadow-[0_10px_30px_rgba(11,20,38,.12)]">
          {items.map((s, i) => (
            <li
              key={s.placeId}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); pick(s); }}
              className={`cursor-pointer px-4 py-2.5 ${i === active ? "bg-surface-2" : "hover:bg-surface"}`}
            >
              <span className="block text-sm font-extrabold">{s.main}</span>
              <span className="block truncate text-xs text-muted">{s.secondary}</span>
            </li>
          ))}
        </ul>
      )}
      {error && <span className="text-sm font-semibold text-danger">{error}</span>}
    </div>
  );
}