"use client";

import { useSyncExternalStore } from "react";

/** The URL fragment ("#memory"), "" on the server. Lets deep links open panels without effects. */
const EVENT = "zcan:hash";

function subscribe(cb: () => void) {
  window.addEventListener("hashchange", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("hashchange", cb);
    window.removeEventListener(EVENT, cb);
  };
}

export function useHash(): string {
  return useSyncExternalStore(
    subscribe,
    () => window.location.hash,
    () => "",
  );
}

/** Replaces the fragment without scrolling or adding a history entry ("" removes it). */
export function setHash(hash: string) {
  const { pathname, search } = window.location;
  history.replaceState(history.state, "", `${pathname}${search}${hash}`);
  window.dispatchEvent(new Event(EVENT));
}
