"use client";

import { useSyncExternalStore } from "react";

/**
 * Recurring buys ("$50 of ZEC every week"), kept only in this browser.
 * Zcan never holds funds, so a plan is just a reminder plus a pre-filled swap the user reviews and
 * pays themselves. Nothing here moves money or submits anything.
 */

export type Every = "day" | "week" | "2weeks" | "month";
export const EVERY: Every[] = ["day", "week", "2weeks", "month"];

export type PlanRun = {
  /** The occurrence this entry is for. */
  dueAt: string;
  /** When the user opened the pre-filled swap for it. */
  doneAt?: string;
  /** The order (deposit address) created for it, when we could match one in local history. */
  orderId?: string;
  /** The user skipped this occurrence. */
  skipped?: boolean;
};

export type RecurringPlan = {
  id: string;
  /** Asset key "SYMBOL.chain", e.g. "SOL.sol". */
  from: string;
  /** Asset key, usually "ZEC.zec". */
  to: string;
  /** Amount in FROM units. Set this or `usd`. */
  amount?: string;
  /** Amount in USD, converted to FROM units at reminder time with live prices. */
  usd?: number;
  recipient?: string;
  every: Every;
  /** 0 = Sunday … 6 = Saturday, for weekly plans. */
  weekday?: number;
  /** 1–31 for monthly plans; clamped to the month's last day. */
  monthDay?: number;
  /** Local hour of day the reminder is due (0–23). */
  hour?: number;
  nextAt: string;
  lastDoneAt?: string;
  createdAt: string;
  paused?: boolean;
  /** "Snooze 1 day": not due again before this time. */
  snoozedUntil?: string;
  history: PlanRun[];
};

export type NewPlan = Pick<RecurringPlan, "from" | "to" | "amount" | "usd" | "recipient" | "every" | "weekday" | "monthDay" | "hour"> & {
  /** First due time; defaults to the next slot after now. */
  nextAt?: string;
};

const KEY = "zcan:recurring:v1";
const EVENT = "zcan:recurring";
const LOCAL_EVENT = "zcan:local";
const MAX = 20;
const MAX_RUNS = 12;
const DAY = 86_400_000;
const EMPTY: RecurringPlan[] = [];

let snapshot: RecurringPlan[] | null = null;

/* ---------------- storage ---------------- */

function read(): RecurringPlan[] {
  if (snapshot) return snapshot;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    snapshot = Array.isArray(parsed) ? parsed.filter(isPlan) : EMPTY;
  } catch {
    snapshot = EMPTY;
  }
  return snapshot;
}

function write(plans: RecurringPlan[]) {
  snapshot = plans.slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(snapshot));
  } catch {
    // Storage unavailable — plans stay in memory for this session.
  }
  window.dispatchEvent(new Event(EVENT));
}

const update = (id: string, fn: (p: RecurringPlan) => RecurringPlan) => {
  snapshot = null; // re-read so a second tab's changes aren't overwritten
  write(read().map((p) => (p.id === id ? fn(p) : p)));
};

const isKey = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9$-]{1,16}\.[a-z0-9-]{1,16}$/.test(v);
const isIso = (v: unknown) => typeof v === "string" && !Number.isNaN(Date.parse(v));

/** Shape check for stored or imported plans. */
export function isPlan(x: unknown): x is RecurringPlan {
  if (!x || typeof x !== "object") return false;
  const p = x as Record<string, unknown>;
  const amountOk = (typeof p.amount === "string" && Number(p.amount) > 0) || (typeof p.usd === "number" && Number.isFinite(p.usd) && p.usd > 0);
  return (
    typeof p.id === "string" &&
    isKey(p.from) &&
    isKey(p.to) &&
    p.from.toLowerCase() !== p.to.toLowerCase() &&
    amountOk &&
    EVERY.includes(p.every as Every) &&
    isIso(p.nextAt) &&
    isIso(p.createdAt) &&
    Array.isArray(p.history)
  );
}

