"use client";

import { useSyncExternalStore } from "react";
import type { Tick } from "./live-prices";

/**
 * Price and rate alerts, kept only in this browser. They are checked by <AlertWatcher />
 * against the live Coinbase feed, so they only fire while a Zcan tab is open.
 */

export type AlertOp = "above" | "below";

type AlertBase = {
  id: string;
  op: AlertOp;
  /** USD for price alerts; units of `to` per 1 `from` for rate alerts. */
  value: number;
  createdAt: string;
  /** Last time the alert fired. A one-shot alert with `firedAt` is done until re-armed. */
  firedAt?: string;
  /** The observed value when it last fired. */
  firedValue?: number;
  /** Fire again each time the condition is crossed. */
  repeat?: boolean;
  /** Repeating alerts only: false after firing, until the value moves back past the threshold. */
  armed?: boolean;
};

export type PriceAlert = AlertBase & { kind: "price"; asset: string };
export type RateAlert = AlertBase & { kind: "rate"; from: string; to: string };
export type Alert = PriceAlert | RateAlert;
export type NewAlert = Omit<PriceAlert, "id" | "createdAt"> | Omit<RateAlert, "id" | "createdAt">;

const KEY = "zcan:alerts:v1";
const EVENT = "zcan:alerts";
const MAX = 50;
const EMPTY: Alert[] = [];

let snapshot: Alert[] | null = null;

function read(): Alert[] {
  if (snapshot) return snapshot;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    snapshot = Array.isArray(parsed) ? parsed.filter(isAlert) : EMPTY;
  } catch {
    snapshot = EMPTY;
  }
  return snapshot;
}

function write(alerts: Alert[]) {
  snapshot = alerts.slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(snapshot));
  } catch {
    // Storage unavailable — alerts stay in memory for this session.
  }
  window.dispatchEvent(new Event(EVENT));
}

const isSym = (v: unknown) => typeof v === "string" && /^[A-Z0-9]{1,12}$/.test(v);

/** Shape check for stored or imported alerts. */
export function isAlert(x: unknown): x is Alert {
  if (!x || typeof x !== "object") return false;
  const a = x as Record<string, unknown>;
  const base =
    typeof a.id === "string" &&
    (a.op === "above" || a.op === "below") &&
    typeof a.value === "number" &&
    Number.isFinite(a.value) &&
    a.value > 0 &&
    typeof a.createdAt === "string";
  if (!base) return false;
  if (a.kind === "price") return isSym(a.asset);
  if (a.kind === "rate") return isSym(a.from) && isSym(a.to) && a.from !== a.to;
  return false;
}

export const newAlertId = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

export function addAlert(input: NewAlert): Alert {
  const alert = { ...input, id: newAlertId(), createdAt: new Date().toISOString() } as Alert;
  write([alert, ...read()]);
  return alert;
}

/** Put back an alert (e.g. undo a delete), keeping its id and position by creation time. */
export function restoreAlert(alert: Alert) {
  const rest = read().filter((a) => a.id !== alert.id);
  write([...rest, alert].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
}

export function removeAlert(id: string) {
  write(read().filter((a) => a.id !== id));
}

/** Clear the fired state so the alert can fire again. */
export function rearmAlert(id: string) {
  write(read().map((a) => (a.id === id ? { ...a, firedAt: undefined, firedValue: undefined, armed: undefined } : a)));
}

/** Repeating alerts: the value moved back past the threshold — ready to fire again. */
export function setArmed(id: string) {
  const a = read().find((x) => x.id === id);
  if (!a || a.armed !== false) return;
  write(read().map((x) => (x.id === id ? { ...x, armed: true } : x)));
}

/**
 * Mark an alert fired. Re-reads storage first so a second open tab that already fired it
 * doesn't fire it again. Returns false when there's nothing to fire.
 */
export function markFired(id: string, observed: number): boolean {
  snapshot = null;
  const a = read().find((x) => x.id === id);
  if (!a || (a.repeat ? a.armed === false : a.firedAt)) return false;
  const firedAt = new Date().toISOString();
  write(read().map((x) => (x.id === id ? { ...x, firedAt, firedValue: observed, armed: x.repeat ? false : undefined } : x)));
  return true;
}

/** Whether the alert is waiting to fire. */
export const isArmed = (a: Alert) => (a.repeat ? a.armed !== false : !a.firedAt);

/** Current value the alert compares against, from live USD ticks; null until both prices are known. */
export function alertValue(a: Pick<PriceAlert, "kind" | "asset"> | Pick<RateAlert, "kind" | "from" | "to">, ticks: Readonly<Record<string, Tick>>): number | null {
  if (a.kind === "price") return ticks[a.asset]?.price ?? null;
  const from = ticks[a.from]?.price;
  const to = ticks[a.to]?.price;
  return from && to ? from / to : null;
}

export const conditionMet = (op: AlertOp, current: number, threshold: number) => (op === "above" ? current >= threshold : current <= threshold);

/** Short subject: "ZEC" or "SOL → ZEC". */
export const alertSubject = (a: Alert) => (a.kind === "price" ? a.asset : `${a.from} → ${a.to}`);

/** Drop the cached list and re-read storage — call after storage was cleared or replaced from outside. */
export function resetAlerts() {
  snapshot = null;
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY || e.key === null) {
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

export function useAlerts(): Alert[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export const ALERTS_KEY = KEY;
export const ALERTS_EVENT = EVENT;
