"use client";

import { useMemo } from "react";
import { change24h, useLiveStatus, useLiveTick } from "./live-prices";
import { useZecChart } from "./use-zec-chart";

/**
 * ZEC/USD for display: the 24 h history from CoinGecko with the latest real-time tick
 * appended, plus live price and 24 h change when the stream is up.
 * Subscribes to the ZEC tick and feed status only, so ticks for other coins don't re-render callers.
 */
export function useZecLive() {
  const { data, error } = useZecChart();
  const tick = useLiveTick("ZEC");
  const status = useLiveStatus();
  const base = useMemo(() => data?.points.map((p) => p[1]) ?? [], [data]);
  return useMemo(() => {
    const series = tick && base.length ? [...base, tick.price] : base;
    return {
      price: tick?.price ?? data?.price ?? null,
      change: change24h(tick) ?? data?.change24h ?? null,
      volume: data?.volume24h ?? null,
      marketCap: data?.marketCap ?? null,
      series,
      firstAt: data?.points[0]?.[0],
      midAt: data?.points[Math.floor(((data?.points.length ?? 1) - 1) / 2)]?.[0],
      live: Boolean(tick) && status === "live",
      error: error && !data,
    };
  }, [data, base, error, tick, status]);
}
