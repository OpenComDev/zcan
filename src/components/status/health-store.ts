"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { HealthResponse } from "@/app/api/health/route";
import { timedFetch } from "@/lib/telemetry";

/**
 * Polls /api/health every 30 s while the status page is open. Latency history is kept in memory
 * for this browser session only (it survives in-app navigation, not a reload).
 */

const POLL_MS = 30_000;
const HISTORY = 40;

export type HealthState = {
  data: HealthResponse | null;
  /** Translation key of the last error ("status.unreachable"), or null. */
  error: string | null;
  checking: boolean;
  /** Round trip of the /api/health call itself, as seen from this browser. */
  roundTrip: number | null;
  /** Latency samples per service id, oldest first. "app" holds the round trips. */
  history: Readonly<Record<string, readonly number[]>>;
  /**
   * Checks this browser has seen per service id since the page loaded: how many came back up, out of how many.
   * "app" counts the /api/health calls themselves (a failed call counts as down).
   */
  observed: Readonly<Record<string, Observed>>;
};

export type Observed = { up: number; total: number };

const SERVER: HealthState = { data: null, error: null, checking: true, roundTrip: null, history: {}, observed: {} };
let state: HealthState = SERVER;
const listeners = new Set<() => void>();
let users = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let inflight = false;

const set = (next: HealthState) => {
  state = next;
  listeners.forEach((l) => l());
};

const push = (h: HealthState["history"], id: string, v: number) => ({ ...h, [id]: [...(h[id] ?? []), v].slice(-HISTORY) });
const tally = (o: HealthState["observed"], id: string, ok: boolean) => {
  const prev = o[id] ?? { up: 0, total: 0 };
  return { ...o, [id]: { up: prev.up + (ok ? 1 : 0), total: prev.total + 1 } };
};

export async function refreshHealth() {
  if (inflight) return;
  inflight = true;
  set({ ...state, checking: true });
  const t0 = performance.now();
  try {
    const res = await timedFetch("/api/health", { cache: "no-store" });
    const rtt = Math.round(performance.now() - t0);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as HealthResponse;
    let history = push(state.history, "app", rtt);
    for (const s of data.services) if (s.latencyMs != null) history = push(history, s.id, s.latencyMs);
    let observed = tally(state.observed, "app", true);
    for (const s of data.services) observed = tally(observed, s.id, s.ok);
    set({ data, error: null, checking: false, roundTrip: rtt, history, observed });
  } catch {
    set({ ...state, error: "status.unreachable", checking: false, observed: tally(state.observed, "app", false) });
  } finally {
    inflight = false;
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useHealth(): HealthState {
  const s = useSyncExternalStore(subscribe, () => state, () => SERVER);
  useEffect(() => {
    users += 1;
    const stale = !state.data || Date.now() - new Date(state.data.checkedAt).getTime() > POLL_MS / 2;
    if (stale) void refreshHealth();
    timer ??= setInterval(() => {
      if (document.visibilityState === "visible") void refreshHealth();
    }, POLL_MS);
    return () => {
      users -= 1;
      if (users === 0 && timer) {
        clearInterval(timer);
        timer = null;
      }
    };
  }, []);
  return s;
}
