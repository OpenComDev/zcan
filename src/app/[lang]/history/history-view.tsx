"use client";

import Link from "@/components/locale-link";
import { useSearchParams } from "next/navigation";
import { ArrowLeftRight, RotateCcw, Search, SearchX, Send, X } from "lucide-react";
import { useMemo, useState, useSyncExternalStore } from "react";
import { Panel } from "@/components/hud/panel";
import { RecurringPanel } from "@/components/recurring/recurring-panel";
import { TokenIcon } from "@/components/token-icon";
import { useBatches, type Batch } from "@/lib/batches";
import { useHistory, type HistoryEntry } from "@/lib/history";
import { useLocale, useT } from "@/lib/i18n";
import { TONE_CLASS, isFinal, type StatusTone } from "@/lib/status";
import { chainName, formatAmount } from "@/lib/tokens";
import { useStatusMeta } from "@/lib/use-status";
import { DataPanel, usePlural } from "./data-panel";

type Filter = "all" | "active" | "done";
const FILTERS: Filter[] = ["all", "active", "done"];
type Tr = ReturnType<typeof useT>;
type Meta = ReturnType<typeof useStatusMeta>;
type Plural = ReturnType<typeof usePlural>;

type Row = {
  key: string;
  kind: "swap" | "send";
  href: string;
  createdAt: string;
  fromSymbol: string;
  toSymbol: string;
  amountIn: number;
  /** "12.3 ZEC" or "3 recipients" */
  out: string;
  sub: string;
  status: { label: string; short: string; tone: StatusTone };
  active: boolean;
  haystack: string;
};

