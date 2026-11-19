import type { MetadataRoute } from "next";

const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const pages = ["welcome", "how-it-works", "for-companies", "pricing", "about", "faq", "contact", "sign-up", "sign-in", "privacy", "terms"];

/** The public pages search engines may list. The signed-in app is not included. */
export default function sitemap(): MetadataRoute.Sitemap {
  return pages.map((p) => ({ url: `${site}/${p}`, changeFrequency: "monthly", priority: p === "welcome" ? 1 : 0.6 }));
}
