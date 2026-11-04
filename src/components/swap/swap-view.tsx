"use client";

import { memo, useCallback, useMemo, useRef, useState } from "react";
import { useHistory } from "@/lib/history";
import { useT } from "@/lib/i18n";
import { isFinal } from "@/lib/status";
import { formatAmount, formatUsd, type Token } from "@/lib/tokens";
import { useZecLive } from "@/lib/use-zec-live";
import { Ticker } from "../hud/ticker";
import { ExchangeWidget, type SwapSnapshot } from "../exchange-widget";
import { KV, Panel } from "../hud/panel";
import { Sparkline } from "../hud/sparkline";
import { Viewport, type ViewportEvent } from "../hud/viewport";
import { FeedList } from "../shell/alert-feed";
import { TokenIcon } from "../token-icon";

const EMPTY: SwapSnapshot = { mode: "float", amountIn: 0, amountOut: 0, exact: false, quoting: false };

/** Turns swap-form changes into a terminal-style event log for the viewport. */
function useEventLog() {
  const t = useT();
  const [events, setEvents] = useState<ViewportEvent[]>([]);
  const seq = useRef(0);
  const prev = useRef<SwapSnapshot>(EMPTY);
  const amountTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRate = useRef<{ at: number; rate: number }>({ at: 0, rate: 0 });

  const push = useCallback((text: string, tone?: ViewportEvent["tone"]) => {
    setEvents((e) => [...e.slice(-11), { id: ++seq.current, at: Date.now(), text, tone }]);
  }, []);

  const observe = useCallback(
    (s: SwapSnapshot) => {
      const p = prev.current;
      prev.current = s;
      const { from, to } = s;
      if (!from || !to) return;
      const pairChanged = p.from?.id !== from.id || p.to?.id !== to.id;
      if (!p.from) push(t("swap.log.linkUp"), "muted");
      if (pairChanged) {
        push(t("swap.log.target", { pair: `${from.symbol}/${to.symbol}`, fromChain: from.chainName, toChain: to.chainName }));
      }
      // Live ticks move the rate constantly; log it at most every 15 s and only on a real move.
      const rate = from.price / to.price;
      const lr = lastRate.current;
      if (pairChanged) lastRate.current = { at: Date.now(), rate };
      else if (Date.now() - lr.at > 15_000 && lr.rate && Math.abs(rate - lr.rate) / lr.rate > 0.0002) {
        const up = rate > lr.rate;
        lastRate.current = { at: Date.now(), rate };
        push(t("swap.log.tick", { dir: up ? "▲" : "▼", from: from.symbol, rate: formatAmount(rate), to: to.symbol }), "muted");
      }
      const userAmt = s.mode === "fixed" ? s.amountOut : s.amountIn;
      const prevAmt = p.mode === "fixed" ? p.amountOut : p.amountIn;
      if (userAmt && (userAmt !== prevAmt || pairChanged)) {
        if (amountTimer.current) clearTimeout(amountTimer.current);
        amountTimer.current = setTimeout(() => {
          const cur = prev.current;
          if (cur.from && cur.to && cur.amountIn)
            push(
              t("swap.log.inOut", {
                in: formatAmount(cur.amountIn),
                from: cur.from.symbol,
                out: `${cur.exact ? "" : "≈"}${formatAmount(cur.amountOut)}`,
                to: cur.to.symbol,
              }),
            );
        }, 700);
      }
      if (s.quoting && !p.quoting) push(t("swap.log.requesting"), "muted");
      if (s.exact && !p.exact && s.minOut) push(t("swap.log.locked", { min: formatAmount(s.minOut), symbol: to.symbol, n: s.etaMinutes ?? "—" }), "accent");
      if (!s.exact && p.exact && !pairChanged) push(t("swap.log.released"), "muted");
    },
    [push, t],
  );

  const onPing = useCallback(() => push(t("swap.log.ping"), "muted"), [push, t]);
  return { events, observe, onPing };
}

