"use client";

import { analyticsProvider, type EventName, type EventProps } from "./analytics-events";
import { routeOf } from "./error-scrub";
import { getReportingPrefs } from "./reporting-prefs";

/**
 * Cookieless usage counts. Events go to Zcan's own /api/event, which forwards them to the analytics
 * provider (Plausible or Umami) — no third-party script runs on the page. Only the page path (ids
 * removed, no query string), the event name, a few coarse labels and the referring site are sent.
 * Off when NEXT_PUBLIC_ANALYTICS isn't set, or when the visitor switches "Usage stats" off in Settings
 * (off by default for browsers sending Global Privacy Control or Do Not Track).
 */

const PROVIDER = analyticsProvider();
let lastPath: string | null = null;
let sentReferrer = false;

function send(name: EventName, props?: EventProps, path?: string) {
  try {
    if (!PROVIDER || typeof window === "undefined" || !getReportingPrefs().usage) return;
    const body: Record<string, unknown> = { n: name, r: routeOf(path ?? location.pathname) };
    if (props) body.p = props;
    if (!sentReferrer) {
      sentReferrer = true;
      try {
        const ref = document.referrer ? new URL(document.referrer) : null;
        // Only the referring site, and only when it's another site.
        if (ref && ref.host !== location.host && /^https?:$/.test(ref.protocol)) body.ref = `${ref.protocol}//${ref.host}`;
      } catch {
        // Unparseable referrer: skip it.
      }
    }
    void fetch("/api/event", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), keepalive: true }).catch(() => {});
  } catch {
    // Analytics must never break the page.
  }
}

/** Feature events go out a moment after the work, never while a local tool is running (see LocalProof). */
const DEFER_MS = 2000;

/** Counts a feature being used, e.g. track("Link cleaned"). Only the name and coarse labels, never the input. */
export function track(name: Exclude<EventName, "pageview">, props?: EventProps) {
  if (!PROVIDER) return;
  const path = typeof location === "undefined" ? "/" : location.pathname;
  setTimeout(() => send(name, props, path), DEFER_MS);
}

/** Counts a page view; repeated calls for the same path (e.g. hash or query changes) are ignored. */
export function trackPageview(pathname = typeof location === "undefined" ? "/" : location.pathname) {
  if (pathname === lastPath) return;
  lastPath = pathname;
  send("pageview", undefined, pathname);
}

export const analyticsOn = () => PROVIDER !== null;
