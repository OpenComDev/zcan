"use client";

import { useSyncExternalStore } from "react";

/** A swap the user created in this browser. Stored locally only — Zcan has no accounts. */
export type HistoryEntry = {
  depositAddress: string;
  depositMemo?: string;
  createdAt: string;
  fromSymbol: string;
  fromChain: string;
  toSymbol: string;
  toChain: string;
  amountIn: string;
  amountOut: string;
  status?: string;
  /** Backup-route order reference ("cn:<id>"), needed to look the order up while 1Click is down. */
  via?: string;
  /** Set when this order is one leg of a private send. */
  batchId?: string;
};

const KEY = "zcan:history:v1";
const EVENT = "zcan:history";
const EMPTY: HistoryEntry[] = [];

let snapshot: HistoryEntry[] | null = null;

function read(): HistoryEntry[] {
  if (snapshot) return snapshot;
  try {
    const raw = localStorage.getItem(KEY);
    snapshot = raw ? (JSON.parse(raw) as HistoryEntry[]) : EMPTY;
  } catch {
    snapshot = EMPTY;
  }
  return snapshot;
}

function write(entries: HistoryEntry[]) {
  snapshot = entries;
  try {
    localStorage.setItem(KEY, JSON.stringify(entries.slice(0, 50)));
  } catch {
    // Storage unavailable (private mode, quota) — history stays in memory for this session.
  }
  window.dispatchEvent(new Event(EVENT));
}

export function addHistory(entry: HistoryEntry) {
  write([entry, ...read().filter((e) => e.depositAddress !== entry.depositAddress)]);
}

export function updateHistoryStatus(depositAddress: string, status: string) {
  const entries = read();
  const hit = entries.find((e) => e.depositAddress === depositAddress);
  if (!hit || hit.status === status) return;
  write(entries.map((e) => (e.depositAddress === depositAddress ? { ...e, status } : e)));
}

export function removeHistory(depositAddress: string) {
  write(read().filter((e) => e.depositAddress !== depositAddress));
}

/** Drop the cached list and re-read storage — call after storage was cleared or replaced from outside. */
export function resetHistory() {
  snapshot = null;
  window.dispatchEvent(new Event(EVENT));
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

export function useHistory(): HistoryEntry[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
