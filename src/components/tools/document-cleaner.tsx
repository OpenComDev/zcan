"use client";

import { Check, Download, FileText, Info, LoaderCircle, Share2, ShieldCheck, TriangleAlert, Upload, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { track as trackEvent } from "@/lib/analytics";
import type { CleanOptions, DocFlag, DocInspection, DocItem, DocKind } from "@/lib/doc-meta";
import { useLocale, useT } from "@/lib/i18n";
import { useCanShare } from "@/lib/use-can-share";
import { LocalProof, useLocalProof } from "@/components/trust/local-proof";

type TFn = ReturnType<typeof useT>;

// pdf-lib + jszip are heavy, so they stay out of the page bundle. They're fetched once the page is idle
// (or when a file is chosen, if that comes first), so the service worker has them cached for offline use.
const lib = () => import("@/lib/doc-meta");
/** Translation key for a failure: the library's own reason when it gave one, else `fallback`. */
const errorKey = async (e: unknown, fallback: string) => {
  const { DocError } = await lib();
  return e instanceof DocError ? `tools2.doc.err.${e.code}` : fallback;
};

const MAX_BYTES = 50 * 1024 * 1024;
const ACCEPT =
  ".pdf,.docx,.xlsx,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.presentationml.presentation";
/** `report.pdf` → `report-clean.pdf` */
const cleanName = (name: string, ext: string) => `${name.replace(/\.[^.]+$/, "") || "document"}-clean.${ext}`;

type Loaded = { file: File; meta: DocInspection };
type State =
  | { kind: "empty" }
  | { kind: "reading"; name: string }
  | ({ kind: "ready" } & Loaded)
  | ({ kind: "cleaning" } & Loaded)
  | ({ kind: "clean"; out: Blob; outUrl: string; outName: string; outMeta: DocInspection } & Loaded)
  | { kind: "error"; key: string };

const formatSize = (bytes: number, locale: string) =>
  bytes >= 1_048_576
    ? new Intl.NumberFormat(locale, { style: "unit", unit: "megabyte", maximumFractionDigits: 1 }).format(bytes / 1_048_576)
    : new Intl.NumberFormat(locale, { style: "unit", unit: "kilobyte", maximumFractionDigits: 0 }).format(Math.max(1, bytes / 1024));

/** Display text for one found field, in the reader's language. Raw file values stay as they are. */
function itemLabel(m: DocItem, t: TFn) {
  return m.custom ? m.label : t(`tools2.doc.field.${m.label}`);
}

function itemValue(m: DocItem, t: TFn, locale: string): string {
  const num = (n = 0) => new Intl.NumberFormat(locale).format(n);
  switch (m.code) {
    case "date":
      return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(m.value));
    case "xmp":
      return (
        [m.xmp?.authors && t("tools2.doc.val.xmpAuthor", { names: m.xmp.authors }), m.xmp?.tool, m.xmp?.history && t("tools2.doc.val.xmpHistory")]
          .filter(Boolean)
          .join(" · ") || t("tools2.doc.val.present")
      );
    case "xmpMore":
    case "pieceInfo":
    case "minutes":
    case "rsids":
      return t(`tools2.doc.val.${m.code}`, { n: num(m.n) });
    case undefined:
      return m.value;
    default:
      return t(`tools2.doc.val.${m.code}`);
  }
}

const flagVars = (f: DocFlag, locale: string) => {
  const num = (n = 0) => new Intl.NumberFormat(locale).format(n);
  return { n: num(f.n), ins: num(f.ins), del: num(f.del) };
};

const KIND_LABEL: Record<DocKind, string> = { pdf: "PDF", docx: "Word", xlsx: "Excel", pptx: "PowerPoint" };

