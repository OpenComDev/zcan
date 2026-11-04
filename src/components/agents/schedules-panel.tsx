"use client";

import { Play, Trash2 } from "lucide-react";
import Link from "@/components/locale-link";
import { useState } from "react";
import { AgentIcon } from "@/components/agent-icon";
import { Panel } from "@/components/hud/panel";
import { INTERVALS, isDue, removeSchedule, rerunHref, updateSchedule, useNow, useSchedules, type AgentSchedule } from "@/lib/agent-schedules";
import { agentText, getAgent } from "@/lib/agents";
import { useLocale, useT } from "@/lib/i18n";

const DAY = 86_400_000;

function relDays(locale: string, iso: string, now: number) {
  const days = Math.round((new Date(iso).getTime() - now) / DAY);
  return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(days, "day");
}

/** "Scheduled re-checks" on /agents. Everything here lives in this browser's storage. */
export function SchedulesPanel() {
  const schedules = useSchedules();
  const now = useNow();
  const ready = now > 0;
  const t = useT();

  return (
    <Panel
      id="schedules"
      title={t("agents.sched.title")}
      meta={<span className="tabular">{ready ? t("agents.sched.saved", { n: schedules.length }) : "…"}</span>}
      bodyClassName="p-0"
      className="scroll-mt-20"
    >
      {!ready ? (
        <div className="h-20 animate-pulse bg-surface-2/40" aria-busy="true" aria-label={t("agents.sched.loading")} />
      ) : schedules.length === 0 ? (
        <p className="px-4 py-5 text-[13px] leading-relaxed text-muted sm:px-5">
          {t("agents.sched.empty")}
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {schedules.map((s) => (
            <ScheduleRow key={s.id} s={s} now={now} />
          ))}
        </ul>
      )}
      <p className="micro border-t border-line px-4 py-3 normal-case tracking-normal sm:px-5">
        {t("agents.sched.note")}
      </p>
    </Panel>
  );
}

function ScheduleRow({ s, now }: { s: AgentSchedule; now: number }) {
  const [confirming, setConfirming] = useState(false);
  const t = useT();
  const locale = useLocale();
  const agent = getAgent(s.agentId);
  if (!agent) return null;
  const name = agentText(t, agent.id, "name", agent.name);
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  const due = isDue(s, now);
  const subject = Object.values(s.inputs)[0] ?? "";
  const selectId = `interval-${s.id}`;

  return (
    <li className="grid gap-3 px-4 py-4 sm:px-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <AgentIcon icon={agent.icon} size={36} />
        <div className="min-w-0">
          <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="min-w-0 text-[13px] font-medium uppercase tracking-wide text-fg">{name}</span>
            {due ? <span className="tag text-accent">{t("agents.sched.due")}</span> : null}
          </p>
          {subject && <p className="mt-0.5 truncate text-[13px] text-muted">{subject}</p>}
          <p className="mt-1 text-[12px] text-subtle">
            {t("agents.sched.next")}{" "}
            <time dateTime={s.nextRunAt} title={dateFmt.format(new Date(s.nextRunAt))} className={`tabular ${due ? "text-accent" : "text-text"}`}>
              {due ? t("agents.sched.dueNow") : relDays(locale, s.nextRunAt, now)}
            </time>
            <span aria-hidden> · </span>
            {t("agents.sched.last")}{" "}
            <time dateTime={s.lastRunAt} className="tabular text-text">
              {dateFmt.format(new Date(s.lastRunAt))}
            </time>
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link href={rerunHref(s)} className="inline-flex h-10 items-center gap-1.5 btn-accent px-4 text-[11px]">
          <Play size={13} aria-hidden /> {t("agents.sched.runNow")}
        </Link>
        <label htmlFor={selectId} className="sr-only">
          {t("agents.sched.interval", { name })}
        </label>
        <select
          id={selectId}
          name="every"
          value={s.every}
          onChange={(e) => updateSchedule(s.id, { every: Number(e.target.value) })}
          className="h-10 border border-line bg-bg-2 px-3 text-base text-fg outline-none focus-visible:border-accent/60 sm:text-[12px]"
          style={{ colorScheme: "dark" }}
        >
          {INTERVALS.filter((o) => o.days > 0).map((o) => (
            <option key={o.days} value={o.days} className="bg-bg-2 text-fg">
              {t(`agents.every.${o.days}`)}
            </option>
          ))}
        </select>
        {confirming ? (
          <span className="inline-flex items-center gap-2">
            <button
              type="button"
              onClick={() => removeSchedule(s.id)}
              className="inline-flex h-10 items-center border border-red/50 px-3 text-[11px] uppercase tracking-wider text-red hover:bg-red/10"
            >
              {t("common.delete")}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="inline-flex h-10 items-center px-2 text-[11px] uppercase tracking-wider text-muted hover:text-fg"
            >
              {t("common.cancel")}
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            aria-label={t("agents.sched.delete", { name })}
            className="flex size-10 items-center justify-center border border-line text-subtle hover:border-line-strong hover:text-fg"
          >
            <Trash2 size={14} aria-hidden />
          </button>
        )}
      </div>
    </li>
  );
}
