/**
 * Languages and their URLs. Shared by server and client code (no "use client") and by next.config.ts,
 * so it must not import anything. Translation lookup lives in ./translate.ts.
 *
 * English lives at the bare path (/tools); every other language under its code (/es/tools).
 */
export const LOCALES = [
  { code: "en", label: "English", short: "EN", hreflang: "en", og: "en_US" },
  { code: "es", label: "Español", short: "ES", hreflang: "es", og: "es_ES" },
  { code: "pt", label: "Português", short: "PT", hreflang: "pt", og: "pt_BR" },
  { code: "tr", label: "Türkçe", short: "TR", hreflang: "tr", og: "tr_TR" },
  { code: "ru", label: "Русский", short: "RU", hreflang: "ru", og: "ru_RU" },
  { code: "zh", label: "中文", short: "中文", hreflang: "zh-Hans", og: "zh_CN" },
] as const;

export type Locale = (typeof LOCALES)[number]["code"];

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_CODES = LOCALES.map((l) => l.code) as Locale[];
/** Languages that carry a URL prefix. */
export const PREFIXED = LOCALE_CODES.filter((c) => c !== DEFAULT_LOCALE);

/** Remembers an explicit language choice; next.config redirects bare paths to it. */
export const LOCALE_COOKIE = "zcan-locale";

export const isLocale = (v: unknown): v is Locale => typeof v === "string" && (LOCALE_CODES as string[]).includes(v);

/** Splits "/es/tools?x=1" into { locale: "es", path: "/tools?x=1" }. Bare paths are English. */
export function stripLocale(pathname: string): { locale: Locale; path: string } {
  const m = pathname.match(/^\/([a-z]{2})(?=\/|\?|#|$)(.*)$/);
  if (m && isLocale(m[1])) return { locale: m[1], path: m[2] && !/^[?#]/.test(m[2]) ? m[2] : `/${m[2] ?? ""}` };
  return { locale: DEFAULT_LOCALE, path: pathname || "/" };
}

/**
 * An internal href in `locale`: "/tools" → "/es/tools", "/" → "/es". Leaves alone anything that isn't a
 * page path: other sites, #anchors, mailto:, /api/…, /_next/…, files with an extension, and paths that
 * already carry a language.
 */
export function localePath(href: string, locale: Locale): string {
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  if (/^\/(api|_next|icons|\.well-known)(\/|$)/.test(href)) return href;
  const pathOnly = href.split(/[?#]/)[0];
  if (/\.[a-z0-9]{2,12}$/i.test(pathOnly)) return href;
  const { path } = stripLocale(href);
  if (locale === DEFAULT_LOCALE) return path;
  return path === "/" ? `/${locale}` : /^\/[?#]/.test(path) ? `/${locale}${path.slice(1)}` : `/${locale}${path}`;
}
