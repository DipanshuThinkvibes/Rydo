import type { MetadataRoute } from "next";

const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/** Search engines may read the public site, never the signed-in app or the API. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/welcome", "/how-it-works", "/for-companies", "/pricing", "/about", "/faq", "/contact", "/privacy", "/terms"], disallow: ["/api/", "/t/", "/platform", "/manage", "/dashboard", "/messages", "/trips", "/drive", "/account"] }],
    sitemap: `${site}/sitemap.xml`,
  };
}
