"use client";

import { useState } from "react";

const ICON_CDN = "https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color";

const FALLBACK_COLORS = ["#3b82f6", "#8b5cf6", "#14b8a6", "#ef4444", "#f97316", "#22c55e", "#ec4899", "#64748b"];

function hue(symbol: string) {
  let h = 0;
  for (const c of symbol) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return FALLBACK_COLORS[h % FALLBACK_COLORS.length];
}

/** Coin icon from a pinned CDN package, falling back to a lettered disc. */
export function TokenIcon({ symbol, size = 32, className = "" }: { symbol: string; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  const s = symbol.toLowerCase();

  if (failed) {
    return (
      <span
        aria-hidden
        className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-fg ${className}`}
        style={{ width: size, height: size, background: hue(symbol), fontSize: size * 0.38 }}
      >
        {symbol.slice(0, 1)}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny external SVGs; next/image adds nothing here
    <img
      src={`${ICON_CDN}/${s}.svg`}
      alt=""
      aria-hidden
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={`shrink-0 rounded-full ${className}`}
    />
  );
}
