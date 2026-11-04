"use client";

import { useState } from "react";

/**
 * A number that flashes green when it rises and red when it falls, like a trading terminal.
 * `value` drives the direction; `children` is the formatted text.
 */
export function Ticker({ value, children, className = "" }: { value: number | null | undefined; children: React.ReactNode; className?: string }) {
  const [state, setState] = useState<{ last: number | null | undefined; dir: 0 | 1 | -1; n: number }>({ last: value, dir: 0, n: 0 });
  // Derive direction during render when the value changes (no effect needed).
  if (value !== state.last) {
    const dir = value != null && state.last != null ? (value > state.last ? 1 : value < state.last ? -1 : 0) : 0;
    setState({ last: value, dir, n: state.n + 1 });
  }
  return (
    <span key={state.n} className={`${state.dir === 1 ? "tick-up" : state.dir === -1 ? "tick-down" : ""} ${className}`}>
      {children}
    </span>
  );
}
