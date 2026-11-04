"use client";

import { Check, Eye, EyeOff, KeyRound, LoaderCircle, ShieldAlert, TriangleAlert } from "lucide-react";
import { useId, useRef, useState } from "react";
import { Panel } from "@/components/hud/panel";
import { track } from "@/lib/analytics";
import { useT } from "@/lib/i18n";
import { BTN_GHOST } from "./tool-ui";

/* ------------------------------------------------------------------ */
/* Strength estimate — rough, dependency-free                          */
/* ------------------------------------------------------------------ */

const COMMON = [
  "password", "passw0rd", "123456", "12345678", "qwerty", "letmein", "welcome", "admin", "iloveyou", "monkey", "dragon",
  "football", "baseball", "master", "sunshine", "princess", "login", "abc123", "starwars", "shadow", "trustno1", "superman",
  "hello", "freedom", "whatever", "michael", "batman", "secret", "charlie", "summer", "winter", "bitcoin", "zcash", "crypto",
];
const KEYBOARD = ["qwertyuiop", "asdfghjkl", "zxcvbnm", "1qaz2wsx", "qwertz", "azerty", "1234567890"];
const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s", "!": "i" };

export const STRENGTH_LABELS = ["Very weak", "Weak", "Fair", "Strong", "Very strong"] as const;

/** English issue text by stable id (the UI translates by id). */
export const STRENGTH_ISSUES = {
  short: "Shorter than 8 characters.",
  length: "12 or more characters is much harder to crack.",
  common: "Contains a common password or word — swapping letters for numbers doesn't help.",
  repeat: "Repeated characters (like aaa or 111).",
  sequence: "Sequences or keyboard runs (abcd, 1234, qwer).",
  year: "Contains a year — dates are among the first guesses.",
  pattern: "Word + numbers (+ symbol) is the first pattern crackers try.",
  oneKind: "Only one kind of character. Mix in more, or use a longer passphrase.",
} as const;
export type StrengthIssue = keyof typeof STRENGTH_ISSUES;

function hasSequence(s: string, run = 4): boolean {
  let up = 1;
  let down = 1;
  for (let i = 1; i < s.length; i++) {
    const d = s.charCodeAt(i) - s.charCodeAt(i - 1);
    up = d === 1 ? up + 1 : 1;
    down = d === -1 ? down + 1 : 1;
    if (up >= run || down >= run) return true;
  }
  return false;
}

export function estimateStrength(pw: string): { score: 0 | 1 | 2 | 3 | 4; bits: number; issues: string[]; issueIds: StrengthIssue[] } {
  const chars = [...pw];
  const len = chars.length;
  const lower = pw.toLowerCase();
  const deleet = [...lower].map((c) => LEET[c] ?? c).join("");
  const issueIds: StrengthIssue[] = [];

  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/\d/.test(pw)) pool += 10;
  if (/[!-/:-@[-`{-~ ]/.test(pw)) pool += 33;
  if (/[^\x00-\x7f]/.test(pw)) pool += 100;
  // Runs like "aaaa" add almost nothing, so collapse them before counting.
  const effective = [...pw.replace(/(.)\1{2,}/gu, "$1$1")].length;
  let bits = effective * Math.log2(Math.max(pool, 1));

  if (len < 8) issueIds.push("short");
  else if (len < 12) issueIds.push("length");

  const common = COMMON.find((w) => deleet.includes(w));
  if (common) {
    bits = Math.min(bits, 12 + (len - common.length) * 4);
    issueIds.push("common");
  }
  if (/(.)\1{2,}/u.test(pw)) issueIds.push("repeat");
  if (hasSequence(lower) || KEYBOARD.some((row) => [0, 1, 2, 3, 4, 5, 6].some((i) => row.length - i >= 4 && lower.includes(row.slice(i, i + 4))))) {
    bits -= 10;
    issueIds.push("sequence");
  }
  if (/(19|20)\d\d/.test(pw)) {
    bits -= 6;
    issueIds.push("year");
  }
  if (/^[A-Z]?[a-z]+\d+[!-/:-@[-`{-~]?$/.test(pw)) {
    bits -= 8;
    issueIds.push("pattern");
  }
  if (pool > 0 && pool <= 26 && len < 16) issueIds.push("oneKind");

  bits = Math.max(0, Math.round(bits));
  const score = (bits < 28 ? 0 : bits < 40 ? 1 : bits < 60 ? 2 : bits < 80 ? 3 : 4) as 0 | 1 | 2 | 3 | 4;
  return {
    score: common && len < 12 ? (Math.min(score, 1) as 0 | 1) : score,
    bits,
    issues: issueIds.map((id) => STRENGTH_ISSUES[id]),
    issueIds,
  };
}

/* ------------------------------------------------------------------ */
/* Pwned Passwords (k-anonymity)                                       */
/* ------------------------------------------------------------------ */

async function sha1Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

async function pwnedCount(pw: string, signal: AbortSignal): Promise<{ prefix: string; count: number; candidates: number }> {
  const hash = await sha1Hex(pw);
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);
  const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
    headers: { "Add-Padding": "true" },
    cache: "no-store",
    referrerPolicy: "no-referrer",
    signal,
  });
  if (!res.ok) throw new Error(String(res.status));
  let count = 0;
  let candidates = 0;
  for (const line of (await res.text()).split("\n")) {
    const [s, c] = line.trim().split(":");
    const n = Number(c);
    if (!s || !n) continue; // padding rows have a count of 0
    candidates++;
    if (s === suffix) count = n;
  }
  return { prefix, count, candidates };
}

