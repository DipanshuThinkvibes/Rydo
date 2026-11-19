import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: { absolute: "RYDO: carpool with your colleagues" }, description: "Share the ride to work with verified colleagues. Approved by your company, safe, and free to use." };

const Arrow = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>;

/** The hero picture: a route with a pickup chip, drawn in SVG so it needs no image files. */
function RouteArt() {
  return (
    <div className="relative mx-auto w-full max-w-md rounded-[32px] bg-ink p-6 shadow-lift">
      <span aria-hidden="true" className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-lime/20 blur-3xl" />
      <svg viewBox="0 0 400 300" className="relative w-full" role="img" aria-label="A route from a rider's home to the office with a pickup point">
        <path d="M40 250 C 130 250, 100 140, 200 140 S 300 50, 360 50" fill="none" stroke="#1E2A44" strokeWidth="16" strokeLinecap="round" />
        <path d="M40 250 C 130 250, 100 140, 200 140 S 300 50, 360 50" fill="none" stroke="#C8F560" strokeWidth="5" strokeLinecap="round" strokeDasharray="10 12" />
        <circle cx="40" cy="250" r="12" fill="#fff" stroke="#0B1426" strokeWidth="5" />
        <rect x="344" y="34" width="28" height="28" rx="7" fill="#0B1426" stroke="#C8F560" strokeWidth="4" />
        <g transform="translate(166 104)"><rect width="84" height="32" rx="16" fill="#C8F560" /><text x="42" y="21" textAnchor="middle" fontSize="14" fontWeight="800" fill="#0B1426">Pickup</text></g>
      </svg>
      <div className="relative mt-2 flex items-center gap-3 rounded-2xl bg-ink-2 p-3 text-white">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-lime font-extrabold text-ink">S</span>
        <span className="flex-1 text-sm"><b>Sneha</b> is going your way<br /><span className="text-[#B8C2D6]">Leaves 8:30 · 2 seats left</span></span>
        <span className="rounded-full bg-lime px-3 py-1 text-xs font-extrabold text-ink">98% match</span>
      </div>
    </div>
  );
}

const tiles = [
  { id: "ride", t: "Ride", d: "Find colleagues already driving your way. See why each ride is suggested, request a seat, chat, and follow the car live.", cta: "Sign up to ride", href: "/sign-up", tone: "bg-surface-2" },
  { id: "drive", t: "Drive", d: "Offer the empty seats in your car on your daily route. HR verifies you once, then you publish rides for the week.", cta: "Sign up to drive", href: "/sign-up", tone: "bg-lime" },
  { id: "company", t: "Company", d: "Bring RYDO to your company with HR approval, live ride oversight, reports and surveys. We set everything up for you.", cta: "Contact us", href: "/contact", tone: "bg-ink text-white" },
];

const steps = [
  ["Sign up with your work email", "A 6-digit code confirms it is you. Your company's HR approves your account."],
  ["Find or offer a ride", "Search by pickup, drop and time, or publish your own route and seats."],
  ["Ride together", "Board with a PIN, follow the trip live, and rate each other afterwards."],
];

const safety = ["Every employee approved by HR", "Drivers' licence and vehicle checked", "Boarding PIN for every rider", "Live trip sharing with family", "SOS that alerts your company's admins at once", "Block and report, always one tap away"];

export default function Welcome() {
  return (
    <>
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:py-20">
        <div className="flex flex-col gap-6">
          <p className="w-fit rounded-full bg-lime px-3 py-1 text-xs font-extrabold uppercase tracking-[2px]">Carpool for companies</p>
          <h1 className="text-5xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">Ride to work with your team.</h1>
          <p className="max-w-lg text-lg text-muted">Colleagues already driving your way, verified by HR. Share the seat, cut the commute, and cut the cars on the road.</p>
          <div className="flex flex-wrap gap-3">
            <Link href="/sign-up" className="inline-flex h-14 items-center gap-2 rounded-full bg-ink px-8 text-base font-extrabold text-white hover:bg-ink-2">Sign up <Arrow /></Link>
            <Link href="/sign-in" className="inline-flex h-14 items-center rounded-full bg-surface-2 px-8 text-base font-extrabold hover:bg-line">Log in</Link>
          </div>
          <p className="text-sm text-muted">Want RYDO at your company? <Link href="/contact" className="font-extrabold text-ink underline">Contact us</Link></p>
        </div>
        <RouteArt />
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <h2 className="text-3xl font-extrabold sm:text-4xl">Choose how you use RYDO</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {tiles.map((t) => (
            <div key={t.id} id={t.id} className={`flex scroll-mt-24 flex-col gap-4 rounded-[28px] p-7 ${t.tone}`}>
              <h3 className="text-2xl font-extrabold">{t.t}</h3>
              <p className={`flex-1 text-sm ${t.tone.includes("text-white") ? "text-[#B8C2D6]" : "text-ink/75"}`}>{t.d}</p>
              <Link href={t.href} className={`inline-flex h-11 w-fit items-center gap-2 rounded-full px-5 text-sm font-extrabold ${t.tone.includes("text-white") ? "bg-lime text-ink" : "bg-ink text-white"}`}>{t.cta} <Arrow /></Link>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-ink py-16 text-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 sm:grid-cols-3 sm:px-6">
          {[["4 → 1", "cars off the road for every full ride"], ["HR", "approves everyone who joins"], ["Free", "for companies and employees"]].map(([n, l]) => (
            <div key={n}><p className="text-5xl font-extrabold text-lime">{n}</p><p className="mt-2 text-[#B8C2D6]">{l}</p></div>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2">
        <div>
          <h2 className="text-3xl font-extrabold sm:text-4xl">Safety, built in</h2>
          <p className="mt-3 max-w-md text-muted">Commuting with colleagues should feel safe from the first tap. These protections are part of every ride.</p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {safety.map((s) => (
            <li key={s} className="flex items-start gap-3 rounded-2xl bg-surface p-4 text-sm font-bold"><span aria-hidden="true" className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-lime text-xs">✓</span>{s}</li>
          ))}
        </ul>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <h2 className="text-3xl font-extrabold sm:text-4xl">How it works</h2>
        <ol className="mt-8 grid gap-4 md:grid-cols-3">
          {steps.map(([t, d], i) => (
            <li key={t} className="rounded-[28px] border border-line p-7">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ink font-extrabold text-lime">{i + 1}</span>
              <h3 className="mt-4 text-lg font-extrabold">{t}</h3>
              <p className="mt-1.5 text-sm text-muted">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <div className="relative overflow-hidden rounded-[36px] bg-ink px-8 py-14 text-white sm:px-14">
          <span aria-hidden="true" className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-lime/15 blur-3xl" />
          <h2 className="relative max-w-xl text-3xl font-extrabold sm:text-4xl">Bring RYDO to your company</h2>
          <p className="relative mt-3 max-w-xl text-[#B8C2D6]">Tell us about your company. The RYDO team sets up your offices and admins, and your employees sign in with their work email.</p>
          <div className="relative mt-7 flex flex-wrap gap-3">
            <Link href="/contact" className="inline-flex h-12 items-center gap-2 rounded-full bg-lime px-7 font-extrabold text-ink hover:bg-lime-hover">Contact us <Arrow /></Link>
            <Link href="/for-companies" className="inline-flex h-12 items-center rounded-full border-[1.5px] border-white/30 px-7 font-extrabold hover:bg-white/10">See what companies get</Link>
          </div>
        </div>
      </section>
    </>
  );
}
