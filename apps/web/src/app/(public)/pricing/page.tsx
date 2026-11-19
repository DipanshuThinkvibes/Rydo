import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Pricing" };

export default function Pricing() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-8">
      <h1 className="text-4xl font-extrabold">Pricing</h1>
      <div className="mt-8 rounded-[28px] bg-ink p-8 text-white shadow-lift">
        <p className="text-sm font-extrabold uppercase tracking-[3px] text-lime">Right now</p>
        <p className="mt-2 text-5xl font-extrabold">Free</p>
        <p className="mt-3 text-[#B8C2D6]">RYDO is free for companies and employees during this period. There are no plans to choose, no payments to make and no in-app payments between riders and drivers.</p>
        <ul className="mt-5 flex flex-col gap-2 text-sm">
          {["Unlimited rides and bookings", "Live trips, SOS, chat and ratings", "Admin dashboard, reports and surveys", "Support from the RYDO team"].map((x) => (
            <li key={x} className="flex items-center gap-2"><span className="text-lime">✓</span> {x}</li>
          ))}
        </ul>
        <Link href="/contact" className="mt-6 inline-flex h-11 items-center rounded-2xl bg-lime px-5 font-extrabold text-ink">Bring RYDO to your company</Link>
      </div>
      <p className="mt-5 text-sm text-muted">Fuel cost-sharing is shown only as an estimate to help riders and drivers agree between themselves. If paid plans are introduced later, companies will be told well in advance.</p>
    </div>
  );
}
