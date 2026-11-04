"use client";

import { Download, FileUp, Loader2, Lock, Trash2 } from "lucide-react";
import { useCallback, useId, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { Panel } from "@/components/hud/panel";
import { MEMORY_PREFIX } from "@/lib/agent-memory";
import { ALERTS_EVENT, ALERTS_KEY } from "@/lib/alerts";
import { useLocale, useT } from "@/lib/i18n";
import { RECURRING_EVENT } from "@/lib/recurring";
import {
  BATCHES_KEY,
  BackupError,
  HISTORY_KEY,
  LOCAL_EVENT,
  backupFilename,
  collectLocal,
  download,
  encryptedBackup,
  forgetEverything,
  isEncrypted,
  localSignature,
  mergeBackup,
  openBackup,
  plainBackup,
  readBackup,
  type EncryptedBackup,
  type ImportResult,
} from "./backup";

const MIN_PASS = 10;
/** The word typed to confirm a wipe. Kept in English in every language so it's unambiguous. */
const CONFIRM_WORD = "forget";

function subscribeLocal(cb: () => void) {
  const events = ["zcan:history", "zcan:batches", ALERTS_EVENT, RECURRING_EVENT, LOCAL_EVENT, "zcan:agent-memory", "zcan:agent-checklists", "storage"];
  events.forEach((e) => window.addEventListener(e, cb));
  return () => events.forEach((e) => window.removeEventListener(e, cb));
}

/** Signature of what's in localStorage under zcan: — null on the server. */
const useLocalSignature = () => useSyncExternalStore(subscribeLocal, localSignature, () => null);

/**
 * `plural("history.count.swap", 3)` → "3 swaps" in the reader's language.
 * Each `history.count.*` key has one/few/many/other forms in every language.
 */
export function usePlural() {
  const t = useT();
  const locale = useLocale();
  return useCallback(
    (base: string, n: number) => {
      const cat = new Intl.PluralRules(locale).select(n);
      const form = cat === "one" || cat === "few" || cat === "many" ? cat : "other";
      return t(`${base}.${form}`, { n: new Intl.NumberFormat(locale).format(n) });
    },
    [t, locale],
  );
}

/** Export, encrypted backup, import and "forget everything" for local data. */
export function DataPanel() {
  const t = useT();
  const locale = useLocale();
  const plural = usePlural();
  const sig = useLocalSignature();
  const ids = { pass: useId(), pass2: useId(), passErr: useId(), importPass: useId(), importErr: useId(), confirm: useId(), confirmErr: useId(), title: useId() };

  const summary = useMemo(() => {
    if (sig === null) return null;
    const data = sig ? collectLocal() : {};
    const len = (k: string) => (Array.isArray(data[k]) ? (data[k] as unknown[]).length : 0);
    const known = new Set([HISTORY_KEY, BATCHES_KEY, ALERTS_KEY]);
    const bytes = sig ? sig.split("|").reduce((s, p) => s + Number(p.split("=").pop() ?? 0), 0) : 0;
    return {
      swaps: len(HISTORY_KEY),
      batches: len(BATCHES_KEY),
      alerts: len(ALERTS_KEY),
      other: Object.keys(data).filter((k) => !known.has(k)).length,
      // Counted from storage, not the export: device-only keys (the agent profile) aren't exported but can still be forgotten.
      keys: sig ? sig.split("|").length : 0,
      memory: sig ? sig.split("|").some((p) => p.startsWith(MEMORY_PREFIX)) : false,
      kb: bytes / 1024,
    };
  }, [sig]);
  const empty = summary !== null && summary.keys === 0;

  // Encrypted export
  const [encOpen, setEncOpen] = useState(false);
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [passErr, setPassErr] = useState<string | null>(null);
  const [encBusy, setEncBusy] = useState(false);
  const passRef = useRef<HTMLInputElement>(null);
  const pass2Ref = useRef<HTMLInputElement>(null);

  // Import
  const fileRef = useRef<HTMLInputElement>(null);
  const importPassRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ name: string; backup: EncryptedBackup } | null>(null);
  const [importPass, setImportPass] = useState("");
  const [importErr, setImportErr] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);

  // Forget
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [confirm, setConfirm] = useState("");
  const [confirmErr, setConfirmErr] = useState<string | null>(null);

  const [notice, setNotice] = useState<string | null>(null);

  const errText = (err: unknown, fallback: string) => (err instanceof BackupError ? t(`history.backupErr.${err.key}`, err.vars) : t(fallback));
  const bytesFmt = new Intl.NumberFormat(locale, { style: "unit", unit: "kilobyte", maximumFractionDigits: 1 });

  const describeImport = (r: ImportResult): string => {
    const parts = [
      r.swaps && plural("history.count.swap", r.swaps),
      r.batches && plural("history.count.privateSend", r.batches),
      r.alerts && plural("history.count.alert", r.alerts),
      r.other && plural("history.count.other", r.other),
    ].filter((p): p is string => Boolean(p));
    if (!parts.length) return t("history.import.none");
    const done = t("history.import.done", { list: new Intl.ListFormat(locale, { type: "conjunction" }).format(parts) });
    return r.dropped ? `${done} ${t("history.import.dropped", { entries: plural("history.count.entry", r.dropped) })}` : done;
  };

  const exportEncrypted = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pass.length < MIN_PASS) {
      setPassErr(t("history.err.short", { n: MIN_PASS }));
      passRef.current?.focus();
      return;
    }
    if (pass !== pass2) {
      setPassErr(t("history.err.mismatch"));
      pass2Ref.current?.focus();
      return;
    }
    setPassErr(null);
    setEncBusy(true);
    try {
      download(await encryptedBackup(pass), backupFilename(true));
      setPass("");
      setPass2("");
      setEncOpen(false);
      setNotice(t("history.notice.encrypted"));
    } catch (err) {
      setPassErr(errText(err, "history.err.encrypt"));
    } finally {
      setEncBusy(false);
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setNotice(null);
    setImportErr(null);
    setPending(null);
    try {
      if (file.size > 5_000_000) throw new BackupError("That file is too large to be a Zcan backup.", "not-zcan", "tooLarge");
      const b = readBackup(await file.text());
      if (isEncrypted(b)) {
        setPending({ name: file.name, backup: b });
        setImportPass("");
        requestAnimationFrame(() => importPassRef.current?.focus());
        return;
      }
      setNotice(describeImport(mergeBackup(b)));
    } catch (err) {
      setImportErr(errText(err, "history.err.read"));
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const importEncrypted = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!pending) return;
    if (!importPass) {
      setImportErr(t("history.err.enterPass"));
      importPassRef.current?.focus();
      return;
    }
    setImportBusy(true);
    setImportErr(null);
    try {
      const plain = await openBackup(pending.backup, importPass);
      setNotice(describeImport(mergeBackup(plain)));
      setPending(null);
      setImportPass("");
    } catch (err) {
      setImportErr(errText(err, "history.err.open"));
      importPassRef.current?.select();
    } finally {
      setImportBusy(false);
    }
  };

  const forget = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (confirm.trim().toLowerCase() !== CONFIRM_WORD) {
      setConfirmErr(t("history.err.confirm", { word: CONFIRM_WORD }));
      return;
    }
    forgetEverything();
    setConfirm("");
    setConfirmErr(null);
    setPending(null);
    dialogRef.current?.close();
    setNotice(t("history.notice.forgot"));
  };

  // "Type {word} to confirm" — split so the word can be styled wherever the language puts it.
  const [typeBefore, typeAfter = ""] = t("history.forget.type").split("{word}");

  const btn =
    "inline-flex h-10 items-center justify-center gap-2 border border-line px-4 text-[12px] uppercase tracking-wider text-muted transition-colors hover:border-line-strong hover:text-fg disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line disabled:hover:text-muted";
  const input =
    "h-11 w-full border bg-bg-2 px-3 text-base text-fg outline-none placeholder:text-[13px] placeholder:text-subtle focus:border-accent/70 sm:text-[13px]";

  return (
    <Panel id="your-data" className="scroll-mt-20" title={t("history.data.title")} meta={<span>{t("history.data.meta")}</span>} bodyClassName="grid gap-5 p-4 sm:p-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <p className="text-[14px] text-fg">{t("history.data.intro")}</p>
          <p className="mt-2 text-[13px] text-muted">{t("history.data.intro2")}</p>
          {summary?.memory && <p className="mt-2 text-[13px] text-muted">{t("agentkit.mem.historyNote")}</p>}
        </div>
        <dl className="grid grid-cols-2 gap-px border border-line bg-line sm:grid-cols-4" aria-label={t("history.data.stored")}>
          {[
            ["swaps", summary?.swaps],
            ["sends", summary?.batches],
            ["alerts", summary?.alerts],
            ["size", summary ? bytesFmt.format(summary.kb) : undefined],
          ].map(([k, v]) => (
            <div key={k as string} className="min-w-0 bg-surface px-3 py-2.5">
              <dt className="micro truncate">{t(`history.stat.${k}`)}</dt>
              <dd className="num mt-1 truncate text-[18px] text-fg">{v ?? "—"}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className={btn} disabled={empty} onClick={() => download(plainBackup(), backupFilename(false))}>
          <Download size={14} aria-hidden /> {t("history.btn.json")}
        </button>
        <button type="button" className={btn} disabled={empty} aria-expanded={encOpen} onClick={() => setEncOpen((o) => !o)}>
          <Lock size={14} aria-hidden /> {t("history.btn.encrypted")}
        </button>
        <button type="button" className={btn} onClick={() => fileRef.current?.click()}>
          <FileUp size={14} aria-hidden /> {t("history.btn.import")}
        </button>
        <input ref={fileRef} type="file" name="backup" accept=".json,application/json" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => onFile(e.target.files?.[0])} />
        <button
          type="button"
          className={`${btn} hover:border-red/60! hover:text-red! sm:ml-auto`}
          disabled={empty}
          onClick={() => {
            setConfirm("");
            setConfirmErr(null);
            dialogRef.current?.showModal();
          }}
        >
          <Trash2 size={14} aria-hidden /> {t("history.btn.forget")}
        </button>
      </div>
      {empty && <p className="-mt-3 text-[12px] text-subtle">{t("history.emptyHint")}</p>}

      {encOpen && (
        <form onSubmit={exportEncrypted} noValidate className="fade-up grid gap-3 border border-line bg-bg-2/40 p-4">
          <p className="text-[13px] text-muted">{t("history.encIntro")}</p>
          {/* Hidden username helps password managers file the passphrase. */}
          <input type="text" name="username" autoComplete="username" value="Zcan backup" readOnly hidden />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="min-w-0">
              <label htmlFor={ids.pass} className="label mb-2 block">
                {t("history.passphrase")}
              </label>
              <input
                id={ids.pass}
                ref={passRef}
                type="password"
                name="new-password"
                autoComplete="new-password"
                value={pass}
                onChange={(e) => {
                  setPass(e.target.value);
                  setPassErr(null);
                }}
                placeholder={t("history.passPh")}
                aria-invalid={passErr ? true : undefined}
                aria-describedby={passErr ? ids.passErr : undefined}
                className={`${input} ${passErr ? "border-red" : "border-line"}`}
              />
            </div>
            <div className="min-w-0">
              <label htmlFor={ids.pass2} className="label mb-2 block">
                {t("history.repeat")}
              </label>
              <input
                id={ids.pass2}
                ref={pass2Ref}
                type="password"
                name="confirm-password"
                autoComplete="new-password"
                value={pass2}
                onChange={(e) => {
                  setPass2(e.target.value);
                  setPassErr(null);
                }}
                aria-invalid={passErr ? true : undefined}
                aria-describedby={passErr ? ids.passErr : undefined}
                className={`${input} ${passErr ? "border-red" : "border-line"}`}
              />
            </div>
          </div>
          {passErr && (
            <p id={ids.passErr} role="alert" className="text-[13px] text-red">
              {passErr}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={encBusy} className="btn-accent inline-flex h-10 items-center gap-2 px-4 text-[12px] disabled:opacity-70">
              {encBusy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Lock size={14} aria-hidden />} {t("history.encrypt")}
            </button>
            <button type="button" className={btn} onClick={() => setEncOpen(false)}>
              {t("common.cancel")}
            </button>
          </div>
        </form>
      )}

      {pending && (
        <form onSubmit={importEncrypted} noValidate className="fade-up grid gap-3 border border-line bg-bg-2/40 p-4">
          <p className="break-words text-[13px] text-muted">
            <span className="text-fg" translate="no">
              {pending.name}
            </span>{" "}
            {t("history.pending")}
          </p>
          <input type="text" name="username" autoComplete="username" value="Zcan backup" readOnly hidden />
          <div className="min-w-0 sm:max-w-sm">
            <label htmlFor={ids.importPass} className="label mb-2 block">
              {t("history.passphrase")}
            </label>
            <input
              id={ids.importPass}
              ref={importPassRef}
              type="password"
              name="password"
              autoComplete="current-password"
              value={importPass}
              onChange={(e) => {
                setImportPass(e.target.value);
                setImportErr(null);
              }}
              aria-invalid={importErr ? true : undefined}
              aria-describedby={importErr ? ids.importErr : undefined}
              className={`${input} ${importErr ? "border-red" : "border-line"}`}
            />
          </div>
          {importErr && (
            <p id={ids.importErr} role="alert" className="text-[13px] text-red">
              {importErr}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={importBusy} className="btn-accent inline-flex h-10 items-center gap-2 px-4 text-[12px] disabled:opacity-70">
              {importBusy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <FileUp size={14} aria-hidden />} {t("history.decrypt")}
            </button>
            <button
              type="button"
              className={btn}
              onClick={() => {
                setPending(null);
                setImportErr(null);
              }}
            >
              {t("common.cancel")}
            </button>
          </div>
        </form>
      )}

      {!pending && importErr && (
        <p role="alert" className="text-[13px] text-red">
          {importErr}
        </p>
      )}
      <p aria-live="polite" className={notice ? "border-l-2 border-green bg-surface-2 px-3 py-2 text-[13px] text-fg" : "sr-only"}>
        {notice}
      </p>

      <dialog
        ref={dialogRef}
        aria-labelledby={ids.title}
        onClick={(e) => e.target === dialogRef.current && dialogRef.current?.close()}
        className="m-auto w-[min(460px,calc(100%-32px))] overscroll-contain border border-line-strong bg-surface p-0 text-text backdrop:bg-scrim"
      >
        <form onSubmit={forget} noValidate>
          <div className="panel-head">
            <h2 id={ids.title} className="label">
              {t("history.forget.title")}
            </h2>
          </div>
          <div className="grid gap-3 p-4 sm:p-5">
            <p className="text-[13px] text-fg">
              {summary
                ? t("history.forget.bodyCounts", {
                    counts: [plural("history.count.swap", summary.swaps), plural("history.count.send", summary.batches), plural("history.count.alert", summary.alerts)].join(", "),
                  })
                : t("history.forget.body")}
            </p>
            <p className="text-[13px] text-muted">{t("history.forget.progress")}</p>
            <div>
              <label htmlFor={ids.confirm} className="mb-2 block text-[13px] text-muted">
                {typeBefore}
                <span className="text-fg" translate="no">
                  {CONFIRM_WORD}
                </span>
                {typeAfter}
              </label>
              <input
                id={ids.confirm}
                name="confirm"
                value={confirm}
                onChange={(e) => {
                  setConfirm(e.target.value);
                  setConfirmErr(null);
                }}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                aria-invalid={confirmErr ? true : undefined}
                aria-describedby={confirmErr ? ids.confirmErr : undefined}
                className={`${input} ${confirmErr ? "border-red" : "border-line"}`}
              />
              {confirmErr && (
                <p id={ids.confirmErr} role="alert" className="mt-2 text-[13px] text-red">
                  {confirmErr}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2 border-t border-line p-3">
            <button type="button" className={btn} onClick={() => download(plainBackup(), backupFilename(false))}>
              <Download size={14} aria-hidden /> {t("history.backupFirst")}
            </button>
            <button type="button" className={btn} onClick={() => dialogRef.current?.close()}>
              {t("common.cancel")}
            </button>
            <button type="submit" className="inline-flex h-10 items-center gap-2 bg-red px-4 text-[12px] font-medium uppercase tracking-wider text-bg transition-opacity hover:opacity-90">
              <Trash2 size={14} aria-hidden /> {t("history.forget.title")}
            </button>
          </div>
        </form>
      </dialog>
    </Panel>
  );
}
