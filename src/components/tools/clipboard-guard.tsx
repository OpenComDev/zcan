"use client";

import { Check, ClipboardCheck, ClipboardPaste, Eye, EyeOff, ShieldAlert, TriangleAlert, X } from "lucide-react";
import { useEffect, useEffectEvent, useId, useState } from "react";
import { Panel } from "@/components/hud/panel";
import { checkAddress, type AddressInfo } from "@/lib/address-check";
import { useT, type Vars } from "@/lib/i18n";
import { useAddressText } from "./address-checker";
import { BTN_GHOST, FIELD } from "./tool-ui";

const CHUNK = 6;

/** `message` is an i18n key. */
class ClipError extends Error {}

async function readClipboard(): Promise<string> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.readText) {
    throw new ClipError("tools.clip.err.unsupported");
  }
  try {
    return (await navigator.clipboard.readText()).trim();
  } catch {
    throw new ClipError("tools.clip.err.blocked");
  }
}

const short = (s: string) => (s.length > 16 ? `${s.slice(0, CHUNK)}…${s.slice(-CHUNK)}` : s);

/* ------------------------------------------------------------------ */
/* Character diff                                                      */
/* ------------------------------------------------------------------ */

function DiffLine({ text, other, label }: { text: string; other: string; label: string }) {
  return (
    <div className="min-w-0">
      <p className="micro">{label}</p>
      <p translate="no" className="mt-1 break-all font-mono text-[14px] leading-relaxed text-fg">
        {[...text].map((ch, i) =>
          ch === other[i] ? (
            <span key={i}>{ch}</span>
          ) : (
            <mark key={i} className="bg-red/30 text-red underline decoration-red decoration-2 underline-offset-2">
              {ch}
            </mark>
          ),
        )}
      </p>
    </div>
  );
}

function Chunk({ a, b, label }: { a: string; b: string; label: string }) {
  const t = useT();
  const cells = (s: string, other: string) =>
    Array.from({ length: CHUNK }, (_, i) => {
      const ch = s[i] ?? "";
      const bad = ch !== (other[i] ?? "");
      return (
        <span
          key={i}
          className={`flex h-11 w-8 items-center justify-center border-b-2 font-mono text-[24px] sm:w-9 sm:text-[26px] ${bad ? "border-red bg-red/15 text-red" : "border-line-strong text-fg"}`}
        >
          {ch}
        </span>
      );
    });
  const same = a === b;
  return (
    <div className="min-w-0">
      <p className="micro flex items-center gap-1.5">
        {label}
        {same ? <Check size={12} className="text-green" aria-label={t("tools.clip.matches")} /> : <X size={12} className="text-red" aria-label={t("tools.clip.differs")} />}
      </p>
      <div translate="no" className="mt-2 grid gap-1.5">
        <div className="flex gap-1" aria-label={t("tools.clip.ariaIntended", { chars: [...a].join(" ") })}>
          {cells(a, b)}
        </div>
        <div className="flex gap-1" aria-label={t("tools.clip.ariaSend", { chars: [...b].join(" ") })}>
          {cells(b, a)}
        </div>
      </div>
    </div>
  );
}

