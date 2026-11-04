import "server-only";

/**
 * Minimal Redis-over-REST client for the Upstash / Vercel KV store the site already uses
 * (same env vars as training and the shared rate limits).
 */
const env = (...names: string[]) => names.map((n) => process.env[n]?.trim()).find(Boolean);
const STORE_URL = env("UPSTASH_REDIS_REST_URL", "KV_REST_API_URL");
const STORE_TOKEN = env("UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_TOKEN");

export const kvConfigured = () => Boolean(STORE_URL && STORE_TOKEN);

export type KvCommand = (string | number)[];

/** Runs commands in one round trip. Throws on transport or command errors. */
export async function kv<T = unknown>(commands: KvCommand[], timeoutMs = 2500): Promise<T[]> {
  if (!STORE_URL || !STORE_TOKEN) throw new Error("Store not configured");
  const res = await fetch(`${STORE_URL}/pipeline`, {
    method: "POST",
    headers: { authorization: `Bearer ${STORE_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(commands),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Store error ${res.status}`);
  const out = (await res.json()) as { result?: T; error?: string }[];
  const failed = out.find((r) => r.error);
  if (failed) throw new Error(`Store error: ${failed.error}`);
  return out.map((r) => r.result as T);
}
