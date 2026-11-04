"use client";

import { RotateCcw } from "lucide-react";
import { Panel, KV } from "@/components/hud/panel";
import { Sparkline } from "@/components/hud/sparkline";
import { useT } from "@/lib/i18n";
import { useClock } from "@/lib/telemetry";
import {
  HALVING_INTERVAL,
  TARGET_SPACING_S,
  POOL_META,
  ZIP317_MIN_FEE,
  blockSubsidy,
  fmtCompact,
  fmtHashrate,
  fmtInt,
  nextHalvingHeight,
  poolMeta,
  type NetworkStats,
} from "@/lib/zcash-network";
import { BlocksStrip, useFmtAgo } from "./blocks-strip";
import { useNetwork } from "./use-network";

const zec = (n: number | null | undefined, digits = 0) =>
  n == null || !Number.isFinite(n) ? "—" : `${new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(n)} ZEC`;

function Sources({ data }: { data: NetworkStats | null }) {
  const t = useT();
  const list = data?.sources ?? [
    { name: "Blockchair", href: "https://blockchair.com/zcash", ok: true },
    { name: "zcashexplorer.app", href: "https://mainnet.zcashexplorer.app", ok: true },
  ];
  return (
    <span className="flex items-center gap-1.5">
      <span>{t("network.data")}</span>
      {list.map((s, i) => (
        <span key={s.name} className="flex items-center gap-1.5">
          {i > 0 && <span aria-hidden>·</span>}
          <a href={s.href} target="_blank" rel="noreferrer" className={`hover:text-fg ${s.ok ? "" : "line-through"}`} translate="no">
            {s.name}
          </a>
          {!s.ok && <span className="sr-only">({t("network.unavailable")})</span>}
        </span>
      ))}
    </span>
  );
}

function Tile({ label, value, sub, live }: { label: string; value: string; sub?: string; live?: boolean }) {
  return (
    <div className="min-w-0 bg-surface p-4">
      <p className="micro flex items-center gap-1.5">
        {live && <span className="size-1.5 rounded-full bg-accent pulse-dot" aria-hidden />}
        {label}
      </p>
      <p className="num mt-2 truncate text-[26px] text-fg sm:text-[30px]">{value}</p>
      {sub && <p className="micro mt-2 truncate normal-case tracking-normal">{sub}</p>}
    </div>
  );
}

