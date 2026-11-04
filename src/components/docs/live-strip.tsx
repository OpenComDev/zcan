"use client";

import { change24h, useLivePrices } from "@/lib/live-prices";
import { useT } from "@/lib/i18n";
import { formatUsd } from "@/lib/tokens";
import { Ticker } from "../hud/ticker";

const SYMBOLS = ["ZEC", "BTC", "ETH", "SOL", "XRP", "DOGE"];

/** A strip of real-time prices from the WebSocket feed, to show what "live" means. */
export function LiveStrip() {
  const t = useT();
  const { ticks, status } = useLivePrices();
  return (
    <div>
      <p className={`micro mb-3 ${status === "live" ? "text-accent" : ""}`}>{status === "live" ? `● ${t("docs.live.streaming")}` : t("docs.live.connecting")}</p>
      <ul className="grid grid-cols-2 gap-px border border-line bg-line sm:grid-cols-3 lg:grid-cols-6">
        {SYMBOLS.map((s) => {
          const tick = ticks[s];
          const c = change24h(tick);
          return (
            <li key={s} className="bg-surface p-3">
              <p className="micro">{s}/USD</p>
              <p className="num mt-1 text-[20px] text-fg">
                <Ticker value={tick?.price}>{tick ? formatUsd(tick.price) : "—"}</Ticker>
              </p>
              <p className={`tabular mt-1 text-[11px] ${c == null ? "text-subtle" : c >= 0 ? "text-green" : "text-accent"}`}>
                {c == null ? "—" : `${c >= 0 ? "+" : ""}${c.toFixed(2)}% 24h`}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