export function SwapView() {
  const t = useT();
  const [snap, setSnap] = useState<SwapSnapshot>(EMPTY);
  const { events, observe, onPing } = useEventLog();
  const onSnapshot = useCallback(
    (s: SwapSnapshot) => {
      setSnap(s);
      observe(s);
    },
    [observe],
  );
  const rate = snap.from && snap.to ? snap.from.price / snap.to.price : 0;
  // Keyed on the strings, not the token objects: live price ticks rebuild the tokens several
  // times a second, and the viewport only cares about which chains/labels are on the route.
  const fromChain = snap.from?.chain;
  const toChain = snap.to?.chain;
  const fromLabel = snap.from ? `${snap.from.symbol} · ${snap.from.chainName}`.toUpperCase() : undefined;
  const toLabel = snap.to ? `${snap.to.symbol} · ${snap.to.chainName}`.toUpperCase() : undefined;
  const route = useMemo(
    () => (fromLabel && toLabel ? { fromChain, fromLabel, toChain, toLabel } : undefined),
    [fromChain, fromLabel, toChain, toLabel],
  );

  return (
    <div className="grid gap-3">
      <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_460px]">
        <Viewport
          className="order-2 h-[380px] sm:h-[480px] xl:sticky xl:top-[68px] xl:order-1 xl:h-[calc(100dvh-80px)] xl:max-h-[920px] xl:min-h-[560px]"
          route={route}
          locked={snap.exact}
          events={events}
          onPing={onPing}
        >
          <ViewportLabels snap={snap} rate={rate} />
        </Viewport>
        <Panel id="exchange" title={t("swap.panel")} meta={<span className="text-accent">● {t("common.live")}</span>} className="order-1 xl:order-2" bodyClassName="p-4 sm:p-5">
          <ExchangeWidget onSnapshot={onSnapshot} />
        </Panel>
      </div>

      <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-[1.15fr_1fr_1fr]">
        <PairInspector snap={snap} rate={rate} />
        <MarketPanel snap={snap} rate={rate} />
        <OrderFeedPanel />
      </div>
    </div>
  );
}

/* ---------- viewport overlay ---------- */

function ViewportLabels({ snap, rate }: { snap: SwapSnapshot; rate: number }) {
  const t = useT();
  const { from, to } = snap;
  return (
    <>
      <div className="absolute left-4 top-4 space-y-1 text-[12px] uppercase">
        <p className="text-fg">{t("swap.vp.target", { pair: from && to ? `${from.symbol}/${to.symbol}` : "—" })}</p>
        <p className="text-subtle">{t("swap.vp.route")}</p>
      </div>
      <div className="absolute right-4 top-4 text-right text-[12px] uppercase">
        <p className="tabular text-fg">
          {rate ? (
            <Ticker value={rate}>
              1 {from!.symbol} = {formatAmount(rate)} {to!.symbol}
            </Ticker>
          ) : (
            t("swap.vp.loadingRate")
          )}
        </p>
        <p className={snap.exact ? "text-accent" : "text-subtle"}>{snap.quoting ? t("swap.vp.quoting") : snap.exact ? t("swap.vp.locked") : t("swap.vp.estimate")}</p>
      </div>
      {from && to && (
        <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-3 bg-black/40 px-3 py-2 backdrop-blur-[2px]">
          <TokenIcon symbol={from.symbol} size={26} />
          <span className="text-[12px] text-subtle">→</span>
          <TokenIcon symbol={to.symbol} size={26} />
        </div>
      )}
      <div className="absolute bottom-4 left-4 hidden text-[11px] uppercase text-subtle sm:block">
        <p>
          {t("swap.vp.in")} <span className="tabular text-fg">{snap.amountIn ? `${formatAmount(snap.amountIn)} ${from?.symbol ?? ""}` : "—"}</span>
        </p>
        <p>
          {t("swap.vp.out")} <span className="tabular text-fg">{snap.amountOut ? `${formatAmount(snap.amountOut)} ${to?.symbol ?? ""}` : "—"}</span>
        </p>
      </div>
    </>
  );
}

