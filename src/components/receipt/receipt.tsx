"use client";

import { Download, ExternalLink, Printer, ReceiptText } from "lucide-react";
import { useMemo, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import type { QuoteResponse, StatusResponse, TxDetails } from "@/lib/oneclick";
import { useLocale, useT } from "@/lib/i18n";
import { useStatusMeta } from "@/lib/use-status";
import { formatAmount, formatUsd } from "@/lib/tokens";
import { quoteFees } from "./fees";

export type ReceiptAsset = { symbol: string; chainName: string; decimals: number };
type ReceiptState = "pending" | "completed" | "refunded" | "failed";

type Props = {
  quote: QuoteResponse;
  status: StatusResponse | null;
  from: ReceiptAsset;
  to: ReceiptAsset;
  depositAddress: string;
  memo?: string;
};

const stateOf = (s?: string): ReceiptState =>
  s === "SUCCESS" ? "completed" : s === "REFUNDED" ? "refunded" : s === "FAILED" ? "failed" : "pending";

/** Hides everything but the receipt while printing. Mounted only for the duration of a print. */
const PRINT_CSS = `@media print {
  @page { margin: 14mm; }
  html, body { background: #fff !important; color: #000 !important; }
  body > *:not(.zcan-print-root) { display: none !important; }
}`;

/**
 * On-device swap receipt: an on-screen card, "Print / Save as PDF" (only the receipt prints) and a JSON
 * download. Nothing is sent anywhere.
 */
export function OrderReceipt(props: Props) {
  const t = useT();
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);
  const [printAt, setPrintAt] = useState<Date | null>(null);

  const print = () => {
    const now = new Date();
    flushSync(() => {
      setGeneratedAt(now);
      setPrintAt(now);
    });
    window.addEventListener("afterprint", () => setPrintAt(null), { once: true });
    window.print();
  };

  const download = () => {
    const now = new Date();
    setGeneratedAt(now);
    const blob = new Blob([JSON.stringify(receiptJson(props, now), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `zcan-receipt-${props.depositAddress.slice(0, 12).replace(/[^\w-]/g, "")}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <details
      className="group border border-line"
      onToggle={(e) => {
        if ((e.currentTarget as HTMLDetailsElement).open && !generatedAt) setGeneratedAt(new Date());
      }}
    >
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-surface-2 sm:px-5 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-3">
          <ReceiptText size={18} className="shrink-0 text-accent" aria-hidden />
          <span className="min-w-0">
            <span className="block text-[13px] font-medium uppercase tracking-wider text-fg">{t("order.receipt.title")}</span>
            <span className="block text-[12px] text-subtle">{t("order.receipt.summary")}</span>
          </span>
        </span>
        <span className="text-subtle transition-transform duration-200 group-open:rotate-45 group-open:text-accent motion-reduce:transition-none" aria-hidden>
          +
        </span>
      </summary>
      <div className="border-t border-line p-4 sm:p-5">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={print} className="btn-accent inline-flex h-10 items-center gap-2 px-4 text-[12px]">
            <Printer size={15} aria-hidden /> {t("order.receipt.print")}
          </button>
          <button
            type="button"
            onClick={download}
            className="inline-flex h-10 items-center gap-2 border border-line-strong px-4 text-[12px] font-medium uppercase tracking-wider text-fg transition-colors hover:bg-surface-3"
          >
            <Download size={15} aria-hidden /> {t("order.receipt.json")}
          </button>
        </div>
        <div className="mt-4">
          <ReceiptDocument {...props} generatedAt={generatedAt} />
        </div>
      </div>
      {printAt &&
        createPortal(
          <div className="zcan-print-root hidden bg-white text-black print:block">
            <style>{PRINT_CSS}</style>
            <ReceiptDocument {...props} generatedAt={printAt} paper />
          </div>,
          document.body,
        )}
    </details>
  );
}

function ReceiptDocument({ quote: qr, status, from, to, depositAddress, memo, generatedAt, paper }: Props & { generatedAt: Date | null; paper?: boolean }) {
  const t = useT();
  const locale = useLocale();
  const statusMeta = useStatusMeta();
  const fmt = useMemo(
    () => ({
      date: new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "medium" }),
      pct: new Intl.NumberFormat(locale, { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    }),
    [locale],
  );
  const date = (v?: string | Date | null) => {
    if (!v) return "—";
    const d = v instanceof Date ? v : new Date(v);
    return Number.isNaN(d.getTime()) ? "—" : fmt.date.format(d);
  };

  const q = qr.quote;
  const s = status?.status ?? "PENDING_DEPOSIT";
  const state = stateOf(status?.status);
  const d = status?.swapDetails;
  const f = quoteFees(qr, from.decimals, to.decimals);
  const amountIn = d?.amountInFormatted ?? q.amountInFormatted;
  const amountOut = state === "completed" ? (d?.amountOutFormatted ?? q.amountOutFormatted) : q.amountOutFormatted;
  const minOut = Number(q.minAmountOut) / 10 ** to.decimals;

  const c = paper
    ? { box: "border-neutral-300 bg-white text-black", line: "border-neutral-300", label: "text-neutral-600", value: "text-black", muted: "text-neutral-600" }
    : { box: "border-line bg-bg-2/60 text-text", line: "border-line", label: "text-subtle", value: "text-fg", muted: "text-subtle" };
  const stamp: Record<ReceiptState, string> = paper
    ? { pending: "border-black text-black", completed: "border-black text-black", refunded: "border-black text-black", failed: "border-black text-black" }
    : { pending: "border-accent/60 text-accent", completed: "border-green/60 text-green", refunded: "border-red/60 text-red", failed: "border-red/60 text-red" };

  const rows: { label: string; value: React.ReactNode; mono?: boolean }[] = [
    { label: t("order.receipt.amountIn"), value: `${amountIn} ${from.symbol} · ${from.chainName}` },
    {
      label: state === "completed" ? t("order.receipt.amountOut") : t("order.receipt.quotedOut"),
      value: `${amountOut} ${to.symbol} · ${to.chainName}`,
    },
    ...(state === "completed" ? [] : [{ label: t("order.receipt.minimum"), value: `${formatAmount(minOut)} ${to.symbol}` }]),
    ...(state === "refunded" && d?.refundedAmountFormatted
      ? [{ label: t("order.receipt.refunded"), value: `${d.refundedAmountFormatted} ${from.symbol}` }]
      : []),
    { label: t("order.receipt.rate"), value: f.quotedRate ? `1 ${from.symbol} = ${formatAmount(f.quotedRate)} ${to.symbol}` : "—" },
    { label: t("order.receipt.value"), value: f.inUsd != null && f.outUsd != null ? `${formatUsd(f.inUsd)} → ${formatUsd(f.outUsd)}` : "—" },
    { label: t("order.receipt.cost"), value: f.cost != null ? `${formatUsd(f.cost)}${f.costPct != null ? ` · ${fmt.pct.format(f.costPct)}` : ""}` : "—" },
    {
      label: t("order.receipt.appFee"),
      value: f.feeBps > 0 ? `${fmt.pct.format(f.feeBps / 10_000)}${f.feeUsd != null ? ` · ≈${formatUsd(f.feeUsd)}` : ""}` : t("order.receipt.none"),
    },
    { label: t("order.receipt.payoutFee"), value: f.withdraw != null ? `${formatAmount(f.withdraw)} ${to.symbol}` : "—" },
    { label: t("order.receipt.refundFee"), value: f.refund != null ? `${formatAmount(f.refund)} ${from.symbol}` : "—" },
    { label: t("order.receipt.slippage"), value: f.slippageBps != null ? fmt.pct.format(f.slippageBps / 10_000) : "—" },
    { label: t("order.receipt.depositAddress"), value: q.depositAddress ?? depositAddress, mono: true },
    ...(memo || q.depositMemo ? [{ label: t("order.receipt.memo"), value: memo ?? q.depositMemo, mono: true }] : []),
    { label: t("order.receipt.recipient"), value: qr.quoteRequest.recipient, mono: true },
    { label: t("order.receipt.refundTo"), value: qr.quoteRequest.refundTo, mono: true },
    { label: t("order.receipt.depositTx"), value: <TxList txs={d?.originChainTxHashes} paper={paper} />, mono: true },
    { label: t("order.receipt.payoutTx"), value: <TxList txs={d?.destinationChainTxHashes} paper={paper} />, mono: true },
    { label: t("order.receipt.created"), value: date(qr.timestamp) },
    ...(q.deadline ? [{ label: t("order.receipt.deadline"), value: date(q.deadline) }] : []),
    ...(status?.updatedAt ? [{ label: t("order.receipt.updated"), value: date(status.updatedAt) }] : []),
    { label: t("order.receipt.generated"), value: date(generatedAt) },
    { label: t("order.receipt.route"), value: <span translate="no">NEAR Intents 1Click</span> },
    { label: t("order.receipt.orderId"), value: depositAddress, mono: true },
  ];

  return (
    <article className={`border p-4 sm:p-6 ${c.box}`} aria-label={t("order.receipt.heading")}>
      <header className={`flex flex-wrap items-start justify-between gap-3 border-b pb-4 ${c.line}`}>
        <div className="min-w-0">
          <p className={`text-[11px] uppercase tracking-[0.18em] ${c.muted}`} translate="no">
            Zcan
          </p>
          <h3 className={`mt-1 text-xl font-medium ${c.value}`}>{t("order.receipt.heading")}</h3>
          <p className={`tabular mt-1 text-sm ${c.muted}`}>
            {formatAmount(amountIn)} {from.symbol} → {state === "completed" ? "" : "≈ "}
            {formatAmount(amountOut)} {to.symbol}
          </p>
        </div>
        <p className={`shrink-0 border-2 px-3 py-1 text-center text-[12px] font-semibold uppercase tracking-[0.14em] ${stamp[state]}`}>
          {t(`order.receipt.state.${state}`)}
          <span className="block text-[10px] font-normal normal-case tracking-normal">{statusMeta(s).label}</span>
        </p>
      </header>

      {state === "pending" && <p className={`mt-3 text-[12px] leading-relaxed ${c.muted}`}>{t("order.receipt.pendingNote")}</p>}

      <dl className={`mt-2 divide-y text-[13px] ${paper ? "divide-neutral-200" : "divide-line"}`}>
        {rows.map((r) => (
          <div key={r.label} className="grid gap-x-4 gap-y-0.5 py-2 sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)] print:grid-cols-[180px_minmax(0,1fr)]">
            <dt className={c.label}>{r.label}</dt>
            <dd className={`tabular min-w-0 break-all ${c.value} ${r.mono ? "font-mono text-[12px]" : ""}`}>{r.value}</dd>
          </div>
        ))}
      </dl>

      <footer className={`mt-4 border-t pt-3 text-[11px] leading-relaxed ${c.line} ${c.muted}`}>{t("order.receipt.footer")}</footer>
    </article>
  );
}

function TxList({ txs, paper }: { txs?: TxDetails[]; paper?: boolean }) {
  const t = useT();
  if (!txs?.length) return <span className="font-sans">{t("order.receipt.noTx")}</span>;
  return (
    <ul className="space-y-1">
      {txs.map((tx) => (
        <li key={tx.hash} className="break-all">
          {tx.explorerUrl && !paper ? (
            <a href={tx.explorerUrl} target="_blank" rel="noreferrer" className="inline-flex items-start gap-1 underline-offset-2 hover:text-accent hover:underline">
              <span className="break-all">{tx.hash}</span>
              <ExternalLink size={12} className="mt-0.5 shrink-0" aria-hidden />
            </a>
          ) : (
            <>
              {tx.hash}
              {paper && tx.explorerUrl && <span className="block font-sans text-[10px] text-neutral-600">{tx.explorerUrl}</span>}
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Machine-readable receipt — the same facts as the printed one. */
function receiptJson({ quote: qr, status, from, to, depositAddress, memo }: Props, generatedAt: Date) {
  const q = qr.quote;
  const d = status?.swapDetails;
  const f = quoteFees(qr, from.decimals, to.decimals);
  const tx = (list?: TxDetails[]) => (list ?? []).map((x) => ({ hash: x.hash, explorerUrl: x.explorerUrl || null }));
  return {
    kind: "zcan-swap-receipt",
    version: 1,
    note: "Generated on this device by Zcan — not stored by Zcan.",
    orderId: depositAddress,
    state: stateOf(status?.status),
    status: status?.status ?? "PENDING_DEPOSIT",
    route: "NEAR Intents 1Click",
    swapType: qr.quoteRequest.swapType,
    send: {
      symbol: from.symbol,
      chain: from.chainName,
      assetId: qr.quoteRequest.originAsset,
      quoted: q.amountInFormatted,
      actual: d?.amountInFormatted ?? null,
    },
    receive: {
      symbol: to.symbol,
      chain: to.chainName,
      assetId: qr.quoteRequest.destinationAsset,
      quoted: q.amountOutFormatted,
      minimum: Number(q.minAmountOut) / 10 ** to.decimals,
      actual: d?.amountOutFormatted ?? null,
    },
    refunded: d?.refundedAmountFormatted ?? null,
    refundReason: d?.refundReason ?? null,
    quotedRate: f.quotedRate,
    valueUsd: { in: f.inUsd, out: f.outUsd },
    fees: {
      totalCostUsd: f.cost,
      totalCostPct: f.costPct,
      feesInQuoteBps: f.feeBps,
      payoutFee: f.withdraw != null ? `${f.withdraw} ${to.symbol}` : null,
      refundFee: f.refund != null ? `${f.refund} ${from.symbol}` : null,
      slippageToleranceBps: f.slippageBps,
    },
    depositAddress: q.depositAddress ?? depositAddress,
    depositMemo: memo ?? q.depositMemo ?? null,
    recipient: qr.quoteRequest.recipient,
    refundTo: qr.quoteRequest.refundTo,
    transactions: { deposit: tx(d?.originChainTxHashes), payout: tx(d?.destinationChainTxHashes) },
    timestamps: {
      quoteCreated: qr.timestamp,
      depositDeadline: q.deadline ?? null,
      lastStatusUpdate: status?.updatedAt ?? null,
      generated: generatedAt.toISOString(),
    },
  };
}
