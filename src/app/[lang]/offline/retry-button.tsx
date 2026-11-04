"use client";

import { RotateCw } from "lucide-react";
import { useT } from "@/lib/i18n";

export function RetryButton() {
  const t = useT();
  return (
    <button type="button" onClick={() => window.location.reload()} className="btn-accent inline-flex h-10 items-center gap-2 px-5 text-[12px]">
      <RotateCw size={14} aria-hidden />
      {t("common.retry")}
    </button>
  );
}
