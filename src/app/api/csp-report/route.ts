import { browserOf, sanitizeReport } from "@/lib/error-scrub";
import { recordError } from "@/lib/error-store";

/**
 * Content Security Policy violation reports (both the legacy application/csp-report format and the
 * Reporting API's application/reports+json). Each is reduced to the directive, the blocked host and the
 * page path, scrubbed like a crash report, and kept with them (GET /api/errors). Answers 204 regardless.
 */

const MAX_BODY = 20_000;
const done = () => new Response(null, { status: 204 });

type Violation = { directive: string; blocked: string; page: string; source?: string; line?: number; disposition?: string };

function hostOf(v: unknown): string {
  if (typeof v !== "string" || !v) return "unknown";
  if (/^(inline|eval|wasm-eval|data|blob|self)$/.test(v)) return v;
  try {
    const u = new URL(v);
    return u.protocol === "data:" || u.protocol === "blob:" ? u.protocol.slice(0, -1) : `${u.protocol}//${u.host}`;
  } catch {
    return v.slice(0, 40);
  }
}

const pathOf = (v: unknown) => {
  try {
    return new URL(String(v)).pathname;
  } catch {
    return "/";
  }
};

function parse(body: unknown): Violation[] {
  const out: Violation[] = [];
  const legacy = (body as { "csp-report"?: Record<string, unknown> })?.["csp-report"];
  if (legacy) {
    out.push({
      directive: String(legacy["effective-directive"] ?? legacy["violated-directive"] ?? "unknown").split(" ")[0],
      blocked: hostOf(legacy["blocked-uri"]),
      page: pathOf(legacy["document-uri"]),
      source: legacy["source-file"] ? hostOf(legacy["source-file"]) : undefined,
      line: Number(legacy["line-number"]) || undefined,
      disposition: String(legacy.disposition ?? ""),
    });
  }
  if (Array.isArray(body)) {
    for (const r of body.slice(0, 20)) {
      const b = (r as { type?: string; body?: Record<string, unknown> })?.body;
      if ((r as { type?: string })?.type !== "csp-violation" || !b) continue;
      out.push({
        directive: String(b.effectiveDirective ?? "unknown"),
        blocked: hostOf(b.blockedURL),
        page: pathOf(b.documentURL),
        source: b.sourceFile ? hostOf(b.sourceFile) : undefined,
        line: Number(b.lineNumber) || undefined,
        disposition: String(b.disposition ?? ""),
      });
    }
  }
  return out;
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY) return done();
    body = JSON.parse(text);
  } catch {
    return done();
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || undefined;
  const env = browserOf(req.headers.get("user-agent") ?? "");
  for (const v of parse(body).slice(0, 5)) {
    const report = sanitizeReport({
      source: "csp",
      name: `CSP ${v.directive}`,
      message: `${v.disposition === "enforce" ? "Blocked" : "Would block"} ${v.blocked}${v.source ? ` from ${v.source}${v.line ? `:${v.line}` : ""}` : ""}`,
      route: v.page,
      env,
    });
    if (report) await recordError(report, ip);
  }
  return done();
}
