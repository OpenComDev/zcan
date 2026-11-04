"use client";

import { CalendarClock, Check, CircleAlert, Copy, Download, ExternalLink, FileText, Globe, ListChecks, LoaderCircle, PenLine, RotateCcw, Search, Sparkles, Square, UserRound } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "@/components/locale-link";
import { checklistHref } from "@/components/agents/checklists-panel";
import { ReportDiff } from "@/components/agents/report-diff";
import { ReportMarkdown } from "@/components/agents/report-markdown";
import { ScheduleOffer } from "@/components/agents/schedule-offer";
import { ShareRun } from "@/components/agents/share-run";
import { linkChecklistToSchedule, progressOf, saveChecklist, useChecklists } from "@/lib/agent-checklists";
import { useAgentMemory } from "@/lib/agent-memory";
import { profileHighlights } from "@/lib/agent-profile";
import { completeSchedule, createSchedule, getSchedules, removeSchedule, updateSchedule, useSchedules, type AgentSchedule } from "@/lib/agent-schedules";
import { FIELD_MAX, agentText, getAgent, type AgentLocale, type AgentPlan, type PlanStep, type RunEvent } from "@/lib/agents";
import { track } from "@/lib/analytics";
import { feedback } from "@/lib/feedback";
import { useLocale, useT } from "@/lib/i18n";

type Phase =
  | { kind: "form" }
  | { kind: "planning" }
  | { kind: "review"; plan: AgentPlan; approved: Set<string> }
  | { kind: "running"; plan: AgentPlan }
  | { kind: "done"; plan: AgentPlan; stopped?: boolean };

type Activity = { kind: "search"; text: string } | { kind: "status"; text: string; code?: string };
type ServerError = { code?: unknown; message?: unknown; field?: unknown };

const KIND_ICON = { search: Globe, analyze: Sparkles, write: FileText };
const STAGES = ["describe", "approve", "report"] as const;

/** Splits a translated string on "{name}" placeholders and drops React nodes in their place. */
function fill(text: string, nodes: Record<string, ReactNode>): ReactNode[] {
  return text.split(/(\{\w+\})/).map((part, i) => {
    const name = part.match(/^\{(\w+)\}$/)?.[1];
    return name && name in nodes ? <span key={i}>{nodes[name]}</span> : part;
  });
}

/**
 * Reads `?rerun=<scheduleId>` and, when it matches a saved schedule for this agent, starts the
 * workspace pre-filled at the plan step. Must sit under a <Suspense> (useSearchParams).
 */
export function AgentWorkspaceLoader({ agentId }: { agentId: string }) {
  const rerunId = useSearchParams().get("rerun");
  const schedules = useSchedules();
  const live = rerunId ? schedules.find((s) => s.id === rerunId && s.agentId === agentId) : undefined;
  // Keep the schedule we started from even if it's later edited or deleted, so the workspace doesn't remount mid-run.
  const [start, setStart] = useState<AgentSchedule | undefined>(undefined);
  if (live && start?.id !== live.id) setStart(live);
  if (!rerunId && start) setStart(undefined);
  return <AgentWorkspace key={start?.id ?? "new"} agentId={agentId} rerun={start} />;
}

