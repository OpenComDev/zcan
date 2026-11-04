/**
 * Checks a deployed model the way Zcan's agents use it. Run after deploying:
 *
 *   AI_BASE_URL=https://…modal.run/v1 AI_API_KEY=wk-….ws-… node deploy/model/check.mjs
 *
 * 1. waits for the model to start (it answers 503 while a GPU boots),
 * 2. a plain reply, 3. a plan in the exact JSON shape the agents need, 4. a streamed web-search tool call.
 * It prints a unique marker; afterwards `modal app logs zcan-model | grep <marker>` must print nothing,
 * proving prompts aren't logged.
 */
import { randomBytes } from "node:crypto";
import OpenAI from "openai";

const baseURL = process.env.AI_BASE_URL;
const apiKey = process.env.AI_API_KEY;
const model = process.env.AI_MODEL || "zcan-privacy-model";
if (!baseURL || !apiKey) {
  console.error("Set AI_BASE_URL (ending in /v1) and AI_API_KEY (your Modal proxy token, wk-….ws-…).");
  process.exit(1);
}
const client = new OpenAI({ baseURL, apiKey, timeout: 300_000, maxRetries: 0 });
const marker = `ZCAN-LOGCHECK-${randomBytes(6).toString("hex")}`;
const ok = (msg) => console.log(`✓ ${msg}`);
const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exitCode = 1;
};
/** ok(msg) when cond holds, else fail(otherwise). */
const check = (cond, msg, otherwise) => (cond ? ok(msg) : fail(otherwise));

// 1. Wake up.
process.stdout.write("Waiting for the model to start");
const t0 = Date.now();
for (;;) {
  try {
    const models = await client.models.list();
    const ids = models.data.map((m) => m.id);
    console.log();
    check(ids.includes(model), `ready after ${Math.round((Date.now() - t0) / 1000)} s, serving ${ids.join(", ")}`, `"${model}" not in ${ids.join(", ")}`);
    break;
  } catch (e) {
    if (e?.status === 401 || e?.status === 403) {
      console.log();
      fail(`rejected (${e.status}): check AI_API_KEY is the Modal proxy token`);
      process.exit(1);
    }
    if (Date.now() - t0 > 15 * 60_000) {
      console.log();
      fail(`not ready after 15 minutes (${e?.status ?? e?.message})`);
      process.exit(1);
    }
    process.stdout.write(".");
    await new Promise((r) => setTimeout(r, 10_000));
  }
}

// 2. Plain reply.
const plain = await client.chat.completions.create({
  model,
  max_tokens: 400,
  messages: [{ role: "user", content: `Reply with the single word OK. (${marker})` }],
});
const text = plain.choices[0]?.message?.content?.trim() ?? "";
check(/ok/i.test(text), `plain reply: "${text.slice(0, 40)}"`, `unexpected reply: "${text.slice(0, 120)}"`);

// 3. Plan JSON, as /api/agents/plan asks for it.
const schema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    steps: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: {
        type: "object",
        properties: { id: { type: "string" }, title: { type: "string" }, detail: { type: "string" }, kind: { type: "string", enum: ["search", "analyze", "write"] } },
        required: ["id", "title", "detail", "kind"],
        additionalProperties: false,
      },
    },
    caveat: { type: ["string", "null"] },
  },
  required: ["summary", "steps", "caveat"],
  additionalProperties: false,
};
const plan = await client.chat.completions.create({
  model,
  max_tokens: 2000,
  response_format: { type: "json_schema", json_schema: { name: "agent_plan", strict: true, schema } },
  messages: [{ role: "user", content: `Plan 3 steps to check whether someone's email was in a data breach. (${marker})` }],
});
try {
  const p = JSON.parse(plan.choices[0]?.message?.content ?? "");
  check(Array.isArray(p.steps) && p.steps.length > 0 && typeof p.summary === "string", `plan JSON: ${p.steps?.length} steps`, "plan JSON has the wrong shape");
} catch {
  fail(`plan isn't JSON: ${(plan.choices[0]?.message?.content ?? "").slice(0, 120)}`);
}

// 4. Streamed tool call, as /api/agents/run uses web search.
const stream = await client.chat.completions.create({
  model,
  max_tokens: 1000,
  stream: true,
  tool_choice: "auto",
  tools: [
    {
      type: "function",
      function: {
        name: "web_search",
        description: "Search the public web.",
        parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
      },
    },
  ],
  messages: [{ role: "user", content: `Use web_search to find the latest Zcash release notes. (${marker})` }],
});
let finish = null;
let args = "";
let name = "";
for await (const chunk of stream) {
  const c = chunk.choices[0];
  for (const tc of c?.delta?.tool_calls ?? []) {
    if (tc.function?.name) name = tc.function.name;
    if (tc.function?.arguments) args += tc.function.arguments;
  }
  if (c?.finish_reason) finish = c.finish_reason;
}
try {
  const q = JSON.parse(args || "{}").query;
  check(finish === "tool_calls" && name === "web_search" && Boolean(q), `tool call: web_search("${q}")`, `no tool call (finish: ${finish}, name: ${name}, args: ${args.slice(0, 80)})`);
} catch {
  fail(`tool arguments aren't JSON: ${args.slice(0, 120)}`);
}

console.log(`\nNow confirm prompts aren't logged — this must print nothing:\n  modal app logs zcan-model | grep ${marker}`);
