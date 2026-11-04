"use client";

import { useSyncExternalStore } from "react";

/**
 * Performance tier for the animated parts of the site (viewport, tracker globe, …).
 *
 * - "full"   — everything, at native resolution.
 * - "lite"   — same look, cheaper: lower resolution, fewer particles, ~30 fps.
 * - "static" — one still frame, no animation loop (prefers-reduced-motion).
 *
 * "auto" picks from prefers-reduced-motion, Save-Data / slow connection, device memory, CPU cores,
 * a small viewport and a short frame-time probe. People can force "full" or "lite"; that choice is
 * stored in this browser (`zcan:perf:v1`). Reduced motion always wins and gives "static".
 */

export type PerfTier = "full" | "lite" | "static";
export type PerfMode = "auto" | "full" | "lite";
/** Why "auto" stepped down. */
export type PerfReason = "reduced" | "saveData" | "slowNet" | "memory" | "cores" | "small" | "frames";
export type PerfState = { mode: PerfMode; tier: PerfTier; auto: PerfTier; reasons: readonly PerfReason[] };

const KEY = "zcan:perf:v1";
const EVENT = "zcan:perf";
/** The probe result lives for the session only, so a busy moment doesn't stick forever. */
const PROBE_KEY = "zcan:perf:probe";

const SERVER: PerfState = { mode: "auto", tier: "full", auto: "full", reasons: [] };
let snapshot: PerfState | null = null;
let lastComputed: PerfState | null = null;
let probeSlow: boolean | null = null;
// If storage throws, the chosen mode still applies to this page.
let overrideFallback: PerfMode | null = null;

type NetInfo = { saveData?: boolean; effectiveType?: string; addEventListener?: (t: string, cb: () => void) => void; removeEventListener?: (t: string, cb: () => void) => void };
const connection = (): NetInfo | undefined => (navigator as Navigator & { connection?: NetInfo }).connection;

function readMode(): PerfMode {
  try {
    const v = localStorage.getItem(KEY);
    return v === "full" || v === "lite" ? v : "auto";
  } catch {
    return overrideFallback ?? "auto";
  }
}

function readProbe(): boolean {
  if (probeSlow !== null) return probeSlow;
  try {
    probeSlow = sessionStorage.getItem(PROBE_KEY) === "slow";
  } catch {
    probeSlow = false;
  }
  return probeSlow;
}

function compute(): PerfState {
  const mode = readMode();
  const reasons: PerfReason[] = [];
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) reasons.push("reduced");
  const net = connection();
  if (net?.saveData) reasons.push("saveData");
  if (net?.effectiveType && /(^|-)(2g|3g)$/.test(net.effectiveType)) reasons.push("slowNet");
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (mem && mem <= 4) reasons.push("memory");
  const cores = navigator.hardwareConcurrency;
  if (cores && cores <= 4) reasons.push("cores");
  if (matchMedia("(max-width: 767.98px)").matches) reasons.push("small");
  if (readProbe()) reasons.push("frames");
  const auto: PerfTier = reasons.includes("reduced") ? "static" : reasons.length ? "lite" : "full";
  const tier: PerfTier = auto === "static" || mode === "auto" ? auto : mode;
  return { mode, tier, auto, reasons };
}

function read(): PerfState {
  if (snapshot) return snapshot;
  const next = compute();
  // Keep the same object while nothing meaningful changed so subscribers don't re-render.
  const prev = lastComputed;
  snapshot = prev && prev.mode === next.mode && prev.tier === next.tier && prev.auto === next.auto && prev.reasons.join() === next.reasons.join() ? prev : next;
  lastComputed = snapshot;
  return snapshot;
}

const listeners = new Set<() => void>();
let teardown: (() => void) | null = null;

function invalidate() {
  snapshot = null;
  const before = lastComputed;
  if (read() !== before) listeners.forEach((l) => l());
}

