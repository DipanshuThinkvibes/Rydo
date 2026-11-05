import path from "node:path";
import type { NextConfig } from "next";

// The API is proxied under the same origin, so auth cookies stay first-party and no CORS is needed.
const apiUrl = process.env.API_URL ?? "http://localhost:4000";

// Sent on every page. The map needs geolocation (rider "use my location", driver GPS); camera/mic are off.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Docker image build sets NEXT_OUTPUT=standalone (apps/web/Dockerfile); local dev is unchanged.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  outputFileTracingRoot: process.env.NEXT_OUTPUT === "standalone" ? path.join(process.cwd(), "../..") : undefined,
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async rewrites() {
    return [{ source: "/api/v1/:path*", destination: `${apiUrl}/api/v1/:path*` }];
  },
};

export default nextConfig;