"use client";

import Link from "@/components/locale-link";
import { AlarmClock, Repeat, SkipForward, X } from "lucide-react";
import { useEffect, useSyncExternalStore, type MouseEvent } from "react";
import { notify } from "@/components/alerts/notify";
import { useHistory } from "@/lib/history";
import { useLocale, useT } from "@/lib/i18n";
import { localePath, stripLocale } from "@/lib/locales";
import { due, markStarted, reconcile, skipPlan, snoozePlan, swapHref, symbolOf, useNow, useRecurring, type RecurringPlan } from "@/lib/recurring";
import { pairLabel, planAmountLabel, planEstimate, usePlanPrices } from "./format";

/* Reminders closed with × stay hidden for this page session (keyed by occurrence). */
let hidden: ReadonlySet<string> = new Set();
const hiddenListeners = new Set<() => void>();
const hide = (k: string) => {
  hidden = new Set(hidden).add(k);
  hiddenListeners.forEach((l) => l());
};
const subscribeHidden = (cb: () => void) => {
  hiddenListeners.add(cb);
  return () => hiddenListeners.delete(cb);
};
const EMPTY_SET: ReadonlySet<string> = new Set();
const occurrence = (p: RecurringPlan) => `${p.id}:${p.nextAt}`;

/* System notifications already shown, so each occurrence notifies at most once per page session. */
const notified = new Set<string>();

/** Open a pre-filled swap. On the swap page itself a full load is needed so the widget re-reads the URL. */
export function openPlanSwap(e: MouseEvent<HTMLAnchorElement>, plan: RecurringPlan, href: string) {
  markStarted(plan.id);
  const here = stripLocale(window.location.pathname);
  if (here.path === "/" && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) {
    e.preventDefault();
    window.location.assign(localePath(href, here.locale));
  }
}

/**
 * Checks recurring buys on load, every minute and when the tab comes back, and shows a reminder
 * with a pre-filled swap when one is due. Never submits anything. Mount once in the app shell.
 */
export function RecurringWatcher() {
  const plans = useRecurring();
  const now = useNow();
  const swaps = useHistory();

  // Match swaps the user made to the plan occurrences they belong to.
  useEffect(() => {
    if (now && plans.length && swaps.length) reconcile(swaps, now);
  }, [plans, swaps, now]);

  const hiddenSet = useSyncExternalStore(subscribeHidden, () => hidden, () => EMPTY_SET);
  const dueNow = now ? plans.filter((p) => due(p, now)) : [];
  const visible = dueNow.filter((p) => !hiddenSet.has(occurrence(p)));

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 grid gap-2 sm:right-auto sm:w-[380px] lg:bottom-[max(1rem,env(safe-area-inset-bottom))]"
    >
      {dueNow.length > 0 && <Notifier plans={dueNow} />}
      {visible.length > 0 && <Reminders plans={visible} />}
    </div>
  );
}

/** System notification for occurrences that come due while the tab is in the background. */
function Notifier({ plans }: { plans: RecurringPlan[] }) {
  const t = useT();
  const locale = useLocale();
  useEffect(() => {
    if (document.visibilityState !== "hidden") {
      plans.forEach((p) => notified.add(occurrence(p)));
      return;
    }
    for (const p of plans) {
      const k = occurrence(p);
      if (notified.has(k)) continue;
      notified.add(k);
      notify(t(`recurring.due.${p.every}`, { to: symbolOf(p.to) }), `${planAmountLabel(p, t, locale)} → ${symbolOf(p.to)}`, `zcan-recurring-${p.id}`);
    }
  }, [plans, t, locale]);
  return null;
}

function Reminders({ plans }: { plans: RecurringPlan[] }) {
  const t = useT();
  const prices = usePlanPrices();
  const shown = plans.slice(0, 2);
  const more = plans.length - shown.length;
  return (
    <>
      {shown.map((p) => (
        <Reminder key={p.id} plan={p} href={swapHref(p, prices)} estimate={planEstimate(p, prices)} />
      ))}
      {more > 0 && (
        <Link
          href="/history#recurring"
          className="pointer-events-auto inline-flex h-9 items-center justify-center border border-line bg-surface px-3 text-[11px] uppercase tracking-wider text-muted hover:border-line-strong hover:text-text"
        >
          {t("recurring.toast.more", { n: more })}
        </Link>
      )}
    </>
  );
}

function Reminder({ plan: p, href, estimate }: { plan: RecurringPlan; href: string; estimate: string | null }) {
  const t = useT();
  const locale = useLocale();
  const title = t(`recurring.due.${p.every}`, { to: symbolOf(p.to) });
  const ghost =
    "inline-flex h-9 items-center gap-1.5 border border-line px-2.5 text-[11px] uppercase tracking-wider text-muted transition-colors hover:border-line-strong hover:text-text";
  return (
    <div className="fade-up pointer-events-auto w-full border border-accent/50 bg-surface p-3 shadow-toast">
      <div className="flex items-start gap-3">
        <Repeat size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="break-words text-[13px] uppercase text-text">{title}</p>
          <p className="num mt-1 break-words text-[12px] text-muted">
            {planAmountLabel(p, t, locale)} <span className="text-subtle">→</span> {symbolOf(p.to)}
            {estimate && <span className="text-subtle"> · {estimate}</span>}
          </p>
          <p className="mt-1 text-[11px] text-subtle">{t("recurring.toast.note")}</p>
        </div>
        <button
          type="button"
          onClick={() => hide(occurrence(p))}
          aria-label={t("recurring.toast.close", { pair: pairLabel(p) })}
          className="-m-1 inline-flex size-8 shrink-0 items-center justify-center text-muted hover:bg-surface-3 hover:text-text"
        >
          <X size={14} aria-hidden />
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 pl-7">
        <Link href={href} onClick={(e) => openPlanSwap(e, p, href)} className="btn-accent inline-flex h-9 items-center px-3 text-[11px]">
          {t("recurring.toast.review")}
        </Link>
        <button type="button" onClick={() => skipPlan(p.id)} className={ghost}>
          <SkipForward size={12} aria-hidden /> {t("recurring.toast.skip")}
        </button>
        <button type="button" onClick={() => snoozePlan(p.id)} className={ghost}>
          <AlarmClock size={12} aria-hidden /> {t("recurring.toast.snooze")}
        </button>
      </div>
    </div>
  );
}
