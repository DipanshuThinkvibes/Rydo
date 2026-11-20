"use client";

import Link from "next/link";
import { Logo } from "@/components/ui";

/** Shown if a page crashes. The user can try again without losing their place. */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="flex flex-1 flex-col items-center justify-center gap-5 bg-white px-4 py-20 text-center">
      <Logo />
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Something went wrong.</h1>
      <p className="max-w-md text-muted">We could not show this page. Please try again. If it keeps happening, let us know through Contact us.</p>
      <div className="flex flex-wrap justify-center gap-3">
        <button type="button" onClick={reset} className="inline-flex h-12 items-center rounded-full bg-ink px-7 font-extrabold text-white hover:bg-ink-2">Try again</button>
        <Link href="/welcome" className="inline-flex h-12 items-center rounded-full bg-surface-2 px-7 font-extrabold hover:bg-line">Home</Link>
      </div>
    </main>
  );
}
