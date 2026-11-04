"use client";

import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, type ReactNode } from "react";
import { LOCALE_COOKIE, LOCALES, localePath, stripLocale, type Locale } from "./locales";
import { translate, type Vars } from "./translate";

/**
 * UI language. It comes from the URL (/es/…, bare paths are English) and is provided by the [lang]
 * layout, so the server renders the right language and nothing switches after load.
 */
export { LOCALES, translate };
export type { Locale, Vars };

const LocaleContext = createContext<Locale>("en");

export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext value={locale}>{children}</LocaleContext>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

/** `const lp = useLocalePath(); router.push(lp("/order/123"))` — keeps navigation in the current language. */
export function useLocalePath() {
  const locale = useLocale();
  return useCallback((href: string) => localePath(href, locale), [locale]);
}

/** The current route without its language prefix: "/es/tools" → "/tools". For nav highlighting and crumbs. */
export function useRoutePath(): string {
  return stripLocale(usePathname() ?? "/").path;
}

/**
 * Saves an explicit language choice: a cookie (so bare URLs redirect to it) and localStorage (kept with
 * the other on-device settings). The caller then navigates to the page in that language.
 */
export function rememberLocale(next: Locale) {
  try {
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
  } catch {
    // Cookies blocked: the choice still applies to this visit through the URL.
  }
  try {
    localStorage.setItem("zcan:locale:v1", next);
  } catch {
    // Storage blocked.
  }
}

/** `const t = useT(); t("swap.youSend")` */
export function useT() {
  const locale = useLocale();
  return useCallback((key: string, vars?: Vars) => translate(locale, key, vars), [locale]);
}

/** Translated text usable from server components: `<T k="help.title" />`. */
export function T({ k, vars }: { k: string; vars?: Vars }): ReactNode {
  return useT()(k, vars);
}
