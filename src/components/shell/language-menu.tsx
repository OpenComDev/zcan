"use client";

import { Globe } from "lucide-react";
import { useId } from "react";
import { LOCALES, rememberLocale, useLocale, useT, type Locale } from "@/lib/i18n";
import { localePath } from "@/lib/locales";

/**
 * Native select, so it works with keyboards, screen readers and mobile pickers out of the box.
 * Choosing a language opens the same page at that language's URL (query and #hash kept). It's a full
 * page load: the document itself (<html lang>, fonts, the theme script) belongs to the language.
 */
export function LanguageMenu({ className = "" }: { className?: string }) {
  const locale = useLocale();
  const t = useT();
  const id = useId();
  const choose = (next: Locale) => {
    rememberLocale(next);
    const here = `${location.pathname}${location.search}${location.hash}`;
    window.location.assign(localePath(here, next));
  };
  return (
    <div className={`relative h-9 items-center border border-line text-muted transition-colors focus-within:border-line-strong hover:border-line-strong hover:text-fg ${className}`}>
      <label htmlFor={id} className="sr-only">
        {t("shell.language")}
      </label>
      <Globe size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2" aria-hidden />
      <select
        id={id}
        value={locale}
        onChange={(e) => choose(e.target.value as Locale)}
        className="h-full appearance-none bg-surface py-0 pl-8 pr-3 text-[12px] uppercase tracking-wider text-inherit outline-none focus-visible:ring-1 focus-visible:ring-accent"
      >
        {LOCALES.map((l) => (
          <option key={l.code} value={l.code} lang={l.code}>
            {l.label}
          </option>
        ))}
      </select>
    </div>
  );
}
