import { modelReady } from "@/lib/agents-server";

/**
 * Wakes Zcan's own model if it has scaled to zero, and says whether it's ready: 200 when it is,
 * 503 while it starts. Agent pages call it on open, and poll it while the model boots, so the
 * waiting doesn't use up anyone's hourly plan limit. Sends nothing about the visitor.
 */
export async function POST() {
  const ready = await modelReady();
  return Response.json({ ready }, { status: ready ? 200 : 503, headers: { "cache-control": "no-store" } });
}
