"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { useT } from "@/lib/i18n";

/** Icon button (or labelled button) that copies `value`, with a polite live confirmation. */
export function CopyButton({ value, label, text, onCopied }: { value: string; label: string; text?: string; onCopied?: () => void }) {
  const [copied, setCopied] = useState(false);
  const t = useT();
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          onCopied?.();
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard blocked — the value stays visible for manual copying.
        }
      }}
      aria-label={text ? undefined : copied ? t("common.copied") : label}
      className={`inline-flex shrink-0 items-center justify-center gap-2 border border-line text-muted transition-colors duration-150 hover:border-line-strong hover:bg-surface-2 hover:text-fg ${
        text ? "h-10 px-3 text-[12px] uppercase tracking-wider" : "size-10"
      }`}
    >
      {copied ? <Check size={15} className="text-green" aria-hidden /> : <Copy size={15} aria-hidden />}
      {text && <span className="min-w-0 truncate">{copied ? t("common.copied") : text}</span>}
      <span className="sr-only" aria-live="polite">
        {copied ? t("common.copied") : ""}
      </span>
    </button>
  );
}
