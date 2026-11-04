"use client";

import { useEffect } from "react";
import { rememberLocale, useLocale } from "@/lib/i18n";
import { LOCALE_COOKIE, isLocale, localePath } from "@/lib/locales";

/**
 * One-time move for people who chose a language before languages had their own URLs: that choice was
 * only in localStorage. If there's no language cookie yet and they saved a different language, save it
 * as a cookie and open this page in that language. Runs once per browser; does nothing otherwise.
 */
export function LocaleMigrate() {
  const locale = useLocale();
  useEffect(() => {
    try {
      if (document.cookie.split("; ").some((c) => c.startsWith(`${LOCALE_COOKIE}=`))) return;
      const saved = localStorage.getItem("zcan:locale:v1");
      if (!isLocale(saved)) return;
      rememberLocale(saved);
      if (saved !== locale) window.location.replace(localePath(`${location.pathname}${location.search}${location.hash}`, saved));
    } catch {
      // Storage or cookies blocked: nothing to migrate.
    }
  }, [locale]);
  return null;
}
