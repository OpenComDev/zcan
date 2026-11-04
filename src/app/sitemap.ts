import type { MetadataRoute } from "next";
import { ARTICLES } from "@/components/learn/articles";
import { AGENTS } from "@/lib/agents";
import { GUIDES } from "@/lib/guides";
import { LOCALES, localePath } from "@/lib/locales";

const SITE = "https://www.zcan.dev";

/** Public pages only: orders, batches, payment links, history and offline stay out of search. */
const PAGES = [
  "/",
  "/tools",
  "/tools/address",
  "/tools/aliases",
  "/tools/clipboard",
  "/tools/documents",
  "/tools/fingerprint",
  "/tools/passwords",
  "/agents",
  ...AGENTS.map((a) => `/agents/${a.id}`),
  "/learn",
  ...ARTICLES.map((a) => `/learn/${a.slug}`),
  "/guides",
  ...GUIDES.map((g) => `/guides/${g.slug}`),
  "/refer",
  "/send",
  "/pay",
  "/markets",
  "/network",
  "/status",
  "/track",
  "/help",
  "/docs",
  "/security",
  "/transparency",
  "/app",
  "/support",
  "/legal/website/privacy-policy",
];

/** Every page in every language, each entry listing its translations (hreflang). */
export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.flatMap((path) => {
    const languages = Object.fromEntries(LOCALES.map((l) => [l.hreflang, `${SITE}${localePath(path, l.code)}`]));
    return LOCALES.map((l) => ({
      url: `${SITE}${localePath(path, l.code)}`,
      alternates: { languages },
      changeFrequency: path === "/" || path === "/markets" || path === "/network" ? ("daily" as const) : ("weekly" as const),
      priority: path === "/" ? 1 : path.split("/").length > 2 ? 0.6 : 0.8,
    }));
  });
}
