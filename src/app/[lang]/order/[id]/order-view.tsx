"use client";

import Link from "@/components/locale-link";
import { useParams, useSearchParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { ArrowRight, Check, CircleAlert, CircleCheck, Copy, ExternalLink, LoaderCircle, RotateCcw, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { QuoteResponse, StatusResponse } from "@/lib/oneclick";
import { updateHistoryStatus, useHistory } from "@/lib/history";
import { useT } from "@/lib/i18n";
import { TONE_CLASS, isFinal } from "@/lib/status";
import { useStatusMeta } from "@/lib/use-status";
import { findToken, formatAmount, formatUsd, isZec, type Token } from "@/lib/tokens";
import { useTokens } from "@/lib/use-tokens";
import { TokenIcon } from "@/components/token-icon";
import { PayWithWallet } from "@/components/wallet/pay-with-wallet";
import { OrderReceipt } from "@/components/receipt/receipt";
import { RecurringOffer } from "@/components/recurring/recurring-offer";
import { ShieldOnArrival } from "@/components/shield/shield-on-arrival";

const POLL_MS = 5000;
const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

type Asset = { symbol: string; chainName: string; decimals: number; price?: number };

export function OrderView() {
  const t = useT();
  const statusMeta = useStatusMeta();
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const depositAddress = decodeURIComponent(params.id);
  const memo = search.get("memo") ?? undefined;

  const { tokens } = useTokens();
  const history = useHistory();
  const local = history.find((h) => h.depositAddress === depositAddress);
  // Orders on the backup route (ChangeNOW) carry their order reference in the link.
  const via = search.get("via") ?? local?.via ?? undefined;

  const stored = useStoredQuote(depositAddress);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [netError, setNetError] = useState(false);

  const final = isFinal(status?.status);

  useEffect(() => {
    if (final) return;
    let alive = true;
    let misses = 0;
    const poll = async () => {
      try {
        const qs = new URLSearchParams({ address: depositAddress });
        if (memo) qs.set("memo", memo);
        if (via) qs.set("via", via);
        const res = await fetch(`/api/status?${qs}`, { cache: "no-store" });
        if (!alive) return;
        if (res.status === 404) {
          // A brand-new order can take a moment to be indexed.
          misses += 1;
          if (misses >= 3) setNotFound(true);
          return;
        }
        if (!res.ok) {
          setNetError(true);
          return;
        }
        const body: StatusResponse = await res.json();
        setNetError(false);
        setNotFound(false);
        setStatus(body);
        updateHistoryStatus(depositAddress, body.status);
      } catch {
        if (alive) setNetError(true);
      }
    };
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [depositAddress, memo, via, final]);

  const qr = status?.quoteResponse ?? stored;

  const resolve = (assetId: string | undefined, fallback?: { symbol: string; chain: string }): Asset | null => {
    if (!assetId) return null;
    const tk: Token | undefined = findToken(tokens, assetId);
    if (tk) return tk;
    if (fallback) return { symbol: fallback.symbol, chainName: fallback.chain, decimals: 8 };
    return null;
  };
  const from = resolve(qr?.quoteRequest.originAsset, local && { symbol: local.fromSymbol, chain: local.fromChain });
  const to = resolve(qr?.quoteRequest.destinationAsset, local && { symbol: local.toSymbol, chain: local.toChain });
  const fromToken = qr ? findToken(tokens, qr.quoteRequest.originAsset) : undefined;
  const toToken = qr ? findToken(tokens, qr.quoteRequest.destinationAsset) : undefined;
  // Asset keys in the swap URL's "SYMBOL.chain" form, e.g. "BTC.btc" / "ZEC.zec".
  const fromKey = fromToken ? `${fromToken.symbol}.${fromToken.chain}` : local ? `${local.fromSymbol}.${local.fromChain}` : null;
  const toKey = toToken ? `${toToken.symbol}.${toToken.chain}` : local ? `${local.toSymbol}.${local.toChain}` : null;
  const paysZec = toToken ? isZec(toToken) : local ? local.toSymbol === "ZEC" && local.toChain === "zec" : false;

  if (notFound && !qr) {
    const [notFoundBefore, notFoundAfter = ""] = t("order.notFound.body").split("{address}");
    return (
      <div className="panel mx-auto max-w-[560px] p-8 text-center">
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-red/10 text-red">
          <CircleAlert aria-hidden />
        </span>
        <h1 className="mt-5 text-3xl font-medium text-fg">{t("order.notFound.title")}</h1>
        <p className="mt-3 text-muted">
          {notFoundBefore}
          <span className="break-all font-mono text-sm text-text">{depositAddress}</span>
          {notFoundAfter}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/track" className="inline-flex h-11 items-center rounded-xl border border-line px-4 font-medium hover:border-line-strong">
            {t("order.notFound.trackAnother")}
          </Link>
          <Link href="/" className="inline-flex h-11 items-center btn-accent px-4 text-[12px]">
            {t("order.newSwap")}
          </Link>
        </div>
      </div>
    );
  }

  if (!qr || !from || !to) {
    return (
      <div className="panel flex items-center gap-3 p-6 text-muted" aria-live="polite">
        <LoaderCircle className="animate-spin-slow" size={18} aria-hidden /> {t("order.loading")}
      </div>
    );
  }

  const q = qr.quote;
  const meta = statusMeta(status?.status ?? "PENDING_DEPOSIT");
  const s = status?.status ?? "PENDING_DEPOSIT";
  const awaiting = s === "PENDING_DEPOSIT" || s === "INCOMPLETE_DEPOSIT";
  const minOut = Number(q.minAmountOut) / 10 ** to.decimals;
  const fixed = qr.quoteRequest.swapType === "EXACT_OUTPUT";

  return (
    <div className="panel p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="label">{t("order.swapOrder")}</p>
          <h1 className="num mt-2 flex flex-wrap items-center gap-3 text-[32px] text-fg sm:text-[40px]">
            <span className="tabular">
              {formatAmount(q.amountInFormatted)} {from.symbol}
            </span>
            <ArrowRight className="text-subtle" aria-label={t("order.to")} />
            <span className="tabular">
              {fixed ? "" : "≈ "}
              {formatAmount(q.amountOutFormatted)} {to.symbol}
            </span>
          </h1>
        </div>
        <span className={`tag h-7 gap-2 px-2.5 text-[11px] ${TONE_CLASS[meta.tone]}`} aria-live="polite">
          {!final && <span className="size-2 rounded-full bg-current pulse-dot" aria-hidden />}
          {meta.label}
        </span>
      </div>

      <Stepper status={s} />

      {via && (
        <p className="mt-4 flex items-start gap-2 rounded-xl border border-line bg-surface/70 px-3 py-2.5 text-sm text-muted" role="note">
          <CircleAlert size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden />
          <span>
            {t("order.backup.notice")}
            {(status as { provider?: { hold?: boolean } } | null)?.provider?.hold ? ` ${t("order.backup.hold")}` : ""}
          </span>
        </p>
      )}

      {netError && (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted" role="status">
          <LoaderCircle size={14} className="animate-spin-slow" aria-hidden /> {t("order.reconnecting")}
        </p>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        <div className="card-glow rounded-[28px] p-5 sm:p-7">
          {awaiting ? (
            <DepositPanel quote={qr} from={from} payAsset={fromToken} status={status} memo={memo} backup={Boolean(via)} />
          ) : s === "SUCCESS" ? (
            <ResultPanel
              tone="done"
              title={t("order.done.title")}
              body={t("order.done.body", { amount: formatAmount(status?.swapDetails.amountOutFormatted ?? q.amountOutFormatted), symbol: to.symbol })}
              status={status}
            />
          ) : s === "REFUNDED" ? (
            <ResultPanel
              tone="bad"
              title={t("order.refunded.title")}
              body={[
                status?.swapDetails.refundedAmountFormatted
                  ? t("order.refunded.some", { amount: formatAmount(status.swapDetails.refundedAmountFormatted), symbol: from.symbol })
                  : t("order.refunded.all"),
                status?.swapDetails.refundReason ? t("order.refunded.reason", { reason: status.swapDetails.refundReason }) : "",
              ]
                .filter(Boolean)
                .join(" ")}
              status={status}
            />
          ) : s === "FAILED" ? (
            <ResultPanel
              tone="bad"
              title={t("order.failed.title")}
              body={t("order.failed.body")}
              status={status}
            />
          ) : (
            <ProcessingPanel status={status} to={to} minutes={Math.max(1, Math.round(q.timeEstimate / 60))} />
          )}
        </div>

        <aside className="rounded-[28px] border border-line bg-surface/70 p-5 sm:p-7" aria-label={t("order.detailsAria")}>
          <h2 className="label">{t("order.details")}</h2>
          <dl className="mt-4 space-y-4 text-sm">
            <Row label={t("order.youSend")}>
              <span className="flex items-center gap-2">
                <TokenIcon symbol={from.symbol} size={20} />
                <span className="tabular">
                  {formatAmount(q.amountInFormatted)} {from.symbol}
                </span>
                <span className="text-subtle">· {from.chainName}</span>
              </span>
            </Row>
            <Row label={fixed ? t("order.youGetFixed") : t("order.youGetEstimated")}>
              <span className="flex items-center gap-2">
                <TokenIcon symbol={to.symbol} size={20} />
                <span className="tabular">
                  {formatAmount(q.amountOutFormatted)} {to.symbol}
                </span>
                <span className="text-subtle">· {to.chainName}</span>
              </span>
            </Row>
            <Row label={t("order.minimum")}>
              <span className="tabular">
                {formatAmount(minOut)} {to.symbol}
              </span>
            </Row>
            <Row label={t("order.value")}>
              <span className="tabular">
                {formatUsd(Number(q.amountInUsd))} → {formatUsd(Number(q.amountOutUsd))}
              </span>
            </Row>
            <Row label={t("order.recipient")}>
              <CopyText value={qr.quoteRequest.recipient} />
            </Row>
            <Row label={t("order.refundAddress")}>
              <CopyText value={qr.quoteRequest.refundTo} />
            </Row>
            <Row label={t("order.created")}>{dateFmt.format(new Date(qr.timestamp))}</Row>
            <Row label={t("order.orderId")}>
              <CopyText value={depositAddress} />
            </Row>
          </dl>
          <p className="mt-6 border-t border-line pt-4 text-xs leading-relaxed text-subtle">
            {t("order.bookmark")}
            {qr.signature && (
              <>
                {" "}
                <span className="break-all font-mono">{qr.signature.slice(0, 28)}…</span>
              </>
            )}
          </p>
        </aside>
      </div>

      <div className="mt-6 grid gap-4">
        {s === "SUCCESS" && paysZec && <ShieldOnArrival depositAddress={depositAddress} recipient={qr.quoteRequest.recipient} />}
        {s === "SUCCESS" && fromKey && toKey && (
          <RecurringOffer
            from={fromKey}
            to={toKey}
            amount={status?.swapDetails.amountInFormatted ?? q.amountInFormatted}
            recipient={qr.quoteRequest.recipient}
          />
        )}
        <OrderReceipt quote={qr} status={status} from={from} to={to} depositAddress={depositAddress} memo={memo} />
      </div>
    </div>
  );
}

/** Placeholder while the order view mounts (used as the page's Suspense fallback). */
export function OrderSkeleton() {
  const t = useT();
  return (
    <div className="panel p-6" aria-busy="true" aria-label={t("order.loadingAria")}>
      <div className="h-9 w-56 animate-pulse rounded-lg bg-surface-2" />
      <div className="mt-8 h-16 animate-pulse rounded-2xl bg-surface" />
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        <div className="h-[420px] animate-pulse rounded-[28px] bg-surface" />
        <div className="h-[420px] animate-pulse rounded-[28px] bg-surface" />
      </div>
    </div>
  );
}

const noop = () => () => {};

/** The quote is cached in sessionStorage right after creation so the page renders instantly. */
function useStoredQuote(depositAddress: string): QuoteResponse | null {
  const raw = useSyncExternalStore(
    noop,
    () => {
      try {
        return sessionStorage.getItem(`zcan:quote:${depositAddress}`);
      } catch {
        return null;
      }
    },
    () => null,
  );
  return useMemo(() => {
    try {
      return raw ? (JSON.parse(raw) as QuoteResponse) : null;
    } catch {
      return null;
    }
  }, [raw]);
}

function subscribeClock(cb: () => void) {
  const id = setInterval(cb, 1000);
  return () => clearInterval(id);
}

/** Current time in whole seconds; null during server render. */
function useNowSeconds(): number | null {
  return useSyncExternalStore(subscribeClock, () => Math.floor(Date.now() / 1000), () => null);
}

const STEPS = ["awaiting", "confirming", "exchanging", "completed"] as const;

function Stepper({ status }: { status: string }) {
  const t = useT();
  const meta = useStatusMeta()(status);
  const failed = meta.tone === "bad" && meta.step === 4;
  return (
    <ol className="mt-8 grid grid-cols-4 gap-2" aria-label={t("order.progress")}>
      {STEPS.map((step, i) => {
        const done = meta.step > i || (meta.step === 4 && !failed);
        const current = meta.step === i && meta.step < 4;
        return (
          <li key={step} aria-current={current ? "step" : undefined}>
            <div
              className={`h-1.5 rounded-full transition-colors duration-500 ${
                done ? (failed && i === 3 ? "bg-red" : "bg-accent") : current ? "bg-accent/50" : "bg-surface-3"
              } ${failed && i === 3 ? "bg-red" : ""}`}
            />
            <p className={`mt-2 hidden text-xs sm:block ${done || current ? "text-fg" : "text-subtle"}`}>
              {i === 3 && failed ? meta.label : t(`order.step.${step}`)}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

function DepositPanel({
  quote,
  from,
  payAsset,
  status,
  memo,
  backup,
}: {
  quote: QuoteResponse;
  from: Asset;
  payAsset?: Token;
  status: StatusResponse | null;
  memo?: string;
  /** Backup-route orders can't take a deposit hash: ChangeNOW detects deposits itself. */
  backup?: boolean;
}) {
  const q = quote.quote;
  const deposit = q.depositAddress!;
  const incomplete = status?.status === "INCOMPLETE_DEPOSIT";
  // The provider's own memo wins; the ?memo= in the link is only needed to look the order up.
  const depositMemo = q.depositMemo ?? memo;
  const t = useT();
  const [withinBefore, withinAfter = ""] = t("order.depositWithin").split("{time}");

  return (
    <div>
      <h2 className="label text-fg">{t("order.deposit.title")}</h2>
      <p className="mt-1 text-sm text-muted">{t("order.deposit.body")}</p>

      {incomplete && (
        <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-red/30 bg-red/10 px-3 py-2.5 text-sm text-red">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            {status?.swapDetails.depositedAmountFormatted
              ? t("order.incomplete", { amount: status.swapDetails.depositedAmountFormatted, symbol: from.symbol })
              : t("order.incompleteUnknown", { symbol: from.symbol })}
          </span>
        </p>
      )}

      {!incomplete && (
        <PayWithWallet
          className="mt-5"
          depositAddress={deposit}
          memo={depositMemo}
          assetId={quote.quoteRequest.originAsset}
          asset={payAsset}
          amount={q.amountIn}
          deadline={q.deadline}
        />
      )}

      <div className="mt-6 grid gap-6 sm:grid-cols-[auto_1fr] sm:items-start">
        <div className="mx-auto rounded-2xl bg-white p-3 sm:mx-0">
          <QRCodeSVG value={deposit} size={168} level="M" marginSize={0} title={t("order.qr")} />
        </div>
        <div className="min-w-0 space-y-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-subtle">{t("order.amount")}</p>
            <div className="mt-1.5 flex items-center gap-2">
              <TokenIcon symbol={from.symbol} size={26} />
              <span className="num text-[28px] text-fg">{q.amountInFormatted}</span>
              <span className="text-lg text-muted">{from.symbol}</span>
              <CopyButton value={q.amountInFormatted} label={t("order.copyAmount")} />
            </div>
            <p className="mt-1 text-xs text-subtle">{t("order.onChain", { chain: from.chainName })}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-subtle">{t("order.depositAddress")}</p>
            <div className="mt-1.5 flex items-start gap-2 rounded-xl border border-line bg-bg-2/70 p-3">
              <span className="min-w-0 flex-1 break-all font-mono text-[15px] leading-snug text-fg">{deposit}</span>
              <CopyButton value={deposit} label={t("order.copyDeposit")} />
            </div>
          </div>
          {depositMemo && (
            <div>
              <p className="text-xs uppercase tracking-wider text-subtle">{t("order.memo")}</p>
              <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-accent/40 bg-accent/[0.06] p-3">
                <span className="flex-1 break-all font-mono text-[15px] text-fg">{depositMemo}</span>
                <CopyButton value={depositMemo} label={t("order.copyMemo")} />
              </div>
            </div>
          )}
        </div>
      </div>

      <ul className="mt-6 space-y-2 text-[13px] leading-relaxed text-muted">
        <li className="flex gap-2">
          <TriangleAlert size={15} className="mt-0.5 shrink-0 text-accent" aria-hidden />
          <span>{t("order.sendOnly", { symbol: from.symbol, chain: from.chainName })}</span>
        </li>
        {q.deadline && (
          <li className="flex gap-2">
            <RotateCcw size={15} className="mt-0.5 shrink-0 text-subtle" aria-hidden />
            <span>
              {withinBefore}
              <Countdown to={q.deadline} />
              {withinAfter}
            </span>
          </li>
        )}
      </ul>

      {!backup && <TxHashForm depositAddress={deposit} memo={depositMemo} />}
    </div>
  );
}

function ProcessingPanel({ status, to, minutes }: { status: StatusResponse | null; to: Asset; minutes: number }) {
  const t = useT();
  return (
    <div className="flex flex-col items-center py-8 text-center">
      <span className="relative flex size-16 items-center justify-center rounded-full bg-accent/10 text-accent">
        <LoaderCircle size={28} className="animate-spin-slow" aria-hidden />
      </span>
      <h2 className="mt-5 text-xl font-medium text-fg">
        {status?.status === "KNOWN_DEPOSIT_TX" ? t("order.processing.confirming") : t("order.processing.exchanging")}
      </h2>
      <p className="mt-2 max-w-sm text-sm text-muted">
        {t("order.processing.body", { symbol: to.symbol, n: minutes })}
      </p>
      <TxLinks status={status} />
    </div>
  );
}

function ResultPanel({ tone, title, body, status }: { tone: "done" | "bad"; title: string; body: string; status: StatusResponse | null }) {
  const t = useT();
  return (
    <div className="flex flex-col items-center py-8 text-center">
      <span className={`flex size-16 items-center justify-center rounded-full ${tone === "done" ? "bg-green/12 text-green" : "bg-red/12 text-red"}`}>
        {tone === "done" ? <CircleCheck size={30} aria-hidden /> : <RotateCcw size={28} aria-hidden />}
      </span>
      <h2 className="mt-5 text-2xl font-medium text-fg">{title}</h2>
      <p className="mt-2 max-w-sm text-sm text-muted">{body}</p>
      <TxLinks status={status} />
      <Link href="/" className="mt-7 inline-flex h-12 items-center gap-2 btn-accent px-6 text-[12px]">
        {t("order.startNew")} <ArrowRight size={16} aria-hidden />
      </Link>
    </div>
  );
}

function TxLinks({ status }: { status: StatusResponse | null }) {
  const t = useT();
  const d = status?.swapDetails;
  const links = [
    ...(d?.originChainTxHashes ?? []).map((h) => ({ ...h, label: t("order.tx.deposit") })),
    ...(d?.destinationChainTxHashes ?? []).map((h) => ({ ...h, label: t("order.tx.payout") })),
  ].filter((l) => l.explorerUrl);
  if (!links.length) return null;
  return (
    <ul className="mt-6 w-full max-w-sm space-y-2">
      {links.map((l) => (
        <li key={l.hash}>
          <a
            href={l.explorerUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3 text-sm transition-colors hover:border-line-strong"
          >
            <span className="text-muted">{l.label}</span>
            <span className="flex min-w-0 items-center gap-1.5 font-mono text-fg">
              <span className="truncate">
                {l.hash.slice(0, 8)}…{l.hash.slice(-6)}
              </span>
              <ExternalLink size={14} className="shrink-0 text-subtle" aria-hidden />
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function TxHashForm({ depositAddress, memo }: { depositAddress: string; memo?: string }) {
  const t = useT();
  const [hash, setHash] = useState("");
  const [state, setState] = useState<{ kind: "idle" | "sending" | "ok" | "error"; message?: string }>({ kind: "idle" });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const txHash = hash.trim();
    if (!txHash) return setState({ kind: "error", message: t("order.hash.empty") });
    setState({ kind: "sending" });
    try {
      const res = await fetch("/api/deposit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ txHash, depositAddress, memo }),
      });
      const body = await res.json();
      setState(res.ok ? { kind: "ok" } : { kind: "error", message: body.message });
    } catch {
      setState({ kind: "error", message: t("order.hash.network") });
    }
  };

  if (state.kind === "ok")
    return (
      <p className="mt-6 flex items-center gap-2 rounded-xl border border-green/30 bg-green/10 px-3 py-2.5 text-sm text-green" role="status">
        <Check size={16} aria-hidden /> {t("order.hash.thanks")}
      </p>
    );

  return (
    <details className="group mt-6 rounded-xl border border-line">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm text-muted hover:text-fg [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">{t("order.hash.summary")}</span>
        <span className="transition-transform group-open:rotate-45" aria-hidden>
          +
        </span>
      </summary>
      <form onSubmit={submit} className="flex flex-col gap-2 px-4 pb-4 sm:flex-row">
        <label className="sr-only" htmlFor="txhash">
          {t("order.hash.label")}
        </label>
        <input
          id="txhash"
          name="txhash"
          value={hash}
          onChange={(e) => setHash(e.target.value)}
          placeholder={t("order.hash.placeholder")}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={state.kind === "error" || undefined}
          aria-describedby={state.kind === "error" ? "txhash-err" : undefined}
          className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-bg-2 px-3 font-mono text-base text-fg outline-none placeholder:font-sans placeholder:text-sm placeholder:text-subtle focus:border-accent/60"
        />
        <button
          type="submit"
          disabled={state.kind === "sending"}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-surface-3 px-4 text-sm font-medium text-fg hover:bg-surface-3/80 disabled:opacity-70"
        >
          {state.kind === "sending" && <LoaderCircle size={14} className="animate-spin-slow" aria-hidden />}
          {t("order.hash.submit")}
        </button>
      </form>
      {state.kind === "error" && (
        <p id="txhash-err" role="alert" className="px-4 pb-4 text-[13px] text-red">
          {state.message}
        </p>
      )}
    </details>
  );
}

function Countdown({ to }: { to: string }) {
  const end = useMemo(() => Math.floor(new Date(to).getTime() / 1000), [to]);
  const now = useNowSeconds();
  if (now === null) return <span className="tabular font-medium text-fg">—</span>;
  const left = Math.max(0, end - now);
  const h = Math.floor(left / 3600);
  const m = Math.floor((left % 3600) / 60);
  const sec = left % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <span className="tabular font-medium text-fg">
      {h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`}
    </span>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs text-subtle">{label}</dt>
      <dd className="min-w-0 text-fg">{children}</dd>
    </div>
  );
}

function CopyText({ value }: { value: string }) {
  const t = useT();
  return (
    <span className="flex items-center gap-1.5">
      <span className="min-w-0 truncate font-mono text-[13px]" title={value}>
        {value}
      </span>
      <CopyButton value={value} label={t("common.copy")} small />
    </span>
  );
}

function CopyButton({ value, label, small }: { value: string; label: string; small?: boolean }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {}
      }}
      aria-label={copied ? t("common.copied") : label}
      className={`inline-flex shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-3 hover:text-fg ${
        small ? "size-8" : "size-9"
      }`}
    >
      {copied ? <Check size={small ? 14 : 16} className="text-green" aria-hidden /> : <Copy size={small ? 14 : 16} aria-hidden />}
      <span className="sr-only" aria-live="polite">
        {copied ? t("common.copied") : ""}
      </span>
    </button>
  );
}
