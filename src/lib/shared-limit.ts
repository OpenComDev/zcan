import "server-only";
import { createHash } from "node:crypto";

/**
 * Rate limits shared by every server instance, kept in the same Redis REST store as training
 * (Upstash / Vercel KV). Without a store this is a no-op and the per-instance limiter in
 * agents-server.ts is all there is. Security review ZS-03: it stops one IP, or a flood from many,
 * from running up the AI and search bills.
 *
 * IPs are stored only as salted SHA-256 hashes, in keys that expire after an hour.
 */
const env = (...names: string[]) => names.map((n) => process.env[n]?.trim()).find(Boolean);
const STORE_URL = env("UPSTASH_REDIS_REST_URL", "KV_REST_API_URL");
const STORE_TOKEN = env("UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_TOKEN");
const SALT = env("TRAINING_SIGNING_SECRET") ?? "zcan-limit";

const num = (name: string, fallback: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
};

/** Site-wide caps per UTC day. Override with AGENT_DAILY_PLAN_CAP / AGENT_DAILY_RUN_CAP. */
const DAILY: Record<string, number> = {
  plan: num("AGENT_DAILY_PLAN_CAP", 1000),
  run: num("AGENT_DAILY_RUN_CAP", 300),
};

export type LimitResult = null | "ip" | "daily";

export async function sharedLimited(req: Request, bucket: "plan" | "run", perIpHour: number): Promise<LimitResult> {
  if (!STORE_URL || !STORE_TOKEN) return null;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
  const ipKey = `zcan:limit:${bucket}:${createHash("sha256").update(`${SALT}:${ip}`).digest("hex").slice(0, 32)}`;
  const dayKey = `zcan:limit:${bucket}:day:${new Date().toISOString().slice(0, 10)}`;
  try {
    const res = await fetch(`${STORE_URL}/pipeline`, {
      method: "POST",
      headers: { authorization: `Bearer ${STORE_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify([
        // SET … NX creates each counter with its expiry once; INCR then counts.
        ["SET", ipKey, 0, "EX", 3600, "NX"],
        ["INCR", ipKey],
        ["SET", dayKey, 0, "EX", 172800, "NX"],
        ["INCR", dayKey],
      ]),
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return null;
    const out = (await res.json()) as { result?: unknown }[];
    const ipCount = Number(out[1]?.result);
    const dayCount = Number(out[3]?.result);
    if (dayCount > DAILY[bucket]) return "daily";
    if (ipCount > perIpHour) return "ip";
    return null;
  } catch {
    // Store unreachable: fail open; the per-instance limiter still applies.
    return null;
  }
}