function start() {
  // Signals may have changed while nobody was listening.
  snapshot = null;
  const queries = ["(prefers-reduced-motion: reduce)", "(max-width: 767.98px)"].map((q) => matchMedia(q));
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY || e.key === null) invalidate();
  };
  const onLocal = () => invalidate();
  queries.forEach((q) => q.addEventListener("change", invalidate));
  connection()?.addEventListener?.("change", invalidate);
  window.addEventListener(EVENT, onLocal);
  window.addEventListener("zcan:local", onLocal);
  window.addEventListener("storage", onStorage);
  return () => {
    queries.forEach((q) => q.removeEventListener("change", invalidate));
    connection()?.removeEventListener?.("change", invalidate);
    window.removeEventListener(EVENT, onLocal);
    window.removeEventListener("zcan:local", onLocal);
    window.removeEventListener("storage", onStorage);
  };
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  teardown ??= start();
  return () => {
    listeners.delete(cb);
    if (!listeners.size && teardown) {
      teardown();
      teardown = null;
    }
  };
}

/** Current tier plus the chosen mode and the reasons "auto" stepped down. Server render: "full". */
export function usePerf(): PerfState {
  return useSyncExternalStore(subscribe, read, () => SERVER);
}

/** Just the tier: "full" | "lite" | "static". */
export function usePerfTier(): PerfTier {
  return usePerf().tier;
}

/** Non-React read, for imperative code. */
export function getPerf(): PerfState {
  return typeof window === "undefined" ? SERVER : read();
}

export function setPerfMode(mode: PerfMode) {
  try {
    if (mode === "auto") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, mode);
  } catch {
    // Storage unavailable — the choice still applies until reload.
  }
  overrideFallback = mode;
  window.dispatchEvent(new Event(EVENT));
}

/* ------------------------------------------------------------------ */
/* Frame-time probe                                                   */
/* ------------------------------------------------------------------ */

const PROBE_FRAMES = 60;
/** Average gap between animation frames above this means the device can't keep up. */
const SLOW_INTERVAL_MS = 24;
/** …or our own per-frame work alone eats most of a 30 fps budget. */
const SLOW_WORK_MS = 18;
/** Ignore the first moments: hydration and JIT warm-up make early frames unrepresentative. */
const WARMUP_MS = 1500;
let firstSampleAt = 0;
let samples = 0;
let sumInterval = 0;
let rendered = 0;
let sumWork = 0;

/**
 * Animation loops feed this while they run at "full" in auto mode: `interval` is the gap since the
 * previous requestAnimationFrame callback, `work` the time our frame code took (0 on skipped ticks).
 * After ~60 frames, a slow average steps "auto" down to "lite" for the rest of the session.
 */
export function sampleFrame(interval: number, work: number) {
  if (samples >= PROBE_FRAMES || readProbe()) return;
  // Only "auto" at "full" can step down; a forced mode or an already-light tier is left alone.
  const s = read();
  if (s.mode !== "auto" || s.tier !== "full") return;
  // Long gaps are tab switches, scrolling stalls or GC — not the steady state we want to measure.
  if (!(interval > 0) || interval > 250) return;
  const now = performance.now();
  firstSampleAt ||= now;
  if (now - firstSampleAt < WARMUP_MS) return;
  samples++;
  sumInterval += interval;
  if (work > 0) {
    rendered++;
    sumWork += work;
  }
  if (samples < PROBE_FRAMES) return;
  const avgInterval = sumInterval / samples;
  // Work is only spent on rendered ticks (loops cap their frame rate), so average over those.
  const avgWork = rendered ? sumWork / rendered : 0;
  if (avgInterval > SLOW_INTERVAL_MS || avgWork > SLOW_WORK_MS) {
    probeSlow = true;
    try {
      sessionStorage.setItem(PROBE_KEY, "slow");
    } catch {
      // Session storage unavailable — the step-down still applies to this page.
    }
    invalidate();
  }
}

/** True while the probe still wants samples (so loops can skip the bookkeeping afterwards). */
export const probing = () => samples < PROBE_FRAMES && !probeSlow;
