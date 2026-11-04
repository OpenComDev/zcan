#!/usr/bin/env node
/**
 * Side-by-side review: send each held-out example to a baseline and a candidate model and write
 * the answers into one Markdown file for a human to compare.
 *
 *   BASE_URL=https://api.deepseek.com BASE_KEY=… BASE_MODEL=deepseek-v4-pro \
 *   CAND_URL=https://my-endpoint.example/v1 CAND_KEY=… CAND_MODEL=zcan-privacy-v1 \
 *   node scripts/finetune/eval.mjs [--in out/eval.jsonl] [--limit 20]
 *
 * Both endpoints are OpenAI-compatible (POST {URL}/chat/completions). Keys are read from the
 * environment only and are never printed or written to the report.
 *
 * Optional environment:
 *   MAX_TOKENS   per answer (default 8000)
 *   BLIND=1      label the answers "A" and "B" in a random order per example and write the key to
 *                out/eval-key.json, so the reviewer doesn't know which model wrote what
 *
 * Each example is replayed up to (not including) its final answer, with the same tools and search
 * results it originally had; tool_choice is "none", so the model has to write its answer from them.
 * Writes out/eval-report.md (and out/eval-key.json with BLIND=1). No dependencies; Node 18+.
 */

import { randomInt } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "out");
const env = (k, d) => (process.env[k] ?? "").trim() || d;
const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const input = arg("--in") ?? join(OUT, "eval.jsonl");
const limit = Number(arg("--limit") ?? Infinity);
const MAX_TOKENS = Number(env("MAX_TOKENS", "8000"));
const BLIND = env("BLIND") === "1";

function endpoint(prefix, label) {
  const url = env(`${prefix}_URL`);
  const key = env(`${prefix}_KEY`);
  const model = env(`${prefix}_MODEL`);
  if (!url || !model) {
    console.error(`Set ${prefix}_URL and ${prefix}_MODEL (and ${prefix}_KEY if the endpoint needs one).`);
    process.exit(2);
  }
  return { label, url: url.replace(/\/+$/, ""), key, model };
}

const endpoints = [endpoint("BASE", "Baseline"), endpoint("CAND", "Candidate")];

if (!existsSync(input)) {
  console.error(`No eval file at ${input}. Run prepare.mjs first.`);
  process.exit(2);
}
const examples = readFileSync(input, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).slice(0, limit);
const metaFile = join(dirname(input), "eval.meta.jsonl");
const metas = existsSync(metaFile) ? readFileSync(metaFile, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];

const text = (c) => (typeof c === "string" ? c : Array.isArray(c) ? c.map((p) => p?.text ?? "").join("") : "");

