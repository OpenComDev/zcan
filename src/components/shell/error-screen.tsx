"use client";

import { RotateCcw } from "lucide-react";
import Link from "@/components/locale-link";
import { useEffect, useState } from "react";
import { reportError } from "@/lib/error-report";
import { useT } from "@/lib/i18n";

/**
 * Shown when a page crashes. Browser errors are reported (if crash reports are on); errors from the
 * server carry a `digest` and were already recorded there, so they aren't sent twice.
 */
export function ErrorScreen({ error, retry, standalone = false }: { error: Error & { digest?: string }; retry: () => void; standalone?: boolean }) {
  const t = useT();
  const [reported, setReported] = useState<boolean | null>(null);

  useEffect(() => {
    // Reporting is a side effect of showing this screen; the result only picks which note to show.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReported(error.digest ? true : reportError(error, "boundary"));
  }, [error]);

  // Inside the app shell the page already sits in <main>; the global error screen has no shell.
  const Wrap = standalone ? "main" : "div";
  return (
    <Wrap id={standalone ? "main" : undefined} className="mx-auto flex w-full max-w-xl flex-col items-start gap-4 px-4 py-16 sm:py-24">
      <p className="eyebrow">500</p>
      <h1 className="text-2xl font-semibold text-balance text-fg">{t("misc.error.title")}</h1>
      <p className="text-[14px] text-muted">{t("misc.error.body")}</p>
      {reported !== null && (
        <p className="text-[13px] text-subtle" aria-live="polite">
          {reported ? t("misc.error.reported") : t("misc.error.notReported")}
        </p>
      )}
      {error.digest && (
        <p className="micro tabular" translate="no">
          {t("misc.error.ref", { id: error.digest })}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={() => retry()} className="btn-accent inline-flex h-10 items-center gap-2 px-4 text-[12px]">
          <RotateCcw size={14} aria-hidden /> {t("misc.error.retry")}
        </button>
        <Link href="/" className="inline-flex h-10 items-center border border-line px-4 text-[12px] uppercase tracking-wider text-muted transition-colors hover:border-line-strong hover:text-fg">
          {t("misc.error.home")}
        </Link>
      </div>
    </Wrap>
  );
}
