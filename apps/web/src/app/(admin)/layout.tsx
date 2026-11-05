import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";

/**
 * Server layout so the client shell (which reads the URL) sits inside Suspense.
 * Without this, the production build can't prerender any page under this group.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="flex flex-1 items-center justify-center text-muted">Loading…</div>}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}