"use client";

import { useId, useRef, type KeyboardEvent } from "react";
import { useLocale, useT } from "@/lib/i18n";
import { setPerfMode, usePerf, type PerfMode, type PerfTier } from "./tier";

const MODES: PerfMode[] = ["auto", "full", "lite"];
const TIER_KEY: Record<PerfTier, string> = { full: "perf.full", lite: "perf.lite", static: "perf.still" };

/**
 * "Effects: Auto / Full / Lite" — how much animation the canvas scenes use. Saved in this
 * browser (`zcan:perf:v1`). Reduced motion always wins; the note below says so.
 */
export function PerfToggle({ heading = true }: { heading?: boolean }) {
  const t = useT();
  const locale = useLocale();
  const perf = usePerf();
  const headId = useId();
  const noteId = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const choose = (m: PerfMode) => {
    if (m !== perf.mode) setPerfMode(m);
  };
  // Radio-group keyboard pattern: arrows move and select, Home/End jump.
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % MODES.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i - 1 + MODES.length) % MODES.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = MODES.length - 1;
    if (next < 0) return;
    e.preventDefault();
    choose(MODES[next]);
    refs.current[next]?.focus();
  };

  const why = perf.reasons.filter((r) => r !== "reduced").map((r) => t(`perf.why.${r}`));
  let note: string;
  if (perf.reasons.includes("reduced")) note = t("perf.reduced");
  else if (perf.mode === "auto") {
    const tier = t(TIER_KEY[perf.auto]);
    note = why.length ? t("perf.autoPickWhy", { tier, why: listFormat(locale, why) }) : t("perf.autoPick", { tier });
  } else note = t("perf.hint");

  return (
    <div className="grid gap-1.5">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-1">
        {heading ? (
          <h3 id={headId} className="label">
            {t("perf.effects")}
          </h3>
        ) : (
          // The surrounding menu shows its own heading; keep this only as the radiogroup's accessible name.
          <span id={headId} className="sr-only">
            {t("perf.effects")}
          </span>
        )}
        <div role="radiogroup" aria-labelledby={headId} aria-describedby={noteId} className="flex shrink-0 border border-line">
          {MODES.map((m, i) => {
            const on = perf.mode === m;
            return (
              <button
                key={m}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on ? 0 : -1}
                onClick={() => choose(m)}
                onKeyDown={(e) => onKey(e, i)}
                className={`h-8 min-w-12 touch-manipulation border-r border-line px-2.5 text-[11px] uppercase tracking-wider transition-colors duration-150 last:border-r-0 focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-accent ${
                  on ? "bg-surface-3 text-text shadow-[inset_0_-2px_0_var(--accent)]" : "bg-surface text-muted hover:bg-surface-2 hover:text-text"
                }`}
              >
                {t(`perf.${m}`)}
              </button>
            );
          })}
        </div>
      </div>
      <p id={noteId} className="px-1 text-[11px] text-subtle">
        {note}
      </p>
    </div>
  );
}

function listFormat(locale: string, items: string[]) {
  try {
    return new Intl.ListFormat(locale, { style: "short", type: "conjunction" }).format(items);
  } catch {
    return items.join(", ");
  }
}
