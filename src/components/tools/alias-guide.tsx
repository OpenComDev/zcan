"use client";

import { Check, Copy, ExternalLink, MailCheck, RotateCcw, Shuffle } from "lucide-react";
import { useId, useState, useSyncExternalStore } from "react";
import { useT } from "@/lib/i18n";

// ---------- data ----------

type ServiceId = "simplelogin" | "addy" | "relay" | "apple" | "duck";

/** Text fields are keys under `tools2.alias.` — the `v.*` ones are shared answers (yes, no, on paid plans…). */
type Service = {
  id: ServiceId;
  name: string;
  href: string;
  openSource: string;
  customDomain: string;
  replies: string;
};

const SERVICES: Service[] = [
  { id: "simplelogin", name: "SimpleLogin", href: "https://simplelogin.io", openSource: "v.yes", customDomain: "v.paidPlans", replies: "v.yes" },
  { id: "addy", name: "addy.io", href: "https://addy.io", openSource: "v.yes", customDomain: "v.paidPlans", replies: "v.yes" },
  { id: "relay", name: "Firefox Relay", href: "https://relay.firefox.com", openSource: "v.yes", customDomain: "v.subdomainPaid", replies: "v.paidPlan" },
  { id: "apple", name: "Apple Hide My Email", href: "https://www.apple.com/icloud/", openSource: "v.no", customDomain: "v.no", replies: "v.yes" },
  { id: "duck", name: "DuckDuckGo Email Protection", href: "https://duckduckgo.com/email/", openSource: "v.partly", customDomain: "v.no", replies: "v.yes" },
];

type StepId = "pick" | "first" | "new" | "move" | "reply" | "list";

/** Title and body live at `tools2.alias.step.<id>.title|body`. */
const STEPS: { id: StepId }[] = [{ id: "pick" }, { id: "first" }, { id: "new" }, { id: "move" }, { id: "reply" }, { id: "list" }];

// ---------- local progress store ----------

type Progress = { done: Partial<Record<StepId, boolean>>; service?: ServiceId };

const KEY = "zcan:aliases:v1";
const EVENT = "zcan:aliases";
const EMPTY: Progress = { done: {} };
let snapshot: Progress | null = null;

function readProgress(): Progress {
  if (snapshot) return snapshot;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Progress>) : null;
    snapshot =
      parsed && typeof parsed === "object"
        ? {
            done: parsed.done && typeof parsed.done === "object" ? parsed.done : {},
            service: SERVICES.some((s) => s.id === parsed.service) ? parsed.service : undefined,
          }
        : EMPTY;
  } catch {
    snapshot = EMPTY;
  }
  return snapshot;
}

function writeProgress(next: Progress) {
  snapshot = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable (private mode, quota) — progress stays in memory for this visit.
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      snapshot = null;
      cb();
    }
  };
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

const useProgress = () => useSyncExternalStore(subscribe, readProgress, () => EMPTY);

const setStep = (id: StepId, value: boolean) => {
  const cur = readProgress();
  writeProgress({ ...cur, done: { ...cur.done, [id]: value } });
};
const pickService = (id: ServiceId) => {
  const cur = readProgress();
  writeProgress({ service: id, done: { ...cur.done, pick: true } });
};

// ---------- alias naming ----------

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const randomTag = (len = 4) => Array.from(crypto.getRandomValues(new Uint8Array(len)), (b) => ALPHABET[b % ALPHABET.length]).join("");

/** "https://www.amazon.co.uk/foo" → "amazon", "My Bank" → "my-bank". */
export function siteSlug(input: string): string {
  let s = input.trim().toLowerCase();
  if (!s) return "";
  s = s.replace(/^[a-z]+:\/\//, "").replace(/^www\./, "");
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/.test(s)) s = s.split(/[/.]/)[0];
  return s
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 20)
    .replace(/-+$/, "");
}

/** The id is the alias prefix (kept in English so aliases stay ASCII); the label is `tools2.alias.cat.<id>`. */
const CATEGORIES = [{ id: "shop" }, { id: "news" }, { id: "social" }, { id: "travel" }, { id: "game" }, { id: "work" }, { id: "acct" }];

// ---------- UI ----------

