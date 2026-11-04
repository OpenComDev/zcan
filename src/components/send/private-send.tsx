"use client";

import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ClipboardPaste,
  Clock,
  Equal,
  FileUp,
  Lightbulb,
  ListPlus,
  LoaderCircle,
  Plus,
  RotateCcw,
  Shuffle,
  Trash2,
  X,
} from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";
import type { QuoteResponse } from "@/lib/oneclick";
import { newBatchId, saveBatch, type Batch } from "@/lib/batches";
import { track } from "@/lib/analytics";
import { addHistory } from "@/lib/history";
import { getReferral } from "@/lib/referral-store";
import { addressHint, formatAmount, formatUsd, isZec, type Token } from "@/lib/tokens";
import { useLocalePath, useT } from "@/lib/i18n";
import { useTokens } from "@/lib/use-tokens";
import { Panel } from "../hud/panel";
import { TokenIcon } from "../token-icon";
import { TokenPicker } from "../token-picker";
import { SplitDiagram } from "./split-diagram";

type Row = { id: number; address: string; pct: string; delay: number; error?: string };

const MAX_ROWS = 10;
const DELAYS = [0, 5, 15, 30, 60, 120];
const TIPS = ["delays", "uneven", "shielded", "makers", "refund", "keepOpen"];

const key = (t?: Token) => (t ? `${t.symbol}.${t.chain}` : "");
const sanitize = (v: string) => {
  const s = v.replace(/,/g, ".").replace(/[^\d.]/g, "");
  const [a, ...rest] = s.split(".");
  return rest.length ? `${a}.${rest.join("")}` : a;
};
const evenSplit = (n: number) => {
  const base = Math.floor((100 / n) * 100) / 100;
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? +(100 - base * (n - 1)).toFixed(2) : base));
};

let rowSeq = 0;
const makeRows = (n: number): Row[] => evenSplit(n).map((p) => ({ id: ++rowSeq, address: "", pct: String(p), delay: 0 }));

/** Parse "address[,percent[,delayMinutes]]" lines (bulk paste or CSV). */
function parseLines(text: string): { address: string; pct?: number; delay?: number }[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^address\b/i.test(l))
    .map((l) => {
      const [address, pct, delay] = l.split(/[,;\t]/).map((x) => x.trim());
      return { address, pct: pct ? Number(pct) : undefined, delay: delay ? Number(delay) : undefined };
    })
    .filter((r) => r.address);
}

