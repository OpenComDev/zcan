"use client";

import Link from "@/components/locale-link";
import { useParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { ArrowUpRight, Check, Copy, QrCode } from "lucide-react";
import { useState } from "react";
import { Panel } from "@/components/hud/panel";
import { TokenIcon } from "@/components/token-icon";
import { PayWithWallet } from "@/components/wallet/pay-with-wallet";
import { REOWN_PROJECT_ID, exactBaseUnits } from "@/components/wallet/chains";
import { useBatches, type Batch, type BatchLeg } from "@/lib/batches";
import { useHistory } from "@/lib/history";
import { useT } from "@/lib/i18n";
import { TONE_BG, TONE_CLASS, isFinal } from "@/lib/status";
import { useStatusMeta } from "@/lib/use-status";
import { useClock } from "@/lib/telemetry";
import { formatAmount } from "@/lib/tokens";
import { useTokens } from "@/lib/use-tokens";

const fmt = (sec: number) => {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
};

export function BatchView() {
  const { id } = useParams<{ id: string }>();
  const batch = useBatches().find((b) => b.id === id);
  const history = useHistory();
  const now = useClock();
  const t = useT();
  const statusMeta = useStatusMeta();

  if (!batch) {
    return (
      <Panel title={t("send.title")} marks bodyClassName="p-8 text-center">
        <p className="label text-fg">{t("send.notFound")}</p>
        <p className="mt-2 text-[13px] text-muted">{t("send.notFoundBody")}</p>
        <div className="mt-5 flex justify-center gap-2">
          <Link href="/track" className="h-10 border border-line px-4 text-[12px] uppercase leading-10 tracking-wider text-muted hover:text-fg">
            {t("send.trackOrder")}
          </Link>
          <Link href="/send" className="btn-accent h-10 px-4 text-[12px] leading-10">
            {t("send.newSend")}
          </Link>
        </div>
      </Panel>
    );
  }

  const created = new Date(batch.createdAt).getTime() / 1000;
  const statusOf = (leg: BatchLeg) => history.find((h) => h.depositAddress === leg.depositAddress)?.status;
  const done = batch.legs.filter((l) => statusOf(l) === "SUCCESS").length;
  const settled = batch.legs.filter((l) => isFinal(statusOf(l))).length;

  return (
    <div className="grid gap-3">
      <Panel
        title={t("send.batchTitle", { id: batch.id.slice(0, 6) })}
        meta={<span>{t("send.delivered", { done, total: batch.legs.length })}</span>}
        marks
        bodyClassName="p-4 sm:p-6"
      >
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="label">{t("send.total")}</p>
            <p className="num mt-2 flex items-center gap-3 text-[34px] text-fg">
              <TokenIcon symbol={batch.fromSymbol} size={28} />
              {formatAmount(batch.legs.reduce((s, l) => s + Number(l.amountIn), 0))} {batch.fromSymbol}
              <span className="text-subtle">→</span>
              {batch.legs.length} × {batch.toSymbol}
            </p>
          </div>
          <div className="w-full max-w-xs">
            <div className="flex h-2 gap-0.5" aria-label={t("send.settledAria", { settled, total: batch.legs.length })}>
              {batch.legs.map((l) => {
                const m = statusMeta(statusOf(l));
                return <span key={l.depositAddress} className={`flex-1 ${isFinal(statusOf(l)) || m.step > 0 ? TONE_BG[m.tone] : "bg-surface-3"}`} />;
              })}
            </div>
            <p className="micro mt-2">{t("send.independent")}</p>
          </div>
        </div>
        <Timeline batch={batch} now={now} created={created} statusOf={statusOf} />
      </Panel>

      <div className="grid gap-3 xl:grid-cols-2">
        {batch.legs.map((leg, i) => (
          <LegCard key={leg.depositAddress} leg={leg} index={i} batch={batch} status={statusOf(leg)} dueIn={now === null ? null : created + leg.delayMin * 60 - now} />
        ))}
      </div>
    </div>
  );
}

function Timeline({ batch, now, created, statusOf }: { batch: Batch; now: number | null; created: number; statusOf: (l: BatchLeg) => string | undefined }) {
  const span = Math.max(30, ...batch.legs.map((l) => l.delayMin)) * 60 + 600;
  const pos = (sec: number) => `${Math.min(100, Math.max(0, (sec / span) * 100))}%`;
  const elapsed = now === null ? 0 : now - created;
  const t = useT();
  const statusMeta = useStatusMeta();
  return (
    <div className="mt-8" aria-label={t("send.schedule")}>
      <div className="relative ml-24 h-5 border-b border-line">
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <span key={f} className="micro absolute -translate-x-1/2" style={{ left: `${f * 100}%` }}>
            {t("send.minutes", { n: Math.round((span * f) / 60) })}
          </span>
        ))}
      </div>
      <ul className="relative mt-1">
        {batch.legs.map((l, i) => {
          const m = statusMeta(statusOf(l));
          return (
            <li key={l.depositAddress} className="flex h-8 items-center">
              <span className="w-24 shrink-0 truncate pr-2 text-[11px] uppercase text-muted">{t("send.leg", { n: i + 1 })}</span>
              <span className="relative h-full flex-1 border-l border-line">
                <span className="absolute top-1/2 h-px w-full bg-line" aria-hidden />
                <span
                  className={`absolute top-1/2 h-3 -translate-y-1/2 ${m.step > 0 || isFinal(statusOf(l)) ? TONE_BG[m.tone] : "bg-accent/60"}`}
                  style={{ left: pos(l.delayMin * 60), width: "18px" }}
                  title={t("send.dueAt", { n: i + 1, time: t("send.minutes", { n: l.delayMin }) })}
                />
              </span>
            </li>
          );
        })}
        {now !== null && (
          <span className="pointer-events-none absolute bottom-0 top-0 ml-24 w-px bg-fg" style={{ left: `calc(${pos(elapsed)} - 0px)` }} aria-hidden>
            <span className="micro absolute -top-5 left-1 whitespace-nowrap text-fg">{t("common.now")}</span>
          </span>
        )}
      </ul>
    </div>
  );
}

