"use client";

import { Panel } from "@/components/hud/panel";
import { Sparkline } from "@/components/hud/sparkline";
import { formatUsd } from "@/lib/tokens";
import { Ticker } from "@/components/hud/ticker";
import { useT } from "@/lib/i18n";
import { useZecLive } from "@/lib/use-zec-live";

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 });
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });

function Stat({ value, unit, label, accent, tick }: { value: string; unit?: string; label: string; accent?: boolean; tick?: number | null }) {
  return (
    <div className="min-w-0">
      <p className="flex items-start gap-1">
        <span className={`num whitespace-nowrap text-[24px] sm:text-[34px] lg:text-[40px] ${accent ? "text-accent" : "text-fg"}`}>
          <Ticker value={tick}>{value}</Ticker>
        </span>
        {unit && <span className="micro mt-1">{unit}</span>}
      </p>
      <p className="mt-2 w-fit border-t border-line-strong pt-1.5 text-[11px] uppercase tracking-wider text-muted">{label}</p>
    </div>
  );
}

export function MarketChartPanel() {
  const t = useT();
  const zec = useZecLive();
  const change = zec.change ?? 0;

  return (
    <Panel
      title="ZEC / USD"
      meta={
        zec.live ? (
          <span className="text-accent">
            ● {t("common.live")}
            <span className="hidden sm:inline"> · {t("markets.chartSources")}</span>
          </span>
        ) : (
          <span>CoinGecko · 24h</span>
        )
      }
      marks
      bodyClassName="p-4 sm:p-6"
    >
      <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
        <Stat value={zec.price != null ? formatUsd(zec.price).replace("$", "") : "—"} unit="USD" label={t("markets.price")} tick={zec.price} />
        <Stat value={zec.change != null ? `${change >= 0 ? "+" : ""}${change.toFixed(2)}` : "—"} unit="%" label={t("markets.change24h")} accent={change < 0} tick={zec.change} />
        <Stat value={zec.volume != null ? compact.format(zec.volume) : "—"} unit="USD" label={t("markets.volume24h")} />
        <Stat value={zec.marketCap != null ? compact.format(zec.marketCap) : "—"} unit="USD" label={t("markets.marketCap")} />
      </div>
      <div className="mt-8">
        {zec.error ? (
          <p className="micro hatch py-16 text-center">{t("markets.historyUnavailable")}</p>
        ) : (
          <Sparkline values={zec.series} height={220} label={t("shell.sparkLabel")} />
        )}
      </div>
      <div className="micro mt-2 flex justify-between">
        <span>{zec.firstAt ? timeFmt.format(zec.firstAt) : t("shell.ago24h")}</span>
        <span>{zec.midAt ? timeFmt.format(zec.midAt) : "12h"}</span>
        <span>{t("common.now")}</span>
      </div>
    </Panel>
  );
}
