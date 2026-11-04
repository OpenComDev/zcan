"use client";

import Link from "@/components/locale-link";
import { Check, Repeat } from "lucide-react";
import { useId, useState, useSyncExternalStore, type FormEvent } from "react";
import { requestNotifications } from "@/components/alerts/notify";
import { useLocale, useT } from "@/lib/i18n";
import { addPlan, oneMoreFromNow, priceOf, roundUsd, sameKey, symbolOf, useRecurring, type Every } from "@/lib/recurring";
import { formatAmount } from "@/lib/tokens";
import { formatNext, formatPlanUsd, planAmountLabel, usePlanPrices } from "./format";
import { EverySegmented, Segmented } from "./segmented";

const noop = () => () => {};
const useHydrated = () => useSyncExternalStore(noop, () => true, () => false);

/**
 * "Make this a recurring buy" — shown after a completed swap. `from` / `to` are asset keys
 * ("SOL.sol", "ZEC.zec"; "SOL:sol" also works); `amount` is in FROM units.
 */
export function RecurringOffer({ from, to, amount, recipient }: { from: string; to: string; amount: string; recipient?: string }) {
  const t = useT();
  const locale = useLocale();
  const hydrated = useHydrated();
  const plans = useRecurring();
  const prices = usePlanPrices();
  const ids = { title: useId(), body: useId(), form: useId() };
  const [open, setOpen] = useState(false);
  const [every, setEvery] = useState<Every>("week");
  const [mode, setMode] = useState<"amount" | "usd">("amount");
  const [created, setCreated] = useState<string | null>(null);

  const existing = plans.find((p) => sameKey(p.from, from) && sameKey(p.to, to));
  const price = priceOf(from, prices);
  const units = Number(amount);
  const usdValue = price && units > 0 ? roundUsd(price * units) : null;
  const valid = units > 0 && !sameKey(from, to);

  if (!hydrated || !valid) return null;

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Ask while we still have the click's user activation; reminders fall back to in-app toasts.
    void requestNotifications();
    const plan = addPlan({
      from,
      to,
      ...(mode === "usd" && usdValue ? { usd: usdValue } : { amount: String(amount).trim() }),
      recipient,
      every,
      ...oneMoreFromNow(every),
    });
    setCreated(plan.id);
    setOpen(false);
  };

  const manage = (
    <Link href="/history#recurring" className="text-[12px] uppercase tracking-wider text-muted underline-offset-2 hover:text-text hover:underline">
      {t("recurring.offer.manage")}
    </Link>
  );

  return (
    <section aria-labelledby={ids.title} className="min-w-0 border border-line bg-surface">
      <div className="flex items-start gap-3 p-4">
        <span className="inline-flex size-9 shrink-0 items-center justify-center border border-line text-accent" aria-hidden>
          {existing ? <Check size={16} /> : <Repeat size={16} />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={ids.title} className="label text-text">
            {existing ? t("recurring.offer.existingTitle") : t("recurring.offer.title")}
          </h2>
          <div aria-live="polite">
            {existing ? (
              <p className="mt-1 break-words text-[13px] text-muted">
                {created === existing.id ? `${t("recurring.offer.created")} ` : ""}
                {t("recurring.offer.existing", {
                  amount: planAmountLabel(existing, t, locale),
                  to: symbolOf(existing.to),
                  every: t(`recurring.every.${existing.every}`).toLocaleLowerCase(locale),
                  next: formatNext(existing.nextAt, locale),
                })}
              </p>
            ) : (
              <p id={ids.body} className="mt-1 text-[13px] text-muted">
                {t("recurring.offer.body", { amount: `${formatAmount(amount)} ${symbolOf(from)}`, to: symbolOf(to) })}
              </p>
            )}
          </div>
          {existing ? (
            <p className="mt-2">{manage}</p>
          ) : (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-controls={ids.form}
              className={`mt-3 inline-flex h-10 items-center gap-2 border px-3 text-[12px] uppercase tracking-wider text-text transition-colors hover:border-accent/70 ${open ? "border-accent/60" : "border-line"}`}
            >
              <Repeat size={14} aria-hidden /> {t("recurring.offer.cta")}
            </button>
          )}
        </div>
      </div>

      {!existing && open && (
        <form id={ids.form} onSubmit={submit} className="border-t border-line p-4" aria-describedby={ids.body}>
          <EverySegmented value={every} onChange={setEvery} />
          <Segmented
            legend={t("recurring.form.amountMode")}
            name="offer-mode"
            value={mode}
            onChange={setMode}
            options={[
              { value: "amount", label: t("recurring.mode.same", { amount: `${formatAmount(amount)} ${symbolOf(from)}` }) },
              {
                value: "usd",
                label: usdValue ? t("recurring.mode.sameUsd", { usd: formatPlanUsd(usdValue, locale) }) : t("recurring.mode.usdLoading"),
                disabled: !usdValue,
              },
            ]}
          />
          <p className="mt-3 text-[12px] text-muted">{mode === "usd" ? t("recurring.mode.usdHint", { from: symbolOf(from) }) : t("recurring.mode.amountHint")}</p>
          <p className="mt-3 border-l-2 border-accent/60 pl-3 text-[13px] text-text">{t("recurring.explain")}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="submit" className="btn-accent inline-flex h-10 items-center gap-2 px-4 text-[12px]">
              <Repeat size={14} aria-hidden /> {t("recurring.offer.create")}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-10 items-center border border-line px-4 text-[12px] uppercase tracking-wider text-muted hover:border-line-strong hover:text-text"
            >
              {t("recurring.cancel")}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
