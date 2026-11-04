import { sharedLimited } from "@/lib/shared-limit";
import type OpenAI from "openai";
import { isTrainable, type RunEvent } from "@/lib/agents";
import {
  CUT_SHORT,
  NOT_CONFIGURED,
  PROVIDER_OPTIONS,
  RUN_MODEL,
  apiErrorMessage,
  getClient,
  planPrompt,
  rateLimited,
  readInput,
  readPlan,
  runPrompt,
  stripSignatures,
  systemPrompt,
  verifyPlan,
} from "@/lib/agents-server";
import { buildDraft } from "@/lib/training";
import { webSearch, webSearchEnabled } from "@/lib/web-search";

export const maxDuration = 300;

type Msg = OpenAI.Chat.Completions.ChatCompletionMessageParam;

const DEFAULT_SEARCHES = 8;
const MAX_TURNS = 10;

const SEARCH_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "web_search",
    description: "Search the public web. Returns titles, URLs and short excerpts. Use focused queries.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "The search query" } },
      required: ["query"],
      additionalProperties: false,
    },
  },
};

/** Step 2: run only the approved plan, streaming progress and the report as NDJSON. */
export async function POST(req: Request) {
  const client = getClient();
  if (!client) return Response.json({ code: "notConfigured", message: NOT_CONFIGURED }, { status: 503 });
  if (rateLimited(req, "run", 8)) return Response.json({ code: "rateLimitedRun", message: "You've hit the hourly limit for agent runs. Try again later." }, { status: 429 });
  const shared = await sharedLimited(req, "run", 8);
  if (shared === "daily") return Response.json({ code: "dailyCap", message: "The agents have reached today's limit. Try again tomorrow." }, { status: 429 });
  if (shared === "ip") return Response.json({ code: "rateLimitedRun", message: "You've hit the hourly limit for agent runs. Try again later." }, { status: 429 });

  const body = await req.json().catch(() => null);
  const input = readInput(body);
  if ("error" in input) return Response.json({ code: input.code, message: input.error, field: input.field }, { status: 400 });
  const plan = readPlan(body?.plan);
  if (!plan) return Response.json({ code: "noSteps", message: "Approve at least one step to run the agent." }, { status: 400 });
  // Only plans Zcan's plan route wrote can run as signed (ZS-10). Edited plans are refused; unsigned
  // ones (re-checks saved before signing existed) still run but are never offered as training data.
  const signature = verifyPlan(input, plan);
  if (signature === "invalid") return Response.json({ code: "planChanged", message: "This plan was changed after it was made. Ask the agent for a new plan." }, { status: 400 });

  const canSearch = input.agent.usesWeb && webSearchEnabled() && plan.steps.some((s) => s.kind === "search");
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: RunEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
      const seen = new Set<string>();
      const maxSearches = input.agent.maxSearches ?? DEFAULT_SEARCHES;
      let searches = 0;
      let report = "";
      let complete = false;
      const messages: Msg[] = [
        { role: "system", content: systemPrompt(input.agent, input.locale) },
        { role: "user", content: runPrompt(input, plan, canSearch) },
      ];

      try {
        send(
          canSearch
            ? { t: "status", code: "searching", text: "Searching the public web…" }
            : { t: "status", code: "offline", text: "Working from known information…" },
        );

        for (let turn = 0; turn < MAX_TURNS; turn++) {
          const allowTools = canSearch && searches < maxSearches;
          const completion = await client.chat.completions.create(
            {
              model: RUN_MODEL,
              max_tokens: 8000,
              stream: true,
              messages,
              ...(allowTools ? { tools: [SEARCH_TOOL], tool_choice: "auto" as const } : {}),
              ...PROVIDER_OPTIONS,
            },
            { signal: req.signal },
          );

          let text = "";
          let finish: string | null = null;
          const calls: { id: string; name: string; args: string }[] = [];

          for await (const chunk of completion) {
            const choice = chunk.choices[0];
            if (!choice) continue;
            const delta = choice.delta;
            if (delta?.content) {
              text += delta.content;
              send({ t: "text", text: delta.content });
            }
            for (const tc of delta?.tool_calls ?? []) {
              const slot = (calls[tc.index] ??= { id: "", name: "", args: "" });
              if (tc.id) slot.id = tc.id;
              if (tc.function?.name) slot.name = tc.function.name;
              if (tc.function?.arguments) slot.args += tc.function.arguments;
            }
            if (choice.finish_reason) finish = choice.finish_reason;
          }

          if (finish === "content_filter") {
            send({ t: "error", code: "contentFilterRun", message: "The agent stopped because it can't help with part of this request." });
            break;
          }

          const toolCalls = calls.filter((c) => c.id && c.name);
          if (finish === "tool_calls" && toolCalls.length) {
            // Anything written before the searches isn't the report.
            if (text) send({ t: "reset" });
            messages.push({
              role: "assistant",
              content: text || null,
              tool_calls: toolCalls.map((c) => ({ id: c.id, type: "function" as const, function: { name: c.name, arguments: c.args } })),
            });

            for (const call of toolCalls) {
              let result: string;
              let query = "";
              try {
                query = String(JSON.parse(call.args || "{}").query ?? "").trim();
              } catch {
                // Invalid arguments — reported back to the model below.
              }
              if (call.name !== "web_search" || !query) {
                result = JSON.stringify({ error: "Invalid call. Use web_search with a non-empty query." });
              } else if (searches >= maxSearches) {
                result = JSON.stringify({ error: "Search limit reached. Write the report with what you have." });
              } else {
                searches += 1;
                send({ t: "search", query });
                try {
                  const hits = await webSearch(query, req.signal);
                  for (const h of hits) {
                    if (!seen.has(h.url)) {
                      seen.add(h.url);
                      send({ t: "source", url: h.url, title: h.title });
                    }
                  }
                  result = JSON.stringify(hits);
                } catch {
                  result = JSON.stringify({ error: "Search failed. Continue without it." });
                }
              }
              messages.push({ role: "tool", tool_call_id: call.id, content: result });
            }
            continue;
          }

          if (finish === "length") send({ t: "text", text: `\n\n_${CUT_SHORT[input.locale]}_` });
          else if (finish === "stop") {
            report = text;
            complete = true;
          }
          break;
        }

        // Complete reports from shareable agents can be offered as anonymized training data — the
        // reader decides afterwards. Nothing is stored here.
        //
        // Never for runs that used the saved agent-memory profile. The draft would carry it in two
        // ways: the plan and run prompts embed it (describeInput → <user_profile>), and the report
        // is tailored to it (their phone, email provider, region…), which no scrubber can reliably
        // undo. The anonymizer only knows the agent's form fields, so the only safe rule is: a
        // profile run is never offered for training at all.
        if (complete && signature === "signed" && !input.profile && isTrainable(input.agent, input.values)) {
          const planSearch = input.agent.usesWeb && webSearchEnabled();
          const offer = buildDraft({
            agent: input.agent,
            values: input.values,
            locale: input.locale,
            planMessages: [
              { role: "system", content: systemPrompt(input.agent, input.locale) },
              { role: "user", content: planPrompt(input, planSearch) },
            ],
            planJson: JSON.stringify(stripSignatures(plan)),
            runMessages: messages,
            report,
            tools: canSearch ? [SEARCH_TOOL] : [],
          });
          if (offer) send({ t: "contribution", ...offer });
        }
        send({ t: "done" });
      } catch (err) {
        if (!req.signal.aborted) {
          const { code, message } = apiErrorMessage(err);
          send({ t: "error", code, message });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" },
  });
}
