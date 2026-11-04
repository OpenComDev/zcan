import "server-only";
import type { ExecutionStatus, QuoteResponse, StatusResponse, TxDetails } from "./oneclick";
import { chainName, toBaseUnits, type Token } from "./tokens";

/**
 * Backup swap route: ChangeNOW (https://changenow.io), used only while NEAR Intents 1Click is down.
 * Fixed-rate orders, so the amount shown is the amount paid out. Results are reshaped into 1Click's
 * quote/status format so the swap and order pages work unchanged.
 *
 * Privacy: requests go from Zcan's server, so ChangeNOW never sees the visitor's IP (Zcan doesn't forward
 * it). It does see both addresses and the deposit, like any swap service.
 * API: https://documenter.getpostman.com/view/8180765/SVfTPnM8 (v1).
 */

const API = "https://api.changenow.io";
export const BACKUP_NAME = "ChangeNOW";
export const BACKUP_POLICY = "https://changenow.io/privacy-policy";
const PREFIX = "cn:";

const key = () => process.env.CHANGENOW_API_KEY?.trim() || undefined;
/** The backup route needs a partner key: ChangeNOW's fixed-rate orders require one. */
export const backupConfigured = () => Boolean(key());
export const isBackupId = (id: string) => id.startsWith(PREFIX);

type Asset = { symbol: string; chain: string; ticker: string; decimals: number; cg: string };

/** Popular assets on the backup route (ChangeNOW v1 tickers) and their CoinGecko ids for USD prices. */
const ASSETS: Asset[] = [
  { symbol: "ZEC", chain: "zec", ticker: "zec", decimals: 8, cg: "zcash" },
  { symbol: "BTC", chain: "btc", ticker: "btc", decimals: 8, cg: "bitcoin" },
  { symbol: "ETH", chain: "eth", ticker: "eth", decimals: 18, cg: "ethereum" },
  { symbol: "USDT", chain: "eth", ticker: "usdterc20", decimals: 6, cg: "tether" },
  { symbol: "USDC", chain: "eth", ticker: "usdc", decimals: 6, cg: "usd-coin" },
  { symbol: "SOL", chain: "sol", ticker: "sol", decimals: 9, cg: "solana" },
  { symbol: "USDT", chain: "tron", ticker: "usdttrc20", decimals: 6, cg: "tether" },
  { symbol: "USDC", chain: "sol", ticker: "usdcsol", decimals: 6, cg: "usd-coin" },
  { symbol: "USDT", chain: "sol", ticker: "usdtsol", decimals: 6, cg: "tether" },
  { symbol: "BNB", chain: "bsc", ticker: "bnbbsc", decimals: 18, cg: "binancecoin" },
  { symbol: "USDT", chain: "bsc", ticker: "usdtbsc", decimals: 18, cg: "tether" },
  { symbol: "DOGE", chain: "doge", ticker: "doge", decimals: 8, cg: "dogecoin" },
  { symbol: "LTC", chain: "ltc", ticker: "ltc", decimals: 8, cg: "litecoin" },
  { symbol: "TRX", chain: "tron", ticker: "trx", decimals: 6, cg: "tron" },
  { symbol: "ADA", chain: "cardano", ticker: "ada", decimals: 6, cg: "cardano" },
  { symbol: "SUI", chain: "sui", ticker: "sui", decimals: 9, cg: "sui" },
  { symbol: "DASH", chain: "dash", ticker: "dash", decimals: 8, cg: "dash" },
  { symbol: "BCH", chain: "bch", ticker: "bch", decimals: 8, cg: "bitcoin-cash" },
  { symbol: "NEAR", chain: "near", ticker: "near", decimals: 24, cg: "near" },
  { symbol: "ETH", chain: "base", ticker: "ethbase", decimals: 18, cg: "ethereum" },
  { symbol: "USDC", chain: "base", ticker: "usdcbase", decimals: 6, cg: "usd-coin" },
  { symbol: "ETH", chain: "arb", ticker: "etharb", decimals: 18, cg: "ethereum" },
  { symbol: "USDC", chain: "arb", ticker: "usdcarb", decimals: 6, cg: "usd-coin" },
  { symbol: "AVAX", chain: "avax", ticker: "avaxc", decimals: 18, cg: "avalanche-2" },
];
// Assets whose deposits need a memo/tag (XRP, TON, XLM) are left out: one wrong field loses the funds.

const idOf = (a: Asset) => `${PREFIX}${a.ticker}`;
const assetOf = (id: string) => ASSETS.find((a) => idOf(a) === id);
const assetByTicker = (ticker: string | undefined) => ASSETS.find((a) => a.ticker === ticker?.toLowerCase());

