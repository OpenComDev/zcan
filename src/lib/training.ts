import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type OpenAI from "openai";
import { getAgent, type AgentDef } from "./agents";

/**
 * Opt-in training data for Zcan's own model.
 *
 * Nothing is stored unless a reader explicitly shares a finished run. The server builds an anonymized
 * transcript, signs it and hands it to the browser as a draft; the reader sees exactly what would be
 * shared and only then sends it back. The signature stops anyone from submitting made-up transcripts.
 *
 * Enabled when TRAINING_SIGNING_SECRET and a Redis REST store (Upstash / Vercel KV) are configured.
 */

type Msg = OpenAI.Chat.Completions.ChatCompletionMessageParam;
type Tool = OpenAI.Chat.Completions.ChatCompletionTool;

const env = (...names: string[]) => names.map((n) => process.env[n]?.trim()).find(Boolean);
const SECRET = env("TRAINING_SIGNING_SECRET");
const STORE_URL = env("UPSTASH_REDIS_REST_URL", "KV_REST_API_URL");
const STORE_TOKEN = env("UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_TOKEN");
const ADMIN_TOKEN = env("TRAINING_ADMIN_TOKEN");

export const trainingEnabled = () => Boolean(SECRET && SECRET.length >= 32 && STORE_URL && STORE_TOKEN);

/** Drafts expire so a stale browser tab can't submit days later. */
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
/** Keeps a single example well under the store's request limit. */
const MAX_DRAFT_BYTES = 350_000;
const MAX_TOOL_RESULT = 6_000;

// ---------- anonymization ----------

const SCRUBBERS: [RegExp, string][] = [
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "[EMAIL]"],
  [/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[IP]"],
  [/\b(?:[0-9a-f]{1,4}:){4,7}[0-9a-f]{1,4}\b/gi, "[IP]"],
  // Crypto addresses: EVM, Bitcoin, Zcash (t-, z-, unified), Solana-length base58.
  [/\b0x[0-9a-fA-F]{40}\b/g, "[ADDRESS]"],
  [/\b(?:bc1|tb1|ltc1)[0-9a-z]{20,90}\b/gi, "[ADDRESS]"],
  [/\b(?:t1|t3|zs1|u1|tex1)[0-9a-zA-Z]{20,}\b/g, "[ADDRESS]"],
  [/\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g, "[ADDRESS]"],
  [/(^|\s)@[A-Za-z0-9_.]{2,30}\b/g, "$1[HANDLE]"],
];

