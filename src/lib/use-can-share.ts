"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

/** Whether the Web Share API exists. False during server render to keep hydration stable. */
export function useCanShare(): boolean {
  return useSyncExternalStore(noop, () => "share" in navigator, () => false);
}
