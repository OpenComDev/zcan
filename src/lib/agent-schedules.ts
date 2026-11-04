"use client";

import { useSyncExternalStore } from "react";
import type { AgentDef, AgentLocale, AgentPlan } from "./agents";

/**
 * A recurring agent re-check the user opted into. Stored only in this browser — Zcan has no accounts
 * and no server-side storage, so nothing runs while the tab is closed; we just remind the user.
 */
export type AgentSchedule = {
  id: string;
  agentId: AgentDef["id"];
  /**
   * The form values used for the run. Never the saved agent-memory profile: that stays encrypted in
   * src/lib/agent-memory.ts and the workspace reads it fresh each time a re-check runs.
   */
  inputs: Record<string, string>;
  /** The user confirmed the consent statement when they set this up. */
  consent: boolean;
  /** Only the steps the user approved last time. Shown again for approval on every re-check. */
  plan: AgentPlan;
  /** Interval in days. */
  every: number;
  /** Language the plan and reports were written in, so re-checks stay comparable. Missing on older schedules (English). */
  locale?: AgentLocale;
  createdAt: string;
  lastRunAt: string;
  nextRunAt: string;
  /** Markdown of the most recent report, capped at REPORT_CAP characters. */
  lastReport: string;
  lastReportHash: string;
  /** nextRunAt value a browser notification was already shown for. */
  notifiedFor?: string;
  /** Don't show the in-app reminder before this time. */
  snoozedUntil?: string;
};

/** Labels are English fallbacks; the UI shows `agents.interval.<days>` / `agents.every.<days>`. */
export const INTERVALS = [
  { days: 0, label: "Off" },
  { days: 14, label: "2 weeks" },
  { days: 30, label: "Month" },
  { days: 90, label: "3 months" },
] as const;

const KEY = "zcan:agent-schedules:v1";
const EVENT = "zcan:agent-schedules";
const EMPTY: AgentSchedule[] = [];
const REPORT_CAP = 40_000;
const DAY = 86_400_000;

let snapshot: AgentSchedule[] | null = null;

function read(): AgentSchedule[] {
  if (snapshot) return snapshot;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    snapshot = Array.isArray(parsed) ? (parsed as AgentSchedule[]).filter((s) => s && typeof s.id === "string" && typeof s.nextRunAt === "string") : EMPTY;
  } catch {
    snapshot = EMPTY;
  }
  return snapshot;
}

function write(list: AgentSchedule[]) {
  snapshot = list.slice(0, 20);
  try {
    localStorage.setItem(KEY, JSON.stringify(snapshot));
  } catch {
    // Storage unavailable (private mode, quota) — schedules stay in memory for this session.
  }
  window.dispatchEvent(new Event(EVENT));
}

export const getSchedules = () => read();

/** Where a re-check starts: the agent page with the schedule's details pre-filled. */
export const rerunHref = (s: Pick<AgentSchedule, "id" | "agentId">) => `/agents/${s.agentId}?rerun=${encodeURIComponent(s.id)}`;

export const newScheduleId = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

export const capReport = (md: string) => (md.length > REPORT_CAP ? md.slice(0, REPORT_CAP) : md);

/** Small non-cryptographic hash (FNV-1a) — only used to tell whether a report changed. */
export function hashReport(md: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < md.length; i++) {
    h ^= md.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export const addDays = (iso: string, days: number) => new Date(new Date(iso).getTime() + days * DAY).toISOString();

export function createSchedule(s: Omit<AgentSchedule, "id" | "createdAt" | "nextRunAt" | "lastReport" | "lastReportHash"> & { lastReport: string }) {
  const lastReport = capReport(s.lastReport);
  const schedule: AgentSchedule = {
    ...s,
    id: newScheduleId(),
    createdAt: new Date().toISOString(),
    nextRunAt: addDays(s.lastRunAt, s.every),
    lastReport,
    lastReportHash: hashReport(lastReport),
  };
  write([schedule, ...read()]);
  return schedule;
}

export function updateSchedule(id: string, patch: Partial<Omit<AgentSchedule, "id">>) {
  const list = read();
  if (!list.some((s) => s.id === id)) return;
  write(
    list.map((s) => {
      if (s.id !== id) return s;
      const next = { ...s, ...patch };
      if (patch.lastReport !== undefined) {
        next.lastReport = capReport(patch.lastReport);
        next.lastReportHash = hashReport(next.lastReport);
      }
      // Recompute the due date whenever the interval or last run changes.
      if (patch.every !== undefined || patch.lastRunAt !== undefined) next.nextRunAt = addDays(next.lastRunAt, next.every);
      return next;
    }),
  );
}

/** Record a finished re-check: new baseline report, and the clock restarts. */
export function completeSchedule(id: string, run: { inputs: Record<string, string>; plan: AgentPlan; report: string }) {
  updateSchedule(id, { ...run, lastReport: run.report, lastRunAt: new Date().toISOString(), snoozedUntil: undefined, notifiedFor: undefined });
}

export function removeSchedule(id: string) {
  write(read().filter((s) => s.id !== id));
}

function subscribe(cb: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      snapshot = null;
      cb();
    }
  };
  // Fired by /history after a backup import or "forget everything".
  const onLocal = () => {
    snapshot = null;
    cb();
  };
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", onStorage);
  window.addEventListener("zcan:local", onLocal);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("zcan:local", onLocal);
  };
}

export function useSchedules(): AgentSchedule[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

// ---------- clock ----------

/** A coarse "now" that ticks every minute and when the tab becomes visible, so due-dates can be derived during render. */
let now = 0;
const TICK = 60_000;

function subscribeClock(cb: () => void) {
  const tick = () => {
    now = Date.now();
    cb();
  };
  const onVisible = () => {
    if (document.visibilityState === "visible") tick();
  };
  tick();
  const timer = window.setInterval(tick, TICK);
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

/** Current time in ms on the client (0 during server render and hydration). */
export function useNow(): number {
  return useSyncExternalStore(
    subscribeClock,
    () => now,
    () => 0,
  );
}

export const isDue = (s: AgentSchedule, at: number) => at > 0 && new Date(s.nextRunAt).getTime() <= at;

// ---------- report diff ----------

export type ReportDiff = { same: boolean; added: string[]; removed: string[]; addedLinks: string[]; removedLinks: string[] };

const URL_RE = /https?:\/\/[^\s)<>"'\]]+/g;

/** Lines that carry content: no blanks, table rules or bare headings markup. */
function contentLines(md: string): string[] {
  const out = new Set<string>();
  for (const raw of md.split("\n")) {
    const line = raw
      .replace(/^\s*(?:[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+|>\s*)/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!line || /^[|:\-\s`#]+$/.test(line)) continue;
    out.add(line);
  }
  return [...out];
}

function links(md: string): Set<string> {
  return new Set([...md.matchAll(URL_RE)].map((m) => m[0].replace(/[.,;:]+$/, "")));
}

/** A simple line-level diff between two reports — enough to spot new listings, sources or steps. */
export function diffReports(prev: string, next: string): ReportDiff {
  const a = contentLines(prev);
  const b = contentLines(next);
  const setA = new Set(a);
  const setB = new Set(b);
  const la = links(prev);
  const lb = links(next);
  const added = b.filter((l) => !setA.has(l));
  const removed = a.filter((l) => !setB.has(l));
  return {
    same: added.length === 0 && removed.length === 0,
    added,
    removed,
    addedLinks: [...lb].filter((l) => !la.has(l)),
    removedLinks: [...la].filter((l) => !lb.has(l)),
  };
}
