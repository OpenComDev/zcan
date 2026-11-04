import type { ReactNode } from "react";
import s from "./landing.module.css";

/*
 * Decorative SVGs for the landing sections (aria-hidden: the text next to each one says the same thing).
 * No words inside, only tickers, file-format tags and an address, so nothing here needs translating.
 * Colours come from theme tokens via Tailwind fill/stroke utilities. SMIL ignores CSS, so every moving
 * part is `motion-reduce:hidden` and the still drawing on its own reads as a finished picture.
 */

const svgProps = { className: "h-auto w-full", "aria-hidden": true, focusable: "false" } as const;

/** Hero: an instrument reticle with four marks — one per trust promise — around a shield. */
export function Emblem() {
  const ticks = Array.from({ length: 60 }, (_, i) => i * 6);
  const marks = [225, 315, 45, 135].map((deg, i) => {
    const r = (deg * Math.PI) / 180;
    return { n: `0${i + 1}`, x: 150 + 96 * Math.cos(r), y: 150 + 96 * Math.sin(r), lx: 150 + 120 * Math.cos(r), ly: 150 + 120 * Math.sin(r) };
  });
  return (
    <svg viewBox="0 0 300 300" {...svgProps}>
      <circle cx="150" cy="150" r="138" fill="none" className="stroke-line" />
      <g className={s.spin}>
        {ticks.map((a) => (
          <line
            key={a}
            x1="150"
            y1={a % 30 === 0 ? 14 : 18}
            x2="150"
            y2="24"
            transform={`rotate(${a} 150 150)`}
            className={a % 90 === 0 ? "stroke-accent" : "stroke-line-strong"}
          />
        ))}
      </g>
      <g className={s.spinBack}>
        <circle cx="150" cy="150" r="96" fill="none" className="stroke-line-strong" strokeDasharray="2 6" />
        <circle cx="150" cy="54" r="2.5" className="fill-accent" />
      </g>
      <line x1="40" y1="150" x2="260" y2="150" className="stroke-line" />
      <line x1="150" y1="40" x2="150" y2="260" className="stroke-line" />
      <circle cx="150" cy="150" r="58" fill="none" className="stroke-accent" strokeOpacity="0.45" />

      {marks.map((m) => (
        <g key={m.n}>
          <rect x={m.x - 5} y={m.y - 5} width="10" height="10" transform={`rotate(45 ${m.x} ${m.y})`} className="fill-surface stroke-text" />
          <text x={m.lx} y={m.ly + 3.5} textAnchor="middle" fontSize="10" className="fill-muted font-mono">
            {m.n}
          </text>
        </g>
      ))}

      <circle cx="150" cy="150" r="30" fill="none" className="stroke-accent motion-reduce:hidden">
        <animate attributeName="r" values="26;46;26" dur="3.2s" repeatCount="indefinite" />
        <animate attributeName="stroke-opacity" values="0.7;0;0.7" dur="3.2s" repeatCount="indefinite" />
      </circle>
      <path d="M150 124 L172 132 V150 C172 164 162 173 150 178 C138 173 128 164 128 150 V132 Z" className="fill-bg stroke-text" strokeWidth="1.25" />
      <path d="M141 151 L148 158 L160 144" fill="none" className="stroke-accent" strokeWidth="2" strokeLinecap="square" />
    </svg>
  );
}

