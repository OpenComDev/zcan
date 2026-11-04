/** Client-safe token helpers shared by the API routes and the UI. */

export type Token = {
  id: string;
  /** Other 1Click asset ids for the same asset. */
  aliases: string[];
  symbol: string;
  chain: string;
  chainName: string;
  decimals: number;
  price: number;
  contract?: string;
};

export const findToken = (tokens: Token[], assetId: string) => tokens.find((t) => t.id === assetId || t.aliases.includes(assetId));

/** Native ZEC on the Zcash chain — one side of every Zcan swap. */
export const isZec = (t: Pick<Token, "symbol" | "chain"> | undefined | null) => t?.symbol === "ZEC" && t.chain === "zec";

export const CHAIN_NAMES: Record<string, string> = {
  adi: "ADI",
  aleo: "Aleo",
  aptos: "Aptos",
  arb: "Arbitrum",
  avax: "Avalanche",
  base: "Base",
  bch: "Bitcoin Cash",
  bera: "Berachain",
  bsc: "BNB Chain",
  btc: "Bitcoin",
  cardano: "Cardano",
  dash: "Dash",
  doge: "Dogecoin",
  eth: "Ethereum",
  fogo: "Fogo",
  gnosis: "Gnosis",
  hlevm: "HyperEVM",
  hood: "Robinhood Chain",
  hypercore: "Hypercore",
  ltc: "Litecoin",
  monad: "Monad",
  movement: "Movement",
  near: "NEAR",
  op: "Optimism",
  plasma: "Plasma",
  pol: "Polygon",
  scroll: "Scroll",
  sol: "Solana",
  starknet: "Starknet",
  stellar: "Stellar",
  sui: "Sui",
  ton: "TON",
  tron: "Tron",
  xlayer: "X Layer",
  xrp: "XRP Ledger",
  zec: "Zcash",
};

export const chainName = (chain: string) => CHAIN_NAMES[chain] ?? chain.toUpperCase();

/** Shown first in the picker, in this order. `symbol:chain`. */
export const POPULAR = [
  "BTC:btc",
  "ETH:eth",
  "USDT:eth",
  "USDC:eth",
  "SOL:sol",
  "USDT:tron",
  "USDC:sol",
  "BNB:bsc",
  "XRP:xrp",
  "DOGE:doge",
  "LTC:ltc",
  "TRX:tron",
  "NEAR:near",
  "TON:ton",
  "ADA:cardano",
  "SUI:sui",
  "DASH:dash",
  "BCH:bch",
  "AVAX:avax",
  "ETH:base",
  "ETH:arb",
  "USDC:base",
];

/** Chains with slow finality get a longer refund deadline. */
export const SLOW_CHAINS = new Set(["btc", "zec", "ltc", "doge", "bch", "dash", "cardano"]);

/** Address placeholder hints, keyed by chain. */
export function addressHint(chain: string): string {
  switch (chain) {
    case "zec":
      return "u1… or t1…";
    case "btc":
      return "bc1… or 1…";
    case "sol":
      return "Solana address";
    case "near":
      return "name.near";
    case "tron":
      return "T…";
    case "xrp":
      return "r…";
    case "doge":
      return "D…";
    case "ltc":
      return "ltc1… or L…";
    case "ton":
      return "UQ… or EQ…";
    case "bch":
      return "bitcoincash:q…";
    case "dash":
      return "X…";
    case "stellar":
      return "G…";
    case "cardano":
      return "addr1…";
    case "sui":
    case "aptos":
    case "movement":
      return "0x…";
    default:
      return "0x…";
  }
}

/** Convert a decimal string ("0.015") to integer base units ("1500000"). Returns null if invalid. */
export function toBaseUnits(value: string, decimals: number): string | null {
  const v = value.trim().replace(/,/g, ".");
  if (!/^\d*\.?\d*$/.test(v) || v === "" || v === ".") return null;
  const [whole = "0", frac = ""] = v.split(".");
  const units = BigInt(whole || "0") * BigInt(10) ** BigInt(decimals) + BigInt((frac.slice(0, decimals) || "0").padEnd(decimals, "0"));
  return units.toString();
}

/** Convert integer base units to a trimmed decimal string. */
export function fromBaseUnits(units: string, decimals: number): string {
  const n = BigInt(units);
  const base = BigInt(10) ** BigInt(decimals);
  const whole = n / base;
  const frac = (n % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
export const formatUsd = (n: number) => (Number.isFinite(n) ? usd.format(n) : "—");

/** Human amount with sensible significant digits for crypto. */
export function formatAmount(n: number | string, maxSig = 8): string {
  const x = typeof n === "string" ? Number(n) : n;
  if (!Number.isFinite(x)) return "—";
  if (x === 0) return "0";
  const abs = Math.abs(x);
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 4 : maxSig;
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: abs >= 1 ? digits : undefined,
    maximumSignificantDigits: abs < 1 ? digits : undefined,
  }).format(x);
}

/** Plain decimal string for an input field (no grouping separators). */
export function toInputString(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "";
  const abs = Math.abs(n);
  const s = abs >= 1 ? n.toFixed(6) : n.toPrecision(6);
  return String(Number(s));
}
