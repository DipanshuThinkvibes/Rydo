import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { SessionProvider } from "@/lib/session";
import "./globals.css";

const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"] });

/** Set NEXT_PUBLIC_SITE_URL to the public address in production so share previews use full links. */
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "RYDO: carpool with your colleagues", template: "%s | RYDO" },
  description: "Share the ride to work with verified colleagues. Approved by your company, safe, and free to use.",
  applicationName: "RYDO",
  openGraph: {
    type: "website",
    siteName: "RYDO",
    title: "RYDO: carpool with your colleagues",
    description: "Colleagues already driving your way, verified by HR. Share the seat, split the cost.",
  },
  twitter: { card: "summary", title: "RYDO: carpool with your colleagues", description: "Share the ride to work with verified colleagues." },
};

/** Runs before first paint so the page never flashes the wrong theme. */
const THEME_SCRIPT = `try{var t=localStorage.getItem("rydo-theme");var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light"}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${manrope.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <a href="#main" className="sr-only z-50 rounded-full bg-lime px-5 py-3 font-extrabold text-ink focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
          Skip to content
        </a>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
