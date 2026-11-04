"use client";

import { Check, Copy, Link2, Share2, Sparkles } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { track as trackEvent } from "@/lib/analytics";
import { feedback } from "@/lib/feedback";
import { LinkError, SAMPLE_LINK, cleanLink, type CleanResult } from "@/lib/link-clean";
import { useT } from "@/lib/i18n";
import { useCanShare } from "@/lib/use-can-share";
import { LocalProof, useLocalProof } from "./trust/local-proof";
import { TrackerTrail, useTrackerLabel } from "./tracker-trail";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}


/** Paste a link → see who it reports to → get a clean copy. Never opens or uploads the link. */
export function LinkCleaner({ withTrail = true }: { withTrail?: boolean }) {
  const [value, setValue] = useState("");
  const [result, setResult] = useState<CleanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const t = useT();
  const labelOf = useTrackerLabel();
  const [copied, setCopied] = useState<"link" | "share" | null>(null);
  const inputId = useId();
  const errId = `${inputId}-err`;
  const proof = useLocalProof();

  const run = (raw: string) => {
    proof.start("clean");
    try {
      const r = cleanLink(raw);
      setResult(r);
      setError(null);
      feedback("tap");
      trackEvent("Link cleaned", { kind: r.removed.length ? "trackers" : "clean" });
    } catch (e) {
      setResult(null);
      setError(e instanceof LinkError ? `tools.link.err.${e.code}` : "tools.link.err.generic");
    } finally {
      proof.end();
    }
    setCopied(null);
  };

  const flash = (which: "link" | "share") => {
    setCopied(which);
    setTimeout(() => setCopied((c) => (c === which ? null : c)), 1500);
  };

  const shareText = (r: CleanResult) => {
    const n = r.trackers.length;
    return n > 0
      ? t(n === 1 ? "tools.link.shareText.one" : "tools.link.shareText.other", { n, url: r.cleaned })
      : t("tools.link.shareText.none", { url: r.cleaned });
  };

  const active = useMemo(() => (result ? new Set(result.trackers.map((t) => t.id)) : undefined), [result]);
  const canShare = useCanShare();

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <form
        className="panel"
        onSubmit={(e) => {
          e.preventDefault();
          run(value);
        }}
        noValidate
      >
        <div className="panel-head">
          <h2 className="label flex items-center gap-2">
            <Link2 size={14} className="text-accent" aria-hidden /> {t("shell.tool.link-cleaner")}
          </h2>
          <span className="micro">{t("tools.localMeta")}</span>
        </div>
        <div className="p-4 sm:p-5">
        <p className="text-[13px] text-muted">{t("tools.link.intro")}</p>
        <label htmlFor={inputId} className="sr-only">
          {t("tools.link.inputLabel")}
        </label>
        <textarea
          id={inputId}
          name="link"
          rows={3}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              run(value);
            }
          }}
          placeholder={t("tools.link.placeholder")}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errId : undefined}
          className={`mt-4 w-full resize-none border bg-bg-2 px-3 py-3 text-base leading-relaxed text-fg outline-none placeholder:text-[13px] placeholder:text-subtle focus:border-accent/70 sm:text-[14px] ${
            error ? "border-red" : "border-line"
          }`}
        />
        {error && (
          <p id={errId} role="alert" className="mt-2 text-[13px] text-red">
            {t(error)}
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="submit" className="btn-accent h-10 px-5 text-[12px]">
            {t("tools.link.clean")}
          </button>
          <button
            type="button"
            onClick={() => {
              setValue(SAMPLE_LINK);
              run(SAMPLE_LINK);
            }}
            className="inline-flex h-10 items-center gap-1.5 border border-line px-3 text-[12px] uppercase tracking-wider text-muted transition-colors hover:border-line-strong hover:text-fg"
          >
            <Sparkles size={13} aria-hidden /> {t("tools.link.try")}
          </button>
        </div>

        {result && (
          <div className="fade-up mt-6 border-t border-line pt-5" aria-live="polite">
            <p className="eyebrow">{result.removed.length
                ? t(result.trackers.length === 1 ? "tools.link.removed.one" : "tools.link.removed.other", { n: result.trackers.length })
                : t("tools.link.alreadyClean")}</p>
            <div className="mt-3 border border-accent/40 bg-bg-2 p-3">
              <span translate="no" className="block min-w-0 break-all text-[13px] leading-relaxed text-fg">
                {result.cleaned}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={async () => {
                  if (await copyText(result.cleaned)) flash("link");
                }}
                className="inline-flex h-10 items-center gap-2 border border-line-strong px-3 text-[12px] uppercase tracking-wider text-fg transition-colors hover:border-fg/40"
              >
                {copied === "link" ? <Check size={14} className="text-green" aria-hidden /> : <Copy size={14} aria-hidden />}
                {copied === "link" ? t("common.copied") : t("tools.link.copyClean")}
              </button>
              <button
                type="button"
                onClick={async () => {
                  const text = shareText(result);
                  trackEvent("Result shared", { tool: "link" });
                  if (canShare) {
                    try {
                      await navigator.share({ text });
                      return;
                    } catch (e) {
                      if (e instanceof DOMException && e.name === "AbortError") return;
                    }
                  }
                  if (await copyText(text)) flash("share");
                }}
                className="inline-flex h-10 items-center gap-2 border border-line px-3 text-[12px] uppercase tracking-wider text-muted transition-colors hover:border-line-strong hover:text-fg"
              >
                {copied === "share" ? <Check size={14} className="text-green" aria-hidden /> : <Share2 size={14} aria-hidden />}
                {copied === "share" ? t("tools.link.copiedResult") : t("tools.link.shareResult")}
              </button>
            </div>
            {result.removed.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {result.removed.map((r, i) => (
                  <li
                    key={`${r.key}-${i}`}
                    className="max-w-full truncate border border-line bg-surface-2 px-2 py-1 text-[11px] text-muted line-through decoration-accent"
                    title={`${r.key}${r.key === "redirect" || r.key === "#" ? "" : `=${r.value}`} → ${labelOf(r.tracker)}`}
                  >
                    {r.key === "redirect" ? t("tools.tracker.redirect") : r.key}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <LocalProof run={proof.run} tool="link" />
        </div>
      </form>

      {withTrail && (
        <section className="panel flex flex-col" aria-label={t("tools.trail.title")}>
          <div className="panel-head">
            <h2 className="label min-w-0 truncate">{t("tools.trail.title")}</h2>
            <span className="micro min-w-0 truncate">{result ? t("tools.trail.reporting", { n: result.trackers.length }) : t("tools.trail.tagline")}</span>
          </div>
          <div className="dots flex flex-1 items-center px-2 py-4">
            <TrackerTrail active={active} />
          </div>
          {result && result.trackers.length > 0 && (
            <ul className="flex flex-wrap justify-center gap-2 border-t border-line p-3 sm:hidden">
              {result.trackers.map((tr) => (
                <li key={tr.id} className="border border-accent/40 bg-accent/10 px-2.5 py-1 font-mono text-[12px] text-fg">
                  {labelOf(tr)}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
