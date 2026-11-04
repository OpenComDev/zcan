#!/usr/bin/env node
/**
 * Download Zcan's shared agent runs and turn them into clean fine-tuning files.
 *
 *   TRAINING_ADMIN_TOKEN=… node scripts/finetune/prepare.mjs
 *   node scripts/finetune/prepare.mjs --in zcan-training.jsonl     # use an export you already downloaded
 *
 * Environment (the token is read from the environment only, never from the command line,
 * so it doesn't end up in shell history or `ps` output):
 *   TRAINING_ADMIN_TOKEN   admin token for /api/training/export (required unless --in is used)
 *   ZCAN_URL               site to download from (default https://www.zcan.dev)
 *   KIND                   run | plan | all (default all) — report writing, plan drafting or both
 *   RATING                 any | up (default any; thumbs-down runs are never exported by the server)
 *   EVAL_FRACTION          share of each agent's runs held out for evaluation (default 0.1)
 *   MIN_REPORT_CHARS       drop reports shorter than this (default 600)
 *   SEED                   changes the train/eval split deterministically (default "zcan")
 *
 * Writes out/train.jsonl, out/eval.jsonl (chat format: {"messages": [...], "tools"?: [...]}),
 * out/eval.meta.jsonl (agent/locale/task per eval line, for eval.mjs) and out/summary.json.
 * No dependencies; Node 18+.
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "out");
const env = (k, d) => (process.env[k] ?? "").trim() || d;

const ZCAN_URL = env("ZCAN_URL", "https://www.zcan.dev").replace(/\/+$/, "");
const KIND = env("KIND", "all");
const RATING = env("RATING", "any");
const EVAL_FRACTION = Number(env("EVAL_FRACTION", "0.1"));
const MIN_REPORT_CHARS = Number(env("MIN_REPORT_CHARS", "600"));
const SEED = env("SEED", "zcan");

const args = process.argv.slice(2);
const inIdx = args.indexOf("--in");
const inputFile = inIdx >= 0 ? args[inIdx + 1] : undefined;
if (args.some((a) => /^--?[\w-]*token/i.test(a))) {
  console.error("Pass TRAINING_ADMIN_TOKEN through the environment, not as an argument.");
  process.exit(2);
}
if (!["run", "plan", "all"].includes(KIND) || !["any", "up"].includes(RATING)) {
  console.error("KIND must be run, plan or all; RATING must be any or up.");
  process.exit(2);
}
if (!(EVAL_FRACTION >= 0 && EVAL_FRACTION < 1)) {
  console.error("EVAL_FRACTION must be between 0 and 1.");
  process.exit(2);
}

// ---------- load ----------

async function download() {
  const token = env("TRAINING_ADMIN_TOKEN");
  if (!token) {
    console.error("Set TRAINING_ADMIN_TOKEN in the environment (or use --in <file>).");
    process.exit(2);
  }
  const url = `${ZCAN_URL}/api/training/export?${new URLSearchParams({ kind: KIND, rating: RATING, meta: "1" })}`;
  console.log(`Downloading ${url}`);
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (res.status === 404) {
    console.error("404: the token is wrong, or training isn't switched on for that site.");
    process.exit(1);
  }
  if (!res.ok) {
    console.error(`Export failed: HTTP ${res.status}`);
    process.exit(1);
  }
  return res.text();
}

const raw = inputFile ? readFileSync(inputFile, "utf8") : await download();

// ---------- validate ----------

const ROLES = new Set(["system", "user", "assistant", "tool"]);
const CUT_SHORT = ["The report was cut short", "El informe quedó incompleto", "O relatório ficou incompleto", "Rapor yarıda kesildi", "Отчёт оборвался", "报告未写完"];
// The server already scrubs these; anything left means the anonymizer missed something, so the row is dropped.
const PII = [
  /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/, // email
  /\b0x[0-9a-fA-F]{40}\b/, // EVM address
  /\b(?:t1|t3|zs1|u1|tex1)[0-9a-zA-Z]{30,}\b/, // Zcash address
  /\b(?:bc1)[0-9a-z]{25,90}\b/i, // Bitcoin bech32
  /\b(?:\d{1,3}\.){3}\d{1,3}\b/, // IPv4
];

const text = (c) => (typeof c === "string" ? c : Array.isArray(c) ? c.map((p) => p?.text ?? "").join("") : "");

/** Returns a reason string when a row is unusable, or null when it's fine. */
function problem(row, task) {
  const msgs = row?.messages;
  if (!Array.isArray(msgs) || msgs.length < 3) return "malformed";
  if (msgs[0]?.role !== "system" || msgs[1]?.role !== "user") return "malformed";
  const pending = new Set();
  for (const m of msgs) {
    if (!m || !ROLES.has(m.role)) return "malformed";
    if (m.role === "assistant" && Array.isArray(m.tool_calls)) {
      for (const c of m.tool_calls) {
        if (!c?.id || c.type !== "function" || typeof c.function?.name !== "string") return "malformed";
        try {
          JSON.parse(c.function.arguments || "{}");
        } catch {
          return "bad tool arguments";
        }
        pending.add(c.id);
      }
    } else if (m.role === "tool") {
      if (!pending.delete(m.tool_call_id)) return "orphan tool result";
      if (typeof m.content !== "string") return "malformed";
    } else if (typeof m.content !== "string" || !m.content.trim()) return "empty message";
  }
  if (pending.size) return "unanswered tool call";
  const last = msgs.at(-1);
  if (last.role !== "assistant" || last.tool_calls) return "no final answer";
  const answer = text(last.content);
  if (task === "plan") {
    try {
      const plan = JSON.parse(answer);
      if (typeof plan?.summary !== "string" || !Array.isArray(plan.steps) || plan.steps.length === 0) return "bad plan";
    } catch {
      return "bad plan";
    }
  } else {
    if (answer.length < MIN_REPORT_CHARS) return "too short";
    if (CUT_SHORT.some((s) => answer.includes(s))) return "cut short";
    if (!/^#{1,3} /m.test(answer)) return "not a report";
  }
  const all = msgs.map((m) => text(m.content) + (m.tool_calls ? JSON.stringify(m.tool_calls) : "")).join("\n");
  if (PII.some((re) => re.test(all))) return "possible personal data";
  return null;
}

/** Exports made without meta=1 don't say which task a row is; plans are the ones answered with JSON. */
function looksLikePlan(row) {
  try {
    return Array.isArray(JSON.parse(text(row?.messages?.at(-1)?.content)).steps);
  } catch {
    return false;
  }
}

const rows = [];
const dropped = {};
const seen = new Set();
let interrupted = false;
const drop = (why) => (dropped[why] = (dropped[why] ?? 0) + 1);

for (const line of raw.split("\n")) {
  if (!line.trim()) continue;
  let row;
  try {
    row = JSON.parse(line);
  } catch {
    drop("invalid JSON");
    continue;
  }
  if (row?.error) {
    interrupted = true;
    continue;
  }
  const meta = row.metadata ?? {};
  const task = meta.task ?? (looksLikePlan(row) ? "plan" : "run");
  const why = problem(row, task);
  if (why) {
    drop(why);
    continue;
  }
  const clean = { messages: row.messages, ...(Array.isArray(row.tools) && row.tools.length ? { tools: row.tools } : {}) };
  const hash = createHash("sha256").update(JSON.stringify(clean)).digest("hex");
  if (seen.has(hash)) {
    drop("duplicate");
    continue;
  }
  seen.add(hash);
  rows.push({ clean, agent: meta.agent ?? "unknown", locale: meta.locale ?? "unknown", task, group: meta.id ?? hash });
}

if (interrupted) {
  console.error("The export was interrupted part-way (the server wrote an error line). Run it again before training.");
  process.exit(1);
}

// ---------- stratified split ----------
// Split by contribution (a run's plan and report rows stay together, so eval never leaks into train),
// stratified by agent, in a deterministic pseudo-random order.

const rank = (id) => createHash("sha256").update(`${SEED}:${id}`).digest("hex");
const byAgent = new Map();
for (const r of rows) {
  const groups = byAgent.get(r.agent) ?? new Map();
  groups.set(r.group, [...(groups.get(r.group) ?? []), r]);
  byAgent.set(r.agent, groups);
}

const train = [];
const evalSet = [];
const perAgent = {};
for (const [agent, groups] of byAgent) {
  const ids = [...groups.keys()].sort((a, b) => rank(a).localeCompare(rank(b)));
  const nEval = ids.length >= 2 && EVAL_FRACTION > 0 ? Math.max(1, Math.round(ids.length * EVAL_FRACTION)) : 0;
  ids.forEach((id, i) => (i < nEval ? evalSet : train).push(...groups.get(id)));
  const count = (list) => list.filter((r) => r.agent === agent).length;
  perAgent[agent] = { contributions: ids.length, trainRows: count(train), evalRows: count(evalSet) };
}

// ---------- write ----------

mkdirSync(OUT, { recursive: true });
const jsonl = (list) => list.map((r) => JSON.stringify(r.clean)).join("\n") + (list.length ? "\n" : "");
writeFileSync(join(OUT, "train.jsonl"), jsonl(train));
writeFileSync(join(OUT, "eval.jsonl"), jsonl(evalSet));
writeFileSync(join(OUT, "eval.meta.jsonl"), evalSet.map((r) => JSON.stringify({ agent: r.agent, locale: r.locale, task: r.task })).join("\n") + (evalSet.length ? "\n" : ""));

const countBy = (k) => rows.reduce((m, r) => ((m[r[k]] = (m[r[k]] ?? 0) + 1), m), {});
const summary = {
  source: inputFile ? `file:${inputFile}` : ZCAN_URL,
  createdAt: new Date().toISOString(),
  options: { KIND, RATING, EVAL_FRACTION, MIN_REPORT_CHARS, SEED },
  kept: rows.length,
  dropped,
  train: train.length,
  eval: evalSet.length,
  byTask: countBy("task"),
  byLocale: countBy("locale"),
  perAgent,
};
writeFileSync(join(OUT, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);

console.log(`Kept ${rows.length} rows (train ${train.length}, eval ${evalSet.length}).`);
if (Object.keys(dropped).length) console.log("Dropped:", dropped);
console.table(perAgent);
console.log(`Wrote ${OUT}/{train,eval}.jsonl, eval.meta.jsonl and summary.json`);
if (dropped["possible personal data"]) console.log("Some rows looked like they still contain personal data — check the anonymizer before training.");
