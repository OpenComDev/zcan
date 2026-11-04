"use client";

import { useMemo } from "react";
import { useLivePrices } from "./live-prices";
import { createResource } from "./resource";
import { timedFetch } from "./telemetry";
import type { Token } from "./tokens";

const EMPTY: Token[] = [];

const resource = createResource<Token[]>(async () => {
  const r = await timedFetch("/api/tokens");
  const body = await r.json();
  if (!r.ok) throw new Error(body?.message ?? "Couldn't load tokens.");
  return body as Token[];
}, 30_000);

/**
 * Supported tokens with prices. The list and fallback prices come from 1Click (every 30 s);
 * assets with a live market feed get their price overridden by the real-time stream.
 */
export function useTokens() {
  const { data, error, loading, retry } = resource.use();
  const { ticks } = useLivePrices();
  const tokens = useMemo(() => {
    if (!data) return EMPTY;
    return data.map((t) => {
      const live = ticks[t.symbol];
      return live ? { ...t, price: live.price } : t;
    });
  }, [data, ticks]);
  return { tokens, error, loading: loading && !data, retry };
}
