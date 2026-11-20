import type { Metadata } from "next";
import { ContactForm } from "@/components/contact-form";

export const metadata: Metadata = { title: "Contact us", description: "Tell us about your company and the RYDO team will set up your offices, admins and employees." };

const steps = [
  ["You send this form", "Tell us who you are and how big your company is."],
  ["We reach out within 2 working days", "A short call to understand your offices and rules."],
  ["We set everything up", "Your company, offices and first admin are created for you."],
  ["Your employees join", "They sign in with their work email; your HR approves them."],
];

export default function Contact() {
  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_1.15fr] lg:py-20">
      <div className="flex flex-col gap-6">
        <p className="w-fit rounded-full bg-lime px-3 py-1 text-xs font-extrabold uppercase tracking-[2px]">Contact us</p>
        <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">Bring RYDO to your company.</h1>
        <p className="max-w-md text-lg text-muted">Fill in the form and the RYDO team will get in touch to onboard your organisation. RYDO is free for companies and employees right now.</p>
        <ol className="mt-2 flex flex-col gap-4">
          {steps.map(([t, d], i) => (
            <li key={t} className="flex gap-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink font-extrabold text-lime">{i + 1}</span>
              <span><span className="block font-extrabold">{t}</span><span className="text-sm text-muted">{d}</span></span>
            </li>
          ))}
        </ol>
        <div className="rounded-2xl bg-surface p-5 text-sm">
          <p className="font-extrabold">Other ways to reach us</p>
          {process.env.NEXT_PUBLIC_CONTACT_EMAIL && <p className="mt-1.5">Email: <a className="font-bold underline" href={`mailto:${process.env.NEXT_PUBLIC_CONTACT_EMAIL}`}>{process.env.NEXT_PUBLIC_CONTACT_EMAIL}</a></p>}
          <p className="mt-1.5 text-muted">We reply within 2 working days. Quick answers are in the <a href="/faq" className="font-bold text-ink underline">FAQ</a>, and you can read about <a href="/about" className="font-bold text-ink underline">who we are</a>.</p>
        </div>
        <p className="text-sm text-muted">Already part of a company on RYDO? <a href="/sign-up" className="font-extrabold text-ink underline">Sign up</a> or <a href="/sign-in" className="font-extrabold text-ink underline">log in</a> instead.</p>
      </div>
      <ContactForm />
    </div>
  );
}
