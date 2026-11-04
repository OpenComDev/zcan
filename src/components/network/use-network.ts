"use client";

import { createResource } from "@/lib/resource";
import { timedFetch } from "@/lib/telemetry";
import type { NetworkStats } from "@/lib/zcash-network";

const resource = createResource<NetworkStats>(async () => {
  const r = await timedFetch("/api/network");
  if (!r.ok) throw new Error("Network data is unavailable right now.");
  return (await r.json()) as NetworkStats;
}, 60_000);

/** Shared, self-refreshing Zcash network stats (polls every 60 s while mounted). */
export const useNetwork = resource.use;
