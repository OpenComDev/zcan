"use client";

import { useSyncExternalStore } from "react";

/** One recipient of a private send: its own 1Click order and deposit address. */
export type BatchLeg = {
  depositAddress: string;
  depositMemo?: string;
  recipient: string;
  amountIn: string;
  amountOut: string;
  /** Minutes after the batch was created at which to send this leg's deposit. */
  delayMin: number;
  deadline?: string;
};

export type Batch = {
  id: string;
  createdAt: string;
  fromSymbol: string;
  fromChain: string;
  toSymbol: string;
  toChain: string;
  refundTo: string;
  legs: BatchLeg[];
};

const KEY = "zcan:batches:v1";
const EVENT = "zcan:batches";
const EMPTY: Batch[] = [];
let snapshot: Batch[] | null = null;

function read(): Batch[] {
  if (snapshot) return snapshot;
  try {
    const raw = localStorage.getItem(KEY);
    snapshot = raw ? (JSON.parse(raw) as Batch[]) : EMPTY;
  } catch {
    snapshot = EMPTY;
  }
  return snapshot;
}

export function saveBatch(batch: Batch) {
  snapshot = [batch, ...read().filter((b) => b.id !== batch.id)].slice(0, 30);
  try {
    localStorage.setItem(KEY, JSON.stringify(snapshot));
  } catch {
    // Storage unavailable — kept in memory for this session.
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Drop the cached list and re-read storage — call after storage was cleared or replaced from outside. */
export function resetBatches() {
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

export function useBatches(): Batch[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export const newBatchId = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
