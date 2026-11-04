"use client";

import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { useId, useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { useT } from "@/lib/i18n";
import { applyTheme, setThemePref, useResolvedTheme, useThemePref, type ThemePref } from "@/lib/theme";

const OPTIONS: { value: ThemePref; icon: LucideIcon; key: string }[] = [
  { value: "system", icon: Monitor, key: "prefs.theme.system" },
  { value: "light", icon: Sun, key: "prefs.theme.light" },
  { value: "dark", icon: Moon, key: "prefs.theme.dark" },
];

/**
 * Keeps <html data-theme> in step with the stored choice and the system setting.
 * Mounted once in the root layout; renders nothing. (React's dev remount resets <html>
 * attributes the inline bootstrap script set, so this re-applies them before paint.)
 */
export function ThemeSync() {
  const pref = useThemePref();
  const theme = useResolvedTheme();
  useLayoutEffect(() => {
    // Read the store directly: during hydration the hook values are still the server defaults.
    applyTheme();
  }, [pref, theme]);
  return null;
}

/** System / Light / Dark segmented control (radiogroup, arrow keys move and select). */
export function ThemeToggle({ heading = true }: { heading?: boolean }) {
  const t = useT();
  const pref = useThemePref();
  const headId = useId();
  const hintId = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = OPTIONS.findIndex((o) => o.value === pref);
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % OPTIONS.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i - 1 + OPTIONS.length) % OPTIONS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = OPTIONS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    setThemePref(OPTIONS[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div className="grid gap-1.5">
      {heading && (
        <h3 id={headId} className="label px-1 pb-1">
          {t("prefs.theme.title")}
        </h3>
      )}
      <div
        role="radiogroup"
        aria-labelledby={heading ? headId : undefined}
        aria-label={heading ? undefined : t("prefs.theme.title")}
        aria-describedby={hintId}
        onKeyDown={onKey}
        className="grid grid-cols-3 border border-line bg-surface-2"
      >
        {OPTIONS.map(({ value, icon: Icon, key }, i) => {
          const on = pref === value;
          return (
            <button
              key={value}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              onClick={() => setThemePref(value)}
              className={`flex min-h-10 min-w-0 touch-manipulation items-center justify-center gap-1.5 border-r border-line px-1.5 text-[11px] uppercase tracking-wider transition-colors duration-150 last:border-r-0 focus-visible:outline-1 focus-visible:-outline-offset-2 focus-visible:outline-accent ${
                on ? "bg-surface-3 text-fg shadow-[inset_0_-2px_0_var(--accent)]" : "text-muted hover:bg-surface hover:text-text"
              }`}
            >
              <Icon size={13} aria-hidden className={`shrink-0 ${on ? "text-accent" : ""}`} />
              <span className="truncate">{t(key)}</span>
            </button>
          );
        })}
      </div>
      <p id={hintId} className="micro px-1">
        {t("prefs.theme.hint")}
      </p>
    </div>
  );
}
