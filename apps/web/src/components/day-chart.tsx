"use client";

import { useState } from "react";
import { fmtDay, isoDay } from "@/lib/format";
import { Card } from "@/components/ui";

/** Validated pair (dataviz validator, light surface): blue = rides, green = booked seats. */
export const RIDES_COLOR = "#2563EB";
export const BOOKINGS_COLOR = "#65A30D";

/** Two counts per day on one axis, with hover details and a table for screen readers. */
export function DayChart({ series, title = "Rides and booked seats by day" }: { series: { day: string; rides: number; bookings: number }[]; title?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const [today] = useState(() => isoDay(0));
  const max = Math.max(1, ...series.map((d) => Math.max(d.rides, d.bookings)));
  const top = max <= 2 ? 2 : Math.ceil(max / 4) * 4;
  const every = Math.max(1, Math.ceil(series.length / 16));
  const label = (iso: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: series.length > 31 ? "short" : undefined, timeZone: "Asia/Kolkata" }).format(new Date(`${iso}T12:00:00+05:30`));
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-extrabold">{title}</h2>
        <div className="flex gap-4 text-xs font-bold text-muted" aria-hidden="true">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: RIDES_COLOR }} /> Rides</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: BOOKINGS_COLOR }} /> Booked seats</span>
        </div>
      </div>
      <div className="relative h-48 pl-7" role="img" aria-label={`${title}. A table follows.`}>
        {[1, 0.5, 0].map((f) => (
          <div key={f} className="pointer-events-none absolute inset-x-0 flex items-center gap-2" style={{ bottom: `${f * 100}%` }}>
            <span className="w-5 text-right text-[10px] font-bold text-muted tabular-nums">{Math.round(top * f)}</span>
            <span className={`h-px flex-1 ${f === 0 ? "bg-line-strong" : "bg-line"}`} />
          </div>
        ))}
        <div className={`absolute inset-y-0 left-7 right-0 flex items-end ${series.length > 60 ? "gap-px" : "gap-1"}`}>
          {series.map((d, i) => (
            <div key={d.day} className="relative flex h-full min-w-0 flex-1 items-end justify-center gap-[2px]" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              {d.day === today && <span className="pointer-events-none absolute inset-0 rounded-lg bg-lime/20" />}
              {hover === i && <span className="pointer-events-none absolute inset-0 rounded-lg bg-surface-2" />}
              <span className="relative w-[40%] max-w-4 rounded-t-[4px] transition-[height] duration-500" style={{ height: `${(d.rides / top) * 100}%`, background: RIDES_COLOR, minHeight: d.rides ? 3 : 0 }} />
              <span className="relative w-[40%] max-w-4 rounded-t-[4px] transition-[height] duration-500" style={{ height: `${(d.bookings / top) * 100}%`, background: BOOKINGS_COLOR, minHeight: d.bookings ? 3 : 0 }} />
              {hover === i && (
                <span className={`absolute bottom-full z-10 mb-2 whitespace-nowrap rounded-xl bg-ink px-3 py-2 text-xs text-white shadow-lift ${i > series.length * 0.7 ? "right-0" : i < series.length * 0.3 ? "left-0" : ""}`}>
                  <span className="block font-extrabold">{fmtDay(`${d.day}T12:00:00+05:30`)}{d.day === today ? " · today" : ""}</span>
                  <span className="block">{d.rides} rides · {d.bookings} booked seats</span>
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="flex pl-7 text-center text-[10px] font-bold text-muted" aria-hidden="true">
        {series.map((d, i) => (
          <span key={d.day} className={`min-w-0 flex-1 overflow-visible whitespace-nowrap ${d.day === today ? "text-ink" : ""}`}>{i % every === 0 || d.day === today ? (d.day === today ? "Today" : label(d.day)) : ""}</span>
        ))}
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead><tr><th>Day</th><th>Rides</th><th>Booked seats</th></tr></thead>
        <tbody>{series.map((d) => <tr key={d.day}><td>{d.day}</td><td>{d.rides}</td><td>{d.bookings}</td></tr>)}</tbody>
      </table>
    </Card>
  );
}
