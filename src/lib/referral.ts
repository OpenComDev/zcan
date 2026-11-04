/**
 * Referrals without accounts. A referral link (?ref=<NEAR Intents account>) is remembered only in the
 * visitor's browser. When Zcan charges a swap fee (ZCAN_FEE_BPS), quotes for that visitor split it:
 * the visitor pays less, and part of the fee goes straight to the referrer's NEAR Intents account through
 * 1Click's appFees — paid on-chain by the protocol on each swap, visible to the referrer, never recorded
 * by Zcan. Pure, shared by the browser and the quote route.
 */

/** NEAR account ids: named (alice.near, sub.alice.near) or implicit (64 hex). 2–64 characters, lowercase. */
const NAMED = /^(?=.{2,64}$)(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;
const IMPLICIT = /^[0-9a-f]{64}$/;

export function isIntentsAccount(v: unknown): v is string {
  return typeof v === "string" && (IMPLICIT.test(v) || (NAMED.test(v) && v.includes(".")));
}

export const REF_KEY = "zcan:ref:v1";
/** A referral counts for swaps within this many days of first opening the link. */
export const REF_DAYS = 30;

export type Fee = { recipient: string; fee: number };

export type ReferralTerms = {
  /** Share of Zcan's fee the visitor no longer pays (0–1). */
  discount: number;
  /** Share of Zcan's fee paid to the referrer (0–1). */
  share: number;
};

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/** Terms from env-style strings, with defaults of 20% off for the visitor and 20% to the referrer. */
export function referralTerms(discount?: string, share?: string): ReferralTerms {
  const d = clamp01(discount ? Number(discount) : 0.2);
  const s = clamp01(share ? Number(share) : 0.2);
  // Never more than the whole fee between them.
  return d + s > 1 ? { discount: d, share: Math.max(0, 1 - d) } : { discount: d, share: s };
}

/**
 * Splits Zcan's app fee for a referred swap. `zcan` is Zcan's own fee (recipient + basis points).
 * Returns the appFees to send: Zcan's reduced share, plus the referrer's. Whole basis points only;
 * rounding always favours the visitor. Without a valid, different referrer, the fee is unchanged.
 */
export function splitFees(zcan: Fee | undefined, referrer: string | undefined, terms: ReferralTerms): Fee[] | undefined {
  if (!zcan) return undefined;
  if (!referrer || !isIntentsAccount(referrer) || referrer === zcan.recipient) return [zcan];
  const total = Math.floor(zcan.fee * (1 - terms.discount));
  const toReferrer = Math.min(total, Math.floor(zcan.fee * terms.share));
  const toZcan = total - toReferrer;
  const out: Fee[] = [];
  if (toZcan > 0) out.push({ recipient: zcan.recipient, fee: toZcan });
  if (toReferrer > 0) out.push({ recipient: referrer, fee: toReferrer });
  return out.length ? out : undefined;
}
