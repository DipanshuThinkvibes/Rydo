"use client";

import Link from "next/link";
import { useSession } from "@/lib/session";
import { Badge, Notice } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";
import { Section, useAccount, usePersonas } from "@/components/account-hub";

/** Safety and privacy tab for company members: what others can see, and who is told when you share a trip. */
export default function SafetyPage() {
  const { org } = useSession();
  const { profile } = useAccount();
  const personas = usePersonas();
  const isDriver = personas.includes("DRIVER");
  const contacts = profile?.emergencyContacts ?? 0;

  if (!org) return <Notice tone="error">Safety settings belong to a company. Sign in to a company account to see them.</Notice>;

  const facts: { t: string; d: string }[] = [
    { t: "Your phone number", d: "Private. It is never shown to other employees." },
    { t: "Your ID proof", d: "Only the last 4 characters are stored, and only your company HR can see them." },
    { t: "Your trips", d: "Only people on the same ride see where you are, and only during the trip." },
    ...(isDriver ? [{ t: "Your vehicle", d: "Riders on your ride see the car, plate and colour so they can find you." }] : []),
  ];
  const tiles: { href: string; icon: IconName; t: string; d: string }[] = [
    { href: "/safety", icon: "phone", t: "Emergency contacts", d: "Who we tell if you share a trip" },
    { href: "/safety", icon: "ban", t: "Blocked people", d: "Never matched with you" },
    { href: "/issues", icon: "flag", t: "Report an issue", d: "Tell your company or RYDO" },
  ];

  return (
    <div className="grid gap-5 lg:grid-cols-5">
      <div className="flex flex-col gap-5 lg:col-span-3">
        <Section icon="user" title="What others can see" sub="You decide nothing here by accident: private things stay private.">
          <ul className="flex flex-col gap-2 text-sm">
            {facts.map((f) => (
              <li key={f.t} className="flex items-start gap-3 rounded-2xl bg-surface p-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success-bg text-success"><Icon name="check" size={13} /></span>
                <span><b>{f.t}.</b> <span className="text-muted">{f.d}</span></span>
              </li>
            ))}
          </ul>
        </Section>

        <Section icon="alert" title="In an emergency" sub="The SOS button on a live ride alerts your company's safety team and your contacts.">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface p-4">
            <span className="text-sm"><b>Emergency contacts</b><span className="block text-xs text-muted">{contacts === 0 ? "You have not added anyone yet." : `${contacts} ${contacts === 1 ? "person is" : "people are"} ready to be told.`}</span></span>
            <Badge tone={contacts > 0 ? "success" : "warning"}>{contacts > 0 ? "Ready" : "Add one"}</Badge>
          </div>
        </Section>
      </div>

      <Section icon="shield" title="Manage" sub="Everything safety-related, in one tap.">
        <div className="flex flex-col gap-2">
          {tiles.map((t) => (
            <Link key={t.t} href={t.href} className="group flex items-center gap-3 rounded-2xl bg-surface p-4 transition-colors hover:bg-surface-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white"><Icon name={t.icon} size={18} /></span>
              <span className="min-w-0 flex-1"><span className="block text-sm font-extrabold">{t.t}</span><span className="text-xs text-muted">{t.d}</span></span>
              <Icon name="arrowRight" size={16} className="text-muted transition-transform group-hover:translate-x-1" />
            </Link>
          ))}
        </div>
      </Section>
    </div>
  );
}