export class BackupError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public field?: "amount" | "recipient" | "refundTo" | "pair",
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { accept: "application/json", "content-type": "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const b = (body ?? {}) as { error?: unknown; message?: unknown };
    const message = (typeof b.message === "string" && b.message) || `Backup swap request failed (${res.status})`;
    throw new BackupError(message, res.status, typeof b.error === "string" ? b.error : undefined);
  }
  return body as T;
}

let prices: { at: number; usd: Record<string, number> } | null = null;
async function usdPrices(): Promise<Record<string, number>> {
  if (prices && Date.now() - prices.at < 60_000) return prices.usd;
  const ids = [...new Set(ASSETS.map((a) => a.cg))].join(",");
  const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`, {
    cache: "no-store",
    signal: AbortSignal.timeout(6_000),
  });
  if (!res.ok) throw new BackupError("Prices unavailable", 502);
  const body = (await res.json()) as Record<string, { usd?: number }>;
  const usd = Object.fromEntries(Object.entries(body).map(([k, v]) => [k, v.usd ?? 0]));
  prices = { at: Date.now(), usd };
  return usd;
}

/** The backup route's token list, in Zcan's Token shape. Empty when the route isn't configured. */
export async function backupTokens(): Promise<Token[]> {
  if (!backupConfigured()) return [];
  const usd = await usdPrices();
  return ASSETS.filter((a) => (usd[a.cg] ?? 0) > 0).map((a) => ({
    id: idOf(a),
    aliases: [],
    symbol: a.symbol,
    chain: a.chain,
    chainName: chainName(a.chain),
    decimals: a.decimals,
    price: usd[a.cg],
  }));
}

/** A ChangeNOW order reference carried in Zcan's order URL (`?via=cn:<id>`). */
export const backupOrderRef = (orderId: string) => `${PREFIX}${orderId}`;
export const backupOrderId = (ref: string | null | undefined) =>
  ref && ref.startsWith(PREFIX) && /^[A-Za-z0-9]{6,64}$/.test(ref.slice(PREFIX.length)) ? ref.slice(PREFIX.length) : null;

export type BackupQuoteResponse = QuoteResponse & { provider: { id: "changenow"; name: string; orderRef?: string } };

const num = (v: unknown) => (typeof v === "number" ? v : Number(v));
const decimal = (n: number, decimals: number) => {
  const s = n.toFixed(Math.min(decimals, 12));
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
};
const minutesFrom = (forecast: unknown) => {
  const m = typeof forecast === "string" ? forecast.match(/(\d+)\s*$/) : null;
  return m ? Number(m[1]) : 30;
};

async function validAddress(asset: Asset, address: string): Promise<boolean> {
  try {
    const r = await call<{ result?: boolean }>(`/v2/validate/address?${new URLSearchParams({ currency: asset.ticker, address })}`);
    return r.result !== false;
  } catch {
    return true; // Validator unavailable: the order request itself will reject a bad address.
  }
}

/**
 * Fixed-rate quote, and with `dry: false` a real order with its deposit address.
 * Exact-input only (the amount sent is fixed; the amount received is locked by the fixed rate).
 */
export async function backupQuote(opts: {
  from: string;
  to: string;
  amount: string;
  recipient: string;
  refundTo: string;
  dry: boolean;
}): Promise<BackupQuoteResponse> {
  const k = key();
  const from = assetOf(opts.from);
  const to = assetOf(opts.to);
  if (!k || !from || !to) throw new BackupError("That pair isn't available on the backup route.", 400, undefined, "pair");
  if (from.ticker === to.ticker) throw new BackupError("Private sends are paused while the main swap route is down.", 400, undefined, "pair");
  // ChangeNOW pays ZEC to transparent addresses only.
  if (to.symbol === "ZEC" && !/^t[13][1-9A-HJ-NP-Za-km-z]{30,40}$/.test(opts.recipient))
    throw new BackupError("The backup route can only pay ZEC to a transparent address (t1…). Shield it in your wallet once it lands.", 400, undefined, "recipient");

  const [okTo, okRefund] = await Promise.all([validAddress(to, opts.recipient), validAddress(from, opts.refundTo)]);
  if (!okTo) throw new BackupError(`That isn't a valid ${chainName(to.chain)} address.`, 400, undefined, "recipient");
  if (!okRefund) throw new BackupError(`That isn't a valid ${chainName(from.chain)} address.`, 400, undefined, "refundTo");

  const pair = `${from.ticker}_${to.ticker}`;
  const range = await call<{ minAmount?: number; maxAmount?: number | null }>(`/v1/exchange-range/fixed-rate/${pair}?api_key=${k}`);
  const amount = Number(opts.amount);
  const min = num(range.minAmount);
  const max = range.maxAmount == null ? Infinity : num(range.maxAmount);
  if (Number.isFinite(min) && amount < min)
    throw new BackupError(`Amount is too small. Minimum is ${decimal(min, from.decimals)} ${from.symbol}.`, 400, "too_small", "amount");
  if (amount > max) throw new BackupError(`Amount is too large. Maximum is ${decimal(max, from.decimals)} ${from.symbol}.`, 400, "too_large", "amount");

  const est = await call<{ estimatedAmount: number; rateId?: string; validUntil?: string; transactionSpeedForecast?: string }>(
    `/v1/exchange-amount/fixed-rate/${encodeURIComponent(opts.amount)}/${pair}?api_key=${k}&useRateId=true`,
  );

  let orderId: string | undefined;
  let depositAddress: string | undefined;
  let depositMemo: string | undefined;
  let out = num(est.estimatedAmount);
  let deadline = est.validUntil;
  if (!opts.dry) {
    const order = await call<{ id: string; payinAddress: string; payinExtraId?: string | null; amount?: number; validUntil?: string }>(
      `/v1/transactions/fixed-rate/${k}`,
      {
        method: "POST",
        body: JSON.stringify({
          from: from.ticker,
          to: to.ticker,
          amount: opts.amount,
          address: opts.recipient,
          refundAddress: opts.refundTo,
          ...(est.rateId ? { rateId: est.rateId } : {}),
        }),
      },
    );
    if (!order?.id || !order.payinAddress) throw new BackupError("The backup route didn't open an order. Try again.", 502);
    orderId = order.id;
    depositAddress = order.payinAddress;
    depositMemo = order.payinExtraId || undefined;
    if (order.amount != null && Number.isFinite(num(order.amount))) out = num(order.amount);
    deadline = order.validUntil ?? deadline;
  }

  const usd = await usdPrices().catch(() => ({}) as Record<string, number>);
  const outStr = decimal(out, to.decimals);
  return {
    correlationId: orderId ?? "",
    timestamp: new Date().toISOString(),
    signature: "",
    quoteRequest: {
      dry: opts.dry,
      swapType: "EXACT_INPUT",
      slippageTolerance: 0,
      originAsset: idOf(from),
      depositType: "ORIGIN_CHAIN",
      destinationAsset: idOf(to),
      amount: toBaseUnits(opts.amount, from.decimals) ?? "0",
      refundTo: opts.refundTo,
      refundType: "ORIGIN_CHAIN",
      recipient: opts.recipient,
      recipientType: "DESTINATION_CHAIN",
      deadline: deadline ?? "",
    },
    quote: {
      depositAddress,
      depositMemo,
      amountIn: toBaseUnits(opts.amount, from.decimals) ?? "0",
      amountInFormatted: opts.amount,
      amountInUsd: (amount * (usd[from.cg] ?? 0)).toFixed(2),
      minAmountIn: toBaseUnits(decimal(min || amount, from.decimals), from.decimals) ?? "0",
      amountOut: toBaseUnits(outStr, to.decimals) ?? "0",
      amountOutFormatted: outStr,
      amountOutUsd: (out * (usd[to.cg] ?? 0)).toFixed(2),
      // Fixed rate: the quoted amount is what's paid out.
      minAmountOut: toBaseUnits(outStr, to.decimals) ?? "0",
      deadline,
      timeEstimate: minutesFrom(est.transactionSpeedForecast) * 60,
    },
    provider: { id: "changenow", name: BACKUP_NAME, ...(orderId ? { orderRef: backupOrderRef(orderId) } : {}) },
  };
}