/** Swap: three coins flow into a solver auction and out as ZEC. */
export function SwapGlyph() {
  const inputs = [
    { sym: "BTC", y: 34, d: "M62 34 C108 34 118 75 146 75" },
    { sym: "ETH", y: 75, d: "M62 75 L146 75" },
    { sym: "SOL", y: 116, d: "M62 116 C108 116 118 75 146 75" },
  ];
  const out = "M174 75 L262 75";
  const solvers = [0, 90, 180, 270].map((deg) => {
    const r = (deg * Math.PI) / 180;
    return { x: 160 + 26 * Math.cos(r), y: 75 + 26 * Math.sin(r) };
  });
  return (
    <svg viewBox="0 0 320 150" {...svgProps}>
      {inputs.map((i) => (
        <g key={i.sym}>
          <path d={i.d} fill="none" className="stroke-line-strong" />
          <rect x="50" y={i.y - 6} width="12" height="12" transform={`rotate(45 56 ${i.y})`} className="fill-surface stroke-muted" />
          <text x="40" y={i.y + 3.5} textAnchor="end" fontSize="10" className="fill-muted font-mono">
            {i.sym}
          </text>
        </g>
      ))}
      <path d={out} fill="none" className="stroke-accent" strokeOpacity="0.7" />

      <g className="motion-reduce:hidden">
        {inputs.map((i, k) => (
          <circle key={i.sym} r="2.5" className="fill-text">
            <animateMotion dur="2.4s" begin={`${k * 0.8}s`} repeatCount="indefinite" path={i.d} />
          </circle>
        ))}
        {[0.6, 1.8].map((b) => (
          <circle key={b} r="3" className="fill-accent">
            <animateMotion dur="2.4s" begin={`${b}s`} repeatCount="indefinite" path={out} />
          </circle>
        ))}
        <circle cx="160" cy="75" r="14" fill="none" className="stroke-accent">
          <animate attributeName="r" values="12;24;12" dur="2.4s" repeatCount="indefinite" />
          <animate attributeName="stroke-opacity" values="0.8;0;0.8" dur="2.4s" repeatCount="indefinite" />
        </circle>
      </g>

      <circle cx="160" cy="75" r="26" fill="none" className="stroke-line-strong" strokeDasharray="2 4" />
      <g className={s.spin}>
        {solvers.map((p) => (
          <circle key={`${p.x}-${p.y}`} cx={p.x} cy={p.y} r="3.5" className="fill-surface stroke-text" />
        ))}
      </g>
      <circle cx="160" cy="75" r="8" className="fill-text" />

      <rect x="264" y="67" width="16" height="16" transform="rotate(45 272 75)" className="fill-accent stroke-text" />
      <text x="272" y="52" textAnchor="middle" fontSize="10" className="fill-text font-mono">
        ZEC
      </text>
    </svg>
  );
}

/** One tile of the protect illustration, with a leak tag that gets struck out. */
function Tile({ x, tag, delay, children }: { x: number; tag: string; delay: number; children: ReactNode }) {
  const w = tag.length * 5.4 + 8;
  const loop = { dur: "6s", repeatCount: "indefinite", begin: `${delay}s` };
  return (
    <g transform={`translate(${x} 62)`}>
      <rect width="92" height="76" className="fill-surface stroke-line-strong" />
      {children}
      <g transform={`translate(${84 - w} 8)`}>
        <rect width={w} height="13" fill="none" className="stroke-accent" />
        <text x={w / 2} y="9.5" textAnchor="middle" fontSize="9" className="fill-accent font-mono">
          {tag}
        </text>
        {/* Moving: the strike draws in and fades; still: it stays drawn. */}
        <line x1="-2" y1="6.5" x2={w + 2} y2="6.5" className="stroke-text motion-reduce:hidden" strokeWidth="1.25" opacity="0">
          <animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;0.25;0.35;0.9;1" {...loop} />
        </line>
        <line x1="-2" y1="6.5" x2={w + 2} y2="6.5" className="hidden stroke-text motion-reduce:inline" strokeWidth="1.25" />
      </g>
    </g>
  );
}

/** Protect: a tracking link losing its parameters, and a photo, document and clipboard losing their leaks. */
export function ProtectGlyph() {
  const loop = { dur: "6s", repeatCount: "indefinite" };
  return (
    <svg viewBox="0 0 320 150" {...svgProps}>
      <rect x="12" y="14" width="296" height="30" className="fill-bg stroke-line-strong" />
      <circle cx="25" cy="29" r="3" className="fill-subtle" />
      <text x="35" y="32.5" fontSize="10" className="font-mono">
        <tspan className="fill-text">shop.example/item</tspan>
        <tspan className="fill-muted">
          ?utm_source=ad&amp;fbclid=Iw…
          <animate attributeName="fill-opacity" values="1;1;0.35;0.35;1" keyTimes="0;0.2;0.3;0.9;1" {...loop} />
        </tspan>
      </text>
      <rect x="137" y="28.5" height="1.5" width="0" className="fill-accent motion-reduce:hidden">
        <animate attributeName="width" values="0;0;152;152;0" keyTimes="0;0.08;0.22;0.9;1" {...loop} />
      </rect>
      <rect x="137" y="28.5" height="1.5" width="152" className="hidden fill-accent motion-reduce:inline" />

      <Tile x={12} tag="GPS" delay={0}>
        <rect x="8" y="26" width="58" height="42" fill="none" className="stroke-line-strong" />
        <polyline points="8,62 24,44 34,54 46,38 66,62" fill="none" className="stroke-muted" />
        <circle cx="54" cy="35" r="3.5" className="fill-muted" />
      </Tile>
      <Tile x={114} tag="XMP" delay={0.6}>
        <path d="M10 26 H44 L54 36 V68 H10 Z M44 26 V36 H54" fill="none" className="stroke-muted" />
        <line x1="18" y1="46" x2="46" y2="46" className="stroke-line-strong" />
        <line x1="18" y1="53" x2="42" y2="53" className="stroke-line-strong" />
        <line x1="18" y1="60" x2="46" y2="60" className="stroke-line-strong" />
      </Tile>
      <Tile x={216} tag="0x…" delay={1.2}>
        <rect x="10" y="30" width="40" height="38" fill="none" className="stroke-muted" />
        <rect x="20" y="26" width="20" height="8" className="fill-surface stroke-muted" />
        <text x="30" y="52" textAnchor="middle" fontSize="8" className="fill-text font-mono">
          bc1q…
        </text>
        <path d="M58 52 L64 58 L76 44" fill="none" className="stroke-green" strokeWidth="1.5" />
      </Tile>
    </svg>
  );
}