/** Show what a PDF or Office file says about its author, then make a copy without it. */
export function DocumentCleaner() {
  const [state, setState] = useState<State>({ kind: "empty" });
  const [dragging, setDragging] = useState(false);
  const [options, setOptions] = useState<CleanOptions>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const canShare = useCanShare();
  const t = useT();
  const locale = useLocale();
  const proof = useLocalProof();

  // Release object URLs when they're replaced or on unmount.
  const urls = useRef<string[]>([]);
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  // Warm the cleaning code while idle, so it's cached before anyone goes offline.
  useEffect(() => {
    const warm = () => void lib().catch(() => {});
    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(warm, { timeout: 4000 });
      return () => cancelIdleCallback(id);
    }
    const id = setTimeout(warm, 1500);
    return () => clearTimeout(id);
  }, []);
  const track = (u: string) => (urls.current.push(u), u);

  const load = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setState({ kind: "error", key: "tools2.doc.tooBig" });
      return;
    }
    setState({ kind: "reading", name: file.name });
    setOptions({});
    proof.start("read");
    try {
      const { inspectDocument } = await lib();
      const meta = await inspectDocument(file);
      setState({ kind: "ready", file, meta });
    } catch (e) {
      setState({ kind: "error", key: await errorKey(e, "tools2.doc.readFailed") });
    } finally {
      proof.end();
    }
  };

  const clean = async () => {
    if (state.kind !== "ready") return;
    const { file, meta } = state;
    setState({ kind: "cleaning", file, meta });
    proof.start("clean");
    try {
      const { cleanDocument, inspectDocument } = await lib();
      const res = await cleanDocument(file, options);
      const outMeta = await inspectDocument(res.blob);
      setState({
        kind: "clean",
        file,
        meta,
        out: res.blob,
        outUrl: track(URL.createObjectURL(res.blob)),
        outName: cleanName(file.name, res.ext),
        outMeta,
      });
      trackEvent("Document cleaned", { kind: res.ext });
    } catch (e) {
      setState({ kind: "error", key: await errorKey(e, "tools2.doc.cleanFailed") });
    } finally {
      proof.end();
    }
  };

  const reset = () => {
    setState({ kind: "empty" });
    setOptions({});
    proof.reset();
    if (inputRef.current) inputRef.current.value = "";
  };

  const loaded = state.kind === "ready" || state.kind === "cleaning" || state.kind === "clean" ? state : null;

  return (
    <section className="panel min-w-0" aria-label={t("tools2.doc.title")}>
      <div className="panel-head">
        <h2 className="label flex min-w-0 items-center gap-2">
          <FileText size={14} className="shrink-0 text-accent" aria-hidden /> <span className="truncate">{t("tools2.doc.title")}</span>
        </h2>
        <span className="micro truncate">{t("tools2.doc.local")}</span>
      </div>
      <div className="p-4 sm:p-5">
        <p className="text-[13px] leading-relaxed text-muted">{t("tools2.doc.intro")}</p>

        <input
          ref={inputRef}
          id={inputId}
          type="file"
          name="document"
          accept={ACCEPT}
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
            className={`mt-4 flex min-h-44 cursor-pointer flex-col items-center justify-center gap-2 border border-dashed px-4 py-8 text-center transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
              dragging ? "border-accent bg-accent/[0.06]" : "border-line-strong hover:border-accent/60"
            }`}
          >
            {state.kind === "reading" ? (
              <>
                <LoaderCircle className="animate-spin-slow text-muted" aria-hidden />
                <span className="min-w-0 max-w-full truncate text-sm text-muted" aria-live="polite">
                  {t("tools2.doc.reading", { name: state.name })}
                </span>
              </>
            ) : (
              <>
                <Upload className="text-accent" aria-hidden />
                <span className="font-medium text-fg">{t("tools2.doc.choose")}</span>
                <span className="text-sm text-subtle">{t("tools2.doc.drop")}</span>
              </>
            )}
          </label>
        )}

        {state.kind === "error" && (
          <p role="alert" className="mt-3 flex items-start gap-2 text-[13px] text-red">
            <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden /> {t(state.key)}
          </p>
        )}

        {loaded && (
          <div className="fade-up mt-4">
            <div className="flex items-start gap-4">
              <div className="grid size-16 shrink-0 place-items-center border border-line bg-bg-2">
                <span className="tag text-accent">{loaded.meta.kind}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-fg" title={loaded.file.name}>
                  {loaded.file.name}
                </p>
                <p className="tabular text-sm text-subtle">
                  {KIND_LABEL[loaded.meta.kind]} · {formatSize(loaded.file.size, locale)}
                </p>
                <button type="button" onClick={reset} className="mt-1 inline-flex h-8 items-center gap-1 text-sm text-muted hover:text-fg">
                  <X size={14} aria-hidden /> {t("tools2.doc.chooseAnother")}
                </button>
              </div>
            </div>

            <MetaList meta={loaded.meta} title={t("tools2.doc.found")} />
            <Flags meta={loaded.meta} />

            {state.kind !== "clean" ? (
              <>
                <RemovableOptions meta={loaded.meta} options={options} onChange={setOptions} disabled={state.kind === "cleaning"} />
                <button
                  type="button"
                  onClick={clean}
                  disabled={state.kind === "cleaning"}
                  className="btn-accent mt-5 inline-flex h-11 items-center gap-2 px-5 text-[12px] disabled:opacity-80"
                >
                  {state.kind === "cleaning" && <LoaderCircle size={16} className="animate-spin-slow" aria-hidden />}
                  {t("tools2.doc.remove")}
                </button>
              </>
            ) : (
              <CleanResult state={state} canShare={canShare} />
            )}

            <Limits kind={loaded.meta.kind} />
          </div>
        )}
        <LocalProof run={proof.run} tool="doc" />
      </div>
    </section>
  );
}

