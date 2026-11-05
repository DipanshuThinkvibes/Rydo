import { Suspense } from "react";

/** Public trip page reads the token from the URL, so it renders inside Suspense (needed for the production build). */
export default function SharedTripLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<main className="flex-1 p-6 text-muted">Loading…</main>}>{children}</Suspense>;
}