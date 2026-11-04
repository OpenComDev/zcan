"use client";

import { useRouter } from "next/navigation";
import { ArrowLeftRight, ChevronDown, CircleAlert, ClipboardPaste, Clock, LoaderCircle, Lock, ShieldCheck, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { QuoteResponse } from "@/lib/oneclick";
import { track } from "@/lib/analytics";
import { addHistory } from "@/lib/history";
import { getReferral } from "@/lib/referral-store";
import { addressHint, formatAmount, formatUsd, isZec, toInputString, type Token } from "@/lib/tokens";
import { useLocale, useLocalePath, useT } from "@/lib/i18n";
import { useTokens } from "@/lib/use-tokens";
import { quoteFees } from "./receipt/fees";
import { PayoutHint } from "./shield/payout-hint";
import { UNIFIED_PAYOUT, zecPayoutKind } from "./shield/zec-payout";
import { TokenIcon } from "./token-icon";
import { TokenPicker } from "./token-picker";

type Mode = "float" | "fixed";
type Field = "amount" | "recipient" | "refundTo" | "pair";
type QuoteState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; data: QuoteResponse; key: string }
  | { kind: "error"; message: string; field?: Field };

export const SELECT_PAIR_EVENT = "zcan:select-pair";

/** What the swap form currently shows — feeds the inspector, market and viewport panels. */
export type SwapSnapshot = {
  from?: Token;
  to?: Token;
  mode: Mode;
  amountIn: number;
  amountOut: number;
  exact: boolean;
  minOut?: number;
  etaMinutes?: number;
  quoting: boolean;
};

const key = (t?: Token) => (t ? `${t.symbol}.${t.chain}` : "");
const findByKey = (tokens: Token[], k: string | null) => (k ? tokens.find((t) => key(t).toLowerCase() === k.toLowerCase()) : undefined);
const sanitize = (v: string) => {
  const s = v.replace(/,/g, ".").replace(/[^\d.]/g, "");
  const [a, ...rest] = s.split(".");
  return rest.length ? `${a}.${rest.join("")}` : a;
};

const DEFAULT_FROM = "BTC.btc";
const DEFAULT_TO = "ZEC.zec";
const DEFAULT_AMOUNT = "0.01";
/** Pairs already counted as "Swap quoted" in this page view. */
const quotedPairs = new Set<string>();