function CleanResult({ state, canShare }: { state: Extract<State, { kind: "clean" }>; canShare: boolean }) {
  const t = useT();
  const personal = state.outMeta.items.filter((i) => i.sensitive).length;
  return (
    <div className="fade-up mt-5 border border-green/40 bg-green/[0.06] p-4" aria-live="polite">
      <p className="flex items-center gap-2 font-medium text-green">
        <ShieldCheck size={18} className="shrink-0" aria-hidden />
        {state.outMeta.items.length === 0
          ? t("tools2.doc.ready.none")
          : personal === 0
            ? t("tools2.doc.ready.clean")
            : t("tools2.doc.ready.left", { n: personal })}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href={state.outUrl}
          download={state.outName}
          className="inline-flex h-10 min-w-0 items-center gap-2 bg-fg px-4 text-sm font-semibold text-bg hover:bg-fg/90"
        >
          <Download size={15} className="shrink-0" aria-hidden /> <span className="truncate">{t("tools2.doc.save", { name: state.outName })}</span>
        </a>
        {canShare && (
          <button
            type="button"
            onClick={() => {
              const f = new File([state.out], state.outName, { type: state.out.type });
              navigator.share({ files: [f] }).catch(() => {});
            }}
            className="inline-flex h-10 items-center gap-2 border border-line-strong px-4 text-sm font-medium text-fg hover:border-fg/40"
          >
            <Share2 size={15} aria-hidden /> {t("common.share")}
          </button>
        )}
      </div>
      {state.outMeta.items.length > 0 && <MetaList meta={state.outMeta} title={t("tools2.doc.still")} />}
    </div>
  );
}

