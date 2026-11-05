const TZ = "Asia/Kolkata";

export const fmtTime = (iso: string | Date) => new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: TZ }).format(new Date(iso));
export const fmtDay = (iso: string | Date) => new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: TZ }).format(new Date(iso));
export const fmtWhen = (iso: string | Date) => `${fmtDay(iso)}, ${fmtTime(iso)}`;
export const fmtKm = (m: number | null | undefined) => (m == null ? "" : `${(m / 1000).toFixed(1)} km`);
export const fmtMin = (s: number | null | undefined) => (s == null ? "" : `${Math.round(s / 60)} min`);

/** YYYY-MM-DD in India time, n days from today. */
export const isoDay = (offset = 0) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(Date.now() + offset * 86_400_000));

/** The next weekday (Mon–Fri) from tomorrow on. */
export function nextWorkday() {
  for (let i = 1; i < 8; i++) {
    const d = isoDay(i);
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (dow >= 1 && dow <= 5) return d;
  }
  return isoDay(1);
}

export const initials = (name: string) => name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();