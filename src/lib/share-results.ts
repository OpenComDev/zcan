/**
 * Shareable results ("My browser is 1 in 40,000"). A share link carries only the rounded number(s) in its
 * query string — nothing about the person or their device — and opens /share/<kind> with a preview image
 * from /api/og/share. Pure, so the tools, the share page and the image route all agree on the format.
 */
import { localePath, type Locale } from "./locales";

export const ONE_IN_CAP = 8e9;

export type ShareResult =
  /** Fingerprint test: roughly one browser in `n` shares this fingerprint (`n` ≥ cap means unique). */
  | { kind: "fingerprint"; n: number }
  /** Photo cleaner: `n` metadata fields removed; `gps` when a location was among them. */
  | { kind: "photo"; n: number; gps: boolean };

export const SHARE_KINDS = ["fingerprint", "photo"] as const;

/** Two significant figures: 43,712 → 44,000. Coarse on purpose. */
export function roundOneIn(n: number): number {
  if (!Number.isFinite(n) || n < 2) return 2;
  if (n >= ONE_IN_CAP) return ONE_IN_CAP;
  const p = 10 ** Math.max(0, Math.floor(Math.log10(n)) - 1);
  return Math.round(n / p) * p;
}

function int(v: string | null | undefined, min: number, max: number): number | null {
  if (!v || !/^\d{1,13}$/.test(v)) return null;
  const n = Number(v);
  return n >= min && n <= max ? n : null;
}

/** Reads a result from a share link's query; null when it isn't valid. */
export function parseShare(kind: string, q: { get(name: string): string | null }): ShareResult | null {
  if (kind === "fingerprint") {
    const n = int(q.get("n"), 2, ONE_IN_CAP);
    return n == null ? null : { kind, n: roundOneIn(n) };
  }
  if (kind === "photo") {
    const n = int(q.get("n"), 1, 999);
    return n == null ? null : { kind, n, gps: q.get("gps") === "1" };
  }
  return null;
}

export function shareQuery(r: ShareResult): string {
  return r.kind === "fingerprint" ? `n=${roundOneIn(r.n)}` : `n=${r.n}${r.gps ? "&gps=1" : ""}`;
}

/** Absolute share link in the sharer's language. */
export function shareUrl(r: ShareResult, locale: Locale, origin: string): string {
  return `${origin}${localePath(`/share/${r.kind}`, locale)}?${shareQuery(r)}`;
}

export const isUnique = (r: ShareResult) => r.kind === "fingerprint" && r.n >= ONE_IN_CAP;
