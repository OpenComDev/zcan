"use client";

import { useSyncExternalStore } from "react";

/**
 * First-visit tour state, kept only in this browser. `done` / `dismissed` stop it from
 * starting again; `step` lets an interrupted tour resume where it stopped. `running` is
 * in memory only: it is true while the tour is on screen (or about to be, after restartTour()).
 */

export type TourStepId = "swap" | "tools" | "agents";
export const TOUR_STEPS: TourStepId[] = ["swap", "tools", "agents"];

type Stored = { done?: boolean; dismissed?: boolean; step: number };
export type TourState = Stored & { running: boolean };

const KEY = "zcan:onboarding:v1";
const EVENT = "zcan:onboarding";
const SERVER: TourState = { step: 0, done: true, running: false };

let snapshot: TourState | null = null;
let running = false;

const clampStep = (n: unknown) => (typeof n === "number" && Number.isInteger(n) ? Math.min(Math.max(n, 0), TOUR_STEPS.length - 1) : 0);

function read(): TourState {
  if (snapshot) return snapshot;
  let stored: Stored = { step: 0 };
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object") {
      const p = parsed as Record<string, unknown>;
      stored = { done: p.done === true || undefined, dismissed: p.dismissed === true || undefined, step: clampStep(p.step) };
    }
  } catch {
    // Storage blocked or corrupt — treat as a first visit.
  }
  snapshot = { ...stored, running };
  return snapshot;
}

function write(next: Stored) {
  const clean: Stored = { step: clampStep(next.step) };
  if (next.done) clean.done = true;
  if (next.dismissed) clean.dismissed = true;
  snapshot = { ...clean, running };
  try {
    localStorage.setItem(KEY, JSON.stringify(clean));
  } catch {
    // Not persisted; the tour still behaves for this page view.
  }
  window.dispatchEvent(new Event(EVENT));
}

function setRunning(next: boolean) {
  running = next;
  snapshot = { ...read(), running };
  window.dispatchEvent(new Event(EVENT));
}

/** Show the tour now (called by the tour itself once the page is idle). */
export function beginTour() {
  setRunning(true);
}

export function setTourStep(step: number) {
  const s = read();
  write({ done: s.done, dismissed: s.dismissed, step });
}

/** Finished the last step. */
export function finishTour() {
  running = false;
  write({ done: true, step: TOUR_STEPS.length - 1 });
}

/** Skip / Esc / click outside. */
export function dismissTour() {
  running = false;
  write({ dismissed: true, step: read().step });
}

/** True when this browser already has swap history — not a first visit. */
export function hasPriorActivity(): boolean {
  try {
    const raw = localStorage.getItem("zcan:history:v1");
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) && parsed.length > 0;
  } catch {
    return false;
  }
}

/**
 * Start the tour again from step 1. It appears on "/" — pair it with a link there:
 * `<Link href="/" onClick={() => restartTour()}>Take the tour</Link>`.
 */
export function restartTour() {
  running = true;
  write({ step: 0 });
}

function subscribe(cb: () => void) {
  const reset = () => {
    snapshot = null;
    cb();
  };
  const onStorage = (e: StorageEvent) => e.key === KEY && reset();
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", onStorage);
  // Fired by /history after a backup import or "forget everything".
  window.addEventListener("zcan:local", reset);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("zcan:local", reset);
  };
}

export function useTour(): TourState {
  return useSyncExternalStore(subscribe, read, () => SERVER);
}
