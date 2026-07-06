import type { NextConfig } from "next";

const securityHeaders = [
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
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
