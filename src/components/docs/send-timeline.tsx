"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";

const LEGS = [
  { n: 1, pct: "41.6%", delay: 0 },
  { n: 2, pct: "20.5%", delay: 15 },
  { n: 3, pct: "37.9%", delay: 60 },
];
const SPAN = 80; // minutes shown
const SETTLE = 10; // minutes from deposit to payout

/** Animated replay of a staggered private send: deposits fire at their delays, payouts follow. */
export function SendTimeline() {
  const t = useT();
  const [m, setM] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // Static frame that still shows every stage.
      const raf = requestAnimationFrame(() => setM(SPAN * 0.85));
      return () => cancelAnimationFrame(raf);
    }
    const id = setInterval(() => setM((x) => (x >= SPAN ? 0 : x + 0.5)), 60);
    return () => clearInterval(id);
  }, []);
  const pct = (v: number) => `${(v / SPAN) * 100}%`;

  return (
    <div aria-label={t("docs.tl.aria")} role="img">
      <div className="relative ml-28 h-5 border-b border-line">
        {[0, 20, 40, 60, 80].map((v) => (
          <span key={v} className="micro absolute -translate-x-1/2" style={{ left: pct(v) }}>
            {t("docs.tl.min", { v })}
          </span>
        ))}
      </div>
      <div className="relative">
        {LEGS.map((l) => {
          const deposited = m >= l.delay;
          const paid = m >= l.delay + SETTLE;
          const progress = Math.min(1, Math.max(0, (m - l.delay) / SETTLE));
          return (
            <div key={l.n} className="flex h-10 items-center">
              <span className="w-28 shrink-0 truncate pr-1 text-[11px] uppercase text-muted">{t("docs.tl.leg", { n: l.n, pct: l.pct })}</span>
              <span className="relative h-full flex-1 border-l border-line">
                <span className="absolute top-1/2 h-px w-full bg-line" />
                <span className={`absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 ${deposited ? "bg-fg" : "border border-fg/40"}`} style={{ left: pct(l.delay) }} />
                <span className="absolute top-1/2 h-1 -translate-y-1/2 bg-accent/70" style={{ left: pct(l.delay), width: `calc(${pct(SETTLE)} * ${progress})` }} />
                <span className={`absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ${paid ? "bg-accent shadow-[0_0_12px_var(--glow)]" : "bg-surface-3"}`} style={{ left: pct(l.delay + SETTLE) }} />
              </span>
            </div>
          );
        })}
        <span className="pointer-events-none absolute bottom-0 top-0 ml-28 w-px bg-fg/80" style={{ left: `calc((100% - 7rem) * ${m / SPAN})` }} />
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-[11px] uppercase text-subtle">
        <span className="flex items-center gap-2">
          <span className="size-2 rotate-45 bg-fg" /> {t("docs.tl.deposit")}
        </span>
        <span className="flex items-center gap-2">
          <span className="h-1 w-4 bg-accent/70" /> {t("docs.tl.fills")}
        </span>
        <span className="flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-accent" /> {t("docs.tl.paid")}
        </span>
      </div>
    </div>
  );
}
