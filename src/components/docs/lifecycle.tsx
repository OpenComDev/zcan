"use client";

import { useEffect, useState } from "react";
import { fitText } from "./svg-fit";
import { useLocale, useT } from "@/lib/i18n";

/** Label and description per state live in src/i18n/docs.ts as `docs.state.<id>.label|body`. */
type State = { id: string; x: number; y: number; tone: "wait" | "live" | "done" | "bad" };

const STATES: State[] = [
  { id: "PENDING_DEPOSIT", x: 80, y: 90, tone: "wait" },
  { id: "KNOWN_DEPOSIT_TX", x: 250, y: 90, tone: "live" },
  { id: "PROCESSING", x: 420, y: 90, tone: "live" },
  { id: "SUCCESS", x: 590, y: 90, tone: "done" },
  { id: "INCOMPLETE_DEPOSIT", x: 250, y: 210, tone: "bad" },
  { id: "REFUNDED", x: 420, y: 210, tone: "bad" },
  { id: "FAILED", x: 590, y: 210, tone: "bad" },
];
const EDGES: [string, string][] = [
  ["PENDING_DEPOSIT", "KNOWN_DEPOSIT_TX"],
  ["KNOWN_DEPOSIT_TX", "PROCESSING"],
  ["PROCESSING", "SUCCESS"],
  ["KNOWN_DEPOSIT_TX", "INCOMPLETE_DEPOSIT"],
  ["INCOMPLETE_DEPOSIT", "REFUNDED"],
  ["PROCESSING", "REFUNDED"],
  ["PROCESSING", "FAILED"],
];
const HAPPY = ["PENDING_DEPOSIT", "KNOWN_DEPOSIT_TX", "PROCESSING", "SUCCESS"];
const COLOR = { wait: "var(--accent)", live: "var(--info)", done: "var(--green)", bad: "var(--red)" };

/** Order state machine. Auto-plays the happy path; click or tab to any state to read about it. */
export function Lifecycle() {
  const t = useT();
  const locale = useLocale();
  const label = (id: string) => t(`docs.state.${id}.label`);
  const caps = (id: string) => label(id).toLocaleUpperCase(locale);
  const body = (id: string) => t(`docs.state.${id}.body`);
  const [step, setStep] = useState(0);
  const [pinned, setPinned] = useState<string | null>(null);

  useEffect(() => {
    if (pinned || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setStep((s) => (s + 1) % HAPPY.length), 1600);
    return () => clearInterval(id);
  }, [pinned]);

  const current = pinned ?? HAPPY[step];
  const at = (id: string) => STATES.find((s) => s.id === id)!;
  const info = at(current);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
      <svg viewBox="0 0 670 290" className="h-auto w-full">
        {EDGES.map(([a, b]) => {
          const A = at(a);
          const B = at(b);
          const hot = HAPPY.indexOf(b) > 0 && HAPPY.indexOf(b) <= HAPPY.indexOf(current) && HAPPY.includes(a) && !pinned;
          return <line key={a + b} x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke={hot ? "var(--accent)" : "var(--fg)"} strokeOpacity={hot ? 0.9 : 0.18} strokeDasharray={B.tone === "bad" ? "3 5" : undefined} />;
        })}
        {STATES.map((s) => {
          const on = s.id === current;
          return (
            <g
              key={s.id}
              role="button"
              tabIndex={0}
              aria-pressed={pinned === s.id}
              aria-label={`${label(s.id)}: ${body(s.id)}`}
              onClick={() => setPinned((p) => (p === s.id ? null : s.id))}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setPinned((p) => (p === s.id ? null : s.id));
                }
              }}
              className="cursor-pointer outline-none [&:focus-visible>rect]:stroke-accent"
            >
              <rect x={s.x - 66} y={s.y - 20} width="132" height="40" fill={on ? "var(--surface-2)" : "var(--surface)"} stroke={on ? COLOR[s.tone] : "var(--border-strong)"} strokeWidth={on ? 1.5 : 1} />
              <circle cx={s.x - 50} cy={s.y} r="4" fill={COLOR[s.tone]} opacity={on ? 1 : 0.5}>
                {on && <animate attributeName="opacity" values="1;0.3;1" dur="1.2s" repeatCount="indefinite" />}
              </circle>
              <text x={s.x - 38} y={s.y + 4} fill={on ? "var(--fg)" : "var(--muted)"} fontFamily="var(--font-plex-mono), monospace" {...fitText(caps(s.id), 11, 98)}>
                {caps(s.id)}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="border border-line bg-bg-2 p-4" aria-live="polite">
        <p className="micro">{pinned ? t("docs.life.selected") : t("docs.life.auto")}</p>
        <p className="mt-2 text-[13px] uppercase tracking-wide" style={{ color: COLOR[info.tone] }}>
          {info.id}
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">{body(info.id)}</p>
        {pinned && (
          <button type="button" onClick={() => setPinned(null)} className="mt-3 text-[11px] uppercase tracking-wider text-subtle hover:text-fg">
            {t("docs.life.resume")}
          </button>
        )}
      </div>
    </div>
  );
}
