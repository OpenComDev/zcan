import { connection } from "next/server";
import { adminAuthorized, allContributions, trainingEnabled } from "@/lib/training";

export const maxDuration = 60;

/**
 * Admin-only export of shared runs as JSONL in the OpenAI chat fine-tuning format
 * (one {"messages": [...], "tools": [...]} object per line) — accepted by Together, Fireworks and OpenPipe.
 *
 *   curl -H "Authorization: Bearer $TRAINING_ADMIN_TOKEN" "https://<site>/api/training/export?kind=run&rating=up" > zcan-train.jsonl
 *
 * kind: run (report writing, default) | plan (plan drafting) | all.  rating: up | any (default any; "down" rows are never exported).
 * meta=1 adds a `metadata` object per row (agent, locale, rating) — leave it off for providers that reject unknown keys.
 */
export async function GET(req: Request) {
  await connection();
  if (!trainingEnabled() || !adminAuthorized(req)) return new Response("Not found", { status: 404 });

  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") ?? "run";
  const onlyUp = url.searchParams.get("rating") === "up";
  const withMeta = url.searchParams.get("meta") === "1";
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const rec of allContributions()) {
          if (rec.rating === "down" || (onlyUp && rec.rating !== "up")) continue;
          const meta = (task: string) => (withMeta ? { metadata: { id: rec.id, agent: rec.agentId, locale: rec.locale, rating: rec.rating, task } } : {});
          if (kind === "plan" || kind === "all") controller.enqueue(encoder.encode(`${JSON.stringify({ messages: rec.draft.plan.messages, ...meta("plan") })}\n`));
          if (kind === "run" || kind === "all") {
            const row = { messages: rec.draft.run.messages, ...(rec.draft.run.tools.length ? { tools: rec.draft.run.tools } : {}), ...meta("run") };
            controller.enqueue(encoder.encode(`${JSON.stringify(row)}\n`));
          }
        }
      } catch {
        controller.enqueue(encoder.encode(`${JSON.stringify({ error: "export interrupted" })}\n`));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "content-disposition": 'attachment; filename="zcan-training.jsonl"' },
  });
}
