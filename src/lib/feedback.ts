"use client";

import { useSyncExternalStore } from "react";

/**
 * Optional sound effects and vibration, both OFF by default and kept only in this browser.
 * Sounds are synthesized with the Web Audio API (no audio files); vibration uses navigator.vibrate
 * where the browser supports it (Android Chrome/Firefox — iOS Safari doesn't, so it's a no-op there).
 */

export type FeedbackPrefs = { sound: boolean; haptics: boolean };
export type FeedbackKind = "success" | "refund" | "alert" | "tap" | "error";

const KEY = "zcan:prefs:v1";
const EVENT = "zcan:prefs";
const DEFAULTS: FeedbackPrefs = { sound: false, haptics: false };

let snapshot: FeedbackPrefs | null = null;

function read(): FeedbackPrefs {
  if (snapshot) return snapshot;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    const p = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    snapshot = { sound: p.sound === true, haptics: p.haptics === true };
  } catch {
    snapshot = DEFAULTS;
  }
  return snapshot;
}

/** Update one or both preferences. Keeps any other fields stored under the same key. */
export function setFeedbackPrefs(patch: Partial<FeedbackPrefs>) {
  snapshot = { ...read(), ...patch };
  try {
    const raw = localStorage.getItem(KEY);
    const prev: unknown = raw ? JSON.parse(raw) : null;
    const base = prev && typeof prev === "object" && !Array.isArray(prev) ? prev : {};
    localStorage.setItem(KEY, JSON.stringify({ ...base, ...snapshot }));
  } catch {
    // Storage unavailable — the choice lasts for this session only.
  }
  window.dispatchEvent(new Event(EVENT));
}

export function getFeedbackPrefs(): FeedbackPrefs {
  return typeof window === "undefined" ? DEFAULTS : read();
}

function subscribe(cb: () => void) {
  const reset = () => {
    snapshot = null;
    cb();
  };
  const onStorage = (e: StorageEvent) => (e.key === KEY || e.key === null) && reset();
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

export function useFeedbackPrefs(): FeedbackPrefs {
  return useSyncExternalStore(subscribe, read, () => DEFAULTS);
}

export const PREFS_KEY = KEY;

/* ── Vibration ─────────────────────────────────────────────────────────── */

const PATTERNS: Record<FeedbackKind, number[]> = {
  success: [12, 40, 18],
  alert: [20, 60, 20],
  tap: [8],
  refund: [30],
  error: [30],
};

export const canVibrate = () => typeof navigator !== "undefined" && typeof navigator.vibrate === "function";

function vibrate(kind: FeedbackKind) {
  if (!canVibrate()) return;
  // Chrome ignores (and logs) vibrate() before the user has interacted with the page.
  const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  if (ua && !ua.hasBeenActive) return;
  try {
    navigator.vibrate(PATTERNS[kind]);
  } catch {
    // Ignore — vibration is best-effort.
  }
}

/* ── Sound ─────────────────────────────────────────────────────────────── */

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  } catch {
    ctx = null;
  }
  return ctx;
}

type Note = { f: number; to?: number; at: number; dur: number; gain: number; type?: OscillatorType };

/** Peak gains stay ≤ 0.08 — these are meant to be noticed, not heard across the room. */
const NOTES: Record<FeedbackKind, Note[]> = {
  // Two soft rising notes.
  success: [
    { f: 660, at: 0, dur: 0.12, gain: 0.06 },
    { f: 990, at: 0.09, dur: 0.14, gain: 0.05 },
  ],
  // A soft falling pair.
  refund: [
    { f: 587, at: 0, dur: 0.13, gain: 0.055 },
    { f: 440, at: 0.1, dur: 0.16, gain: 0.05 },
  ],
  // A gentle double ping.
  alert: [
    { f: 1046, at: 0, dur: 0.16, gain: 0.05 },
    { f: 1046, at: 0.2, dur: 0.2, gain: 0.045 },
  ],
  // A very short click-like blip.
  tap: [{ f: 1400, to: 900, at: 0, dur: 0.035, gain: 0.04 }],
  // A low, short tone.
  error: [{ f: 220, to: 196, at: 0, dur: 0.18, gain: 0.06, type: "triangle" }],
};

function play(ac: AudioContext, kind: FeedbackKind) {
  const t0 = ac.currentTime + 0.01;
  for (const n of NOTES[kind]) {
    const start = t0 + n.at;
    const end = start + n.dur;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = n.type ?? "sine";
    osc.frequency.setValueAtTime(n.f, start);
    if (n.to) osc.frequency.exponentialRampToValueAtTime(n.to, end);
    // Quick attack, smooth exponential release — no clicks.
    g.gain.setValueAtTime(0.0001, start);
    g.gain.linearRampToValueAtTime(Math.min(n.gain, 0.08), start + Math.min(0.012, n.dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(g).connect(ac.destination);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
    osc.start(start);
    osc.stop(end + 0.02);
  }
}

function sound(kind: FeedbackKind) {
  const ac = audio();
  if (!ac) return;
  try {
    if (ac.state === "running") return play(ac, kind);
    // Autoplay rules: resume() only succeeds after a user gesture. If it resolves much later (on the
    // next click), the moment has passed — skip rather than play a stale sound.
    const asked = performance.now();
    ac.resume()
      .then(() => {
        if (ac.state === "running" && performance.now() - asked < 500) play(ac, kind);
      })
      .catch(() => {});
  } catch {
    // Never let a sound break the app.
  }
}

/** With sound on, wake the audio context on the first tap/keypress so later, non-gesture sounds can play. */
function unlockOnGesture() {
  const opts = { capture: true, passive: true } as const;
  function done() {
    window.removeEventListener("pointerdown", unlock, opts);
    window.removeEventListener("keydown", unlock, opts);
  }
  function unlock() {
    if (!read().sound) return;
    const ac = audio();
    if (!ac || ac.state === "running") return done();
    ac.resume().then(done, () => {});
  }
  window.addEventListener("pointerdown", unlock, opts);
  window.addEventListener("keydown", unlock, opts);
}

if (typeof window !== "undefined") unlockOnGesture();

/* ── Public API ────────────────────────────────────────────────────────── */

const last: Partial<Record<FeedbackKind, number>> = {};

/**
 * Play the sound and/or vibration for a moment, if the user turned them on. Never throws.
 * Silent in a hidden tab, except "alert" (sound only) which is the point of a price alert.
 * `force` plays regardless of the saved prefs (used by the Preview button).
 */
export function feedback(kind: FeedbackKind, force?: Partial<FeedbackPrefs>) {
  if (typeof window === "undefined") return;
  try {
    const prefs = force ? { ...read(), ...force } : read();
    if (!prefs.sound && !prefs.haptics) return;
    const hidden = document.visibilityState === "hidden";
    if (hidden && kind !== "alert") return;
    // Several orders finishing in the same poll should sound once, not stack.
    const now = Date.now();
    if (now - (last[kind] ?? 0) < 400) return;
    last[kind] = now;
    if (prefs.sound) sound(kind);
    if (prefs.haptics && !hidden) vibrate(kind);
  } catch {
    // Best-effort only.
  }
}