function MetaList({ meta, title }: { meta: DocInspection; title: string }) {
  const t = useT();
  const locale = useLocale();
  if (meta.items.length === 0) {
    return (
      <p className="mt-4 flex items-center gap-2 text-sm text-muted">
        <Check size={15} className="text-green" aria-hidden />
        {t("tools2.doc.noProps")}
      </p>
    );
  }
  return (
    <div className="mt-4">
      <p className="eyebrow">{title}</p>
      <dl className="mt-2 divide-y divide-line border border-line">
        {meta.items.map((m, i) => {
          const value = itemValue(m, t, locale);
          return (
            <div key={`${m.group}-${m.label}-${i}`} className="flex items-center justify-between gap-4 px-3 py-2 text-sm">
              <dt className="flex min-w-0 shrink-0 items-center gap-2 text-muted">
                <span className="min-w-14 shrink-0 bg-surface-3 px-1.5 py-0.5 text-center text-[10px] uppercase text-subtle">
                  {t(`tools2.doc.group.${m.group}`)}
                </span>
                <span className="truncate">{itemLabel(m, t)}</span>
              </dt>
              <dd className={`min-w-0 truncate text-right font-mono text-[13px] ${m.sensitive ? "text-accent" : "text-fg"}`} title={value}>
                {value}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

function Flags({ meta }: { meta: DocInspection }) {
  const t = useT();
  const locale = useLocale();
  if (meta.flags.length === 0) return null;
  return (
    <div className="mt-4">
      <p className="eyebrow">{t("tools2.doc.inside")}</p>
      <ul className="mt-2 grid gap-2">
        {meta.flags.map((f) => (
          <li key={f.id} className="flex items-start gap-2 border-l-2 border-warn bg-warn/[0.07] px-3 py-2.5 text-[13px]">
            <TriangleAlert size={15} className="mt-0.5 shrink-0 text-warn" aria-hidden />
            <span className="min-w-0">
              <span className="font-medium text-fg">{t(`tools2.doc.flag.${f.code}`, flagVars(f, locale))}.</span>{" "}
              <span className="text-muted">{t(`tools2.doc.flag.${f.code}.detail`, flagVars(f, locale))}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RemovableOptions({
  meta,
  options,
  onChange,
  disabled,
}: {
  meta: DocInspection;
  options: CleanOptions;
  onChange: (o: CleanOptions) => void;
  disabled: boolean;
}) {
  const t = useT();
  const locale = useLocale();
  const annotations = meta.flags.find((f) => f.removable === "annotations");
  const comments = meta.flags.find((f) => f.removable === "comments");
  if (!annotations && !comments) return null;
  return (
    <fieldset className="mt-4 grid gap-2" disabled={disabled}>
      <legend className="eyebrow mb-2">{t("tools2.doc.alsoRemove")}</legend>
      {annotations && (
        <Toggle
          name="removeAnnotations"
          checked={!!options.removeAnnotations}
          onChange={(v) => onChange({ ...options, removeAnnotations: v })}
          title={t("tools2.doc.opt.markup", flagVars(annotations, locale))}
          hint={t("tools2.doc.opt.markupHint")}
        />
      )}
      {comments && (
        <Toggle
          name="removeComments"
          checked={!!options.removeComments}
          onChange={(v) => onChange({ ...options, removeComments: v })}
          title={t("tools2.doc.opt.comments", flagVars(comments, locale))}
          hint={t("tools2.doc.opt.commentsHint")}
        />
      )}
    </fieldset>
  );
}

function Toggle({ name, checked, onChange, title, hint }: { name: string; checked: boolean; onChange: (v: boolean) => void; title: string; hint: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 border border-line px-3 py-3 hover:border-line-strong has-[:checked]:border-accent/60">
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-accent"
      />
      <span className="min-w-0 text-[13px]">
        <span className="block text-fg">{title}</span>
        <span className="block text-subtle">{hint}</span>
      </span>
    </label>
  );
}

function Limits({ kind }: { kind: DocKind }) {
  const t = useT();
  return (
    <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-subtle">
      <Info size={14} className="mt-0.5 shrink-0" aria-hidden />
      <span>
        {t(kind === "pdf" ? "tools2.doc.limits.pdf" : "tools2.doc.limits.office")} {t("tools2.doc.limits.check")}
      </span>
    </p>
  );
}
