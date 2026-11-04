import { checkAddress } from "@/lib/address-check";

/**
 * Whether the swap route (NEAR Intents 1Click) accepts unified addresses (u1…) as the ZEC
 * recipient / refund address.
 *
 * Evidence (dry quotes against https://1click.chaindefuser.com/v0/quote, Oct 2026, ZIP-316 test-vector
 * addresses): u1 with Orchard+Sapling+P2PKH, Orchard+Sapling and Orchard-only receivers, t1 and tex1 all
 * pass recipient validation; Sapling-only zs1 is rejected with "recipient is not valid" (as are corrupted
 * checksums). Flip to false if real payouts to u1 turn out not to work — u1 is then treated like zs1.
 */
export const UNIFIED_PAYOUT = true;

/**
 * - shielded: unified address with only shielded receivers — paid straight into the shielded balance.
 * - unified-mixed: unified address that also carries a transparent receiver.
 * - transparent: t1/t3 (or a transparent-only unified address).
 * - tex: TEX address — transparent, and only accepts funds from transparent addresses.
 * - unsupported: a valid Zcash address the swap route rejects (zs1, or u1 when UNIFIED_PAYOUT is off).
 * - invalid: looks like Zcash but the checksum fails.
 * - other: not a Zcash address at all (the server reports the error).
 */
export type PayoutKind = "shielded" | "unified-mixed" | "transparent" | "tex" | "unsupported" | "invalid" | "other";

/** Local, offline classification of a ZEC payout address. Null for an empty field. */
export function zecPayoutKind(raw: string): PayoutKind | null {
  const s = raw.trim();
  if (!s) return null;
  const info = checkAddress(s);
  if (!info || info.chainId !== "zcash") return "other";
  if (info.checksum !== "valid") return "invalid";
  switch (info.typeId) {
    case "t-p2pkh":
    case "t-p2sh":
      return "transparent";
    case "tex":
      return "tex";
    case "sapling":
      return "unsupported";
    case "unified": {
      if (!UNIFIED_PAYOUT) return "unsupported";
      const codes = info.receiverCodes ?? [];
      const shielded = codes.some((c) => c === 2 || c === 3);
      const transparent = codes.some((c) => c === 0 || c === 1);
      if (!shielded) return "transparent";
      return transparent ? "unified-mixed" : "shielded";
    }
    default:
      return "other";
  }
}

/** The payout leaves the ZEC publicly visible until it's shielded. */
export const isTransparentPayout = (k: PayoutKind | null) => k === "transparent" || k === "tex";
