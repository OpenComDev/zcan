/** Helpers for Zcan payment requests: loose ZEC address checks, ZIP-321 URIs and request links. */

import { Fragment, createElement, type ReactNode } from "react";
import { UNIFIED_PAYOUT } from "@/components/shield/zec-payout";

/**
 * Renders translated text with simple inline tags: `rich("Use <b>t1</b> or <link>shield</link>", { b, link })`.
 * Unknown tags are left as plain text.
 */
export function rich(text: string, tags: Record<string, (chunk: string) => ReactNode>): ReactNode {
  const out: ReactNode[] = [];
  const re = /<(\w+)>(.*?)<\/\1>/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const render = tags[m[1]];
    if (!render) continue;
    out.push(text.slice(last, m.index), createElement(Fragment, { key: m.index }, render(m[2])));
    last = m.index + m[0].length;
  }
  out.push(text.slice(last));
  return out;
}

export type ZecAddressKind = "transparent" | "tex" | "sapling" | "unified" | "sprout" | "testnet" | "invalid";

export type ZecAddressInfo = {
  kind: ZecAddressKind;
  /** Human label, e.g. "Unified address". */
  label: string;
  valid: boolean;
  /**
   * Whether a Zcan swap (NEAR Intents 1Click) can pay this address: unified (u1…, recommended — lands shielded
   * unless the wallet routes it to a transparent receiver), transparent (t1/t3) and TEX. Sapling-only zs1… is
   * rejected by 1Click, so payers coming from another coin can't use it.
   */
  swapOk: boolean;
  shielded: boolean;
};

const B58 = "[1-9A-HJ-NP-Za-km-z]";
const B32 = "[02-9ac-hj-np-z]";

/**
 * Loose, prefix-and-charset check — no checksum. Good enough to catch typos and wrong coins;
 * the payer's wallet does the real validation.
 */
export function classifyZecAddress(raw: string): ZecAddressInfo {
  const a = raw.trim();
  const make = (kind: ZecAddressKind, label: string, valid: boolean, swapOk = false, shielded = false): ZecAddressInfo => ({ kind, label, valid, swapOk, shielded });
  if (new RegExp(`^t[13]${B58}{33}$`).test(a)) return make("transparent", "Transparent address", true, true);
  if (new RegExp(`^u1${B32}{100,}$`).test(a)) return make("unified", "Unified address", true, UNIFIED_PAYOUT, true);
  if (new RegExp(`^zs1${B32}{75}$`).test(a)) return make("sapling", "Sapling shielded address", true, false, true);
  if (new RegExp(`^tex1${B32}{38}$`).test(a)) return make("tex", "TEX (transparent-source-only) address", true, true);
  if (/^(tm|t2|utest1|ztestsapling1|textest1)/.test(a)) return make("testnet", "Testnet address", false);
  if (/^zc/.test(a)) return make("sprout", "Sprout address (retired)", false);
  return make("invalid", "Not a Zcash address", false);
}

/** Normalises a ZEC amount: positive, at most 8 decimals, ≤ 21M. Returns null if invalid. */
export function parseZecAmount(raw: string): string | null {
  const v = raw.trim().replace(/,/g, ".");
  if (!/^\d{1,8}(\.\d{1,8})?$/.test(v) && !/^\.\d{1,8}$/.test(v)) return null;
  const n = Number(v);
  if (!(n > 0) || n > 21_000_000) return null;
  // Canonical form: no leading zeros, no trailing fractional zeros.
  const [int, frac = ""] = v.split(".");
  const f = frac.replace(/0+$/, "");
  return `${String(Number(int || "0"))}${f ? `.${f}` : ""}`;
}

/**
 * A request's note comes from the link, so it's untrusted: control characters and bidi overrides
 * (which can visually reorder the text around them) are dropped.
 */
export const cleanLabel = (raw: string) =>
  raw
    .replace(/\s+/g, " ")
    .replace(/[\u0000-\u001f\u007f-\u009f؜‎‏‪-‮⁦-⁩]/g, "")
    .replace(/ {2,}/g, " ")
    .trim()
    .slice(0, 80);

/** ZIP-321 payment URI: zcash:<addr>?amount=<zec>&message=<text>. */
export function zip321(address: string, amount: string, message?: string): string {
  const q = new URLSearchParams({ amount });
  let uri = `zcash:${address}?${q}`;
  // ZIP-321 uses RFC 3986 percent-encoding (spaces as %20, not "+").
  if (message) uri += `&message=${encodeURIComponent(message)}`;
  return uri;
}

export function requestLink(origin: string, r: { to: string; amount: string; label?: string }): string {
  const q = new URLSearchParams({ to: r.to, amount: r.amount });
  if (r.label) q.set("label", r.label);
  return `${origin}/pay/r?${q.toString().replace(/\+/g, "%20")}`;
}

/** Fixed-output swap link into the main swap widget. `from` is an asset key such as "BTC.btc". */
export function swapLink(r: { to: string; amount: string; from?: string }): string {
  const q = new URLSearchParams();
  if (r.from) q.set("from", r.from);
  q.set("to", "ZEC.zec");
  q.set("mode", "fixed");
  q.set("receive", r.amount);
  q.set("recipient", r.to);
  return `/?${q}`;
}

/** Quick picks for payers coming from another coin (asset keys as used by the swap widget). */
export const PAY_WITH: { key: string; label: string; sub: string }[] = [
  { key: "BTC.btc", label: "BTC", sub: "Bitcoin" },
  { key: "ETH.eth", label: "ETH", sub: "Ethereum" },
  { key: "USDC.eth", label: "USDC", sub: "Ethereum" },
  { key: "USDT.tron", label: "USDT", sub: "Tron" },
  { key: "SOL.sol", label: "SOL", sub: "Solana" },
];

export const shortAddr = (a: string) => (a.length > 20 ? `${a.slice(0, 10)}…${a.slice(-8)}` : a);
