"use client";

import Link from "@/components/locale-link";
import { QRCodeSVG } from "qrcode.react";
import { ArrowUpRight, Info, QrCode, Share2, TriangleAlert } from "lucide-react";
import { useId, useRef, useState, useSyncExternalStore } from "react";
import { Panel } from "@/components/hud/panel";
import { useT } from "@/lib/i18n";
import { useCanShare } from "@/lib/use-can-share";
import { track } from "@/lib/analytics";
import { CopyButton } from "./copy-button";
import { classifyZecAddress, cleanLabel, parseZecAmount, requestLink, rich, zip321, type ZecAddressInfo } from "./pay-utils";

const noop = () => () => {};
const useOrigin = () => useSyncExternalStore(noop, () => window.location.origin, () => "");

/** i18n key of the address problem, if any. */
function addressError(raw: string, info: ZecAddressInfo): string | null {
  if (!raw.trim()) return "pay.err.addressEmpty";
  if (info.kind === "testnet") return "pay.err.testnet";
  if (info.kind === "sprout") return "pay.err.sprout";
  if (!info.valid) return "pay.err.invalid";
  return null;
}

type Field = "address" | "amount";

/** Create a shareable payment request: a Zcan link (any coin) plus a ZIP-321 zcash: URI (ZEC holders). */
export function RequestForm() {
  const t = useT();
  const [address, setAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [label, setLabel] = useState("");
  const [touched, setTouched] = useState<Record<Field, boolean>>({ address: false, amount: false });
  const [qrOf, setQrOf] = useState<"link" | "uri">("link");
  const ids = { address: useId(), amount: useId(), label: useId() };
  const addressRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const origin = useOrigin();
  const canShare = useCanShare();

  const to = address.trim();
  const info = classifyZecAddress(to);
  const amt = parseZecAmount(amount);
  const note = cleanLabel(label);
  const addrErr = addressError(address, info);
  const errors: Record<Field, string | null> = {
    address: addrErr && t(addrErr),
    amount: amt ? null : amount.trim() ? t("pay.err.amountFormat") : t("pay.err.amountEmpty"),
  };
  const ready = !errors.address && !errors.amount && amt != null && origin !== "";
  const link = ready ? requestLink(origin, { to, amount: amt, label: note || undefined }) : "";
  const uri = ready ? zip321(to, amt, note || undefined) : "";
  const preview = ready ? link.slice(origin.length) : "";
  const show = (f: Field) => (touched[f] ? errors[f] : null);

  const learnLink = (chunk: string) => (
    <Link href="/learn/shield-after-swap" className="text-accent underline-offset-2 hover:underline">
      {chunk}
    </Link>
  );

  const inputCls = (bad: boolean, size = "text-base sm:text-[14px]") =>
    `mt-2 h-12 w-full min-w-0 border bg-bg-2 px-3 text-fg outline-none placeholder:text-[13px] placeholder:text-subtle focus:border-accent/70 ${size} ${
      bad ? "border-red" : "border-line"
    }`;

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Panel title={t("pay.newTitle")} meta={<span>{t("pay.newMeta")}</span>} marks bodyClassName="p-4 sm:p-5">
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            setTouched({ address: true, amount: true });
            if (errors.address) addressRef.current?.focus();
            else if (errors.amount) amountRef.current?.focus();
          }}
          className="grid gap-5"
        >
          <div>
            <label htmlFor={ids.address} className="label">
              {t("pay.yourAddress")}
            </label>
            <input
              ref={addressRef}
              id={ids.address}
              name="zec-address"
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onBlur={() => setTouched((tc) => ({ ...tc, address: true }))}
              placeholder="t1… or u1…"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              aria-invalid={show("address") ? true : undefined}
              aria-describedby={`${ids.address}-hint`}
              className={`${inputCls(Boolean(show("address")))} font-mono`}
            />
            <p id={`${ids.address}-hint`} className={`mt-2 text-[12px] leading-relaxed ${show("address") ? "text-red" : "text-subtle"}`} role={show("address") ? "alert" : undefined}>
              {show("address") ?? (info.valid ? t("pay.valid", { label: t(`pay.kind.${info.kind}`) }) : t("pay.addressHint"))}
            </p>
          </div>

          <div>
            <label htmlFor={ids.amount} className="label">
              {t("pay.amount")}
            </label>
            <input
              ref={amountRef}
              id={ids.amount}
              name="amount"
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onBlur={() => setTouched((tc) => ({ ...tc, amount: true }))}
              placeholder="0.25…"
              autoComplete="off"
              aria-invalid={show("amount") ? true : undefined}
              aria-describedby={show("amount") ? `${ids.amount}-err` : undefined}
              className={`${inputCls(Boolean(show("amount")), "text-[20px]")} num`}
            />
            {show("amount") && (
              <p id={`${ids.amount}-err`} role="alert" className="mt-2 text-[12px] text-red">
                {show("amount")}
              </p>
            )}
          </div>

          <div>
            <label htmlFor={ids.label} className="label">
              {t("pay.note")} <span className="normal-case tracking-normal text-subtle">{t("pay.optional")}</span>
            </label>
            <input
              id={ids.label}
              name="label"
              type="text"
              value={label}
              maxLength={80}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t("pay.notePh")}
              autoComplete="off"
              aria-describedby={`${ids.label}-hint`}
              className={inputCls(false)}
            />
            <p id={`${ids.label}-hint`} className="mt-2 text-[12px] leading-relaxed text-subtle">
              {t("pay.noteHint")} {label.length > 60 && <span className="tabular">{t("pay.left", { n: 80 - label.length })}</span>}
            </p>
          </div>

          {info.valid && !info.swapOk && (
            <p className="flex items-start gap-2 border-l-2 border-warn bg-warn/[0.06] px-3 py-2.5 text-[12px] leading-relaxed text-muted">
              <TriangleAlert size={16} className="mt-0.5 shrink-0 text-warn" aria-hidden />
              <span>
                {rich(t("pay.warnSwap"), { b: (c) => <strong className="text-text">{c}</strong> })} {t("pay.warnKind.sapling")}{" "}
                {rich(t("pay.warnFix"), { link: learnLink })}
              </span>
            </p>
          )}
          {info.swapOk && (
            <p className="flex items-start gap-2 border-l-2 border-accent bg-accent/[0.05] px-3 py-2.5 text-[12px] leading-relaxed text-muted">
              <Info size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden />
              <span>{rich(t(info.kind === "unified" ? "pay.infoSwapUnified" : "pay.infoSwap"), { link: learnLink })}</span>
            </p>
          )}

          <button type="submit" className="btn-accent inline-flex h-12 items-center justify-center gap-2 px-6 text-[13px] sm:justify-self-start">
            <QrCode size={16} aria-hidden /> {t("pay.create")}
          </button>
        </form>
      </Panel>

      <Panel title={t("pay.share")} meta={<span>{ready ? t("pay.ready") : t("pay.waiting")}</span>} bodyClassName="p-4 sm:p-5">
        <p className="sr-only" aria-live="polite">
          {ready ? t("pay.readyLive") : ""}
        </p>
        <div>
          {ready ? (
            <div className="fade-up grid gap-5">
              <div role="group" aria-label={t("pay.qrGroup")} className="grid grid-cols-2 gap-px border border-line bg-line">
                {(
                  [
                    ["link", t("pay.qr.link"), t("pay.qr.linkSub")],
                    ["uri", t("pay.qr.uri"), t("pay.qr.uriSub")],
                  ] as const
                ).map(([k, title, sub]) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={qrOf === k}
                    onClick={() => setQrOf(k)}
                    className={`min-w-0 p-3 text-left transition-colors duration-150 ${qrOf === k ? "bg-surface-3 text-fg shadow-[inset_0_-2px_0_var(--accent)]" : "bg-surface text-muted hover:bg-surface-2"}`}
                  >
                    <span className="block truncate text-[12px] uppercase tracking-wider">{title}</span>
                    <span className="micro block truncate">{sub}</span>
                  </button>
                ))}
              </div>

              <div className="grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
                <div className="mx-auto bg-white p-3 sm:mx-0">
                  <QRCodeSVG value={qrOf === "link" ? link : uri} size={176} level="M" marginSize={0} title={qrOf === "link" ? t("pay.qrTitleLink") : t("pay.qrTitleUri")} />
                </div>
                <div className="min-w-0">
                  <p className="micro">{t("pay.requesting")}</p>
                  <p className="num mt-2 break-words text-[30px] text-fg">
                    {amt} <span className="text-[16px] text-muted">ZEC</span>
                  </p>
                  {note && <p className="mt-2 break-words text-[13px] text-muted">“{note}”</p>}
                  <p className="micro mt-3 normal-case leading-relaxed tracking-normal">
                    {qrOf === "link" ? t("pay.linkExplain") : t("pay.uriExplain")}
                  </p>
                </div>
              </div>

              <div>
                <p className="label">{t("pay.qr.link")}</p>
                <div className="mt-2 flex items-start gap-2 border border-line bg-bg-2 p-3">
                  <span className="min-w-0 flex-1 break-all font-mono text-[12px] leading-relaxed text-text" translate="no">
                    {link}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <CopyButton value={link} label={t("pay.copyLinkAria")} text={t("pay.copyLink")} onCopied={() => track("Payment request created")} />
                  {canShare && (
                    <button
                      type="button"
                      onClick={() => {
                        track("Payment request created");
                        navigator.share({ title: t("pay.shareTitle"), text: note ? `${note} — ${amt} ZEC` : `${amt} ZEC`, url: link }).catch(() => {});
                      }}
                      className="inline-flex h-10 items-center gap-2 border border-line px-3 text-[12px] uppercase tracking-wider text-muted hover:border-line-strong hover:bg-surface-2 hover:text-fg"
                    >
                      <Share2 size={15} aria-hidden /> {t("common.share")}
                    </button>
                  )}
                  <Link
                    href={preview}
                    className="inline-flex h-10 items-center gap-2 border border-line px-3 text-[12px] uppercase tracking-wider text-muted hover:border-line-strong hover:bg-surface-2 hover:text-fg"
                  >
                    <ArrowUpRight size={15} aria-hidden /> {t("pay.preview")}
                  </Link>
                </div>
              </div>

              <div>
                <p className="label">{t("pay.uriLabel")}</p>
                <div className="mt-2 flex items-start gap-2 border border-line bg-bg-2 p-3">
                  <span className="min-w-0 flex-1 break-all font-mono text-[12px] leading-relaxed text-text" translate="no">
                    {uri}
                  </span>
                  <CopyButton value={uri} label={t("pay.copyUri")} />
                </div>
              </div>

              <p className="micro normal-case leading-relaxed tracking-normal">
                {t("pay.publicNote")}
              </p>
            </div>
          ) : (
            <div className="hatch grid min-h-[280px] place-items-center border border-line p-6 text-center">
              <div>
                <QrCode size={28} className="mx-auto text-subtle" aria-hidden />
                <p className="mt-3 text-[13px] text-muted">{t("pay.emptyShare")}</p>
              </div>
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}
