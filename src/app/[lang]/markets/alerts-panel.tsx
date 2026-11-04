"use client";

import { ArrowLeftRight, BellPlus, RotateCcw, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import { useId, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { Panel } from "@/components/hud/panel";
import { alertNow, alertTitle, formatAlertValue } from "@/components/alerts/format";
import { requestNotifications, useNotificationPermission, type NotifyPermission } from "@/components/alerts/notify";
import {
  addAlert,
  alertValue,
  conditionMet,
  isArmed,
  rearmAlert,
  removeAlert,
  restoreAlert,
  useAlerts,
  type Alert,
  type AlertOp,
} from "@/lib/alerts";
import { useT } from "@/lib/i18n";
import { LIVE_SYMBOLS, useLivePrices } from "@/lib/live-prices";
import { toInputString } from "@/lib/tokens";

const when = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
const noop = () => () => {};
const useHydrated = () => useSyncExternalStore(noop, () => true, () => false);
const sanitize = (v: string) => v.replace(",", ".").replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
const asInput = (n: number) => (n >= 1 ? toInputString(n) : String(Number(n.toPrecision(6))));

const PERMISSION_KEY: Record<NotifyPermission, string> = {
  granted: "markets.perm.granted",
  denied: "markets.perm.denied",
  default: "markets.perm.default",
  unsupported: "markets.perm.unsupported",
};

/** Create, list, re-arm and delete price/rate alerts. Checked live by <AlertWatcher /> in the shell. */
export function AlertsPanel() {
  const t = useT();
  const alerts = useAlerts();
  const hydrated = useHydrated();
  const { ticks } = useLivePrices();
  const permission = useNotificationPermission();
  const ids = { value: useId(), asset: useId(), from: useId(), to: useId(), repeat: useId(), err: useId() };

  const [kind, setKind] = useState<Alert["kind"]>("price");
  const [asset, setAsset] = useState("ZEC");
  const [from, setFrom] = useState("SOL");
  const [to, setTo] = useState("ZEC");
  const [op, setOp] = useState<AlertOp>("above");
  const [value, setValue] = useState("");
  const [repeat, setRepeat] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleted, setDeleted] = useState<Alert | null>(null);
  const valueRef = useRef<HTMLInputElement>(null);

  const current = kind === "price" ? alertValue({ kind, asset }, ticks) : alertValue({ kind, from, to }, ticks);
  const n = Number(value);
  const valid = value.trim() !== "" && Number.isFinite(n) && n > 0;
  const alreadyTrue = valid && current != null && conditionMet(op, current, n);

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (kind === "rate" && from === to) return fail(t("markets.err.samePair"));
    if (!valid) return fail(kind === "price" ? t("markets.err.price") : t("markets.err.rate"));
    // Ask while we still have the click's user activation.
    void requestNotifications();
    const a = addAlert(kind === "price" ? { kind, asset, op, value: n, repeat } : { kind, from, to, op, value: n, repeat });
    setValue("");
    setError(null);
    setDeleted(null);
    setNotice(t("markets.alertSet", { title: alertTitle(a, t) }));
  };

  const fail = (msg: string) => {
    setError(msg);
    setNotice(null);
    valueRef.current?.focus();
  };

  return (
    <Panel id="alerts" title={t("markets.alerts")} meta={<span>{t("markets.storedHere")}</span>} bodyClassName="grid lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
      <form onSubmit={submit} noValidate className="min-w-0 border-line p-4 sm:p-5 lg:border-r">
        <p className="text-[13px] text-muted">{t("markets.intro")}</p>
        <p className="mt-1 text-[13px] text-fg">{t("markets.openTab")}</p>

        <Segmented
          legend={t("markets.alertType")}
          name="kind"
          value={kind}
          onChange={(v) => {
            setKind(v);
            setError(null);
          }}
          options={[
            { value: "price", label: t("markets.kind.price") },
            { value: "rate", label: t("markets.kind.rate") },
          ]}
        />

        {kind === "price" ? (
          <div className="mt-4">
            <label htmlFor={ids.asset} className="label mb-2 block">
              {t("markets.asset")}
            </label>
            <AssetSelect id={ids.asset} name="asset" value={asset} onChange={setAsset} />
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2">
            <div className="min-w-0">
              <label htmlFor={ids.from} className="label mb-2 block">
                {t("markets.unitOf")}
              </label>
              <AssetSelect id={ids.from} name="from" value={from} onChange={setFrom} />
            </div>
            <button
              type="button"
              onClick={() => {
                setFrom(to);
                setTo(from);
                setValue("");
              }}
              aria-label={t("markets.flipPair")}
              className="inline-flex size-11 items-center justify-center border border-line text-muted transition-colors hover:border-line-strong hover:text-fg"
            >
              <ArrowLeftRight size={15} aria-hidden />
            </button>
            <div className="min-w-0">
              <label htmlFor={ids.to} className="label mb-2 block">
                {t("markets.pricedIn")}
              </label>
              <AssetSelect id={ids.to} name="to" value={to} onChange={setTo} />
            </div>
          </div>
        )}

        <Segmented
          legend={t("markets.condition")}
          name="op"
          value={op}
          onChange={setOp}
          options={[
            { value: "above", label: t("markets.op.above"), icon: <TrendingUp size={14} aria-hidden /> },
            { value: "below", label: t("markets.op.below"), icon: <TrendingDown size={14} aria-hidden /> },
          ]}
        />

        <div className="mt-4">
          <label htmlFor={ids.value} className="label mb-2 block">
            {kind === "price" ? t("markets.priceUsd") : t("markets.rateLabel", { to, from })}
          </label>
          <div className={`flex h-12 items-center gap-2 border bg-bg-2 pl-3 pr-1.5 ${error ? "border-red" : "border-line focus-within:border-accent/70"}`}>
            {kind === "price" && <span className="num text-[18px] text-subtle" aria-hidden>$</span>}
            <input
              id={ids.value}
              ref={valueRef}
              name="value"
              value={value}
              onChange={(e) => {
                setValue(sanitize(e.target.value));
                setError(null);
              }}
              inputMode="decimal"
              autoComplete="off"
              spellCheck={false}
              placeholder={current != null ? asInput(current) : kind === "price" ? "42.50" : "0.52"}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? ids.err : undefined}
              className="num min-w-0 flex-1 bg-transparent text-[18px] text-fg outline-none placeholder:text-subtle"
            />
            <span className="micro shrink-0">{kind === "price" ? "USD" : to}</span>
          </div>
          <p className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] uppercase text-subtle">
            <span className="tabular">
              {current == null
                ? t("markets.waitingLive")
                : alertNow(kind, current, t, from, to)}
            </span>
            {current != null && (
              <button type="button" onClick={() => setValue(asInput(current))} className="uppercase text-muted underline-offset-2 hover:text-fg hover:underline">
                {t("markets.useCurrent")}
              </button>
            )}
          </p>
          {error && (
            <p id={ids.err} role="alert" className="mt-2 text-[13px] text-red">
              {error}
            </p>
          )}
          {alreadyTrue && !error && <p className="mt-2 text-[12px] text-warn">{t(`markets.already.${op}`)}</p>}
        </div>

        <label htmlFor={ids.repeat} className="mt-4 flex cursor-pointer items-start gap-3 py-1 text-[13px] text-muted">
          <input id={ids.repeat} name="repeat" type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} className="mt-0.5 size-4 accent-[var(--accent)]" />
          <span>
            <span className="text-fg">{t("markets.repeat")}</span> — {t("markets.repeatHint")}
          </span>
        </label>

        <button type="submit" className="btn-accent mt-4 inline-flex h-11 w-full items-center justify-center gap-2 text-[12px]">
          <BellPlus size={15} aria-hidden /> {t("markets.create")}
        </button>
        <p className="mt-3 text-[11px] text-subtle">{hydrated ? t(PERMISSION_KEY[permission]) : " "}</p>
        <p className="sr-only" aria-live="polite">
          {notice}
        </p>
      </form>

      <div className="min-w-0 border-t border-line lg:border-t-0">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          <span className="label">{t("markets.yourAlerts")}</span>
          <span className="micro tabular">{hydrated ? t("markets.counts", { armed: alerts.filter(isArmed).length, total: alerts.length }) : " "}</span>
        </div>
        <div aria-live="polite">
          {deleted && (
            <p className="flex items-center justify-between gap-3 border-b border-line bg-surface-2 px-4 py-2 text-[12px] text-muted">
              <span className="min-w-0 truncate">{t("markets.deleted", { title: alertTitle(deleted, t) })}</span>
              <button
                type="button"
                onClick={() => {
                  restoreAlert(deleted);
                  setDeleted(null);
                }}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 px-2 uppercase text-fg hover:bg-surface-3"
              >
                <RotateCcw size={12} aria-hidden /> {t("markets.undo")}
              </button>
            </p>
          )}
        </div>
        {!hydrated ? (
          <div className="h-40 animate-pulse bg-surface-2/40" aria-busy="true" aria-label={t("markets.loadingAlerts")} />
        ) : alerts.length === 0 ? (
          <div className="hatch flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
            <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-fg">{t("markets.empty")}</p>
            <p className="max-w-xs text-[13px] text-subtle">{t("markets.emptyHint")}</p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {alerts.map((a) => (
              <AlertRow
                key={a.id}
                alert={a}
                current={alertValue(a, ticks)}
                onDelete={() => {
                  removeAlert(a.id);
                  setDeleted(a);
                }}
              />
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}

function AlertRow({ alert: a, current, onDelete }: { alert: Alert; current: number | null; onDelete: () => void }) {
  const t = useT();
  const armed = isArmed(a);
  const to = a.kind === "rate" ? a.to : undefined;
  const state = a.repeat ? (armed ? "armed" : "rearming") : armed ? "armed" : "fired";
  const tone = state === "armed" ? "text-accent" : state === "fired" ? "text-green" : "text-muted";
  const title = alertTitle(a, t);
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="flex min-w-0 items-center gap-2">
          {a.op === "above" ? <TrendingUp size={14} className="shrink-0 text-subtle" aria-hidden /> : <TrendingDown size={14} className="shrink-0 text-subtle" aria-hidden />}
          <span className="truncate text-[13px] uppercase text-fg">{title}</span>
        </p>
        <p className="tabular mt-1 truncate text-[11px] uppercase text-subtle">
          {current != null ? t("markets.nowValue", { value: formatAlertValue(a.kind, current, to) }) : t("markets.waitingPrice")}
          {" · "}
          {a.firedAt
            ? a.firedValue != null
              ? t("markets.firedAt", { when: when.format(new Date(a.firedAt)), value: formatAlertValue(a.kind, a.firedValue, to) })
              : t("markets.fired", { when: when.format(new Date(a.firedAt)) })
            : t("markets.setAt", { when: when.format(new Date(a.createdAt)) })}
          {a.repeat ? ` · ${t("markets.repeats")}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-1.5">
        <span className={`tag ${tone}`}>{t(`markets.state.${state}`)}</span>
        {!a.repeat && !armed && (
          <button
            type="button"
            onClick={() => rearmAlert(a.id)}
            className="inline-flex h-9 items-center gap-1.5 border border-line px-2.5 text-[11px] uppercase tracking-wider text-muted transition-colors hover:border-line-strong hover:text-fg"
          >
            <RotateCcw size={12} aria-hidden /> {t("markets.rearm")}
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          aria-label={t("markets.deleteAlert", { title })}
          className="inline-flex size-9 items-center justify-center text-muted transition-colors hover:bg-surface-3 hover:text-red"
        >
          <Trash2 size={15} aria-hidden />
        </button>
      </div>
    </li>
  );
}

function AssetSelect({ id, name, value, onChange }: { id: string; name: string; value: string; onChange: (v: string) => void }) {
  return (
    <select
      id={id}
      name={name}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-11 w-full cursor-pointer border border-line bg-bg-2 px-3 text-base text-fg outline-none focus:border-accent/70 sm:text-[13px]"
    >
      {LIVE_SYMBOLS.map((s) => (
        <option key={s} value={s} className="bg-bg-2 text-fg">
          {s}
        </option>
      ))}
    </select>
  );
}

function Segmented<T extends string>({
  legend,
  name,
  value,
  onChange,
  options,
}: {
  legend: string;
  name: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: ReactNode }[];
}) {
  return (
    <fieldset className="mt-4 min-w-0">
      <legend className="label mb-2">{legend}</legend>
      <div className="grid grid-cols-2 border border-line">
        {options.map((o, i) => (
          <label
            key={o.value}
            className={`flex h-10 min-w-0 cursor-pointer items-center justify-center gap-1.5 px-2 text-center text-[12px] uppercase leading-tight tracking-wider transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-1 has-[:focus-visible]:outline-accent ${
              i > 0 ? "border-l border-line" : ""
            } ${value === o.value ? "bg-accent/15 text-fg" : "text-muted hover:text-fg"}`}
          >
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="sr-only" />
            {o.icon}
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
