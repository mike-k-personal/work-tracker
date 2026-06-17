import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // NOTE: do NOT add a `webpack` key here — Next 16 uses Turbopack by default
  // and a custom webpack config would break the build.
  async headers() {
    return [
      {
        // Serve the hand-rolled service worker as JS and never cache it, so an
        // updated SW is always picked up (avoids stale-SW issues).
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
        ],
      },
      {
        // Conservative global security headers.
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
