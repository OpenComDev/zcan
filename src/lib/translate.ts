import { DICTS, type Dict } from "@/i18n";
import type { Locale } from "./locales";

export type Vars = Record<string, string | number>;

function lookup(dict: Dict, key: string): string | undefined {
  const dot = key.indexOf(".");
  if (dot < 0) return undefined;
  return dict[key.slice(0, dot)]?.[key.slice(dot + 1)];
}

/** Looks up "ns.key" in a language, falling back to English, then to the key itself. */
export function translate(locale: Locale, key: string, vars?: Vars): string {
  const raw = lookup(DICTS[locale], key) ?? lookup(DICTS.en, key) ?? key;
  return vars ? raw.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m)) : raw;
}