/* ---------- pair inspector ---------- */

function RouteSchematic({ from, to, exact }: { from?: Token; to?: Token; exact: boolean }) {
  // Segmented bar like a hull schematic: deposit → solver auction → payout.
  const cells = Array.from({ length: 22 }, (_, i) => i);
  return (
    <div className="flex items-center gap-2" aria-hidden>
      <span className="w-12 shrink-0 text-right text-[11px] text-muted">{from?.symbol ?? "—"}</span>
      <div className="flex h-8 flex-1 items-stretch border border-line-strong">
        {cells.map((i) => {
          const auction = i >= 8 && i <= 13;
          return (
            <span
              key={i}
              className={`flex-1 border-r border-line last:border-r-0 ${auction ? (exact ? "bg-accent/70" : "bg-accent/30") : i < 8 ? "bg-fg/[0.06]" : "bg-fg/[0.12]"}`}
            />
          );
        })}
      </div>
      <span className="w-12 shrink-0 text-[11px] text-muted">{to?.symbol ?? "—"}</span>
    </div>
  );
}

function PairInspector({ snap, rate }: { snap: SwapSnapshot; rate: number }) {
  const t = useT();
  const { from, to } = snap;
  return (
    <Panel title={t("swap.inspector.title")} marks bodyClassName="@container p-4 sm:p-5">
      <RouteSchematic from={from} to={to} exact={snap.exact} />
      <div className="micro mb-5 mt-1.5 flex justify-between gap-2 px-14 text-center">
        <span>{t("swap.inspector.deposit")}</span>
        <span className="text-accent">{t("swap.inspector.auction")}</span>
        <span>{t("swap.inspector.payout")}</span>
      </div>
      <KV
        cols={2}
        rows={[
          { k: t("swap.inspector.send"), v: from ? `${from.symbol} · ${from.chainName}` : "—" },
          { k: t("swap.inspector.receive"), v: to ? `${to.symbol} · ${to.chainName}` : "—" },
          { k: t("swap.inspector.priceIn"), v: from ? formatUsd(from.price) : "—" },
          { k: t("swap.inspector.priceOut"), v: to ? formatUsd(to.price) : "—" },
          { k: t("swap.rate"), v: rate ? `${formatAmount(rate)} ${to?.symbol}` : "—" },
          { k: t("swap.inspector.mode"), v: snap.mode === "fixed" ? t("swap.inspector.modeFixed") : t("swap.inspector.modeFloat") },
          {
            k: t("swap.inspector.minOut"),
            v: snap.minOut ? `${formatAmount(snap.minOut)} ${to?.symbol}` : t("swap.inspector.addAddresses"),
            tone: snap.minOut ? "accent" : "muted",
          },
          { k: t("swap.inspector.eta"), v: snap.etaMinutes ? t("swap.minutes", { n: snap.etaMinutes }) : "—" },
          { k: t("swap.inspector.slippage"), v: "1.00%" },
          { k: t("swap.inspector.custody"), v: t("swap.none") },
        ]}
      />
    </Panel>
  );
}

/* ---------- market ---------- */

function Big({ value, unit, label, accent, tick }: { value: string; unit?: string; label: string; accent?: boolean; tick?: number | null }) {
  return (
    <div className="min-w-0">
      <p className="flex items-start gap-1">
        <span className={`num whitespace-nowrap text-[28px] @lg:text-[32px] ${accent ? "text-accent" : "text-fg"}`}>
          <Ticker value={tick}>{value}</Ticker>
        </span>
        {unit && <span className="micro mt-1">{unit}</span>}
      </p>
      <p className="mt-2 w-fit border-t border-line-strong pt-1.5 text-[11px] uppercase tracking-wider text-muted">{label}</p>
    </div>
  );
}

