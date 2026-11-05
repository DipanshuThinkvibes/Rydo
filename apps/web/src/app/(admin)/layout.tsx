"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/lib/session";
import { Button, Logo } from "@/components/ui";

const nav = [
  { href: "/", label: "Approvals" },
  { href: "/platform", label: "Companies", platformOnly: true },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { loading, me, adminOrgs, org, chooseOrg, signOut } = useSession();
  const router = useRouter();
  const path = usePathname();

  useEffect(() => {
    if (!loading && !me) router.replace("/sign-in");
  }, [loading, me, router]);

  if (loading || !me) return <p className="p-8 text-muted">Loading…</p>;

  if (!adminOrgs.length && !me.user.isPlatformAdmin) {
    return (
      <main className="flex flex-1 items-center justify-center p-4">
        <div className="max-w-md rounded-[28px] bg-white p-8">
          <Logo />
          <h1 className="mt-6 text-xl font-extrabold">This website is for company admins</h1>
          <p className="mt-2 text-sm text-muted">Use the RYDO mobile app to find or offer rides. If you should be an admin, ask your Org Admin to give you the HR or Ops role.</p>
          <Button variant="ghost" className="mt-6" onClick={() => signOut().then(() => router.replace("/sign-in"))}>
            Sign out
          </Button>
        </div>
      </main>
    );
  }

  return (
    <div className="flex flex-1 flex-wrap">
      <aside className="flex w-full flex-col gap-6 bg-ink p-5 text-white md:w-60">
        <Logo />
        <nav className="flex flex-wrap gap-1 md:flex-col" aria-label="Main">
          {nav
            .filter((n) => !n.platformOnly || me.user.isPlatformAdmin)
            .map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={path === n.href ? "page" : undefined}
                className={`rounded-xl px-3 py-2.5 text-sm font-bold ${path === n.href ? "bg-lime text-ink" : "text-[#B8C2D6] hover:bg-ink-2 hover:text-white"}`}
              >
                {n.label}
              </Link>
            ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-[999_1_560px] flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-white px-6 py-3">
          {adminOrgs.length > 1 ? (
            <label className="flex items-center gap-2 text-sm font-bold">
              Company
              <select className="h-10 rounded-xl border border-line-strong px-3" value={org?.organization.id} onChange={(e) => chooseOrg(e.target.value)}>
                {adminOrgs.map((m) => (
                  <option key={m.organization.id} value={m.organization.id}>
                    {m.organization.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <span className="text-sm font-extrabold">{org?.organization.name ?? "RYDO platform"}</span>
          )}
          <span className="flex items-center gap-3 text-sm">
            <span className="text-muted">{me.user.email}</span>
            <Button variant="ghost" className="h-9" onClick={() => signOut().then(() => router.replace("/sign-in"))}>
              Sign out
            </Button>
          </span>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}