/** Ask: a request becomes a plan; steps are ticked off one at a time, only after approval. */
export function AgentGlyph() {
  const rows = [
    { y: 52, w: 112 },
    { y: 80, w: 86 },
    { y: 108, w: 124 },
  ];
  return (
    <svg viewBox="0 0 320 150" {...svgProps}>
      {/* The request */}
      <rect x="12" y="22" width="88" height="48" className="fill-surface stroke-line-strong" />
      <path d="M24 70 V82 L38 70" className="fill-surface stroke-line-strong" />
      <line x1="24.5" y1="70" x2="37.5" y2="70" className="stroke-surface" strokeWidth="1.5" />
      <rect x="22" y="34" width="62" height="4" className="fill-muted" />
      <rect x="22" y="44" width="44" height="4" className="fill-muted" />
      <rect x="22" y="54" width="54" height="4" className="fill-subtle" />

      <path d="M104 46 H120" className="stroke-line-strong" />
      <path d="M116 42 L120 46 L116 50" fill="none" className="stroke-line-strong" />

      {/* The plan */}
      <rect x="124" y="16" width="184" height="118" className="fill-surface stroke-line-strong" />
      <rect x="124.5" y="16.5" width="183" height="18" className="fill-surface-2" />
      {[136, 146, 156].map((cx) => (
        <circle key={cx} cx={cx} cy="25.5" r="2.5" className="fill-subtle" />
      ))}
      {rows.map((r, i) => (
        <g key={r.y}>
          <rect x="138" y={r.y - 6} width="12" height="12" fill="none" className="stroke-muted" />
          <rect x="160" y={r.y - 2} width={r.w} height="4" className="fill-muted" />
          {/* Moving: ticks appear in turn, then the plan resets. Still: two of three approved. */}
          <g opacity="0" className="motion-reduce:hidden">
            <animate attributeName="opacity" values="0;0;1;1;0" keyTimes={`0;${0.2 + i * 0.2};${0.25 + i * 0.2};0.92;1`} dur="6s" repeatCount="indefinite" />
            <rect x="138" y={r.y - 6} width="12" height="12" className="fill-accent" />
            <path d={`M141 ${r.y} L143.5 ${r.y + 2.5} L147 ${r.y - 2.5}`} fill="none" className="stroke-accent-ink" strokeWidth="1.5" />
          </g>
          {i < 2 && (
            <g className="hidden motion-reduce:inline">
              <rect x="138" y={r.y - 6} width="12" height="12" className="fill-accent" />
              <path d={`M141 ${r.y} L143.5 ${r.y + 2.5} L147 ${r.y - 2.5}`} fill="none" className="stroke-accent-ink" strokeWidth="1.5" />
            </g>
          )}
        </g>
      ))}

      {/* Your approval gates the run */}
      <path d="M56 96 V124 H124" fill="none" className="stroke-line-strong" strokeDasharray="2 4" />
      <circle cx="56" cy="104" r="12" className="fill-bg stroke-accent" />
      <path d="M50 104 L54.5 108.5 L62 100" fill="none" className="stroke-accent" strokeWidth="1.5" />
      <circle cx="56" cy="104" r="12" fill="none" className="stroke-accent motion-reduce:hidden">
        <animate attributeName="r" values="12;20;12" dur="2s" repeatCount="indefinite" />
        <animate attributeName="stroke-opacity" values="0.7;0;0.7" dur="2s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}
