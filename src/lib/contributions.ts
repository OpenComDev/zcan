"use client";

import { useSyncExternalStore } from "react";

/**
 * Runs this browser shared as training data. Only the id and the withdrawal token live here —
 * they're what lets the reader take a share back later. Nothing about the run itself is kept.
 */
export type Contribution = { id: string; token: string; agentId: string; sharedAt: string };

const KEY = "zcan:contributions:v1";
const EVENT = "zcan:contributions";
const EMPTY: Contribution[] = [];

let snapshot: Contribution[] | null = null;

function read(): Contribution[] {
  if (snapshot) return snapshot;
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    snapshot = Array.isArray(parsed)
      ? (parsed as Contribution[]).filter((c) => c && typeof c.id === "string" && typeof c.token === "string")
      : EMPTY;
  } catch {
    snapshot = EMPTY;
  }
  return snapshot;
}

function write(list: Contribution[]) {
  snapshot = list.slice(0, 200);
  try {
    localStorage.setItem(KEY, JSON.stringify(snapshot));
  } catch {
    // Storage unavailable — kept in memory for this page view.
  }
  window.dispatchEvent(new Event(EVENT));
}

export const addContribution = (c: Contribution) => write([c, ...read().filter((x) => x.id !== c.id)]);
export const removeContribution = (id: string) => write(read().filter((c) => c.id !== id));

/** Asks the server to delete a shared run, then forgets it locally. */
export async function withdrawContribution(c: Contribution): Promise<boolean> {
  const res = await fetch("/api/training/contribute", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: c.id, token: c.token }),
  }).catch(() => null);
  if (!res?.ok) return false;
  removeContribution(c.id);
  return true;
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

export function useContributions(): Contribution[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