/** Accepts "SOL.sol" or "SOL:sol"; returns the canonical "SYMBOL.chain" (symbol as given, chain lower-case). */
export function normalizeKey(k: string): string {
  const [sym = "", chain = ""] = k.trim().split(/[.:]/);
  return `${sym}.${chain.toLowerCase()}`;
}
export const sameKey = (a: string, b: string) => normalizeKey(a).toLowerCase() === normalizeKey(b).toLowerCase();
export const symbolOf = (k: string) => normalizeKey(k).split(".")[0];
export const chainOf = (k: string) => normalizeKey(k).split(".")[1];

/* ---------------- schedule ---------------- */

const daysIn = (y: number, m: number) => new Date(y, m + 1, 0).getDate();

/** The first due slot strictly after `after` for this schedule (local time). */
export function nextSlot(s: Pick<RecurringPlan, "every" | "weekday" | "monthDay" | "hour">, after: Date): Date {
  const hour = s.hour ?? 9;
  const d = new Date(after.getFullYear(), after.getMonth(), after.getDate(), hour, 0, 0, 0);
  if (s.every === "day") {
    if (d <= after) d.setDate(d.getDate() + 1);
    return d;
  }
  if (s.every === "week" || s.every === "2weeks") {
    const wd = s.weekday ?? after.getDay();
    d.setDate(d.getDate() + ((wd - d.getDay() + 7) % 7));
    if (d <= after) d.setDate(d.getDate() + 7);
    return d;
  }
  const md = s.monthDay ?? after.getDate();
  let y = after.getFullYear();
  let m = after.getMonth();
  let out = new Date(y, m, Math.min(md, daysIn(y, m)), hour);
  if (out <= after) {
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
    out = new Date(y, m, Math.min(md, daysIn(y, m)), hour);
  }
  return out;
}

/** One period after `from`, keeping the plan's weekday / day of month. */
function step(p: Pick<RecurringPlan, "every" | "monthDay">, from: Date): Date {
  const d = new Date(from);
  if (p.every === "day") d.setDate(d.getDate() + 1);
  else if (p.every === "week") d.setDate(d.getDate() + 7);
  else if (p.every === "2weeks") d.setDate(d.getDate() + 14);
  else {
    const md = p.monthDay ?? from.getDate();
    const y = from.getMonth() === 11 ? from.getFullYear() + 1 : from.getFullYear();
    const m = (from.getMonth() + 1) % 12;
    return new Date(y, m, Math.min(md, daysIn(y, m)), from.getHours(), from.getMinutes());
  }
  return d;
}

/** Whether the plan's current occurrence is due at `now`. */
export function due(plan: RecurringPlan, now: number | Date = Date.now()): boolean {
  const t = typeof now === "number" ? now : now.getTime();
  if (plan.paused) return false;
  if (plan.snoozedUntil && t < Date.parse(plan.snoozedUntil)) return false;
  return t >= Date.parse(plan.nextAt);
}

/**
 * The plan moved past its current occurrence: the next due time is the first slot after both the
 * current one and `now` (missed periods are not stacked up). Pure — returns a new plan.
 */
export function advance(plan: RecurringPlan, now: number | Date = Date.now(), run?: Omit<PlanRun, "dueAt">): RecurringPlan {
  const t = typeof now === "number" ? now : now.getTime();
  let next = step(plan, new Date(plan.nextAt));
  for (let i = 0; next.getTime() <= t && i < 1000; i++) next = step(plan, next);
  const entry: PlanRun = { dueAt: plan.nextAt, ...run };
  return {
    ...plan,
    nextAt: next.toISOString(),
    snoozedUntil: undefined,
    lastDoneAt: run?.doneAt ?? plan.lastDoneAt,
    history: [entry, ...plan.history].slice(0, MAX_RUNS),
  };
}

/* ---------------- amounts & links ---------------- */

/** Prices in USD keyed by asset key ("SOL.sol") or bare symbol ("SOL"). */
export type Prices = Readonly<Record<string, number>>;

export function priceOf(key: string, prices: Prices): number | undefined {
  const k = normalizeKey(key);
  const hit = prices[k] ?? prices[k.toLowerCase()] ?? prices[symbolOf(k)];
  return hit && Number.isFinite(hit) && hit > 0 ? hit : undefined;
}