export function PrivateSend() {
  const t = useT();
  const router = useRouter();
  const lp = useLocalePath();
  const { tokens } = useTokens();
  const [fromKey, setFromKey] = useState("ZEC.zec");
  const [toKey, setToKey] = useState("ZEC.zec");
  const [amount, setAmount] = useState("1");
  const [refundTo, setRefundTo] = useState("");
  const [rows, setRows] = useState<Row[]>(() => makeRows(3));
  const [picker, setPicker] = useState<null | "from" | "to">(null);
  const [tip, setTip] = useState(0);
  const [showTips, setShowTips] = useState(true);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [busy, setBusy] = useState<null | { phase: "check" | "create"; done: number }>(null);
  const [errors, setErrors] = useState<{ amount?: string; refund?: string; total?: string; general?: string }>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const refundRef = useRef<HTMLInputElement>(null);
  const ids = { amount: useId(), refund: useId() };

  const from = tokens.find((tk) => key(tk) === fromKey);
  const to = tokens.find((tk) => key(tk) === toKey);
  const total = Number(amount) || 0;
  const pctSum = rows.reduce((s, r) => s + (Number(r.pct) || 0), 0);
  const rate = from && to ? from.price / to.price : 1;

  const choose = (side: "from" | "to", tk: Token) => {
    const setSide = side === "from" ? setFromKey : setToKey;
    const other = side === "from" ? to : from;
    setSide(key(tk));
    // ZEC must be on at least one side.
    if (!isZec(tk) && !isZec(other)) (side === "from" ? setToKey : setFromKey)("ZEC.zec");
  };

  const update = (id: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch, error: patch.address !== undefined ? undefined : r.error } : r)));
  const resplit = (rs: Row[]) => evenSplit(rs.length).map((p, i) => ({ ...rs[i], pct: String(p) }));
  const addRow = () => setRows((rs) => (rs.length >= MAX_ROWS ? rs : resplit([...rs, { id: ++rowSeq, address: "", pct: "0", delay: 0 }])));
  const removeRow = (id: number) => setRows((rs) => (rs.length <= 1 ? rs : resplit(rs.filter((r) => r.id !== id))));
  const randomize = () =>
    setRows((rs) => {
      // Random weights with a floor so no leg is dust, then random staggered delays.
      const w = rs.map(() => 0.4 + Math.random());
      const sum = w.reduce((a, b) => a + b, 0);
      const pcts = w.map((x) => Math.round((x / sum) * 10000) / 100);
      pcts[pcts.length - 1] = +(100 - pcts.slice(0, -1).reduce((a, b) => a + b, 0)).toFixed(2);
      return rs.map((r, i) => ({ ...r, pct: String(pcts[i]), delay: i === 0 ? 0 : DELAYS[1 + Math.floor(Math.random() * (DELAYS.length - 1))] }));
    });
  const importLines = (text: string) => {
    const parsed = parseLines(text).slice(0, MAX_ROWS);
    if (!parsed.length) return;
    const hasPct = parsed.every((p) => p.pct && p.pct > 0);
    const even = evenSplit(parsed.length);
    setRows(
      parsed.map((p, i) => ({
        id: ++rowSeq,
        address: p.address,
        pct: String(hasPct ? p.pct : even[i]),
        delay: p.delay && DELAYS.includes(p.delay) ? p.delay : 0,
      })),
    );
  };

  const legs = useMemo(
    () =>
      rows.map((r, i) => ({
        label: r.address ? `${r.address.slice(0, 6)}…${r.address.slice(-4)}` : t("send.destination", { n: i + 1 }),
        pct: Number(r.pct) || 0,
        delayMin: r.delay,
        ok: Boolean(r.address.trim()),
      })),
    [rows, t],
  );

  const legAmount = (r: Row) => (total * (Number(r.pct) || 0)) / 100;

  const quoteLeg = async (r: Row, dry: boolean) => {
    const res = await fetch("/api/quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ from: from!.id, to: to!.id, amount: String(+legAmount(r).toFixed(8)), mode: "float", recipient: r.address.trim(), refundTo: refundTo.trim(), dry, ref: getReferral() }),
    });
    const body = await res.json();
    return { ok: res.ok, body };
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!from || !to) return;
    const next: typeof errors = {};
    if (!(total > 0)) next.amount = t("send.err.amount");
    if (!refundTo.trim()) next.refund = t("send.err.refund", { symbol: from.symbol });
    if (Math.abs(pctSum - 100) > 0.01) next.total = t("send.err.total", { pct: pctSum.toFixed(2) });
    const rowErrs = rows.map((r) => (!r.address.trim() ? t("send.err.address", { symbol: to.symbol }) : !(Number(r.pct) > 0) ? t("send.err.share") : undefined));
    setRows((rs) => rs.map((r, i) => ({ ...r, error: rowErrs[i] })));
    setErrors(next);
    if (next.amount) return amountRef.current?.focus();
    if (next.refund) return refundRef.current?.focus();
    if (next.total || rowErrs.some(Boolean)) return;

    // 1) Validate every leg with dry-run quotes before creating anything.
    setBusy({ phase: "check", done: 0 });
    const checks = await Promise.all(rows.map((r) => quoteLeg(r, true).catch(() => ({ ok: false, body: { message: t("send.err.network") } }))));
    const failed = checks.map((c) => (c.ok ? undefined : (c.body?.message as string) || t("send.err.noQuote")));
    if (failed.some(Boolean)) {
      const refundErr = checks.find((c) => !c.ok && c.body?.field === "refundTo");
      setRows((rs) => rs.map((r, i) => ({ ...r, error: checks[i].body?.field === "refundTo" ? undefined : failed[i] })));
      if (refundErr) setErrors({ refund: refundErr.body.message });
      setBusy(null);
      return;
    }

    // 2) Create the real orders one by one.
    const batchId = newBatchId();
    const created: Batch["legs"] = [];
    for (let i = 0; i < rows.length; i++) {
      setBusy({ phase: "create", done: i });
      const r = rows[i];
      const { ok, body } = await quoteLeg(r, false).catch(() => ({ ok: false, body: { message: t("send.err.network") } }));
      const q = (body as QuoteResponse)?.quote;
      if (!ok || !q?.depositAddress) {
        setErrors({ general: t("send.err.create", { n: i + 1, reason: body?.message ?? t("send.err.unknown"), done: created.length, total: rows.length }) });
        break;
      }
      created.push({ depositAddress: q.depositAddress, depositMemo: q.depositMemo, recipient: r.address.trim(), amountIn: q.amountInFormatted, amountOut: q.amountOutFormatted, delayMin: r.delay, deadline: q.deadline });
      addHistory({
        depositAddress: q.depositAddress,
        depositMemo: q.depositMemo,
        createdAt: new Date().toISOString(),
        fromSymbol: from.symbol,
        fromChain: from.chain,
        toSymbol: to.symbol,
        toChain: to.chain,
        amountIn: q.amountInFormatted,
        amountOut: q.amountOutFormatted,
        status: "PENDING_DEPOSIT",
        batchId,
      });
    }
    setBusy(null);
    if (!created.length) return;
    saveBatch({ id: batchId, createdAt: new Date().toISOString(), fromSymbol: from.symbol, fromChain: from.chain, toSymbol: to.symbol, toChain: to.chain, refundTo: refundTo.trim(), legs: created });
    track("Private send created");
    router.push(lp(`/send/${batchId}`));
  };

  return (
    <form onSubmit={submit} noValidate className="grid gap-3 2xl:grid-cols-[minmax(0,1fr)_520px]">
      <Panel title={t("send.title")} meta={<span className="text-accent">● {t("send.meta")}</span>} bodyClassName="@container p-4 sm:p-5">
        {/* Send / receive */}
        <div className="grid gap-3 @2xl:grid-cols-[1fr_1fr]">
          <div className="min-w-0">
            <label htmlFor={ids.amount} className="mb-2 block text-[12px] font-medium uppercase tracking-wider text-accent">
              {t("send.youSendTotal")}
            </label>
            <div className={`flex h-14 items-center gap-2 border bg-bg-2 pl-3 pr-1.5 ${errors.amount ? "border-red" : "border-accent/50 focus-within:border-accent"}`}>
              <input
                id={ids.amount}
                ref={amountRef}
                value={amount}
                onChange={(e) => {
                  setAmount(sanitize(e.target.value));
                  setErrors((er) => ({ ...er, amount: undefined }));
                }}
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.0"
                aria-invalid={errors.amount ? true : undefined}
                className="num min-w-0 flex-1 bg-transparent text-[24px] text-fg outline-none placeholder:text-subtle"
              />
              <AssetButton token={from} onClick={() => setPicker("from")} label={t("send.sendAsset")} />
            </div>
            <p className="mt-1.5 flex justify-between text-[11px] uppercase text-subtle">
              {errors.amount ? <span className="text-red normal-case">{errors.amount}</span> : <span>{from ? `${from.chainName}` : ""}</span>}
              <span className="tabular">{from ? formatUsd(total * from.price) : ""}</span>
            </p>
          </div>
          <div className="min-w-0">
            <p className="mb-2 text-[12px] font-medium uppercase tracking-wider text-fg">{t("send.recipientsGet")}</p>
            <div className="flex h-14 items-center gap-2 border border-line-strong bg-bg-2 pl-3 pr-1.5">
              <span className="num min-w-0 flex-1 truncate text-[24px] text-fg/85">≈ {formatAmount(total * rate)}</span>
              <AssetButton token={to} onClick={() => setPicker("to")} label={t("send.receiveAsset")} />
            </div>
            <p className="mt-1.5 flex justify-between text-[11px] uppercase text-subtle">
              <span>{from && to ? `1 ${from.symbol} ≈ ${formatAmount(rate)} ${to.symbol}` : ""}</span>
              <span>{t("send.beforeFees")}</span>
            </p>
          </div>
        </div>

        {/* Destinations */}
        <div className="mt-6 space-y-4">
          {rows.map((r, i) => (
            <div key={r.id} className="min-w-0">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[12px] font-medium uppercase tracking-wider text-muted">{t("send.destination", { n: i + 1 })}</p>
              </div>
              <div className="grid gap-2 @2xl:grid-cols-[minmax(0,1fr)_200px_150px_40px]">
                <div className={`flex h-12 items-center gap-1 border bg-bg-2 pl-3 pr-1 ${r.error ? "border-red" : "border-line focus-within:border-accent/70"}`}>
                  <input
                    value={r.address}
                    onChange={(e) => update(r.id, { address: e.target.value })}
                    onBlur={(e) => update(r.id, { address: e.target.value.trim() })}
                    placeholder={to ? t("send.addressPh", { symbol: to.symbol, hint: addressHint(to.chain) }) : t("send.address")}
                    aria-label={t("send.addressAria", { n: i + 1 })}
                    aria-invalid={r.error ? true : undefined}
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    className="min-w-0 flex-1 truncate bg-transparent text-base text-fg outline-none placeholder:text-[13px] placeholder:text-subtle"
                  />
                  <button
                    type="button"
                    aria-label={t("send.pasteAria", { n: i + 1 })}
                    onClick={async () => {
                      try {
                        const text = (await navigator.clipboard.readText()).trim();
                        if (text) update(r.id, { address: text });
                      } catch {}
                    }}
                    className="inline-flex size-10 items-center justify-center text-muted hover:text-fg"
                  >
                    <ClipboardPaste size={16} />
                  </button>
                </div>
                <div className="flex h-12 items-center border border-line bg-bg-2">
                  <span className="tabular min-w-0 flex-1 truncate px-3 text-[14px] text-fg">{formatAmount(legAmount(r))}</span>
                  <span className="border-l border-line px-2 text-[11px] text-subtle">{from?.symbol}</span>
                  <input
                    value={r.pct}
                    onChange={(e) => update(r.id, { pct: sanitize(e.target.value) })}
                    inputMode="decimal"
                    aria-label={t("send.shareAria", { n: i + 1 })}
                    className="tabular h-full w-14 border-l border-line bg-transparent px-2 text-right text-base text-fg outline-none focus:bg-surface-2 sm:text-[13px]"
                  />
                  <span className="pr-2 text-[12px] text-subtle">%</span>
                </div>
                <label className="flex h-12 items-center gap-2 border border-line bg-bg-2 px-3 focus-within:border-accent/70">
                  <Clock size={15} className="shrink-0 text-muted" aria-hidden />
                  <span className="sr-only">{t("send.delayAria", { n: i + 1 })}</span>
                  <select
                    value={r.delay}
                    onChange={(e) => update(r.id, { delay: Number(e.target.value) })}
                    className="h-full w-full cursor-pointer bg-bg-2 text-right text-base text-fg outline-none sm:text-[13px]"
                  >
                    {DELAYS.map((d) => (
                      <option key={d} value={d} className="bg-bg-2 text-fg">
                        {d === 0 ? t("common.now") : d < 60 ? t("send.minutes", { n: d }) : t("send.hours", { n: d / 60 })}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => removeRow(r.id)}
                  disabled={rows.length <= 1}
                  aria-label={t("send.removeAria", { n: i + 1 })}
                  className="inline-flex h-12 items-center justify-center border border-line text-accent hover:border-accent disabled:opacity-30"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              {r.error && (
                <p role="alert" className="mt-1.5 text-[12px] text-red">
                  {r.error}
                </p>
              )}
            </div>
          ))}
        </div>

        {errors.total && (
          <p role="alert" className="mt-3 text-[12px] text-red">
            {errors.total}
          </p>
        )}

        {/* Toolbar */}
        <div className="mt-5 grid grid-cols-2 gap-2 @xl:grid-cols-3 @3xl:grid-cols-6">
          <ToolButton icon={Plus} label={t("send.tool.add")} onClick={addRow} disabled={rows.length >= MAX_ROWS} />
          <ToolButton icon={ListPlus} label={t("send.tool.bulk")} onClick={() => setBulkOpen((b) => !b)} />
          <ToolButton icon={FileUp} label={t("send.tool.csv")} onClick={() => fileRef.current?.click()} />
          <ToolButton icon={Shuffle} label={t("send.tool.randomize")} onClick={randomize} />
          <ToolButton icon={Equal} label={t("send.tool.even")} onClick={() => setRows((rs) => resplit(rs))} />
          <ToolButton
            icon={RotateCcw}
            label={t("send.tool.reset")}
            onClick={() => {
              setRows(makeRows(3));
              setErrors({});
            }}
          />
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          className="sr-only"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) importLines(await f.text());
            e.target.value = "";
          }}
        />
        {bulkOpen && <BulkBox onImport={(text) => (importLines(text), setBulkOpen(false))} onClose={() => setBulkOpen(false)} />}

        <p className={`mt-3 text-[11px] uppercase ${Math.abs(pctSum - 100) > 0.01 ? "text-warn" : "text-subtle"}`}>
          {t("send.counter", { n: rows.length, max: MAX_ROWS, pct: pctSum.toFixed(2) })}
        </p>

        {/* Refund */}
        <div className="mt-5">
          <label htmlFor={ids.refund} className="mb-2 block text-[12px] font-medium uppercase tracking-wider text-muted">
            {t("send.refund")}
          </label>
          <input
            id={ids.refund}
            ref={refundRef}
            value={refundTo}
            onChange={(e) => {
              setRefundTo(e.target.value);
              setErrors((er) => ({ ...er, refund: undefined }));
            }}
            placeholder={from ? t("send.refundPh", { symbol: from.symbol, hint: addressHint(from.chain) }) : t("send.refund")}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={errors.refund ? true : undefined}
            className={`h-12 w-full border bg-bg-2 px-3 text-base text-fg outline-none placeholder:text-[13px] placeholder:text-subtle focus:border-accent/70 ${errors.refund ? "border-red" : "border-line"}`}
          />
          {errors.refund ? <p className="mt-1.5 text-[12px] text-red">{errors.refund}</p> : <p className="mt-1.5 text-[12px] text-subtle">{t("send.refundHint")}</p>}
        </div>

        {/* Tips */}
        {showTips && (
          <div className="mt-5 flex items-center gap-3 border border-line px-3 py-2.5 text-[12px]">
            <span className="flex shrink-0 items-center gap-1.5 uppercase tracking-wider text-accent">
              <Lightbulb size={13} aria-hidden /> {t("send.tips")}
            </span>
            <button type="button" aria-label={t("send.prevTip")} onClick={() => setTip((n) => (n + TIPS.length - 1) % TIPS.length)} className="text-subtle hover:text-fg">
              <ChevronLeft size={14} />
            </button>
            <span className="tabular border border-line px-1.5 text-[11px] text-muted">
              {tip + 1}/{TIPS.length}
            </span>
            <button type="button" aria-label={t("send.nextTip")} onClick={() => setTip((n) => (n + 1) % TIPS.length)} className="text-subtle hover:text-fg">
              <ChevronRight size={14} />
            </button>
            <p className="min-w-0 flex-1 text-muted" aria-live="polite">
              {t(`send.tip.${TIPS[tip]}`)}
            </p>
            <button type="button" aria-label={t("send.hideTips")} onClick={() => setShowTips(false)} className="text-subtle hover:text-fg">
              <X size={14} />
            </button>
          </div>
        )}

        {errors.general && (
          <p role="alert" className="mt-4 flex items-start gap-2 border border-red/40 bg-red/10 px-3 py-2.5 text-[13px] text-red">
            <CircleAlert size={15} className="mt-0.5 shrink-0" aria-hidden /> {errors.general}
          </p>
        )}

        <div className="mt-5 flex flex-col gap-3 @2xl:flex-row @2xl:items-center @2xl:justify-between">
          <p className="max-w-md text-[11px] leading-relaxed text-subtle">
            {t("send.footnote", { n: rows.length })}
          </p>
          <button type="submit" disabled={Boolean(busy)} className="btn-accent inline-flex h-12 min-w-[220px] items-center justify-center gap-2 px-6 text-[13px] disabled:opacity-80">
            {busy && <LoaderCircle size={16} className="animate-spin-slow" aria-hidden />}
            {busy ? (busy.phase === "check" ? t("send.checking") : t("send.creating", { done: busy.done + 1, total: rows.length })) : t("send.create", { n: rows.length })}
          </button>
        </div>
      </Panel>

      <Panel title={t("send.mapTitle")} meta={<span>{t("send.mapMeta", { n: rows.length })}</span>} bodyClassName="dots p-3" className="2xl:sticky 2xl:top-[68px] 2xl:self-start">
        <div className="mx-auto max-w-[620px]">
          <SplitDiagram legs={legs} source={`${formatAmount(total)} ${from?.symbol ?? ""}`} asset={to?.symbol ?? ""} />
        </div>
        <ol className="mt-2 grid gap-1 border-t border-line px-1 pt-3 text-[11px] uppercase">
          {[...rows]
            .map((r, i) => ({ r, i }))
            .sort((a, b) => a.r.delay - b.r.delay)
            .map(({ r, i }) => (
              <li key={r.id} className="flex items-center gap-3">
                <span className="tabular w-12 text-accent">{r.delay ? t("send.minutes", { n: r.delay }) : t("common.now")}</span>
                <span className="h-px flex-1 bg-line" aria-hidden />
                <span className="text-muted">
                  {t("send.depositLine", { n: i + 1, amount: formatAmount(legAmount(r)), symbol: from?.symbol ?? "" })}
                </span>
              </li>
            ))}
        </ol>
      </Panel>

      <TokenPicker
        open={picker !== null}
        onClose={() => setPicker(null)}
        tokens={tokens}
        selectedId={picker === "from" ? from?.id : to?.id}
        title={picker === "from" ? t("send.youSend") : t("send.recipientsGet")}
        onSelect={(tk) => picker && choose(picker, tk)}
      />
    </form>
  );
}

