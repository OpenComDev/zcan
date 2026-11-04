import type { Alert } from "@/lib/alerts";
import type { Vars } from "@/lib/i18n";
import { formatAmount, formatUsd } from "@/lib/tokens";

/** A translate function, as returned by `useT()`. */
export type Translate = (key: string, vars?: Vars) => string;

/** "$41.20" for prices (more digits under $1), "0.5234 ZEC" for rates. */
export function formatAlertValue(kind: Alert["kind"], value: number, to?: string): string {
  if (kind === "rate") return `${formatAmount(value)} ${to ?? ""}`.trim();
  return value >= 1 ? formatUsd(value) : `$${formatAmount(value, 4)}`;
}

/** "ZEC above $40.00" / "1 SOL above 0.52 ZEC", in the reader's language. */
export function alertTitle(a: Alert, t: Translate): string {
  return a.kind === "price"
    ? t(`markets.title.price.${a.op}`, { asset: a.asset, value: formatAlertValue("price", a.value) })
    : t(`markets.title.rate.${a.op}`, { from: a.from, value: formatAlertValue("rate", a.value, a.to) });
}

/** "Now $41.20" / "Now 1 SOL = 0.52 ZEC". */
export function alertNow(kind: Alert["kind"], value: number, t: Translate, from?: string, to?: string): string {
  return kind === "price"
    ? t("markets.nowValue", { value: formatAlertValue("price", value) })
    : t("markets.nowRate", { from: from ?? "", value: formatAlertValue("rate", value, to) });
}
