"use client";

import { Check, Copy } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useT } from "@/lib/i18n";

/** Monospace code block with a copy button. */
export function Code({ children, label }: { children: string; label?: ReactNode }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <div className="border border-line bg-bg-2">
      <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
        <span className="micro">{label ?? t("docs.code.example")}</span>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(children);
              setCopied(true);
              setTimeout(() => setCopied(false), 1400);
            } catch {}
          }}
          aria-label={copied ? t("common.copied") : t("docs.code.copy")}
          className="inline-flex size-7 items-center justify-center text-muted hover:text-fg"
        >
          {copied ? <Check size={13} className="text-green" /> : <Copy size={13} />}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-[12px] leading-relaxed text-text">
        <code>{children}</code>
      </pre>
    </div>
  );
}
