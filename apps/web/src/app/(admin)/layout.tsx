"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { OrgRoleName } from "@rydo/shared";
import { useSession } from "@/lib/session";
import { Button, Logo } from "@/components/ui";
import { NotificationsBell } from "@/components/notifications-bell";

type NavItem = { href: string; label: string; member?: boolean; platformOnly?: boolean; roles?: OrgRoleName[] };
const groups: { title?: string; items: NavItem[] }[] = [
  {
    items: [
      { href: "/ride", label: "Find a ride", member: true },
      { href: "/trips", label: "My trips", member: true },
      { href: "/drive", label: "Drive", member: true },
    ],
  },
  {
    title: "Admin",
    items: [
      { href: "/employees", label: "Employees", roles: ["ORG_ADMIN", "HR_ADMIN"] },
      { href: "/drivers", label: "Drivers", roles: ["ORG_ADMIN", "HR_ADMIN"] },
      { href: "/company", label: "Company", roles: ["ORG_ADMIN", "HR_ADMIN", "OPS_ADMIN"] },
      { href: "/structure", label: "Offices & teams", roles: ["ORG_ADMIN", "HR_ADMIN", "OPS_ADMIN"] },
    ],
  },
  { title: "RYDO", items: [{ href: "/platform", label: "Companies", platformOnly: true }] },
  { items: [{ href: "/account", label: "My account" }] },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { loading, me, orgs, pending, org, chooseOrg, signOut, can } = useSession();
  const router = useRouter();
  const path = usePathname();

  useEffect(() => {
    if (!loading && !me) router.replace("/sign-in");
  }, [loading, me, router]);

  if (loading || !me) return <p className="p-8 text-muted">Loading…</p>;
  const leave = () => signOut().then(() => router.replace("/sign-in"));

  if (!orgs.length && !me.user.isPlatformAdmin) {
    return (
      <main className="flex flex-1 items-center justify-center p-4">
        <div className="max-w-md rounded-[28px] bg-white p-8">
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
    <div className="flex flex-1 flex-wrap">
      <aside className="flex w-full flex-col gap-5 bg-ink p-5 text-white md:w-60">
        <Logo />
        <nav className="flex flex-wrap gap-x-1 gap-y-4 md:flex-col" aria-label="Main">
          {groups.map((g, i) => {
            const items = g.items.filter(visible);
            if (!items.length) return null;
            return (
              <div key={i} className="flex flex-wrap gap-1 md:flex-col">
                {g.title && <span className="w-full px-3 text-xs font-extrabold uppercase tracking-wider text-[#8F9BB3]">{g.title}</span>}
                {items.map((n) => {
                  const active = path === n.href || (n.href !== "/" && path.startsWith(n.href + "/"));
                  return (
                    <Link
                      key={n.href}
                      href={n.href}
                      aria-current={active ? "page" : undefined}
                      className={`rounded-xl px-3 py-2.5 text-sm font-bold ${active ? "bg-lime text-ink" : "text-[#B8C2D6] hover:bg-ink-2 hover:text-white"}`}
                    >
                      {n.label}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-[999_1_560px] flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-white px-6 py-3">
          {orgs.length > 1 ? (
            <label className="flex items-center gap-2 text-sm font-bold">
              Company
              <select className="h-10 rounded-xl border border-line-strong px-3" value={org?.organization.id} onChange={(e) => chooseOrg(e.target.value)}>
                {orgs.map((m) => (
                  <option key={m.organization.id} value={m.organization.id}>{m.organization.name}</option>
                ))}
              </select>
            </label>
          ) : (
            <span className="text-sm font-extrabold">{org?.organization.name ?? "RYDO platform"}</span>
          )}
          <span className="flex items-center gap-3 text-sm">
            {org && <NotificationsBell />}
            <span className="hidden text-muted sm:inline">{me.user.name}</span>
            <Button variant="ghost" className="h-9" onClick={leave}>Sign out</Button>
          </span>
        </header>
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}