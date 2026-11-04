"use client";

import { useSyncExternalStore } from "react";
import type { AgentDef } from "./agents";

/**
 * Follow-through checklists: the action steps of a finished agent report, saved so the user can
 * tick them off across visits. Device-only (localStorage), included in History backups and wiped
 * by "forget all local data".
 */

export type ChecklistItem = {
  id: string;
  /** Inline Markdown of the step (links and emphasis kept), first lines of the list item. */
  text: string;
  /** Nearest heading above the item, without the #s. "" when there is none. */
  group: string;
  /** 1-based line of the item's list marker in `report` — how the rendered report binds its checkboxes. */
  line: number;
  done: boolean;
  doneAt?: string;
};

export type Checklist = {
  id: string;
  agentId: AgentDef["id"];
  /** Short label for the run, e.g. the first thing the user typed. */
  title: string;
  createdAt: string;
  /** The report's Markdown, so it can be reopened offline. Capped at REPORT_CAP characters. */
  report: string;
  items: ChecklistItem[];
  /** The scheduled re-check this run belongs to; re-checks carry ticks over by matching text. */
  scheduleId?: string;
  /** "task" — GitHub task-list items; "ordered" — fallback to the first numbered list. */
  source: "task" | "ordered";
};

const KEY = "zcan:agent-checklists:v1";
const EVENT = "zcan:agent-checklists";
const LOCAL_EVENT = "zcan:local";
const EMPTY: Checklist[] = [];
const MAX = 20;
const MAX_ITEMS = 80;
const REPORT_CAP = 40_000;
const TEXT_CAP = 600;

// ---------- parsing ----------

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const HEADING = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const TASK = /^\s*(?:[-*+]|\d{1,9}[.)])\s+\[([ xX])\]\s+(.*)$/;
const BULLET = /^(\s*)(?:[-*+]|\d{1,9}[.)])\s+/;
/** Top-level only: deeper numbered lines are nested lists. */
const ORDERED = /^ ?\d{1,9}[.)]\s+(.*)$/;