export function ExchangeWidget({ onSnapshot }: { onSnapshot?: (s: SwapSnapshot) => void }) {
  const router = useRouter();
  const lp = useLocalePath();
  const t = useT();
  const { tokens, error: tokensError, loading: tokensLoading, retry } = useTokens();

  const [fromKey, setFromKey] = useState(DEFAULT_FROM);
  const [toKey, setToKey] = useState(DEFAULT_TO);
  const [mode, setMode] = useState<Mode>("float");
  const [sendAmount, setSendAmount] = useState(DEFAULT_AMOUNT);
  const [receiveAmount, setReceiveAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [refundTo, setRefundTo] = useState("");
  const [picker, setPicker] = useState<null | "from" | "to">(null);
  const [rawQuote, setQuote] = useState<QuoteState>({ kind: "idle" });
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});

  const amountRef = useRef<HTMLInputElement>(null);
  const recipientRef = useRef<HTMLInputElement>(null);
  const refundRef = useRef<HTMLInputElement>(null);
  const ids = { send: useId(), receive: useId(), recipient: useId(), refund: useId(), fixed: useId() };

  const from = findByKey(tokens, fromKey);
  const to = findByKey(tokens, toKey);
  const buying = toKey === "ZEC.zec";

  // Restore pair/amount (and payment-request fields) from the URL once tokens are available.
  // Supported: from, to, amount, mode=fixed + receive, recipient. A refund address is never taken from a
  // link: only the sender should choose where a failed swap's funds go, and a pre-filled one is easy to miss.
  const restored = useRef(false);
  const [urlReady, setUrlReady] = useState(false);
  // Addresses that came from the URL. They stay in the URL only while the field still holds them.
  const [urlRecipient, setUrlRecipient] = useState<string | null>(null);
  useEffect(() => {
    if (restored.current || tokens.length === 0) return;
    restored.current = true;
    const p = new URLSearchParams(window.location.search);
    const f = findByKey(tokens, p.get("from"));
    const t = findByKey(tokens, p.get("to"));
    const amt = p.get("amount");
    const fixed = p.get("mode") === "fixed";
    const receive = p.get("receive");
    const rcpt = p.get("recipient")?.trim();
    /* eslint-disable react-hooks/set-state-in-effect -- one-time sync from an external source (the URL) */
    if (f && t && f.id !== t.id && (isZec(f) || isZec(t))) {
      setFromKey(key(f));
      setToKey(key(t));
    } else if (f && !isZec(f)) setFromKey(key(f));
    else if (!f && t && !isZec(t)) {
      setToKey(key(t));
      setFromKey("ZEC.zec");
    }
    if (fixed) {
      setMode("fixed");
      if (receive && Number(sanitize(receive)) > 0) setReceiveAmount(sanitize(receive));
    } else if (amt && Number(amt) > 0) setSendAmount(sanitize(amt));
    if (rcpt) {
      setRecipient(rcpt);
      setUrlRecipient(rcpt);
    }
    setUrlReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [tokens]);

  // Keep the URL in sync so a swap setup can be shared or bookmarked. Runs only after the restored
  // state has rendered, so the first sync can't overwrite URL values with the defaults.
  // Addresses the user typed are never written to the URL.
  useEffect(() => {
    if (!urlReady) return;
    const p = new URLSearchParams(window.location.search);
    p.set("from", fromKey);
    p.set("to", toKey);
    if (mode === "float") {
      if (sendAmount) p.set("amount", sendAmount);
      else p.delete("amount");
      p.delete("mode");
      p.delete("receive");
    } else {
      p.delete("amount");
      p.set("mode", "fixed");
      if (receiveAmount) p.set("receive", receiveAmount);
      else p.delete("receive");
    }
    if (urlRecipient && recipient.trim() === urlRecipient) p.set("recipient", urlRecipient);
    else p.delete("recipient");
    p.delete("refund");
    // Untouched defaults stay out of the address bar; only a changed setup is worth sharing.
    if (fromKey === DEFAULT_FROM && toKey === DEFAULT_TO) {
      p.delete("from");
      p.delete("to");
    }
    if (mode === "float" && sendAmount === DEFAULT_AMOUNT) p.delete("amount");
    const query = p.toString();
    const url = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
    window.history.replaceState(window.history.state, "", url);
  }, [urlReady, fromKey, toKey, sendAmount, receiveAmount, mode, recipient, urlRecipient]);

  const recipientPrefilled = urlRecipient !== null && recipient.trim() === urlRecipient;

  const choose = useCallback(
    (side: "from" | "to", t: Token) => {
      const other = side === "from" ? toKey : fromKey;
      const setSide = side === "from" ? setFromKey : setToKey;
      const setOther = side === "from" ? setToKey : setFromKey;
      if (key(t) === other) {
        // Picked the asset on the other side — flip.
        setOther(side === "from" ? fromKey : toKey);
        setSide(key(t));
      } else if (isZec(t)) {
        setSide(key(t));
        if (other === "ZEC.zec") setOther(side === "from" ? fromKey : toKey);
      } else {
        setSide(key(t));
        if (other !== "ZEC.zec") setOther("ZEC.zec");
      }
      setQuote({ kind: "idle" });
    },
    [fromKey, toKey],
  );

  // Markets table and other sections can preselect a pair.
  useEffect(() => {
    const onSelect = (e: Event) => {
      const { from: f, to: t } = (e as CustomEvent<{ from: string; to: string }>).detail;
      setFromKey(f);
      setToKey(t);
      setQuote({ kind: "idle" });
      document.getElementById("exchange")?.scrollIntoView({ behavior: "smooth", block: "start" });
      setTimeout(() => amountRef.current?.focus({ preventScroll: true }), 400);
    };
    window.addEventListener(SELECT_PAIR_EVENT, onSelect);
    return () => window.removeEventListener(SELECT_PAIR_EVENT, onSelect);
  }, []);

  const flip = () => {
    setFromKey(toKey);
    setToKey(fromKey);
    if (mode === "float" && quote.kind === "ok") setSendAmount(toInputString(Number(quote.data.quote.amountOutFormatted)));
    setQuote({ kind: "idle" });
  };

  const setDirection = (wantBuy: boolean) => {
    if (wantBuy !== buying) flip();
  };

  // Price-based estimate shown until an exact quote is available.
  const estimate = useMemo(() => {
    if (!from || !to) return null;
    const rate = from.price / to.price;
    if (mode === "float") {
      const n = Number(sendAmount);
      return { in: n, out: n > 0 ? n * rate : 0, rate };
    }
    const n = Number(receiveAmount);
    return { in: n > 0 ? n / rate : 0, out: n, rate };
  }, [from, to, mode, sendAmount, receiveAmount]);

  // NEAR Intents is unreachable and the token list came from the backup route (ChangeNOW).
  const backupRoute = Boolean(from?.id.startsWith("cn:") || to?.id.startsWith("cn:"));
  const activeAmount = mode === "float" ? sendAmount : receiveAmount;
  const quoteKey = `${from?.id}|${to?.id}|${mode}|${activeAmount}|${recipient.trim()}|${refundTo.trim()}`;
  const canQuote = Boolean(from && to && Number(activeAmount) > 0 && recipient.trim() && refundTo.trim());

  // Exact quote (dry run) once addresses are in. Debounced; refreshed every 15 s.
  useEffect(() => {
    if (!canQuote || !from || !to) return;
    let alive = true;
    const ctrl = new AbortController();
    const run = async () => {
      setQuote((q) => (q.kind === "ok" && q.key === quoteKey ? q : { kind: "loading" }));
      try {
        const res = await fetch("/api/quote", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ from: from.id, to: to.id, amount: activeAmount, mode, recipient, refundTo, dry: true, ref: getReferral() }),
          signal: ctrl.signal,
        });
        const body = await res.json();
        if (!alive) return;
        if (!res.ok) {
          setQuote({ kind: "error", message: body.message, field: body.field });
          return;
        }
        setQuote({ kind: "ok", data: body, key: quoteKey });
        // Usage count: once per pair per page view (quotes refresh every 15 s). Symbols only.
        const pair = `${from.symbol}→${to.symbol}`;
        if (!quotedPairs.has(pair)) {
          quotedPairs.add(pair);
          track("Swap quoted", { pair });
        }
      } catch (e) {
        if (alive && (e as Error).name !== "AbortError") setQuote({ kind: "error", message: t("swap.err.quoteNetwork") });
      }
    };
    const timer = setTimeout(run, 550);
    const iv = setInterval(run, 15_000);
    return () => {
      alive = false;
      ctrl.abort();
      clearTimeout(timer);
      clearInterval(iv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- quoteKey captures every input
  }, [quoteKey, canQuote]);

  // Without both addresses there is nothing to quote; ignore any stale result.
  const quote: QuoteState = canQuote ? rawQuote : { kind: "idle" };
  const exact = quote.kind === "ok" ? quote.data.quote : null;
  const shownOut = mode === "float" ? (exact ? exact.amountOutFormatted : estimate && estimate.out > 0 ? toInputString(estimate.out) : "") : receiveAmount;
  const shownIn = mode === "fixed" ? (exact ? exact.amountInFormatted : estimate && estimate.in > 0 ? toInputString(estimate.in) : "") : sendAmount;
  const snapshot: SwapSnapshot = {
    from,
    to,
    mode,
    amountIn: Number(shownIn) || 0,
    amountOut: Number(shownOut) || 0,
    exact: Boolean(exact),
    minOut: exact && to ? Number(exact.minAmountOut) / 10 ** to.decimals : undefined,
    etaMinutes: exact ? Math.max(1, Math.round(exact.timeEstimate / 60)) : undefined,
    quoting: quote.kind === "loading",
  };
  const snapKey = JSON.stringify([from?.id, to?.id, mode, shownIn, shownOut, snapshot.minOut, snapshot.etaMinutes, snapshot.quoting]);
  useEffect(() => {
    onSnapshot?.(snapshot);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- snapKey captures every field
  }, [snapKey, onSnapshot]);

  // Buying ZEC: classify the destination locally (offline) to steer people to a shielded address.
  const payoutKind = useMemo(() => (buying ? zecPayoutKind(recipient) : null), [buying, recipient]);
  const payoutUnsupported = buying && payoutKind === "unsupported" ? t(UNIFIED_PAYOUT ? "swap.payout.zs1" : "swap.payout.noUnified") : undefined;

  const fieldError = (f: Field) =>
    errors[f] ??
    (f === "recipient" ? payoutUnsupported : undefined) ??
    (quote.kind === "error" && quote.field === f ? quote.message : undefined);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!from || !to) return;
    const next: Partial<Record<Field, string>> = {};
    if (!(Number(activeAmount) > 0)) next.amount = t("swap.err.amount");
    if (!recipient.trim()) next.recipient = t("swap.err.recipient", { symbol: to.symbol });
    if (!refundTo.trim()) next.refundTo = t("swap.err.refund", { symbol: from.symbol });
    if (!next.recipient && payoutUnsupported) next.recipient = payoutUnsupported;
    setErrors(next);
    if (next.amount) return amountRef.current?.focus();
    if (next.recipient) return recipientRef.current?.focus();
    if (next.refundTo) return refundRef.current?.focus();

    setSubmitting(true);
    try {
      const res = await fetch("/api/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ from: from.id, to: to.id, amount: activeAmount, mode, recipient, refundTo, dry: false, ref: getReferral() }),
      });
      const body = await res.json();
      if (!res.ok || !body?.quote?.depositAddress) {
        const field = body?.field as Field | undefined;
        setQuote({ kind: "error", message: body?.message ?? t("swap.err.create"), field });
        if (field === "recipient") recipientRef.current?.focus();
        else if (field === "refundTo") refundRef.current?.focus();
        else if (field === "amount") amountRef.current?.focus();
        setSubmitting(false);
        return;
      }
      const q = (body as QuoteResponse).quote;
      const via: string | undefined = body?.provider?.orderRef;
      addHistory({
        depositAddress: q.depositAddress!,
        depositMemo: q.depositMemo,
        createdAt: new Date().toISOString(),
        fromSymbol: from.symbol,
        fromChain: from.chain,
        toSymbol: to.symbol,
        toChain: to.chain,
        amountIn: q.amountInFormatted,
        amountOut: q.amountOutFormatted,
        status: "PENDING_DEPOSIT",
        ...(via ? { via } : {}),
      });
      try {
        sessionStorage.setItem(`zcan:quote:${q.depositAddress}`, JSON.stringify(body));
      } catch {}
      const qs = new URLSearchParams();
      if (q.depositMemo) qs.set("memo", q.depositMemo);
      if (via) qs.set("via", via);
      const memo = qs.size ? `?${qs}` : "";
      track("Swap started", { pair: `${from.symbol}→${to.symbol}` });
      router.push(lp(`/order/${encodeURIComponent(q.depositAddress!)}${memo}`));
    } catch {
      setQuote({ kind: "error", message: t("swap.err.network") });
      setSubmitting(false);
    }
  };

  const paste = async (set: (v: string) => void, field: Field) => {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (text) {
        set(text);
        setErrors((er) => ({ ...er, [field]: undefined }));
      }
    } catch {
      // Clipboard permission denied — the user can still paste manually.
    }
  };

  if (tokensError && tokens.length === 0) {
    return (
      <div className="p-8 text-center">
        <CircleAlert className="mx-auto text-red" aria-hidden />
        <p className="mt-3 font-medium">{tokensError}</p>
        <button type="button" onClick={retry} className="btn-accent mt-4 h-10 px-5 text-[12px]">
          {t("common.retry")}
        </button>
      </div>
    );
  }

  const loadingTokens = tokensLoading && tokens.length === 0;
  const [shieldBefore, shieldAfter = ""] = t(UNIFIED_PAYOUT ? "swap.shieldNoteUnified" : "swap.shieldNote").split("{zodl}");
  const generalError = quote.kind === "error" && (!quote.field || quote.field === "pair") ? quote.message : undefined;

  return (
    <form onSubmit={submit} noValidate className="@container relative" aria-busy={loadingTokens}>
      {/* Direction tabs: buy or sell ZEC */}
      <div role="tablist" aria-label={t("swap.direction")} className="grid grid-cols-2 border border-line">
        {[
          { buy: true, label: t("swap.buyZec") },
          { buy: false, label: t("swap.sellZec") },
        ].map((tab) => {
          const selected = tab.buy === buying;
          return (
            <button
              key={String(tab.buy)}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setDirection(tab.buy)}
              className={`h-10 text-[12px] font-medium uppercase tracking-wider transition-colors duration-150 ${
                selected ? "bg-surface-3 text-fg shadow-[inset_0_-2px_0_var(--accent)]" : "text-subtle hover:text-fg"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="mt-5 grid items-start gap-3 @2xl:grid-cols-[1fr_auto_1fr] @2xl:gap-4">
        {/* SEND */}
        <AmountBox
          tone="send"
          label={t("swap.youSend")}
          inputId={ids.send}
          inputRef={mode === "float" ? amountRef : undefined}
          token={from}
          value={shownIn}
          editable={mode === "float"}
          approximate={mode === "fixed" && !exact}
          onChange={(v) => {
            setSendAmount(sanitize(v));
            setErrors((er) => ({ ...er, amount: undefined }));
          }}
          onPick={() => setPicker("from")}
          loading={loadingTokens}
          error={mode === "float" ? fieldError("amount") : undefined}
          footer={
            from && to ? (
              <>
                <span className="tabular">
                  1 {from.symbol} ≈ {formatAmount(from.price / to.price)} {to.symbol}
                </span>
                <span className="tabular">{formatUsd((Number(shownIn) || 0) * from.price)}</span>
              </>
            ) : null
          }
        />

        <div className="flex justify-center @2xl:pt-[34px]">
          <button
            type="button"
            onClick={flip}
            aria-label={t("swap.swapDirection")}
            className="group inline-flex size-10 items-center justify-center border border-line bg-surface-2 text-accent transition-[transform,background-color] duration-200 hover:bg-surface-3 active:scale-95"
          >
            <ArrowLeftRight size={18} className="rotate-90 transition-transform duration-300 group-hover:rotate-[270deg] @2xl:rotate-0 @2xl:group-hover:rotate-180" />
          </button>
        </div>

        {/* RECEIVE */}
        <AmountBox
          tone="receive"
          label={t("swap.youGet")}
          inputId={ids.receive}
          inputRef={mode === "fixed" ? amountRef : undefined}
          token={to}
          value={shownOut}
          editable={mode === "fixed"}
          approximate={mode === "float" && !exact}
          onChange={(v) => {
            setReceiveAmount(sanitize(v));
            setErrors((er) => ({ ...er, amount: undefined }));
          }}
          onPick={() => setPicker("to")}
          loading={loadingTokens}
          error={mode === "fixed" ? fieldError("amount") : undefined}
          footer={
            from && to ? (
              <>
                <span className="tabular">
                  1 {to.symbol} ≈ {formatAmount(to.price / from.price)} {from.symbol}
                </span>
                <span className="tabular">{formatUsd((Number(shownOut) || 0) * to.price)}</span>
              </>
            ) : null
          }
        />
      </div>

      {/* ADDRESSES */}
      <div className="mt-5 grid gap-4">
        {recipientPrefilled && (
          <p className="-mb-1 flex items-start gap-2 border-l-2 border-warn bg-warn/[0.06] px-3 py-2 text-[12px] leading-relaxed text-muted">
            <CircleAlert size={14} className="mt-0.5 shrink-0 text-warn" aria-hidden />
            <span>{t("swap.prefilled")}</span>
          </p>
        )}
        <AddressField
          id={ids.recipient}
          inputRef={recipientRef}
          label={t("swap.destination")}
          pasteLabel={t("swap.pasteDestination")}
          placeholder={to ? t("swap.addressPlaceholder", { symbol: to.symbol, chain: to.chainName, hint: addressHint(to.chain) }) : t("swap.destinationFallback")}
          value={recipient}
          onChange={(v) => {
            setRecipient(v);
            setErrors((er) => ({ ...er, recipient: undefined }));
          }}
          onPaste={() => paste(setRecipient, "recipient")}
          error={fieldError("recipient")}
          hint={buying ? <PayoutHint kind={payoutKind} /> : undefined}
          name="recipient"
        />
        <AddressField
          id={ids.refund}
          inputRef={refundRef}
          label={t("swap.refundAddress")}
          pasteLabel={t("swap.pasteRefund")}
          hint={from ? t("swap.refundHint", { symbol: from.symbol }) : undefined}
          placeholder={from ? t("swap.addressPlaceholder", { symbol: from.symbol, chain: from.chainName, hint: addressHint(from.chain) }) : t("swap.refundAddress")}
          value={refundTo}
          onChange={(v) => {
            setRefundTo(v);
            setErrors((er) => ({ ...er, refundTo: undefined }));
          }}
          onPaste={() => paste(setRefundTo, "refundTo")}
          error={fieldError("refundTo")}
          name="refund"
        />
      </div>

      {/* QUOTE DETAILS */}
      <QuoteDetails quote={quote} from={from} to={to} canQuote={canQuote} />

      {generalError && (
        <p role="alert" className="mt-4 flex items-start gap-2 border border-red/40 bg-red/10 px-3 py-2.5 text-[13px] text-red">
          <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden /> {generalError}
        </p>
      )}

      {/* CONTROLS */}
      <div className="mt-5 flex flex-col gap-4 @2xl:flex-row @2xl:items-center">
        <div className="flex flex-1 flex-wrap items-center gap-x-6 gap-y-3">
          <span className="inline-flex h-10 items-center gap-2 border border-line px-3 text-[12px] uppercase tracking-wider text-muted">
            <span className="size-2 rounded-full bg-accent pulse-dot" aria-hidden />
            {t("swap.route")} <span className="text-fg">NEAR Intents</span>
          </span>

          <label htmlFor={ids.fixed} className="flex cursor-pointer items-center gap-3 py-1">
            <span className="relative inline-flex">
              <input
                id={ids.fixed}
                type="checkbox"
                role="switch"
                checked={mode === "fixed"}
                onChange={(e) => {
                  const fixed = e.target.checked;
                  if (fixed) setReceiveAmount(shownOut ? toInputString(Number(shownOut)) : "");
                  else setSendAmount(shownIn ? toInputString(Number(shownIn)) : "");
                  setMode(fixed ? "fixed" : "float");
                  setQuote({ kind: "idle" });
                  setErrors({});
                }}
                className="peer sr-only"
              />
              <span className="h-6 w-11 border border-line-strong bg-surface-3 transition-colors duration-200 peer-checked:border-accent peer-checked:bg-accent/20 peer-focus-visible:outline-1 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent" />
              <span className="absolute left-1 top-1 flex size-4 items-center justify-center bg-fg text-bg transition-transform duration-200 peer-checked:translate-x-5 peer-checked:bg-accent">
                <Lock size={10} aria-hidden />
              </span>
            </span>
            <span>
              <span className="block text-[12px] font-medium uppercase tracking-wider text-fg">{t("swap.fixedRate")}</span>
              <span className="block text-[11px] text-subtle">{mode === "fixed" ? t("swap.fixedOn") : t("swap.fixedOff")}</span>
            </span>
          </label>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="btn-accent relative inline-flex h-12 min-w-[200px] items-center justify-center gap-2 px-6 text-[13px] transition-colors duration-150 disabled:cursor-progress disabled:opacity-80"
        >
          {submitting && <LoaderCircle size={18} className="animate-spin-slow" aria-hidden />}
          {t("swap.exchangeNow")}
        </button>
      </div>

      {buying && payoutKind !== "shielded" && (
        <p className="mt-4 flex items-start gap-2 border-l-2 border-accent bg-accent/[0.05] px-3 py-2.5 text-[12px] leading-relaxed text-muted">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden />
          <span>
            {shieldBefore}
            <a href="https://zodl.com/" target="_blank" rel="noopener noreferrer" className="text-accent underline-offset-2 hover:underline" translate="no">
              Zodl
            </a>
            {shieldAfter}
          </span>
        </p>
      )}

      {backupRoute ? (
        <p className="mt-4 flex items-start gap-2 border-l-2 border-accent bg-accent/[0.05] px-3 py-2.5 text-[12px] leading-relaxed text-muted" role="note">
          <TriangleAlert size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden />
          <span>{t("swap.backupNote")}</span>
        </p>
      ) : (
        <p className="micro mt-4 normal-case leading-relaxed tracking-normal">
          {t("swap.custodyNote")}
        </p>
      )}

      <TokenPicker
        open={picker !== null}
        onClose={() => setPicker(null)}
        tokens={tokens}
        selectedId={picker === "from" ? from?.id : to?.id}
        title={picker === "from" ? t("swap.youSend") : t("swap.youGet")}
        onSelect={(t) => picker && choose(picker, t)}
      />
    </form>
  );
}

function AmountBox({
  tone,
  label,
  inputId,
  inputRef,
  token,
  value,
  editable,
  approximate,
  onChange,
  onPick,
  loading,
  error,
  footer,
}: {
  tone: "send" | "receive";
  label: string;
  inputId: string;
  inputRef?: React.Ref<HTMLInputElement>;
  token?: Token;
  value: string;
  editable: boolean;
  approximate: boolean;
  onChange: (v: string) => void;
  onPick: () => void;
  loading: boolean;
  error?: string;
  footer: React.ReactNode;
}) {
  const accent = tone === "send" ? "text-accent" : "text-fg";
  const border =
    tone === "send"
      ? "border-accent/45 focus-within:border-accent hover:border-accent/70"
      : "border-line-strong focus-within:border-fg/50 hover:border-fg/30";
  const t = useT();
  const errId = `${inputId}-err`;

  return (
    <div className="min-w-0">
      <label htmlFor={inputId} className={`mb-2 block text-[12px] font-medium uppercase tracking-wider ${accent}`}>
        {label}
      </label>
      <div className={`flex h-14 items-center gap-2 border bg-bg-2 pl-3 pr-1.5 transition-colors duration-150 ${border} ${error ? "!border-red" : ""}`}>
        <span className="flex min-w-0 flex-1 items-center">
          {approximate && value && (
            <span className="mr-1 text-lg text-subtle" aria-hidden>
              ≈
            </span>
          )}
          <input
            id={inputId}
            ref={inputRef}
            value={value}
            readOnly={!editable}
            onChange={(e) => onChange(e.target.value)}
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            placeholder="0.0"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errId : undefined}
            className={`num w-full min-w-0 bg-transparent text-[24px] outline-none placeholder:text-subtle ${
              editable ? "text-fg" : "cursor-default text-fg/85"
            }`}
          />
        </span>
        <button
          type="button"
          onClick={onPick}
          disabled={loading}
          aria-label={token ? t("swap.changeAsset", { label, symbol: token.symbol, chain: token.chainName }) : t(tone === "send" ? "swap.chooseSend" : "swap.chooseReceive")}
          className="flex h-11 shrink-0 items-center gap-2 border border-transparent px-2 transition-colors duration-150 hover:border-line hover:bg-surface-2"
        >
          {token ? (
            <>
              <TokenIcon symbol={token.symbol} size={30} />
              <span className="text-left leading-tight">
                <span className="block text-[13px] font-medium text-fg" translate="no">
                  {token.symbol}
                </span>
                <span className="block max-w-[96px] truncate text-[10px] uppercase text-subtle">{token.chainName}</span>
              </span>
            </>
          ) : (
            <span className="h-8 w-24 animate-pulse rounded-lg bg-surface-3" aria-hidden />
          )}
          <ChevronDown size={16} className="text-muted" aria-hidden />
        </button>
      </div>
      {error ? (
        <p id={errId} role="alert" className="mt-2 text-[13px] text-red">
          {error}
        </p>
      ) : (
        <div className="mt-1.5 flex min-h-5 justify-between gap-2 text-[11px] uppercase text-subtle">{footer}</div>
      )}
    </div>
  );
}

function AddressField({
  id,
  inputRef,
  label,
  pasteLabel,
  hint,
  placeholder,
  value,
  onChange,
  onPaste,
  error,
  name,
}: {
  id: string;
  inputRef: React.Ref<HTMLInputElement>;
  label: string;
  pasteLabel: string;
  hint?: React.ReactNode;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onPaste: () => void;
  error?: string;
  name: string;
}) {
  const errId = `${id}-err`;
  const hintId = `${id}-hint`;
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-[12px] font-medium uppercase tracking-wider text-muted">
        {label}
      </label>
      <div
        className={`flex h-12 items-center gap-2 border bg-bg-2 pl-3 pr-1 transition-colors duration-150 focus-within:border-accent/70 ${
          error ? "border-red" : "border-line hover:border-line-strong"
        }`}
      >
        <input
          id={id}
          ref={inputRef}
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => onChange(e.target.value.trim())}
          placeholder={placeholder}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errId : hint ? hintId : undefined}
          className="min-w-0 flex-1 truncate bg-transparent text-base text-fg outline-none placeholder:text-[13px] placeholder:text-subtle"
        />
        <button
          type="button"
          onClick={onPaste}
          aria-label={pasteLabel}
          className="inline-flex size-10 shrink-0 items-center justify-center text-muted transition-colors hover:bg-surface-3 hover:text-fg"
        >
          <ClipboardPaste size={18} aria-hidden />
        </button>
      </div>
      {error ? (
        <p id={errId} role="alert" className="mt-2 text-[13px] text-red">
          {error}
        </p>
      ) : hint ? (
        <div id={hintId} className="mt-2 text-[13px] leading-relaxed text-subtle" aria-live="polite">
          {hint}
        </div>
      ) : null}
    </div>
  );
}

function QuoteDetails({ quote, from, to, canQuote }: { quote: QuoteState; from?: Token; to?: Token; canQuote: boolean }) {
  const t = useT();
  if (!from || !to) return null;

  if (!canQuote) {
    return (
      <p className="micro mt-4 normal-case tracking-normal">
        {t("swap.addAddresses")}
      </p>
    );
  }

  if (quote.kind === "loading" || quote.kind === "idle") {
    return (
      <div className="mt-4 flex items-center gap-2 border border-line px-4 py-3 text-[12px] uppercase text-muted" aria-live="polite">
        <LoaderCircle size={16} className="animate-spin-slow" aria-hidden /> {t("swap.gettingQuote")}
      </div>
    );
  }

  if (quote.kind !== "ok") return null;
  const q = quote.data.quote;
  const rate = Number(q.amountOutFormatted) / Number(q.amountInFormatted);
  const minOut = Number(q.minAmountOut) / 10 ** to.decimals;
  const minutes = Math.max(1, Math.round(q.timeEstimate / 60));

  return (
    <>
      <dl className="fade-up mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border border-line px-4 py-3.5 text-[12px] uppercase @xl:grid-cols-4" aria-live="polite">
        <div>
          <dt className="micro">{t("swap.rate")}</dt>
          <dd className="tabular mt-0.5 text-fg">
            1 {from.symbol} = {formatAmount(rate)} {to.symbol}
          </dd>
        </div>
        <div>
          <dt className="micro">{t("swap.minReceived")}</dt>
          <dd className="tabular mt-0.5 text-fg">
            {formatAmount(minOut)} {to.symbol}
          </dd>
        </div>
        <div>
          <dt className="micro">{t("swap.value")}</dt>
          <dd className="tabular mt-0.5 text-fg">
            {formatUsd(Number(q.amountInUsd))} → {formatUsd(Number(q.amountOutUsd))}
          </dd>
        </div>
        <div>
          <dt className="micro">{t("swap.eta")}</dt>
          <dd className="mt-0.5 flex items-center gap-1.5 text-fg">
            <Clock size={14} className="text-subtle" aria-hidden />
            {t("swap.etaValue", { n: minutes })}
          </dd>
        </div>
      </dl>
      <FeeBreakdown data={quote.data} from={from} to={to} />
      <ExchangeCompare data={quote.data} from={from} to={to} />
    </>
  );
}

/** Where the money goes between what you send and what you get. Only numbers the quote or live prices provide. */
function FeeBreakdown({ data, from, to }: { data: QuoteResponse; from: Token; to: Token }) {
  const t = useT();
  const locale = useLocale();
  const { pct, signedPct } = useMemo(
    () => ({
      pct: new Intl.NumberFormat(locale, { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      signedPct: new Intl.NumberFormat(locale, { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "exceptZero" }),
    }),
    [locale],
  );
  const req = data.quoteRequest;
  const { amountIn: amtIn, amountOut: amtOut, inUsd, outUsd, quotedRate, cost, costPct, feeBps, feeUsd, withdraw, refund, slippageBps: slippage } = quoteFees(
    data,
    from.decimals,
    to.decimals,
  );

  const marketRate = from.price > 0 && to.price > 0 ? from.price / to.price : null;
  const spread = marketRate && quotedRate ? 1 - quotedRate / marketRate : null;
  const spreadUsd = amtIn != null && amtOut != null && from.price > 0 && to.price > 0 ? amtIn * from.price - amtOut * to.price : null;

  const rows: { id: string; v: React.ReactNode; note?: boolean }[] = [
    { id: "marketRate", v: marketRate ? `1 ${from.symbol} = ${formatAmount(marketRate)} ${to.symbol}` : "—", note: true },
    { id: "quotedRate", v: quotedRate ? `1 ${from.symbol} = ${formatAmount(quotedRate)} ${to.symbol}` : "—" },
    {
      id: "spread",
      v: spread != null ? `${signedPct.format(spread)}${spreadUsd != null ? ` · ${formatUsd(spreadUsd)}` : ""}` : "—",
      note: true,
    },
    { id: "valueInOut", v: inUsd != null && outUsd != null ? `${formatUsd(inUsd)} → ${formatUsd(outUsd)}` : "—", note: true },
    {
      id: "totalCost",
      v: cost != null ? `${formatUsd(cost)}${costPct != null ? ` · ${pct.format(costPct)}` : ""}` : "—",
      note: true,
    },
    {
      id: "feesInQuote",
      v: req ? (feeBps > 0 ? `${pct.format(feeBps / 10_000)}${feeUsd != null ? ` · ≈${formatUsd(feeUsd)}` : ""}` : t("swap.none")) : "—",
      note: true,
    },
    // Referred swap: Zcan's fee is split with the referrer (src/lib/referral.ts), so the visitor pays less.
    ...(req?.appFees && req.appFees.length > 1 ? [{ id: "referral", v: req.appFees[req.appFees.length - 1].recipient, note: true }] : []),
    {
      id: "payoutFee",
      v: withdraw != null ? `${formatAmount(withdraw)} ${to.symbol}${to.price > 0 ? ` · ≈${formatUsd(withdraw * to.price)}` : ""}` : "—",
      note: true,
    },
    {
      id: "refundFee",
      v: refund != null ? `${formatAmount(refund)} ${from.symbol}${from.price > 0 ? ` · ≈${formatUsd(refund * from.price)}` : ""}` : "—",
      note: true,
    },
    { id: "slippage", v: slippage != null ? pct.format(slippage / 10_000) : "—", note: true },
  ];

  return (
    <details className="group mt-2 border border-line">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 text-[12px] uppercase tracking-wider text-muted transition-colors hover:bg-surface-2 hover:text-fg [&::-webkit-details-marker]:hidden">
        <span>{t("swap.fee.title")}</span>
        <span className="flex items-center gap-3">
          {costPct != null && <span className="tabular normal-case text-subtle">{t("swap.fee.total", { pct: pct.format(costPct) })}</span>}
          <span className="text-subtle transition-transform duration-200 group-open:rotate-45 group-open:text-accent motion-reduce:transition-none" aria-hidden>
            +
          </span>
        </span>
      </summary>
      <dl className="divide-y divide-line border-t border-line px-4 text-[12px]">
        {rows.map((r) => (
          <div key={r.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,auto)] items-baseline gap-x-4 py-2.5">
            <dt className="min-w-0">
              <span className="block uppercase tracking-wide text-subtle">{t(`swap.fee.${r.id}`)}</span>
              {r.note && <span className="mt-0.5 block text-[11px] leading-snug text-subtle/80">{t(`swap.fee.${r.id}.note`)}</span>}
            </dt>
            <dd className="tabular min-w-0 break-words text-right text-fg">{r.v}</dd>
          </div>
        ))}
      </dl>
      <p className="border-t border-line px-4 py-3 text-[11px] leading-relaxed text-subtle">
        {t("swap.fee.footer")}
      </p>
    </details>
  );
}

/**
 * Stated assumptions for "Compared with an exchange". A mid-range retail taker fee (entry tiers run from
 * about 0.1% to 1.2% at large exchanges; Kraken's starts at 0.8%) and a small fixed ZEC withdrawal fee.
 */
const CEX_TAKER_FEE = 0.006;
const CEX_ZEC_WITHDRAW_FEE = 0.001;

/** Honest estimate of the same trade on a typical centralized exchange — shown whether Zcan is better or worse. */
function ExchangeCompare({ data, from, to }: { data: QuoteResponse; from: Token; to: Token }) {
  const t = useT();
  const titleId = useId();
  const locale = useLocale();
  const fmt = useMemo(
    () => ({
      pct: new Intl.NumberFormat(locale, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }),
      fee: new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 2 }),
      diff: new Intl.NumberFormat(locale, { maximumSignificantDigits: 3 }),
      est: new Intl.NumberFormat(locale, { maximumSignificantDigits: 4 }),
      rate: new Intl.NumberFormat(locale, { maximumSignificantDigits: 6 }),
      zec: new Intl.NumberFormat(locale, { maximumFractionDigits: 8 }),
    }),
    [locale],
  );

  // Only real swaps with ZEC on exactly one side (ZEC → ZEC private sends have no exchange equivalent).
  if (isZec(from) === isZec(to)) return null;
  const { amountIn, amountOut } = quoteFees(data, from.decimals, to.decimals);
  if (!amountIn || !amountOut || !(from.price > 0) || !(to.price > 0)) return null;

  const buyingZec = isZec(to);
  const marketRate = from.price / to.price;
  const exchangeOut = amountIn * marketRate * (1 - CEX_TAKER_FEE) - (buyingZec ? CEX_ZEC_WITHDRAW_FEE : 0);
  const diff = exchangeOut > 0 ? amountOut - exchangeOut : null;
  const rel = diff != null ? diff / exchangeOut : null;
  const same = rel != null && Math.abs(rel) < 0.0005;
  const better = diff != null && diff > 0;

  const verdict =
    diff == null || rel == null
      ? t("swap.cmp.tooSmall")
      : same
        ? t("swap.cmp.same")
        : t(better ? "swap.cmp.more" : "swap.cmp.less", {
            amount: fmt.diff.format(Math.abs(diff)),
            symbol: to.symbol,
            pct: fmt.pct.format(Math.abs(rel)),
          });

  return (
    <section className="mt-2 border border-line px-4 py-3 text-[12px]" aria-labelledby={titleId}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
        <h3 id={titleId} className="flex items-center gap-2 uppercase tracking-wider text-muted">
          {t("swap.cmp.title")}
          <span className="border border-line-strong px-1.5 py-px text-[10px] tracking-wider text-subtle">{t("swap.cmp.estimate")}</span>
        </h3>
        <p
          className={`tabular min-w-0 font-medium ${diff == null || same ? "text-muted" : better ? "text-green" : "text-warn"}`}
          aria-live="polite"
        >
          {diff != null && !same && <span aria-hidden>{better ? "▲ " : "▼ "}</span>}
          {verdict}
        </p>
      </div>
      <dl className="mt-2.5 grid grid-cols-2 gap-x-6 gap-y-2">
        <div className="min-w-0">
          <dt className="micro">{t("swap.cmp.zcan")}</dt>
          <dd className="tabular mt-0.5 break-words text-fg">
            {formatAmount(amountOut)} {to.symbol}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="micro">{t("swap.cmp.exchange")}</dt>
          <dd className="tabular mt-0.5 break-words text-fg">{exchangeOut > 0 ? `≈ ${fmt.est.format(exchangeOut)} ${to.symbol}` : "—"}</dd>
        </div>
      </dl>
      <details className="group/cmp mt-2.5">
        <summary className="inline-flex min-h-6 cursor-pointer list-none items-center gap-1.5 text-[11px] text-subtle transition-colors hover:text-fg [&::-webkit-details-marker]:hidden">
          <span className="transition-transform duration-200 group-open/cmp:rotate-45 motion-reduce:transition-none" aria-hidden>
            +
          </span>
          {t("swap.cmp.how")}
        </summary>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] leading-relaxed text-subtle">
          <li>{t("swap.cmp.a.price", { from: from.symbol, rate: fmt.rate.format(marketRate), to: to.symbol })}</li>
          <li>{t("swap.cmp.a.taker", { pct: fmt.fee.format(CEX_TAKER_FEE) })}</li>
          <li>{buyingZec ? t("swap.cmp.a.withdrawZec", { fee: fmt.zec.format(CEX_ZEC_WITHDRAW_FEE) }) : t("swap.cmp.a.withdrawOther", { symbol: to.symbol })}</li>
          <li>{t("swap.cmp.a.oneTrade")}</li>
          <li>{t("swap.cmp.a.kyc")}</li>
        </ul>
      </details>
    </section>
  );
}
