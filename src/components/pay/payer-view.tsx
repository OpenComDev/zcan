"use client";

import Link from "@/components/locale-link";
import { useSearchParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { ArrowRight, ArrowUpRight, Coins, ShieldAlert, TriangleAlert, Wallet } from "lucide-react";
import { useState } from "react";
import { Panel } from "@/components/hud/panel";
import { useLocale, useT } from "@/lib/i18n";
import { formatUsd } from "@/lib/tokens";
import { useZecLive } from "@/lib/use-zec-live";
import { CopyButton } from "./copy-button";
import { PAY_WITH, classifyZecAddress, cleanLabel, parseZecAmount, swapLink, zip321 } from "./pay-utils";

/** Payer's side of a request link: /pay/r?to=…&amount=…&label=… */
export function PayerView() {
  const params = useSearchParams();
  const to = (params.get("to") ?? "").trim();
  const amount = parseZecAmount(params.get("amount") ?? "");
  const label = cleanLabel(params.get("label") ?? "");
  const info = classifyZecAddress(to);
  const [method, setMethod] = useState<"zec" | "swap">("zec");
  const [from, setFrom] = useState<string | undefined>(PAY_WITH[0].key);
  const { price } = useZecLive();
  const t = useT();
  const locale = useLocale();
  const kindLabel = t(`pay.kind.${info.kind}`);

  if (!to || !info.valid || !amount) {
    return (
      <Panel title={t("pay.shareTitle")} marks bodyClassName="p-6">
        <div role="alert" className="max-w-lg">
          <p className="flex items-center gap-2 text-[14px] text-text">
            <TriangleAlert size={16} className="text-warn" aria-hidden />
            {t("pay.invalidTitle")}
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            {!to ? t("pay.invalid.noAddress") : !info.valid ? t("pay.invalid.address", { kind: kindLabel.toLocaleLowerCase(locale) }) : t("pay.invalid.amount")}{" "}
            {t("pay.askNew")}
          </p>
          <Link href="/pay" className="mt-5 inline-flex h-10 items-center gap-2 border border-line px-4 text-[12px] uppercase tracking-wider text-text hover:border-line-strong hover:bg-surface-2">
            {t("pay.createOwn")} <ArrowRight size={14} aria-hidden />
          </Link>
        </div>
      </Panel>
    );
  }

  const uri = zip321(to, amount, label || undefined);
  const usd = price != null ? Number(amount) * price : null;

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Panel title={t("pay.shareTitle")} meta={<span>{t("pay.payerMeta")}</span>} marks bodyClassName="p-5 sm:p-7">
        <p className="eyebrow">{label ? t("pay.eyebrowLabel") : t("pay.shareTitle")}</p>
        <h1 className="mt-3 break-words text-[22px] font-medium uppercase leading-tight tracking-tight text-fg sm:text-[30px]">
          {label ? (
            <>
              “{label}” <span className="text-muted">{t("pay.requests")}</span>
            </>
          ) : (
            <span className="text-muted">{t("pay.someoneRequests")}</span>
          )}
        </h1>
        <p className="num mt-4 break-words text-[44px] text-fg sm:text-[56px]">
          {amount} <span className="text-[20px] text-muted">ZEC</span>
        </p>
        <p className="micro mt-2 tabular normal-case tracking-normal">{usd != null ? t("pay.usd", { usd: formatUsd(usd) }) : " "}</p>

        <div className="mt-6 flex items-start gap-2 border-l-2 border-warn bg-warn/[0.06] px-3 py-2.5 text-[12px] leading-relaxed text-muted">
          <ShieldAlert size={16} className="mt-0.5 shrink-0 text-warn" aria-hidden />
          <span>{t("pay.verifyWarn")}</span>
        </div>

        <div className="mt-6">
          <p className="label">{t("pay.payTo")}</p>
          <div className="mt-2 flex items-start gap-2 border border-line bg-bg-2 p-3">
            <span className="min-w-0 flex-1 break-all font-mono text-[13px] leading-relaxed text-fg" translate="no">
              {to}
            </span>
            <CopyButton value={to} label={t("pay.copyAddress")} />
          </div>
          <p className="micro mt-2">{kindLabel}</p>
        </div>
      </Panel>

      <Panel title={t("pay.howTitle")} bodyClassName="p-4 sm:p-5">
        <div role="group" aria-label={t("pay.methodAria")} className="grid grid-cols-2 gap-px border border-line bg-line">
          {(
            [
              ["zec", t("pay.method.zec"), Wallet],
              ["swap", t("pay.method.swap"), Coins],
            ] as const
          ).map(([k, text, Icon]) => (
            <button
              key={k}
              type="button"
              aria-pressed={method === k}
              onClick={() => setMethod(k)}
              className={`flex min-w-0 items-center gap-2 p-3 text-left text-[12px] uppercase tracking-wider transition-colors duration-150 ${
                method === k ? "bg-surface-3 text-fg shadow-[inset_0_-2px_0_var(--accent)]" : "bg-surface text-muted hover:bg-surface-2"
              }`}
            >
              <Icon size={15} className={`shrink-0 ${method === k ? "text-accent" : ""}`} aria-hidden /> <span className="min-w-0">{text}</span>
            </button>
          ))}
        </div>

        {method === "zec" ? (
          <div className="fade-up mt-5">
            <div className="mx-auto w-fit bg-white p-3">
              <QRCodeSVG value={uri} size={188} level="M" marginSize={0} title={t("pay.qrTitleUri")} />
            </div>
            <p className="mt-4 text-center text-[12px] leading-relaxed text-muted">{t("pay.scan")}</p>
            <div className="mt-4 grid gap-2">
              <a href={uri} className="btn-accent inline-flex h-11 items-center justify-center gap-2 px-4 text-[12px]">
                {t("pay.openWallet")} <ArrowUpRight size={14} aria-hidden />
              </a>
              <CopyButton value={uri} label={t("pay.copyUri")} text={t("pay.copyPayUri")} />
              <CopyButton value={amount} label={t("pay.copyAmount")} text={t("pay.copyAmountText", { amount })} />
            </div>
            <p className="micro mt-4 normal-case leading-relaxed tracking-normal">
              {t("pay.privacyTip")} {info.shielded ? t("pay.shieldedNote") : t("pay.transparentNote")}
            </p>
          </div>
        ) : (
          <div className="fade-up mt-5">
            <p className="text-[13px] leading-relaxed text-muted">
              {t("pay.swapIntro", { amount })}
            </p>
            {!info.swapOk && (
              <p role="note" className="mt-4 flex items-start gap-2 border-l-2 border-warn bg-warn/[0.06] px-3 py-2.5 text-[12px] leading-relaxed text-muted">
                <TriangleAlert size={16} className="mt-0.5 shrink-0 text-warn" aria-hidden />
                <span>{t("pay.swapWarn.sapling")}</span>
              </p>
            )}
            <fieldset className="mt-4">
              <legend className="label">{t("pay.payWith")}</legend>
              <div className="mt-2 grid grid-cols-3 gap-px border border-line bg-line">
                {[...PAY_WITH, { key: "", label: t("pay.other"), sub: t("pay.chooseLater") }].map((c) => {
                  const on = (from ?? "") === c.key;
                  return (
                    <label
                      key={c.key || "other"}
                      className={`flex min-h-12 min-w-0 cursor-pointer flex-col justify-center px-3 py-2 transition-colors duration-150 has-[:focus-visible]:outline has-[:focus-visible]:outline-1 has-[:focus-visible]:outline-accent ${
                        on ? "bg-surface-3 text-fg shadow-[inset_0_-2px_0_var(--accent)]" : "bg-surface text-muted hover:bg-surface-2"
                      }`}
                    >
                      <input type="radio" name="pay-with" value={c.key} checked={on} onChange={() => setFrom(c.key || undefined)} className="sr-only" />
                      <span className="truncate text-[12px] uppercase tracking-wider">{c.label}</span>
                      <span className="micro truncate">{c.sub}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <Link href={swapLink({ to, amount, from })} className="btn-accent mt-5 inline-flex h-11 w-full items-center justify-center gap-2 px-4 text-[12px]">
              {t("pay.continue")} <ArrowRight size={14} aria-hidden />
            </Link>
            <p className="micro mt-4 normal-case leading-relaxed tracking-normal">
              {t("pay.settledBy")}
            </p>
          </div>
        )}
      </Panel>
    </div>
  );
}
