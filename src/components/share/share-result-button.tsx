"use client";

import { Check, Share2 } from "lucide-react";
import { useState } from "react";
import { track } from "@/lib/analytics";
import { useLocale, useT } from "@/lib/i18n";
import { isUnique, roundOneIn, shareUrl, type ShareResult } from "@/lib/share-results";
import { useCanShare } from "@/lib/use-can-share";

/** The line people share, in their language, e.g. "My browser is 1 in 44,000 — …". */
export function useShareText() {
  const t = useT();
  const locale = useLocale();
  const num = new Intl.NumberFormat(locale);
  return (r: ShareResult) => {
    if (r.kind === "fingerprint") return isUnique(r) ? t("share.fp.textUnique") : t("share.fp.text", { n: num.format(roundOneIn(r.n)) });
    const plural = r.n === 1 ? "one" : "other";
    return t(`share.photo.${r.gps ? "textGps" : "text"}.${plural}`, { n: num.format(r.n) });
  };
}

/**
 * "Share result": the system share sheet where there is one, otherwise copies the text and link.
 * The link carries only the rounded number (see src/lib/share-results.ts).
 */
export function ShareResultButton({ result, className = "" }: { result: ShareResult; className?: string }) {
  const t = useT();
  const locale = useLocale();
  const text = useShareText();
  const canShare = useCanShare();
  const [copied, setCopied] = useState(false);

  const onClick = async () => {
    const url = shareUrl(result, locale, location.origin);
    const message = text(result);
    track("Result shared", { tool: result.kind });
    if (canShare) {
      try {
        await navigator.share({ text: message, url });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(`${message} ${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked: nothing else to do.
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-10 items-center gap-2 border border-line px-3 text-[12px] uppercase tracking-wider text-muted transition-colors hover:border-line-strong hover:text-fg ${className}`}
    >
      {copied ? <Check size={14} className="text-green" aria-hidden /> : <Share2 size={14} aria-hidden />}
      {copied ? t("tools.link.copiedResult") : t("tools.link.shareResult")}
      <span className="sr-only" aria-live="polite">
        {copied ? t("tools.link.copiedResult") : ""}
      </span>
    </button>
  );
}
