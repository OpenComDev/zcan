import "server-only";

/**
 * Thin server-side client for the NEAR Intents 1Click API.
 * Docs: https://docs.near-intents.org/near-intents/integration/distribution-channels/1click-api
 */

const BASE_URL = process.env.ONECLICK_BASE_URL ?? "https://1click.chaindefuser.com";

export type RawToken = {
  assetId: string;
  decimals: number;
  blockchain: string;
  symbol: string;
  price: number;
  priceUpdatedAt: string;
  contractAddress?: string;
  coingeckoId?: string;
};

export type SwapType = "EXACT_INPUT" | "EXACT_OUTPUT";

export type QuoteRequest = {
  dry: boolean;
  swapType: SwapType;
  slippageTolerance: number;
  originAsset: string;
  depositType: "ORIGIN_CHAIN";
  destinationAsset: string;
  amount: string;
  refundTo: string;
  refundType: "ORIGIN_CHAIN";
  recipient: string;
  recipientType: "DESTINATION_CHAIN";
  deadline: string;
  referral?: string;
  quoteWaitingTimeMs?: number;
  appFees?: { recipient: string; fee: number }[];
};

export type Quote = {
  depositAddress?: string;
  depositMemo?: string;
  amountIn: string;
  amountInFormatted: string;
  amountInUsd: string;
  minAmountIn: string;
  amountOut: string;
  amountOutFormatted: string;
  amountOutUsd: string;
  minAmountOut: string;
  deadline?: string;
  timeWhenInactive?: string;
  timeEstimate: number;
  refundFee?: string;
  withdrawFee?: string;
};

export type QuoteResponse = {
  correlationId: string;
  timestamp: string;
  signature: string;
  quoteRequest: QuoteRequest;
  quote: Quote;
};

export type ExecutionStatus =
  | "KNOWN_DEPOSIT_TX"
  | "PENDING_DEPOSIT"
  | "INCOMPLETE_DEPOSIT"
  | "PROCESSING"
  | "SUCCESS"
  | "REFUNDED"
  | "FAILED";

export type TxDetails = { hash: string; explorerUrl: string };

export type StatusResponse = {
  correlationId: string;
  quoteResponse: QuoteResponse;
  status: ExecutionStatus;
  updatedAt: string;
  swapDetails: {
    amountInFormatted?: string;
    amountOutFormatted?: string;
    amountOutUsd?: string;
    originChainTxHashes: TxDetails[];
    destinationChainTxHashes: TxDetails[];
    refundedAmountFormatted?: string;
    refundReason?: string;
    depositedAmountFormatted?: string;
  };
};

export class OneClickError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

function headers(): HeadersInit {
  const h: Record<string, string> = { "content-type": "application/json", accept: "application/json" };
  // 1Click's current auth is an API key header; the bearer JWT is the older scheme. Either works if set.
  const apiKey = process.env.ONECLICK_API_KEY?.trim();
  if (apiKey) h["x-api-key"] = apiKey;
  if (process.env.ONECLICK_JWT) h.authorization = `Bearer ${process.env.ONECLICK_JWT}`;
  return h;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: headers(),
    signal: AbortSignal.timeout(20_000),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message = (body && typeof body.message === "string" && body.message) || `1Click request failed (${res.status})`;
    throw new OneClickError(message, res.status);
  }
  return body as T;
}

export function fetchTokens() {
  return call<RawToken[]>("/v0/tokens");
}

export function requestQuote(req: QuoteRequest) {
  return call<QuoteResponse>("/v0/quote", { method: "POST", body: JSON.stringify(req) });
}

export function fetchStatus(depositAddress: string, depositMemo?: string) {
  const qs = new URLSearchParams({ depositAddress });
  if (depositMemo) qs.set("depositMemo", depositMemo);
  return call<StatusResponse>(`/v0/status?${qs}`, { cache: "no-store" });
}

export function submitDepositTx(txHash: string, depositAddress: string, memo?: string) {
  return call<{ status: ExecutionStatus }>("/v0/deposit/submit", {
    method: "POST",
    body: JSON.stringify({ txHash, depositAddress, ...(memo ? { memo } : {}) }),
  });
}

/** Optional Zcan affiliate fee, configured via env. */
export function appFees(): QuoteRequest["appFees"] {
  const recipient = process.env.ZCAN_FEE_RECIPIENT;
  const bps = Number(process.env.ZCAN_FEE_BPS ?? 0);
  if (!recipient || !Number.isFinite(bps) || bps <= 0) return undefined;
  return [{ recipient, fee: Math.round(bps) }];
}
