import { after } from "next/server";
import { PROPS, analyticsProvider, isEvent } from "@/lib/analytics-events";
import { routeOf, scrubText } from "@/lib/error-scrub";

/**
 * Analytics proxy: the browser sends a minimal event here and this forwards it to Plausible or Umami.
 * The provider never gets a script on the page, cookies, the full URL or the query string.
 * It does get the visitor's IP address and browser user agent, which it needs to tell real visitors
 * from bots and to count unique visitors; Plausible documents that it doesn't store the IP.
 *
 * Env: NEXT_PUBLIC_ANALYTICS = plausible | umami
 *      ANALYTICS_SITE = the domain added in Plausible (e.g. zcan.dev) or the Umami website id
 *      ANALYTICS_HOST = only for a self-hosted instance (defaults: https://plausible.io, https://gateway.umami.is)
 */

const PROVIDER = analyticsProvider();
const SITE = process.env.ANALYTICS_SITE?.trim();
const HOST = (process.env.ANALYTICS_HOST?.trim() || (PROVIDER === "umami" ? "https://gateway.umami.is" : "https://plausible.io")).replace(/\/+$/, "");
const DOMAIN = process.env.ANALYTICS_DOMAIN?.trim() || (PROVIDER === "plausible" ? SITE : undefined) || "zcan.dev";

// Per-instance burst limit; a flood only wastes the provider's quota, never exposes data.
const PER_MINUTE = 120;
const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= PER_MINUTE) return true;
  recent.push(now);
  if (hits.size > 5000) hits.clear();
  hits.set(ip, recent);
  return false;
}

const done = () => new Response(null, { status: 204, headers: { "cache-control": "no-store" } });

export async function POST(req: Request) {
  if (!PROVIDER || !SITE) return done();
  let raw: Record<string, unknown>;
  try {
    const text = await req.text();
    if (text.length > 2000) return done();
    raw = JSON.parse(text);
  } catch {
    return done();
  }
  if (!raw || typeof raw !== "object" || !isEvent(raw.n)) return done();

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "";
  const ua = req.headers.get("user-agent")?.slice(0, 400) || "";
  if (!ua || limited(ip || "local")) return done();

  const name = raw.n;
  const route = routeOf(typeof raw.r === "string" ? raw.r : "/");
  const props: Record<string, string> = {};
  if (raw.p && typeof raw.p === "object") {
    for (const k of PROPS) {
      const v = (raw.p as Record<string, unknown>)[k];
      if (typeof v === "string" && v) props[k] = scrubText(v).slice(0, 40);
    }
  }
  let referrer: string | undefined;
  if (typeof raw.ref === "string") {
    try {
      const u = new URL(raw.ref);
      if (/^https?:$/.test(u.protocol)) referrer = `${u.protocol}//${u.host}`;
    } catch {
      // ignore
    }
  }
  const language = req.headers.get("accept-language")?.split(",")[0]?.trim().slice(0, 16);

  // Answer the browser straight away; forward after the response is sent.
  after(async () => {
    const headers: Record<string, string> = { "content-type": "application/json", "user-agent": ua };
    if (ip) headers["x-forwarded-for"] = ip;
    const body =
      PROVIDER === "plausible"
        ? { name, url: `https://${DOMAIN}${route}`, domain: SITE, referrer, props: Object.keys(props).length ? props : undefined }
        : {
            type: "event",
            payload: { website: SITE, hostname: DOMAIN, url: route, referrer: referrer ?? "", language, ...(name === "pageview" ? {} : { name, data: props }) },
          };
    try {
      await fetch(`${HOST}${PROVIDER === "plausible" ? "/api/event" : "/api/send"}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.timeout(3000),
      });
    } catch {
      // Provider unreachable: the event is lost, nothing else happens.
    }
  });
  return done();
}
