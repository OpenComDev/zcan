"use client";

import { useSyncExternalStore } from "react";

/**
 * Orders the reader has marked as shielded after a transparent ZEC payout, kept only in this browser.
 * depositAddress → ISO time it was marked.
 */

const KEY = "zcan:shielded:v1";
const EVENT = "zcan:shielded";
const MAX = 500;
const EMPTY: Readonly<Record<string, string>> = {};

let snapshot: Readonly<Record<string, string>> | null = null;

function read(): Readonly<Record<string, string>> {
  if (snapshot) return snapshot;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    const out: Record<string, string> = {};
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) if (typeof v === "string") out[k] = v;
    }
    snapshot = out;
  } catch {
    snapshot = EMPTY;
  }
  return snapshot;
}

function write(next: Record<string, string>) {
  // Keep the newest entries if it ever grows large.
  const entries = Object.entries(next).sort((a, b) => b[1].localeCompare(a[1])).slice(0, MAX);
  snapshot = Object.fromEntries(entries);
  try {
    localStorage.setItem(KEY, JSON.stringify(snapshot));
  } catch {
    // Storage unavailable — the mark lasts for this session only.
  }
  window.dispatchEvent(new Event(EVENT));
}

export function setShielded(depositAddress: string, on: boolean) {
  const next = { ...read() };
  if (on) next[depositAddress] = new Date().toISOString();
  else delete next[depositAddress];
  write(next);
}

function subscribe(cb: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY || e.key === null) {
      snapshot = null;
      cb();
    }
  };
  const onLocal = () => {
    snapshot = null;
    cb();
  };
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", onStorage);
  window.addEventListener("zcan:local", onLocal);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("zcan:local", onLocal);
  };
}

/** ISO time the order was marked shielded, or null. */
export function useShieldedAt(depositAddress: string): string | null {
  return useSyncExternalStore(
    subscribe,
    () => read()[depositAddress] ?? null,
    () => null,
  );
}
