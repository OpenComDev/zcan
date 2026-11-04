"use client";

import type { ZecChart } from "@/app/api/chart/route";
import { createResource } from "./resource";
import { timedFetch } from "./telemetry";

const resource = createResource<ZecChart>(async () => {
  const r = await timedFetch("/api/chart");
  if (!r.ok) throw new Error("unavailable");
  return (await r.json()) as ZecChart;
}, 5 * 60_000);

/** Shared ZEC/USD 24 h series. `data` is null while loading; `error` when the source is down. */
export function useZecChart(): { data: ZecChart | null; error: boolean } {
  const { data, error } = resource.use();
  return { data, error: Boolean(error) };
}
