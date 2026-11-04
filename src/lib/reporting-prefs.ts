"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether this browser sends anonymous crash reports and cookieless usage counts. Kept only in this
 * browser, switchable in Settings → Privacy. Crash reports are on by default; usage counts are on by
 * default too, except in browsers that send Global Privacy Control or Do Not Track.
 */
export type ReportingPrefs = { crash: boolean; usage: boolean };

const KEY = "zcan:reporting:v1";
const EVENT = "zcan:reporting";
const DEFAULTS: ReportingPrefs = { crash: true, usage: true };

/** The browser asked sites not to track it. */
function optedOut(): boolean {
  try {
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
    return nav.globalPrivacyControl === true || nav.doNotTrack === "1";
  } catch {
    return false;
  }
}

let snapshot: ReportingPrefs | null = null;

function read(): ReportingPrefs {
  if (snapshot) return snapshot;
  try {
    const raw = localStorage.getItem(KEY);
    const p: unknown = raw ? JSON.parse(raw) : null;
    const o = p && typeof p === "object" ? (p as Record<string, unknown>) : {};
    snapshot = { crash: o.crash !== false, usage: typeof o.usage === "boolean" ? o.usage : !optedOut() };
  } catch {
    snapshot = { crash: true, usage: !optedOut() };
  }
  return snapshot;
}

export function getReportingPrefs(): ReportingPrefs {
  return typeof window === "undefined" ? DEFAULTS : read();
}

export function setReportingPrefs(patch: Partial<ReportingPrefs>) {
  snapshot = { ...read(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(snapshot));
  } catch {
    // Not persisted; applies to this page view.
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  const reset = () => {
    snapshot = null;
    cb();
  };
  const onStorage = (e: StorageEvent) => (e.key === KEY || e.key === null) && reset();
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", onStorage);
  window.addEventListener("zcan:local", reset);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("zcan:local", reset);
  };
}

export function useReportingPrefs(): ReportingPrefs {
  return useSyncExternalStore(subscribe, read, () => DEFAULTS);
}
