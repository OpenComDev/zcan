import { connection } from "next/server";
import { sanitizeReport } from "@/lib/error-scrub";
import { clearError, listErrors, recordError } from "@/lib/error-store";
import { kvConfigured } from "@/lib/kv";
import { adminAuthorized } from "@/lib/training";

/**
 * Crash reports from the browser (POST), and the admin view of them (GET / DELETE).
 *
 *   curl -H "Authorization: Bearer $TRAINING_ADMIN_TOKEN" "https://<site>/api/errors"
 *
 * Reports are scrubbed in the browser and again here. Nothing identifying is stored: no IP, no cookies,
 * no full URL, no query string. See /transparency.
 */

const MAX_BODY = 12_000;
const NO_STORE = { "cache-control": "no-store" };

const clientIp = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || undefined;

export async function POST(req: Request) {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_BODY) return new Response(null, { status: 413 });
  let raw: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY) return new Response(null, { status: 413 });
    raw = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }
  const host = req.headers.get("host") ?? undefined;
  const report = sanitizeReport(raw, host);
  // Only browser reports come through here; server errors are recorded by instrumentation.ts and
  // policy violations by /api/csp-report.
  if (!report || (report.source !== "client" && report.source !== "boundary")) return new Response(null, { status: 400 });
  await recordError(report, clientIp(req));
  return new Response(null, { status: 204, headers: NO_STORE });
}

export async function GET(req: Request) {
  await connection();
  if (!adminAuthorized(req)) return new Response("Not found", { status: 404 });
  if (!kvConfigured()) return Response.json({ configured: false, groups: [] }, { headers: NO_STORE });
  try {
    return Response.json({ configured: true, groups: await listErrors(100) }, { headers: NO_STORE });
  } catch {
    return Response.json({ message: "Couldn't read the store right now." }, { status: 502, headers: NO_STORE });
  }
}

export async function DELETE(req: Request) {
  await connection();
  if (!adminAuthorized(req)) return new Response("Not found", { status: 404 });
  const fp = new URL(req.url).searchParams.get("fp") ?? "";
  try {
    await clearError(fp);
    return new Response(null, { status: 204, headers: NO_STORE });
  } catch {
    return Response.json({ message: "Couldn't update the store right now." }, { status: 502, headers: NO_STORE });
  }
}
