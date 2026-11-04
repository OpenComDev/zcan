import { cacheLife } from "next/cache";
import { connection } from "next/server";
import { scheduledSupply, type NetworkStats, type RecentBlock } from "@/lib/zcash-network";

/*
 * Live Zcash network stats from two free, keyless public sources:
 * - Blockchair: 24 h aggregates, mempool, hashrate and the latest blocks.
 * - zcashexplorer.app: a full node's getblockchaininfo (height, difficulty, value pools, supply).
 * Each source is cached on its own, and every field degrades to null if its source is down.
 * No free source reports correct fees for shielded transactions (Blockchair's fee fields count
 * shielded value), so the dashboard shows the protocol's ZIP-317 fee instead of an "average".
 * Blockchair's free tier is rate limited, so it's refreshed every 2 minutes; set BLOCKCHAIR_KEY to lift that.
 */

const BLOCKCHAIR = "https://api.blockchair.com/zcash";
const EXPLORER = "https://mainnet.zcashexplorer.app/api/v1/blockchain-info";
const UA = { "user-agent": "Zcan/1.0 (+network stats)", accept: "application/json" };

const withKey = (url: string) => {
  const key = process.env.BLOCKCHAIR_KEY;
  return key ? `${url}${url.includes("?") ? "&" : "?"}key=${encodeURIComponent(key)}` : url;
};

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

/** Blockchair times are UTC without a zone ("2026-10-14 23:37:29"). */
const utc = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const d = new Date(`${v.replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`${new URL(url).host} ${r.status}`);
  return (await r.json()) as T;
}

type ChairStats = Record<string, unknown>;
type ChairBlock = { id: number; time: string; transaction_count: number; size: number; difficulty: number };
type NodeInfo = {
  blocks?: number;
  difficulty?: number;
  chainSupply?: { chainValue?: number };
  valuePools?: { id: string; chainValue?: number; monitored?: boolean }[];
};

async function chairStats() {
  "use cache";
  cacheLife({ stale: 60, revalidate: 120, expire: 900 });
  const { data } = await getJson<{ data: ChairStats }>(withKey(`${BLOCKCHAIR}/stats`));
  return { data, at: new Date().toISOString() };
}

async function chairBlocks() {
  "use cache";
  cacheLife({ stale: 60, revalidate: 120, expire: 900 });
  const { data } = await getJson<{ data: ChairBlock[] }>(withKey(`${BLOCKCHAIR}/blocks?limit=12`));
  return { data, at: new Date().toISOString() };
}

async function nodeInfo() {
  "use cache";
  cacheLife({ stale: 30, revalidate: 60, expire: 600 });
  const data = await getJson<NodeInfo>(EXPLORER);
  return { data, at: new Date().toISOString() };
}

async function collect(): Promise<NetworkStats> {
  const [statsR, blocksR, nodeR] = await Promise.allSettled([chairStats(), chairBlocks(), nodeInfo()]);
  const stats = statsR.status === "fulfilled" ? statsR.value.data : null;
  const blocks = blocksR.status === "fulfilled" ? blocksR.value.data : null;
  const node = nodeR.status === "fulfilled" ? nodeR.value.data : null;

  const recent: RecentBlock[] = (blocks ?? [])
    .map((b) => ({ height: b.id, time: utc(b.time) ?? "", txs: b.transaction_count, size: b.size, difficulty: num(b.difficulty) }))
    .filter((b) => b.time)
    .sort((a, b) => b.height - a.height);

  const heights = [num(node?.blocks), num(stats?.best_block_height), recent[0]?.height ?? null].filter((h): h is number => h != null);
  const height = heights.length ? Math.max(...heights) : null;

  const times = [utc(stats?.best_block_time), recent[0]?.time ?? null].filter((t): t is string => Boolean(t)).sort();
  const lastBlockTime = times.at(-1) ?? null;

  const pools =
    node?.valuePools
      ?.filter((p) => p.monitored !== false && num(p.chainValue) != null)
      .map((p) => ({ id: p.id, zec: p.chainValue as number })) ?? null;

  const nodeSupply = num(node?.chainSupply?.chainValue);
  const supply = nodeSupply ?? (height != null ? scheduledSupply(height) : null);

  const updated = [statsR, blocksR, nodeR].flatMap((r) => (r.status === "fulfilled" ? [r.value.at] : [])).sort();

  return {
    updatedAt: updated.at(-1) ?? new Date().toISOString(),
    height,
    lastBlockTime,
    difficulty: num(node?.difficulty) ?? num(stats?.difficulty),
    hashrate: num(stats?.hashrate_24h),
    mempoolTx: num(stats?.mempool_transactions),
    mempoolBytes: num(stats?.mempool_size),
    tx24h: num(stats?.transactions_24h),
    blocks24h: num(stats?.blocks_24h),
    supply: supply != null && Number.isFinite(supply) ? supply : null,
    supplyFrom: nodeSupply != null ? "node" : supply != null && Number.isFinite(supply) ? "schedule" : null,
    pools: pools && pools.length ? pools : null,
    recent,
    sources: [
      { name: "Blockchair", href: "https://blockchair.com/zcash", ok: statsR.status === "fulfilled" || blocksR.status === "fulfilled" },
      { name: "zcashexplorer.app", href: "https://mainnet.zcashexplorer.app", ok: nodeR.status === "fulfilled" },
    ],
  };
}

/** Live Zcash network stats. Fields are null when their source is unavailable. */
export async function GET() {
  await connection();
  const stats = await collect();
  if (stats.height == null && !stats.pools) {
    return Response.json({ message: "Zcash network data is unavailable right now." }, { status: 502 });
  }
  return Response.json(stats, { headers: { "cache-control": "public, max-age=30, stale-while-revalidate=120" } });
}
