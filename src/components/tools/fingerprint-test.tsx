"use client";

import { CircleCheck, Fingerprint, LoaderCircle, RotateCcw, TriangleAlert, Wrench } from "lucide-react";
import { useState } from "react";
import { ONE_IN_MAX, STEP_COUNT, UNIQUE_BITS, rarity, runFingerprint, type FingerprintReport, type Progress, type Signal } from "@/lib/fingerprint";
import { ShareResultButton } from "@/components/share/share-result-button";
import { track } from "@/lib/analytics";
import { useLocale, useT } from "@/lib/i18n";

type State = { kind: "idle" } | { kind: "running"; progress: Progress } | { kind: "done"; report: FingerprintReport } | { kind: "error" };
type TFn = ReturnType<typeof useT>;

const BAND_TONE = ["", "text-green", "text-warn", "text-accent", "text-accent"] as const;

/** Plain-language text for a signal's value. Raw values (UA strings, IPs, GPU names) are shown as they are. */
function signalValue(s: Signal, t: TFn, locale: string): string {
  const v = s.vars ?? {};
  const k = (key: string, vars?: Record<string, string | number>) => t(`tools2.fp.v.${key}`, vars);
  switch (s.code) {
    case undefined:
      return s.value;
    case "hw":
      return [v.cores ? k("cores", { n: v.cores }) : k("coresHidden"), v.mem ? k("ram", { n: v.mem }) : k("ramHidden")].join(" · ");
    case "touch":
      return [k("touch", { n: v.n }), v.coarse ? k("touchScreen") : ""].filter(Boolean).join(" · ");
    case "prefs":
      return [k(v.cookies ? "cookiesOn" : "cookiesOff"), k(v.dnt ? "dntOn" : "dntOff"), k(v.gpc ? "gpcOn" : "gpcOff")].join(" · ");
    case "display":
      return [k(v.dark ? "dark" : "light"), v.reduced && k("reduced"), v.contrast && k("contrast"), v.forced && k("forced")].filter(Boolean).join(" · ");
    case "storage": {
      const parts = [v.local && k("local"), v.session && k("session"), v.idb && "IndexedDB"].filter(Boolean).join(", ") || k("none");
      const quota = Number(v.quota);
      const gb = new Intl.NumberFormat(locale, { style: "unit", unit: "gigabyte", maximumFractionDigits: 0 });
      return quota ? `${parts} · ${k("quota", { size: gb.format(quota / 1e9) })}` : parts;
    }
    default:
      return k(s.code, v);
  }
}

function signalLabel(s: Signal, t: TFn) {
  return t(`tools2.fp.label.${s.id === "webgl" && s.code === "gpu" ? "webglGpu" : s.id}`);
}

/** Local browser-fingerprint self-test: what makes this browser recognizable, and how to blend in. */
export function FingerprintTest() {
  const [state, setState] = useState<State>({ kind: "idle" });
  const t = useT();

  const run = async () => {
    setState({ kind: "running", progress: { done: 0, total: STEP_COUNT } });
    try {
      const report = await runFingerprint((progress) => setState({ kind: "running", progress }));
      setState({ kind: "done", report });
      track("Fingerprint tested");
    } catch {
      setState({ kind: "error" });
    }
  };

  const running = state.kind === "running";

  return (
    <div className="grid min-w-0 gap-3">
      <section className="panel min-w-0" aria-label={t("tools2.fp.title")}>
        <div className="panel-head">
          <h2 className="label flex min-w-0 items-center gap-2">
            <Fingerprint size={14} className="shrink-0 text-accent" aria-hidden /> <span className="truncate">{t("tools2.fp.title")}</span>
          </h2>
          <span className="micro truncate">{t("tools2.fp.local")}</span>
        </div>
        <div className="p-4 sm:p-5">
          <p className="max-w-2xl text-[13px] leading-relaxed text-muted">{t("tools2.fp.intro")}</p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={run}
              disabled={running}
              className="btn-accent inline-flex h-11 items-center gap-2 px-5 text-[12px] disabled:opacity-80"
            >
              {running ? (
                <LoaderCircle size={16} className="animate-spin-slow" aria-hidden />
              ) : state.kind === "done" ? (
                <RotateCcw size={15} aria-hidden />
              ) : null}
              {state.kind === "done" ? t("tools2.fp.again") : t("tools2.fp.run")}
            </button>
            {state.kind === "idle" && <span className="text-[12px] text-subtle">{t("tools2.fp.takes")}</span>}
          </div>

          {running && <ProgressBar progress={state.progress} />}

          {state.kind === "error" && (
            <p role="alert" className="mt-4 flex items-start gap-2 text-[13px] text-red">
              <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden /> {t("tools2.fp.error")}
            </p>
          )}

          {state.kind === "done" && <Score report={state.report} />}
        </div>
      </section>

      {state.kind === "done" && (
        <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Signals signals={state.report.signals} />
          <Fixes report={state.report} />
        </div>
      )}
    </div>
  );
}

