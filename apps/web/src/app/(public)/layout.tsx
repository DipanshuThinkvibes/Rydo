import Link from "next/link";
import { Logo } from "@/components/ui";
import { ThemeToggle } from "@/components/theme-toggle";

const links = [
  { href: "/welcome#ride", label: "Ride" },
  { href: "/welcome#drive", label: "Drive" },
  { href: "/for-companies", label: "Company" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
];

/** Public site shell: black-on-white like a ride-hailing site, with RYDO's lime accent. */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col bg-white">
      <header className="sticky top-0 z-40 border-b border-line/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link href="/welcome" aria-label="RYDO home" className="shrink-0"><Logo /></Link>
          <nav aria-label="Main" className="hidden flex-1 items-center gap-1 lg:flex">
            {links.map((l) => <Link key={l.href} href={l.href} className="rounded-full px-3.5 py-2 text-sm font-bold hover:bg-surface-2">{l.label}</Link>)}
          </nav>
          <div className="ml-auto flex items-center gap-2 lg:ml-0">
            <ThemeToggle />
            <Link href="/contact" className="hidden h-10 items-center rounded-full px-4 text-sm font-bold hover:bg-surface-2 sm:inline-flex">Contact us</Link>
            <Link href="/sign-in" className="inline-flex h-10 items-center rounded-full px-4 text-sm font-extrabold hover:bg-surface-2">Log in</Link>
            <Link href="/sign-up" className="inline-flex h-10 items-center rounded-full bg-ink px-5 text-sm font-extrabold text-white hover:bg-ink-2">Sign up</Link>
          </div>
        </div>
        <nav aria-label="Sections" className="no-scrollbar flex gap-1 overflow-x-auto border-t border-line/60 px-4 py-1.5 lg:hidden">
          {[...links, { href: "/contact", label: "Contact us" }].map((l) => <Link key={l.href} href={l.href} className="shrink-0 rounded-full px-3 py-1.5 text-sm font-bold text-muted hover:bg-surface-2 hover:text-ink">{l.label}</Link>)}
        </nav>
      </header>
      <main id="main" tabIndex={-1} className="flex-1 outline-none">{children}</main>
      <footer className="bg-ink text-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
          <div className="flex flex-col gap-3">
            <Logo light />
            <p className="max-w-xs text-sm text-[#B8C2D6]">Carpool with verified colleagues. Approved by your company, safe, and free to use.</p>
          </div>
          <FooterCol title="Product" items={[["Ride", "/welcome#ride"], ["Drive", "/welcome#drive"], ["How it works", "/how-it-works"], ["Pricing", "/pricing"]]} />
          <FooterCol title="Company" items={[["About", "/about"], ["For companies", "/for-companies"], ["FAQ", "/faq"], ["Contact us", "/contact"]]} />
          <FooterCol title="Account" items={[["Log in", "/sign-in"], ["Sign up", "/sign-up"], ["Forgot password", "/forgot-password"]]} />
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-white/10 px-4 py-5 text-xs text-[#8F9BB3]"><span>© RYDO · A Thinkvibes product</span><Link href="/privacy" className="font-bold hover:text-lime">Privacy</Link><Link href="/terms" className="font-bold hover:text-lime">Terms</Link></div>
      </footer>
    </div>
  );
}

function FooterCol({ title, items }: { title: string; items: string[][] }) {
  return (
    <div className="flex flex-col gap-2.5">
      <h2 className="text-xs font-extrabold uppercase tracking-[2px] text-[#8F9BB3]">{title}</h2>
      {items.map(([label, href]) => <Link key={label} href={href} className="text-sm font-bold text-[#E5E9F0] hover:text-lime">{label}</Link>)}
    </div>
  );
}
