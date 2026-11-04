"use client";

import { useCallback } from "react";
import { useT } from "@/lib/i18n";
import type { RecentBlock } from "@/lib/zcash-network";
import { TARGET_SPACING_S, fmtInt } from "@/lib/zcash-network";

const MAX_BLOCK_BYTES = 2_000_000;

/** Localized short duration ("42 s", "5 min", "3 h"), same rounding as `fmtAgo`. */
export function useFmtAgo() {
  const t = useT();
  return useCallback(
    (seconds: number) => {
      const s = Math.max(0, Math.round(seconds));
      if (s < 90) return t("network.dur.s", { n: s });
      if (s < 90 * 60) return t("network.dur.min", { n: Math.round(s / 60) });
      return t("network.dur.h", { n: Math.round(s / 3600) });
    },
    [t],
  );
}

/**
 * Newest blocks, left to right, with a "mining" slot for the next one whose bar fills toward the
 * 75-second target. New blocks fade in as they arrive (the shared `.fade-up` honours reduced motion
 * via the motion-reduce override below).
 */
export function BlocksStrip({ blocks, height, lastBlockTime, now }: { blocks: RecentBlock[]; height: number | null; lastBlockTime: string | null; now: number | null }) {
  const t = useT();
  const fmtAgo = useFmtAgo();
  const newest = blocks[0]?.height ?? null;
  // The node can be a block or two ahead of the block list; show those as confirmed placeholders.
  const gap = height != null && newest != null ? Math.min(3, Math.max(0, height - newest)) : 0;
  const placeholders = Array.from({ length: gap }, (_, i) => (height as number) - i);
  const tip = height ?? newest;
  const last = lastBlockTime ? Date.parse(lastBlockTime) / 1000 : null;
  const elapsed = now != null && last != null ? Math.max(0, now - last) : null;
  const fill = elapsed == null ? 0 : Math.min(1, elapsed / TARGET_SPACING_S);
  const late = elapsed != null && elapsed > TARGET_SPACING_S;

  return (
    <div className="no-scrollbar -mx-px overflow-x-auto" tabIndex={0} role="region" aria-label={t("network.blocksRegion")}>
      <ol className="flex min-w-max gap-px border border-line bg-line">
        <li className="relative flex w-[132px] shrink-0 flex-col justify-between gap-3 bg-bg-2 p-3" aria-label={t("network.nextBlockLabel")}>
          <div className="flex items-center justify-between">
            <span className="micro">{t("network.next")}</span>
            <span className="size-1.5 rounded-full bg-accent pulse-dot motion-reduce:animate-none" aria-hidden />
          </div>
          <p className="num text-[18px] text-fg">{tip != null ? `#${fmtInt(tip + 1)}` : "—"}</p>
          <div>
            <div className="h-1 w-full overflow-hidden bg-surface-3" aria-hidden>
              <div
                className={`h-full w-full origin-left transition-transform duration-1000 ease-linear motion-reduce:transition-none ${late ? "bg-warn" : "bg-accent"}`}
                style={{ transform: `scaleX(${fill})` }}
              />
            </div>
            <p className="micro mt-1.5 tabular normal-case tracking-normal">
              {elapsed == null
                ? t("network.waitingData")
                : late
                  ? t("network.due", { t: fmtAgo(elapsed) })
                  : t("network.mining", { n: Math.round(elapsed), target: TARGET_SPACING_S })}
            </p>
          </div>
        </li>
        {placeholders.map((h) => (
          <li key={h} className="fade-up flex w-[120px] shrink-0 flex-col justify-between gap-3 bg-surface p-3 motion-reduce:animate-none">
            <span className="micro text-accent">{t("network.justMined")}</span>
            <p className="num text-[18px] text-fg">#{fmtInt(h)}</p>
            <p className="micro normal-case tracking-normal">{t("network.detailsSoon")}</p>
          </li>
        ))}
        {blocks.map((b, i) => {
          const age = now != null ? now - Date.parse(b.time) / 1000 : null;
          const fresh = i === 0 && gap === 0;
          return (
            <li key={b.height} className={`fade-up flex w-[120px] shrink-0 gap-3 bg-surface p-3 motion-reduce:animate-none ${fresh ? "shadow-[inset_0_2px_0_var(--accent)]" : ""}`}>
              <div className="flex min-w-0 flex-1 flex-col justify-between gap-3">
                <span className={`micro ${fresh ? "text-accent" : ""}`}>{age != null ? t("network.ago", { t: fmtAgo(age) }) : "—"}</span>
                <p className="num truncate text-[16px] text-fg">#{fmtInt(b.height)}</p>
                <p className="micro tabular normal-case tracking-normal">
                  {fmtInt(b.txs)} tx · {fmtInt(b.size / 1000)} kB
                </p>
              </div>
              <div className="relative w-1 shrink-0 bg-surface-3" aria-hidden title={t("network.blockSize")}>
                <div className="absolute inset-0 origin-bottom bg-fg/60" style={{ transform: `scaleY(${Math.max(0.03, Math.min(1, b.size / MAX_BLOCK_BYTES))})` }} />
              </div>
            </li>
          );
        })}
        {blocks.length === 0 &&
          Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="hatch h-[104px] w-[120px] shrink-0 bg-surface" aria-hidden />
          ))}
      </ol>
    </div>
  );
}
