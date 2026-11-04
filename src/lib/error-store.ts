import "server-only";
import { createHash } from "node:crypto";
import type { ErrorReport } from "./error-scrub";
import { kv, kvConfigured, type KvCommand } from "./kv";

/**
 * Crash reports, kept in Zcan's own Redis store (no third-party error service). Reports arrive
 * already scrubbed; identical errors are grouped by a fingerprint and counted per day.
 * Everything expires after 14 days. IPs are only used, salted and hashed, for an hourly limit.
 */

const TTL_S = 14 * 24 * 3600;
const MAX_GROUPS = 500;
const PER_IP_HOUR = 30;
const DAILY_CAP = (() => {
  const v = Number(process.env.ERROR_DAILY_CAP);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 5000;
})();
const SALT = process.env.TRAINING_SIGNING_SECRET?.trim() || "zcan-limit";

const INDEX = "zcan:err:index";
const K = {
  first: (fp: string) => `zcan:err:s:${fp}`,
  last: (fp: string) => `zcan:err:l:${fp}`,
  count: (fp: string) => `zcan:err:n:${fp}`,
  days: (fp: string) => `zcan:err:d:${fp}`,
};

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** Same error, same group: digits are ignored so "timeout after 3012ms" and "…3998ms" match. */
export function fingerprint(r: ErrorReport): string {
  const top = r.stack?.split("\n")[0]?.replace(/:\d+:\d+/g, "") ?? "";
  return sha(`${r.source}|${r.name}|${r.message.replace(/\d+/g, "#")}|${top}`).slice(0, 16);
}

/** Stores a report. Returns false when it was dropped (limit reached or no store). Never throws. */
export async function recordError(r: ErrorReport, ip?: string): Promise<boolean> {
  if (!kvConfigured()) {
    // No store: Vercel's function logs still get the scrubbed report.
    console.warn("[zcan:error]", JSON.stringify(r));
    return false;
  }
  const now = Date.now();
  const day = new Date(now).toISOString().slice(0, 10);
  try {
    const gate: KvCommand[] = [
      ["SET", `zcan:err:day:${day}`, 0, "EX", 172800, "NX"],
      ["INCR", `zcan:err:day:${day}`],
    ];
    if (ip) {
      const ipKey = `zcan:err:ip:${sha(`${SALT}:${ip}`).slice(0, 32)}`;
      gate.push(["SET", ipKey, 0, "EX", 3600, "NX"], ["INCR", ipKey]);
    }
    const counts = await kv<number>(gate);
    if (Number(counts[1]) > DAILY_CAP || (ip && Number(counts[3]) > PER_IP_HOUR)) return false;

    const fp = fingerprint(r);
    const sample = JSON.stringify({ ...r, at: now });
    await kv([
      ["SET", K.first(fp), sample, "EX", TTL_S, "NX"],
      ["SET", K.last(fp), sample, "EX", TTL_S],
      ["INCR", K.count(fp)],
      ["EXPIRE", K.count(fp), TTL_S],
      ["HINCRBY", K.days(fp), day, 1],
      ["EXPIRE", K.days(fp), TTL_S],
      ["EXPIRE", K.first(fp), TTL_S],
      ["ZADD", INDEX, now, fp],
      ["ZREMRANGEBYSCORE", INDEX, "-inf", now - TTL_S * 1000],
      ["ZREMRANGEBYRANK", INDEX, 0, -(MAX_GROUPS + 1)],
    ]);
    return true;
  } catch (e) {
    console.warn("[zcan:error] store unavailable", e instanceof Error ? e.message : "");
    return false;
  }
}

export type ErrorGroup = {
  fp: string;
  count: number;
  /** Reports per UTC day, oldest first. */
  days: Record<string, number>;
  lastSeen: string;
  first: (ErrorReport & { at: number }) | null;
  last: (ErrorReport & { at: number }) | null;
};

const parse = (s: unknown) => {
  try {
    return typeof s === "string" ? (JSON.parse(s) as ErrorReport & { at: number }) : null;
  } catch {
    return null;
  }
};

/** Most recently seen groups first. */
export async function listErrors(limit = 100): Promise<ErrorGroup[]> {
  const [flat] = await kv<string[]>([["ZREVRANGE", INDEX, 0, Math.min(limit, MAX_GROUPS) - 1, "WITHSCORES"]]);
  const groups: { fp: string; score: number }[] = [];
  for (let i = 0; i + 1 < (flat ?? []).length; i += 2) groups.push({ fp: flat[i], score: Number(flat[i + 1]) });
  if (!groups.length) return [];
  const out = await kv<unknown>(groups.flatMap(({ fp }) => [["GET", K.first(fp)], ["GET", K.last(fp)], ["GET", K.count(fp)], ["HGETALL", K.days(fp)]]));
  return groups.map(({ fp, score }, i) => {
    const raw = out[i * 4 + 3];
    const days: Record<string, number> = {};
    // Upstash returns HGETALL as a flat [field, value, …] array.
    if (Array.isArray(raw)) for (let j = 0; j + 1 < raw.length; j += 2) days[String(raw[j])] = Number(raw[j + 1]);
    return {
      fp,
      first: parse(out[i * 4]),
      last: parse(out[i * 4 + 1]),
      count: Number(out[i * 4 + 2]) || 0,
      days: Object.fromEntries(Object.entries(days).sort(([a], [b]) => a.localeCompare(b))),
      lastSeen: new Date(score).toISOString(),
    };
  });
}

/** Removes a group (e.g. once it's fixed). */
export async function clearError(fp: string): Promise<void> {
  if (!/^[0-9a-f]{16}$/.test(fp)) return;
  await kv([["DEL", K.first(fp), K.last(fp), K.count(fp), K.days(fp)], ["ZREM", INDEX, fp]]);
}
