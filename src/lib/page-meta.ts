import type { Metadata } from "next";
import { DICTS } from "@/i18n";
import { DEFAULT_LOCALE, LOCALES, isLocale, localePath, type Locale } from "./locales";
import { translate } from "./translate";

/**
 * canonical + hreflang links for a page: the page's own language is canonical, and every language
 * (plus x-default → English) is listed so search engines index each version.
 */
export function languageAlternates(path: string, locale: Locale): NonNullable<Metadata["alternates"]> {
  const languages: Record<string, string> = {};
  for (const l of LOCALES) languages[l.hreflang] = localePath(path, l.code);
  languages["x-default"] = localePath(path, DEFAULT_LOCALE);
  return { canonical: localePath(path, locale), languages };
}

type Params = Promise<{ lang: string }>;

/**
 * Metadata for a page from src/i18n/meta.ts: `meta.<key>.title` and `meta.<key>.desc` in the page's language.
 * `index: false` keeps private pages (orders, history) out of search results.
 */
export async function pageMeta(params: Params, path: string, key: string, opts: { index?: boolean } = {}): Promise<Metadata> {
  const { lang } = await params;
  const locale: Locale = isLocale(lang) ? lang : DEFAULT_LOCALE;
  const hasDesc = Boolean(DICTS.en.meta?.[`${key}.desc`]);
  const title = translate(locale, `meta.${key}.title`);
  const description = hasDesc ? translate(locale, `meta.${key}.desc`) : undefined;
  const alternates = languageAlternates(path, locale);
  return {
    title,
    description,
    alternates,
    openGraph: { title, description, url: alternates.canonical as string, locale: LOCALES.find((l) => l.code === locale)?.og },
    ...(opts.index === false ? { robots: { index: false } } : {}),
  };
}

/** Pages tied to one person's data (an order, a batch, a payment link): translated title, never indexed, no canonical. */
export async function privatePageMeta(params: Params, key: string): Promise<Metadata> {
  const { lang } = await params;
  const locale: Locale = isLocale(lang) ? lang : DEFAULT_LOCALE;
  return { title: translate(locale, `meta.${key}.title`), robots: { index: false, follow: false }, alternates: {} };
}