/** Query strings and fragments often carry IDs and tracking tokens; keep scheme, host and path only. */
const stripUrlParams = (s: string) => s.replace(/(https?:\/\/[^\s?#)\]"']+)[?#][^\s)\]"']*/g, "$1");

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Values typed into `personal` fields, plus their comma/line-separated parts, longest first. */
function personalValues(agent: AgentDef, values: Record<string, string>): string[] {
  const out = new Set<string>();
  for (const f of agent.fields) {
    if (!f.personal) continue;
    const v = values[f.name]?.trim();
    if (!v) continue;
    out.add(v);
    for (const part of v.split(/[,;\n]+/)) {
      const p = part.trim().replace(/^@/, "");
      if (p.length >= 3) out.add(p);
    }
  }
  return [...out].sort((a, b) => b.length - a.length);
}

export function anonymizer(agent: AgentDef, values: Record<string, string>) {
  const personal = personalValues(agent, values).map((v) => new RegExp(escapeRe(v), "gi"));
  return (text: string) => {
    let out = text;
    for (const re of personal) out = out.replace(re, "[REDACTED]");
    out = stripUrlParams(out);
    for (const [re, rep] of SCRUBBERS) out = out.replace(re, rep);
    // Phone numbers: 9+ digits with separators, but not ISO dates or plain years/amounts.
    out = out.replace(/\+?\d[\d\s().-]{7,}\d/g, (m) =>
      (m.match(/\d/g)?.length ?? 0) >= 9 && !/^\d{4}-\d{2}-\d{2}/.test(m.trim()) ? "[PHONE]" : m,
    );
    return out;
  };
}

// ---------- drafts ----------

export type TrainingDraft = {
  v: 1;
  agentId: string;
  locale: string;
  createdAt: number;
  /** Plan generation: system + plan request → the approved plan JSON. */
  plan: { messages: Msg[] };
  /** Report generation, including searches and their results. */
  run: { messages: Msg[]; tools: Tool[] };
};

function clean(messages: Msg[], scrub: (s: string) => string): Msg[] {
  return messages.map((m) => {
    if (m.role === "tool") {
      const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
      return { ...m, content: scrub(content).slice(0, MAX_TOOL_RESULT) };
    }
    if (m.role === "assistant") {
      return {
        ...m,
        content: typeof m.content === "string" ? scrub(m.content) : m.content,
        ...(m.tool_calls
          ? {
              tool_calls: m.tool_calls.map((c) =>
                c.type === "function" ? { ...c, function: { ...c.function, arguments: scrub(c.function.arguments) } } : c,
              ),
            }
          : {}),
      };
    }
    return { ...m, content: typeof m.content === "string" ? scrub(m.content) : m.content } as Msg;
  });
}

/** Builds the signed, anonymized draft for a finished run, or null when it can't or mustn't be offered. */
export function buildDraft(args: {
  agent: AgentDef;
  values: Record<string, string>;
  locale: string;
  planMessages: Msg[];
  planJson: string;
  runMessages: Msg[];
  report: string;
  tools: Tool[];
}): { draft: string; sig: string } | null {
  if (!trainingEnabled() || !args.report.trim()) return null;
  // Second line of defence: the run route never offers runs that used the saved agent-memory
  // profile, and a draft must never carry one, so refuse any prompt that contains its block.
  if ([...args.planMessages, ...args.runMessages].some((m) => typeof m.content === "string" && m.content.includes("<user_profile>"))) return null;
  const scrub = anonymizer(args.agent, args.values);
  const draft: TrainingDraft = {
    v: 1,
    agentId: args.agent.id,
    locale: args.locale,
    createdAt: Date.now(),
    plan: { messages: clean([...args.planMessages, { role: "assistant", content: args.planJson }], scrub) },
    run: { messages: clean([...args.runMessages, { role: "assistant", content: args.report }], scrub), tools: args.tools },
  };
  const json = JSON.stringify(draft);
  if (Buffer.byteLength(json) > MAX_DRAFT_BYTES) return null;
  return { draft: json, sig: sign(json) };
}

const sign = (json: string) => createHmac("sha256", SECRET!).update(json).digest("base64url");

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Checks the signature and freshness of a draft sent back by the browser. */
export function verifyDraft(json: unknown, sig: unknown): TrainingDraft | null {
  if (!trainingEnabled() || typeof json !== "string" || typeof sig !== "string") return null;
  if (Buffer.byteLength(json) > MAX_DRAFT_BYTES || !safeEqual(sign(json), sig)) return null;
  try {
    const d = JSON.parse(json) as TrainingDraft;
    if (d.v !== 1 || !getAgent(d.agentId)?.trainable || Date.now() - d.createdAt > DRAFT_TTL_MS) return null;
    return d;
  } catch {
    return null;
  }
}

// ---------- store (Redis over REST: Upstash or Vercel KV) ----------

async function redis<T = unknown>(commands: (string | number)[][]): Promise<T[]> {
  const res = await fetch(`${STORE_URL}/pipeline`, {
    method: "POST",
    headers: { authorization: `Bearer ${STORE_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(commands),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Store error ${res.status}`);
  const out = (await res.json()) as { result?: T; error?: string }[];
  const failed = out.find((r) => r.error);
  if (failed) throw new Error(`Store error: ${failed.error}`);
  return out.map((r) => r.result as T);
}

const hashOf = (s: string) => createHash("sha256").update(s).digest("hex");
const KEY = (id: string) => `zcan:train:ex:${id}`;
const INDEX = "zcan:train:index";

export type Rating = "up" | "down" | null;

/** Stores a verified draft. Returns an id and a withdrawal token (only its hash is kept server-side). */
export async function saveContribution(json: string, draft: TrainingDraft, rating: Rating) {
  const dedupe = `zcan:train:hash:${hashOf(json)}`;
  const [isNew] = await redis<number>([["SETNX", dedupe, 1]]);
  if (!isNew) return { duplicate: true as const };
  const id = randomBytes(9).toString("base64url");
  const token = randomBytes(18).toString("base64url");
  const record = { id, tokenHash: hashOf(token), savedAt: Date.now(), rating, agentId: draft.agentId, locale: draft.locale, draft };
  await redis([
    ["SET", KEY(id), JSON.stringify(record)],
    ["LPUSH", INDEX, id],
    ["SET", `zcan:train:dedupe-of:${id}`, dedupe],
  ]);
  return { id, token };
}

/** Withdraws a contribution. Only the holder of the token (the browser that shared it) can do this. */
export async function deleteContribution(id: string, token: string): Promise<boolean> {
  if (!/^[\w-]{6,40}$/.test(id) || !token) return false;
  const [raw] = await redis<string | null>([["GET", KEY(id)]]);
  if (!raw) return true; // already gone
  const rec = JSON.parse(raw) as { tokenHash: string };
  if (!safeEqual(rec.tokenHash, hashOf(token))) return false;
  const [dedupe] = await redis<string | null>([["GET", `zcan:train:dedupe-of:${id}`]]);
  await redis([["DEL", KEY(id)], ["LREM", INDEX, 0, id], ["DEL", `zcan:train:dedupe-of:${id}`], ...(dedupe ? [["DEL", dedupe]] : [])]);
  return true;
}

export function adminAuthorized(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!ADMIN_TOKEN || ADMIN_TOKEN.length < 24 || !given) return false;
  // Compare fixed-length digests so the check takes the same time whatever the token's length.
  return timingSafeEqual(createHash("sha256").update(given).digest(), createHash("sha256").update(ADMIN_TOKEN).digest());
}

export type ContributionStats = {
  total: number;
  byAgent: Record<string, number>;
  byLocale: Record<string, number>;
  byRating: { up: number; down: number; none: number };
  /** ISO dates of the oldest and newest share, or null when there are none. */
  oldest: string | null;
  newest: string | null;
};

/**
 * Counts only — no contribution content. Reads just the first bytes of each record, where
 * saveContribution writes the metadata (id, tokenHash, savedAt, rating, agentId, locale) before the draft.
 */
export async function contributionStats(): Promise<ContributionStats> {
  const [ids] = await redis<string[]>([["LRANGE", INDEX, 0, -1]]);
  const list = ids ?? [];
  const stats: ContributionStats = { total: 0, byAgent: {}, byLocale: {}, byRating: { up: 0, down: 0, none: 0 }, oldest: null, newest: null };
  let oldest = Infinity;
  let newest = -Infinity;
  const bump = (m: Record<string, number>, k: string) => (m[k] = (m[k] ?? 0) + 1);
  for (let i = 0; i < list.length; i += 200) {
    const heads = await redis<string | null>(list.slice(i, i + 200).map((id) => ["GETRANGE", KEY(id), 0, 511]));
    for (const head of heads) {
      if (!head) continue; // withdrawn since the index was read
      stats.total += 1;
      bump(stats.byAgent, /"agentId":"([\w-]{1,60})"/.exec(head)?.[1] ?? "unknown");
      bump(stats.byLocale, /"locale":"([\w-]{1,12})"/.exec(head)?.[1] ?? "unknown");
      const rating = /"rating":(?:"(up|down)"|null)/.exec(head);
      stats.byRating[rating?.[1] === "up" ? "up" : rating?.[1] === "down" ? "down" : "none"] += 1;
      const saved = Number(/"savedAt":(\d{10,16})/.exec(head)?.[1]);
      if (Number.isFinite(saved)) {
        oldest = Math.min(oldest, saved);
        newest = Math.max(newest, saved);
      }
    }
  }
  if (Number.isFinite(oldest)) stats.oldest = new Date(oldest).toISOString();
  if (Number.isFinite(newest)) stats.newest = new Date(newest).toISOString();
  return stats;
}

/** Every stored contribution, newest first, in batches to keep requests small. */
export async function* allContributions() {
  const [ids] = await redis<string[]>([["LRANGE", INDEX, 0, -1]]);
  for (let i = 0; i < (ids ?? []).length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const rows = await redis<string | null>(batch.map((id) => ["GET", KEY(id)]));
    for (const raw of rows) {
      if (!raw) continue;
      yield JSON.parse(raw) as { id: string; savedAt: number; rating: Rating; agentId: string; locale: string; draft: TrainingDraft };
    }
  }
}