/** Round a FROM amount to something a person would type: ~5 significant digits, at most 8 decimals. */
export function roundAmount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "";
  const s = n >= 1000 ? n.toFixed(2) : n >= 1 ? n.toFixed(4) : n.toPrecision(5);
  const fixed = Number(s).toFixed(8);
  return String(Number(fixed));
}

/** The FROM amount for the current occurrence; null for a USD plan while the price is unknown. */
export function planAmount(plan: Pick<RecurringPlan, "from" | "amount" | "usd">, prices: Prices = {}): string | null {
  if (plan.amount && Number(plan.amount) > 0) return plan.amount;
  if (!plan.usd) return null;
  const price = priceOf(plan.from, prices);
  return price ? roundAmount(plan.usd / price) || null : null;
}

/** Pre-filled swap link: `/?from=…&to=…&amount=…&recipient=…`. The swap page restores these. */
export function swapHref(plan: Pick<RecurringPlan, "from" | "to" | "amount" | "usd" | "recipient">, prices: Prices = {}): string {
  const p = new URLSearchParams();
  p.set("from", normalizeKey(plan.from));
  p.set("to", normalizeKey(plan.to));
  const amount = planAmount(plan, prices);
  if (amount) p.set("amount", amount);
  if (plan.recipient?.trim()) p.set("recipient", plan.recipient.trim());
  return `/?${p.toString()}`;
}

/** Whole dollars from $10 up, cents below. */
export const roundUsd = (n: number) => (n >= 10 ? Math.round(n) : Math.round(n * 100) / 100);

/* ---------------- actions ---------------- */

export const newPlanId = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

export function addPlan(input: NewPlan): RecurringPlan {
  const now = new Date();
  const sched = { every: input.every, weekday: input.weekday, monthDay: input.monthDay, hour: input.hour ?? now.getHours() };
  const plan: RecurringPlan = {
    id: newPlanId(),
    from: normalizeKey(input.from),
    to: normalizeKey(input.to),
    ...(input.usd ? { usd: input.usd } : { amount: input.amount }),
    ...(input.recipient?.trim() ? { recipient: input.recipient.trim() } : {}),
    ...sched,
    nextAt: input.nextAt ?? nextSlot(sched, now).toISOString(),
    createdAt: now.toISOString(),
    history: [],
  };
  snapshot = null;
  write([plan, ...read()]);
  return plan;
}

/** First due time one period from now, on today's weekday / day of month — for "repeat this swap". */
export function oneMoreFromNow(every: Every, now = new Date()): Pick<NewPlan, "weekday" | "monthDay" | "hour" | "nextAt"> {
  const hour = now.getHours();
  const base = { every, weekday: now.getDay(), monthDay: now.getDate(), hour };
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour);
  return { weekday: base.weekday, monthDay: base.monthDay, hour, nextAt: step(base, start).toISOString() };
}

export function removePlan(id: string) {
  snapshot = null;
  write(read().filter((p) => p.id !== id));
}

