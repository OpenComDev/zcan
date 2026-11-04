"use client";

import { Check, Circle, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useT } from "@/lib/i18n";
import { markRead, markUnread, resetLearnProgress, restoreLearnProgress, useLearnProgress, type LearnProgress } from "@/lib/learn-progress";

/**
 * Renders a translated string with a tiny, safe subset of inline markup:
 * `**bold**`, `` `code` `` and `[label](https://…)`. Everything else is plain text (no HTML parsing).
 */
export function renderRich(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) out.push(text.slice(last, i));
    if (m[1] != null) out.push(<strong key={i}>{m[1]}</strong>);
    else if (m[2] != null) out.push(<code key={i}>{m[2]}</code>);
    else
      out.push(
        <a key={i} href={m[4]} target="_blank" rel="noreferrer" className="text-accent underline-offset-2 hover:underline">
          {m[3]}
        </a>,
      );
    last = i + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** `<Rich k="learn.memos.p1" />` — translated paragraph text with inline bold/code/links. */
export function Rich({ k }: { k: string }) {
  return <>{renderRich(useT()(k))}</>;
}

/** Suspense fallback for an explainer page (needs a translated aria-label). */
export function ExplainerFallback() {
  const t = useT();
  return <div className="panel h-[640px] animate-pulse" aria-busy="true" aria-label={t("learn.loading")} />;
}

/** Previous/next navigation wrapper with a translated landmark label. */
export function ExplainerNav({ children }: { children: ReactNode }) {
  const t = useT();
  return (
    <nav aria-label={t("learn.more")} className="grid grid-cols-2 gap-px border border-line bg-line">
      {children}
    </nav>
  );
}

/** "3 of 6 read" with a bar, and a reset that offers Undo. */
export function LearnProgressBar({ slugs }: { slugs: string[] }) {
  const t = useT();
  const progress = useLearnProgress();
  const [undo, setUndo] = useState<LearnProgress | null>(null);
  const done = slugs.filter((s) => progress[s]).length;
  const pct = slugs.length ? done / slugs.length : 0;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="micro tabular" aria-live="polite">
          {done === slugs.length && done > 0 ? t("learn.progress.all") : t("learn.progress.count", { done, total: slugs.length })}
        </p>
        {undo ? (
          <button
            type="button"
            onClick={() => {
              restoreLearnProgress(undo);
              setUndo(null);
            }}
            className="micro flex h-6 items-center gap-1.5 text-accent hover:text-fg"
          >
            {t("learn.progress.cleared")}
          </button>
        ) : (
          done > 0 && (
            <button type="button" onClick={() => setUndo(resetLearnProgress())} className="micro flex h-6 items-center gap-1.5 hover:text-fg">
              <RotateCcw size={11} aria-hidden /> {t("learn.progress.reset")}
            </button>
          )
        )}
      </div>
      <div className="mt-2 grid gap-px" style={{ gridTemplateColumns: `repeat(${slugs.length}, minmax(0, 1fr))` }} aria-hidden>
        {slugs.map((s) => (
          <span key={s} className={`h-1.5 transition-colors duration-300 ${progress[s] ? "bg-accent" : "bg-surface-3"}`} />
        ))}
      </div>
      <span className="sr-only">{t("learn.progress.pct", { pct: Math.round(pct * 100) })}</span>
    </div>
  );
}

/** Read/unread tag for a card. Renders "Unread" on the server, then the stored state. */
export function ReadBadge({ slug }: { slug: string }) {
  const t = useT();
  const read = Boolean(useLearnProgress()[slug]);
  return read ? (
    <span className="tag shrink-0 text-green">
      <Check size={10} className="mr-1" aria-hidden /> {t("learn.badge.read")}
    </span>
  ) : (
    <span className="tag shrink-0 text-subtle">{t("learn.badge.unread")}</span>
  );
}

/** Explicit toggle on the article page. */
export function ReadToggle({ slug }: { slug: string }) {
  const t = useT();
  const read = Boolean(useLearnProgress()[slug]);
  return (
    <button
      type="button"
      aria-pressed={read}
      onClick={() => (read ? markUnread(slug) : markRead(slug))}
      className={`flex min-h-10 w-full items-center justify-center gap-2 border px-3 py-2 text-center text-[12px] uppercase tracking-wider transition-colors duration-150 ${
        read ? "border-green/40 text-green hover:border-green" : "border-line text-text hover:border-line-strong hover:bg-surface-2"
      }`}
    >
      {read ? <Check size={14} className="shrink-0" aria-hidden /> : <Circle size={14} className="shrink-0" aria-hidden />}
      {read ? t("learn.toggle.unmark") : t("learn.toggle.mark")}
    </button>
  );
}

/** Invisible marker: once the reader scrolls it into view, the article counts as read. */
export function ReadOnView({ slug }: { slug: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          markRead(slug);
          io.disconnect();
        }
      },
      { threshold: 1 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [slug]);
  return <span ref={ref} aria-hidden className="block h-px" />;
}
