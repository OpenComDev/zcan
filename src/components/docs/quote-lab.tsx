"use client";

import { useId, useMemo, useState } from "react";
import { fitText } from "./svg-fit";
import { useT } from "@/lib/i18n";
import { formatAmount, formatUsd } from "@/lib/tokens";
import { useTokens } from "@/lib/use-tokens";
import { Ticker } from "../hud/ticker";

const W = 560;
const H = 220;
const PAD = { l: 56, r: 16, t: 14, b: 30 };

/**
 * Interactive quote math: how slippage tolerance turns an expected output into the
 * guaranteed minimum. Uses live BTC and ZEC prices.
 */
export function QuoteLab() {
  const t = useT();
  const { tokens } = useTokens();
  const btc = tokens.find((t) => t.symbol === "BTC" && t.chain === "btc");
  const zec = tokens.find((t) => t.symbol === "ZEC" && t.chain === "zec");
  const [amount, setAmount] = useState("0.05");
  const [slip, setSlip] = useState(1);
  const [hover, setHover] = useState<number | null>(null);
  const ids = { amount: useId(), slip: useId() };

  const amt = Number(amount) || 0;
  const rate = btc && zec ? btc.price / zec.price : 0;
  const expected = amt * rate;
  const minOut = (s: number) => expected * (1 - s / 100);

  const xs = useMemo(() => Array.from({ length: 30 }, (_, i) => 0.1 + i * 0.1), []);
  const lo = minOut(3);
  const hi = expected || 1;
  const x = (s: number) => PAD.l + ((s - 0.1) / 2.9) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - lo) / Math.max(1e-9, hi - lo)) * (H - PAD.t - PAD.b);
  const line = xs.map((s, i) => `${i ? "L" : "M"}${x(s).toFixed(1)} ${y(minOut(s)).toFixed(1)}`).join("");
  const focus = hover ?? slip;

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const s = Math.min(3, Math.max(0.1, 0.1 + ((px - PAD.l) / (W - PAD.l - PAD.r)) * 2.9));
    setHover(Math.round(s * 10) / 10);
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)]">
      <div className="space-y-5">
        <div>
          <label htmlFor={ids.amount} className="text-[12px] uppercase tracking-wider text-muted">
            {t("docs.quote.send")}
          </label>
          <input
            id={ids.amount}
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
            inputMode="decimal"
            className="num mt-2 h-12 w-full border border-line bg-bg-2 px-3 text-[22px] text-fg outline-none focus:border-accent/70"
          />
        </div>
        <div>
          <label htmlFor={ids.slip} className="flex justify-between gap-3 text-[12px] uppercase tracking-wider text-muted">
            {t("docs.quote.slippage")} <span className="tabular shrink-0 text-fg">{slip.toFixed(1)}%</span>
          </label>
          <input
            id={ids.slip}
            type="range"
            min={0.1}
            max={3}
            step={0.1}
            value={slip}
            onChange={(e) => setSlip(Number(e.target.value))}
            className="mt-3 w-full accent-[var(--accent)]"
          />
          <p className="micro mt-1 normal-case tracking-normal">{t("docs.quote.default")}</p>
        </div>
        <dl className="grid gap-3 border-t border-line pt-4 text-[12px] uppercase">
          <div className="flex justify-between gap-3">
            <dt className="text-subtle">{t("docs.quote.rate")}</dt>
            <dd className="tabular text-fg">
              <Ticker value={rate}>{rate ? `${formatAmount(rate)} ZEC/BTC` : "—"}</Ticker>
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-subtle">{t("docs.quote.expected")}</dt>
            <dd className="tabular text-fg">{formatAmount(expected)} ZEC</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-subtle">{t("docs.quote.min")}</dt>
            <dd className="tabular text-accent">{formatAmount(minOut(slip))} ZEC</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-subtle">{t("docs.quote.worst")}</dt>
            <dd className="tabular text-fg">−{formatUsd((expected - minOut(slip)) * (zec?.price ?? 0))}</dd>
          </div>
        </dl>
      </div>

      <figure>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full touch-none"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          role="img"
          aria-label={t("docs.quote.aria", { hi: formatAmount(minOut(0.1)), lo: formatAmount(minOut(3)) })}
        >
          {[0, 0.5, 1].map((f) => {
            const v = lo + (hi - lo) * f;
            return (
              <g key={f}>
                <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--fg)" strokeOpacity="0.06" />
                <text x={PAD.l - 8} y={y(v) + 4} textAnchor="end" fontSize="10" fill="var(--muted)" fontFamily="var(--font-plex-mono), monospace">
                  {formatAmount(v)}
                </text>
              </g>
            );
          })}
          {[0.1, 1, 2, 3].map((s) => (
            <text key={s} x={x(s)} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--muted)" fontFamily="var(--font-plex-mono), monospace">
              {s}%
            </text>
          ))}
          <line x1={PAD.l} x2={W - PAD.r} y1={y(expected)} y2={y(expected)} stroke="var(--fg)" strokeOpacity="0.4" strokeDasharray="3 4" />
          <text x={W - PAD.r} y={y(expected) - 6} textAnchor="end" fill="var(--text)" fontFamily="var(--font-plex-mono), monospace" {...fitText(t("docs.quote.expectedCaps"), 10, 200)}>
            {t("docs.quote.expectedCaps")}
          </text>
          <path d={`${line}L${x(3)} ${H - PAD.b}L${x(0.1)} ${H - PAD.b}Z`} fill="var(--accent)" fillOpacity="0.07" />
          <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2" />
          <line x1={x(focus)} x2={x(focus)} y1={PAD.t} y2={H - PAD.b} stroke="var(--fg)" strokeOpacity="0.35" />
          <circle cx={x(focus)} cy={y(minOut(focus))} r="5" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />
          <g transform={`translate(${Math.min(x(focus) + 10, W - 150)} ${Math.max(PAD.t + 4, y(minOut(focus)) - 40)})`}>
            <rect width="140" height="34" fill="var(--surface-2)" stroke="var(--border-strong)" />
            <text x="8" y="14" fill="var(--muted)" fontFamily="var(--font-plex-mono), monospace" {...fitText(t("docs.quote.tipSlip", { pct: focus.toFixed(1) }), 10, 126)}>
              {t("docs.quote.tipSlip", { pct: focus.toFixed(1) })}
            </text>
            <text x="8" y="27" fill="var(--fg)" fontFamily="var(--font-plex-mono), monospace" {...fitText(t("docs.quote.tipMin", { amt: formatAmount(minOut(focus)) }), 11, 126)}>
              {t("docs.quote.tipMin", { amt: formatAmount(minOut(focus)) })}
            </text>
          </g>
        </svg>
        <figcaption className="micro mt-2 normal-case tracking-normal">
          {t("docs.quote.caption")}
        </figcaption>
      </figure>
    </div>
  );
}