/** Put back a deleted plan (undo). */
export function restorePlan(plan: RecurringPlan) {
  snapshot = null;
  write([...read().filter((p) => p.id !== plan.id), plan].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
}

/** Pause or resume. Resuming a plan whose time has passed makes it due at the next slot, not right away. */
export function setPaused(id: string, paused: boolean) {
  update(id, (p) => {
    if (paused) return { ...p, paused: true };
    const now = new Date();
    const nextAt = Date.parse(p.nextAt) <= now.getTime() ? nextSlot(p, now).toISOString() : p.nextAt;
    return { ...p, paused: undefined, snoozedUntil: undefined, nextAt };
  });
}

/** Change how often; the next due time moves to the first slot of the new schedule. */
export function setEvery(id: string, every: Every) {
  update(id, (p) => {
    const cur = new Date(p.nextAt);
    const next = { ...p, every, weekday: p.weekday ?? cur.getDay(), monthDay: p.monthDay ?? cur.getDate(), hour: p.hour ?? cur.getHours() };
    return { ...next, nextAt: nextSlot(next, new Date()).toISOString(), snoozedUntil: undefined };
  });
}

/** The user opened the pre-filled swap for the due occurrence. */
export function markStarted(id: string) {
  update(id, (p) => (due(p) ? advance(p, Date.now(), { doneAt: new Date().toISOString() }) : p));
}

/** Skip the due occurrence. */
export function skipPlan(id: string) {
  update(id, (p) => advance(p, Date.now(), { skipped: true }));
}

/** Remind again in 24 hours. */
export function snoozePlan(id: string, ms = DAY) {
  update(id, (p) => ({ ...p, snoozedUntil: new Date(Date.now() + ms).toISOString() }));
}

type SwapLike = { depositAddress: string; createdAt: string; fromSymbol: string; fromChain: string; toSymbol: string; toChain: string };

/**
 * Link local swaps to plans: a swap of the plan's pair made after the user opened a reminder is
 * recorded as that occurrence's order, and a due plan whose pair was swapped since it came due
 * (e.g. straight from the swap page) counts as done. Returns true when anything changed.
 */
export function reconcile(swaps: readonly SwapLike[], now = Date.now()): boolean {
  snapshot = null;
  const plans = read();
  if (!plans.length || !swaps.length) return false;
  const used = new Set(plans.flatMap((p) => p.history.map((h) => h.orderId).filter(Boolean)));
  const matches = (p: RecurringPlan, s: SwapLike) =>
    !used.has(s.depositAddress) && sameKey(`${s.fromSymbol}.${s.fromChain}`, p.from) && sameKey(`${s.toSymbol}.${s.toChain}`, p.to);
  let changed = false;
  const next = plans.map((p) => {
    const last = p.history[0];
    if (last?.doneAt && !last.orderId && now - Date.parse(last.doneAt) < 2 * DAY) {
      const since = Date.parse(last.doneAt) - 60_000;
      const hit = swaps.filter((s) => matches(p, s) && Date.parse(s.createdAt) >= since).sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
      if (hit) {
        used.add(hit.depositAddress);
        changed = true;
        return { ...p, history: [{ ...last, orderId: hit.depositAddress }, ...p.history.slice(1)] };
      }
    }
    if (due(p, now)) {
      const since = Date.parse(p.nextAt) - 12 * 3_600_000;
      const hit = swaps.find((s) => matches(p, s) && Date.parse(s.createdAt) >= since);
      if (hit) {
        used.add(hit.depositAddress);
        changed = true;
        return advance(p, now, { doneAt: hit.createdAt, orderId: hit.depositAddress });
      }
    }
    return p;
  });
  if (changed) write(next);
  return changed;
}

/** Drop the cached list and re-read storage. */
export function resetRecurring() {
  snapshot = null;
  window.dispatchEvent(new Event(EVENT));
}

/* ---------------- hooks ---------------- */

function subscribe(cb: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY || e.key === null) {
      snapshot = null;
      cb();
    }
  };
  const onLocal = () => {
    snapshot = null;
    cb();
  };
  window.addEventListener(EVENT, cb);
  window.addEventListener(LOCAL_EVENT, onLocal);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener(LOCAL_EVENT, onLocal);
    window.removeEventListener("storage", onStorage);
  };
}

export function useRecurring(): RecurringPlan[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

/* A coarse clock (per minute, and whenever the tab comes back) so "due" re-evaluates without Date.now() in render. */
let clock = 0;
const clockListeners = new Set<() => void>();
let clockTimer: ReturnType<typeof setInterval> | null = null;
const tick = () => {
  clock = Date.now();
  clockListeners.forEach((l) => l());
};
const onVisible = () => {
  if (document.visibilityState === "visible") tick();
};

function subscribeClock(cb: () => void) {
  clockListeners.add(cb);
  if (!clockTimer) {
    clockTimer = setInterval(tick, 60_000);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", tick);
  }
  return () => {
    clockListeners.delete(cb);
    if (!clockListeners.size && clockTimer) {
      clearInterval(clockTimer);
      clockTimer = null;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", tick);
    }
  };
}
const readClock = () => (clock ||= Date.now());

/** Current time in ms, refreshed every minute and on tab focus; 0 on the server. */
export function useNow(): number {
  return useSyncExternalStore(subscribeClock, readClock, () => 0);
}

export const RECURRING_KEY = KEY;
export const RECURRING_EVENT = EVENT;