function MarketPanel({ snap, rate }: { snap: SwapSnapshot; rate: number }) {
  const t = useT();
  const zec = useZecLive();
  const change = zec.change ?? 0;
  const values = zec.series;
  const hi = values.length ? Math.max(...values) : 0;
  const lo = values.length ? Math.min(...values) : 0;
  // ZEC per one unit of the other asset, whichever direction the swap runs.
  const other = snap.to?.symbol === "ZEC" ? snap.from?.symbol : snap.to?.symbol;
  const zecPer = rate ? (snap.to?.symbol === "ZEC" ? rate : 1 / rate) : 0;
  return (
    <Panel
      title={t("swap.market.title")}
      meta={zec.live ? <span className="text-accent">● {t("common.live")} · Coinbase</span> : <span>CoinGecko · 24h</span>}
      bodyClassName="@container p-4 sm:p-5"
    >
      <div className="grid grid-cols-2 gap-5 @lg:grid-cols-4">
        <Big value={zec.price != null ? formatAmount(zec.price) : "—"} unit="USD" label={t("swap.market.price")} tick={zec.price} />
        <Big value={zec.change != null ? `${change >= 0 ? "+" : ""}${change.toFixed(2)}` : "—"} unit="%" label="24H" accent={change < 0} />
        <Big value={zecPer ? formatAmount(zecPer) : "—"} unit="ZEC" label={other ? t("swap.market.per", { symbol: other }) : t("swap.rate")} tick={zecPer} />
        <Big value={snap.etaMinutes ? `~${snap.etaMinutes}` : "—"} unit={t("swap.market.min")} label={t("swap.inspector.eta")} />
      </div>
      <div className="mt-6 flex items-center justify-between text-[11px] uppercase">
        <span className="flex items-center gap-2 text-fg">
          <span className="h-3 w-0.5 bg-text" aria-hidden /> ZEC/USD · 24h
        </span>
        <span className="flex items-center gap-2 text-muted">
          <span className="h-3 w-0.5 bg-accent" aria-hidden />
          {t("swap.market.hiLo", { hi: hi ? formatAmount(hi) : "—", lo: lo ? formatAmount(lo) : "—" })}
        </span>
      </div>
      <div className="mt-3">
        {zec.error ? <p className="micro py-8 text-center">{t("shell.historyUnavailable")}</p> : <Sparkline values={values} height={110} label={t("shell.sparkLabel")} />}
      </div>
      <div className="micro mt-1.5 flex justify-between">
        <span>{t("shell.ago24h")}</span>
        <span>12h</span>
        <span>{t("common.now")}</span>
      </div>
    </Panel>
  );
}

/* ---------- order feed ---------- */

/** No props: memo keeps it out of the swap form's frequent re-renders (it follows history on its own). */
const OrderFeedPanel = memo(function OrderFeedPanel() {
  const t = useT();
  const history = useHistory();
  const active = history.filter((h) => !isFinal(h.status)).length;
  return (
    <Panel
      title={t("swap.feed.title")}
      meta={
        <>
          <span>{t("swap.feed.active", { n: active })}</span>
          {active > 0 && <span className="text-accent">· {t("common.live")}</span>}
        </>
      }
      bodyClassName="p-0"
      className="lg:col-span-2 2xl:col-span-1"
    >
      {history.length === 0 ? (
        <div className="hatch flex h-full min-h-48 flex-col items-center justify-center gap-1 px-6 py-10 text-center">
          <p className="label text-fg">{t("swap.feed.empty")}</p>
          <p className="text-[12px] text-subtle">{t("swap.feed.emptyBody")}</p>
        </div>
      ) : (
        <FeedList entries={history} limit={5} />
      )}
    </Panel>
  );
});
