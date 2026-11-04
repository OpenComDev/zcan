import { memo, useId } from "react";

type Props = {
  values: number[];
  height?: number;
  className?: string;
  label?: string;
};

/**
 * Crisp area sparkline with a dashed reference line at the first value and an accent
 * end marker. `values` are plotted left to right, evenly spaced.
 *
 * Memoised on the *contents* of `values`: callers usually rebuild the array on every render
 * (live ticks, parent state), and comparing a few hundred numbers is far cheaper than
 * rebuilding the path strings and diffing the SVG.
 */
export const Sparkline = memo(SparklineView, (a: Props, b: Props) => {
  if (a.height !== b.height || a.className !== b.className || a.label !== b.label) return false;
  if (a.values === b.values) return true;
  if (a.values.length !== b.values.length) return false;
  for (let i = 0; i < a.values.length; i++) if (a.values[i] !== b.values[i]) return false;
  return true;
});

function SparklineView({
  values,
  height = 80,
  className = "",
  label,
}: Props) {
  const id = useId().replace(/:/g, "");
  const W = 400;
  if (values.length < 2) {
    return <div className={`hatch ${className}`} style={{ height }} aria-hidden />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min) * 0.12 || 1;
  const lo = min - pad;
  const hi = max + pad;
  const x = (i: number) => (i / (values.length - 1)) * W;
  const y = (v: number) => height - ((v - lo) / (hi - lo)) * height;
  const line = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join("");
  const area = `${line}L${W} ${height}L0 ${height}Z`;
  const base = y(values[0]);
  const last = values[values.length - 1];
  const up = last >= values[0];

  return (
    <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className={`block w-full ${className}`} style={{ height }} role="img" aria-label={label}>
      <defs>
        <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={up ? "var(--text)" : "var(--accent)"} stopOpacity="0.22" />
          <stop offset="1" stopColor={up ? "var(--text)" : "var(--accent)"} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id}-fill)`} />
      <line x1="0" x2={W} y1={base} y2={base} stroke="var(--text)" strokeOpacity="0.35" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
      <path d={line} fill="none" stroke="var(--text)" strokeOpacity="0.85" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <circle cx={W} cy={y(last)} r="3" fill="var(--accent)" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
