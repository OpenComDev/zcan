import { connection } from "next/server";
import { AI_MODEL_NAME } from "@/lib/ai-model";
import { aiConfigured } from "@/lib/agents-server";
import { backupConfigured } from "@/lib/changenow";

/**
 * Upstream health for the /status page. Probes run in parallel with a 4 s timeout each.
 * Paid APIs (the agent model, Tavily) are never called — only whether they're configured is reported.
 * Responses never include keys, URLs with credentials or raw upstream error text.
 */

export type HealthCheck = {
  id: string;
  service: string;
  /** "probe" = live request made; "config" = only checks that the service is configured. */
  kind: "probe" | "config";
  ok: boolean;
  /** Optional services don't affect the overall status. */
  optional?: boolean;
  latencyMs: number | null;
  detail: string;
  checkedAt: string;
};

export type HealthResponse = { ok: boolean; checkedAt: string; services: HealthCheck[] };

const TIMEOUT_MS = 4_000;
// Several viewers polling at once share one round of probes, so upstream rate limits aren't hit.
const REUSE_MS = 10_000;

const ONECLICK_BASE = process.env.ONECLICK_BASE_URL ?? "https://1click.chaindefuser.com";
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

async function probe(
  id: string,
  service: string,
  url: string,
  read: (body: unknown) => string,
  headers: Record<string, string> = {},
): Promise<HealthCheck> {
  const t0 = performance.now();
  const done = (ok: boolean, detail: string, latency: number | null = Math.round(performance.now() - t0)): HealthCheck => ({
    id,
    service,
    kind: "probe",
    ok,
    latencyMs: latency,
    detail,
    checkedAt: new Date().toISOString(),
  });
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json", ...headers },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return done(false, res.status === 429 ? "Rate limited (HTTP 429)" : `HTTP ${res.status}`);
    const body: unknown = await res.json().catch(() => null);
    let detail: string;
    try {
      detail = read(body);
    } catch {
      return done(false, "Unexpected response");
    }
    return done(true, detail);
  } catch (e) {
    const name = (e as Error)?.name;
    if (name === "TimeoutError" || name === "AbortError") return done(false, `No response within ${TIMEOUT_MS / 1000} s`, null);
    return done(false, "Unreachable");
  }
}

function configured(id: string, service: string, present: boolean, yes: string, no: string, optional = false): HealthCheck {
  return {
    id,
    service,
    kind: "config",
    ok: present,
    optional,
    latencyMs: null,
    detail: present ? yes : no,
    checkedAt: new Date().toISOString(),
  };
}

async function runChecks(): Promise<HealthResponse> {
  const oneClickHeaders: Record<string, string> = {};
  if (process.env.ONECLICK_JWT) oneClickHeaders.authorization = `Bearer ${process.env.ONECLICK_JWT}`;

  const services = await Promise.all([
    probe(
      "oneclick",
      "1Click API (swaps)",
      `${ONECLICK_BASE}/v0/tokens`,
      (b) => {
        if (!Array.isArray(b) || b.length === 0) throw new Error("empty");
        return `${b.length.toLocaleString("en-US")} assets listed`;
      },
      oneClickHeaders,
    ),
    probe("coingecko", "CoinGecko (price history)", "https://api.coingecko.com/api/v3/simple/price?ids=zcash&vs_currencies=usd", (b) => {
      const p = (b as { zcash?: { usd?: number } })?.zcash?.usd;
      if (typeof p !== "number") throw new Error("shape");
      return `ZEC ${usd.format(p)}`;
    }),
    probe("coinbase", "Coinbase (live prices)", "https://api.exchange.coinbase.com/products/ZEC-USD/ticker", (b) => {
      const p = Number((b as { price?: string })?.price);
      if (!Number.isFinite(p) || p <= 0) throw new Error("shape");
      return `ZEC ${usd.format(p)} · REST ticker`;
    }),
  ]);

  services.push(
    configured(
      "changenow",
      "ChangeNOW (backup swaps)",
      backupConfigured(),
      "Configured — takes over swaps while 1Click is down",
      "Not configured — no backup while 1Click is down",
      true,
    ),
    configured("ai", `${AI_MODEL_NAME} (privacy agents)`, aiConfigured(), "Configured", "Not configured — agents are unavailable"),
    configured(
      "tavily",
      "Tavily (agent web search)",
      Boolean(process.env.TAVILY_API_KEY),
      "Configured",
      "Not configured — agents run without web search",
      true,
    ),
  );

  return {
    ok: services.every((s) => s.ok || s.optional),
    checkedAt: new Date().toISOString(),
    services,
  };
}

let last: { at: number; data: HealthResponse } | null = null;
let inflight: Promise<HealthResponse> | null = null;

export async function GET() {
  await connection();
  if (!last || Date.now() - last.at > REUSE_MS) {
    inflight ??= runChecks()
      .then((data) => {
        last = { at: Date.now(), data };
        return data;
      })
      .finally(() => {
        inflight = null;
      });
    await inflight;
  }
  return Response.json(last!.data, { headers: { "cache-control": "no-store" } });
}
