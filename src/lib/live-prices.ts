"use client";

import { useSyncExternalStore } from "react";
import { ALERTS_KEY, isAlert, isArmed } from "./alerts";

/**
 * Real-time USD prices from Coinbase's public market-data WebSocket (no key needed).
 * One shared connection for the whole app.
 *
 * Rendering cost is kept low on purpose:
 * - messages are coalesced per symbol and flushed at most 4× a second (once a second in a
 *   background tab), and a tick that didn't move the price isn't re-published;
 * - `useLiveTick(symbol)` / `useLiveStatus()` re-render only when *that* value changes —
 *   prefer them over `useLivePrices()`, which re-renders on every flush;
 * - the socket closes after the tab has been hidden for a minute (unless a price alert is
 *   armed and needs to keep watching) and reconnects when the tab comes back. It also closes
 *   shortly after the last subscriber unmounts.
 */

const FEED = "wss://ws-feed.exchange.coinbase.com";
export const LIVE_SYMBOLS = [
  "ZEC", "BTC", "ETH", "SOL", "USDT", "XRP", "DOGE", "LTC", "ADA", "AVAX", "BNB", "BCH", "DASH",
  "DOT", "LINK", "NEAR", "SUI", "TON", "APT", "ARB", "OP", "POL", "XLM", "UNI", "AAVE", "SHIB", "PEPE",
];

export type Tick = { price: number; open24h: number; at: number };
export type LiveStatus = "idle" | "connecting" | "live" | "reconnecting";
type Snapshot = { status: LiveStatus; ticks: Readonly<Record<string, Tick>> };

const FLUSH_MS = 250;
const FLUSH_HIDDEN_MS = 1000;
/** Re-publish an unchanged price at most this often, so "last tick" readouts stay fresh. */
const SAME_PRICE_MS = 5000;
const HIDDEN_PAUSE_MS = 60_000;
const IDLE_CLOSE_MS = 15_000;

const SERVER: Snapshot = { status: "idle", ticks: {} };
let snapshot: Snapshot = SERVER;
const listeners = new Set<() => void>();
let ws: WebSocket | null = null;
let retry = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const pending: Record<string, Tick> = {};
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let hiddenTimer: ReturnType<typeof setTimeout> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
/** True while the feed is deliberately closed (long-hidden tab or no subscribers). */
let paused = false;
let lifecycleBound = false;

const emit = (next: Snapshot) => {
  snapshot = next;
  listeners.forEach((l) => l());
};

const hidden = () => typeof document !== "undefined" && document.visibilityState === "hidden";

function flush() {
  flushTimer = null;
  const keys = Object.keys(pending);
  if (!keys.length) return;
  const ticks = { ...snapshot.ticks };
  for (const k of keys) {
    ticks[k] = pending[k];
    delete pending[k];
  }
  emit({ status: "live", ticks });
}

function onMessage(e: MessageEvent) {
  let m: { type?: string; product_id?: string; price?: string; open_24h?: string };
  try {
    m = JSON.parse(e.data as string);
  } catch {
    return;
  }
  if (m.type !== "ticker" || !m.product_id || !m.price) return;
  const symbol = m.product_id.replace("-USD", "");
  const price = Number(m.price);
  const open24h = Number(m.open_24h) || 0;
  const now = Date.now();
  const prev = pending[symbol] ?? snapshot.ticks[symbol];
  // Most trades print at the same price; don't wake React for those.
  if (prev && prev.price === price && prev.open24h === open24h && now - prev.at < SAME_PRICE_MS) return;
  pending[symbol] = { price, open24h, at: now };
  if (snapshot.status !== "live" && !flushTimer) flush();
  flushTimer ??= setTimeout(flush, hidden() ? FLUSH_HIDDEN_MS : FLUSH_MS);
}

function connect() {
  reconnectTimer = null;
  if (paused || ws) return;
  emit({ ...snapshot, status: snapshot.status === "idle" ? "connecting" : "reconnecting" });
  let sock: WebSocket;
  try {
    sock = new WebSocket(FEED);
  } catch {
    scheduleReconnect();
    return;
  }
  ws = sock;
  sock.onopen = () => {
    retry = 0;
    sock.send(JSON.stringify({ type: "subscribe", product_ids: LIVE_SYMBOLS.map((s) => `${s}-USD`), channels: ["ticker"] }));
  };
  sock.onmessage = onMessage;
  sock.onclose = () => {
    if (ws !== sock) return; // closed on purpose (pause) — a fresh socket may already be up
    ws = null;
    scheduleReconnect();
  };
  sock.onerror = () => sock.close();
}

function scheduleReconnect() {
  if (paused || reconnectTimer) return;
  emit({ ...snapshot, status: "reconnecting" });
  const delay = Math.min(30_000, 1000 * 2 ** retry++);
  reconnectTimer = setTimeout(connect, delay);
}

/** Close the socket on purpose; `resume()` reopens it. Ticks stay as last seen. */
function pause() {
  if (paused) return;
  paused = true;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  if (flushTimer) clearTimeout(flushTimer);
  flush();
  const sock = ws;
  ws = null;
  sock?.close();
  if (snapshot.status !== "idle") emit({ ...snapshot, status: "reconnecting" });
}

function resume() {
  if (!paused) return;
  paused = false;
  retry = 0;
  connect();
}

/** A price alert that can still fire needs the feed even while the tab is in the background. */
function alertsNeedFeed(): boolean {
  try {
    const raw = localStorage.getItem(ALERTS_KEY);
    const list: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(list) && list.some((a) => isAlert(a) && (isArmed(a) || Boolean(a.repeat)));
  } catch {
    return false;
  }
}

function onVisibility() {
  if (hiddenTimer) clearTimeout(hiddenTimer);
  hiddenTimer = null;
  if (hidden()) {
    hiddenTimer = setTimeout(() => {
      hiddenTimer = null;
      if (hidden() && !alertsNeedFeed()) pause();
    }, HIDDEN_PAUSE_MS);
  } else {
    if (listeners.size) resume();
    if (Object.keys(pending).length) flush();
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (typeof window !== "undefined" && "WebSocket" in window) {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = null;
    if (!lifecycleBound) {
      lifecycleBound = true;
      document.addEventListener("visibilitychange", onVisibility);
      connect();
    } else if (!hidden()) resume();
  }
  return () => {
    listeners.delete(cb);
    if (!listeners.size && !idleTimer) {
      // Route changes unmount and remount subscribers; only close if nobody comes back.
      idleTimer = setTimeout(() => {
        idleTimer = null;
        if (!listeners.size) pause();
      }, IDLE_CLOSE_MS);
    }
  };
}

const getSnapshot = () => snapshot;
const getServer = () => SERVER;

/** Everything: connection status and every symbol's tick. Re-renders on every flush (≤ 4×/s). */
export function useLivePrices(): Snapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getServer);
}

/** One symbol's latest tick; re-renders only when that symbol's price changes. */
export function useLiveTick(symbol: string | undefined): Tick | undefined {
  return useSyncExternalStore(
    subscribe,
    () => (symbol ? snapshot.ticks[symbol] : undefined),
    () => undefined,
  );
}

/** Connection status only; re-renders only when the status changes. */
export function useLiveStatus(): LiveStatus {
  return useSyncExternalStore(subscribe, () => snapshot.status, () => SERVER.status);
}

/** 24 h change in percent from a tick, or null. */
export const change24h = (t?: Tick) => (t && t.open24h ? ((t.price - t.open24h) / t.open24h) * 100 : null);
