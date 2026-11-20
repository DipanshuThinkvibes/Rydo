"use client";

import Link from "next/link";
import { Badge, Notice } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";
import { PERSONA, Section, useAccount, usePersonas, type PersonaKey } from "@/components/account-hub";

type Tool = { href: string; icon: IconName; t: string; d: string };

/** What each persona can do and where to do it: shortcuts that match who you are. */
const TOOLS: Record<PersonaKey, { heading: string; can: string[]; tools: Tool[] }> = {
  OWNER: {
    heading: "You run RYDO",
    can: ["Set up clients and give them licences", "Block or unblock a person in any company", "Watch reports and safety across every client", "See only the numbers you need, never private details"],
    tools: [
      { href: "/platform", icon: "sparkle", t: "Overview", d: "How carpooling is going everywhere" },
      { href: "/platform/clients", icon: "globe", t: "Clients", d: "Companies on RYDO" },
      { href: "/platform/licenses", icon: "badge", t: "Licences", d: "Who can use what, until when" },
      { href: "/platform/people", icon: "users", t: "People", d: "Block or unblock" },
      { href: "/platform/clients", icon: "chat", t: "Support view", d: "Open a client read-only, logged" },
      { href: "/platform/reports", icon: "flag", t: "Reports and safety", d: "Complaints and SOS" },
      { href: "/platform/inquiries", icon: "clipboard", t: "Onboarding requests", d: "Companies asking to join" },
    ],
  },
  SUPPORT: {
    heading: "You help client companies",
    can: ["Open a company's screens in read-only support view when RYDO allows it", "Everything you open is logged, with the reason", "You can look, but never change a company's data"],
    tools: [],
  },
  ORG_ADMIN: {
    heading: "You run your company on RYDO",
    can: ["Change company settings, offices and teams", "Give people roles", "See reports and activity", "Send announcements and surveys"],
    tools: [
      { href: "/company", icon: "building", t: "Company", d: "Rules and settings" },
      { href: "/structure", icon: "layers", t: "Offices & teams", d: "Where people work" },
      { href: "/reports", icon: "sparkle", t: "Reports", d: "Rides, savings, activity" },
      { href: "/manage/announcements", icon: "megaphone", t: "Announcements", d: "Tell everyone" },
      { href: "/activity", icon: "clock", t: "Activity log", d: "Who did what" },
    ],
  },
  HR_ADMIN: {
    heading: "You look after your people",
    can: ["Approve or reject new employees", "Pause and bring back employees", "Verify drivers and their documents", "Run surveys and read feedback"],
    tools: [
      { href: "/employees", icon: "users", t: "Employees", d: "Approvals and people" },
      { href: "/drivers", icon: "badge", t: "Drivers", d: "Verify documents" },
      { href: "/manage/surveys", icon: "clipboard", t: "Surveys", d: "Ask your team" },
      { href: "/manage/feedback", icon: "star", t: "Feedback", d: "What people say" },
      { href: "/manage/announcements", icon: "megaphone", t: "Announcements", d: "Tell everyone" },
    ],
  },
  OPS_ADMIN: {
    heading: "You keep rides running",
    can: ["Watch live rides and safety alerts", "Follow up on reported issues", "See reports for your company"],
    tools: [
      { href: "/ops", icon: "route", t: "Rides", d: "Live and upcoming" },
      { href: "/manage/issues", icon: "flag", t: "Issues", d: "Reports from riders" },
      { href: "/reports", icon: "sparkle", t: "Reports", d: "How rides are going" },
      { href: "/structure", icon: "layers", t: "Offices & teams", d: "Where people work" },
    ],
  },
  DRIVER: {
    heading: "You share your seats",
    can: ["Offer rides to the office and back", "Accept or decline requests", "Chat with riders on your ride", "Keep your vehicle and documents up to date"],
    tools: [
      { href: "/drive", icon: "wheel", t: "Drive", d: "Offer a ride, manage your car" },
      { href: "/trips", icon: "ticket", t: "My trips", d: "Upcoming and past" },
      { href: "/messages", icon: "chat", t: "Messages", d: "Talk to your riders" },
    ],
  },
  RIDER: {
    heading: "You ride with colleagues",
    can: ["Find rides that match your route", "Book a seat or join a waitlist", "Plan your week in one go", "Rate the people you ride with"],
    tools: [
      { href: "/ride", icon: "search", t: "Find a ride", d: "Match with colleagues" },
      { href: "/commute", icon: "calendar", t: "My week", d: "Plan your commute" },
      { href: "/trips", icon: "ticket", t: "My trips", d: "Upcoming and past" },
      { href: "/messages", icon: "chat", t: "Messages", d: "Talk to your driver" },
    ],
  },
};

