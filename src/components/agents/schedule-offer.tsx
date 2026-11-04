"use client";

import { CalendarClock } from "lucide-react";
import { useId } from "react";
import { INTERVALS } from "@/lib/agent-schedules";
import { useLocale, useT } from "@/lib/i18n";

/** "Re-check every: off / 2 weeks / month / 3 months", shown under a finished report. */
export function ScheduleOffer({ every, nextRunAt, onChange }: { every: number; nextRunAt?: string; onChange: (days: number) => void }) {
  const name = useId();
  const t = useT();
  const dateFmt = new Intl.DateTimeFormat(useLocale(), { dateStyle: "medium" });
  const due = nextRunAt ? dateFmt.format(new Date(nextRunAt)) : "";
  const [beforeDate, afterDate = ""] = t("agents.offer.next").split("{date}");
  return (
    <fieldset className="card-glow rounded-3xl p-5 sm:p-6">
      <legend className="sr-only">{t("agents.offer.legend")}</legend>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <p className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-wider text-fg" aria-hidden>
          <CalendarClock size={15} className="text-accent" /> {t("agents.offer.every")}
        </p>
        <div role="radiogroup" aria-label={t("agents.offer.every")} className="flex flex-wrap gap-1.5">
          {INTERVALS.map((o) => {
            const on = o.days === every;
            return (
              <label
                key={o.days}
                className={`inline-flex h-10 cursor-pointer items-center border px-3.5 text-[12px] uppercase tracking-wider transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
                  on ? "border-accent/60 bg-accent/10 text-fg" : "border-line text-muted hover:border-line-strong hover:text-fg"
                }`}
              >
                <input type="radio" name={name} value={o.days} checked={on} onChange={() => onChange(o.days)} className="sr-only" />
                {t(`agents.interval.${o.days}`)}
              </label>
            );
          })}
        </div>
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-subtle" aria-live="polite">
        {every > 0 && nextRunAt ? (
          <>
            {beforeDate}
            <span className="tabular text-fg">{due}</span>
            {afterDate}{" "}
          </>
        ) : (
          `${t("agents.offer.none")} `
        )}
        {t("agents.offer.local")}
      </p>
    </fieldset>
  );
}
