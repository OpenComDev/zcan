import type { ReactNode } from "react";

/** Flat hairline panel with an uppercase title row, as in the instrument UI. */
export function Panel({
  title,
  meta,
  children,
  className = "",
  bodyClassName = "p-4",
  marks = false,
  id,
  as: Tag = "section",
}: {
  title?: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  marks?: boolean;
  id?: string;
  as?: "section" | "div" | "aside" | "article";
}) {
  return (
    <Tag id={id} className={`panel min-w-0 ${marks ? "marks" : ""} ${className}`}>
      {title && (
        <header className="panel-head">
          <h2 className="label truncate">{title}</h2>
          {meta && <div className="micro flex shrink-0 items-center gap-2">{meta}</div>}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </Tag>
  );
}

/** Two-column key/value list ("VESSEL   MV ORION"). */
export function KV({ rows, cols = 1 }: { rows: { k: string; v: ReactNode; tone?: "accent" | "muted" }[]; cols?: 1 | 2 }) {
  return (
    <dl className={`grid gap-x-8 gap-y-3 ${cols === 2 ? "@md:grid-cols-2" : ""}`}>
      {rows.map((r) => (
        <div key={r.k} className="grid min-w-0 grid-cols-[minmax(96px,40%)_1fr] items-baseline gap-3 text-[13px]">
          <dt className="truncate uppercase tracking-wide text-subtle">{r.k}</dt>
          <dd className={`min-w-0 truncate uppercase ${r.tone === "accent" ? "text-accent" : r.tone === "muted" ? "text-muted" : "text-text"}`}>{r.v}</dd>
        </div>
      ))}
    </dl>
  );
}
