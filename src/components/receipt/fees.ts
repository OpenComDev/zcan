import type { QuoteResponse } from "@/lib/oneclick";
import { fromBaseUnits } from "@/lib/tokens";

/** Finite number from a number or numeric string, else null. */
export const num = (v: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** Integer base units ("1500000") to a number, or null. */
export const baseUnits = (v: string | undefined, decimals: number) => {
  if (!v || !/^\d+$/.test(v)) return null;
  try {
    return Number(fromBaseUnits(v, decimals));
  } catch {
    return null;
  }
};

export type QuoteFees = {
  amountIn: number | null;
  amountOut: number | null;
  inUsd: number | null;
  outUsd: number | null;
  /** Units of the output asset per 1 unit of the input asset, as quoted. */
  quotedRate: number | null;
  /** USD value in minus USD value out. */
  cost: number | null;
  costPct: number | null;
  /** Fees added to the quote request (app/affiliate fees), in basis points. */
  feeBps: number;
  feeUsd: number | null;
  /** Payout (withdrawal) fee in output units. */
  withdraw: number | null;
  /** Refund fee in input units. */
  refund: number | null;
  slippageBps: number | null;
};

/** Every number the quote itself states about costs — shared by the swap form's fee breakdown and the receipt. */
export function quoteFees(data: Pick<QuoteResponse, "quote" | "quoteRequest">, fromDecimals: number, toDecimals: number): QuoteFees {
  const q = data.quote;
  const req = data.quoteRequest;
  const amountIn = num(q.amountInFormatted);
  const amountOut = num(q.amountOutFormatted);
  const inUsd = num(q.amountInUsd);
  const outUsd = num(q.amountOutUsd);
  const cost = inUsd != null && outUsd != null ? inUsd - outUsd : null;
  const feeBps = req?.appFees ? req.appFees.reduce((s, f) => s + (num(f.fee) ?? 0), 0) : 0;
  return {
    amountIn,
    amountOut,
    inUsd,
    outUsd,
    quotedRate: amountIn && amountOut ? amountOut / amountIn : null,
    cost,
    costPct: cost != null && inUsd ? cost / inUsd : null,
    feeBps,
    feeUsd: inUsd != null && feeBps > 0 ? (inUsd * feeBps) / 10_000 : null,
    withdraw: baseUnits(q.withdrawFee, toDecimals),
    refund: baseUnits(q.refundFee, fromDecimals),
    slippageBps: num(req?.slippageTolerance),
  };
}