/** Live Zcash mainnet dashboard. Polls /api/network every 60 s; every value degrades to "—". */
export function NetworkDashboard() {
  const t = useT();
  const fmtAgo = useFmtAgo();
  const { data, error, loading, retry } = useNetwork();
  const now = useClock();

  if (error && !data) {
    return (
      <Panel title={t("network.mainnet")} meta={<Sources data={null} />} marks bodyClassName="p-6">
        <div role="alert" className="flex flex-col items-start gap-3">
          <p className="text-[14px] text-text">{t("network.errTitle")}</p>
          <p className="text-[13px] text-muted">{t("network.errBody")}</p>
          <button type="button" onClick={retry} className="flex h-10 items-center gap-2 border border-line px-4 text-[12px] uppercase tracking-wider text-text hover:border-line-strong hover:bg-surface-2">
            <RotateCcw size={14} aria-hidden /> {t("common.retry")}
          </button>
        </div>
      </Panel>
    );
  }

  const d = data;
  const last = d?.lastBlockTime ? Date.parse(d.lastBlockTime) / 1000 : null;
  const sinceLast = now != null && last != null ? now - last : null;
  const updatedAgo = now != null && d ? now - Date.parse(d.updatedAt) / 1000 : null;

  // Halving
  const h = d?.height ?? null;
  const next = h != null ? nextHalvingHeight(h) : null;
  const left = h != null && next != null ? next - h : null;
  const base = last ?? now;
  const etaSec = left != null && base != null ? base + left * TARGET_SPACING_S : null;
  const remain = etaSec != null && now != null ? Math.max(0, etaSec - now) : null;
  const eraProgress = left != null ? 1 - left / HALVING_INTERVAL : 0;

  // Pools
  const pools = d?.pools ?? null;
  const poolTotal = pools?.reduce((s, p) => s + p.zec, 0) ?? 0;
  const shielded = pools?.filter((p) => poolMeta(p.id).shielded).reduce((s, p) => s + p.zec, 0) ?? null;

  const txSeries = [...(d?.recent ?? [])].reverse().map((b) => b.txs);
  const diffSeries = [...(d?.recent ?? [])].reverse().flatMap((b) => (b.difficulty != null ? [b.difficulty] : []));

  return (
    <div className="grid gap-3" aria-busy={loading && !d}>
      <Panel
        title={t("network.mainnet")}
        meta={
          <span className="flex items-center gap-1.5" aria-live="polite">
            <span className={`size-1.5 rounded-full ${d ? "bg-green pulse-dot" : "bg-subtle"}`} aria-hidden />
            {d ? (updatedAgo != null ? t("network.updated", { t: fmtAgo(updatedAgo) }) : t("common.live")) : t("common.loading")}
          </span>
        }
        marks
        bodyClassName="p-0"
      >
        <div className="grid grid-cols-2 gap-px bg-line lg:grid-cols-4">
          <Tile label={t("network.blockHeight")} value={h != null ? fmtInt(h) : "—"} sub={t("network.targetSpacing", { n: TARGET_SPACING_S })} live={Boolean(d)} />
          <Tile label={t("network.lastBlock")} value={sinceLast != null ? t("network.ago", { t: fmtAgo(sinceLast) }) : "—"} sub={d?.lastBlockTime ? new Date(d.lastBlockTime).toLocaleTimeString() : "—"} />
          <Tile label={t("network.hashrate")} value={fmtHashrate(d?.hashrate)} sub={t("network.difficultyN", { n: fmtCompact(d?.difficulty) })} />
          <Tile
            label={t("network.mempool")}
            value={d?.mempoolTx != null ? `${fmtInt(d.mempoolTx)} tx` : "—"}
            sub={d?.mempoolBytes != null ? t("network.kbWaiting", { n: fmtInt(d.mempoolBytes / 1000) }) : "—"}
          />
        </div>
      </Panel>

      <Panel title={t("network.blocksArriving")} meta={<Sources data={d} />} bodyClassName="p-4">
        <BlocksStrip blocks={d?.recent ?? []} height={h} lastBlockTime={d?.lastBlockTime ?? null} now={now} />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="min-w-0">
            <p className="micro mb-2">{t("network.txPerBlock", { n: txSeries.length || "—" })}</p>
            <Sparkline values={txSeries} height={56} label={t("network.txPerBlockLabel")} />
          </div>
          <div className="min-w-0">
            <p className="micro mb-2">{t("network.difficultyLast", { n: diffSeries.length || "—" })}</p>
            <Sparkline values={diffSeries} height={56} label={t("network.difficultyLabel")} />
          </div>
        </div>
      </Panel>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title={t("network.chain")} meta={<span>{t("network.last24h")}</span>}>
          <KV
            rows={[
              { k: t("network.difficulty"), v: <span className="tabular">{fmtInt(d?.difficulty)}</span> },
              { k: t("network.tx24h"), v: <span className="tabular">{fmtInt(d?.tx24h)}</span> },
              {
                k: t("network.blocks24h"),
                v: <span className="tabular">{d?.blocks24h != null ? t("network.blocksTarget", { n: fmtInt(d.blocks24h), target: fmtInt(86_400 / TARGET_SPACING_S) }) : "—"}</span>,
              },
              { k: t("network.standardFee"), v: <span className="tabular normal-case">{ZIP317_MIN_FEE} ZEC · ZIP-317</span> },
              { k: t("network.blockReward"), v: <span className="tabular normal-case">{h != null ? `${blockSubsidy(h)} ZEC` : "—"}</span> },
              {
                k: d?.supplyFrom === "schedule" ? t("network.supplyEst") : t("network.supply"),
                v: <span className="tabular normal-case">{zec(d?.supply)} <span className="text-subtle">/ 21M</span></span>,
                tone: "accent",
              },
            ]}
          />
          <p className="micro mt-4 normal-case leading-relaxed tracking-normal">
            {t("network.feeNote")}
          </p>
        </Panel>

        <Panel title={t("network.nextHalving")} meta={<span>{t("network.blockN", { n: next != null ? fmtInt(next) : "—" })}</span>} marks>
          <div className="grid grid-cols-4 gap-px border border-line bg-line" role="timer" aria-label={remain != null ? t("network.halvingAria", { n: Math.floor(remain / 86_400) }) : t("network.halvingCountdown")}>
            {[
              ["days", remain != null ? Math.floor(remain / 86_400) : null],
              ["hours", remain != null ? Math.floor((remain % 86_400) / 3600) : null],
              ["min", remain != null ? Math.floor((remain % 3600) / 60) : null],
              ["sec", remain != null ? Math.floor(remain % 60) : null],
            ].map(([k, v]) => (
              <div key={k as string} className="min-w-0 bg-bg-2 p-3 text-center">
                <p className="num text-[24px] text-fg sm:text-[32px]" aria-hidden>
                  {v == null ? "—" : String(v).padStart(k === "days" ? 1 : 2, "0")}
                </p>
                <p className="micro mt-1.5 truncate" aria-hidden>
                  {t(`network.unit.${k}`)}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <div className="h-1.5 w-full overflow-hidden bg-surface-3" aria-hidden>
              <div className="h-full w-full origin-left bg-accent transition-transform duration-700 motion-reduce:transition-none" style={{ transform: `scaleX(${eraProgress})` }} />
            </div>
            <p className="micro mt-2 flex justify-between tabular normal-case tracking-normal">
              <span>{left != null ? t("network.blocksToGo", { n: fmtInt(left) }) : "—"}</span>
              <span>{left != null ? t("network.ofEra", { pct: (eraProgress * 100).toFixed(1) }) : ""}</span>
            </p>
          </div>
          <KV
            rows={[
              { k: t("network.estDate"), v: etaSec != null ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(etaSec * 1000)) : "—" },
              { k: t("network.rewardNowThen"), v: <span className="normal-case">{h != null && next != null ? `${blockSubsidy(h)} → ${blockSubsidy(next)} ZEC` : "—"}</span> },
            ]}
          />
          <p className="micro mt-4 normal-case leading-relaxed tracking-normal">
            {t("network.halvingNote")}
          </p>
        </Panel>
      </div>

      <Panel title={t("network.valuePools")} meta={<span>{t("network.fullNode")}</span>}>
        {pools ? (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
              <p className="num text-[30px] text-fg">{zec(shielded)}</p>
              <p className="micro">
                {t("network.shielded")} · {poolTotal ? t("network.ofSupply", { pct: ((100 * (shielded ?? 0)) / poolTotal).toFixed(1) }) : "—"}
              </p>
            </div>
            <div className="mt-4 flex h-3 w-full overflow-hidden border border-line" role="img" aria-label={t("network.poolShareLabel")}>
              {pools.map((p) => (
                <span key={p.id} className="h-full" style={{ width: `${(100 * p.zec) / poolTotal}%`, background: poolMeta(p.id).color }} />
              ))}
            </div>
            <table className="mt-4 w-full text-left text-[12px]">
              <thead>
                <tr className="micro border-b border-line">
                  <th scope="col" className="py-2 font-medium">{t("network.pool")}</th>
                  <th scope="col" className="py-2 text-right font-medium">ZEC</th>
                  <th scope="col" className="hidden py-2 text-right font-medium sm:table-cell">{t("network.share")}</th>
                  <th scope="col" className="hidden py-2 pl-4 font-medium md:table-cell">{t("network.note")}</th>
                </tr>
              </thead>
              <tbody>
                {[...pools]
                  .sort((a, b) => b.zec - a.zec)
                  .map((p) => {
                    const m = poolMeta(p.id);
                    const known = Object.hasOwn(POOL_META, p.id);
                    return (
                      <tr key={p.id} className="border-b border-line last:border-0">
                        <td className="py-2.5">
                          <span className="flex items-center gap-2 uppercase text-text">
                            <span className="size-2 shrink-0" style={{ background: m.color }} aria-hidden />
                            {p.id === "transparent" ? t("network.transparent") : m.label}
                            {m.shielded && <span className="tag text-green">{t("network.shielded")}</span>}
                          </span>
                        </td>
                        <td className="tabular py-2.5 text-right text-text">{fmtInt(p.zec)}</td>
                        <td className="tabular hidden py-2.5 text-right text-muted sm:table-cell">{((100 * p.zec) / poolTotal).toFixed(2)}%</td>
                        <td className="hidden py-2.5 pl-4 text-muted md:table-cell">{known ? t(`network.poolNote.${p.id}`) : t("network.poolNote.other")}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </>
        ) : (
          <div className="hatch flex h-28 items-center justify-center border border-line">
            <p className="micro">{loading && !d ? t("network.loadingPools") : t("network.poolsUnavailable")}</p>
          </div>
        )}
      </Panel>
    </div>
  );
}
