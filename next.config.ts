import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const isProd = process.env.NODE_ENV === "production";

// The browser talks to Supabase directly, so its origin has to be allowed
// explicitly. Realtime uses a WebSocket on the same host.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseOrigins = supabaseUrl
  ? [supabaseUrl, supabaseUrl.replace(/^https:/, "wss:")]
  : [];

// Error reports normally go through the /monitoring tunnel on this origin, but
// they hit Sentry directly when the build plugin isn't configured.
const sentryOrigin = (() => {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return "";
  try {
    return new URL(dsn).origin;
  } catch {
    return "";
  }
})();

/**
 * Content Security Policy.
 *
 * `unsafe-inline` is unavoidable in both script-src and style-src for now: the
 * app styles everything with inline `style` attributes, and Next.js injects
 * inline bootstrap scripts. Moving to nonces would mean rendering every page
 * dynamically, and moving off inline styles is the design-token refactor.
 * Everything else is locked down.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  // data:/blob: cover sandbox-mode receipts and avatar previews before upload.
  `img-src 'self' data: blob: ${supabaseOrigins[0] ?? ""}`.trim(),
  "font-src 'self' data:",
  `connect-src 'self' ${[...supabaseOrigins, sentryOrigin]
    .filter(Boolean)
    .join(" ")}`.trim(),
  // Receipt PDFs render in an iframe pointing at a signed storage URL.
  `frame-src 'self' blob: ${supabaseOrigins[0] ?? ""}`.trim(),
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // Prevent the app from being embedded in iframes (clickjacking).
  { key: "X-Frame-Options", value: "DENY" },
  // Don't let browsers MIME-sniff responses away from declared content-type.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Only send the origin as referrer to other sites.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // This app never needs these browser features.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  // Session cookies and payment handles should never travel over plain HTTP.
  // Omitted in development, where the app is served on http://localhost.
  ...(isProd
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  // The end-to-end suite builds a sandbox-mode copy of the app into its own
  // directory, so it can run while an ordinary `npm run dev` is still going.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

// Only wrap the config when Sentry is actually set up, so a plain `npm run
// build` doesn't fail on a missing auth token.
const sentryConfigured = Boolean(
  process.env.SENTRY_ORG && process.env.SENTRY_PROJECT
);

export default sentryConfigured
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      // Upload source maps so stack traces name real functions, then strip them
      // from the deployed bundle.
      widenClientFileUpload: true,
      sourcemaps: { deleteSourcemapsAfterUpload: true },
      silent: !process.env.CI,
      // Routes reports through the app's own origin, so an ad blocker doesn't
      // silently swallow them.
      tunnelRoute: "/monitoring",
      disableLogger: true,
    })
  : nextConfig;
