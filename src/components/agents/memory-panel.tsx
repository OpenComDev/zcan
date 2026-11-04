"use client";

import { CircleAlert, KeyRound, Loader2, PenLine, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { useId, useRef, useState, type FormEvent } from "react";
import { EmptyState, emptyPrimary } from "@/components/onboarding/empty-state";
import { Panel } from "@/components/hud/panel";
import { dismissLost, forgetProfile, saveProfile, setUseForRuns, useAgentMemory } from "@/lib/agent-memory";
import { PHONE_KINDS, PROFILE_FIELDS, type AgentProfile, type ProfileKey } from "@/lib/agent-profile";
import { useT } from "@/lib/i18n";
import { findSecret } from "@/lib/secret-guard";
import { setHash, useHash } from "@/lib/use-hash";

const PLACEHOLDER_KEYS: ProfileKey[] = ["email", "phoneModel", "computer", "browsers", "passwordManager", "region", "social", "wallets", "notes"];

/**
 * "Agent memory" on /agents: an optional profile, encrypted on this device, that agents use as
 * background so they don't ask the same questions every run.
 */
export function MemoryPanel() {
  const t = useT();
  const memory = useAgentMemory();
  const [editingState, setEditing] = useState(false);
  // /agents#memory (the workspace's "Edit" link) opens the form.
  const hash = useHash();
  const editing = editingState || hash === "#memory";
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState("");
  const switchId = useId();
  const headingRef = useRef<HTMLDivElement>(null);

  const close = () => {
    setEditing(false);
    if (hash === "#memory") setHash("");
  };

  const { status, profile } = memory;
  const hasProfile = Boolean(profile);
  const meta =
    status === "loading" ? "…" : status === "unavailable" ? t("agentkit.mem.meta.session") : hasProfile ? t("agentkit.mem.meta.saved") : t("agentkit.mem.meta.none");

  return (
    <Panel id="memory" title={t("agentkit.mem.title")} meta={<span>{meta}</span>} bodyClassName="p-0" className="scroll-mt-20">
      <div ref={headingRef} className="grid gap-4 px-4 py-4 sm:px-5">
        <p className="max-w-prose text-[13px] leading-relaxed text-muted">{t("agentkit.mem.intro")}</p>

        {memory.lost && (
          <p role="status" className="flex items-start gap-2 border border-line bg-surface-2 px-3 py-2 text-[13px] text-text">
            <CircleAlert size={15} className="mt-0.5 shrink-0 text-muted" aria-hidden />
            <span className="min-w-0 flex-1">{t("agentkit.mem.lost")}</span>
            <button type="button" onClick={dismissLost} className="shrink-0 text-[12px] uppercase tracking-wider text-muted underline-offset-2 hover:text-fg hover:underline">
              {t("agentkit.mem.dismiss")}
            </button>
          </p>
        )}

        {status === "unavailable" && (
          <p className="flex items-start gap-2 border border-line bg-surface-2 px-3 py-2 text-[13px] text-text">
            <CircleAlert size={15} className="mt-0.5 shrink-0 text-accent" aria-hidden />
            {t("agentkit.mem.unavailable")}
          </p>
        )}

        {status === "loading" ? (
          <div className="h-24 animate-pulse bg-surface-2/40" aria-busy="true" aria-label={t("agentkit.mem.loading")} />
        ) : editing ? (
          <ProfileForm
            initial={profile ?? {}}
            onCancel={close}
            onSaved={(persisted, empty) => {
              close();
              setNotice(empty ? t("agentkit.mem.notice.forgot") : persisted ? t("agentkit.mem.notice.saved") : t("agentkit.mem.notice.session"));
              requestAnimationFrame(() => headingRef.current?.querySelector<HTMLButtonElement>("[data-edit]")?.focus());
            }}
          />
        ) : profile ? (
          <>
            <dl className="grid gap-px border border-line bg-line sm:grid-cols-2">
              {PROFILE_FIELDS.filter((f) => profile[f.key]).map((f) => (
                <div key={f.key} className={`min-w-0 bg-surface px-3 py-2.5 ${f.key === "notes" ? "sm:col-span-2" : ""}`}>
                  <dt className="micro truncate">{t(`agentkit.mem.f.${f.key}`)}</dt>
                  <dd className="mt-1 whitespace-pre-line break-words text-[13px] text-fg">{f.options ? t(`agentkit.mem.phone.${profile[f.key]}`) : profile[f.key]}</dd>
                </div>
              ))}
            </dl>

            <label htmlFor={switchId} className="flex cursor-pointer items-start gap-3 border border-line bg-bg-2 p-3">
              <input
                id={switchId}
                type="checkbox"
                role="switch"
                checked={memory.useForRuns}
                onChange={(e) => setUseForRuns(e.target.checked)}
                className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]"
              />
              <span className="min-w-0">
                <span className="block text-[13px] text-fg">{t("agentkit.mem.use")}</span>
                <span className="mt-0.5 block text-[12px] text-subtle">{memory.useForRuns ? t("agentkit.mem.useOn") : t("agentkit.mem.useOff")}</span>
              </span>
            </label>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                data-edit
                onClick={() => {
                  setNotice("");
                  setEditing(true);
                }}
                className="inline-flex h-10 items-center gap-1.5 border border-line px-4 text-[12px] uppercase tracking-wider text-muted transition-colors hover:border-line-strong hover:text-fg"
              >
                <PenLine size={14} aria-hidden /> {t("agentkit.mem.edit")}
              </button>
              {confirming ? (
                <span className="flex flex-wrap items-center gap-2" role="group" aria-label={t("agentkit.mem.forgetConfirm")}>
                  <span className="text-[13px] text-text">{t("agentkit.mem.forgetConfirm")}</span>
                  <button
                    type="button"
                    autoFocus
                    onClick={async () => {
                      await forgetProfile();
                      setConfirming(false);
                      setNotice(t("agentkit.mem.notice.forgot"));
                    }}
                    className="inline-flex h-10 items-center gap-1.5 border border-red/50 px-3 text-[11px] uppercase tracking-wider text-red hover:bg-red/10"
                  >
                    <Trash2 size={13} aria-hidden /> {t("agentkit.mem.forget")}
                  </button>
                  <button type="button" onClick={() => setConfirming(false)} className="inline-flex h-10 items-center px-2 text-[11px] uppercase tracking-wider text-muted hover:text-fg">
                    {t("common.cancel")}
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  className="inline-flex h-10 items-center gap-1.5 border border-line px-4 text-[12px] uppercase tracking-wider text-muted transition-colors hover:border-red/60 hover:text-red sm:ml-auto"
                >
                  <Trash2 size={14} aria-hidden /> {t("agentkit.mem.forgetBtn")}
                </button>
              )}
            </div>
          </>
        ) : (
          <EmptyState
            compact
            icon={<UserRound size={20} />}
            title={t("agentkit.mem.emptyTitle")}
            body={t("agentkit.mem.emptyBody")}
            actions={
              <button
                type="button"
                data-edit
                onClick={() => {
                  setNotice("");
                  setEditing(true);
                }}
                className={emptyPrimary}
              >
                {t("agentkit.mem.add")}
              </button>
            }
          />
        )}

        <p aria-live="polite" className={notice ? "border-l-2 border-green bg-surface-2 px-3 py-2 text-[13px] text-fg" : "sr-only"}>
          {notice}
        </p>
      </div>

      <details className="group border-t border-line">
        <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-4 py-3 text-[12px] uppercase tracking-wider text-muted hover:text-fg sm:px-5">
          <ShieldCheck size={14} className="text-accent" aria-hidden /> {t("agentkit.mem.how")}
        </summary>
        <ul className="grid gap-2 px-4 pb-4 text-[13px] leading-relaxed text-muted sm:px-5">
          {(["how1", "how2", "how3", "how4", "how5"] as const).map((k) => (
            <li key={k} className="flex gap-2">
              <span className="text-accent" aria-hidden>
                ·
              </span>
              <span className="min-w-0">{t(`agentkit.mem.${k}`)}</span>
            </li>
          ))}
        </ul>
      </details>
    </Panel>
  );
}

