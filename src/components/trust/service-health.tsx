"use client";

import Link from "@/components/locale-link";
import { ArrowRight } from "lucide-react";
import { useHealth } from "@/components/status/health-store";
import { useLocale, useT } from "@/lib/i18n";

type Tone = "ok" | "bad" | "wait" | "warn";
const DOT: Record<Tone, string> = { ok: "bg-green", bad: "bg-red", wait: "bg-subtle", warn: "bg-warn" };
const TEXT: Record<Tone, string> = { ok: "text-green", bad: "text-red", wait: "text-subtle", warn: "text-warn" };

type Row = { id: string; name: string; tone: Tone; label: string; up?: number; total?: number };

/**
 * Compact live health strip for /transparency. Shares the /status page's poller (health-store), so
 * nothing is fetched twice; "up in x of y checks" is what this browser has seen since the page loaded.
 */
export function ServiceHealth() {
  const t = useT();
  const locale = useLocale();
  const health = useHealth();
  const pct = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });

  const app = health.observed.app;
  const rows: Row[] = [
    {
      id: "app",
      name: t("trust.tr.health.app"),
      ...(health.data && !health.error
        ? { tone: "ok" as const, label: t("trust.tr.health.up") }
        : health.error
          ? { tone: "bad" as const, label: t("trust.tr.health.down") }
          : { tone: "wait" as const, label: t("trust.tr.health.checking") }),
      up: app?.up,
      total: app?.total,
    },
    ...(health.data?.services ?? []).map((s): Row => {
      const seen = health.observed[s.id];
      if (s.kind === "config")
        return {
          id: s.id,
          name: s.service,
          tone: s.ok ? "ok" : s.optional ? "wait" : "warn",
          label: t(s.ok ? "trust.tr.health.configured" : "trust.tr.health.notConfigured"),
        };
      return { id: s.id, name: s.service, tone: s.ok ? "ok" : "bad", label: t(s.ok ? "trust.tr.health.up" : "trust.tr.health.down"), up: seen?.up, total: seen?.total };
    }),
  ];

  return (
    <div>
      <ul className="grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-3" aria-busy={health.checking && !health.data}>
        {rows.map((r) => (
          <li key={r.id} className="min-w-0 bg-surface px-4 py-3">
            <p className="truncate text-[12px] uppercase tracking-wide text-fg" title={r.name}>
              {r.name}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
              <span className={`inline-flex items-center gap-1.5 uppercase tracking-wider ${TEXT[r.tone]}`}>
                <span className={`size-2 shrink-0 rounded-full ${DOT[r.tone]}`} aria-hidden />
                {r.label}
              </span>
              {r.total ? (
                <span className="tabular text-muted">
                  {pct.format((r.up ?? 0) / r.total)} · {t("trust.tr.health.seen", { up: r.up ?? 0, total: r.total })}
                </span>
              ) : null}
            </p>
          </li>
        ))}
      </ul>
      {health.error && !health.data && (
        <p role="status" className="px-4 pt-3 text-[12px] text-red">
          {t("trust.tr.health.unreachable")}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
        <p className="micro min-w-0 normal-case leading-relaxed tracking-normal">{t("trust.tr.health.note")}</p>
        <Link
          href="/status"
          className="group inline-flex min-h-6 shrink-0 items-center gap-1 text-[12px] uppercase tracking-wider text-text transition-colors hover:text-accent"
        >
          {t("trust.tr.health.status")}
          <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
