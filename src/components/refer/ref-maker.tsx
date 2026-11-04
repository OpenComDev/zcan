"use client";

import { Check, Copy, Share2 } from "lucide-react";
import { useId, useState } from "react";
import { track } from "@/lib/analytics";
import { useLocale, useT } from "@/lib/i18n";
import { localePath } from "@/lib/locales";
import { isIntentsAccount } from "@/lib/referral";
import { useCanShare } from "@/lib/use-can-share";

/** Turns a NEAR account into a referral link. Nothing is sent anywhere; the link is built here. */
export function RefMaker() {
  const t = useT();
  const locale = useLocale();
  const canShare = useCanShare();
  const id = useId();
  const [value, setValue] = useState("");
  const [copied, setCopied] = useState(false);
  const account = value.trim().toLowerCase();
  const valid = isIntentsAccount(account);
  const showError = account.length > 0 && !valid;
  const link = valid && typeof window !== "undefined" ? `${location.origin}${localePath("/", locale)}?ref=${encodeURIComponent(account)}` : "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      track("Referral link created");
    } catch {
      // Clipboard blocked: the link stays visible to copy by hand.
    }
  };

  return (
    <div>
      <label htmlFor={id} className="label">
        {t("refer.make.label")}
      </label>
      <input
        id={id}
        name="near-account"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t("refer.make.placeholder")}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        translate="no"
        aria-invalid={showError || undefined}
        aria-describedby={showError ? `${id}-err` : undefined}
        className={`mt-2 h-12 w-full min-w-0 border bg-bg-2 px-3 font-mono text-base text-fg outline-none placeholder:text-subtle focus:border-accent/70 sm:text-[14px] ${showError ? "border-red" : "border-line"}`}
      />
      {showError && (
        <p id={`${id}-err`} role="alert" className="mt-2 text-[13px] text-red">
          {t("refer.make.invalid")}
        </p>
      )}
      {link && (
        <div className="fade-up mt-5" aria-live="polite">
          <p className="micro">{t("refer.make.link")}</p>
          <p className="mt-2 break-all border border-accent/40 bg-bg-2 p-3 font-mono text-[13px] text-fg" translate="no">
            {link}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={copy} className="btn-accent inline-flex h-10 items-center gap-2 px-4 text-[12px]">
              {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
              {copied ? t("refer.make.copied") : t("refer.make.copy")}
            </button>
            {canShare && (
              <button
                type="button"
                onClick={() => {
                  track("Referral link created");
                  navigator.share({ text: t("refer.make.shareText"), url: link }).catch(() => {});
                }}
                className="inline-flex h-10 items-center gap-2 border border-line px-3 text-[12px] uppercase tracking-wider text-muted transition-colors hover:border-line-strong hover:text-fg"
              >
                <Share2 size={14} aria-hidden /> {t("refer.make.share")}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
