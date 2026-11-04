/**
 * Zcash network facts and pure helpers shared by /api/network and the /network dashboard.
 *
 * Emission constants come from the Zcash protocol spec and ZIP 208 (Blossom):
 * - Blossom activated at height 653,600 and halved the block target spacing to 75 s.
 * - PostBlossomHalvingInterval = floor(840,000 × 150 / 75) = 1,680,000 blocks (~4 years).
 * - Halvings happened at 1,046,400 (Nov 2020) and 2,726,400 (Nov 2024); the next is 4,406,400.
 */

export const TARGET_SPACING_S = 75;
/** ZIP-317 conventional fee: 5,000 zats per logical action, minimum 2 actions → 0.0001 ZEC. */
export const ZIP317_MIN_FEE = 0.0001;
export const BLOSSOM_HEIGHT = 653_600;
export const FIRST_HALVING = 1_046_400;
export const HALVING_INTERVAL = 1_680_000;
const SLOW_START = 20_000;
const MAX_SUBSIDY = 12.5;

export type PoolId = "transparent" | "sprout" | "sapling" | "orchard" | "lockbox" | (string & {});

export type RecentBlock = { height: number; time: string; txs: number; size: number; difficulty: number | null };

export type NetworkStats = {
  /** ISO time the newest source answered. */
  updatedAt: string;
  height: number | null;
  /** ISO time of the newest block. */
  lastBlockTime: string | null;
  difficulty: number | null;
  /** 24 h average, in Sol/s. */
  hashrate: number | null;
  mempoolTx: number | null;
  mempoolBytes: number | null;
  tx24h: number | null;
  blocks24h: number | null;
  supply: number | null;
  supplyFrom: "node" | "schedule" | null;
  /** Value pools as reported by a full node (ZEC). */
  pools: { id: PoolId; zec: number }[] | null;
  recent: RecentBlock[];
  sources: { name: string; href: string; ok: boolean }[];
};

/** Index of the current halving era (0 before the first halving). Valid for heights after Blossom. */
export function halvingEra(height: number): number {
  return height < FIRST_HALVING ? 0 : 1 + Math.floor((height - FIRST_HALVING) / HALVING_INTERVAL);
}

/** First block of the next halving era. */
export function nextHalvingHeight(height: number): number {
  return FIRST_HALVING + halvingEra(height) * HALVING_INTERVAL;
}

/** Total block subsidy (miner + funding streams) at a post-Blossom height, in ZEC. */
export function blockSubsidy(height: number): number {
  return MAX_SUBSIDY / (2 * 2 ** halvingEra(height));
}

/**
 * ZEC issued up to and including `height`, from the emission schedule. Within a few hundred ZEC
 * of what full nodes report (they also account for unclaimed rewards). Used only as a fallback.
 */
export function scheduledSupply(height: number): number {
  if (height < BLOSSOM_HEIGHT) return NaN;
  let total = (MAX_SUBSIDY * SLOW_START) / 2; // slow-start ramp: 125,000 ZEC
  total += (BLOSSOM_HEIGHT - SLOW_START) * MAX_SUBSIDY;
  let from = BLOSSOM_HEIGHT;
  let era = 0;
  let boundary = FIRST_HALVING;
  while (from <= height) {
    const to = Math.min(height + 1, boundary);
    total += (to - from) * (MAX_SUBSIDY / (2 * 2 ** era));
    from = to;
    era += 1;
    boundary += HALVING_INTERVAL;
  }
  return total;
}

export const POOL_META: Record<string, { label: string; color: string; shielded: boolean; note: string }> = {
  transparent: { label: "Transparent", color: "var(--subtle)", shielded: false, note: "Public t-addresses" },
  sprout: { label: "Sprout", color: "var(--info)", shielded: true, note: "Original 2016 pool, deprecated" },
  sapling: { label: "Sapling", color: "var(--green)", shielded: true, note: "2018 shielded pool" },
  orchard: { label: "Orchard", color: "var(--accent)", shielded: true, note: "Halo 2, no trusted setup" },
  ironwood: { label: "Ironwood", color: "var(--warn)", shielded: true, note: "Newest shielded pool (NU6.3)" },
  lockbox: { label: "Lockbox", color: "var(--muted)", shielded: false, note: "Protocol-held dev fund reserve" },
};

export function poolMeta(id: string) {
  return POOL_META[id] ?? { label: id.charAt(0).toUpperCase() + id.slice(1), color: "#a78bfa", shielded: false, note: "Reported by the node" };
}

const nf = (opts: Intl.NumberFormatOptions) => new Intl.NumberFormat("en-US", opts);
const int = nf({ maximumFractionDigits: 0 });
const compact = nf({ notation: "compact", maximumFractionDigits: 2 });

export const fmtInt = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "—" : int.format(n));
export const fmtCompact = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "—" : compact.format(n));

/** "29.8 GSol/s" */
export function fmtHashrate(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const units = ["Sol/s", "KSol/s", "MSol/s", "GSol/s", "TSol/s"];
  let i = 0;
  let v = n;
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000;
    i += 1;
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}

/** "12 s", "4 min", "2 h" */
export function fmtAgo(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 90) return `${s} s`;
  if (s < 90 * 60) return `${Math.round(s / 60)} min`;
  return `${Math.round(s / 3600)} h`;
}