type Result =
  | { status: "loading" }
  | { status: "done"; prefix: string; count: number; candidates: number }
  | { status: "error" };

const nf = new Intl.NumberFormat();
const BAR_TONE = ["bg-red", "bg-red", "bg-warn", "bg-green", "bg-green"];
const TEXT_TONE = ["text-red", "text-red", "text-warn", "text-green", "text-green"];

/** Checks a password against known breaches via k-anonymity. Only 5 hex chars of its SHA-1 hash leave the device. */
export function PasswordCheck() {
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputId = useId();
  const hintId = `${inputId}-hint`;
  const t = useT();

  const strength = pw ? estimateStrength(pw) : null;

  const check = async () => {
    abortRef.current?.abort();
    if (!pw) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setResult({ status: "loading" });
    try {
      const r = await pwnedCount(pw, ctrl.signal);
      if (!ctrl.signal.aborted) {
        setResult({ status: "done", ...r });
        track("Password checked");
      }
    } catch {
      if (!ctrl.signal.aborted) setResult({ status: "error" });
    }
  };

  const clear = () => {
    abortRef.current?.abort();
    setPw("");
    setResult(null);
  };

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_380px]">
      <form
        className="panel min-w-0"
        onSubmit={(e) => {
          e.preventDefault();
          check();
        }}
        autoComplete="off"
        noValidate
      >
        <div className="panel-head">
          <h2 className="label flex items-center gap-2">
            <KeyRound size={14} className="text-accent" aria-hidden /> {t("shell.tool.passwords")}
          </h2>
          <span className="micro">{t("tools.pw.meta")}</span>
        </div>
        <div className="p-4 sm:p-5">
          <label htmlFor={inputId} className="text-[13px] text-muted">
            {t("tools.pw.inputLabel")}
          </label>
          <div className="mt-2 flex items-stretch border border-line bg-bg-2 focus-within:border-accent/70">
            <input
              id={inputId}
              name="password-check"
              type={show ? "text" : "password"}
              value={pw}
              onChange={(e) => {
                setPw(e.target.value);
                abortRef.current?.abort();
                setResult(null);
              }}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              data-1p-ignore
              data-lpignore="true"
              data-bwignore
              aria-describedby={hintId}
              placeholder={t("tools.pw.placeholder")}
              className="h-12 min-w-0 flex-1 bg-transparent px-3 font-mono text-base text-fg outline-none placeholder:text-[13px] placeholder:text-subtle sm:text-[14px]"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              aria-label={show ? t("tools.pw.hide") : t("tools.pw.show")}
              aria-pressed={show}
              className="inline-flex w-12 shrink-0 items-center justify-center border-l border-line text-muted hover:bg-surface-3 hover:text-fg"
            >
              {show ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
            </button>
          </div>
          <p id={hintId} className="mt-2 text-[12px] leading-relaxed text-subtle">
            {t("tools.pw.hint")}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="submit" disabled={result?.status === "loading"} className="btn-accent inline-flex h-10 items-center gap-2 px-5 text-[12px] disabled:opacity-80">
              {result?.status === "loading" && <LoaderCircle size={14} className="animate-spin-slow" aria-hidden />}
              {t("tools.pw.check")}
            </button>
            {pw && (
              <button type="button" onClick={clear} className={BTN_GHOST}>
                {t("tools.clear")}
              </button>
            )}
          </div>

          {strength && (
            <div className="mt-6 border-t border-line pt-5">
              <div className="flex items-baseline justify-between gap-3">
                <p className="eyebrow">{t("tools.pw.strength")}</p>
                <p className={`text-right text-[12px] uppercase tracking-wider ${TEXT_TONE[strength.score]}`}>{t(`tools.pw.score.${strength.score}`)}</p>
              </div>
              <div
                className="mt-2 grid grid-cols-5 gap-1"
                role="meter"
                aria-label={t("tools.pw.meter")}
                aria-valuemin={0}
                aria-valuemax={4}
                aria-valuenow={strength.score}
                aria-valuetext={t(`tools.pw.score.${strength.score}`)}
              >
                {[0, 1, 2, 3, 4].map((i) => (
                  <span key={i} className={`h-1.5 ${i <= strength.score ? BAR_TONE[strength.score] : "bg-surface-3"}`} />
                ))}
              </div>
              <p className="mt-2 text-[12px] text-subtle">
                <span className="tabular">≈{nf.format(strength.bits)}</span>{" "}
                {t("tools.pw.stats", { chars: nf.format([...pw].length) })}
              </p>
              {strength.issueIds.length > 0 && (
                <ul className="mt-3 grid gap-1.5 text-[13px] text-muted">
                  {strength.issueIds.map((i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span aria-hidden className="mt-[7px] size-1 shrink-0 bg-warn" />
                      {t(`tools.pw.issue.${i}`)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div aria-live="polite">
            {result?.status === "done" &&
              (result.count > 0 ? (
                <div className="fade-up mt-5 border border-red/50 bg-red/[0.07] p-4">
                  <p className="flex items-center gap-2 font-medium text-red">
                    <ShieldAlert size={16} aria-hidden /> {t("tools.pw.found")}
                  </p>
                  <p className="mt-2 text-[13px] leading-relaxed text-fg">
                    {t("tools.pw.foundPre")} <span className="num text-[18px] font-normal">{nf.format(result.count)}</span>{" "}
                    {t(result.count === 1 ? "tools.pw.foundPost.one" : "tools.pw.foundPost.other")}
                  </p>
                </div>
              ) : (
                <div className="fade-up mt-5 border border-green/40 bg-green/[0.06] p-4">
                  <p className="flex items-center gap-2 font-medium text-green">
                    <Check size={16} aria-hidden /> {t("tools.pw.notFound")}
                  </p>
                  <p className="mt-2 text-[13px] leading-relaxed text-muted">
                    {t("tools.pw.notFoundNote")}
                  </p>
                </div>
              ))}
            {result?.status === "done" && (
              <p className="mt-3 text-[12px] leading-relaxed text-subtle">
                {t("tools.pw.sent")} <code translate="no" className="text-fg">{result.prefix}</code>.{" "}
                {t("tools.pw.compared", { n: nf.format(result.candidates) })}
              </p>
            )}
            {result?.status === "error" && (
              <p role="alert" className="mt-5 flex items-start gap-2 text-[13px] text-red">
                <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden /> {t("tools.pw.err")}
              </p>
            )}
          </div>
        </div>
      </form>

      <Panel title={t("tools.pw.how.title")} meta={<span>{t("tools.pw.how.meta")}</span>} marks>
        <ol className="grid gap-4 text-[13px] leading-relaxed text-muted">
          <li>
            <span className="text-fg">{t("tools.pw.how.1.title")}</span> {t("tools.pw.how.1.body")}
          </li>
          <li>
            <span className="text-fg">{t("tools.pw.how.2.title")}</span> {t("tools.pw.how.2.body")}
          </li>
          <li>
            <span className="text-fg">{t("tools.pw.how.3.title")}</span> {t("tools.pw.how.3.body")}
          </li>
        </ol>
        <p className="mt-4 border-t border-line pt-4 text-[12px] leading-relaxed text-subtle">
          {t("tools.pw.how.footer")}
        </p>
      </Panel>
    </div>
  );
}
