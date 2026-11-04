import type { Instrumentation } from "next";

/**
 * Server-side crash reports: errors while rendering pages or running API routes are scrubbed and
 * stored with the browser reports (src/lib/error-store.ts). Only the route pattern is kept
 * (e.g. /order/[id]), never the request's path, query, headers or body.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, _request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const [{ sanitizeReport }, { recordError }] = await Promise.all([import("./lib/error-scrub"), import("./lib/error-store")]);
    const e = err instanceof Error ? err : new Error(String(err));
    const digest = typeof err === "object" && err && "digest" in err ? String((err as { digest: unknown }).digest) : undefined;
    const report = sanitizeReport({
      source: "server",
      name: e.name,
      message: e.message || "Server error",
      stack: e.stack,
      route: context.routePath.replace(/^\/(app|src\/app)/, "").replace(/\/(page|route)$/, "") || "/",
      env: `${context.routeType}${context.renderSource ? ` · ${context.renderSource}` : ""}`,
      release: process.env.VERCEL_GIT_COMMIT_SHA,
      digest,
    });
    if (report) await recordError(report);
  } catch {
    // Reporting must never make an error worse.
  }
};
