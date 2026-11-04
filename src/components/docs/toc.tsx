"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";

/** Labels come from `docs.toc.<id>`. */
export type TocItem = { id: string; n: string };

/** Sticky table of contents that tracks the section in view. */
export function Toc({ items }: { items: TocItem[] }) {
  const t = useT();
  const [active, setActive] = useState(items[0]?.id);

  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -60% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [items]);

  return (
    <nav aria-label={t("docs.toc.aria")} className="panel sticky top-[68px] hidden max-h-[calc(100dvh-80px)] overflow-y-auto xl:block">
      <p className="label border-b border-line px-4 py-3">{t("docs.toc.title")}</p>
      <ol className="py-2">
        {items.map((i) => {
          const on = i.id === active;
          return (
            <li key={i.id}>
              <a
                href={`#${i.id}`}
                aria-current={on ? "location" : undefined}
                className={`flex items-center gap-3 px-4 py-2 text-[12px] uppercase tracking-wider transition-colors ${on ? "bg-surface-2 text-fg" : "text-muted hover:text-fg"}`}
              >
                <span className={`tabular w-5 shrink-0 text-[10px] ${on ? "text-accent" : "text-subtle"}`}>{i.n}</span>
                <span className="min-w-0">{t(`docs.toc.${i.id}`)}</span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
