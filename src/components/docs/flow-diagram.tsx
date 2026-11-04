"use client";

import { useRef } from "react";
import { fitText } from "./svg-fit";
import { useT } from "@/lib/i18n";
import { useSvgPause } from "@/lib/perf/use-svg-pause";

/**
 * Animated system diagram: wallet → one-time deposit address → NEAR Intents solver auction →
 * payout, with the refund path. Pure SVG + SMIL (a client component only so labels can be translated).
 */
export function FlowDiagram() {
  const t = useT();
  const ref = useRef<SVGSVGElement>(null);
  useSvgPause(ref); // frozen while off screen or the tab is hidden
  const mono = "var(--font-plex-mono), monospace";
  const main = "M70 150 L230 150 L370 150";
  const out = "M470 150 L630 150";
  const refund = "M300 170 C300 250 70 250 70 172";
  const solvers = [
    { x: 420, y: 70, label: "S1" },
    { x: 470, y: 95, label: "S2" },
    { x: 470, y: 205, label: "S3" },
    { x: 420, y: 230, label: "S4" },
  ];
  return (
    <svg ref={ref} viewBox="0 0 700 290" className="h-auto w-full" role="img" aria-label={t("docs.flow.aria")}>
      <defs>
        <radialGradient id="flow-core" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="var(--fg)" stopOpacity="0.9" />
          <stop offset="1" stopColor="var(--fg)" stopOpacity="0" />
        </radialGradient>
      </defs>

      <path d={main} stroke="var(--accent)" strokeOpacity="0.7" fill="none" />
      <path d={out} stroke="var(--accent)" strokeOpacity="0.7" fill="none" />
      <path d={refund} stroke="var(--fg)" strokeOpacity="0.25" strokeDasharray="3 5" fill="none" />

      {[0, 1.2, 2.4].map((b) => (
        <circle key={b} r="3.5" fill="var(--fg)" className="motion-reduce:hidden">
          <animateMotion dur="3.6s" begin={`${b}s`} repeatCount="indefinite" path={main} />
        </circle>
      ))}
      {[0.6, 1.8, 3].map((b) => (
        <circle key={b} r="3.5" fill="var(--accent)" className="motion-reduce:hidden">
          <animateMotion dur="3.6s" begin={`${b}s`} repeatCount="indefinite" path={out} keyPoints="0;1;1" keyTimes="0;0.5;1" calcMode="linear" />
        </circle>
      ))}

      {/* solver auction */}
      <circle cx="420" cy="150" r="48" fill="url(#flow-core)" opacity="0.25" />
      {solvers.map((s, i) => (
        <g key={s.label}>
          <line x1="420" y1="150" x2={s.x} y2={s.y} stroke="var(--fg)" strokeOpacity="0.2" strokeDasharray="2 4" />
          <circle cx={s.x} cy={s.y} r="11" fill="var(--surface)" stroke="var(--fg)" strokeOpacity="0.6" />
          {/* Accent ring fades in over the neutral one (SMIL can't animate between CSS variables). */}
          <circle cx={s.x} cy={s.y} r="11" fill="none" stroke="var(--accent)" strokeOpacity="0">
            <animate attributeName="stroke-opacity" values="0;0.9;0" dur="3.6s" begin={`${i * 0.9}s`} repeatCount="indefinite" />
          </circle>
          <text x={s.x} y={s.y + 4} textAnchor="middle" fontSize="10" fill="var(--text)" fontFamily={mono}>
            {s.label}
          </text>
        </g>
      ))}
      <circle cx="420" cy="150" r="10" fill="var(--fg)" />
      <circle cx="420" cy="150" r="24" fill="none" stroke="var(--accent)" strokeOpacity="0.6" className="motion-reduce:hidden">
        <animate attributeName="r" values="14;30;14" dur="2.4s" repeatCount="indefinite" />
        <animate attributeName="stroke-opacity" values="0.8;0;0.8" dur="2.4s" repeatCount="indefinite" />
      </circle>

      {[
        { x: 70, t: t("docs.flow.wallet"), s: t("docs.flow.anyCoin") },
        { x: 230, t: t("docs.flow.deposit"), s: t("docs.flow.oneTime") },
        { x: 630, t: t("docs.flow.dest"), s: t("docs.flow.paidBy") },
      ].map((n) => (
        <g key={n.x}>
          <rect x={n.x - 8} y="142" width="16" height="16" transform={`rotate(45 ${n.x} 150)`} fill={n.x === 630 ? "var(--accent)" : "var(--surface)"} stroke="var(--fg)" />
          <text x={n.x} y="120" textAnchor="middle" fill="var(--text)" fontFamily={mono} {...fitText(n.t, 11, 136)}>
            {n.t}
          </text>
          <text x={n.x} y="185" textAnchor="middle" fill="var(--muted)" fontFamily={mono} {...fitText(n.s, 10, 136)}>
            {n.s}
          </text>
        </g>
      ))}
      <text x="420" y="35" textAnchor="middle" fill="var(--text)" fontFamily={mono} {...fitText(t("docs.flow.auction"), 11, 420)}>
        {t("docs.flow.auction")}
      </text>
      <text x="185" y="272" textAnchor="middle" fill="var(--muted)" fontFamily={mono} {...fitText(t("docs.flow.refund"), 10, 360)}>
        {t("docs.flow.refund")}
      </text>
    </svg>
  );
}