export function AgentWorkspace({ agentId, rerun }: { agentId: string; rerun?: AgentSchedule }) {
  const agent = getAgent(agentId)!;
  const t = useT();
  const uiLocale = useLocale();
  /** Re-checks keep the language their schedule was made in (older schedules predate this and were English). */
  const runLocale: AgentLocale = rerun ? (rerun.locale ?? "en") : uiLocale;
  const def = (path: string, fallback: string) => agentText(t, agent.id, path, fallback);
  const fieldLabel = (name: string) => def(`field.${name}.label`, agent.fields.find((f) => f.name === name)?.label ?? name);
  /** Server errors carry a stable code; show our translation, else the server's English message. */
  const errText = (body: ServerError, fallback: string) => {
    const code = typeof body.code === "string" ? body.code : "";
    if (code === "required" && typeof body.field === "string") return t("agents.err.required", { field: fieldLabel(body.field) });
    const key = `agents.err.${code}`;
    const out = code ? t(key) : key;
    if (out !== key) return out;
    return typeof body.message === "string" && body.message ? body.message : fallback;
  };
  const dateFmt = new Intl.DateTimeFormat(uiLocale, { dateStyle: "medium" });
  /** True while Zcan's own model is starting up (it scales to zero when idle) and the plan request is retrying. */
  const [waking, setWaking] = useState(false);

  // Wake the model as soon as someone opens an agent, so it's usually ready by the time they ask for a plan.
  useEffect(() => {
    void fetch("/api/agents/warm", { method: "POST", keepalive: true }).catch(() => {});
  }, []);
  const [values, setValues] = useState<Record<string, string>>(() => rerun?.inputs ?? {});
  const [consent, setConsent] = useState(() => rerun?.consent ?? false);
  const [phase, setPhase] = useState<Phase>(() =>
    rerun ? { kind: "review", plan: rerun.plan, approved: new Set(rerun.plan.steps.map((s) => s.id)) } : { kind: "form" },
  );
  /** The schedule this workspace reports into (a re-check, or one the user just turned on). */
  const [scheduleId, setScheduleId] = useState<string | null>(rerun?.id ?? null);
  /** Previous report to compare against, captured when a re-check starts. */
  const [baseline, setBaseline] = useState<{ report: string; at: string } | null>(null);
  const schedule = useSchedules().find((s) => s.id === scheduleId);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [report, setReport] = useState("");
  const [offer, setOffer] = useState<{ draft: string; sig: string } | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [sources, setSources] = useState<{ url: string; title: string }[]>([]);
  const [copied, setCopied] = useState(false);
  /** Saved agent-memory profile, and whether to send it with this run (per-run opt-out). */
  const memory = useAgentMemory();
  const [profileThisRun, setProfileThisRun] = useState(true);
  // Read fresh at request time and never stored with the run or its schedule.
  const runProfile = memory.useForRuns && profileThisRun && memory.profile ? memory.profile : undefined;
  /** The follow-through checklist saved from this run's report. */
  const [checklistId, setChecklistId] = useState<string | null>(null);
  const checklist = useChecklists().find((c) => c.id === checklistId) ?? null;
  const abortRef = useRef<AbortController | null>(null);
  const fieldRefs = useRef<Record<string, HTMLInputElement | HTMLTextAreaElement | null>>({});
  const consentRef = useRef<HTMLInputElement>(null);
  const baseId = useId();

  const stage = phase.kind === "form" || phase.kind === "planning" ? 0 : phase.kind === "review" ? 1 : 2;

  const requestPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    for (const f of agent.fields) if (f.required && !values[f.name]?.trim()) next[f.name] = t("agents.err.required", { field: fieldLabel(f.name) });
    if (agent.consent && !consent) next.consent = t("agents.err.confirm");
    setErrors(next);
    const first = agent.fields.find((f) => next[f.name]);
    if (first) return fieldRefs.current[first.name]?.focus();
    if (next.consent) return consentRef.current?.focus();

    setBanner(null);
    setPhase({ kind: "planning" });
    try {
      const request = () =>
        fetch("/api/agents/plan", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ agentId, values, consent, locale: runLocale, profile: runProfile }),
        });
      let res = await request();
      let body = await res.json();
      // The model is starting up: check every eight seconds, for up to ten minutes, and ask for the
      // plan again once it's ready. The check doesn't count toward the hourly plan limit.
      const started = Date.now();
      while (res.status === 503 && body?.code === "modelWaking" && Date.now() - started < 600_000) {
        setWaking(true);
        await new Promise((r) => setTimeout(r, 8000));
        const ready = await fetch("/api/agents/warm", { method: "POST" }).then((r) => r.ok, () => false);
        if (!ready) continue;
        res = await request();
        body = await res.json();
      }
      setWaking(false);
      if (!res.ok) {
        const message = errText(body, t("agents.err.planFailed"));
        if (typeof body.field === "string") setErrors({ [body.field]: message });
        else setBanner(message);
        setPhase({ kind: "form" });
        return;
      }
      const plan = body as AgentPlan;
      setPhase({ kind: "review", plan, approved: new Set(plan.steps.map((s) => s.id)) });
      track("Agent planned", { agent: agentId });
    } catch {
      setWaking(false);
      setBanner(t("agents.err.network"));
      setPhase({ kind: "form" });
    }
  };

  const run = async (plan: AgentPlan) => {
    setReport("");
    setOffer(null);
    setChecklistId(null);
    setActivity([]);
    setSources([]);
    setBanner(null);
    setPhase({ kind: "running", plan });
    const prev = scheduleId ? getSchedules().find((s) => s.id === scheduleId) : undefined;
    setBaseline(prev ? { report: prev.lastReport, at: prev.lastRunAt } : null);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let failed = false;
    let text = "";

    try {
      const res = await fetch("/api/agents/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentId, values, consent, plan, locale: runLocale, profile: runProfile }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        setBanner(errText(body, t("agents.err.start")));
        setPhase({ kind: "review", plan, approved: new Set(plan.steps.map((s) => s.id)) });
        feedback("error");
        return;
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const ev = JSON.parse(line) as RunEvent;
          if (ev.t === "text") {
            text += ev.text;
            setReport((r) => r + ev.text);
          } else if (ev.t === "reset") {
            text = "";
            setReport("");
          }
          else if (ev.t === "search") setActivity((a) => [...a, { kind: "search", text: ev.query }]);
          else if (ev.t === "status") setActivity((a) => [...a, { kind: "status", text: ev.text, code: ev.code }]);
          else if (ev.t === "source") setSources((s) => [...s, { url: ev.url, title: ev.title }]);
          else if (ev.t === "contribution") setOffer({ draft: ev.draft, sig: ev.sig });
          else if (ev.t === "error") {
            failed = true;
            setBanner(errText(ev, ev.message));
          }
        }
      }
      setPhase({ kind: "done", plan, stopped: failed });
      feedback(failed ? "error" : "success");
      if (!failed) track("Agent run", { agent: agentId });
      // A finished re-check becomes the new baseline and restarts the schedule's clock.
      if (!failed && text.trim() && prev) completeSchedule(prev.id, { inputs: values, plan, report: text });
      // Finished reports become a tickable checklist; re-checks carry ticks over from the last one.
      if (!failed && text.trim()) {
        const subject = agent.fields.find((f) => !f.options && values[f.name]?.trim());
        const saved = saveChecklist({ agentId: agent.id, title: subject ? values[subject.name] : "", report: text, scheduleId: prev?.id });
        setChecklistId(saved?.id ?? null);
      }
    } catch (err) {
      const aborted = (err as Error).name === "AbortError";
      if (!aborted) {
        setBanner(t("agents.err.dropped"));
        feedback("error");
      }
      setPhase({ kind: "done", plan, stopped: true });
    } finally {
      abortRef.current = null;
    }
  };

  const reset = () => {
    abortRef.current?.abort();
    setPhase({ kind: "form" });
    setReport("");
    setActivity([]);
    setSources([]);
    setBanner(null);
    setScheduleId(null);
    setBaseline(null);
    setChecklistId(null);
  };

  /** "Re-check every …" — creates, updates or removes this run's schedule. */
  const changeSchedule = (days: number, plan: AgentPlan) => {
    if (days === 0) {
      if (schedule) removeSchedule(schedule.id);
      setScheduleId(null);
      return;
    }
    // Ask for notification permission only here, in response to the user's click.
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
    if (schedule) updateSchedule(schedule.id, { every: days });
    else {
      const created = createSchedule({
        agentId: agent.id,
        inputs: values,
        consent,
        plan,
        every: days,
        locale: runLocale,
        lastRunAt: new Date().toISOString(),
        lastReport: report,
      });
      setScheduleId(created.id);
      if (checklistId) linkChecklistToSchedule(checklistId, created.id);
    }
  };

  return (
    <div>
      {/* Stage indicator */}
      <ol className="mb-6 flex flex-wrap items-center gap-2" aria-label={t("agents.progress")}>
        {STAGES.map((s, i) => (
          <li key={s} className="flex items-center gap-2" aria-current={i === stage ? "step" : undefined}>
            <span
              className={`inline-flex items-center gap-2 border py-1 pl-1 pr-3 text-[11px] uppercase tracking-wider ${
                i === stage ? "border-accent/50 bg-accent/10 text-fg" : i < stage ? "border-line text-muted" : "border-line text-subtle"
              }`}
            >
              <span
                className={`flex size-5 items-center justify-center text-[10px] ${
                  i < stage ? "bg-fg text-bg" : i === stage ? "bg-accent text-accent-ink" : "bg-surface-3 text-subtle"
                }`}
              >
                {i < stage ? <Check size={12} /> : i + 1}
              </span>
              {t(`agents.stage.${s}`)}
            </span>
            {i < STAGES.length - 1 && <span className="text-subtle" aria-hidden>→</span>}
          </li>
        ))}
      </ol>

      {banner && (
        <p role="alert" className="mb-3 flex items-start gap-2 border border-red/40 bg-red/10 px-4 py-3 text-[13px] text-red">
          <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden /> {banner}
        </p>
      )}

      {(phase.kind === "form" || phase.kind === "planning") && (
        <form onSubmit={requestPlan} noValidate className="card-glow rounded-3xl p-5 sm:p-7">
          <div className="grid gap-5">
            {agent.fields.map((f) => {
              const id = `${baseId}-${f.name}`;
              const err = errors[f.name];
              const describedBy = [err ? `${id}-err` : null, f.hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;
              const common = {
                id,
                name: f.name,
                value: values[f.name] ?? "",
                maxLength: f.max ?? FIELD_MAX,
                placeholder: f.placeholder ? def(`field.${f.name}.placeholder`, f.placeholder) : undefined,
                autoComplete: "off",
                "aria-invalid": err ? true : undefined,
                "aria-describedby": describedBy,
                onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
                  setValues((v) => ({ ...v, [f.name]: e.target.value }));
                  setErrors((er) => ({ ...er, [f.name]: "" }));
                },
                className: `w-full rounded-2xl border bg-bg-2 px-4 text-base text-fg outline-none placeholder:text-subtle focus:border-accent/60 ${
                  err ? "border-red" : "border-line"
                }`,
              };
              return (
                <div key={f.name}>
                  <label htmlFor={id} className="mb-2 block text-[12px] font-medium uppercase tracking-wider text-muted">
                    {fieldLabel(f.name)} {f.required && <span className="text-accent">*</span>}
                  </label>
                  {f.options ? (
                    <select
                      id={id}
                      name={f.name}
                      value={values[f.name] || f.options[0]}
                      aria-describedby={describedBy}
                      onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                      className="h-12 w-full rounded-2xl border border-line bg-bg-2 px-4 text-base text-fg outline-none focus:border-accent/60"
                      style={{ colorScheme: "dark" }}
                    >
                      {f.options.map((o) => (
                        <option key={o} value={o} className="bg-bg-2 text-fg">
                          {def(`field.${f.name}.option.${o}`, o)}
                        </option>
                      ))}
                    </select>
                  ) : f.multiline ? (
                    <textarea
                      {...common}
                      ref={(el) => {
                        fieldRefs.current[f.name] = el;
                      }}
                      rows={3}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
                      }}
                      className={`${common.className} resize-y py-3 leading-relaxed`}
                    />
                  ) : (
                    <input
                      {...common}
                      ref={(el) => {
                        fieldRefs.current[f.name] = el;
                      }}
                      type={f.type ?? "text"}
                      {...(f.type === "email" ? { inputMode: "email" as const, autoComplete: "email", spellCheck: false, autoCapitalize: "none" } : {})}
                      className={`${common.className} h-12`}
                    />
                  )}
                  {err ? (
                    <p id={`${id}-err`} role="alert" className="mt-1.5 text-[13px] text-red">
                      {err}
                    </p>
                  ) : f.hint ? (
                    <p id={`${id}-hint`} className="mt-1.5 text-[13px] text-subtle">
                      {def(`field.${f.name}.hint`, f.hint)}
                    </p>
                  ) : null}
                </div>
              );
            })}

            {agent.consent && (
              <div>
                <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-bg-2 p-4">
                  <input
                    ref={consentRef}
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => {
                      setConsent(e.target.checked);
                      setErrors((er) => ({ ...er, consent: "" }));
                    }}
                    aria-invalid={errors.consent ? true : undefined}
                    className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]"
                  />
                  <span className="text-[13px] text-fg">{def("consent", agent.consent)}</span>
                </label>
                {errors.consent && (
                  <p role="alert" className="mt-1.5 text-[13px] text-red">
                    {errors.consent}
                  </p>
                )}
              </div>
            )}
          </div>

          <ProfileLine
            status={memory.status}
            highlights={memory.profile ? profileHighlights(memory.profile) : []}
            enabled={memory.useForRuns}
            checked={profileThisRun}
            onChange={setProfileThisRun}
          />

          <div className="mt-4 flex flex-wrap items-center gap-4">
            <button
              type="submit"
              disabled={phase.kind === "planning"}
              className="inline-flex h-12 items-center gap-2 btn-accent px-6 text-[12px] disabled:opacity-80"
            >
              {phase.kind === "planning" && <LoaderCircle size={17} className="animate-spin-slow" aria-hidden />}
              {t("agents.draft")}
            </button>
            <p className="micro normal-case tracking-normal" aria-live="polite">
              {waking ? t("agents.waking") : t("agents.draftNote")}
            </p>
          </div>
        </form>
      )}

      {phase.kind === "review" && (
        <PlanReview
          note={
            schedule && rerun?.id === schedule.id
              ? fill(t("agents.rerunNote"), { date: <span className="tabular text-fg">{dateFmt.format(new Date(schedule.lastRunAt))}</span> })
              : null
          }
          plan={phase.plan}
          approved={phase.approved}
          onToggle={(id) =>
            setPhase((p) => {
              if (p.kind !== "review") return p;
              const approved = new Set(p.approved);
              if (approved.has(id)) approved.delete(id);
              else approved.add(id);
              return { ...p, approved };
            })
          }
          onEdit={() => setPhase({ kind: "form" })}
          onRun={() => run({ ...phase.plan, steps: phase.plan.steps.filter((s) => phase.approved.has(s.id)) })}
        />
      )}

      {(phase.kind === "running" || phase.kind === "done") && (
        <div className="grid gap-5">
          <div className="card-glow rounded-3xl p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="flex items-center gap-2 font-medium text-fg" aria-live="polite">
                {phase.kind === "running" ? (
                  <>
                    <LoaderCircle size={17} className="animate-spin-slow text-accent" aria-hidden /> {t("agents.working", { name: def("name", agent.name) })}
                  </>
                ) : phase.stopped ? (
                  <>
                    <Square size={15} className="text-muted" aria-hidden /> {t("agents.stopped")}
                  </>
                ) : (
                  <>
                    <Check size={17} className="text-green" aria-hidden /> {t("agents.ready")}
                  </>
                )}
              </p>
              {phase.kind === "running" ? (
                <button
                  type="button"
                  onClick={() => abortRef.current?.abort()}
                  className="inline-flex h-10 items-center gap-1.5 border border-line-strong px-4 text-sm text-fg hover:border-fg/40"
                >
                  <Square size={13} aria-hidden /> {t("agents.stop")}
                </button>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!report}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(report);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                      } catch {}
                    }}
                    className="inline-flex h-10 items-center gap-1.5 border border-line-strong px-4 text-sm text-fg hover:border-fg/40 disabled:opacity-50"
                  >
                    {copied ? <Check size={14} className="text-green" aria-hidden /> : <Copy size={14} aria-hidden />}
                    {copied ? t("common.copied") : t("common.copy")}
                  </button>
                  {report && (
                    <a
                      href={`data:text/markdown;charset=utf-8,${encodeURIComponent(report)}`}
                      download={`${agent.id}-report.md`}
                      className="inline-flex h-10 items-center gap-1.5 border border-line-strong px-4 text-sm text-fg hover:border-fg/40"
                    >
                      <Download size={14} aria-hidden /> {t("agents.download")}
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={reset}
                    className="inline-flex h-10 items-center gap-1.5 bg-fg px-4 text-sm font-semibold text-bg hover:bg-fg/90"
                  >
                    <RotateCcw size={14} aria-hidden /> {t("agents.newRequest")}
                  </button>
                </div>
              )}
            </div>

            {activity.length > 0 && (
              <ul className="mt-4 flex flex-wrap gap-2">
                {activity.map((a, i) => (
                  <li
                    key={i}
                    className="fade-up inline-flex max-w-full items-center gap-1.5 border border-line bg-bg-2 px-3 py-1 text-[13px] text-muted"
                  >
                    {a.kind === "search" ? <Search size={12} className="shrink-0 text-accent" aria-hidden /> : <PenLine size={12} className="shrink-0" aria-hidden />}
                    <span className="truncate">{a.kind === "status" && a.code ? agentsStatus(t, a.code, a.text) : a.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <article className="card-glow min-h-48 rounded-3xl p-5 sm:p-8" aria-busy={phase.kind === "running"}>
            {report ? (
              <ReportMarkdown report={report} checklist={phase.kind === "done" ? checklist : null} />
            ) : phase.kind === "running" ? (
              <div className="space-y-3" aria-label={t("agents.reportLoading")}>
                <div className="h-6 w-1/3 animate-pulse rounded-md bg-surface-3" />
                <div className="h-4 w-full animate-pulse rounded-md bg-surface-2" />
                <div className="h-4 w-5/6 animate-pulse rounded-md bg-surface-2" />
                <div className="h-4 w-2/3 animate-pulse rounded-md bg-surface-2" />
              </div>
            ) : (
              <p className="text-muted">{t("agents.noReport")}</p>
            )}
          </article>

          {phase.kind === "done" && checklist && <ChecklistProgress id={checklist.id} {...progressOf(checklist)} />}

          {phase.kind === "done" && !phase.stopped && report && baseline && <ReportDiff prev={baseline.report} next={report} since={baseline.at} />}

          {phase.kind === "done" && !phase.stopped && report && !agent.noSchedule && (
            <ScheduleOffer every={schedule?.every ?? 0} nextRunAt={schedule?.nextRunAt} onChange={(days) => changeSchedule(days, phase.plan)} />
          )}

          {phase.kind === "done" && !phase.stopped && report && offer && <ShareRun key={offer.sig} offer={offer} agentId={agentId} />}

          {sources.length > 0 && (
            <details className="rounded-3xl border border-line bg-surface/70 p-5 sm:p-6">
              <summary className="cursor-pointer font-medium text-fg">
                {t("agents.sources")} <span className="tabular text-muted">({sources.length})</span>
              </summary>
              <ul className="mt-4 space-y-2">
                {sources.map((s) => (
                  <li key={s.url}>
                    <a href={s.url} target="_blank" rel="noreferrer noopener" className="group flex items-start gap-2 text-sm">
                      <ExternalLink size={14} className="mt-0.5 shrink-0 text-subtle group-hover:text-accent" aria-hidden />
                      <span className="min-w-0">
                        <span className="block truncate text-fg group-hover:underline">{s.title || s.url}</span>
                        <span className="block truncate font-mono text-xs text-subtle">{new URL(s.url).hostname}</span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function PlanReview({
  note,
  plan,
  approved,
  onToggle,
  onEdit,
  onRun,
}: {
  note?: ReactNode;
  plan: AgentPlan;
  approved: Set<string>;
  onToggle: (id: string) => void;
  onEdit: () => void;
  onRun: () => void;
}) {
  const t = useT();
  const count = approved.size;
  return (
    <div className="card-glow fade-up rounded-3xl p-5 sm:p-7">
      {note && (
        <p className="mb-5 flex items-start gap-2 border border-accent/30 bg-accent/[0.06] px-4 py-3 text-[13px] leading-relaxed text-muted">
          <CalendarClock size={15} className="mt-0.5 shrink-0 text-accent" aria-hidden />
          <span>{note}</span>
        </p>
      )}
      <p className="eyebrow">{note ? t("agents.plan.last") : t("agents.plan.proposed")}</p>
      <p className="mt-3 text-[14px] leading-relaxed text-fg">{plan.summary}</p>
      {plan.caveat && <p className="mt-3 rounded-xl border border-line bg-bg-2 px-4 py-3 text-sm text-muted">{plan.caveat}</p>}

      <fieldset className="mt-6">
        <legend className="mb-3 text-sm text-muted">{t("agents.plan.untick")}</legend>
        <ul className="grid gap-2">
          {plan.steps.map((s: PlanStep, i) => {
            const Icon = KIND_ICON[s.kind];
            const on = approved.has(s.id);
            return (
              <li key={s.id}>
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors ${
                    on ? "border-line-strong bg-bg-2" : "border-line bg-transparent opacity-60"
                  }`}
                >
                  <input type="checkbox" checked={on} onChange={() => onToggle(s.id)} className="mt-1 size-5 shrink-0 accent-[var(--accent)]" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 font-medium text-fg">
                      <span className="font-mono text-xs text-subtle">{String(i + 1).padStart(2, "0")}</span>
                      {s.title}
                    </span>
                    <span className="mt-1 block text-sm text-muted">{s.detail}</span>
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-surface-3 px-2 py-1 text-[11px] uppercase tracking-wider text-subtle">
                    <Icon size={11} aria-hidden /> {t(`agents.kind.${s.kind}`)}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>

      <div className="mt-7 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onRun}
          disabled={count === 0}
          className="inline-flex min-h-12 max-w-full items-center gap-2 btn-accent px-6 py-2 text-left text-[12px] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {count === 1 ? t("agents.plan.runOne") : t("agents.plan.runMany", { count })}
        </button>
        <button type="button" onClick={onEdit} className="inline-flex h-11 items-center gap-1.5 border border-line px-4 text-[12px] uppercase tracking-wider text-muted hover:border-line-strong hover:text-fg">
          <PenLine size={15} aria-hidden /> {t("agents.plan.edit")}
        </button>
      </div>
      {count === 0 && <p className="mt-2 text-[13px] text-subtle">{t("agents.plan.none")}</p>}
    </div>
  );
}

/**
 * Above the form's submit button: which saved profile details this run will use, with a per-run
 * opt-out — or, without a profile, a quiet link to save one.
 */
function ProfileLine({
  status,
  highlights,
  enabled,
  checked,
  onChange,
}: {
  status: "loading" | "empty" | "ready" | "unavailable";
  highlights: string[];
  enabled: boolean;
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  const t = useT();
  const link = "underline decoration-line-strong underline-offset-2 hover:text-fg hover:decoration-accent";
  if (status === "loading") return <div className="mt-6 min-h-11" aria-hidden />;
  if (!highlights.length) {
    return (
      <p className="mt-6 flex min-h-11 items-center gap-2 text-[13px] text-subtle">
        <UserRound size={14} className="shrink-0" aria-hidden />
        <Link href="/agents#memory" className={link}>
          {t("agentkit.use.save")}
        </Link>
      </p>
    );
  }
  if (!enabled) {
    return (
      <p className="mt-6 flex min-h-11 flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-subtle">
        <UserRound size={14} className="shrink-0" aria-hidden />
        <span>{t("agentkit.use.off")}</span>
        <Link href="/agents#memory" className={link}>
          {t("agentkit.use.change")}
        </Link>
      </p>
    );
  }
  return (
    <div className="mt-6 flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 border border-line bg-bg-2 px-3 py-2 text-[13px]">
      <label className="flex min-w-0 cursor-pointer items-center gap-2.5">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-5 shrink-0 accent-[var(--accent)]" />
        <span className={checked ? "text-muted" : "text-subtle line-through decoration-line-strong"}>
          {t("agentkit.use.label")} <span className={checked ? "text-fg" : ""}>{highlights.join(" · ")}</span>
        </span>
      </label>
      <Link href="/agents#memory" className={`text-muted ${link}`}>
        {t("agentkit.use.edit")}
      </Link>
      {!checked && <span className="w-full text-[12px] text-subtle sm:w-auto">{t("agentkit.use.skipped")}</span>}
    </div>
  );
}

/** Under a finished report: "3 of 11 done", with a link to the saved checklist. */
function ChecklistProgress({ id, done, total }: { id: string; done: number; total: number }) {
  const t = useT();
  return (
    <div className="card-glow flex flex-wrap items-center gap-x-4 gap-y-2 rounded-3xl p-5 sm:p-6">
      <p className="flex items-center gap-2 text-[14px] text-fg" aria-live="polite">
        <ListChecks size={16} className={done === total ? "text-green" : "text-accent"} aria-hidden />
        <span className="tabular">{t("agentkit.cl.progress", { done, total })}</span>
      </p>
      <div role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label={t("agentkit.ws.progressAria")} className="h-1 w-24 overflow-hidden bg-surface-3">
        <div className={`h-full origin-left ${done === total ? "bg-green" : "bg-accent"}`} style={{ transform: `scaleX(${total ? done / total : 0})` }} />
      </div>
      <p className="min-w-0 flex-1 text-[13px] text-subtle">{t("agentkit.ws.saved")}</p>
      <Link href={checklistHref(id)} className="inline-flex h-10 items-center border border-line-strong px-4 text-sm text-fg hover:border-fg/40">
        {t("agentkit.ws.open")}
      </Link>
    </div>
  );
}

/** Progress line sent by the server ("searching", "offline"), translated by code. */
function agentsStatus(t: (key: string) => string, code: string, fallback: string) {
  const key = `agents.status.${code}`;
  const out = t(key);
  return out === key ? fallback : out;
}
