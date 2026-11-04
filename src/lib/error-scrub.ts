import { findSecret } from "./secret-guard";

/**
 * Strips anything personal from an error before it's reported: addresses, keys, emails, long ids,
 * query strings and other sites' paths. Pure, so the browser scrubs before sending and the server
 * scrubs again before storing (never trust the client).
 */

const MAX_MESSAGE = 400;
const MAX_FRAMES = 12;
const MAX_STACK = 2000;

const URL_RE = /\b(?:https?|wss?|blob|chrome-extension|moz-extension|safari-web-extension):\/\/[^\s'"()<>]+/gi;
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
// Crypto addresses and keys: Zcash (t1/t3/u1/zs1/tex1), Bitcoin/Litecoin bech32, EVM hex, long base58/base64 runs.
const ADDRESS_RE = /\b(?:u1|zs1|tex1|bc1|ltc1|utest1|secret-extended-key-main)[02-9ac-hj-np-z]{20,}\b|\b[tT][13][1-9A-HJ-NP-Za-km-z]{30,}\b|\b0x[0-9a-fA-F]{16,}\b/g;
const HEX_RE = /\b[0-9a-fA-F]{16,}\b/g;
const TOKEN_RE = /\b[A-Za-z0-9_-]{28,}\b/g;
const NUMBER_RE = /\b\d{6,}\b/g;

/** Keeps a URL's shape without its query, hash or (for other sites) its path. */
function scrubUrl(raw: string, ownHost?: string): string {
  try {
    const u = new URL(raw);
    if (u.protocol.endsWith("extension:")) return "[extension]";
    if (ownHost && u.host === ownHost) return `${u.pathname.replace(/\/[^/]{24,}/g, "/[id]")}`;
    return `${u.protocol}//${u.host}`;
  } catch {
    return "[url]";
  }
}

export function scrubText(raw: string, ownHost?: string): string {
  let s = String(raw ?? "").slice(0, 4000);
  // A seed phrase or private key anywhere means the whole message goes.
  if (findSecret(s)) return "[removed: looked like a secret]";
  s = s
    .replace(URL_RE, (m) => scrubUrl(m, ownHost))
    .replace(EMAIL_RE, "[email]")
    .replace(ADDRESS_RE, "[address]")
    .replace(HEX_RE, "[hex]")
    .replace(TOKEN_RE, "[id]")
    .replace(NUMBER_RE, "[n]")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return s.length > MAX_MESSAGE ? `${s.slice(0, MAX_MESSAGE)}…` : s;
}

/** Keeps function names and Zcan's own script paths; drops other frames' URLs and anything secret-looking. */
export function scrubStack(raw: string | undefined, ownHost?: string): string | undefined {
  if (!raw) return undefined;
  const frames = String(raw)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /:\d+:\d+\)?$/.test(l))
    .slice(0, MAX_FRAMES)
    .map((l) => {
      // "at fn (https://host/_next/static/chunks/x.js:1:2)" or "fn@https://host/…:1:2"
      const m = l.match(/^(.*?)[(@ ]?((?:https?|wss?|blob|[a-z-]+-extension):\/\/[^\s()]+?)(:\d+:\d+)\)?$/i);
      if (!m) return scrubText(l, ownHost);
      let where: string;
      try {
        const u = new URL(m[2]);
        // Zcan's own bundles are public build output: keep their paths so a stack can be traced.
        where = ownHost && u.host === ownHost && u.pathname.startsWith("/_next/static/") ? u.pathname : scrubUrl(m[2], ownHost);
      } catch {
        where = "[url]";
      }
      const fn = scrubText(m[1].replace(/^at\b\s*/, ""), ownHost);
      return `at ${fn ? `${fn} ` : ""}(${where}${m[3]})`;
    });
  const out = frames.join("\n");
  return out ? out.slice(0, MAX_STACK) : undefined;
}

/**
 * The page a report came from, with ids taken out: /order/abc123 → /order/[id].
 * Query strings and hashes never leave (they can hold addresses and amounts).
 */
export function routeOf(pathname: string): string {
  const p = String(pathname || "/").split(/[?#]/)[0].slice(0, 200);
  return (
    p
      .replace(/^(\/[a-z]{2})?\/(order|send|track)\/[^/]+/, "$1/$2/[id]")
      .split("/")
      .map((seg) => (seg.length > 40 || /^[A-Za-z0-9_-]{20,}$/.test(seg) ? "[id]" : seg))
      .join("/") || "/"
  );
}

/** Coarse browser family and major version, e.g. "Chrome 141", "Safari 19", "Firefox 145". Nothing finer. */
export function browserOf(ua: string): string {
  const m =
    ua.match(/\b(Edg|OPR|SamsungBrowser|Firefox|FxiOS|CriOS)\/(\d+)/) ??
    (/\bChrome\/(\d+)/.test(ua) ? ["", "Chrome", ua.match(/\bChrome\/(\d+)/)![1]] : null) ??
    (/\bVersion\/(\d+).*Safari\//.test(ua) ? ["", "Safari", ua.match(/\bVersion\/(\d+)/)![1]] : null);
  if (!m) return "Other";
  const name = { Edg: "Edge", OPR: "Opera", FxiOS: "Firefox", CriOS: "Chrome" }[m[1] as string] ?? m[1];
  const os = /iPhone|iPad|iOS/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  return `${name} ${m[2]}${os ? ` · ${os}` : ""}`;
}

export type ErrorReport = {
  /** "client" (browser), "boundary" (a page crashed and showed the error screen), "server", or "csp" (a Content Security Policy violation). */
  source: "client" | "boundary" | "server" | "csp";
  name: string;
  message: string;
  stack?: string;
  route: string;
  /** Browser family, or the server route type. */
  env: string;
  locale?: string;
  release?: string;
  digest?: string;
};

const SOURCES = new Set(["client", "boundary", "server", "csp"]);
const short = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : "");

/** Validates and re-scrubs an incoming report. Returns null when it isn't a report. */
export function sanitizeReport(raw: unknown, ownHost?: string): ErrorReport | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const source = SOURCES.has(r.source as string) ? (r.source as ErrorReport["source"]) : null;
  const message = scrubText(short(r.message, 4000), ownHost);
  if (!source || !message) return null;
  return {
    source,
    name: scrubText(short(r.name, 80) || "Error", ownHost).slice(0, 60),
    message,
    stack: scrubStack(short(r.stack, 8000) || undefined, ownHost),
    route: routeOf(short(r.route, 300)),
    env: scrubText(short(r.env, 80), ownHost).slice(0, 60),
    locale: /^[a-z]{2}$/.test(short(r.locale, 2)) ? short(r.locale, 2) : undefined,
    release: /^[0-9a-f]{7,40}$/.test(short(r.release, 40)) ? short(r.release, 12) : undefined,
    digest: /^[\w-]{1,40}$/.test(short(r.digest, 40)) ? short(r.digest, 40) : undefined,
  };
}
