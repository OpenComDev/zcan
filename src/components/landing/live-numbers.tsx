"use client";

import Link from "@/components/locale-link";
import { ArrowRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Ticker } from "@/components/hud/ticker";
import { useNetwork } from "@/components/network/use-network";
import { useLocale, useT } from "@/lib/i18n";
import { useTokens } from "@/lib/use-tokens";
import { useZecLive } from "@/lib/use-zec-live";

function Cell({ label, value, sub, tone = "text-fg" }: { label: string; value: ReactNode; sub: ReactNode; tone?: string }) {
  return (
    <div className="min-w-0 bg-surface p-4 sm:p-5">
      <dt className="micro truncate">{label}</dt>
      <dd className={`num mt-2 truncate text-[26px] sm:text-[32px] ${tone}`}>{value}</dd>
      <dd className="tabular mt-2 truncate text-[11px] uppercase tracking-wide text-subtle">{sub}</dd>
    </div>
  );
}

/** Latest block height. Mounted only once the strip is near the viewport, so the home page doesn't poll /api/network for nothing. */
function LiveBlock({ label, locale }: { label: string; locale: string }) {
  const t = useT();
  const { data, error } = useNetwork();
  const height = data?.height ?? null;
  return (
    <Cell
      label={label}
      value={height == null ? "—" : <Ticker value={height}>{new Intl.NumberFormat(locale).format(height)}</Ticker>}
      sub={height == null && error ? t("landing.live.unavailable") : t("landing.live.blockSub")}
    />
  );
}

/** Section 05: a few live numbers from the hooks the swap page already runs (prices, tokens), plus the chain tip. */
export function LiveNumbers() {
  const t = useT();
  const locale = useLocale();
  const zec = useZecLive();
  const { tokens, error: tokensError } = useTokens();
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: "400px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const fmt = useMemo(
    () => ({
      usd: new Intl.NumberFormat(locale, { style: "currency", currency: "USD", maximumFractionDigits: 2 }),
      pct: new Intl.NumberFormat(locale, { style: "percent", signDisplay: "exceptZero", minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      int: new Intl.NumberFormat(locale),
    }),
    [locale],
  );

  const networks = useMemo(() => new Set(tokens.map((tk) => tk.chain)).size, [tokens]);
  const change = zec.change;
  const up = change != null && change >= 0;

  return (
    <div ref={ref}>
      <p className={`micro mb-3 flex items-center gap-2 ${zec.live ? "text-accent" : ""}`} aria-hidden>
        <span className={`size-1.5 rounded-full ${zec.live ? "pulse-dot bg-accent" : "bg-subtle"}`} />
        {zec.live ? t("landing.live.streaming") : t("landing.live.connecting")}
      </p>
      <dl className="grid grid-cols-2 gap-px border border-line bg-line lg:grid-cols-4">
        <Cell
          label={t("landing.live.price")}
          value={zec.price == null ? "—" : <Ticker value={zec.price}>{fmt.usd.format(zec.price)}</Ticker>}
          sub={zec.price == null && zec.error ? t("landing.live.unavailable") : zec.live ? t("landing.live.realtime") : t("landing.live.delayed")}
        />
        <Cell
          label={t("landing.live.change")}
          tone={change == null ? "text-fg" : up ? "text-green" : "text-accent"}
          value={
            change == null ? (
              "—"
            ) : (
              <>
                <span aria-hidden>{up ? "▲ " : "▼ "}</span>
                {fmt.pct.format(change / 100)}
              </>
            )
          }
          sub={t("landing.live.changeSub")}
        />
        <Cell
          label={t("landing.live.assets")}
          value={tokens.length ? fmt.int.format(tokens.length) : "—"}
          sub={tokens.length ? t("landing.live.assetsSub", { n: fmt.int.format(networks) }) : tokensError ? t("landing.live.unavailable") : t("landing.live.assetsPending")}
        />
        {near ? (
          <LiveBlock label={t("landing.live.block")} locale={locale} />
        ) : (
          <Cell label={t("landing.live.block")} value="—" sub={t("landing.live.blockSub")} />
        )}
      </dl>
      <p className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[12px] uppercase tracking-wider">
        <Link href="/markets" className="inline-flex min-h-6 items-center gap-1 text-text transition-colors hover:text-accent">
          {t("landing.live.markets")} <ArrowRight size={13} aria-hidden />
        </Link>
        <Link href="/network" className="inline-flex min-h-6 items-center gap-1 text-text transition-colors hover:text-accent">
          {t("landing.live.network")} <ArrowRight size={13} aria-hidden />
        </Link>
      </p>
    </div>
  );
}
