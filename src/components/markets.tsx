"use client";

import Link from "@/components/locale-link";
import { ArrowRight } from "lucide-react";
import { useMemo, useState } from "react";
import { POPULAR, formatAmount, formatUsd, isZec, type Token } from "@/lib/tokens";
import { useT } from "@/lib/i18n";
import { useLivePrices } from "@/lib/live-prices";
import { useTokens } from "@/lib/use-tokens";
import { Ticker } from "./hud/ticker";
import { TokenIcon } from "./token-icon";

/** Live ZEC rates against every supported asset, filterable; each row opens a prefilled swap. */
export function Markets({ limit }: { limit?: number }) {
  const t = useT();
  const { tokens, loading, error } = useTokens();
  const { ticks } = useLivePrices();
  const [q, setQ] = useState("");
  const zec = tokens.find(isZec);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = tokens.filter((tk) => !isZec(tk) && (!needle || `${tk.symbol} ${tk.chainName}`.toLowerCase().includes(needle)));
    const ranked = needle ? list : list.filter((tk) => POPULAR.includes(`${tk.symbol}:${tk.chain}`));
    return limit ? ranked.slice(0, limit) : ranked;
  }, [tokens, q, limit]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
        <label className="flex h-9 min-w-0 flex-1 items-center gap-2 border border-line bg-bg-2 px-3 focus-within:border-accent/70">
          <span className="sr-only">{t("swap.markets.filter")}</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("swap.markets.placeholder")}
            autoComplete="off"
            spellCheck={false}
            className="w-full bg-transparent text-base uppercase text-fg outline-none placeholder:text-[12px] placeholder:text-subtle sm:text-[13px]"
          />
        </label>
        <p className="micro">
          {q
            ? t(rows.length === 1 ? "swap.markets.match" : "swap.markets.matches", { n: rows.length })
            : t("swap.markets.top", { n: rows.length, total: Math.max(0, tokens.length - 1) })}{" "}
          · ZEC {zec ? formatUsd(zec.price) : "—"}
        </p>
      </div>

      {error && rows.length === 0 ? (
        <p className="px-4 py-10 text-center text-muted">{t("swap.markets.unavailable")}</p>
      ) : (
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-[13px]">
            <caption className="sr-only">{t("swap.markets.caption")}</caption>
            <thead>
              <tr className="micro border-b border-line">
                <th scope="col" className="px-4 py-2.5 font-medium">{t("swap.markets.asset")}</th>
                <th scope="col" className="px-3 py-2.5 font-medium">{t("swap.markets.network")}</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">{t("swap.markets.price")}</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">1 ZEC =</th>
                <th scope="col" className="px-4 py-2.5">
                  <span className="sr-only">{t("swap.markets.action")}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(loading && rows.length === 0 ? Array.from({ length: 6 }, () => null) : rows).map((tk: Token | null, i) => (
                <tr key={tk?.id ?? i} className="transition-colors hover:bg-surface-2">
                  <td className="px-4 py-2.5">
                    {tk ? (
                      <span className="flex items-center gap-3">
                        <TokenIcon symbol={tk.symbol} size={24} />
                        <span className="font-medium text-fg" translate="no">
                          {tk.symbol}
                        </span>
                      </span>
                    ) : (
                      <span className="block h-6 w-24 animate-pulse bg-surface-3" />
                    )}
                  </td>
                  <td className="px-3 py-2.5 uppercase text-muted">{tk?.chainName}</td>
                  <td className="tabular px-3 py-2.5 text-right text-muted">
                    {tk && (
                      <span className="inline-flex items-center gap-2">
                        {ticks[tk.symbol] && <span className="size-1.5 rounded-full bg-accent" title={t("swap.markets.livePrice")} aria-label={t("common.live")} />}
                        <Ticker value={tk.price}>{formatUsd(tk.price)}</Ticker>
                      </span>
                    )}
                  </td>
                  <td className="tabular px-3 py-2.5 text-right text-fg">
                    {tk && zec ? <Ticker value={zec.price / tk.price}>{`${formatAmount(zec.price / tk.price)} ${tk.symbol}`}</Ticker> : ""}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {tk && (
                      <Link
                        href={`/?from=${tk.symbol}.${tk.chain}&to=ZEC.zec`}
                        className="group inline-flex h-8 items-center gap-1.5 border border-line px-2.5 text-[11px] uppercase tracking-wider text-fg transition-colors hover:border-accent hover:text-accent"
                        aria-label={t("swap.markets.swapAria", { symbol: tk.symbol, chain: tk.chainName })}
                      >
                        {t("swap.markets.swap")} <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" aria-hidden />
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
