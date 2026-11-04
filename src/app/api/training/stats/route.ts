import { connection } from "next/server";
import { adminAuthorized, contributionStats, trainingEnabled } from "@/lib/training";

export const maxDuration = 60;

/**
 * Admin-only counts of shared runs, to decide when there's enough data to fine-tune. Never returns content.
 *
 *   curl -H "Authorization: Bearer $TRAINING_ADMIN_TOKEN" "https://<site>/api/training/stats"
 *
 * → { total, byAgent, byLocale, byRating: { up, down, none }, oldest, newest }
 * Like the export, it answers 404 unless training is switched on and the admin token matches.
 */
export async function GET(req: Request) {
  await connection();
  if (!trainingEnabled() || !adminAuthorized(req)) return new Response("Not found", { status: 404 });
  try {
    return Response.json(await contributionStats(), { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ message: "Couldn't read the store right now." }, { status: 502, headers: { "cache-control": "no-store" } });
  }
}
