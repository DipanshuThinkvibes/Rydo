import type { ButtonHTMLAttributes, InputHTMLAttributes } from "react";
import { Icon } from "@/components/icons";

type Variant = "primary" | "lime" | "ghost" | "danger" | "soft";
const variants: Record<Variant, string> = {
  primary: "bg-ink text-white hover:bg-ink-2 shadow-[0_6px_16px_rgba(11,20,38,.18)]",
  lime: "bg-lime text-ink hover:bg-lime-hover shadow-[0_6px_16px_rgba(140,190,40,.28)]",
  ghost: "bg-white text-ink border-[1.5px] border-line-strong hover:border-ink",
  danger: "bg-danger text-white hover:bg-red-700",
  soft: "bg-surface-2 text-ink hover:bg-line",
};

export function Button({ variant = "primary", loading = false, className = "", children, disabled, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-2xl px-5 text-sm font-extrabold transition-all duration-150 active:scale-[.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 ${variants[variant]} ${className}`}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent ${className}`} />;
}

const fieldBase = "h-12 rounded-2xl border-[1.5px] border-line-strong bg-surface px-4 text-base font-semibold outline-none transition-colors focus:border-ink focus:bg-white";
export const fieldClass = fieldBase;

export function Input({ label, error, id, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-bold">
        {label}
      </label>
      <input id={id} {...props} className={fieldBase} />
      {error && <span className="text-sm font-semibold text-danger">{error}</span>}
    </div>
  );
}

export function Select({ label, id, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-bold">
        {label}
      </label>
      <select id={id} {...props} className={`${fieldBase} px-3`}>
        {children}
      </select>
    </div>
  );
}

export function Textarea({ label, error, id, hint, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-bold">
        {label}
      </label>
      <textarea id={id} rows={4} {...props} className={`${fieldBase} h-auto resize-y py-3`} />
      {hint && <span className="text-xs text-muted">{hint}</span>}
      {error && <span className="text-sm font-semibold text-danger">{error}</span>}
    </div>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-[22px] border border-line/70 bg-white p-5 shadow-soft ${className}`}>{children}</div>;
}

export function PageHeader({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="flex animate-rise flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[28px] font-extrabold leading-tight tracking-tight">{title}</h1>
        {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function Notice({ tone, children, onClose }: { tone: "error" | "ok"; children: React.ReactNode; onClose?: () => void }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`flex animate-rise items-start gap-3 rounded-2xl px-4 py-3 text-sm font-semibold ${tone === "error" ? "bg-red-50 text-danger" : "bg-success-bg text-success"}`}
    >
      <Icon name={tone === "error" ? "alert" : "check"} size={18} className="mt-px" />
      <span className="flex-1">{children}</span>
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Dismiss" className="-m-1 rounded-lg p-1 opacity-70 hover:opacity-100">
          <Icon name="x" size={16} />
        </button>
      )}
    </div>
  );
}

export function Badge({ tone, children, dot = false }: { tone: "success" | "warning" | "neutral" | "ink" | "lime"; children: React.ReactNode; dot?: boolean }) {
  const tones = {
    success: "bg-success-bg text-success",
    warning: "bg-warning-bg text-warning",
    neutral: "bg-surface-2 text-ink",
    ink: "bg-ink text-white",
    lime: "bg-lime text-ink",
  };
  return (
    <span className={`inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-extrabold ${tones[tone]}`}>
      {dot && (
        <span className="relative flex h-2 w-2">
          <span className="absolute inset-0 animate-ping-soft rounded-full bg-current" />
          <span className="relative h-2 w-2 rounded-full bg-current" />
        </span>
      )}
      {children}
    </span>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`skeleton rounded-2xl ${className}`} />;
}

/** On/off switch with a visible label. */
export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-1">
      <span className="flex flex-col">
        <span className="text-sm font-bold">{label}</span>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </span>
      <input type="checkbox" role="switch" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="relative h-7 w-12 shrink-0 rounded-full bg-line-strong transition-colors peer-checked:bg-ink peer-focus-visible:ring-2 peer-focus-visible:ring-lime peer-focus-visible:ring-offset-2 after:absolute after:left-1 after:top-1 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5 peer-checked:after:bg-lime" />
    </label>
  );
}

/** Segmented choice (one of a few). */
export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-2xl bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`h-9 rounded-xl px-3.5 text-sm font-extrabold transition-all ${value === o.value ? "bg-white text-ink shadow-soft" : "text-muted hover:text-ink"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Number stepper for small counts like seats. */
export function Stepper({ value, onChange, min = 1, max = 4, label }: { value: number; onChange: (v: number) => void; min?: number; max?: number; label: string }) {
  return (
    <div className="flex items-center gap-1 rounded-2xl bg-surface-2 p-1" role="group" aria-label={label}>
      <button type="button" aria-label={`Fewer ${label.toLowerCase()}`} disabled={value <= min} onClick={() => onChange(value - 1)} className="flex h-9 w-9 items-center justify-center rounded-xl bg-white shadow-soft disabled:opacity-40">
        <Icon name="minus" size={16} />
      </button>
      <span className="w-8 text-center font-extrabold tabular-nums" aria-live="polite">{value}</span>
      <button type="button" aria-label={`More ${label.toLowerCase()}`} disabled={value >= max} onClick={() => onChange(value + 1)} className="flex h-9 w-9 items-center justify-center rounded-xl bg-white shadow-soft disabled:opacity-40">
        <Icon name="plus" size={16} />
      </button>
    </div>
  );
}

/** Circular score / progress ring. */
export function Ring({ value, size = 52, stroke = 5, tone = "ink", children }: { value: number; size?: number; stroke?: number; tone?: "ink" | "lime" | "orange"; children?: React.ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = { ink: "#0B1426", lime: "#8CC63F", orange: "#EA580C" }[tone];
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#EEF1F5" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(1, value)))} className="transition-[stroke-dashoffset] duration-700 ease-out" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center">{children}</span>
    </span>
  );
}

export function Avatar({ name, tone = "sky", size = 44, photoUrl }: { name: string; tone?: "sky" | "orange" | "lime" | "ink"; size?: number; photoUrl?: string | null }) {
  const tones = { sky: "bg-[#DCE6FF] text-[#1E3A8A]", orange: "bg-[#FFEDD5] text-[#9A3412]", lime: "bg-lime text-ink", ink: "bg-ink text-lime" };
  const letters = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
  if (photoUrl)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photoUrl} alt={`Photo of ${name}`} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  return (
    <span aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-full font-extrabold ${tones[tone]}`} style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {letters}
    </span>
  );
}

export function EmptyState({ icon, title, children }: { icon: Parameters<typeof Icon>[0]["name"]; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex animate-rise flex-col items-center gap-2 rounded-[22px] border-[1.5px] border-dashed border-line-strong bg-white/60 px-6 py-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-2 text-muted"><Icon name={icon} /></span>
      <p className="font-extrabold">{title}</p>
      {children && <p className="max-w-sm text-sm text-muted">{children}</p>}
    </div>
  );
}

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-lime shadow-[0_6px_16px_rgba(140,190,40,.35)]">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0B1426" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="6" cy="18" r="2.5" />
          <circle cx="18" cy="6" r="2.5" />
          <path d="M8.5 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.5" />
        </svg>
      </span>
      <span className={`text-lg font-extrabold tracking-[3px] ${light ? "text-white" : ""}`}>RYDO</span>
    </span>
  );
}