const PREF_LABEL: Record<string, string> = { ac: "Air conditioning", noSmoking: "No smoking", quiet: "Quiet ride", musicOk: "Music is fine", womenRidersOnly: "Women riders only" };
const STATUS_TONE = { VERIFIED: "success", PENDING: "warning" } as const;

/** One card per persona you hold: what you can do, and shortcuts. Nothing here that does not apply to you. */
export default function RolePage() {
  const personas = usePersonas();
  const { profile } = useAccount();
  // Riders are also drivers sometimes; show every held persona, most senior first, but skip the plain rider card for people who are also admins.
  const shown = personas.filter((p) => !(p === "RIDER" && personas.some((q) => q !== "RIDER" && q !== "DRIVER")) || personas.length === 1);

  if (personas.length === 0) return <Notice tone="error">You do not have a role in a company yet. Once your company approves you, your tools appear here.</Notice>;

  return (
    <div className="flex flex-col gap-5">
      {shown.map((p) => {
        const t = TOOLS[p];
        const prefs = p === "DRIVER" ? Object.entries(profile?.driver?.preferences ?? {}).filter(([, v]) => v) : [];
        return (
          <Section key={p} icon={PERSONA[p].icon} title={PERSONA[p].label} sub={t.heading} aside={p === "DRIVER" && profile?.driver ? <Badge tone={STATUS_TONE[profile.driver.status as keyof typeof STATUS_TONE] ?? "neutral"}>{profile.driver.status.toLowerCase()}</Badge> : undefined}>
            <div className="grid gap-5 lg:grid-cols-5">
              <ul className="flex flex-col gap-2 text-sm lg:col-span-2">
                {t.can.map((c) => (
                  <li key={c} className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success-bg text-success"><Icon name="check" size={11} /></span>
                    <span>{c}</span>
                  </li>
                ))}
                {p === "DRIVER" && profile?.driver && prefs.length > 0 && (
                  <li className="mt-1 flex flex-wrap gap-1.5">{prefs.map(([k]) => <span key={k} className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-bold">{PREF_LABEL[k] ?? k}</span>)}</li>
                )}
                {p === "DRIVER" && !profile?.driver && <li className="rounded-2xl bg-warning-bg p-3 text-xs font-bold text-warning">You are not registered as a driver yet. Open Drive to start.</li>}
              </ul>
              {t.tools.length === 0 ? (
                <p className="rounded-2xl bg-surface p-4 text-sm text-muted lg:col-span-3">Your tools open when a RYDO super admin gives you access to a client. Until then there is nothing to manage here.</p>
              ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:col-span-3">
                {t.tools.map((x) => (
                  <Link key={x.href + x.t} href={x.href} className="group flex items-center gap-3 rounded-2xl bg-surface p-3.5 transition-colors hover:bg-surface-2">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white"><Icon name={x.icon} size={18} /></span>
                    <span className="min-w-0 flex-1"><span className="block text-sm font-extrabold">{x.t}</span><span className="text-xs text-muted">{x.d}</span></span>
                    <Icon name="arrowRight" size={15} className="text-muted transition-transform group-hover:translate-x-1" />
                  </Link>
                ))}
              </div>
              )}
            </div>
          </Section>
        );
      })}
    </div>
  );
}
