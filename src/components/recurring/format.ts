"use client";

import { useMemo } from "react";
import { planAmount, symbolOf, type Prices, type RecurringPlan } from "@/lib/recurring";
import { formatAmount } from "@/lib/tokens";
import { useTokens } from "@/lib/use-tokens";

type Tr = (key: string, vars?: Record<string, string | number>) => string;

/** Live USD prices keyed by asset key ("SOL.sol") and by symbol, from the token list + live feed. */
export function usePlanPrices(): Prices {
  const { tokens } = useTokens();
  return useMemo(() => {
    const out: Record<string, number> = {};
    for (const t of tokens) {
      if (!(t.price > 0)) continue;
      out[`${t.symbol}.${t.chain}`] = t.price;
      out[`${t.symbol}.${t.chain}`.toLowerCase()] = t.price;
      out[t.symbol] ??= t.price;
    }
    return out;
  }, [tokens]);
}

export function formatPlanUsd(n: number, locale: string) {
  const whole = n >= 10 && Number.isInteger(n);
  return new Intl.NumberFormat(locale, { style: "currency", currency: "USD", minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 }).format(n);
}

/** "0.5 SOL" or "$50 of SOL". */
export function planAmountLabel(p: Pick<RecurringPlan, "from" | "amount" | "usd">, t: Tr, locale: string): string {
  const from = symbolOf(p.from);
  if (p.usd) return t("recurring.usdOf", { usd: formatPlanUsd(p.usd, locale), from });
  return `${formatAmount(p.amount ?? "0")} ${from}`;
}

/** For a USD plan: "≈ 0.3412 SOL" at today's price, or null. */
export function planEstimate(p: Pick<RecurringPlan, "from" | "amount" | "usd">, prices: Prices): string | null {
  if (!p.usd) return null;
  const a = planAmount(p, prices);
  return a ? `≈ ${formatAmount(a)} ${symbolOf(p.from)}` : null;
}

export const pairLabel = (p: Pick<RecurringPlan, "from" | "to">) => `${symbolOf(p.from)} → ${symbolOf(p.to)}`;

const dateFmts = new Map<string, Intl.DateTimeFormat>();
export function formatNext(iso: string, locale: string) {
  let f = dateFmts.get(locale);
  if (!f) dateFmts.set(locale, (f = new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })));
  return f.format(new Date(iso));
}

const DAY = 86_400_000;
/** "in 3 days" / "tomorrow" / "in 5 hours", in the reader's language. */
export function formatRelative(iso: string, now: number, locale: string) {
  if (!now) return "";
  const diff = Date.parse(iso) - now;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const abs = Math.abs(diff);
  if (abs < 3_600_000) return rtf.format(Math.round(diff / 60_000), "minute");
  if (abs < DAY) return rtf.format(Math.round(diff / 3_600_000), "hour");
  return rtf.format(Math.round(diff / DAY), "day");
}

/** Weekday names in the reader's language, index 0 = Sunday. */
export function weekdayNames(locale: string, style: "long" | "short" = "long") {
  const f = new Intl.DateTimeFormat(locale, { weekday: style });
  return Array.from({ length: 7 }, (_, i) => f.format(new Date(2024, 0, 7 + i)));
}
