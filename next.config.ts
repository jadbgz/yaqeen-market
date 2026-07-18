import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Origins the storefront legitimately talks to: Supabase (data, auth, storage)
// and Stripe (Payment Element, fraud signals, hosted onboarding).
const supabaseConnect = ["https://*.supabase.co", "wss://*.supabase.co"];
const devConnect = isDev ? ["http://127.0.0.1:54321", "ws://127.0.0.1:54321", "http://localhost:54321"] : [];

// Inline scripts/styles stay allowed for now: Next.js bootstraps hydration with
// inline scripts and the design relies on inline style attributes. Tightening
// to nonces is a follow-up that requires emitting a nonce from src/proxy.ts.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://js.stripe.com https://*.js.stripe.com`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https://*.supabase.co${isDev ? " http://127.0.0.1:54321 http://localhost:54321" : ""}`,
  "font-src 'self' data:",
  `connect-src 'self' https://api.stripe.com https://merchant-ui-api.stripe.com https://m.stripe.network ${[...supabaseConnect, ...devConnect].join(" ")}`,
  "frame-src https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com https://m.stripe.network",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Payment stays delegated to Stripe's frame; everything else is denied.
  { key: "Permissions-Policy", value: 'camera=(), microphone=(), geolocation=(), payment=(self "https://js.stripe.com")' },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  turbopack: {
    root: process.cwd(),
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "7mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/sign/product-media/**",
      },
      {
        protocol: "http",
        hostname: "127.0.0.1",
        port: "54321",
        pathname: "/storage/v1/object/sign/product-media/**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
