"use client";

import { GitCompareArrows, Minus, Plus } from "lucide-react";
import { useMemo } from "react";
import { diffReports } from "@/lib/agent-schedules";
import { useLocale, useT } from "@/lib/i18n";

const SHOW = 12;

/** "What changed since last time": a line-level summary between the previous and the new report. */
export function ReportDiff({ prev, next, since }: { prev: string; next: string; since: string }) {
  const d = useMemo(() => diffReports(prev, next), [prev, next]);
  const t = useT();
  const locale = useLocale();
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  const nf = new Intl.NumberFormat(locale);

  return (
    <section aria-labelledby="diff-title" className="card-glow rounded-3xl p-5 sm:p-6">
      <h2 id="diff-title" className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-wider text-fg">
        <GitCompareArrows size={15} className="shrink-0 text-accent" aria-hidden /> {t("agents.diff.title", { date: dateFmt.format(new Date(since)) })}
      </h2>

      {d.same ? (
        <p className="mt-3 text-[13px] text-muted">{t("agents.diff.same")}</p>
      ) : (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-px border border-line bg-line text-[12px] uppercase sm:grid-cols-4">
            {[
              { k: t("agents.diff.linesAdded"), v: d.added.length, tone: "text-green" },
              { k: t("agents.diff.linesRemoved"), v: d.removed.length, tone: "text-red" },
              { k: t("agents.diff.newLinks"), v: d.addedLinks.length, tone: "text-green" },
              { k: t("agents.diff.linksGone"), v: d.removedLinks.length, tone: "text-red" },
            ].map((r) => (
              <div key={r.k} className="min-w-0 bg-surface px-3 py-2.5">
                <dt className="truncate text-subtle">{r.k}</dt>
                <dd className={`num tabular mt-1 text-[18px] ${r.v ? r.tone : "text-muted"}`}>{nf.format(r.v)}</dd>
              </div>
            ))}
          </dl>

          {d.addedLinks.length > 0 && (
            <div className="mt-5">
              <h3 className="micro">{t("agents.diff.newSources")}</h3>
              <ul className="mt-2 grid gap-1.5">
                {d.addedLinks.slice(0, SHOW).map((u) => (
                  <li key={u} className="flex min-w-0 items-start gap-2 text-[13px]">
                    <Plus size={13} className="mt-1 shrink-0 text-green" aria-label={t("agents.diff.added")} />
                    <a href={u} target="_blank" rel="noreferrer noopener" className="min-w-0 break-all text-fg underline decoration-accent/50 underline-offset-2 hover:decoration-accent">
                      {u}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <DiffList lines={d.added} kind="add" />
          <DiffList lines={d.removed} kind="remove" />
        </>
      )}
    </section>
  );
}

function DiffList({ lines, kind }: { lines: string[]; kind: "add" | "remove" }) {
  const t = useT();
  const nf = new Intl.NumberFormat(useLocale());
  if (!lines.length) return null;
  const Icon = kind === "add" ? Plus : Minus;
  return (
    <details className="mt-4 border-t border-line pt-4">
      <summary className="cursor-pointer text-[12px] uppercase tracking-wider text-muted hover:text-fg">
        {t(kind === "add" ? "agents.diff.addedLines" : "agents.diff.removedLines")} <span className="tabular">({nf.format(lines.length)})</span>
      </summary>
      <ul className="mt-3 grid gap-1.5">
        {lines.slice(0, 40).map((l, i) => (
          <li key={i} className="flex min-w-0 items-start gap-2 text-[13px] leading-relaxed text-muted">
            <Icon size={13} className={`mt-1 shrink-0 ${kind === "add" ? "text-green" : "text-red"}`} aria-label={kind === "add" ? t("agents.diff.added") : t("agents.diff.removed")} />
            <span className="min-w-0 break-words">{l}</span>
          </li>
        ))}
        {lines.length > 40 && <li className="micro">{t("agents.diff.more", { n: nf.format(lines.length - 40) })}</li>}
      </ul>
    </details>
  );
}
