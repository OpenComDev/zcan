"use client";

import Link from "@/components/locale-link";
import { ArrowRight, Check, Copy, ExternalLink, ShieldCheck, TriangleAlert } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { useLocale, useT } from "@/lib/i18n";
import { setShielded, useShieldedAt } from "./shielded-store";
import { isTransparentPayout, zecPayoutKind } from "./zec-payout";

/**
 * Shown on a completed order that paid out ZEC. A shielded payout gets a confirmation; a transparent
 * payout gets a short guide to shield it, with a "Mark as shielded" box kept on this device.
 */
export function ShieldOnArrival({ depositAddress, recipient }: { depositAddress: string; recipient: string }) {
  const t = useT();
  const kind = useMemo(() => zecPayoutKind(recipient), [recipient]);

  if (kind === "shielded") {
    return (
      <section className="flex items-start gap-3 border border-green/35 bg-green/[0.06] p-4 sm:p-5" aria-labelledby={`${depositAddress}-shield`}>
        <ShieldCheck size={20} className="mt-0.5 shrink-0 text-green" aria-hidden />
        <div className="min-w-0">
          <h2 id={`${depositAddress}-shield`} className="text-[13px] font-medium uppercase tracking-wider text-green">
            {t("order.shield.deliveredTitle")}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">{t("order.shield.deliveredBody")}</p>
        </div>
      </section>
    );
  }

  if (kind === "unified-mixed") {
    return (
      <section className="flex items-start gap-3 border border-green/35 bg-green/[0.06] p-4 sm:p-5" aria-labelledby={`${depositAddress}-shield`}>
        <ShieldCheck size={20} className="mt-0.5 shrink-0 text-green" aria-hidden />
        <div className="min-w-0">
          <h2 id={`${depositAddress}-shield`} className="text-[13px] font-medium uppercase tracking-wider text-green">
            {t("order.shield.unifiedTitle")}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            {t("order.shield.unifiedBody")}{" "}
            <Link href="/learn/shield-after-swap" className="text-accent underline-offset-2 hover:underline">
              {t("order.shield.guide")}
            </Link>
          </p>
        </div>
      </section>
    );
  }

  if (!isTransparentPayout(kind)) return null;
  return <ShieldGuide depositAddress={depositAddress} recipient={recipient} />;
}

function ShieldGuide({ depositAddress, recipient }: { depositAddress: string; recipient: string }) {
  const t = useT();
  const locale = useLocale();
  const markedAt = useShieldedAt(depositAddress);
  const checkId = useId();
  const titleId = useId();
  const [copied, setCopied] = useState(false);

  const markedLabel = useMemo(() => {
    if (!markedAt) return "";
    const d = new Date(markedAt);
    return Number.isNaN(d.getTime()) ? "" : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(d);
  }, [markedAt, locale]);

  const checkbox = (
    <label htmlFor={checkId} className="flex min-h-11 cursor-pointer items-center gap-3 py-1 text-sm text-fg">
      <input
        id={checkId}
        type="checkbox"
        checked={Boolean(markedAt)}
        onChange={(e) => setShielded(depositAddress, e.target.checked)}
        className="size-[18px] shrink-0 accent-[var(--green)]"
      />
      <span>
        <span className="block">{t("order.shield.mark")}</span>
        <span className="block text-[12px] text-subtle">
          {markedAt && markedLabel ? t("order.shield.markedOn", { date: markedLabel }) : t("order.shield.markNote")}
        </span>
      </span>
    </label>
  );

  if (markedAt) {
    return (
      <section className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border border-green/35 bg-green/[0.06] px-4 py-2 sm:px-5" aria-label={t("order.shield.title")}>
        <span className="flex items-center gap-2 text-[13px] font-medium uppercase tracking-wider text-green">
          <ShieldCheck size={16} aria-hidden /> {t("order.shield.doneTitle")}
        </span>
        {checkbox}
      </section>
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(recipient);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked — the address is shown in full below.
    }
  };

  const [step1Before, step1After = ""] = t("order.shield.step1").split("{zodl}");
  const steps = [
    <>
      {step1Before}
      <a href="https://zodl.com/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent underline-offset-2 hover:underline" translate="no">
        Zodl <ExternalLink size={12} aria-hidden />
      </a>
      {step1After}
    </>,
    t("order.shield.step2"),
    t("order.shield.step3"),
  ];

  return (
    <section className="border border-warn/40 bg-warn/[0.05] p-4 sm:p-5" aria-labelledby={titleId}>
      <div className="flex items-start gap-3">
        <TriangleAlert size={20} className="mt-0.5 shrink-0 text-warn" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-[13px] font-medium uppercase tracking-wider text-fg">
            {t("order.shield.title")}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">{t("order.shield.body")}</p>
        </div>
      </div>

      <ol className="mt-4 grid gap-2 sm:grid-cols-3">
        {steps.map((s, i) => (
          <li key={i} className="flex min-w-0 gap-3 border border-line bg-bg-2/60 p-3 text-[13px] leading-relaxed text-muted">
            <span className="num flex size-6 shrink-0 items-center justify-center border border-line-strong text-[12px] text-fg" aria-hidden>
              {i + 1}
            </span>
            <span className="min-w-0">{s}</span>
          </li>
        ))}
      </ol>

      <div className="mt-4 flex min-w-0 items-center gap-2 border border-line bg-bg-2/70 px-3 py-2">
        <span className="min-w-0 flex-1 break-all font-mono text-[13px] text-fg">{recipient}</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        <button
          type="button"
          onClick={copy}
          className="inline-flex h-10 items-center gap-2 border border-line-strong px-3 text-[12px] font-medium uppercase tracking-wider text-fg transition-colors hover:bg-surface-3"
        >
          {copied ? <Check size={14} className="text-green" aria-hidden /> : <Copy size={14} aria-hidden />}
          {copied ? t("common.copied") : t("order.shield.copy")}
        </button>
        <span className="sr-only" aria-live="polite">
          {copied ? t("common.copied") : ""}
        </span>
        <Link href="/learn/shield-after-swap" className="inline-flex h-10 items-center gap-1.5 text-[13px] text-accent underline-offset-2 hover:underline">
          {t("order.shield.guide")} <ArrowRight size={14} aria-hidden />
        </Link>
        <div className="sm:ml-auto">{checkbox}</div>
      </div>
    </section>
  );
}