function ProfileForm({ initial, onCancel, onSaved }: { initial: AgentProfile; onCancel: () => void; onSaved: (persisted: boolean, empty: boolean) => void }) {
  const t = useT();
  const baseId = useId();
  const [values, setValues] = useState<AgentProfile>(initial);
  const [errors, setErrors] = useState<Partial<Record<ProfileKey, string>>>({});
  const [busy, setBusy] = useState(false);
  const refs = useRef<Partial<Record<ProfileKey, HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null>>>({});

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed: AgentProfile = {};
    const next: Partial<Record<ProfileKey, string>> = {};
    for (const f of PROFILE_FIELDS) {
      const v = values[f.key]?.trim() ?? "";
      if (!v) continue;
      if (findSecret(v)) next[f.key] = t("agentkit.mem.err.secret");
      trimmed[f.key] = v;
    }
    setErrors(next);
    const first = PROFILE_FIELDS.find((f) => next[f.key]);
    if (first) {
      refs.current[first.key]?.focus();
      return;
    }
    setBusy(true);
    const res = await saveProfile(trimmed);
    setBusy(false);
    if (res.ok) onSaved(res.persisted, Object.keys(trimmed).length === 0);
  };

  const input =
    "w-full border bg-bg-2 px-3 text-base text-fg outline-none placeholder:text-[13px] placeholder:text-subtle focus-visible:border-accent/70 sm:text-[13px]";

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <p className="flex items-start gap-2 border border-accent/30 bg-accent/[0.06] px-3 py-2 text-[13px] text-text">
        <KeyRound size={15} className="mt-0.5 shrink-0 text-accent" aria-hidden />
        {t("agentkit.mem.never")}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {PROFILE_FIELDS.map((f) => {
          const id = `${baseId}-${f.key}`;
          const err = errors[f.key];
          const value = values[f.key] ?? "";
          const describedBy = [err ? `${id}-err` : null, f.multiline ? `${id}-count` : null].filter(Boolean).join(" ") || undefined;
          const onChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
            setValues((v) => ({ ...v, [f.key]: e.target.value }));
            if (err) setErrors((er) => ({ ...er, [f.key]: "" }));
          };
          return (
            <div key={f.key} className={`min-w-0 ${f.multiline ? "sm:col-span-2" : ""}`}>
              <label htmlFor={id} className="label mb-2 block">
                {t(`agentkit.mem.f.${f.key}`)}
              </label>
              {f.options ? (
                <select
                  id={id}
                  name={f.key}
                  ref={(el) => {
                    refs.current[f.key] = el;
                  }}
                  value={value}
                  onChange={onChange}
                  className={`${input} h-11 border-line`}
                  style={{ colorScheme: "dark" }}
                >
                  <option value="" className="bg-bg-2 text-fg">
                    {t("agentkit.mem.phone.none")}
                  </option>
                  {PHONE_KINDS.map((o) => (
                    <option key={o} value={o} className="bg-bg-2 text-fg">
                      {t(`agentkit.mem.phone.${o}`)}
                    </option>
                  ))}
                </select>
              ) : f.multiline ? (
                <>
                  <textarea
                    id={id}
                    name={f.key}
                    ref={(el) => {
                      refs.current[f.key] = el;
                    }}
                    value={value}
                    onChange={onChange}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
                    }}
                    maxLength={f.max}
                    rows={3}
                    autoComplete="off"
                    placeholder={t("agentkit.mem.ph.notes")}
                    aria-invalid={err ? true : undefined}
                    aria-describedby={describedBy}
                    className={`${input} resize-y py-2.5 leading-relaxed ${err ? "border-red" : "border-line"}`}
                  />
                  <p id={`${id}-count`} className="mt-1 text-right text-[12px] tabular-nums text-subtle">
                    {t("agentkit.mem.count", { n: value.length, max: f.max })}
                  </p>
                </>
              ) : (
                <input
                  id={id}
                  name={f.key}
                  ref={(el) => {
                    refs.current[f.key] = el;
                  }}
                  type="text"
                  value={value}
                  onChange={onChange}
                  maxLength={f.max}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={PLACEHOLDER_KEYS.includes(f.key) ? t(`agentkit.mem.ph.${f.key}`) : undefined}
                  aria-invalid={err ? true : undefined}
                  aria-describedby={describedBy}
                  className={`${input} h-11 ${err ? "border-red" : "border-line"}`}
                />
              )}
              {err && (
                <p id={`${id}-err`} role="alert" className="mt-1.5 text-[13px] text-red">
                  {err}
                </p>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={busy} className="btn-accent inline-flex h-10 items-center gap-2 px-4 text-[12px] disabled:opacity-70">
          {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <ShieldCheck size={14} aria-hidden />} {t("agentkit.mem.save")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex h-10 items-center border border-line px-4 text-[12px] uppercase tracking-wider text-muted transition-colors hover:border-line-strong hover:text-fg"
        >
          {t("common.cancel")}
        </button>
        <p className="text-[12px] text-subtle">{t("agentkit.mem.saveNote")}</p>
      </div>
    </form>
  );
}
