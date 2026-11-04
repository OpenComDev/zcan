"use client";

import { useLocale, useT } from "@/lib/i18n";

export type SplitLeg = { label: string; pct: number; delayMin: number; ok: boolean };

const W = 640;

/**
 * Animated fan-out: your deposits enter NEAR Intents, market makers pay each recipient.
 * Packets leave in delay order so the stagger is visible. Decorative; the form is the source of truth.
 */
export function SplitDiagram({ legs, source, asset }: { legs: SplitLeg[]; source: string; asset: string }) {
  const n = Math.max(1, legs.length);
  const rowH = 46;
  const H = Math.max(220, n * rowH + 60);
  const sx = 70;
  const sy = H / 2;
  const hx = 300;
  const dx = 520;
  const maxDelay = Math.max(1, ...legs.map((l) => l.delayMin));
  const cycle = 6; // seconds per animation cycle
  const t = useT();
  const locale = useLocale();

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={t("send.map.aria", { source, n: legs.length })}>
      <defs>
        <radialGradient id="split-core" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="var(--fg)" />
          <stop offset="0.4" stopColor="var(--fg)" stopOpacity="0.35" />
          <stop offset="1" stopColor="var(--fg)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* source → hub */}
      <path d={`M${sx} ${sy} L${hx} ${sy}`} stroke="var(--accent)" strokeOpacity="0.7" strokeWidth="1.2" />
      {legs.map((l, i) => (
        <circle key={`in-${i}`} r="3" fill="var(--fg)" className="motion-reduce:hidden">
          <animateMotion dur={`${cycle}s`} begin={`${(l.delayMin / maxDelay) * (cycle * 0.5)}s`} repeatCount="indefinite" keyPoints="0;1;1" keyTimes="0;0.25;1" calcMode="linear" path={`M${sx} ${sy} L${hx} ${sy}`} />
        </circle>
      ))}

      {legs.map((l, i) => {
        const y = 30 + (i + 0.5) * ((H - 60) / n);
        const path = `M${hx} ${sy} C${hx + 110} ${sy} ${dx - 110} ${y} ${dx} ${y}`;
        const begin = (l.delayMin / maxDelay) * (cycle * 0.5) + cycle * 0.25;
        return (
          <g key={i}>
            <path d={path} fill="none" stroke={l.ok ? "var(--accent)" : "var(--fg)"} strokeOpacity={l.ok ? 0.6 : 0.15} strokeDasharray={l.ok ? undefined : "3 5"} strokeWidth="1.2" />
            {l.ok && (
              <circle r="3" fill="var(--accent)" className="motion-reduce:hidden">
                <animateMotion dur={`${cycle}s`} begin={`${begin}s`} repeatCount="indefinite" keyPoints="0;1;1" keyTimes="0;0.35;1" calcMode="linear" path={path} />
              </circle>
            )}
            <rect x={dx - 5} y={y - 5} width="10" height="10" transform={`rotate(45 ${dx} ${y})`} fill={l.ok ? "var(--accent)" : "var(--surface)"} stroke="var(--fg)" strokeOpacity={l.ok ? 1 : 0.5} />
            <text x={dx + 14} y={y - 3} fill="var(--text)" fontSize="12" fontFamily="var(--font-plex-mono), monospace">
              {l.label}
            </text>
            <text x={dx + 14} y={y + 12} fill="var(--muted)" fontSize="10" fontFamily="var(--font-plex-mono), monospace">
              {`${l.pct.toFixed(l.pct % 1 ? 1 : 0)}% · ${l.delayMin ? t("send.minutes", { n: l.delayMin }) : t("common.now").toLocaleLowerCase(locale)}`}
            </text>
          </g>
        );
      })}

      {/* source */}
      <rect x={sx - 7} y={sy - 7} width="14" height="14" transform={`rotate(45 ${sx} ${sy})`} fill="var(--accent)" stroke="var(--fg)" />
      <text x={sx} y={sy + 30} textAnchor="middle" fill="var(--text)" fontSize="12" fontFamily="var(--font-plex-mono), monospace">
        {source}
      </text>
      <text x={sx} y={sy + 45} textAnchor="middle" fill="var(--muted)" fontSize="10" fontFamily="var(--font-plex-mono), monospace">
        {t("send.map.wallet").toLocaleUpperCase(locale)}
      </text>

      {/* hub */}
      <circle cx={hx} cy={sy} r="36" fill="url(#split-core)" />
      <circle cx={hx} cy={sy} r="9" fill="var(--fg)" />
      <g className="motion-reduce:hidden" style={{ transformOrigin: `${hx}px ${sy}px`, animation: "spin 12s linear infinite" }}>
        <circle cx={hx} cy={sy} r="26" fill="none" stroke="var(--fg)" strokeOpacity="0.35" strokeDasharray="2 6" />
      </g>
      <text x={hx} y={sy + 52} textAnchor="middle" fill="var(--text)" fontSize="11" fontFamily="var(--font-plex-mono), monospace">
        NEAR INTENTS
      </text>
      <text x={hx} y={sy + 66} textAnchor="middle" fill="var(--muted)" fontSize="10" fontFamily="var(--font-plex-mono), monospace">
        {t("send.map.payout", { asset }).toLocaleUpperCase(locale)}
      </text>
    </svg>
  );
}
