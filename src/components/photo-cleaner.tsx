"use client";

import { Check, Download, ImageIcon, LoaderCircle, MapPin, Share2, ShieldCheck, TriangleAlert, Upload, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { ShareResultButton } from "@/components/share/share-result-button";
import { track as trackEvent } from "@/lib/analytics";
import { feedback } from "@/lib/feedback";
import { useT } from "@/lib/i18n";
import { cleanPhoto, inspectPhoto, type Inspection, type MetaItem } from "@/lib/photo-meta";
import { useCanShare } from "@/lib/use-can-share";
import { LocalProof, useLocalProof } from "./trust/local-proof";

type State =
  | { kind: "empty" }
  | { kind: "reading"; name: string }
  | { kind: "ready"; file: File; url: string; meta: Inspection }
  | { kind: "cleaning"; file: File; url: string; meta: Inspection }
  | { kind: "clean"; file: File; url: string; meta: Inspection; out: Blob; outUrl: string; outMeta: Inspection }
  /** `message` is an i18n key. */
  | { kind: "error"; message: string };

const MAX_BYTES = 40 * 1024 * 1024;
const mb = new Intl.NumberFormat(undefined, { style: "unit", unit: "megabyte", maximumFractionDigits: 1 });
const kb = new Intl.NumberFormat(undefined, { style: "unit", unit: "kilobyte", maximumFractionDigits: 0 });
const formatSize = (bytes: number) => (bytes >= 1_048_576 ? mb.format(bytes / 1_048_576) : kb.format(Math.max(1, bytes / 1024)));

/** Share a cleaner photo: show what a photo leaks, then make a JPEG copy without EXIF, GPS, XMP or IPTC. */
export function PhotoCleaner() {
  const [state, setState] = useState<State>({ kind: "empty" });
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const canShare = useCanShare();
  const t = useT();
  const proof = useLocalProof();

  // Release object URLs when they're replaced or on unmount.
  const urls = useRef<string[]>([]);
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);
  const track = (u: string) => (urls.current.push(u), u);

  const load = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/") && !/\.(heic|heif)$/i.test(file.name)) {
      setState({ kind: "error", message: "tools.photo.err.notImage" });
      return;
    }
    if (file.size > MAX_BYTES) {
      setState({ kind: "error", message: "tools.photo.err.tooBig" });
      return;
    }
    setState({ kind: "reading", name: file.name });
    proof.start("read");
    try {
      const meta = await inspectPhoto(file);
      setState({ kind: "ready", file, url: track(URL.createObjectURL(file)), meta });
    } catch {
      setState({ kind: "error", message: "tools.photo.err.read" });
    } finally {
      proof.end();
    }
  };

  const clean = async () => {
    if (state.kind !== "ready") return;
    setState({ ...state, kind: "cleaning" });
    proof.start("clean");
    try {
      const out = await cleanPhoto(state.file);
      const outMeta = await inspectPhoto(out);
      setState({ kind: "clean", file: state.file, url: state.url, meta: state.meta, out, outUrl: track(URL.createObjectURL(out)), outMeta });
      feedback("tap");
      trackEvent("Photo cleaned");
    } catch {
      setState({
        kind: "error",
        message: "tools.photo.err.decode",
      });
    } finally {
      proof.end();
    }
  };

  const reset = () => {
    setState({ kind: "empty" });
    proof.reset();
    if (inputRef.current) inputRef.current.value = "";
  };

  const outName = (name: string) => `${name.replace(/\.[^.]+$/, "") || "photo"}-clean.jpg`;

  return (
    <section className="panel" aria-label={t("shell.tool.photo-cleaner")}>
      <div className="panel-head">
        <h2 className="label flex items-center gap-2">
          <ImageIcon size={14} className="text-accent" aria-hidden /> {t("shell.tool.photo-cleaner")}
        </h2>
        <span className="micro">{t("tools.localMeta")}</span>
      </div>
      <div className="p-4 sm:p-5">
      <p className="text-[13px] leading-relaxed text-muted">
        {t("tools.photo.intro")}
      </p>

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/*,.heic,.heif"
        className="sr-only"
        onChange={(e) => load(e.target.files?.[0])}
      />

      {(state.kind === "empty" || state.kind === "error" || state.kind === "reading") && (
        <label
          htmlFor={inputId}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            load(e.dataTransfer.files?.[0]);
          }}
          className={`mt-4 flex min-h-44 cursor-pointer flex-col items-center justify-center gap-2 border border-dashed px-4 py-8 text-center transition-colors ${
            dragging ? "border-accent bg-accent/[0.06]" : "border-line-strong hover:border-accent/60"
          }`}
        >
          {state.kind === "reading" ? (
            <>
              <LoaderCircle className="animate-spin-slow text-muted" aria-hidden />
              <span className="min-w-0 break-all text-sm text-muted">{t("tools.photo.reading", { name: state.name })}</span>
            </>
          ) : (
            <>
              <Upload className="text-accent" aria-hidden />
              <span className="font-medium text-fg">{t("tools.photo.choose")}</span>
              <span className="text-sm text-subtle">{t("tools.photo.drop")}</span>
            </>
          )}
        </label>
      )}

      {state.kind === "error" && (
        <p role="alert" className="mt-3 flex items-start gap-2 text-[13px] text-red">
          <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden /> {t(state.message)}
        </p>
      )}

      {(state.kind === "ready" || state.kind === "cleaning" || state.kind === "clean") && (
        <div className="fade-up mt-4">
          <div className="flex items-start gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
            <img
              src={state.kind === "clean" ? state.outUrl : state.url}
              alt={t("tools.photo.previewAlt")}
              className="size-24 shrink-0 border border-line object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-fg">{state.file.name}</p>
              <p className="tabular text-sm text-subtle">{formatSize(state.file.size)}</p>
              <button type="button" onClick={reset} className="mt-1 inline-flex h-8 items-center gap-1 text-sm text-muted hover:text-fg">
                <X size={14} aria-hidden /> {t("tools.photo.chooseAnother")}
              </button>
            </div>
          </div>

          <MetaList meta={state.meta} />

          {state.kind !== "clean" ? (
            <button
              type="button"
              onClick={clean}
              disabled={state.kind === "cleaning"}
              className="mt-5 inline-flex h-11 items-center gap-2 btn-accent px-5 text-[12px] disabled:opacity-80"
            >
              {state.kind === "cleaning" && <LoaderCircle size={16} className="animate-spin-slow" aria-hidden />}
              {t("tools.photo.remove")}
            </button>
          ) : (
            <div className="fade-up mt-5 border border-green/40 bg-green/[0.06] p-4" aria-live="polite">
              <p className="flex items-center gap-2 font-medium text-green">
                <ShieldCheck size={18} aria-hidden />
                {state.outMeta.items.length === 0
                  ? t("tools.photo.ready.none")
                  : t(state.outMeta.items.length === 1 ? "tools.photo.ready.one" : "tools.photo.ready.other", { n: state.outMeta.items.length })}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <a
                  href={state.outUrl}
                  download={outName(state.file.name)}
                  className="inline-flex h-10 items-center gap-2 bg-fg px-4 text-sm font-semibold text-bg hover:bg-fg/90"
                >
                  <Download size={15} aria-hidden /> {t("tools.photo.save")}
                </a>
                {canShare && (
                  <button
                    type="button"
                    onClick={() => {
                      const f = new File([state.out], outName(state.file.name), { type: "image/jpeg" });
                      navigator.share({ files: [f] }).catch(() => {});
                    }}
                    className="inline-flex h-10 items-center gap-2 border border-line-strong px-4 text-sm font-medium text-fg hover:border-fg/40"
                  >
                    <Share2 size={15} aria-hidden /> {t("common.share")}
                  </button>
                )}
                {state.meta.items.length > state.outMeta.items.length && (
                  <ShareResultButton
                    result={{ kind: "photo", n: state.meta.items.length - state.outMeta.items.length, gps: Boolean(state.meta.gps) && !state.outMeta.gps }}
                  />
                )}
              </div>
              <p className="mt-3 text-xs text-subtle">
                {t("tools.photo.note")}
              </p>
            </div>
          )}
        </div>
      )}
      <LocalProof run={proof.run} tool="photo" />
      </div>
    </section>
  );
}

function MetaList({ meta }: { meta: Inspection }) {
  const t = useT();
  const label = (m: MetaItem) => (m.labelId ? t(`tools.photo.field.${m.labelId}`) : m.label);
  const value = (m: MetaItem) => (m.valueId ? t(`tools.photo.value.${m.valueId}`, m.valueVars) : m.value);
  if (meta.items.length === 0) {
    return (
      <p className="mt-4 flex items-center gap-2 text-sm text-muted">
        <Check size={15} className="text-green" aria-hidden />
        {meta.format === "other" ? t("tools.photo.noInspect") : t("tools.photo.noMeta")}
      </p>
    );
  }
  return (
    <div className="mt-4">
      {meta.gps && (
        <p className="mb-3 flex items-start gap-2 border-l-2 border-accent bg-accent/10 px-3 py-2.5 text-[13px] text-fg">
          <MapPin size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden />
          {t("tools.photo.gps")} <span className="tabular font-mono">{meta.gps.lat.toFixed(4)}, {meta.gps.lon.toFixed(4)}</span>
        </p>
      )}
      <p className="eyebrow">{t("tools.photo.found")}</p>
      <dl className="mt-2 divide-y divide-line border border-line">
        {meta.items.map((m, i) => (
          <div key={`${m.label}-${i}`} className="flex items-center justify-between gap-4 px-3 py-2 text-sm">
            <dt className="flex min-w-0 items-center gap-2 text-muted">
              <span className="w-10 bg-surface-3 px-1.5 py-0.5 text-center text-[10px] text-subtle">{m.group}</span>
              <span className="min-w-0 break-words">{label(m)}</span>
            </dt>
            <dd className={`min-w-0 truncate text-right font-mono text-[13px] ${m.sensitive ? "text-accent" : "text-fg"}`}>{value(m)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
