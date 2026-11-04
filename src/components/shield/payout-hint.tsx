"use client";

import { Info, ShieldCheck, TriangleAlert } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { PayoutKind } from "./zec-payout";

/** Live note under the ZEC destination field: what kind of address it is and what that means for privacy. */
export function PayoutHint({ kind }: { kind: PayoutKind | null }) {
  const t = useT();

  if (kind === null) {
    return (
      <span className="flex items-start gap-2 text-subtle">
        <ShieldCheck size={14} className="mt-0.5 shrink-0 text-green" aria-hidden />
        <span>{t("swap.payout.tip")}</span>
      </span>
    );
  }

  if (kind === "shielded") {
    return (
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Badge tone="green" icon={<ShieldCheck size={12} aria-hidden />} label={t("swap.payout.badge.shielded")} />
        <span className="text-muted">{t("swap.payout.shielded")}</span>
      </span>
    );
  }

  if (kind === "unified-mixed") {
    return (
      <span className="flex flex-wrap items-start gap-x-2 gap-y-1">
        <Badge tone="green" icon={<ShieldCheck size={12} aria-hidden />} label={t("swap.payout.badge.unified")} />
        <span className="min-w-0 flex-1 basis-56 text-muted">{t("swap.payout.mixed")}</span>
      </span>
    );
  }

  if (kind === "transparent" || kind === "tex") {
    return (
      <span className="flex flex-wrap items-start gap-x-2 gap-y-1">
        <Badge tone="warn" icon={<TriangleAlert size={12} aria-hidden />} label={t("swap.payout.badge.transparent")} />
        <span className="min-w-0 flex-1 basis-56 text-muted">{t(kind === "tex" ? "swap.payout.tex" : "swap.payout.transparent")}</span>
      </span>
    );
  }

  // unsupported / invalid / other are reported as field errors.
  return (
    <span className="flex items-start gap-2 text-subtle">
      <Info size={14} className="mt-0.5 shrink-0" aria-hidden />
      <span>{t("swap.payout.tip")}</span>
    </span>
  );
}

function Badge({ tone, icon, label }: { tone: "green" | "warn"; icon: React.ReactNode; label: string }) {
  const cls = tone === "green" ? "border-green/40 bg-green/10 text-green" : "border-warn/40 bg-warn/10 text-warn";
  return (
    <span className={`inline-flex h-6 shrink-0 items-center gap-1.5 border px-2 text-[11px] font-medium uppercase tracking-wider ${cls}`}>
      {icon}
      {label}
    </span>
  );
}