type CnStatus = {
  id: string;
  status: string;
  payinAddress?: string;
  payoutAddress?: string;
  payinExtraId?: string | null;
  refundAddress?: string;
  fromCurrency?: string;
  toCurrency?: string;
  amountSend?: number | null;
  amountReceive?: number | null;
  expectedSendAmount?: number | null;
  expectedReceiveAmount?: number | null;
  payinHash?: string | null;
  payoutHash?: string | null;
  refundHash?: string | null;
  validUntil?: string | null;
  updatedAt?: string;
};

/** ChangeNOW status → 1Click's. "verifying" is ChangeNOW's compliance hold. */
export function mapBackupStatus(s: string): ExecutionStatus {
  switch (s) {
    case "new":
    case "waiting":
      return "PENDING_DEPOSIT";
    case "confirming":
      return "KNOWN_DEPOSIT_TX";
    case "exchanging":
    case "sending":
    case "verifying":
      return "PROCESSING";
    case "finished":
      return "SUCCESS";
    case "refunded":
      return "REFUNDED";
    default:
      return "FAILED"; // failed, expired
  }
}

const EXPLORERS: Record<string, string> = {
  zec: "https://mainnet.zcashexplorer.app/transactions/",
  btc: "https://mempool.space/tx/",
  eth: "https://etherscan.io/tx/",
  sol: "https://solscan.io/tx/",
  tron: "https://tronscan.org/#/transaction/",
  bsc: "https://bscscan.com/tx/",
  doge: "https://blockchair.com/dogecoin/transaction/",
  ltc: "https://blockchair.com/litecoin/transaction/",
  cardano: "https://cardanoscan.io/transaction/",
  sui: "https://suiscan.xyz/mainnet/tx/",
  dash: "https://blockchair.com/dash/transaction/",
  bch: "https://blockchair.com/bitcoin-cash/transaction/",
  near: "https://nearblocks.io/txns/",
  base: "https://basescan.org/tx/",
  arb: "https://arbiscan.io/tx/",
  avax: "https://snowtrace.io/tx/",
};
const tx = (hash: string | null | undefined, asset: Asset | undefined): TxDetails[] =>
  hash ? [{ hash, explorerUrl: asset && EXPLORERS[asset.chain] ? `${EXPLORERS[asset.chain]}${hash}` : "" }] : [];

