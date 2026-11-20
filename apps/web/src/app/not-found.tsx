import Link from "next/link";
import { Logo } from "@/components/ui";

export default function NotFound() {
  return (
    <main id="main" className="flex flex-1 flex-col items-center justify-center gap-5 bg-white px-4 py-20 text-center">
      <Logo />
      <p className="text-sm font-extrabold uppercase tracking-[3px] text-muted">Error 404</p>
      <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">This page took a wrong turn.</h1>
      <p className="max-w-md text-muted">The page you are looking for does not exist or has moved. Let us get you back on the route.</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link href="/welcome" className="inline-flex h-12 items-center rounded-full bg-ink px-7 font-extrabold text-white hover:bg-ink-2">Go to the home page</Link>
        <Link href="/sign-in" className="inline-flex h-12 items-center rounded-full bg-surface-2 px-7 font-extrabold hover:bg-line">Log in</Link>
      </div>
    </main>
  );
}
