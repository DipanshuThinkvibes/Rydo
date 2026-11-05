import type { ButtonHTMLAttributes, InputHTMLAttributes } from "react";

type Variant = "primary" | "lime" | "ghost" | "danger";
const variants: Record<Variant, string> = {
  primary: "bg-ink text-white hover:bg-ink-2",
  lime: "bg-lime text-ink hover:bg-lime-hover",
  ghost: "bg-white text-ink border-[1.5px] border-line-strong hover:border-ink",
  danger: "bg-danger text-white hover:bg-red-700",
};

export function Button({ variant = "primary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-2xl px-5 text-sm font-extrabold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
    />
  );
}

export function Input({ label, error, id, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-bold">
        {label}
      </label>
      <input
        id={id}
        {...props}
        className="h-12 rounded-2xl border-[1.5px] border-line-strong bg-surface px-4 text-base font-semibold outline-none focus:border-ink focus:bg-white"
      />
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
      <select id={id} {...props} className="h-12 rounded-2xl border-[1.5px] border-line-strong bg-surface px-3 text-base font-semibold outline-none focus:border-ink focus:bg-white">
        {children}
      </select>
    </div>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-[18px] border border-line bg-white p-5 ${className}`}>{children}</div>;
}

export function PageHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div>
      <h1 className="text-2xl font-extrabold">{title}</h1>
      {sub && <p className="text-sm text-muted">{sub}</p>}
    </div>
  );
}

export function Notice({ tone, children }: { tone: "error" | "ok"; children: React.ReactNode }) {
  return (
    <p role={tone === "error" ? "alert" : "status"} className={`text-sm font-semibold ${tone === "error" ? "text-danger" : "text-success"}`}>
      {children}
    </p>
  );
}

export function Badge({ tone, children }: { tone: "success" | "warning" | "neutral"; children: React.ReactNode }) {
  const tones = { success: "bg-success-bg text-success", warning: "bg-warning-bg text-warning", neutral: "bg-surface-2 text-ink" };
  return <span className={`inline-flex h-6 items-center rounded-full px-2.5 text-xs font-extrabold ${tones[tone]}`}>{children}</span>;
}

export function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-lime">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0B1426" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="6" cy="18" r="2.5" />
          <circle cx="18" cy="6" r="2.5" />
          <path d="M8.5 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.5" />
        </svg>
      </span>
      <span className="text-lg font-extrabold tracking-[3px]">RYDO</span>
    </span>
  );
}