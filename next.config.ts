import type { NextConfig } from "next";

// Pages get a per-request nonce CSP from proxy.ts. API responses are JSON/CSV and never run anything: nothing allowed.
const apiCsp = "default-src 'none'; frame-ancestors 'none'";

const nextConfig: NextConfig = {
  // Self-contained server output (server.js + only the files it needs): this is what gets copied to the server.
  output: "standalone",
  // The app does not use next/image, so skip the image optimizer: its native library (sharp) is built for the machine that
  // runs the build, and a Mac-built copy would not load on the Linux server.
  images: { unoptimized: true },
  outputFileTracingExcludes: { "*": ["node_modules/sharp/**", "node_modules/@img/**"] },
  // Browser tests run their own server from a separate build folder so they never clash with a dev server you have open.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  // deploy.sh sets this only after `npm run check` has type-checked the project, so the build does not do it twice.
  typescript: { ignoreBuildErrors: process.env.SKIP_BUILD_TYPECHECK === "1" },
  async redirects() {
    // Overview moved to the home page.
    return [{ source: "/overview", destination: "/", permanent: true }];
  },
  async headers() {
    return [
      { source: "/api/:path*", headers: [{ key: "Content-Security-Policy", value: apiCsp }] },
      {
        source: "/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
    ];
  },
};

export default nextConfig;
