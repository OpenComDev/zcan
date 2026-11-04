import type { NextConfig } from "next";
import { LOCALE_COOKIE, PREFIXED } from "./src/lib/locales";

/**
 * Security headers for every route (pages, API routes, sw.js, the manifest).
 * - Content-Security-Policy: see BASE / FULL below.
 * - Permissions-Policy: nothing in Zcan uses the camera, microphone or location (the payment-request page
 *   shows a QR, it doesn't scan one). Clipboard access is left alone (paste buttons use it).
 * - HSTS without `preload`: .dev is already on the browsers' HSTS preload list as a whole TLD, so preload
 *   adds nothing for zcan.dev and would only matter (and bind every subdomain) on another domain.
 * See docs/security-review-2026-10.md.
 */
/*
 * Content Security Policy (security review ZS-18). Two layers:
 * - BASE is always enforced: no plugins, no <base> hijacking, forms only post to Zcan, no framing,
 *   HTTPS only. None of these can break the site.
 * - FULL is the complete allowlist of what the browser may load and contact. It runs as
 *   Content-Security-Policy-Report-Only and reports violations to /api/csp-report (kept with the crash
 *   reports) until CSP_ENFORCE=1 switches it to enforced. Wallet hosts follow Reown's published CSP.
 * script-src keeps 'unsafe-inline': the pages are static (prerendered), so per-request nonces aren't an
 * option, and Next.js streams page data in inline scripts. Everything else is locked to named hosts.
 */
const isDev = process.env.NODE_ENV !== "production";
const ENFORCE = process.env.CSP_ENFORCE === "1";

const WALLET_CONNECT = [
  "https://*.walletconnect.com",
  "https://*.walletconnect.org",
  "wss://*.walletconnect.com",
  "wss://*.walletconnect.org",
  "https://*.web3modal.com",
  "https://*.web3modal.org",
  "https://*.reown.com",
  "wss://www.walletlink.org",
  "https://cca-lite.coinbase.com",
  "https://keys.coinbase.com",
];

const BASE = ["object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'", ...(isDev ? [] : ["upgrade-insecure-requests"])];

const FULL = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com https://fonts.reown.com",
  [
    "connect-src 'self'",
    "wss://ws-feed.exchange.coinbase.com", // live prices (src/lib/live-prices.ts)
    "https://api.pwnedpasswords.com", // password check, k-anonymous
    "https://api.blockchair.com https://mempool.space https://ethereum-rpc.publicnode.com", // address activity
    ...WALLET_CONNECT,
    ...(isDev ? ["ws://localhost:*", "ws://127.0.0.1:*"] : []),
  ].join(" "),
  "frame-src 'self' https://verify.walletconnect.com https://verify.walletconnect.org https://secure.walletconnect.com https://secure.walletconnect.org https://keys.coinbase.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "media-src 'self' blob: data:",
  // upgrade-insecure-requests only works when enforced (browsers warn about it in report-only).
  ...BASE.filter((d) => ENFORCE || d !== "upgrade-insecure-requests"),
  "report-uri /api/csp-report",
  "report-to csp",
].join("; ");

const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  ...(ENFORCE
    ? [{ key: "Content-Security-Policy", value: FULL }]
    : [
        { key: "Content-Security-Policy", value: BASE.join("; ") },
        { key: "Content-Security-Policy-Report-Only", value: FULL },
      ]),
  { key: "Reporting-Endpoints", value: 'csp="/api/csp-report"' },
  // Wallet sign-in windows (e.g. Coinbase) need to message back; everything else stays isolated.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

/*
 * Language URLs. Pages live under src/app/[lang]; English is served at the bare path.
 * - Bare paths (/tools) are rewritten to the English copy (/en/tools) — no extra hop, still static.
 * - /en/… redirects to the bare path, so each page has one English URL.
 * - Opening a bare page in a browser that chose another language (the zcan-locale cookie, set by the
 *   language menu) — or, with no choice yet, whose first Accept-Language is one we have — redirects to
 *   that language's URL. Search engines send neither, so they index English at the bare paths and find
 *   the others through hreflang links and the sitemap.
 * API routes, Next's own files, /icons, /.well-known and anything with a file extension are never touched.
 */
const L = PREFIXED.join("|");
const BARE = `/:path((?!(?:${L}|en|api|_next|_vercel|__nextjs[^/]*|icons|\\.well-known)(?:/|$))(?!.*\\.[A-Za-z0-9]{2,12}$).*)`;
const DOCUMENT = { type: "header" as const, key: "sec-fetch-dest", value: "document" };

function languageRedirects() {
  return PREFIXED.flatMap((l) => {
    const chose = { type: "cookie" as const, key: LOCALE_COOKIE, value: l };
    const prefers = { type: "header" as const, key: "accept-language", value: `${l}(?:[-_][\\w-]*)?(?:[,;].*)?` };
    const noChoice = { type: "cookie" as const, key: LOCALE_COOKIE };
    return [
      { source: "/", has: [DOCUMENT, chose], destination: `/${l}`, permanent: false },
      { source: BARE, has: [DOCUMENT, chose], destination: `/${l}/:path`, permanent: false },
      { source: "/", has: [DOCUMENT, prefers], missing: [noChoice], destination: `/${l}`, permanent: false },
      { source: BARE, has: [DOCUMENT, prefers], missing: [noChoice], destination: `/${l}/:path`, permanent: false },
    ];
  });
}

/*
 * Who receives agent inputs, derived from the server-only AI_BASE_URL at build time so the public name can't
 * drift from the real endpoint (src/lib/ai-model.ts). Only a label is exposed, never the URL.
 */
function aiEndpointLabel(): string {
  let host = "api.deepseek.com";
  try {
    host = new URL(process.env.AI_BASE_URL?.trim() || process.env.DEEPSEEK_BASE_URL?.trim() || "https://api.deepseek.com").hostname;
  } catch {
    // Unparseable: fall back to the default provider.
  }
  const known: [RegExp, string][] = [
    [/(^|\.)deepseek\.com$/, "DeepSeek"],
    [/(^|\.)together\.(xyz|ai)$/, "Together AI"],
    [/(^|\.)fireworks\.ai$/, "Fireworks AI"],
    [/(^|\.)openrouter\.ai$/, "OpenRouter"],
    [/(^|\.)groq\.com$/, "Groq"],
    [/(^|\.)deepinfra\.com$/, "DeepInfra"],
    [/(^|\.)openai\.com$/, "OpenAI"],
    [/(^|\.)modal\.(run|direct)$/, "Modal"],
  ];
  return known.find(([re]) => re.test(host))?.[1] ?? host.split(".").slice(-2).join(".");
}

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_AI_ENDPOINT: aiEndpointLabel() },
  /* config options here */
  cacheComponents: true,
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] },
    ];
  },
  async redirects() {
    return [
      { source: "/en", destination: "/", permanent: true },
      { source: "/en/:path*", destination: "/:path*", permanent: true },
      ...languageRedirects(),
    ];
  },
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/", destination: "/en" },
        { source: BARE, destination: "/en/:path" },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
  partialPrefetching: true,
  turbopack: {
    root: process.cwd(),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
