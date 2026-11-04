"use client";

import { Check, Copy, LoaderCircle, Radar, ScanSearch, ShieldCheck, TriangleAlert, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Panel } from "@/components/hud/panel";
import { track } from "@/lib/analytics";
import { SAMPLE_ADDRESSES, checkAddress, type ActivitySource, type AddressInfo } from "@/lib/address-check";
import { useT, type Vars } from "@/lib/i18n";
import { BTN_GHOST, FIELD } from "./tool-ui";

const nf = new Intl.NumberFormat();

/** Explorer names stay as-is; `note` is an i18n key. */
const SOURCES: Record<ActivitySource, { name: string; note: string }> = {
  bitcoin: { name: "mempool.space", note: "tools.addr.src.bitcoin" },
  ethereum: { name: "PublicNode", note: "tools.addr.src.ethereum" },
  zcash: { name: "Blockchair", note: "tools.addr.src.zcash" },
};

const RECEIVER_TYPES: Record<number, string> = { 0: "t-p2pkh", 1: "t-p2sh", 2: "sapling" };

/** Translated text for an AddressInfo (the lib keeps English strings plus stable ids). Shared with the clipboard guard. */
export function useAddressText() {
  const t = useT();
  return useMemo(() => {
    const chain = (i: AddressInfo) => (i.chainId === "evm" ? t("tools.addr.chain.evm") : i.chain);
    const type = (i: AddressInfo) => t(`tools.addr.type.${i.typeId}`, i.typeVars);
    return {
      chain,
      type,
      describe: (i: AddressInfo) => `${chain(i)} · ${type(i)}`,
      privacyNote: (i: AddressInfo) => t(`tools.addr.privacyNote.${i.privacyNoteId}`),
      checksumNote: (i: AddressInfo) => t(`tools.addr.checksumNote.${i.checksumNoteId}`),
      notes: (i: AddressInfo) => (i.noteIds ?? []).map((id) => t(`tools.addr.note.${id}`)),
      receivers: (i: AddressInfo) =>
        (i.receiverCodes ?? []).map((c) => (c === 3 ? "Orchard" : RECEIVER_TYPES[c] ? t(`tools.addr.type.${RECEIVER_TYPES[c]}`) : t("tools.addr.receiver.unknown", { code: c }))),
    };
  }, [t]);
}

type Part = [key: string, vars?: Vars];

type Activity =
  | { address: string; status: "loading" }
  | { address: string; status: "done"; used: boolean; summary: Part[] }
  | { address: string; status: "error"; message: Part };

class ActivityError extends Error {
  part: Part;
  constructor(part: Part) {
    super(part[0]);
    this.part = part;
  }
}

async function getJson(url: string, init?: RequestInit) {
  const res = await fetch(url, { ...init, cache: "no-store", referrerPolicy: "no-referrer" });
  if (res.status === 429 || res.status === 430 || res.status === 402) throw new ActivityError(["tools.addr.act.err.rate"]);
  if (!res.ok) throw new ActivityError(["tools.addr.act.err.status", { status: res.status }]);
  return res.json();
}

const txSummary = (n: number): Part[] =>
  n > 0 ? [[n === 1 ? "tools.addr.act.tx.one" : "tools.addr.act.tx.other", { n: nf.format(n) }]] : [["tools.addr.act.tx.none"]];

async function fetchActivity(info: AddressInfo): Promise<{ used: boolean; summary: Part[] }> {
  const a = info.normalized ?? info.address;
  if (info.activity === "bitcoin") {
    const d = await getJson(`https://mempool.space/api/address/${encodeURIComponent(a)}`);
    const n = (d?.chain_stats?.tx_count ?? 0) + (d?.mempool_stats?.tx_count ?? 0);
    return { used: n > 0, summary: txSummary(n) };
  }
  if (info.activity === "ethereum") {
    const rpc = (method: string) =>
      getJson("https://ethereum-rpc.publicnode.com", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: [a, "latest"] }),
      }).then((r) => BigInt(r?.result ?? "0x0"));
    const [nonce, balance] = await Promise.all([rpc("eth_getTransactionCount"), rpc("eth_getBalance")]);
    const zero = BigInt(0);
    const used = nonce > zero || balance > zero;
    const parts: Part[] = [];
    if (nonce > zero) parts.push([nonce === BigInt(1) ? "tools.addr.act.sent.one" : "tools.addr.act.sent.other", { n: nf.format(nonce) }]);
    if (balance > zero) parts.push(["tools.addr.act.balance"]);
    return { used, summary: used ? parts : [["tools.addr.act.eth.none"]] };
  }
  if (info.activity === "zcash") {
    const d = await getJson(`https://api.blockchair.com/zcash/dashboards/address/${encodeURIComponent(a)}`);
    const n = Number(d?.data?.[a]?.address?.transaction_count ?? 0);
    return { used: n > 0, summary: txSummary(n) };
  }
  throw new ActivityError(["tools.addr.act.err.noSource"]);
}