const dateFmts = new Map<string, Intl.DateTimeFormat>();
const dateFmt = (locale: string) => {
  let f = dateFmts.get(locale);
  if (!f) dateFmts.set(locale, (f = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" })));
  return f;
};
const noop = () => () => {};
const useHydrated = () => useSyncExternalStore(noop, () => true, () => false);
const short = (a: string) => (a.length > 18 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a);

const orderHref = (e: HistoryEntry) =>
  `/order/${encodeURIComponent(e.depositAddress)}${e.depositMemo ? `?memo=${encodeURIComponent(e.depositMemo)}` : ""}`;

function swapRow(e: HistoryEntry, statusMeta: Meta): Row {
  const m = statusMeta(e.status);
  return {
    key: `swap:${e.depositAddress}`,
    kind: "swap",
    href: orderHref(e),
    createdAt: e.createdAt,
    fromSymbol: e.fromSymbol,
    toSymbol: e.toSymbol,
    amountIn: Number(e.amountIn),
    out: `${formatAmount(e.amountOut)} ${e.toSymbol}`,
    sub: `${chainName(e.fromChain)} → ${chainName(e.toChain)} · ${short(e.depositAddress)}`,
    status: m,
    active: !isFinal(e.status),
    haystack: [e.fromSymbol, e.toSymbol, e.fromChain, e.toChain, chainName(e.fromChain), chainName(e.toChain), e.depositAddress, e.depositMemo ?? ""].join(" ").toLowerCase(),
  };
}

function batchRow(b: Batch, statusOf: (addr: string) => string | undefined, statusMeta: Meta, t: Tr, plural: Plural): Row {
  const statuses = b.legs.map((l) => statusOf(l.depositAddress));
  const n = b.legs.length;
  const settled = statuses.filter(isFinal).length;
  const delivered = statuses.filter((s) => s === "SUCCESS").length;
  const active = settled < n;
  const moving = statuses.some((s) => statusMeta(s).step > 0 && !isFinal(s));
  const status = active
    ? {
        label: t("history.settled", { settled, n }),
        short: t(moving ? "common.statusShort.PROCESSING" : "common.statusShort.PENDING_DEPOSIT"),
        tone: (moving ? "active" : "wait") as StatusTone,
      }
    : delivered === n
      ? { label: t("history.delivered"), short: t("common.statusShort.SUCCESS"), tone: "done" as const }
      : { label: t("history.partlyDelivered", { done: delivered, n }), short: t("history.partial"), tone: "bad" as const };
  return {
    key: `send:${b.id}`,
    kind: "send",
    href: `/send/${encodeURIComponent(b.id)}`,
    createdAt: b.createdAt,
    fromSymbol: b.fromSymbol,
    toSymbol: b.toSymbol,
    amountIn: b.legs.reduce((s, l) => s + Number(l.amountIn), 0),
    out: `${n} × ${b.toSymbol}`,
    sub: t("history.batchSub", { id: b.id.slice(0, 6), recipients: plural("history.count.recipient", n) }),
    status,
    active,
    haystack: [b.id, b.fromSymbol, b.toSymbol, b.fromChain, b.toChain, chainName(b.fromChain), chainName(b.toChain), b.refundTo, ...b.legs.flatMap((l) => [l.recipient, l.depositAddress])]
      .join(" ")
      .toLowerCase(),
  };
}

export function HistoryView() {
  const params = useSearchParams();
  const raw = params.get("filter");
  const filter: Filter = raw === "active" || raw === "done" ? raw : "all";
  const [query, setQuery] = useState(() => params.get("q") ?? "");
  const hydrated = useHydrated();
  const history = useHistory();
  const batches = useBatches();
  const t = useT();
  const statusMeta = useStatusMeta();
  const plural = usePlural();

  const rows = useMemo(() => {
    const byAddr = new Map(history.map((h) => [h.depositAddress, h.status]));
    const batchIds = new Set(batches.map((b) => b.id));
    const out = [
      ...history.filter((h) => !h.batchId || !batchIds.has(h.batchId)).map((h) => swapRow(h, statusMeta)),
      ...batches.map((b) => batchRow(b, (a) => byAddr.get(a), statusMeta, t, plural)),
    ];
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [history, batches, statusMeta, t, plural]);

  const counts = { all: rows.length, active: rows.filter((r) => r.active).length, done: rows.filter((r) => !r.active).length };
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = rows.filter((r) => (filter === "all" || (filter === "active") === r.active) && terms.every((term) => r.haystack.includes(term)));

  const hrefFor = (f: Filter) => {
    const p = new URLSearchParams();
    if (f !== "all") p.set("filter", f);
    if (query.trim()) p.set("q", query.trim());
    const s = p.toString();
    return s ? `/history?${s}` : "/history";
  };

  const setSearch = (v: string) => {
    setQuery(v);
    const p = new URLSearchParams(window.location.search);
    if (v.trim()) p.set("q", v.trim());
    else p.delete("q");
    const s = p.toString();
    window.history.replaceState(null, "", s ? `?${s}` : window.location.pathname);
  };

  return (
    <div className="grid gap-3">
      <h1 className="sr-only">{t("history.title")}</h1>
      <Panel
        title={t("history.title")}
        meta={
          <span className="tabular">
            {hydrated ? t("history.meta", { swaps: plural("history.count.swap", history.length), sends: plural("history.count.send", batches.length) }) : " "}
          </span>
        }
        bodyClassName="p-0"
      >
        <div className="flex flex-col gap-3 border-b border-line p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
          <nav aria-label={t("history.filterAria")} className="grid grid-cols-3 border border-line sm:w-auto">
            {FILTERS.map((f, i) => (
              <Link
                key={f}
                href={hrefFor(f)}
                replace
                scroll={false}
                aria-current={filter === f ? "page" : undefined}
                className={`flex h-10 min-w-0 items-center justify-center gap-1.5 px-2 text-[12px] uppercase tracking-wider transition-colors sm:px-4 ${i > 0 ? "border-l border-line" : ""} ${
                  filter === f ? "bg-accent/15 text-fg" : "text-muted hover:text-fg"
                }`}
              >
                <span className="min-w-0 truncate">{t(`history.filter.${f}`)}</span>
                <span className="tabular text-[11px] text-subtle">{hydrated ? counts[f] : ""}</span>
              </Link>
            ))}
          </nav>
          <div className="relative min-w-0 sm:w-80">
            <label htmlFor="history-q" className="sr-only">
              {t("history.searchLabel")}
            </label>
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" aria-hidden />
            <input
              id="history-q"
              type="search"
              name="q"
              value={query}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("history.searchPh")}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className="h-10 w-full border border-line bg-bg-2 pl-9 pr-10 text-base text-fg outline-none placeholder:text-[13px] placeholder:text-subtle focus:border-accent/70 sm:text-[13px] [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label={t("history.clear")}
                className="absolute right-0.5 top-1/2 inline-flex size-9 -translate-y-1/2 items-center justify-center text-muted hover:text-fg"
              >
                <X size={14} aria-hidden />
              </button>
            )}
          </div>
        </div>

        {!hydrated ? (
          <div className="h-64 animate-pulse bg-surface-2/40" aria-busy="true" aria-label={t("history.loading")} />
        ) : rows.length === 0 ? (
          <EmptyHistory />
        ) : shown.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center" aria-live="polite">
            <span className="mb-1 inline-flex size-11 items-center justify-center border border-line text-subtle" aria-hidden>
              <SearchX size={18} />
            </span>
            <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-text">{t("history.noMatches")}</p>
            <p className="max-w-sm break-words text-[13px] text-subtle">
              {query.trim() ? t(`history.noMatchQ.${filter}`, { q: query.trim() }) : t(`history.noMatch.${filter}`)}
            </p>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              <Link
                href="/history"
                replace
                scroll={false}
                onClick={() => setQuery("")}
                className="btn-accent inline-flex h-10 items-center gap-2 px-4 text-[12px]"
              >
                <RotateCcw size={13} aria-hidden /> {t("history.resetAll")}
              </Link>
              {query.trim() && filter !== "all" && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="inline-flex h-10 items-center border border-line px-4 text-[12px] uppercase tracking-wider text-muted hover:border-line-strong hover:text-text"
                >
                  {t("history.clearSearchOnly")}
                </button>
              )}
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-line" aria-label={t("history.listAria")}>
            {shown.map((r) => (
              <HistoryRow key={r.key} row={r} />
            ))}
          </ul>
        )}
        {hydrated && rows.length > 0 && (
          <p className="micro border-t border-line px-4 py-3" aria-live="polite">
            {t("history.showing", { shown: shown.length, total: rows.length })}
          </p>
        )}
      </Panel>

      <RecurringPanel />

      <DataPanel />
    </div>
  );
}

