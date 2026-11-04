import type { ReactNode } from "react";

/** Button-style classes for EmptyState actions, so every empty state reads the same. */
export const emptyPrimary = "btn-accent inline-flex h-10 items-center justify-center px-4 text-[12px] sm:h-9";
export const emptySecondary =
  "inline-flex h-10 items-center justify-center border border-line px-4 text-[12px] uppercase tracking-wider text-muted transition-colors hover:border-line-strong hover:text-text sm:h-9";

/**
 * Friendly empty state: framed icon, title, one-line explanation, and up to two actions.
 *
 *   <EmptyState
 *     icon={<Bell size={22} />}
 *     title={t("markets.noAlerts")}
 *     body={t("markets.noAlertsBody")}
 *     actions={<Link href="/markets#alerts" className={emptyPrimary}>…</Link>}
 *   />
 *
 * `compact` drops the icon frame size and padding for sidebars and small panels.
 */
export function EmptyState({
  icon,
  title,
  body,
  actions,
  compact = false,
  titleAs: Title = "h3",
  className = "",
}: {
  icon?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  actions?: ReactNode;
  compact?: boolean;
  titleAs?: "h2" | "h3" | "h4" | "p";
  className?: string;
}) {
  return (
    <div className={`flex min-w-0 flex-col items-center text-center ${compact ? "gap-2 px-3 py-5" : "gap-3 px-6 py-10"} ${className}`}>
      {icon && (
        <div className={`relative grid shrink-0 place-items-center border border-line bg-surface-2 text-muted ${compact ? "size-11" : "size-16"}`} aria-hidden>
          {/* Corner ticks, like a viewfinder waiting for something to frame. */}
          <span className="absolute -left-px -top-px size-2 border-l border-t border-accent" />
          <span className="absolute -right-px -top-px size-2 border-r border-t border-line-strong" />
          <span className="absolute -bottom-px -left-px size-2 border-b border-l border-line-strong" />
          <span className="absolute -bottom-px -right-px size-2 border-b border-r border-accent" />
          {icon}
        </div>
      )}
      <div className="min-w-0 max-w-[36ch]">
        <Title className={`label break-words text-text ${compact ? "" : "mt-1"}`}>{title}</Title>
        {body && <p className={`mt-1.5 break-words leading-relaxed text-subtle ${compact ? "text-[12px]" : "text-[13px]"}`}>{body}</p>}
      </div>
      {actions && <div className={`flex flex-wrap items-center justify-center gap-2 ${compact ? "mt-1" : "mt-2"}`}>{actions}</div>}
    </div>
  );
}
