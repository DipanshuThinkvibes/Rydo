import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { SessionProvider } from "@/lib/session";
import "./globals.css";

const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "RYDO",
  description: "Manage your company's RYDO carpool: approvals, drivers, live rides and safety.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${manrope.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}