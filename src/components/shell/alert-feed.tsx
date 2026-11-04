"use client";

import Link from "@/components/locale-link";
import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { useHistory, type HistoryEntry } from "@/lib/history";
import { TONE_CLASS, isFinal } from "@/lib/status";
import { useStatusMeta } from "@/lib/use-status";
import { useT } from "@/lib/i18n";
import { formatAmount } from "@/lib/tokens";
import { EmptyState, emptyPrimary, emptySecondary } from "../onboarding/empty-state";

const time = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
const day = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

export const orderHref = (e: HistoryEntry) =>
  `/order/${encodeURIComponent(e.depositAddress)}${e.depositMemo ? `?memo=${encodeURIComponent(e.depositMemo)}` : ""}`;

/** Rows in the "ALERT FEED" style: time · event · subject · tag. */
export function FeedList({ entries, onNavigate, limit }: { entries: HistoryEntry[]; onNavigate?: () => void; limit?: number }) {
  const list = limit ? entries.slice(0, limit) : entries;
  const statusMeta = useStatusMeta();
  return (
    <ul className="divide-y divide-line">
      {list.map((e) => {
        const m = statusMeta(e.status);
        const d = new Date(e.createdAt);
        const today = new Date().toDateString() === d.toDateString();
        const hot = !isFinal(e.status);
        return (
          <li key={e.depositAddress}>
            <Link
              href={orderHref(e)}
              onClick={onNavigate}
              className={`grid grid-cols-[44px_1fr_auto] items-center gap-3 border-l-2 py-3 pl-3 pr-3 transition-colors hover:bg-surface-2 ${
                hot && m.tone === "wait" ? "border-accent bg-accent/[0.06]" : "border-line-strong"
              }`}
            >
              <span className="tabular text-[11px] text-subtle">{today ? time.format(d) : day.format(d)}</span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] uppercase text-text">
                  {m.label} · {formatAmount(e.amountIn)} {e.fromSymbol}
                </span>
                <span className="block truncate text-[11px] uppercase text-subtle">
                  → {formatAmount(e.amountOut)} {e.toSymbol}
                </span>
              </span>
              <span className={`tag ${TONE_CLASS[m.tone]}`}>{m.short}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Three empty feed rows waiting for their first order; the crimson blip is the live dot. */
function FeedGlyph() {
  return (
    <svg viewBox="0 0 40 40" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden>
      <rect x="4.5" y="7.5" width="31" height="7" strokeDasharray="2 2" />
      <rect x="4.5" y="17.5" width="31" height="7" strokeDasharray="2 2" opacity="0.55" />
      <rect x="4.5" y="27.5" width="31" height="7" strokeDasharray="2 2" opacity="0.3" />
      <circle cx="9" cy="11" r="1.6" fill="var(--accent)" stroke="none" className="pulse-dot" />
      <path d="M14 11h9" opacity="0.7" />
    </svg>
  );
}

/** Slide-over listing every swap made in this browser, with live statuses. */
export function AlertFeed({ open, onClose }: { open: boolean; onClose: () => void }) {
  const entries = useHistory();
  const ref = useRef<HTMLDialogElement>(null);
  const active = entries.filter((e) => !isFinal(e.status)).length;
  const t = useT();

  useEffect(() => {
    const d = ref.current!;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby="feed-title"
      className="m-0 ml-auto h-dvh max-h-dvh w-full max-w-[420px] overscroll-contain border-l border-line-strong bg-surface p-0 text-text backdrop:bg-scrim"
    >
      <div className="flex h-full flex-col">
        <div className="panel-head">
          <h2 id="feed-title" className="label">
            {t("shell.feedHeading")}
          </h2>
          <div className="flex items-center gap-3">
            <span className="micro">
              {t("shell.feedCounts", { active, total: entries.length })}
            </span>
            <button type="button" onClick={onClose} aria-label={t("shell.closeFeed")} className="inline-flex size-9 items-center justify-center text-muted hover:text-fg">
              <X size={16} />
            </button>
          </div>
        </div>
        {entries.length === 0 ? (
          <div className="flex flex-1 flex-col overflow-y-auto overscroll-contain">
            <EmptyState
              className="my-auto"
              icon={<FeedGlyph />}
              title={t("shell.feedEmpty")}
              body={t("shell.feedEmptyBody")}
              actions={
                <>
                  <Link href="/" onClick={onClose} className={emptyPrimary}>
                    {t("shell.startSwap")}
                  </Link>
                  <Link href="/track" onClick={onClose} className={emptySecondary}>
                    {t("shell.feedTrack")}
                  </Link>
                </>
              }
            />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto overscroll-contain">
            <FeedList entries={entries} onNavigate={onClose} />
          </div>
        )}
        <p className="micro border-t border-line px-4 py-3">{t("shell.feedFoot")}</p>
      </div>
    </dialog>
  );
}
