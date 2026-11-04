"use client";

import { BellRing, X } from "lucide-react";
import Link from "@/components/locale-link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { getSchedules, isDue, rerunHref, updateSchedule, useNow, useSchedules, type AgentSchedule } from "@/lib/agent-schedules";
import { agentText, getAgent } from "@/lib/agents";
import { useLocalePath, useT } from "@/lib/i18n";

const SNOOZE_MS = 86_400_000;

type Translate = ReturnType<typeof useT>;

const dueText = (t: Translate, s: AgentSchedule) => {
  const agent = getAgent(s.agentId);
  return t("agents.due.title", { name: agent ? agentText(t, agent.id, "name", agent.name) : t("agents.agent") });
};

/**
 * Reminds the user when a scheduled agent re-check is due. Mount once in the app shell.
 * Uses a browser notification when the user has granted permission (asked only when they turned a
 * schedule on); otherwise shows a small in-app toast. Nothing ever runs without the user approving the plan.
 */
export function ScheduleWatcher() {
  const router = useRouter();
  const lp = useLocalePath();
  const schedules = useSchedules();
  const now = useNow();
  const t = useT();

  // Browser notifications: a side effect, so it lives here rather than in render.
  useEffect(() => {
    if (!now || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    for (const s of getSchedules()) {
      if (!isDue(s, now) || s.notifiedFor === s.nextRunAt) continue;
      try {
        const n = new Notification(dueText(t, s), {
          body: t("agents.due.body"),
          tag: `zcan-recheck-${s.id}`,
        });
        n.onclick = () => {
          window.focus();
          router.push(lp(rerunHref(s)));
          n.close();
        };
        updateSchedule(s.id, { notifiedFor: s.nextRunAt });
      } catch {
        // Some browsers (e.g. Android Chrome) only allow notifications from a service worker — fall back to the toast.
      }
    }
  }, [now, schedules, router, t, lp]);

  const due = schedules.filter(
    (s) => isDue(s, now) && s.notifiedFor !== s.nextRunAt && !(s.snoozedUntil && new Date(s.snoozedUntil).getTime() > now),
  );
  const first = due[0];
  const snooze = (s: AgentSchedule) => updateSchedule(s.id, { snoozedUntil: new Date(Date.now() + SNOOZE_MS).toISOString() });

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 flex justify-end sm:inset-x-auto sm:right-4 lg:bottom-4"
    >
      {first && (
        <div role="status" className="fade-up pointer-events-auto w-full max-w-sm border border-line-strong bg-surface p-4 shadow-toast">
          <div className="flex items-start gap-3">
            <BellRing size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-fg">{dueText(t, first)}</p>
              <p className="mt-1 text-[12px] text-muted">
                {t("agents.due.note")}
                {due.length > 1 && (
                  <>
                    {" "}
                    <Link href="/agents#schedules" className="underline decoration-accent/60 underline-offset-2 hover:text-fg">
                      {t("agents.due.more", { n: due.length - 1 })}
                    </Link>
                  </>
                )}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={rerunHref(first)}
                  onClick={() => snooze(first)}
                  className="inline-flex h-9 items-center btn-accent px-4 text-[11px]"
                >
                  {t("agents.due.start")}
                </Link>
                <button
                  type="button"
                  onClick={() => snooze(first)}
                  className="inline-flex h-9 items-center border border-line px-3 text-[11px] uppercase tracking-wider text-muted hover:border-line-strong hover:text-fg"
                >
                  {t("agents.due.tomorrow")}
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => snooze(first)}
              aria-label={t("agents.due.dismiss")}
              className="-m-1.5 flex size-8 shrink-0 items-center justify-center text-subtle hover:text-fg"
            >
              <X size={15} aria-hidden />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