/** Converts a ChangeNOW order into 1Click's status shape. Pure, for tests. */
export function toStatusResponse(o: CnStatus): StatusResponse & { provider: { id: "changenow"; name: string; hold: boolean } } {
  const from = assetByTicker(o.fromCurrency);
  const to = assetByTicker(o.toCurrency);
  const fmt = (n: number | null | undefined, a: Asset | undefined) => (n != null && Number.isFinite(num(n)) && a ? decimal(num(n), a.decimals) : undefined);
  const sendFmt = fmt(o.amountSend ?? o.expectedSendAmount, from) ?? "0";
  const receiveFmt = fmt(o.amountReceive ?? o.expectedReceiveAmount, to) ?? "0";
  const status = mapBackupStatus(o.status);
  const units = (v: string, a: Asset | undefined) => (a ? (toBaseUnits(v, a.decimals) ?? "0") : "0");
  return {
    correlationId: o.id,
    status,
    updatedAt: o.updatedAt ?? new Date().toISOString(),
    quoteResponse: {
      correlationId: o.id,
      timestamp: o.updatedAt ?? "",
      signature: "",
      quoteRequest: {
        dry: false,
        swapType: "EXACT_INPUT",
        slippageTolerance: 0,
        originAsset: from ? idOf(from) : "",
        depositType: "ORIGIN_CHAIN",
        destinationAsset: to ? idOf(to) : "",
        amount: units(sendFmt, from),
        refundTo: o.refundAddress ?? "",
        refundType: "ORIGIN_CHAIN",
        recipient: o.payoutAddress ?? "",
        recipientType: "DESTINATION_CHAIN",
        deadline: o.validUntil ?? "",
      },
      quote: {
        depositAddress: o.payinAddress,
        depositMemo: o.payinExtraId || undefined,
        amountIn: units(sendFmt, from),
        amountInFormatted: sendFmt,
        amountInUsd: "0",
        minAmountIn: units(sendFmt, from),
        amountOut: units(receiveFmt, to),
        amountOutFormatted: receiveFmt,
        amountOutUsd: "0",
        minAmountOut: units(receiveFmt, to),
        deadline: o.validUntil ?? undefined,
        timeEstimate: 30 * 60,
      },
    },
    swapDetails: {
      amountInFormatted: fmt(o.amountSend, from),
      amountOutFormatted: fmt(o.amountReceive, to),
      depositedAmountFormatted: fmt(o.amountSend, from),
      originChainTxHashes: tx(o.payinHash, from),
      destinationChainTxHashes: tx(o.payoutHash, to),
      ...(status === "REFUNDED" ? { refundedAmountFormatted: fmt(o.amountSend, from) } : {}),
    },
    provider: { id: "changenow", name: BACKUP_NAME, hold: o.status === "verifying" },
  };
}

export async function backupStatus(orderId: string) {
  const k = key();
  if (!k) throw new BackupError("The backup route isn't configured.", 503);
  return toStatusResponse(await call<CnStatus>(`/v1/transactions/${encodeURIComponent(orderId)}/${k}`));
}

