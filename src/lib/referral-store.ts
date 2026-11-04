"use client";

import { REF_DAYS, REF_KEY, isIntentsAccount } from "./referral";

/**
 * The referral link this browser arrived through, kept only here (localStorage) for REF_DAYS days.
 * The first valid link wins, so a later link can't take over a friend's referral.
 */
type Stored = { ref: string; at: number };

function read(): Stored | null {
  try {
    const v = JSON.parse(localStorage.getItem(REF_KEY) ?? "null") as Stored | null;
    if (!v || !isIntentsAccount(v.ref) || typeof v.at !== "number") return null;
    return Date.now() - v.at < REF_DAYS * 86_400_000 ? v : null;
  } catch {
    return null;
  }
}

/** The active referrer's account, or undefined. */
export function getReferral(): string | undefined {
  return typeof window === "undefined" ? undefined : read()?.ref;
}

/** Saves ?ref=<account> from the current URL (if valid and none is active), then removes it from the address bar. */
export function captureReferral() {
  try {
    const url = new URL(location.href);
    const ref = url.searchParams.get("ref")?.trim().toLowerCase();
    if (!ref) return;
    if (isIntentsAccount(ref) && !read()) localStorage.setItem(REF_KEY, JSON.stringify({ ref, at: Date.now() } satisfies Stored));
    url.searchParams.delete("ref");
    history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // Storage blocked: the referral just doesn't apply.
  }
}