/** Markdown inline → plain words, for matching and accessible names. */
export function plainText(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/[*_~`]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** What makes two steps "the same" across re-checks: plain words, case- and punctuation-insensitive. */
export const normalizeItem = (md: string) =>
  plainText(md)
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

type Parsed = Omit<ChecklistItem, "id" | "done" | "doneAt">;

/** Continuation lines of a list item (indented or lazy), stopping at blanks, new items, headings, fences, tables and quotes. */
function continuation(lines: string[], from: number): { text: string; used: number } {
  const parts: string[] = [];
  for (let j = from; j < lines.length && parts.length < 4; j++) {
    const l = lines[j];
    if (!l.trim() || HEADING.test(l) || BULLET.test(l) || FENCE.test(l) || /^\s*[|>]/.test(l)) break;
    parts.push(l.trim());
  }
  return { text: parts.join(" "), used: parts.length };
}

/**
 * Parses a report's follow-up steps.
 * - Primary: every GitHub task-list item (`- [ ] …`, `- [x] …`, or numbered `1. [ ] …`) outside code
 *   fences, at any depth, grouped under its nearest preceding heading.
 * - Fallback when there are none: the items of the first top-level numbered list with at least two
 *   items (most report formats put "Do this now" / "Order of attack" there), grouped the same way.
 * - Otherwise nothing: a report without steps doesn't get a checklist.
 */
export function parseChecklist(report: string): { items: Parsed[]; source: Checklist["source"] } | null {
  const lines = report.split(/\r?\n/);
  const tasks: Parsed[] = [];
  let ordered: Parsed[] = [];
  let orderedDone = false;
  let orderedOpen = false;
  let group = "";
  let fence: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const f = line.match(FENCE);
    if (fence) {
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length) fence = null;
      continue;
    }
    if (f) {
      fence = f[1];
      continue;
    }
    const h = line.match(HEADING);
    if (h) {
      group = plainText(h[2]);
      if (orderedOpen) {
        orderedOpen = false;
        if (ordered.length >= 2) orderedDone = true;
        else ordered = [];
      }
      continue;
    }
    const tk = line.match(TASK);
    if (tk) {
      const extra = continuation(lines, i + 1);
      const text = `${tk[2].trim()}${extra.text ? ` ${extra.text}` : ""}`.slice(0, TEXT_CAP);
      if (plainText(text)) tasks.push({ text, group, line: i + 1 });
      i += extra.used;
      continue;
    }
    if (orderedDone) continue;
    const o = line.match(ORDERED);
    if (o) {
      const extra = continuation(lines, i + 1);
      const text = `${o[1].trim()}${extra.text ? ` ${extra.text}` : ""}`.slice(0, TEXT_CAP);
      if (plainText(text)) ordered.push({ text, group, line: i + 1 });
      orderedOpen = true;
      i += extra.used;
      continue;
    }
    // A non-indented paragraph ends a top-level numbered list (blank lines and nested lines don't).
    if (orderedOpen && line.trim() && !/^\s/.test(line) && !BULLET.test(line)) {
      orderedOpen = false;
      if (ordered.length >= 2) orderedDone = true;
      else ordered = [];
    }
  }
  if (tasks.length) return { items: tasks.slice(0, MAX_ITEMS), source: "task" };
  if (ordered.length >= 2) return { items: ordered.slice(0, MAX_ITEMS), source: "ordered" };
  return null;
}

// ---------- store ----------

let snapshot: Checklist[] | null = null;

const isChecklist = (c: unknown): c is Checklist => {
  const o = c as Partial<Checklist> | null;
  return (
    !!o &&
    typeof o.id === "string" &&
    typeof o.agentId === "string" &&
    typeof o.createdAt === "string" &&
    typeof o.report === "string" &&
    Array.isArray(o.items) &&
    o.items.every((it) => !!it && typeof it.id === "string" && typeof it.text === "string" && typeof it.done === "boolean")
  );
};

const isFinished = (c: Checklist) => c.items.length > 0 && c.items.every((it) => it.done);

/** Newest first, at most MAX: when over, the oldest finished checklists go first, then the oldest. */
function trim(list: Checklist[]): Checklist[] {
  const sorted = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  let over = sorted.length - MAX;
  if (over <= 0) return sorted;
  const drop = new Set<string>();
  for (let i = sorted.length - 1; i >= 0 && over > 0; i--) {
    if (isFinished(sorted[i])) {
      drop.add(sorted[i].id);
      over--;
    }
  }
  const kept = sorted.filter((c) => !drop.has(c.id));
  return kept.slice(0, MAX);
}

function read(): Checklist[] {
  if (snapshot) return snapshot;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    // Backups merge lists without our caps or order, so normalize here.
    snapshot = Array.isArray(parsed) ? trim(parsed.filter(isChecklist)) : EMPTY;
  } catch {
    snapshot = EMPTY;
  }
  return snapshot;
}

function write(list: Checklist[]) {
  snapshot = trim(list);
  try {
    localStorage.setItem(KEY, JSON.stringify(snapshot));
  } catch {
    // Storage unavailable (private mode, quota) — checklists stay in memory for this session.
  }
  window.dispatchEvent(new Event(EVENT));
}

const newId = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

export const getChecklists = () => read();

/**
 * Saves the checklist for a finished report, or returns null when it has no steps. With a
 * `scheduleId`, ticks carry over from that schedule's previous checklist (matched by normalized
 * text), and the new checklist replaces it.
 */
export function saveChecklist(args: { agentId: AgentDef["id"]; title: string; report: string; scheduleId?: string }): Checklist | null {
  const report = args.report.length > REPORT_CAP ? args.report.slice(0, REPORT_CAP) : args.report;
  const parsed = parseChecklist(report);
  if (!parsed) return null;
  const list = read();
  const prev = args.scheduleId ? list.find((c) => c.scheduleId === args.scheduleId) : undefined;
  const carried = new Map<string, string | undefined>();
  for (const it of prev?.items ?? []) if (it.done) carried.set(normalizeItem(it.text), it.doneAt);
  const checklist: Checklist = {
    id: newId(),
    agentId: args.agentId,
    title: args.title.replace(/\s+/g, " ").trim().slice(0, 80),
    createdAt: new Date().toISOString(),
    report,
    source: parsed.source,
    ...(args.scheduleId ? { scheduleId: args.scheduleId } : {}),
    items: parsed.items.map((p, i) => {
      const key = normalizeItem(p.text);
      const done = carried.has(key);
      return { ...p, id: `${i + 1}`, done, ...(done ? { doneAt: carried.get(key) ?? new Date().toISOString() } : {}) };
    }),
  };
  write([checklist, ...list.filter((c) => !(args.scheduleId && c.scheduleId === args.scheduleId))]);
  return checklist;
}

export function toggleItem(checklistId: string, itemId: string, done: boolean) {
  const list = read();
  if (!list.some((c) => c.id === checklistId)) return;
  const at = new Date().toISOString();
  write(
    list.map((c) =>
      c.id !== checklistId
        ? c
        : { ...c, items: c.items.map((it) => (it.id !== itemId ? it : done ? { ...it, done: true, doneAt: at } : { ...it, done: false, doneAt: undefined })) },
    ),
  );
}

/** Ties a checklist to the schedule the user just turned on, so the first re-check carries ticks over. */
export function linkChecklistToSchedule(checklistId: string, scheduleId: string) {
  const list = read();
  if (!list.some((c) => c.id === checklistId)) return;
  write(list.map((c) => (c.id === checklistId ? { ...c, scheduleId } : c.scheduleId === scheduleId ? { ...c, scheduleId: undefined } : c)));
}

export function removeChecklist(id: string) {
  write(read().filter((c) => c.id !== id));
}

/** Puts back a checklist removed by mistake (the undo after a delete). */
export function restoreChecklist(c: Checklist) {
  write([c, ...read().filter((x) => x.id !== c.id)]);
}

export const progressOf = (c: Checklist) => ({ done: c.items.filter((it) => it.done).length, total: c.items.length });

/** Checklists with steps still open. */
export const unfinishedCount = (list: Checklist[]) => list.filter((c) => c.items.some((it) => !it.done)).length;

function subscribe(cb: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY || e.key === null) {
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
  window.addEventListener(LOCAL_EVENT, onLocal);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(LOCAL_EVENT, onLocal);
  };
}

export function useChecklists(): Checklist[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
