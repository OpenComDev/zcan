"use client";

import { useSyncExternalStore } from "react";

/**
 * Colour theme: "system" (default — follows prefers-color-scheme live), "light" or "dark".
 * Kept only in this browser. Applied as `data-theme="light|dark"` + `color-scheme` on <html>;
 * the inline script in src/app/layout.tsx does the same before first paint (keep the key,
 * query and colours there in sync with this file).
 */

export type ThemePref = "system" | "light" | "dark";
export type Theme = "light" | "dark";

export const THEME_KEY = "zcan:theme:v1";
const EVENT = "zcan:theme";
const QUERY = "(prefers-color-scheme: light)";

/** Browser-chrome colour per theme — matches --bg in globals.css. */
export const THEME_COLORS: Record<Theme, string> = { dark: "#050505", light: "#f6f5f2" };

const isPref = (v: unknown): v is ThemePref => v === "system" || v === "light" || v === "dark";

let snapshot: ThemePref | null = null;

function readPref(): ThemePref {
  if (snapshot) return snapshot;
  try {
    const raw = localStorage.getItem(THEME_KEY);
    snapshot = isPref(raw) ? raw : "system";
  } catch {
    snapshot = "system";
  }
  return snapshot;
}

function systemTheme(): Theme {
  try {
    return window.matchMedia(QUERY).matches ? "light" : "dark";
  } catch {
    return "dark";
  }
}

function resolve(pref: ThemePref): Theme {
  return pref === "system" ? systemTheme() : pref;
}

/** Put the resolved theme on <html> and point the browser-chrome colour at it. */
export function applyTheme(pref: ThemePref = readPref()) {
  if (typeof document === "undefined") return;
  const theme = resolve(pref);
  const root = document.documentElement;
  if (root.getAttribute("data-theme") !== theme) root.setAttribute("data-theme", theme);
  root.style.colorScheme = theme;
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
    // "system" keeps each tag's media query in charge; an override pins every tag to one colour.
    const media = m.getAttribute("media") ?? "";
    const color = pref === "system" && media ? (media.includes("light") ? THEME_COLORS.light : THEME_COLORS.dark) : THEME_COLORS[theme];
    if (m.content !== color) m.content = color;
  });
}

export function setThemePref(pref: ThemePref) {
  snapshot = pref;
  try {
    if (pref === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, pref);
  } catch {
    // Storage unavailable — the choice lasts for this page view only.
  }
  applyTheme(pref);
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  const reset = () => {
    snapshot = null;
    applyTheme();
    cb();
  };
  const onStorage = (e: StorageEvent) => (e.key === THEME_KEY || e.key === null) && reset();
  let mq: MediaQueryList | null = null;
  try {
    mq = window.matchMedia(QUERY);
  } catch {
    mq = null;
  }
  const onSystem = () => {
    if (readPref() === "system") applyTheme("system");
    cb();
  };
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", onStorage);
  // Fired by /history after a backup import or "forget everything".
  window.addEventListener("zcan:local", reset);
  mq?.addEventListener("change", onSystem);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("zcan:local", reset);
    mq?.removeEventListener("change", onSystem);
  };
}

/** The stored choice. "system" on the server and on first render. */
export function useThemePref(): ThemePref {
  return useSyncExternalStore(subscribe, readPref, () => "system");
}

/** The theme actually showing. "dark" on the server (the default palette). */
export function useResolvedTheme(): Theme {
  return useSyncExternalStore(subscribe, () => resolve(readPref()), () => "dark");
}

/** Current value of a CSS custom property on <html>, e.g. readToken("--accent") → "#c8103c". */
export function readToken(name: string, el?: Element | null): string {
  if (typeof window === "undefined") return "";
  return getComputedStyle(el ?? document.documentElement).getPropertyValue(name).trim();
}

/** "#rrggbb" / "#rgb" → "r,g,b" for building rgba() strings on a canvas. Falls back to `fallback`. */
export function hexToRgbTriplet(hex: string, fallback: string): string {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return fallback;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(",");
}