export function AliasGuide() {
  const t = useT();
  const progress = useProgress();
  const doneCount = STEPS.filter((s) => progress.done[s.id]).length;

  return (
    <div className="grid min-w-0 gap-3">
      <section className="panel min-w-0" aria-labelledby="alias-services">
        <div className="panel-head">
          <h2 id="alias-services" className="label min-w-0">
            {t("tools2.alias.svc.heading")}
          </h2>
          <span className="micro text-right">{t("tools2.alias.svc.meta")}</span>
        </div>
        <div className="p-4 sm:p-5">
          <p className="max-w-3xl text-[13px] leading-relaxed text-muted">{t("tools2.alias.svc.intro")}</p>
          <ul className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {SERVICES.map((s) => {
              const chosen = progress.service === s.id;
              return (
                <li key={s.id} className={`flex min-w-0 flex-col border p-4 ${chosen ? "border-accent/70 bg-accent/[0.04]" : "border-line"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="min-w-0 text-[14px] font-medium text-fg" translate="no">
                      {s.name}
                    </h3>
                    {chosen && <span className="tag shrink-0 text-accent">{t("tools2.alias.yourPick")}</span>}
                  </div>
                  <dl className="mt-3 grid gap-1.5 text-[12px]">
                    {(
                      [
                        ["by", `by.${s.id}`],
                        ["free", `free.${s.id}`],
                        ["openSource", s.openSource],
                        ["customDomain", s.customDomain],
                        ["replies", s.replies],
                      ] as const
                    ).map(([k, v]) => (
                      <div key={k} className="grid grid-cols-[110px_minmax(0,1fr)] gap-2">
                        <dt className="break-words uppercase tracking-wide text-subtle">{t(`tools2.alias.k.${k}`)}</dt>
                        <dd className="min-w-0 text-text">{t(`tools2.alias.${v}`)}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-3 text-[12px] leading-relaxed text-muted">{t(`tools2.alias.note.${s.id}`)}</p>
                  <div className="mt-auto flex flex-wrap gap-2 pt-4">
                    <button
                      type="button"
                      onClick={() => pickService(s.id)}
                      aria-pressed={chosen}
                      className={`inline-flex h-10 items-center gap-1.5 px-3 text-[12px] uppercase tracking-wider ${
                        chosen ? "btn-accent" : "border border-line text-muted hover:border-line-strong hover:text-fg"
                      }`}
                    >
                      {chosen && <Check size={14} aria-hidden />}
                      {chosen ? t("tools2.alias.chosen") : t("tools2.alias.use")}
                    </button>
                    <a
                      href={s.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-10 items-center gap-1.5 border border-line px-3 text-[12px] uppercase tracking-wider text-muted hover:border-line-strong hover:text-fg"
                    >
                      {t("tools2.alias.visit")} <ExternalLink size={13} aria-hidden />
                      <span className="sr-only">{t("tools2.alias.newTab")}</span>
                    </a>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Checklist progress={progress} doneCount={doneCount} />
        <NamingHelper />
      </div>
    </div>
  );
}

function Checklist({ progress, doneCount }: { progress: Progress; doneCount: number }) {
  const t = useT();
  const service = SERVICES.find((s) => s.id === progress.service);
  // Split the sentence around the name so it can be highlighted wherever the language puts it.
  const [usingBefore, usingAfter = ""] = t("tools2.alias.using", { name: "\u0000" }).split("\u0000");
  return (
    <section className="panel marks min-w-0" aria-labelledby="alias-steps">
      <div className="panel-head">
        <h2 id="alias-steps" className="label min-w-0">
          {t("tools2.alias.steps.heading")}
        </h2>
        <span className="micro tabular shrink-0" aria-live="polite">
          {t("tools2.alias.steps.done", { done: doneCount, total: STEPS.length })}
        </span>
      </div>
      <div className="p-4 sm:p-5">
        <div className="hatch h-1.5 border border-line" aria-hidden>
          <div
            className="h-full origin-left bg-accent transition-transform duration-300 ease-out motion-reduce:transition-none"
            style={{ transform: `scaleX(${doneCount / STEPS.length})` }}
          />
        </div>
        {service && (
          <p className="mt-3 text-[12px] text-muted">
            {usingBefore}
            <span className="text-fg" translate="no">
              {service.name}
            </span>
            {usingAfter}
          </p>
        )}
        <ol className="mt-4 grid gap-2">
          {STEPS.map((step, i) => {
            const checked = !!progress.done[step.id];
            return (
              <li key={step.id}>
                <label
                  className={`flex cursor-pointer items-start gap-3 border px-3 py-3 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
                    checked ? "border-green/40 bg-green/[0.04]" : "border-line hover:border-line-strong"
                  }`}
                >
                  <input
                    type="checkbox"
                    name={`step-${step.id}`}
                    checked={checked}
                    onChange={(e) => setStep(step.id, e.target.checked)}
                    className="sr-only"
                  />
                  <span
                    className={`mt-0.5 grid size-5 shrink-0 place-items-center border ${checked ? "border-green bg-green text-bg" : "border-line-strong"}`}
                    aria-hidden
                  >
                    {checked && <Check size={13} strokeWidth={3} />}
                  </span>
                  <span className="min-w-0">
                    <span className={`block text-[13px] font-medium ${checked ? "text-muted line-through decoration-subtle" : "text-fg"}`}>
                      <span className="tabular mr-2 text-accent">{String(i + 1).padStart(2, "0")}</span>
                      {t(`tools2.alias.step.${step.id}.title`)}
                    </span>
                    <span className="mt-1 block text-[12px] leading-relaxed text-subtle">{t(`tools2.alias.step.${step.id}.body`)}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ol>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[12px] text-subtle">{t("tools2.alias.saved")}</p>
          {(doneCount > 0 || progress.service) && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm(t("tools2.alias.confirmReset"))) writeProgress(EMPTY);
              }}
              className="inline-flex h-9 items-center gap-1.5 text-[12px] uppercase tracking-wider text-muted hover:text-fg"
            >
              <RotateCcw size={13} aria-hidden /> {t("tools2.alias.startOver")}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function NamingHelper() {
  const t = useT();
  const [site, setSite] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0].id);
  const [tags, setTags] = useState<[string, string] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const siteId = useId();
  const catId = useId();

  const slug = siteSlug(site);
  const suggestions = slug && tags ? [`${category}-${slug}-${tags[0]}`, `${slug}-${tags[0]}`, `${slug}.${tags[1]}`] : [];

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
    } catch {
      setCopied(null);
    }
  };

  return (
    <section className="panel min-w-0" aria-labelledby="alias-names">
      <div className="panel-head">
        <h2 id="alias-names" className="label flex items-center gap-2">
          <MailCheck size={14} className="shrink-0 text-accent" aria-hidden /> {t("tools2.alias.names.heading")}
        </h2>
        <span className="micro text-right">{t("tools2.alias.names.meta")}</span>
      </div>
      <div className="p-4 sm:p-5">
        <p className="text-[13px] leading-relaxed text-muted">{t("tools2.alias.names.intro")}</p>
        <form className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_190px]" onSubmit={(e) => e.preventDefault()} noValidate>
          <div className="min-w-0">
            <label htmlFor={siteId} className="micro mb-1.5 block">
              {t("tools2.alias.site")}
            </label>
            <input
              id={siteId}
              name="site"
              type="text"
              inputMode="url"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              value={site}
              onChange={(e) => {
                setSite(e.target.value);
                setCopied(null);
                if (!tags) setTags([randomTag(), randomTag()]);
              }}
              placeholder="amazon.com…"
              className="h-11 w-full border border-line bg-bg-2 px-3 text-base text-fg outline-none placeholder:text-[13px] placeholder:text-subtle focus:border-accent/70 sm:text-[14px]"
            />
          </div>
          <div className="min-w-0">
            <label htmlFor={catId} className="micro mb-1.5 block">
              {t("tools2.alias.kind")}
            </label>
            <select
              id={catId}
              name="category"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setCopied(null);
              }}
              className="h-11 w-full border border-line bg-bg-2 px-2 text-base text-fg outline-none focus:border-accent/70 sm:text-[14px]"
            >
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id} className="bg-bg-2 text-fg">
                  {t(`tools2.alias.cat.${c.id}`)}
                </option>
              ))}
            </select>
          </div>
        </form>

        {suggestions.length > 0 ? (
          <>
            <ul className="mt-4 divide-y divide-line border border-line">
              {suggestions.map((s) => (
                <li key={s} className="flex min-w-0 items-center justify-between gap-3 py-1 pl-3 pr-1">
                  <code className="min-w-0 truncate font-mono text-[14px] text-fg" translate="no">
                    {s}
                  </code>
                  <button
                    type="button"
                    onClick={() => copy(s)}
                    aria-label={t("tools2.alias.copyAria", { alias: s })}
                    className="inline-flex h-10 shrink-0 items-center gap-1.5 px-3 text-[12px] uppercase tracking-wider text-muted hover:text-fg"
                  >
                    {copied === s ? <Check size={14} className="text-green" aria-hidden /> : <Copy size={14} aria-hidden />}
                    {copied === s ? t("common.copied") : t("common.copy")}
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[12px] text-subtle">{t("tools2.alias.domainTip")}</p>
              <button
                type="button"
                onClick={() => {
                  setTags([randomTag(), randomTag()]);
                  setCopied(null);
                }}
                className="inline-flex h-9 items-center gap-1.5 text-[12px] uppercase tracking-wider text-muted hover:text-fg"
              >
                <Shuffle size={13} aria-hidden /> {t("tools2.alias.newTags")}
              </button>
            </div>
          </>
        ) : (
          <p className="dots mt-4 border border-dashed border-line px-4 py-8 text-center text-[12px] text-subtle">
            {t("tools2.alias.empty")}{" "}
            <span className="font-mono text-muted" translate="no">
              shop-amazon-x7k2
            </span>
          </p>
        )}
        <p className="sr-only" aria-live="polite">
          {copied ? t("tools2.alias.copiedLive", { alias: copied }) : ""}
        </p>
      </div>
    </section>
  );
}
