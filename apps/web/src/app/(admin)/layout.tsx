"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { OrgRoleName } from "@rydo/shared";
import { useSession } from "@/lib/session";
import { Avatar, Button, Logo, Spinner } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";
import { NotificationsBell } from "@/components/notifications-bell";

type NavItem = { href: string; label: string; icon: IconName; member?: boolean; platformOnly?: boolean; roles?: OrgRoleName[] };
const groups: { title?: string; items: NavItem[] }[] = [
  {
    items: [
      { href: "/ride", label: "Find a ride", icon: "search", member: true },
      { href: "/trips", label: "My trips", icon: "ticket", member: true },
      { href: "/drive", label: "Drive", icon: "wheel", member: true },
    ],
  },
  {
    title: "Admin",
    items: [
      { href: "/employees", label: "Employees", icon: "users", roles: ["ORG_ADMIN", "HR_ADMIN"] },
      { href: "/drivers", label: "Drivers", icon: "badge", roles: ["ORG_ADMIN", "HR_ADMIN"] },
      { href: "/company", label: "Company", icon: "building", roles: ["ORG_ADMIN", "HR_ADMIN", "OPS_ADMIN"] },
      { href: "/structure", label: "Offices & teams", icon: "layers", roles: ["ORG_ADMIN", "HR_ADMIN", "OPS_ADMIN"] },
    ],
  },
  { title: "RYDO", items: [{ href: "/platform", label: "Companies", icon: "globe", platformOnly: true }] },
  { items: [{ href: "/account", label: "My account", icon: "user" }] },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { loading, me, orgs, pending, org, chooseOrg, signOut, can } = useSession();
  const router = useRouter();
  const path = usePathname();

  useEffect(() => {
    if (!loading && !me) router.replace("/sign-in");
  }, [loading, me, router]);

  if (loading || !me)
    return (
      <div className="flex flex-1 items-center justify-center gap-3 text-muted">
        <Spinner /> Loading…
      </div>
    );
  const leave = () => signOut().then(() => router.replace("/sign-in"));

  if (!orgs.length && !me.user.isPlatformAdmin) {
    return (
      <main className="flex flex-1 items-center justify-center p-4">
        <div className="max-w-md animate-rise rounded-[28px] bg-white p-8 shadow-lift">
          <Logo />
          <h1 className="mt-6 text-xl font-extrabold">{pending.length ? "Waiting for HR approval" : "No company access yet"}</h1>
          <p className="mt-2 text-sm text-muted">
            {pending.length
              ? `${pending[0].organization.name}'s HR team will approve your account soon. We'll email you; then sign in again.`
              : "Sign up with your work email, or ask your HR team to add you to RYDO."}
          </p>
          <Button variant="ghost" className="mt-6" onClick={leave}>Sign out</Button>
        </div>
      </main>
    );
  }

  const visible = (n: NavItem) => (n.platformOnly ? me.user.isPlatformAdmin : n.member ? !!org : n.roles ? can(...n.roles) : true);

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <aside className="relative flex w-full flex-col gap-6 overflow-hidden bg-ink p-4 text-white md:sticky md:top-0 md:h-screen md:w-64 md:p-5">
        <span aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-lime/10 blur-3xl" />
        <span aria-hidden="true" className="pointer-events-none absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-[#2563eb]/15 blur-3xl" />
        <Link href="/" className="relative w-fit"><Logo light /></Link>
        <nav className="no-scrollbar relative -mx-1 flex gap-1 overflow-x-auto px-1 md:mx-0 md:flex-col md:gap-5 md:overflow-visible md:px-0" aria-label="Main">
          {groups.map((g, i) => {
            const items = g.items.filter(visible);
            if (!items.length) return null;
            return (
              <div key={i} className="flex gap-1 md:flex-col">
                {g.title && <span className="hidden px-3 pb-1 text-[11px] font-extrabold uppercase tracking-[2px] text-[#8F9BB3] md:block">{g.title}</span>}
                {items.map((n) => {
                  const active = path === n.href || path.startsWith(n.href + "/");
                  return (
                    <Link
                      key={n.href}
                      href={n.href}
                      aria-current={active ? "page" : undefined}
                      className={`group flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition-all ${active ? "bg-lime text-ink shadow-[0_6px_16px_rgba(140,190,40,.3)]" : "text-[#B8C2D6] hover:bg-white/5 hover:text-white"}`}
                    >
                      <Icon name={n.icon} size={18} className={active ? "" : "transition-transform group-hover:scale-110"} />
                      {n.label}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>
        <div className="relative mt-auto hidden items-center gap-3 rounded-2xl bg-white/5 p-3 md:flex">
          <Avatar name={me.user.name ?? me.user.email} tone="lime" size={36} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-extrabold">{me.user.name}</span>
            <span className="block truncate text-xs text-[#8F9BB3]">{me.user.email}</span>
          </span>
          <button type="button" onClick={leave} aria-label="Sign out" title="Sign out" className="flex h-9 w-9 items-center justify-center rounded-xl text-[#B8C2D6] hover:bg-white/10 hover:text-white">
            <Icon name="logout" size={18} />
          </button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-3 border-b border-line/80 bg-white/80 px-4 backdrop-blur-xl sm:px-6">
          {orgs.length > 1 ? (
            <label className="flex items-center gap-2 text-sm font-bold">
              <Icon name="building" size={18} className="text-muted" />
              <span className="sr-only">Company</span>
              <select className="h-10 rounded-xl border border-line-strong bg-white px-3 font-bold" value={org?.organization.id} onChange={(e) => chooseOrg(e.target.value)}>
                {orgs.map((m) => (
                  <option key={m.organization.id} value={m.organization.id}>{m.organization.name}</option>
                ))}
              </select>
            </label>
          ) : (
            <span className="flex items-center gap-2 text-sm font-extrabold">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-2"><Icon name="building" size={16} /></span>
              {org?.organization.name ?? "RYDO platform"}
            </span>
          )}
          <span className="flex items-center gap-2 text-sm">
            {org && <NotificationsBell />}
            <span className="md:hidden"><Avatar name={me.user.name ?? me.user.email} size={34} /></span>
            <Button variant="ghost" className="h-9 md:hidden" onClick={leave}>Sign out</Button>
          </span>
        </header>
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