/** Paste any address → chain, type, privacy level and checksum, all detected locally. */
export function AddressChecker() {
  const [value, setValue] = useState("");
  const [activity, setActivity] = useState<Activity | null>(null);
  const [copied, setCopied] = useState(false);
  const inputId = useId();
  const reqRef = useRef(0);
  const t = useT();
  const A = useAddressText();

  const trimmed = value.trim();
  const info = useMemo(() => checkAddress(value), [value]);
  const act = activity && info && activity.address === info.address ? activity : null;
  const unrecognised = !info && trimmed.length >= 20;

  // Count a check once per chain recognised (not per keystroke). Only the chain name is sent.
  const counted = useRef(new Set<string>());
  const chain = info?.chainId;
  useEffect(() => {
    if (chain && !counted.current.has(chain)) {
      counted.current.add(chain);
      track("Address checked", { kind: chain });
    }
  }, [chain]);

  const runActivity = async () => {
    if (!info?.activity) return;
    const id = ++reqRef.current;
    setActivity({ address: info.address, status: "loading" });
    try {
      const r = await fetchActivity(info);
      if (id === reqRef.current) setActivity({ address: info.address, status: "done", ...r });
    } catch (e) {
      if (id === reqRef.current)
        setActivity({ address: info.address, status: "error", message: e instanceof ActivityError ? e.part : ["tools.addr.act.err.network"] });
    }
  };

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Panel
        title={
          <span className="flex items-center gap-2">
            <ScanSearch size={14} className="text-accent" aria-hidden /> {t("tools.addr.panel")}
          </span>
        }
        meta={<span>{t("tools.localMeta")}</span>}
        bodyClassName="p-4 sm:p-5"
      >
        <label htmlFor={inputId} className="text-[13px] text-muted">
          {t("tools.addr.inputLabel")}
        </label>
        <textarea
          id={inputId}
          name="address"
          rows={3}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setCopied(false);
          }}
          placeholder="u1…, zs1…, t1…, bc1…, 0x…, alice.near…"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          translate="no"
          aria-invalid={unrecognised || info?.checksum === "invalid" ? true : undefined}
          className={`mt-2 resize-none break-all font-mono ${FIELD} ${unrecognised || info?.checksum === "invalid" ? "border-red" : "border-line"}`}
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="micro mr-1">{t("tools.addr.try")}</span>
          {SAMPLE_ADDRESSES.map((s) => (
            <button key={s.id} type="button" onClick={() => setValue(s.address)} className={BTN_GHOST}>
              {s.id === "zcash" ? t("tools.addr.sample.zcash") : s.label}
            </button>
          ))}
          {value && (
            <button type="button" onClick={() => setValue("")} className={BTN_GHOST}>
              {t("tools.clear")}
            </button>
          )}
        </div>
        <p className="mt-5 border-t border-line pt-4 text-[12px] leading-relaxed text-subtle">
          {t("tools.addr.footer")}
        </p>
      </Panel>

      <Panel title={t("tools.addr.result")} meta={info ? <span>{A.chain(info)}</span> : <span>{t("tools.addr.waiting")}</span>} bodyClassName="p-4 sm:p-5" marks>
        <div aria-live="polite">
          {!info && !unrecognised && (
            <p className="flex min-h-32 items-center justify-center text-center text-[13px] text-subtle">{t("tools.addr.empty")}</p>
          )}
          {unrecognised && (
            <p role="alert" className="flex items-start gap-2 text-[13px] text-red">
              <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden />
              {t("tools.addr.unrecognised")}
            </p>
          )}
          {info && (
            <div className="fade-up grid gap-4">
              <dl className="divide-y divide-line border border-line text-[13px]">
                <Row k={t("tools.addr.row.chain")} v={A.chain(info)} />
                <Row k={t("tools.addr.row.type")} v={A.type(info)} />
                <Row
                  k={t("tools.addr.row.privacy")}
                  v={
                    <span className={`tag ${info.privacy === "shielded" ? "text-green" : "text-warn"}`}>
                      {t(`tools.addr.privacy.${info.privacy}`)}
                    </span>
                  }
                />
                <Row
                  k={t("tools.addr.row.checksum")}
                  v={
                    info.checksum === "valid" ? (
                      <span className="inline-flex items-center gap-1.5 text-green">
                        <Check size={14} aria-hidden /> {t("tools.addr.checksum.valid")}
                      </span>
                    ) : info.checksum === "invalid" ? (
                      <span className="inline-flex items-center gap-1.5 text-red">
                        <X size={14} aria-hidden /> {t("tools.addr.checksum.invalid")}
                      </span>
                    ) : (
                      <span className="text-muted">{t("tools.addr.checksum.none")}</span>
                    )
                  }
                />
                {info.receiverCodes && <Row k={t("tools.addr.row.receivers")} v={A.receivers(info).join(" · ")} />}
              </dl>

              <p
                className={`flex items-start gap-2 border-l-2 px-3 py-2.5 text-[13px] leading-relaxed text-fg ${
                  info.privacy === "shielded" ? "border-green bg-green/[0.06]" : "border-warn bg-warn/[0.06]"
                }`}
              >
                {info.privacy === "shielded" ? (
                  <ShieldCheck size={16} className="mt-0.5 shrink-0 text-green" aria-hidden />
                ) : (
                  <TriangleAlert size={16} className="mt-0.5 shrink-0 text-warn" aria-hidden />
                )}
                {A.privacyNote(info)}
              </p>

              <p className="text-[12px] leading-relaxed text-muted">{A.checksumNote(info)}</p>

              {info.normalized && info.normalized !== info.address && (
                <div>
                  <p className="eyebrow">{t("tools.addr.checksummed")}</p>
                  <div className="mt-2 flex items-start gap-2 border border-line bg-bg-2 p-3">
                    <span translate="no" className="min-w-0 flex-1 break-all font-mono text-[13px] text-fg">
                      {info.normalized}
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(info.normalized!);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 1500);
                        } catch {}
                      }}
                      aria-label={copied ? t("common.copied") : t("tools.addr.copyChecksummed")}
                      className="inline-flex size-9 shrink-0 items-center justify-center text-muted hover:bg-surface-3 hover:text-fg"
                    >
                      {copied ? <Check size={16} className="text-green" /> : <Copy size={16} />}
                    </button>
                  </div>
                </div>
              )}

              {A.notes(info).map((n) => (
                <p key={n} className="text-[12px] leading-relaxed text-muted">
                  {n}
                </p>
              ))}

              {info.activity && info.checksum !== "invalid" && (
                <div className="border-t border-line pt-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <button type="button" onClick={runActivity} disabled={act?.status === "loading"} className={BTN_GHOST}>
                      {act?.status === "loading" ? <LoaderCircle size={13} className="animate-spin-slow" aria-hidden /> : <Radar size={13} aria-hidden />}
                      {t("tools.addr.checkActivity")}
                    </button>
                    <span className="micro">{t("tools.addr.via", { name: SOURCES[info.activity].name, note: t(SOURCES[info.activity].note) })}</span>
                  </div>
                  <p className="mt-2 text-[12px] leading-relaxed text-subtle">
                    {t("tools.addr.optional", { name: SOURCES[info.activity].name })}
                  </p>
                  {act?.status === "done" && (
                    <div
                      className={`fade-up mt-3 border p-3 text-[13px] leading-relaxed ${act.used ? "border-warn/50 bg-warn/[0.06]" : "border-green/40 bg-green/[0.06]"}`}
                    >
                      <p className={`flex flex-wrap items-center gap-x-2 gap-y-1 font-medium ${act.used ? "text-warn" : "text-green"}`}>
                        {act.used ? <TriangleAlert size={15} aria-hidden /> : <Check size={15} aria-hidden />}
                        {act.used ? t("tools.addr.act.used") : t("tools.addr.act.unused")}
                        <span className="tabular font-normal text-muted">· {act.summary.map(([k, v]) => t(k, v)).join(" · ")}</span>
                      </p>
                      <p className="mt-1.5 text-muted">
                        {act.used ? t("tools.addr.act.usedNote") : t("tools.addr.act.unusedNote")}
                      </p>
                    </div>
                  )}
                  {act?.status === "error" && (
                    <p role="alert" className="mt-3 flex items-start gap-2 text-[13px] text-red">
                      <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden /> {t(...act.message)}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}

function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="grid grid-cols-[104px_minmax(0,1fr)] items-center gap-3 px-3 py-2.5">
      <dt className="min-w-0 break-words text-[11px] uppercase tracking-wider text-subtle">{k}</dt>
      <dd className="min-w-0 break-words text-fg">{v}</dd>
    </div>
  );
}
