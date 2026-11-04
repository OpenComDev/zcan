"use client";

import { browserOf, routeOf, scrubStack, scrubText, type ErrorReport } from "./error-scrub";
import { getReportingPrefs } from "./reporting-prefs";

/**
 * Sends a scrubbed crash report to Zcan's own /api/errors. At most a few per page view, each distinct
 * error once. Skipped when crash reports are off in Settings. Never throws.
 */

const MAX_PER_PAGE = 5;
const sent = new Set<string>();
// Noise that isn't Zcan's bug: browser quirks, extensions, cross-origin scripts with no details.
const IGNORE = /ResizeObserver loop|Script error\.?$|^Load failed$|NetworkError when attempting|Failed to fetch|AbortError|The user aborted|cancelled|chrome-extension:|moz-extension:|safari-web-extension:/i;

const release = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA;

export function reportError(err: unknown, source: "client" | "boundary" = "client", digest?: string): boolean {
  try {
    if (typeof window === "undefined" || !getReportingPrefs().crash) return false;
    const e = err instanceof Error ? err : new Error(typeof err === "string" ? err : "Non-error thrown");
    const raw = `${e.message}\n${e.stack ?? ""}`;
    if (IGNORE.test(raw) || sent.size >= MAX_PER_PAGE) return false;
    const host = location.host;
    const report: ErrorReport = {
      source,
      name: scrubText(e.name || "Error", host).slice(0, 60),
      message: scrubText(e.message || "Unknown error", host),
      stack: scrubStack(e.stack, host),
      route: routeOf(location.pathname),
      env: browserOf(navigator.userAgent),
      locale: document.documentElement.lang || undefined,
      release: release && /^[0-9a-f]{7,40}$/.test(release) ? release.slice(0, 12) : undefined,
      digest,
    };
    const key = `${report.name}|${report.message}|${report.route}`;
    if (sent.has(key)) return true;
    sent.add(key);
    const body = JSON.stringify(report);
    // keepalive lets the report finish even if the page is being closed.
    void fetch("/api/errors", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

let installed = false;

/** Global listeners for uncaught errors and rejected promises. */
export function installErrorReporting() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (ev) => {
    // Resource load errors (img/script 404s) have no `error` and aren't crashes.
    if (ev.error) reportError(ev.error);
  });
  window.addEventListener("unhandledrejection", (ev) => reportError(ev.reason));
}
