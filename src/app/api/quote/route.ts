import { BackupError, backupQuote, isBackupId } from "@/lib/changenow";
import { OneClickError, appFees, requestQuote, type QuoteRequest } from "@/lib/oneclick";
import { isIntentsAccount, referralTerms, splitFees } from "@/lib/referral";
import { getTokens } from "@/lib/token-list";
import { SLOW_CHAINS, fromBaseUnits, isZec, toBaseUnits } from "@/lib/tokens";

type Body = {
  from: string;
  to: string;
  amount: string;
  /** "fixed" locks the receive amount (EXACT_OUTPUT); "float" locks the send amount (EXACT_INPUT). */
  mode: "float" | "fixed";
  recipient: string;
  refundTo: string;
  dry: boolean;
  /** Referrer's NEAR Intents account, from a referral link remembered in the visitor's browser. */
  ref?: string;
};

export type QuoteErrorField = "amount" | "recipient" | "refundTo" | "pair";

const SLIPPAGE_BPS = 100;

const TERMS = referralTerms(process.env.ZCAN_REFERRAL_DISCOUNT, process.env.ZCAN_REFERRAL_SHARE);

/** Longest address accepted (Zcash unified addresses with every receiver are ~215 characters). */
const MAX_ADDRESS = 512;
const MAX_AMOUNT = 40;

function fail(message: string, field?: QuoteErrorField, status = 400) {
  return Response.json({ message, field }, { status });
}

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/**
 * Best-effort, per-instance cap on real (non-dry) quotes: each one opens a deposit address with 1Click
 * under Zcan's API key, so a flood could exhaust that key's limits for everyone. Serverless instances don't
 * share memory, so this only blunts bursts. Dry quotes (the live price preview) aren't limited here.
 */
const ORDERS_PER_HOUR = 60;
const orders = new Map<string, number[]>();
function tooManyOrders(req: Request): boolean {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
  const now = Date.now();
  const recent = (orders.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= ORDERS_PER_HOUR) return true;
  recent.push(now);
  if (orders.size > 5000) orders.clear();
  orders.set(ip, recent);
  return false;
}

export async function POST(req: Request) {
  let body: Partial<Body> | null;
  try {
    body = await req.json();
  } catch {
    return fail("Invalid request body.");
  }
  if (!body || typeof body !== "object") return fail("Invalid request body.");

  const { from, to, mode } = body;
  const dry = body.dry !== false;
  const amount = typeof body.amount === "number" ? String(body.amount) : text(body.amount);
  const recipient = text(body.recipient);
  const refundTo = text(body.refundTo);
  if (amount.length > MAX_AMOUNT) return fail("Enter a valid amount.", "amount");

  let tokens;
  try {
    tokens = await getTokens();
  } catch {
    return fail("The swap provider is unreachable. Try again in a moment.", undefined, 502);
  }

  const origin = tokens.find((t) => t.id === from);
  const dest = tokens.find((t) => t.id === to);
  if (!origin || !dest) return fail("That pair isn't supported.", "pair");
  // Same-asset routes (e.g. ZEC → ZEC) are allowed: they power private sends.
  if (!isZec(origin) && !isZec(dest)) return fail("Zcan swaps always have ZEC on one side.", "pair");

  const amountToken = mode === "fixed" ? dest : origin;
  const units = toBaseUnits(amount, amountToken.decimals);
  if (!units || units === "0") return fail("Enter an amount.", "amount");
  if (!recipient) return fail(`Enter your ${dest.symbol} address.`, "recipient");
  if (recipient.length > MAX_ADDRESS) return fail(`That isn't a valid ${dest.chainName} address.`, "recipient");
  if (!refundTo) return fail(`Enter a ${origin.symbol} refund address.`, "refundTo");
  if (refundTo.length > MAX_ADDRESS) return fail(`That isn't a valid ${origin.chainName} address.`, "refundTo");
  if (!dry && tooManyOrders(req)) return fail("Too many swaps from this connection. Try again in a while.", undefined, 429);

  // Backup route (only while 1Click is down): ChangeNOW, fixed rate, exact input.
  if (isBackupId(origin.id) || isBackupId(dest.id)) {
    if (mode === "fixed") return fail("The backup route can't lock the amount you receive. Turn off Fixed rate and enter the amount you send.", "amount");
    try {
      return Response.json(await backupQuote({ from: origin.id, to: dest.id, amount, recipient, refundTo, dry }));
    } catch (err) {
      if (err instanceof BackupError) return fail(err.status >= 500 ? "The backup swap route didn't respond. Try again." : err.message, err.field, err.status >= 500 ? 502 : 400);
      return fail("The backup swap route didn't respond. Try again.", undefined, 502);
    }
  }

  const hours = SLOW_CHAINS.has(origin.chain) ? 3 : 1;
  const request: QuoteRequest = {
    dry,
    swapType: mode === "fixed" ? "EXACT_OUTPUT" : "EXACT_INPUT",
    slippageTolerance: SLIPPAGE_BPS,
    originAsset: origin.id,
    depositType: "ORIGIN_CHAIN",
    destinationAsset: dest.id,
    amount: units,
    refundTo,
    refundType: "ORIGIN_CHAIN",
    recipient,
    recipientType: "DESTINATION_CHAIN",
    deadline: new Date(Date.now() + hours * 3_600_000).toISOString(),
    referral: "zcan",
    quoteWaitingTimeMs: dry ? 0 : 3000,
    appFees: appFees(),
  };

  // Referral: split Zcan's fee (only when one is configured) between a discount and the referrer.
  const ref = typeof body.ref === "string" && body.ref.length <= 64 && isIntentsAccount(body.ref) ? body.ref : undefined;
  const base = request.appFees?.[0];
  const referred = ref && base ? { ...request, appFees: splitFees(base, ref, TERMS) } : null;

  try {
    let res;
    try {
      res = await requestQuote(referred ?? request);
    } catch (err) {
      // A referrer account 1Click won't pay must never block the swap: retry without the referral.
      if (!referred || !(err instanceof OneClickError)) throw err;
      res = await requestQuote(request);
    }
    return Response.json(res);
  } catch (err) {
    if (!(err instanceof OneClickError)) return fail("The swap provider didn't respond. Try again.", undefined, 502);
    const msg = err.message;
    if (/recipient is not valid/i.test(msg)) return fail(`That isn't a valid ${dest.chainName} address.`, "recipient");
    if (/refundTo is not valid/i.test(msg)) return fail(`That isn't a valid ${origin.chainName} address.`, "refundTo");
    const min = msg.match(/try at least (\d+)/i);
    if (min) return fail(`Amount is too small. Minimum is ${fromBaseUnits(min[1], amountToken.decimals)} ${amountToken.symbol}.`, "amount");
    if (/no quotes|not found any quote|failed to get quote/i.test(msg))
      return fail("No market maker can fill this right now. Try a different amount.", "amount");
    return fail(msg, undefined, err.status >= 500 ? 502 : 400);
  }
}