function Compare({ a, b }: { a: string; b: string }) {
  const t = useT();
  const A = useAddressText();
  const same = a === b;
  const diffs: number[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) diffs.push(i + 1);
  const ia = checkAddress(a);
  const ib = checkAddress(b);
  const lookalike = !same && a.length > 2 * CHUNK && a.slice(0, CHUNK) === b.slice(0, CHUNK) && a.slice(-CHUNK) === b.slice(-CHUNK);
  const typeMismatch = ia && ib && ia.chainId !== ib.chainId;

  return (
    <div className="fade-up mt-6 grid gap-5 border-t border-line pt-5">
      {same ? (
        <p className="flex items-start gap-2 border border-green/40 bg-green/[0.06] p-3 text-[13px] text-fg">
          <Check size={16} className="mt-0.5 shrink-0 text-green" aria-hidden />
          <span>
            <span className="font-medium text-green">{t("tools.clip.exact")}</span>{" "}
            {ia ? t("tools.clip.sameAs", { kind: A.describe(ia) }) : t("tools.clip.same")}
          </span>
        </p>
      ) : (
        <div className="border border-red/50 bg-red/[0.07] p-3 text-[13px] text-fg">
          <p className="flex items-center gap-2 font-medium text-red">
            <ShieldAlert size={16} aria-hidden /> {t("tools.clip.mismatch")}
          </p>
          <p className="mt-1.5 leading-relaxed">
            {a.length !== b.length
              ? t(diffs.length === 1 ? "tools.clip.diffLen.one" : "tools.clip.diffLen.other", { n: diffs.length, a: a.length, b: b.length })
              : t(diffs.length === 1 ? "tools.clip.diff.one" : "tools.clip.diff.other", { n: diffs.length })}{" "}
            {lookalike ? t("tools.clip.lookalike") : t("tools.clip.replaced")}
          </p>
          {diffs.length <= 12 && <p className="mt-1.5 text-muted">{t("tools.clip.positions", { list: diffs.join(", ") })}</p>}
        </div>
      )}
      {typeMismatch && (
        <p className="flex items-start gap-2 text-[13px] text-warn">
          <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden />
          {t("tools.clip.kindMismatch", { a: A.describe(ia), b: A.describe(ib) })}
        </p>
      )}

      <div>
        <p className="eyebrow">{t("tools.clip.checkChars")}</p>
        <div className="mt-3 grid gap-5 sm:grid-cols-2">
          <Chunk label={t("tools.clip.first", { n: CHUNK })} a={a.slice(0, CHUNK)} b={b.slice(0, CHUNK)} />
          <Chunk label={t("tools.clip.last", { n: CHUNK })} a={a.slice(-CHUNK)} b={b.slice(-CHUNK)} />
        </div>
        <p className="mt-2 text-[12px] text-subtle">{t("tools.clip.rows")}</p>
      </div>

      {!same && (
        <div className="grid gap-3 border border-line bg-bg-2 p-3">
          <DiffLine label={t("tools.clip.intended")} text={a} other={b} />
          <DiffLine label={t("tools.clip.sendField")} text={b} other={a} />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Watch mode                                                          */
/* ------------------------------------------------------------------ */

/** `key` is an i18n key; `info` supplies the {chain} variable at render time so it follows the language. */
type LogEntry = { id: number; time: string; key: string; vars?: Vars; info?: AddressInfo; tone: "ok" | "warn" | "muted" };
type Alert = { from: AddressInfo; to: AddressInfo };

function Watch() {
  const [watching, setWatching] = useState(false);
  const [baseline, setBaseline] = useState<AddressInfo | null>(null);
  const [alert, setAlert] = useState<Alert | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const t = useT();
  const A = useAddressText();

  const push = (key: string, tone: LogEntry["tone"] = "muted", info?: AddressInfo, vars?: Vars) => {
    const time = new Intl.DateTimeFormat(undefined, { timeStyle: "medium" }).format(new Date());
    setLog((l) => [{ id: Date.now() + Math.random(), time, key, vars, info, tone }, ...l].slice(0, 6));
  };
  const logText = (e: LogEntry) => t(e.key, { ...e.vars, ...(e.info ? { chain: A.chain(e.info), addr: short(e.info.address) } : {}) });

  const onRead = useEffectEvent((text: string) => {
    const info = checkAddress(text);
    if (!info) return;
    if (!baseline) {
      setBaseline(info);
      push("tools.clip.log.watching", "ok", info);
      return;
    }
    if (info.address === baseline.address || info.address === alert?.to.address) return;
    if (info.chainId === baseline.chainId) {
      setAlert({ from: baseline, to: info });
      push("tools.clip.log.changed", "warn", info);
    } else {
      setBaseline(info);
      push("tools.clip.log.nowWatching", "ok", info);
    }
  });

  const onReadError = useEffectEvent(() => {
    if (!error) setError("tools.clip.err.stopped");
  });

  useEffect(() => {
    if (!watching) return;
    const read = () => {
      if (document.visibilityState !== "visible" || !document.hasFocus()) return;
      readClipboard().then(onRead, onReadError);
    };
    window.addEventListener("focus", read);
    document.addEventListener("visibilitychange", read);
    return () => {
      window.removeEventListener("focus", read);
      document.removeEventListener("visibilitychange", read);
    };
  }, [watching]);

  const start = async () => {
    setError(null);
    try {
      const text = await readClipboard();
      setWatching(true);
      const info = checkAddress(text);
      setBaseline(info);
      setAlert(null);
      if (info) push("tools.clip.log.watching", "ok", info);
      else push("tools.clip.log.watchingEmpty");
    } catch (e) {
      setError(e instanceof ClipError ? e.message : "tools.clip.err.read");
    }
  };

  const stop = () => {
    setWatching(false);
    setBaseline(null);
    setAlert(null);
    setError(null);
    push("tools.clip.log.stopped");
  };

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          {watching ? <Eye size={14} className="text-accent" aria-hidden /> : <EyeOff size={14} aria-hidden />} {t("tools.clip.watch.title")}
        </span>
      }
      meta={
        <span className="flex items-center gap-1.5">
          {watching && <span aria-hidden className="pulse-dot size-1.5 bg-accent" />}
          {watching ? t("tools.clip.watch.on") : t("tools.clip.watch.off")}
        </span>
      }
      bodyClassName="p-4 sm:p-5"
      marks
    >
      <p className="text-[13px] leading-relaxed text-muted">
        {t("tools.clip.watch.intro")}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {watching ? (
          <button type="button" onClick={stop} aria-pressed className={BTN_GHOST}>
            <EyeOff size={13} aria-hidden /> {t("tools.clip.watch.stop")}
          </button>
        ) : (
          <button type="button" onClick={start} aria-pressed={false} className="btn-accent inline-flex h-10 items-center gap-2 px-4 text-[12px]">
            <Eye size={14} aria-hidden /> {t("tools.clip.watch.start")}
          </button>
        )}
      </div>
      {baseline && watching && (
        <p className="mt-3 text-[12px] text-subtle">
          {t("tools.clip.watch.baseline")} <span translate="no" className="font-mono text-fg">{short(baseline.address)}</span> · {A.chain(baseline)}
        </p>
      )}

      <div aria-live="assertive">
        {alert && (
          <div role="alert" className="fade-up mt-4 border border-red/60 bg-red/[0.08] p-3 text-[13px]">
            <p className="flex items-center gap-2 font-medium text-red">
              <ShieldAlert size={16} aria-hidden /> {t("tools.clip.alert.title")}
            </p>
            <p className="mt-1.5 leading-relaxed text-fg">
              {t("tools.clip.alert.was")} <span translate="no" className="font-mono">{short(alert.from.address)}</span>
              {t("tools.clip.alert.now")}{" "}
              <span translate="no" className="font-mono text-red">{short(alert.to.address)}</span>. {t("tools.clip.alert.body")}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(alert.from.address);
                    push("tools.clip.log.restored", "ok", undefined, { addr: short(alert.from.address) });
                    setAlert(null);
                  } catch {
                    setError("tools.clip.err.write");
                  }
                }}
                className="btn-accent inline-flex h-10 items-center px-4 text-[12px]"
              >
                {t("tools.clip.alert.restore")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setBaseline(alert.to);
                  setAlert(null);
                  push("tools.clip.log.trusted", "muted", undefined, { addr: short(alert.to.address) });
                }}
                className={BTN_GHOST}
              >
                {t("tools.clip.alert.mine")}
              </button>
            </div>
          </div>
        )}
        {error && (
          <p role="alert" className="mt-4 flex items-start gap-2 text-[13px] text-red">
            <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden /> {t(error)}
          </p>
        )}
      </div>

      {log.length > 0 && (
        <ol className="mt-4 divide-y divide-line border border-line text-[12px]">
          {log.map((e) => (
            <li key={e.id} className="flex min-w-0 items-baseline gap-3 px-3 py-2">
              <span className="tabular shrink-0 text-subtle">{e.time}</span>
              <span className={`min-w-0 break-words ${e.tone === "warn" ? "text-red" : e.tone === "ok" ? "text-fg" : "text-muted"}`}>{logText(e)}</span>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-4 border-t border-line pt-4 text-[12px] leading-relaxed text-subtle">
        {t("tools.clip.watch.footer")}
      </p>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

function AddressField({
  id,
  name,
  label,
  value,
  onChange,
  onRead,
  readLabel,
}: {
  id: string;
  name: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  onRead: () => void;
  readLabel: string;
}) {
  const t = useT();
  const A = useAddressText();
  const info = value.trim() ? checkAddress(value) : null;
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <label htmlFor={id} className="text-[13px] text-muted">
          {label}
        </label>
        <button type="button" onClick={onRead} className={`${BTN_GHOST} h-8`}>
          <ClipboardPaste size={13} aria-hidden /> {readLabel}
        </button>
      </div>
      <textarea
        id={id}
        name={name}
        rows={2}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("tools.clip.placeholder")}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        translate="no"
        className={`mt-2 resize-none break-all font-mono ${FIELD} border-line`}
      />
      <p className="mt-1 min-h-4 text-[11px] uppercase tracking-wider text-subtle">{info ? A.describe(info) : value.trim() ? t("tools.clip.notRecognised") : ""}</p>
    </div>
  );
}

/** Compare the address you meant to copy with the one you're about to send to, plus an optional clipboard watcher. */
export function ClipboardGuard() {
  const [intended, setIntended] = useState("");
  const [target, setTarget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const idA = useId();
  const idB = useId();
  const t = useT();

  const fill = (set: (v: string) => void) => async () => {
    setError(null);
    try {
      set(await readClipboard());
    } catch (e) {
      setError(e instanceof ClipError ? e.message : "tools.clip.err.read");
    }
  };

  const a = intended.trim();
  const b = target.trim();

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_400px]">
      <Panel
        title={
          <span className="flex items-center gap-2">
            <ClipboardCheck size={14} className="text-accent" aria-hidden /> {t("tools.clip.compare")}
          </span>
        }
        meta={<span>{t("tools.localMeta")}</span>}
        bodyClassName="p-4 sm:p-5"
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <AddressField id={idA} name="intended-address" label={t("tools.clip.field1")} value={intended} onChange={setIntended} onRead={fill(setIntended)} readLabel={t("tools.clip.read")} />
          <AddressField id={idB} name="send-address" label={t("tools.clip.field2")} value={target} onChange={setTarget} onRead={fill(setTarget)} readLabel={t("tools.clip.paste")} />
        </div>
        {error && (
          <p role="alert" className="mt-3 flex items-start gap-2 text-[13px] text-red">
            <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden /> {t(error)}
          </p>
        )}
        <div aria-live="polite">
          {a && b ? (
            <Compare a={a} b={b} />
          ) : (
            <p className="mt-6 border-t border-line pt-5 text-[13px] text-subtle">
              {t("tools.clip.empty")}
            </p>
          )}
        </div>
        {(intended || target) && (
          <button
            type="button"
            onClick={() => {
              setIntended("");
              setTarget("");
              setError(null);
            }}
            className={`${BTN_GHOST} mt-5`}
          >
            {t("tools.clip.clearBoth")}
          </button>
        )}
      </Panel>
      <Watch />
    </div>
  );
}
