import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "For companies" };

const items = [
  ["Your company, walled off", "Each company has its own space. Employees and admins only ever see their own people, rides and data."],
  ["HR stays in control", "HR approves every employee, verifies drivers' documents, and can suspend accounts at any time."],
  ["Oversight for operations", "A live map of rides, an SOS alert board, reports with CSV export, CO₂ saved, and a full activity log."],
  ["Listen to your people", "Collect feedback, run surveys, track reported issues from open to resolved, and see trends over time."],
  ["Talk to everyone", "Send announcements to the whole company, or just riders or drivers, in the app, on phones and by email."],
  ["Your rules", "Set the free-cancel window, pickup distance, request timeouts, offices and teams. Switch features on or off per company."],
];

export default function ForCompanies() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-14 sm:px-8">
      <h1 className="text-4xl font-extrabold">RYDO for companies</h1>
      <p className="mt-3 max-w-2xl text-muted">Give employees a safe, simple way to share the commute, with the controls your HR and operations teams need.</p>
      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {items.map(([t, d]) => (
          <div key={t} className="rounded-[22px] border border-line/70 bg-white p-6 shadow-soft">
            <h2 className="text-lg font-extrabold">{t}</h2>
            <p className="mt-2 text-sm text-muted">{d}</p>
          </div>
        ))}
      </div>
      <div className="mt-10 rounded-[22px] bg-surface-2 p-8">
        <h2 className="text-xl font-extrabold">Getting started</h2>
        <p className="mt-2 max-w-2xl text-muted">The RYDO team creates your company, your first admin and your offices. Your admin signs in, adds teams, and employees join with their work email.</p>
        <p className="mt-3 text-sm text-muted">Already set up? <Link href="/sign-in" className="font-extrabold text-ink underline">Sign in</Link>. Interested? <Link href="/contact" className="font-extrabold text-ink underline">Contact us</Link> or <Link href="/pricing" className="font-extrabold text-ink underline">see pricing</Link>.</p>
        <Link href="/contact" className="mt-5 inline-flex h-12 items-center rounded-full bg-ink px-7 font-extrabold text-white hover:bg-ink-2">Contact us</Link>
      </div>
    </div>
  );
}