function AssetButton({ token, onClick, label }: { token?: Token; onClick: () => void; label: string }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={token ? t("send.assetAria", { label, symbol: token.symbol, chain: token.chainName }) : label}
      className="flex h-11 shrink-0 items-center gap-2 border border-transparent px-2 hover:border-line hover:bg-surface-2"
    >
      {token ? (
        <>
          <TokenIcon symbol={token.symbol} size={28} />
          <span className="text-left leading-tight">
            <span className="block text-[13px] font-medium text-fg">{token.symbol}</span>
            <span className="block text-[10px] uppercase text-subtle">{token.chainName}</span>
          </span>
        </>
      ) : (
        <span className="h-8 w-20 animate-pulse bg-surface-3" aria-hidden />
      )}
      <ChevronDown size={15} className="text-muted" aria-hidden />
    </button>
  );
}

function ToolButton({ icon: Icon, label, onClick, disabled }: { icon: React.ElementType; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-11 min-w-0 items-center justify-center gap-2 border border-dashed border-line-strong px-2 text-[11px] uppercase tracking-wider text-muted transition-colors hover:border-accent hover:text-fg disabled:opacity-40"
    >
      <Icon size={14} className="shrink-0" aria-hidden /> <span className="min-w-0 truncate">{label}</span>
    </button>
  );
}

function BulkBox({ onImport, onClose }: { onImport: (text: string) => void; onClose: () => void }) {
  const t = useT();
  const [text, setText] = useState("");
  const id = useId();
  return (
    <div className="fade-up mt-3 border border-line bg-bg-2 p-3">
      <label htmlFor={id} className="text-[12px] uppercase tracking-wider text-muted">
        {t("send.bulkLead")} <span className="text-fg">{t("send.bulkFormat")}</span> {t("send.bulkOptional")}
      </label>
      <textarea
        id={id}
        rows={5}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onImport(text);
        }}
        placeholder={"t1abc…, 50, 0\nt1def…, 30, 15\nt1ghi…, 20, 60"}
        spellCheck={false}
        className="mt-2 w-full resize-y border border-line bg-bg px-3 py-2 text-base text-fg outline-none placeholder:text-subtle focus:border-accent/70 sm:text-[13px]"
      />
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={() => onImport(text)} className="btn-accent h-9 px-4 text-[11px]">
          {t("send.bulkImport")}
        </button>
        <button type="button" onClick={onClose} className="h-9 border border-line px-4 text-[11px] uppercase tracking-wider text-muted hover:text-fg">
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}
