"use client";

import { ChevronDown, FileText, ListChecks, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { AgentIcon } from "@/components/agent-icon";
import { ReportMarkdown, StepText } from "@/components/agents/report-markdown";
import { EmptyState } from "@/components/onboarding/empty-state";
import { Panel } from "@/components/hud/panel";
import { progressOf, removeChecklist, restoreChecklist, toggleItem, unfinishedCount, useChecklists, type Checklist, type ChecklistItem } from "@/lib/agent-checklists";
import { agentText, getAgent } from "@/lib/agents";
import { useLocale, useT } from "@/lib/i18n";
import { setHash, useHash } from "@/lib/use-hash";

/** Deep link to one checklist on /agents (opens it). */
export const checklistHref = (id: string) => `/agents#checklist-${encodeURIComponent(id)}`;

/** "Your checklists" on /agents: follow-through steps from finished reports, ticked off over time. */
export function ChecklistsPanel() {
  const t = useT();
  const list = useChecklists();
  const hash = useHash();
  const [undo, setUndo] = useState<Checklist | null>(null);

  return (
    <Panel
      id="checklists"
      title={t("agentkit.cl.title")}
      meta={<span className="tabular">{list.length ? t("agentkit.cl.meta", { n: list.length, open: unfinishedCount(list) }) : "0"}</span>}
      bodyClassName="p-0"
      className="scroll-mt-20"
    >
      {list.length === 0 ? (
        <EmptyState compact icon={<ListChecks size={20} />} title={t("agentkit.cl.emptyTitle")} body={t("agentkit.cl.emptyBody")} />
      ) : (
        <ul className="divide-y divide-line" aria-label={t("agentkit.cl.title")}>
          {list.map((c) => (
            <ChecklistRow
              key={c.id}
              c={c}
              linked={hash === `#checklist-${c.id}`}
              onDelete={() => {
                removeChecklist(c.id);
                setUndo(c);
                if (hash === `#checklist-${c.id}`) setHash("");
              }}
            />
          ))}
        </ul>
      )}
      <div aria-live="polite" className={undo ? "flex flex-wrap items-center gap-3 border-t border-line bg-surface-2 px-4 py-2.5 text-[13px] text-fg sm:px-5" : "sr-only"}>
        {undo && (
          <>
            <span>{t("agentkit.cl.deleted")}</span>
            <button
              type="button"
              onClick={() => {
                restoreChecklist(undo);
                setUndo(null);
              }}
              className="inline-flex h-9 items-center border border-line px-3 text-[11px] uppercase tracking-wider text-fg hover:border-line-strong"
            >
              {t("agentkit.cl.undo")}
            </button>
          </>
        )}
      </div>
      <p className="micro border-t border-line px-4 py-3 normal-case tracking-normal sm:px-5">{t("agentkit.cl.note")}</p>
    </Panel>
  );
}

function ChecklistRow({ c, linked, onDelete }: { c: Checklist; linked: boolean; onDelete: () => void }) {
  const t = useT();
  const locale = useLocale();
  const [expandedState, setExpanded] = useState(false);
  const expanded = expandedState || linked;
  const [confirming, setConfirming] = useState(false);
  const bodyId = useId();
  const agent = getAgent(c.agentId);
  const name = agent ? agentText(t, agent.id, "name", agent.name) : c.agentId;
  const { done, total } = progressOf(c);
  const pct = total ? Math.round((done / total) * 100) : 0;
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  const rowRef = useRef<HTMLLIElement>(null);

  // The list renders after hydration, so the browser's own jump to #checklist-… can't find it; do it here.
  useEffect(() => {
    if (linked) rowRef.current?.scrollIntoView({ block: "start" });
  }, [linked]);

  const groups: { name: string; items: ChecklistItem[] }[] = [];
  for (const it of c.items) {
    const last = groups[groups.length - 1];
    if (last && last.name === it.group) last.items.push(it);
    else groups.push({ name: it.group, items: [it] });
  }

  return (
    <li ref={rowRef} id={`checklist-${c.id}`} className="scroll-mt-24">
      <div className="grid gap-3 px-4 py-4 sm:px-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div className="flex min-w-0 items-center gap-3">
          {agent && <AgentIcon icon={agent.icon} size={36} />}
          <div className="min-w-0 flex-1">
            <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span className="min-w-0 text-[13px] font-medium uppercase tracking-wide text-fg">{name}</span>
              {done === total && total > 0 && <span className="tag text-green">{t("agentkit.cl.finished")}</span>}
            </p>
            {c.title && <p className="mt-0.5 truncate text-[13px] text-muted">{c.title}</p>}
            <p className="mt-1 text-[12px] text-subtle">
              <time dateTime={c.createdAt} className="tabular text-text">
                {dateFmt.format(new Date(c.createdAt))}
              </time>
              <span aria-hidden> · </span>
              <span className="tabular">{t("agentkit.cl.progress", { done, total })}</span>
            </p>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={done}
              aria-label={t("agentkit.cl.progressAria", { name, done, total })}
              className="mt-2 h-1 w-full max-w-xs overflow-hidden bg-surface-3"
            >
              <div className={`h-full origin-left ${done === total ? "bg-green" : "bg-accent"}`} style={{ transform: `scaleX(${pct / 100})` }} />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={bodyId}
            onClick={() => {
              if (expanded && linked) setHash("");
              setExpanded(!expanded);
            }}
            className="inline-flex h-10 items-center gap-1.5 border border-line px-4 text-[12px] uppercase tracking-wider text-muted transition-colors hover:border-line-strong hover:text-fg"
          >
            <ChevronDown size={14} className={`transition-transform motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`} aria-hidden />
            {expanded ? t("agentkit.cl.hide") : t("agentkit.cl.show")}
          </button>
          {confirming ? (
            <span className="inline-flex items-center gap-2">
              <button
                type="button"
                autoFocus
                onClick={onDelete}
                className="inline-flex h-10 items-center border border-red/50 px-3 text-[11px] uppercase tracking-wider text-red hover:bg-red/10"
              >
                {t("common.delete")}
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="inline-flex h-10 items-center px-2 text-[11px] uppercase tracking-wider text-muted hover:text-fg">
                {t("common.cancel")}
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              aria-label={t("agentkit.cl.delete", { name })}
              className="flex size-10 items-center justify-center border border-line text-subtle hover:border-line-strong hover:text-fg"
            >
              <Trash2 size={14} aria-hidden />
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div id={bodyId} className="grid gap-4 border-t border-line bg-bg-2/40 px-4 py-4 sm:px-5">
          {groups.map((g, gi) => (
            <fieldset key={`${gi}-${g.name}`} className="min-w-0">
              <legend className="label mb-2 text-muted">{g.name || t("agentkit.cl.steps")}</legend>
              <ul className="grid gap-1.5">
                {g.items.map((it) => (
                  <li key={it.id}>
                    <label className="flex min-h-11 cursor-pointer items-start gap-3 border border-line bg-surface px-3 py-2.5 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent">
                      <input
                        type="checkbox"
                        checked={it.done}
                        onChange={(e) => toggleItem(c.id, it.id, e.target.checked)}
                        className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]"
                      />
                      <span className={`min-w-0 flex-1 break-words text-[13px] leading-relaxed ${it.done ? "text-muted" : "text-text"}`}>
                        <StepText text={it.text} />
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
          ))}

          <details className="border border-line bg-surface">
            <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-3 py-2.5 text-[12px] uppercase tracking-wider text-muted hover:text-fg">
              <FileText size={14} aria-hidden /> {t("agentkit.cl.openReport")}
            </summary>
            <div className="border-t border-line p-4 sm:p-6">
              <ReportMarkdown report={c.report} checklist={c} />
            </div>
          </details>
        </div>
      )}
    </li>
  );
}
