/**
 * Which deposits can be paid straight from a browser wallet, and how.
 * Deliberately dependency-free: this file is imported by the order and batch pages,
 * while the heavy wallet code (AppKit, wagmi, viem, @solana/web3.js) loads lazily.
 */

/** Reown project ID. Without it, "Pay with wallet" isn't offered at all. */
export const REOWN_PROJECT_ID = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID ?? "";

export type EvmChainKey = "eth" | "base" | "arb" | "op" | "pol" | "bsc" | "avax";

/** 1Click chain key → EVM chain. */
export const EVM_CHAINS: Record<EvmChainKey, { chainId: number; name: string; explorer: string }> = {
  eth: { chainId: 1, name: "Ethereum", explorer: "https://etherscan.io" },
  base: { chainId: 8453, name: "Base", explorer: "https://basescan.org" },
  arb: { chainId: 42161, name: "Arbitrum", explorer: "https://arbiscan.io" },
  op: { chainId: 10, name: "Optimism", explorer: "https://optimistic.etherscan.io" },
  pol: { chainId: 137, name: "Polygon", explorer: "https://polygonscan.com" },
  bsc: { chainId: 56, name: "BNB Chain", explorer: "https://bscscan.com" },
  avax: { chainId: 43114, name: "Avalanche", explorer: "https://snowtrace.io" },
};

const SOLANA_EXPLORER = "https://solscan.io";

/** The asset fields this module needs (a subset of `Token` from lib/tokens). */
export type PayAsset = {
  id: string;
  aliases?: string[];
  symbol: string;
  chain: string;
  decimals: number;
  contract?: string;
};

export type WalletTarget =
  | { kind: "evm"; chain: EvmChainKey; chainId: number; chainName: string; token?: `0x${string}` }
  | { kind: "solana"; chainName: "Solana"; mint?: string };

const isEvmChain = (c: string): c is EvmChainKey => c in EVM_CHAINS;
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const SOL_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** True when a 1Click asset id is the chain's native coin (ETH, BNB, POL, AVAX, SOL…). */
function isNativeId(assetId: string, chain: string): boolean {
  if (assetId === `nep141:${chain}.omft.near`) return true;
  const chainId = isEvmChain(chain) ? EVM_CHAINS[chain].chainId : null;
  return chainId !== null && assetId === `nep245:v2_1.omni.hot.tg:${chainId}_11111111111111111111`;
}

/** Contract address embedded in some 1Click ids (`nep141:base-0x….omft.near`, `1cs_v1:sol:spl:<mint>`). */
function contractFromId(assetId: string, chain: string): string | undefined {
  const bridged = /^nep141:([a-z]+)-(0x[0-9a-fA-F]{40})\.(?:omft|omdep)\.near$/.exec(assetId);
  if (bridged && bridged[1] === chain) return bridged[2];
  const v1 = /^1cs_v1:([a-z]+):[a-z0-9]+:(.+)$/.exec(assetId);
  if (v1 && v1[1] === chain) return v1[2];
  return undefined;
}

/**
 * How to pay `assetId` from a wallet, or null when it can't be done safely
 * (unsupported chain, unknown token, ambiguous contract).
 */
export function walletTarget(asset: PayAsset, assetId: string): WalletTarget | null {
  const primary = asset.id === assetId;
  if (!primary && !asset.aliases?.includes(assetId)) return null;

  let contract: string | undefined;
  if (isNativeId(assetId, asset.chain)) {
    // Native coin — but never if the token list says otherwise.
    if (primary && asset.contract) return null;
  } else {
    // A token: the contract must be known, and for an alias id it must agree with the list.
    const fromId = contractFromId(assetId, asset.chain);
    contract = primary ? asset.contract : fromId;
    if (!contract) return null;
    if (fromId && fromId.toLowerCase() !== contract.toLowerCase()) return null;
  }

  if (asset.chain === "sol") {
    if (contract && !SOL_ADDRESS.test(contract)) return null;
    return { kind: "solana", chainName: "Solana", mint: contract };
  }
  if (isEvmChain(asset.chain)) {
    if (contract && !EVM_ADDRESS.test(contract)) return null;
    const c = EVM_CHAINS[asset.chain];
    return { kind: "evm", chain: asset.chain, chainId: c.chainId, chainName: c.name, token: contract as `0x${string}` | undefined };
  }
  return null;
}

/** Explorer link for a transaction on the target chain. */
export function txUrl(target: WalletTarget, hash: string): string {
  const base = target.kind === "solana" ? SOLANA_EXPLORER : EVM_CHAINS[target.chain].explorer;
  return `${base}/tx/${hash}`;
}

/**
 * Exact base units for a decimal amount string, or null if it can't be represented
 * without rounding (more fraction digits than the asset has) or isn't positive.
 */
export function exactBaseUnits(amount: string, decimals: number): string | null {
  const v = amount.trim();
  const m = /^(\d+)(?:\.(\d+))?$/.exec(v);
  if (!m) return null;
  const frac = (m[2] ?? "").replace(/0+$/, "");
  if (frac.length > decimals) return null;
  const units = BigInt(m[1]) * BigInt(10) ** BigInt(decimals) + BigInt(frac.padEnd(decimals, "0") || "0");
  return units > BigInt(0) ? units.toString() : null;
}

/** Whole-number base-unit string check (quote.amountIn). */
export const isBaseUnits = (s: string) => /^\d+$/.test(s) && BigInt(s) > BigInt(0);

export const shortAddress = (a: string) => (a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);
