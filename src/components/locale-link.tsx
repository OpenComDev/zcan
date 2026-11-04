"use client";

import NextLink from "next/link";
import type { ComponentProps } from "react";
import { useLocale } from "@/lib/i18n";
import { localePath } from "@/lib/locales";

/**
 * next/link that keeps the reader in their language: href="/tools" becomes "/es/tools" on Spanish pages.
 * External links, #anchors, /api/… and files pass through unchanged. Use it everywhere instead of next/link.
 */
export default function Link({ href, ...rest }: ComponentProps<typeof NextLink>) {
  const locale = useLocale();
  const to =
    typeof href === "string"
      ? localePath(href, locale)
      : href && typeof href === "object" && typeof href.pathname === "string"
        ? { ...href, pathname: localePath(href.pathname, locale) }
        : href;
  return <NextLink href={to} {...rest} />;
}
