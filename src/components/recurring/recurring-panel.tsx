"use client";

import Link from "@/components/locale-link";
import { CalendarClock, Pause, Play, Repeat, Trash2 } from "lucide-react";
import { useId, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { Panel } from "@/components/hud/panel";
import { requestNotifications, useNotificationPermission } from "@/components/alerts/notify";
import { TokenIcon } from "@/components/token-icon";
import { useHistory } from "@/lib/history";
import { useLocale, useT } from "@/lib/i18n";
import {
  EVERY,
  addPlan,
  chainOf,
  due,
  normalizeKey,
  planAmount,
  priceOf,
  removePlan,
  sameKey,
  setEvery,
  setPaused,
  swapHref,
  symbolOf,
  useNow,
  useRecurring,
  type Every,
  type RecurringPlan,
} from "@/lib/recurring";
import { POPULAR, addressHint, chainName, formatAmount } from "@/lib/tokens";
import { formatNext, formatPlanUsd, formatRelative, pairLabel, planAmountLabel, planEstimate, usePlanPrices, weekdayNames } from "./format";
import { openPlanSwap } from "./recurring-watcher";
import { EverySegmented, Segmented } from "./segmented";

const noop = () => () => {};
const useHydrated = () => useSyncExternalStore(noop, () => true, () => false);
const sanitize = (v: string) => v.replace(",", ".").replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");

const ZEC = "ZEC.zec";
/** Stable callback ref: focuses the element once, when it mounts. */
const focusOnMount = (el: HTMLElement | null) => el?.focus();
/** Popular assets as "SYMBOL.chain" keys. */
const ASSETS = POPULAR.map((k) => k.replace(":", "."));
const assetLabel = (k: string) => `${symbolOf(k)} · ${chainName(chainOf(k))}`;

const selectCls =
  "h-11 w-full cursor-pointer border border-line bg-bg-2 px-3 text-base text-text outline-none focus-visible:border-accent/70 sm:text-[13px]";
const ghostBtn =
  "inline-flex h-9 items-center gap-1.5 border border-line px-2.5 text-[11px] uppercase tracking-wider text-muted transition-colors hover:border-line-strong hover:text-text";

/** Recurring buys: create, list, pause, change frequency, delete. Reminders are shown by <RecurringWatcher />. */
export function RecurringPanel() {
  const t = useT();
  const hydrated = useHydrated();
  const plans = useRecurring();
  const now = useNow();
  const prices = usePlanPrices();
  const [notice, setNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const dueCount = now ? plans.filter((p) => due(p, now)).length : 0;

  return (
    <Panel
      id="recurring"
      className="scroll-mt-20"
      title={t("recurring.title")}
      meta={<span className="tabular">{hydrated ? t("recurring.meta", { n: plans.length, due: dueCount }) : " "}</span>}
      bodyClassName="grid lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]"
    >
      <NewPlanForm onCreated={(msg) => setNotice(msg)} />

      <div className="min-w-0 border-t border-line lg:border-t-0">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          <h3 ref={headingRef} tabIndex={-1} className="label outline-none">
            {t("recurring.yourPlans")}
          </h3>
        </div>
        <p className="sr-only" aria-live="polite">
          {notice}
        </p>
        {!hydrated ? (
          <div className="h-40 animate-pulse bg-surface-2/40" aria-busy="true" aria-label={t("recurring.loading")} />
        ) : plans.length === 0 ? (
          <div className="hatch flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
            <span className="mb-1 inline-flex size-11 items-center justify-center border border-line bg-surface text-accent" aria-hidden>
              <CalendarClock size={18} />
            </span>
            <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-text">{t("recurring.empty")}</p>
            <p className="max-w-xs text-[13px] text-subtle">{t("recurring.emptyHint")}</p>
          </div>
        ) : (
          <ul className="divide-y divide-line" aria-label={t("recurring.listAria")}>
            {plans.map((p) => (
              <PlanRow
                key={p.id}
                plan={p}
                now={now}
                href={swapHref(p, prices)}
                estimate={planEstimate(p, prices)}
                confirming={confirming === p.id}
                onConfirm={(v) => setConfirming(v ? p.id : null)}
                onDeleted={(msg) => {
                  setConfirming(null);
                  setNotice(msg);
                  headingRef.current?.focus();
                }}
              />
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}

/* ---------------- new plan ---------------- */

function NewPlanForm({ onCreated }: { onCreated: (msg: string) => void }) {
  const t = useT();
  const locale = useLocale();
  const prices = usePlanPrices();
  const permission = useNotificationPermission();
  const hydrated = useHydrated();
  const now = useNow();
  const ids = { from: useId(), to: useId(), amount: useId(), err: useId(), day: useId(), recipient: useId(), recipientHint: useId() };

  const [from, setFrom] = useState("USDC.eth");
  const [toPick, setToPick] = useState("BTC.btc");
  const [mode, setMode] = useState<"usd" | "amount">("usd");
  const [value, setValue] = useState("");
  const [every, setEveryState] = useState<Every>("week");
  const [weekday, setWeekday] = useState<number | null>(null);
  const [monthDay, setMonthDay] = useState<number | null>(null);
  const [recipient, setRecipient] = useState("");
  const [error, setError] = useState<string | null>(null);
  const valueRef = useRef<HTMLInputElement>(null);

  const fromZec = sameKey(from, ZEC);
  const to = fromZec ? toPick : ZEC;
  const n = Number(value);
  const valid = value.trim() !== "" && Number.isFinite(n) && n > 0;
  const fromSym = symbolOf(from);
  const price = priceOf(from, prices);
  // Defaults follow today, picked lazily so render stays pure on the server.
  const today = now ? new Date(now) : null;
  const wd = weekday ?? today?.getDay() ?? 1;
  const md = monthDay ?? today?.getDate() ?? 1;
  const weekdays = weekdayNames(locale);

  const hint = !valid
    ? null
    : mode === "usd"
      ? (() => {
          const a = planAmount({ from, usd: n }, prices);
          return a ? t("recurring.form.approxUnits", { amount: `${formatAmount(a)} ${fromSym}` }) : null;
        })()
      : price
        ? t("recurring.form.approxUsd", { usd: formatPlanUsd(price * n, locale) })
        : null;

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!valid) {
      setError(mode === "usd" ? t("recurring.err.usd") : t("recurring.err.amount", { symbol: fromSym }));
      valueRef.current?.focus();
      return;
    }
    // Ask while we still have the click's user activation; reminders fall back to in-app toasts.
    void requestNotifications();
    const plan = addPlan({
      from: normalizeKey(from),
      to: normalizeKey(to),
      ...(mode === "usd" ? { usd: n } : { amount: value.trim() }),
      recipient: recipient.trim() || undefined,
      every,
      weekday: every === "week" || every === "2weeks" ? wd : undefined,
      monthDay: every === "month" ? md : undefined,
    });
    setValue("");
    setRecipient("");
    setError(null);
    onCreated(t("recurring.created", { next: formatNext(plan.nextAt, locale) }));
  };

  return (
    <form onSubmit={submit} noValidate className="min-w-0 border-line p-4 sm:p-5 lg:border-r">
      <h3 className="label text-text">{t("recurring.new")}</h3>
      <p className="mt-2 text-[13px] text-muted">{t("recurring.explain")}</p>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="min-w-0">
          <label htmlFor={ids.from} className="label mb-2 block">
            {t("recurring.form.from")}
          </label>
          <select
            id={ids.from}
            name="from"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setError(null);
            }}
            className={selectCls}
          >
            {[...ASSETS, ZEC].map((k) => (
              <option key={k} value={k} className="bg-bg-2 text-text">
                {assetLabel(k)}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0">
          <label htmlFor={ids.to} className="label mb-2 block">
            {t("recurring.form.to")}
          </label>
          <select id={ids.to} name="to" value={to} onChange={(e) => setToPick(e.target.value)} disabled={!fromZec} className={`${selectCls} disabled:cursor-default disabled:opacity-100`}>
            {(fromZec ? ASSETS : [ZEC]).map((k) => (
              <option key={k} value={k} className="bg-bg-2 text-text">
                {assetLabel(k)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Segmented
        legend={t("recurring.form.amountMode")}
        name="mode"
        value={mode}
        onChange={(v) => {
          setMode(v);
          setError(null);
        }}
        options={[
          { value: "usd", label: t("recurring.mode.usd") },
          { value: "amount", label: t("recurring.mode.units", { symbol: fromSym }) },
        ]}
      />

      <div className="mt-4">
        <label htmlFor={ids.amount} className="label mb-2 block">
          {mode === "usd" ? t("recurring.form.amountUsd") : t("recurring.form.amountUnits", { symbol: fromSym })}
        </label>
        <div className={`flex h-12 items-center gap-2 border bg-bg-2 pl-3 pr-3 ${error ? "border-red" : "border-line focus-within:border-accent/70"}`}>
          {mode === "usd" && (
            <span className="num text-[18px] text-subtle" aria-hidden>
              $
            </span>
          )}
          <input
            id={ids.amount}
            ref={valueRef}
            name="amount"
            value={value}
            onChange={(e) => {
              setValue(sanitize(e.target.value));
              setError(null);
            }}
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            placeholder={mode === "usd" ? "50" : "0.25"}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? ids.err : undefined}
            className="num min-w-0 flex-1 bg-transparent text-[18px] text-text outline-none placeholder:text-subtle"
          />
          <span className="micro shrink-0" translate="no">
            {mode === "usd" ? "USD" : fromSym}
          </span>
        </div>
        <p className="tabular mt-1.5 min-h-4 text-[11px] uppercase text-subtle">{hint ?? (mode === "usd" ? t("recurring.mode.usdHint", { from: fromSym }) : "")}</p>
        {error && (
          <p id={ids.err} role="alert" className="mt-1 text-[13px] text-red">
            {error}
          </p>
        )}
      </div>

      <EverySegmented value={every} onChange={setEveryState} name="new-every" />

      {every !== "day" && (
        <div className="mt-4">
          <label htmlFor={ids.day} className="label mb-2 block">
            {every === "month" ? t("recurring.form.monthDay") : t("recurring.form.weekday")}
          </label>
          {every === "month" ? (
            <select id={ids.day} name="monthDay" value={md} onChange={(e) => setMonthDay(Number(e.target.value))} className={selectCls}>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d} className="bg-bg-2 text-text">
                  {new Intl.NumberFormat(locale).format(d)}
                </option>
              ))}
            </select>
          ) : (
            <select id={ids.day} name="weekday" value={wd} onChange={(e) => setWeekday(Number(e.target.value))} className={selectCls}>
              {weekdays.map((name, i) => (
                <option key={i} value={i} className="bg-bg-2 text-text">
                  {name}
                </option>
              ))}
            </select>
          )}
          {every === "month" && md > 28 && <p className="mt-1.5 text-[11px] text-subtle">{t("recurring.form.monthEnd")}</p>}
        </div>
      )}

      <div className="mt-4">
        <label htmlFor={ids.recipient} className="label mb-2 block">
          {t("recurring.form.recipient", { symbol: symbolOf(to) })}
        </label>
        <input
          id={ids.recipient}
          name="recipient"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          placeholder={addressHint(chainOf(to))}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-describedby={ids.recipientHint}
          translate="no"
          className="h-11 w-full border border-line bg-bg-2 px-3 font-mono text-base text-text outline-none placeholder:text-subtle focus:border-accent/70 sm:text-[13px]"
        />
        <p id={ids.recipientHint} className="mt-1.5 text-[11px] text-subtle">
          {t("recurring.form.recipientHint")}
        </p>
      </div>

      <button type="submit" className="btn-accent mt-5 inline-flex h-11 w-full items-center justify-center gap-2 text-[12px]">
        <Repeat size={15} aria-hidden /> {t("recurring.form.create")}
      </button>
      <p className="mt-3 text-[11px] text-subtle">{hydrated ? t(`recurring.perm.${permission}`) : " "}</p>
    </form>
  );
}

/* ---------------- one plan ---------------- */

function PlanRow({
  plan: p,
  now,
  href,
  estimate,
  confirming,
  onConfirm,
  onDeleted,
}: {
  plan: RecurringPlan;
  now: number;
  href: string;
  estimate: string | null;
  confirming: boolean;
  onConfirm: (v: boolean) => void;
  onDeleted: (msg: string) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const swaps = useHistory();
  const ids = { every: useId(), confirm: useId() };
  const isDue = now > 0 && due(p, now);
  const state = p.paused ? "paused" : isDue ? "due" : "scheduled";
  const tone = state === "due" ? "text-accent" : state === "paused" ? "text-muted" : "text-green";
  const pair = pairLabel(p);
  const amount = planAmountLabel(p, t, locale);
  const last = p.history[0];
  const lastOrder = last?.orderId ? swaps.find((s) => s.depositAddress === last.orderId) : undefined;
  const orderHref = last?.orderId
    ? `/order/${encodeURIComponent(last.orderId)}${lastOrder?.depositMemo ? `?memo=${encodeURIComponent(lastOrder.depositMemo)}` : ""}`
    : null;
  const shortAddr = (a: string) => (a.length > 18 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a);
  const day =
    p.every === "month"
      ? t("recurring.onDay", { day: new Intl.NumberFormat(locale).format(p.monthDay ?? new Date(p.nextAt).getDate()) })
      : p.every === "day"
        ? ""
        : t("recurring.onWeekday", { day: weekdayNames(locale)[p.weekday ?? new Date(p.nextAt).getDay()] });

  return (
    <li className={`grid gap-3 border-l-2 px-4 py-3 ${state === "due" ? "border-accent" : "border-transparent"}`}>
      <div className="flex min-w-0 items-start gap-3">
        <TokenIcon symbol={symbolOf(p.from)} size={24} className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="num min-w-0 break-words text-[14px] text-text">
              {amount} <span className="text-subtle">→</span> {symbolOf(p.to)}
            </span>
            <span className={`tag ${tone}`}>{t(`recurring.state.${state}`)}</span>
          </p>
          <p className="tabular mt-1 break-words text-[11px] uppercase text-subtle">
            {t(`recurring.every.${p.every}`)}
            {day ? ` · ${day}` : ""}
            {estimate ? ` · ${estimate}` : ""}
          </p>
          <p className="tabular mt-0.5 break-words text-[11px] uppercase text-subtle">
            {p.paused
              ? t("recurring.pausedNote")
              : isDue
                ? t("recurring.dueSince", { when: formatNext(p.nextAt, locale) })
                : t("recurring.next", { when: formatNext(p.nextAt, locale), rel: formatRelative(p.nextAt, now, locale) })}
          </p>
          {p.recipient && (
            <p className="mt-0.5 truncate text-[11px] uppercase text-subtle" translate="no">
              {t("recurring.to", { address: shortAddr(p.recipient) })}
            </p>
          )}
          {last && (
            <p className="mt-0.5 break-words text-[11px] uppercase text-subtle">
              {last.skipped
                ? t("recurring.last.skipped", { when: formatNext(last.dueAt, locale) })
                : orderHref
                  ? (
                    <>
                      {t("recurring.last.ordered", { when: formatNext(last.doneAt ?? last.dueAt, locale) })}{" "}
                      <Link href={orderHref} className="text-muted underline underline-offset-2 hover:text-text">
                        {t("recurring.last.viewOrder")}
                      </Link>
                    </>
                  )
                  : t("recurring.last.opened", { when: formatNext(last.doneAt ?? last.dueAt, locale) })}
            </p>
          )}
        </div>
      </div>

      {confirming ? (
        <div role="group" aria-labelledby={ids.confirm} className="flex flex-wrap items-center gap-2 border border-red/40 bg-surface-2 p-2 sm:ml-9">
          <p id={ids.confirm} className="min-w-0 flex-1 basis-48 text-[12px] text-text">
            {t("recurring.confirmDelete", { pair })}
          </p>
          <button
            type="button"
            onClick={() => {
              removePlan(p.id);
              onDeleted(t("recurring.deleted", { pair }));
            }}
            className="inline-flex h-9 items-center gap-1.5 border border-red/60 px-3 text-[11px] uppercase tracking-wider text-red transition-colors hover:bg-red/10"
          >
            <Trash2 size={12} aria-hidden /> {t("recurring.delete")}
          </button>
          <button type="button" ref={focusOnMount} onClick={() => onConfirm(false)} className={ghostBtn}>
            {t("recurring.keep")}
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 sm:ml-9">
          <Link
            href={href}
            onClick={(e) => openPlanSwap(e, p, href)}
            className={isDue ? "btn-accent inline-flex h-9 items-center px-3 text-[11px]" : ghostBtn}
          >
            {isDue ? t("recurring.toast.review") : t("recurring.buyNow")}
          </Link>
          <button
            type="button"
            onClick={() => setPaused(p.id, !p.paused)}
            aria-label={p.paused ? t("recurring.resumeAria", { pair }) : t("recurring.pauseAria", { pair })}
            className={ghostBtn}
          >
            {p.paused ? <Play size={12} aria-hidden /> : <Pause size={12} aria-hidden />} {p.paused ? t("recurring.resume") : t("recurring.pause")}
          </button>
          <label htmlFor={ids.every} className="sr-only">
            {t("recurring.everyAria", { pair })}
          </label>
          <select
            id={ids.every}
            value={p.every}
            onChange={(e) => setEvery(p.id, e.target.value as Every)}
            className="h-9 min-w-0 cursor-pointer border border-line bg-bg-2 px-2 text-base uppercase text-muted outline-none hover:border-line-strong focus-visible:border-accent/70 sm:text-[11px]"
          >
            {EVERY.map((e) => (
              <option key={e} value={e} className="bg-bg-2 text-text">
                {t(`recurring.every.${e}`)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => onConfirm(true)}
            aria-label={t("recurring.deleteAria", { pair })}
            className="ml-auto inline-flex size-9 items-center justify-center text-muted transition-colors hover:bg-surface-3 hover:text-red"
          >
            <Trash2 size={15} aria-hidden />
          </button>
        </div>
      )}
    </li>
  );
}