/** First-run state: a small "swap" illustration, one line of context, and the two ways to start. */
function EmptyHistory() {
  const t = useT();
  return (
    <div className="hatch flex flex-col items-center justify-center gap-2 px-6 py-14 text-center sm:py-16">
      <div className="relative mb-3 flex items-center gap-2" aria-hidden>
        <span className="inline-flex size-11 items-center justify-center border border-line bg-surface">
          <TokenIcon symbol="BTC" size={24} />
        </span>
        <span className="inline-flex size-8 items-center justify-center border border-accent/50 bg-surface text-accent">
          <ArrowLeftRight size={14} />
        </span>
        <span className="inline-flex size-11 items-center justify-center border border-line bg-surface">
          <TokenIcon symbol="ZEC" size={24} />
        </span>
      </div>
      <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-text">{t("history.empty.title")}</p>
      <p className="max-w-sm text-balance text-[13px] text-subtle">{t("history.empty.body")}</p>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        <Link href="/" className="btn-accent inline-flex h-10 items-center gap-2 px-4 text-[12px]">
          <ArrowLeftRight size={14} aria-hidden /> {t("history.empty.cta")}
        </Link>
        <Link
          href="/send"
          className="inline-flex h-10 items-center gap-2 border border-line px-4 text-[12px] uppercase tracking-wider text-muted hover:border-line-strong hover:text-text"
        >
          <Send size={14} aria-hidden /> {t("history.privateSend")}
        </Link>
      </div>
      <p className="mt-3 text-[12px] text-subtle">
        {t("history.empty.restore")}{" "}
        <a href="#your-data" className="text-muted underline underline-offset-2 hover:text-text">
          {t("history.empty.restoreLink")}
        </a>
      </p>
    </div>
  );
}

function HistoryRow({ row: r }: { row: Row }) {
  const t = useT();
  const date = dateFmt(useLocale()).format(new Date(r.createdAt));
  return (
    <li>
      <Link
        href={r.href}
        className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-l-2 px-4 py-3 transition-colors hover:bg-surface-2 sm:grid-cols-[170px_minmax(0,1fr)_auto] ${
          r.active && r.status.tone === "wait" ? "border-accent" : "border-transparent"
        }`}
      >
        <span className="tabular hidden text-[12px] text-subtle sm:block">{date}</span>
        <span className="flex min-w-0 items-center gap-3">
          <TokenIcon symbol={r.fromSymbol} size={24} className="shrink-0" />
          <span className="min-w-0">
            <span className="flex min-w-0 items-center gap-2">
              <span className="tag shrink-0 text-subtle">{t(`history.kind.${r.kind}`)}</span>
              <span className="num truncate text-[14px] text-fg">
                {formatAmount(r.amountIn)} {r.fromSymbol} <span className="text-subtle">→</span> {r.out}
              </span>
            </span>
            <span className="mt-1 block truncate text-[11px] uppercase text-subtle" translate="no">
              <span className="tabular sm:hidden">{date} · </span>
              {r.sub}
            </span>
          </span>
        </span>
        <span className="flex flex-col items-end gap-1">
          <span className={`tag ${TONE_CLASS[r.status.tone]}`}>{r.status.short}</span>
          <span className="hidden text-[11px] uppercase text-subtle md:block">{r.status.label}</span>
        </span>
      </Link>
    </li>
  );
}
