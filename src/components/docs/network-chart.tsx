"use client";

import { useMemo, useState } from "react";
import { useT } from "@/lib/i18n";
import { chainName } from "@/lib/tokens";
import { useTokens } from "@/lib/use-tokens";

/** Live count of supported assets per network (from the 1Click token list), with hover detail and a table view. */
export function NetworkChart() {
  const t = useT();
  const { tokens, loading } = useTokens();
  const [hover, setHover] = useState<string | null>(null);

  const rows = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const t of tokens) m.set(t.chain, [...(m.get(t.chain) ?? []), t.symbol]);
    const sorted = [...m.entries()].map(([chain, syms]) => ({ chain, count: syms.length, syms })).sort((a, b) => b.count - a.count);
    // Always show Zcash's own network, even though it lists few assets.
    const top = sorted.slice(0, 12);
    const zecRow = sorted.find((r) => r.chain === "zec");
    if (zecRow && !top.includes(zecRow)) top.push(zecRow);
    const rest = sorted.filter((r) => !top.includes(r));
    if (rest.length) top.push({ chain: "other", count: rest.reduce((s, r) => s + r.count, 0), syms: rest.map((r) => chainName(r.chain)) });
    return top;
  }, [tokens]);
  const max = Math.max(1, ...rows.map((r) => r.count));

  if (loading && !tokens.length) return <div className="hatch h-64 border border-line" aria-busy="true" />;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="num text-[34px] text-fg">
          {tokens.length} <span className="micro">{t("docs.net.assets")}</span>
        </p>
        <p className="micro">
          {t("docs.net.across", { n: new Set(tokens.map((tk) => tk.chain)).size })}
        </p>
      </div>
      <ul className="mt-4 space-y-1.5" onPointerLeave={() => setHover(null)}>
        {rows.map((r) => {
          const name = r.chain === "other" ? t("docs.net.other") : chainName(r.chain);
          const on = hover === r.chain;
          const zec = r.chain === "zec";
          return (
            <li key={r.chain} className="grid grid-cols-[120px_minmax(0,1fr)_36px] items-center gap-3 text-[12px] uppercase" onPointerEnter={() => setHover(r.chain)}>
              <span className={`truncate ${on ? "text-fg" : "text-muted"}`}>{name}</span>
              <span className="relative h-5">
                <span
                  className={`absolute inset-y-0 left-0 transition-[width] duration-700 ${zec ? "bg-accent" : on ? "bg-fg/60" : "bg-fg/25"}`}
                  style={{ width: `${(r.count / max) * 100}%` }}
                />
                {on && (
                  <span className="fade-up absolute left-2 top-1/2 z-10 max-w-[90%] -translate-y-1/2 truncate bg-surface-3 px-2 py-0.5 text-[11px] normal-case text-fg">
                    {r.syms.slice(0, 8).join(" · ")}
                    {r.syms.length > 8 ? ` +${r.syms.length - 8}` : ""}
                  </span>
                )}
              </span>
              <span className="tabular text-right text-fg">{r.count}</span>
            </li>
          );
        })}
      </ul>
      <details className="mt-4 border-t border-line pt-3">
        <summary className="cursor-pointer text-[11px] uppercase tracking-wider text-muted hover:text-fg">{t("docs.net.table")}</summary>
        <table className="mt-3 w-full text-left text-[12px]">
          <thead>
            <tr className="micro">
              <th scope="col" className="py-1 font-medium">{t("docs.net.network")}</th>
              <th scope="col" className="py-1 text-right font-medium">{t("docs.net.assetsCol")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.chain} className="border-t border-line">
                <td className="py-1.5 uppercase text-muted">{r.chain === "other" ? t("docs.net.other") : chainName(r.chain)}</td>
                <td className="tabular py-1.5 text-right text-fg">{r.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
