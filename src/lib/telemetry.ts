"use client";

import { useSyncExternalStore } from "react";

/** Round-trip time of the most recent API call, shown in the top bar. */
let latency: number | null = null;
const listeners = new Set<() => void>();

export async function timedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const t0 = performance.now();
  const res = await fetch(input, init);
  // Prefer the network stack's own timing: wall-clock time would also count however long
  // the page's main thread was busy before this callback ran.
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.href).href;
  const entries = performance.getEntriesByName(url, "resource");
  const entry = entries[entries.length - 1] as PerformanceResourceTiming | undefined;
  latency = Math.round(entry && entry.startTime >= t0 - 1 ? entry.duration : performance.now() - t0);
  listeners.forEach((l) => l());
  return res;
}

export function useLatency(): number | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => latency,
    () => null,
  );
}

function subscribeClock(cb: () => void) {
  const id = setInterval(cb, 1000);
  return () => clearInterval(id);
}

/** Epoch seconds, ticking once a second; null during server render. */
export function useClock(): number | null {
  return useSyncExternalStore(subscribeClock, () => Math.floor(Date.now() / 1000), () => null);
}
