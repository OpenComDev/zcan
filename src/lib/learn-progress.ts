"use client";

import { useSyncExternalStore } from "react";

/** Which Learn explainers this browser has read: slug → ISO time. Stored locally only. */
export type LearnProgress = Record<string, string>;

const KEY = "zcan:learn:v1";
const EVENT = "zcan:learn";
const EMPTY: LearnProgress = {};

let snapshot: LearnProgress | null = null;

function read(): LearnProgress {
  if (snapshot) return snapshot;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    snapshot = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as LearnProgress) : EMPTY;
  } catch {
    snapshot = EMPTY;
  }
  return snapshot;
}

function write(next: LearnProgress) {
  snapshot = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable (private mode, quota) — progress stays in memory for this session.
  }
  window.dispatchEvent(new Event(EVENT));
}

export function markRead(slug: string) {
  if (read()[slug]) return;
  write({ ...read(), [slug]: new Date().toISOString() });
}

export function markUnread(slug: string) {
  const current = read();
  if (!current[slug]) return;
  const next = { ...current };
  delete next[slug];
  write(next);
}

/** Clears all progress and returns what was there, so the caller can offer Undo. */
export function resetLearnProgress(): LearnProgress {
  const previous = read();
  write(EMPTY);
  return previous;
}

export function restoreLearnProgress(progress: LearnProgress) {
  write({ ...read(), ...progress });
}

function subscribe(cb: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      snapshot = null;
      cb();
    }
  };
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useLearnProgress(): LearnProgress {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
