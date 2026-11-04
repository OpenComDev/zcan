import { ArrowLeft } from "lucide-react";
import Link from "@/components/locale-link";
import type { ReactNode } from "react";
import { T } from "@/lib/i18n";

/** Secondary hairline button, matching the link cleaner's "Try a tracked link". */
export const BTN_GHOST =
  "inline-flex h-10 items-center justify-center gap-1.5 border border-line px-3 text-[12px] uppercase tracking-wider text-muted transition-colors hover:border-line-strong hover:text-fg disabled:pointer-events-none disabled:opacity-50";

/** Text input / textarea base. 16px on mobile to avoid iOS zoom. */
export const FIELD =
  "w-full border bg-bg-2 px-3 py-3 text-base leading-relaxed text-fg outline-none placeholder:text-[13px] placeholder:text-subtle focus:border-accent/70 sm:text-[14px]";

/** "← Tools" back link for tool subpages. */
export function BackToTools() {
  return (
    <Link
      href="/tools"
      className="inline-flex h-8 w-fit items-center gap-1.5 text-[12px] uppercase tracking-wider text-muted transition-colors hover:text-fg"
    >
      <ArrowLeft size={14} aria-hidden /> <T k="shell.nav.tools" />
    </Link>
  );
}

/** Short visible heading block used at the top of each tool page. `title` may be a plain string or a translated node (`<T k="…" />`). */
export function ToolIntro({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <header className="grid gap-2">
      <BackToTools />
      <h1 className="display text-[26px] text-fg sm:text-[32px]">{title}</h1>
      <div className="max-w-2xl text-[13px] leading-relaxed text-muted">{children}</div>
    </header>
  );
}