function ProgressBar({ progress }: { progress: Progress }) {
  const t = useT();
  const pct = Math.round((progress.done / progress.total) * 100);
  return (
    <div className="mt-5 max-w-xl">
      <div className="flex items-baseline justify-between gap-3 text-[12px]">
        <span className="truncate text-muted" aria-live="polite">
          {progress.step ? t("tools2.fp.checking", { what: t(`tools2.fp.step.${progress.step}`) }) : t("tools2.fp.starting")}
        </span>
        <span className="tabular shrink-0 text-subtle">
          {progress.done}/{progress.total}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={t("tools2.fp.progress")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="hatch mt-2 h-1.5 overflow-hidden border border-line"
      >
        <div
          className="h-full origin-left bg-accent transition-transform duration-200 ease-out motion-reduce:transition-none"
          style={{ transform: `scaleX(${pct / 100})` }}
        />
      </div>
    </div>
  );
}

function Score({ report }: { report: FingerprintReport }) {
  const t = useT();
  const locale = useLocale();
  const fill = Math.min(1, report.bits / UNIQUE_BITS);
  const bits = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(report.bits);
  const oneIn =
    report.oneIn >= ONE_IN_MAX
      ? t("tools2.fp.unique")
      : t("tools2.fp.oneIn", {
          n: new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(Math.round(report.oneIn)),
        });
  return (
    <div className="fade-up mt-6 grid gap-5 border-t border-line pt-5 md:grid-cols-[auto_minmax(0,1fr)]" aria-live="polite">
      <div>
        <p className="micro">{t("tools2.fp.identifiability")}</p>
        <p className={`num mt-2 text-[36px] leading-tight sm:text-[44px] ${BAND_TONE[report.band.level]}`}>{t(`tools2.fp.band.${report.band.level}`)}</p>
        <p className="mt-2 text-[13px] text-muted">
          <span className="tabular text-fg">{t("tools2.fp.bits", { n: bits })}</span> · {oneIn}
        </p>
        <ShareResultButton result={{ kind: "fingerprint", n: report.oneIn }} className="mt-4" />
      </div>
      <div className="min-w-0 self-end">
        <div className="hatch relative h-3 border border-line" aria-hidden>
          <div className="absolute inset-y-0 left-0 origin-left bg-accent/80" style={{ width: "100%", transform: `scaleX(${fill})` }} />
          {[0.25, 0.5, 0.75].map((x) => (
            <span key={x} className="absolute inset-y-0 w-px bg-bg" style={{ left: `${x * 100}%` }} />
          ))}
        </div>
        <div className="micro mt-1.5 flex justify-between gap-3">
          <span>{t("tools2.fp.blends")}</span>
          <span className="text-right">{t("tools2.fp.uniqueScale", { n: UNIQUE_BITS })}</span>
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-subtle">
          {t("tools2.fp.estimate")} {t("tools2.fp.hash")} <span className="font-mono text-muted" translate="no">{report.hash}</span>{" "}
          {t("tools2.fp.hashTip")}
        </p>
      </div>
    </div>
  );
}

function Meter({ level }: { level: number }) {
  return (
    <span className="flex gap-0.5" aria-hidden>
      {[1, 2, 3, 4].map((i) => (
        <span key={i} className={`h-2.5 w-1.5 ${i <= level ? (level >= 3 ? "bg-accent" : "bg-warn") : "bg-surface-3"}`} />
      ))}
    </span>
  );
}

function Signals({ signals }: { signals: Signal[] }) {
  const t = useT();
  const locale = useLocale();
  return (
    <section className="panel min-w-0" aria-label={t("tools2.fp.signals")}>
      <div className="panel-head">
        <h2 className="label min-w-0">{t("tools2.fp.reveals")}</h2>
        <span className="micro text-right">{t("tools2.fp.signalsMeta", { n: signals.length })}</span>
      </div>
      <ul className="divide-y divide-line">
        {signals.map((s) => {
          const r = rarity(s.bits);
          const value = signalValue(s, t, locale);
          return (
            <li key={s.id} className="grid min-w-0 gap-1.5 px-4 py-3 sm:grid-cols-[150px_minmax(0,1fr)_auto] sm:items-start sm:gap-4">
              <p className="flex items-center gap-2 text-[12px] uppercase tracking-wide text-subtle">
                {s.status === "good" ? (
                  <CircleCheck size={14} className="shrink-0 text-green" aria-label={t("tools2.fp.protected")} />
                ) : s.status === "bad" ? (
                  <TriangleAlert size={14} className="shrink-0 text-accent" aria-label={t("tools2.fp.leaking")} />
                ) : null}
                <span className="min-w-0 break-words">{signalLabel(s, t)}</span>
              </p>
              <div className="min-w-0">
                <p className="line-clamp-2 break-words font-mono text-[13px] text-fg" title={value}>
                  {value}
                </p>
                {s.note && <p className="mt-0.5 text-[12px] leading-relaxed text-subtle">{t(`tools2.fp.note.${s.note}`)}</p>}
              </div>
              <p className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted sm:justify-end">
                <Meter level={r} />
                <span className="min-w-20 sm:text-right">{t(`tools2.fp.rarity.${r}`)}</span>
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Fixes({ report }: { report: FingerprintReport }) {
  const t = useT();
  return (
    <section className="panel marks min-w-0 self-start" aria-label={t("tools2.fp.fixes")}>
      <div className="panel-head">
        <h2 className="label flex items-center gap-2">
          <Wrench size={14} className="shrink-0 text-accent" aria-hidden /> {t("tools2.fp.fixes")}
        </h2>
      </div>
      <ol className="grid gap-4 p-4">
        {report.fixes.map((f, i) => (
          <li key={f.id} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
            <span className="tabular text-[12px] text-accent">{String(i + 1).padStart(2, "0")}</span>
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-fg">{t(`tools2.fp.fix.${f.id}.title`)}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-muted">{t(`tools2.fp.fix.${f.id}.detail`)}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="border-t border-line px-4 py-3 text-[12px] leading-relaxed text-subtle">
        {t("tools2.fp.goal")}
      </p>
    </section>
  );
}