async function complete(ep, ex) {
  const prompt = ex.messages.slice(0, -1);
  const reference = text(ex.messages.at(-1)?.content);
  let wantsJson = false;
  try {
    wantsJson = typeof JSON.parse(reference) === "object";
  } catch {}
  const body = {
    model: ep.model,
    messages: prompt,
    max_tokens: MAX_TOKENS,
    ...(ex.tools?.length ? { tools: ex.tools, tool_choice: "none" } : {}),
    ...(wantsJson ? { response_format: { type: "json_object" } } : {}),
  };
  const t0 = Date.now();
  try {
    const res = await fetch(`${ep.url}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(ep.key ? { authorization: `Bearer ${ep.key}` } : {}) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(300_000),
    });
    const ms = Date.now() - t0;
    if (!res.ok) {
      // Provider error bodies are shown (trimmed) to help debugging; they never contain our key.
      const detail = (await res.text()).replace(/\s+/g, " ").slice(0, 300);
      return { ok: false, ms, answer: `_Error: HTTP ${res.status} ${detail}_` };
    }
    const json = await res.json();
    const choice = json.choices?.[0];
    return { ok: true, ms, answer: text(choice?.message?.content) || "_(empty answer)_", finish: choice?.finish_reason, outTokens: json.usage?.completion_tokens };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, answer: `_Error: ${e?.name === "TimeoutError" ? "timed out" : "request failed"}_` };
  }
}

const fence = (s) => {
  const ticks = "`".repeat(Math.max(3, ...[...s.matchAll(/`+/g)].map((m) => m[0].length + 1)));
  return `${ticks}\n${s}\n${ticks}`;
};
const quote = (s, max = 2500) => (s.length > max ? `${s.slice(0, max)}\n…(${s.length - max} more characters)` : s);

const sections = [];
const key = [];
const totals = endpoints.map(() => ({ ok: 0, ms: 0, chars: 0 }));

for (let i = 0; i < examples.length; i++) {
  const ex = examples[i];
  const meta = metas[i] ?? {};
  process.stdout.write(`Example ${i + 1}/${examples.length}…\r`);
  const results = await Promise.all(endpoints.map((ep) => complete(ep, ex)));
  results.forEach((r, j) => {
    if (r.ok) totals[j].ok += 1;
    totals[j].ms += r.ms;
    totals[j].chars += r.ok ? r.answer.length : 0;
  });

  let order = [0, 1];
  if (BLIND && randomInt(2) === 1) order = [1, 0];
  if (BLIND) key.push({ example: i + 1, A: endpoints[order[0]].label, B: endpoints[order[1]].label });
  const name = (pos) => (BLIND ? (pos === 0 ? "A" : "B") : `${endpoints[order[pos]].label} (${endpoints[order[pos]].model})`);

  const request = text(ex.messages.find((m) => m.role === "user")?.content);
  const searches = ex.messages.filter((m) => m.role === "tool").length;
  sections.push(
    [
      `## Example ${i + 1}${meta.agent ? ` · ${meta.agent}` : ""}${meta.locale ? ` · ${meta.locale}` : ""}${meta.task ? ` · ${meta.task}` : ""}`,
      `${searches ? `${searches} search result(s) replayed. ` : ""}`,
      `<details><summary>Request</summary>\n\n${fence(quote(request))}\n\n</details>`,
      `<details><summary>Reference (the answer that was shared)</summary>\n\n${quote(text(ex.messages.at(-1)?.content), 6000)}\n\n</details>`,
      ...order.map((j, pos) => {
        const r = results[j];
        // Timing can give away which model is which, so blind reviews only flag unfinished answers.
        const stats = `${BLIND ? "" : `${(r.ms / 1000).toFixed(1)} s${r.outTokens ? ` · ${r.outTokens} tokens` : ""}`}${r.finish && r.finish !== "stop" ? ` · finish: ${r.finish}` : ""}`;
        return `### ${name(pos)}\n\n${stats ? `_${stats.replace(/^ · /, "")}_\n\n` : ""}${r.answer}`;
      }),
      "**Verdict:** ☐ A/Baseline better ☐ B/Candidate better ☐ Same ☐ Both bad — notes:",
    ].join("\n\n"),
  );
}

const n = examples.length || 1;
const header = [
  "# Zcan model eval — side by side",
  "",
  `${examples.length} example(s) from \`${input}\` · ${new Date().toISOString()}${BLIND ? " · blind (key in eval-key.json)" : ""}`,
  "",
  ...(BLIND
    ? []
    : [
        "| | Model | Answered | Avg time | Avg length |",
        "|---|---|---|---|---|",
        ...endpoints.map((ep, j) => `| ${ep.label} | ${ep.model} | ${totals[j].ok}/${examples.length} | ${(totals[j].ms / n / 1000).toFixed(1)} s | ${Math.round(totals[j].chars / Math.max(1, totals[j].ok))} chars |`),
        "",
      ]),
  "Check each answer for: correct facts and URLs (open them), following the report format, the right language,",
  "no invented listings or opt-out links, no personal data copied into the report, and sensible use of the search results.",
  "",
].join("\n");

mkdirSync(OUT, { recursive: true });
const report = join(OUT, "eval-report.md");
writeFileSync(report, `${header}\n${sections.join("\n\n---\n\n")}\n`);
if (BLIND) writeFileSync(join(OUT, "eval-key.json"), `${JSON.stringify(key, null, 2)}\n`);
console.log(`\nWrote ${report}${BLIND ? " and eval-key.json" : ""}`);
