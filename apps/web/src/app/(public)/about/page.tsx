import type { Metadata } from "next";
import Link from "next/link";
import { Doc, Section } from "@/components/legal";

export const metadata: Metadata = { title: "About", description: "RYDO helps companies and employees share the commute, safely." };

export default function About() {
  return (
    <Doc title="About RYDO" intro="We help colleagues share the ride to work: fewer cars, shorter commutes, and a team that gets there together.">
      <Section title="Why RYDO">
        <p>Most office commutes carry one person in a car built for four. Carpooling fixes that, but people hesitate to ride with strangers and companies lack a safe way to organise it. RYDO brings the two together: a carpool that only your own verified colleagues can join, run with your company&apos;s approval.</p>
      </Section>
      <Section title="How we build it">
        <ul>
          <li><b>Company first.</b> Each company has its own private space, managed by its own admins.</li>
          <li><b>Safety by design.</b> Verified drivers, boarding PINs, live trip sharing, SOS and a clear way to report problems.</li>
          <li><b>Privacy by default.</b> Phone numbers and emails are never shown to other riders. Location is shared only during a ride.</li>
          <li><b>Simple to use.</b> One account on web and mobile, ride or drive, with suggestions that explain themselves.</li>
        </ul>
      </Section>
      <Section title="Who is behind it">
        <p>RYDO is a product of Thinkvibes. We run the platform, set up each client company, and support them.</p>
      </Section>
      <p className="flex flex-wrap gap-3">
        <Link href="/contact" className="inline-flex h-12 items-center rounded-full bg-ink px-7 font-extrabold text-white hover:bg-ink-2">Bring RYDO to your company</Link>
        <Link href="/how-it-works" className="inline-flex h-12 items-center rounded-full bg-surface-2 px-7 font-extrabold hover:bg-line">How it works</Link>
      </p>
    </Doc>
  );
}