function LegCard({ leg, index, batch, status, dueIn }: { leg: BatchLeg; index: number; batch: Batch; status?: string; dueIn: number | null }) {
  const [qr, setQr] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const t = useT();
  const m = useStatusMeta()(status);
  const waiting = !status || status === "PENDING_DEPOSIT";
  const due = dueIn !== null && dueIn <= 0;
  const copy = async (v: string, what: string) => {
    try {
      await navigator.clipboard.writeText(v);
      setCopied(what);
      setTimeout(() => setCopied(null), 1400);
    } catch {}
  };
  const href = `/order/${encodeURIComponent(leg.depositAddress)}${leg.depositMemo ? `?memo=${encodeURIComponent(leg.depositMemo)}` : ""}`;

  return (
    <Panel
      title={t("send.legTitle", { n: index + 1, addr: `${leg.recipient.slice(0, 8)}…${leg.recipient.slice(-4)}` })}
      meta={<span className={`tag ${TONE_CLASS[m.tone]}`}>{m.label}</span>}
      bodyClassName="p-4"
      className={waiting && due ? "border-accent/60" : ""}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="micro">{t("send.send")}</p>
          <p className="mt-1 flex items-center gap-2">
            <span className="num text-[26px] text-fg">{leg.amountIn}</span>
            <span className="text-muted">{batch.fromSymbol}</span>
            <button type="button" onClick={() => copy(leg.amountIn, "amount")} aria-label={t("send.copyAmount")} className="inline-flex size-8 items-center justify-center text-muted hover:text-fg">
              {copied === "amount" ? <Check size={14} className="text-green" /> : <Copy size={14} />}
            </button>
          </p>
          <p className="micro mt-1">
            {t("send.recipientGets", { amount: formatAmount(leg.amountOut), symbol: batch.toSymbol })}
          </p>
        </div>
        <div className="text-right" aria-live="polite">
          <p className="micro">{waiting ? t("send.deposit") : t("send.status")}</p>
          {waiting ? (
            <p className={`tabular mt-1 text-[18px] ${due ? "text-accent" : "text-fg"}`}>{dueIn === null ? "—" : due ? t("send.sendNow") : t("send.dueIn", { time: fmt(dueIn) })}</p>
          ) : (
            <p className={`mt-1 text-[14px] uppercase ${TONE_CLASS[m.tone]}`}>{m.label}</p>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-start gap-2 border border-line bg-bg-2 p-3">
        <span className="min-w-0 flex-1 break-all text-[13px] text-fg">{leg.depositAddress}</span>
        <button type="button" onClick={() => copy(leg.depositAddress, "address")} aria-label={t("send.copyDeposit")} className="inline-flex size-8 shrink-0 items-center justify-center text-muted hover:text-fg">
          {copied === "address" ? <Check size={14} className="text-green" /> : <Copy size={14} />}
        </button>
        <button type="button" onClick={() => setQr((q) => !q)} aria-label={qr ? t("send.hideQr") : t("send.showQr")} aria-expanded={qr} className="inline-flex size-8 shrink-0 items-center justify-center text-muted hover:text-fg">
          <QrCode size={14} />
        </button>
      </div>
      {leg.depositMemo && <p className="mt-2 break-all text-[12px] text-accent">{t("send.memo", { memo: leg.depositMemo })}</p>}
      {qr && (
        <div className="fade-up mt-3 w-fit bg-white p-2">
          <QRCodeSVG value={leg.depositAddress} size={140} marginSize={0} title={t("send.qrTitle", { n: index + 1 })} />
        </div>
      )}
      {waiting && REOWN_PROJECT_ID && !leg.depositMemo && <LegWalletPay leg={leg} batch={batch} />}
      <Link href={href} className="mt-3 inline-flex items-center gap-1 text-[11px] uppercase tracking-wider text-muted hover:text-accent">
        {t("send.fullOrder")} <ArrowUpRight size={12} aria-hidden />
      </Link>
    </Panel>
  );
}

/** One-click deposit for a leg (renders nothing when wallet pay isn't available for this asset). */
function LegWalletPay({ leg, batch }: { leg: BatchLeg; batch: Batch }) {
  const { tokens } = useTokens();
  const t = useT();
  const token = tokens.find((t) => t.symbol === batch.fromSymbol && t.chain === batch.fromChain);
  // Legs store the provider's exact formatted amount; convert back to base units only if that's lossless.
  const units = token ? exactBaseUnits(leg.amountIn, token.decimals) : null;
  if (!token || !units) return null;
  return (
    <PayWithWallet
      className="mt-3"
      depositAddress={leg.depositAddress}
      memo={leg.depositMemo}
      assetId={token.id}
      asset={token}
      amount={units}
      deadline={leg.deadline}
      note={t("send.walletNote")}
    />
  );
}
