import Link from "@/components/locale-link";
import { ArrowRight } from "lucide-react";
import { AgentIcon } from "@/components/agent-icon";
import { SchedulesPanel } from "@/components/agents/schedules-panel";
import { ChecklistsPanel } from "@/components/agents/checklists-panel";
import { MemoryPanel } from "@/components/agents/memory-panel";
import { ContributionsPanel } from "@/components/agents/contributions-panel";
import { EyeOrb } from "@/components/eye-orb";
import { Panel } from "@/components/hud/panel";
import { AGENTS } from "@/lib/agents";
import { T } from "@/lib/i18n";
import { AI_MODEL_NAME } from "@/lib/ai-model";
import { pageMeta } from "@/lib/page-meta";

export function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  return pageMeta(params, "/agents", "agents");
}

/** Text lives under agents.flow.<n>.title / .body. */
const FLOW = [1, 2, 3] as const;

export default function AgentsPage() {
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title={<T k="agents.title" />} meta={<span><T k="agents.webApp" /></span>} marks bodyClassName="p-5 sm:p-7 flex flex-col justify-center h-full">
          <p className="eyebrow"><T k="agents.eyebrow" /></p>
          <h1 className="mt-4 text-[34px] font-medium uppercase leading-[1.05] tracking-tight text-fg sm:text-[46px]">
            <T k="agents.hero.pre" />
            <span className="text-accent"><T k="agents.hero.accent" /></span>
            <T k="agents.hero.post" />
          </h1>
          <p className="mt-5 max-w-md text-[13px] leading-relaxed text-muted">
            <T k="agents.lead" />
          </p>
        </Panel>
        <div className="dots relative flex min-h-[320px] items-center justify-center border border-line">
          <EyeOrb className="w-full max-w-[400px]" />
          <span className="micro absolute left-4 top-4"><T k="agents.coreIdle" /></span>
          <span className="micro absolute bottom-4 right-4">{AI_MODEL_NAME}</span>
        </div>
      </div>

      <Panel title={<T k="agents.list" />} meta={<span><T k="agents.available" vars={{ n: AGENTS.length }} /></span>} bodyClassName="p-0">
        <ul className="divide-y divide-line">
          {AGENTS.map((a, i) => (
            <li key={a.id}>
              <Link href={`/agents/${a.id}`} className="group grid grid-cols-[auto_1fr_auto] items-center gap-4 px-4 py-4 transition-colors hover:bg-surface-2 sm:px-5">
                <AgentIcon icon={a.icon} />
                <span className="min-w-0">
                  <span className="flex items-center gap-3">
                    <span className="micro tabular">{String(i + 1).padStart(2, "0")}</span>
                    <span className="min-w-0 truncate text-[14px] font-medium uppercase tracking-wide text-fg"><T k={`agents.def.${a.id}.name`} /></span>
                  </span>
                  <span className="mt-1 block truncate text-[13px] text-muted"><T k={`agents.def.${a.id}.tagline`} /></span>
                </span>
                <span className="inline-flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted group-hover:text-accent">
                  <span className="hidden sm:inline"><T k="agents.start" /></span> <ArrowRight size={14} aria-hidden />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Panel>

      <ChecklistsPanel />
      <SchedulesPanel />
      <MemoryPanel />
      <ContributionsPanel />

      <Panel title={<T k="agents.flow.title" />} bodyClassName="p-0">
        <ol className="grid divide-y divide-line md:grid-cols-3 md:divide-x md:divide-y-0">
          {FLOW.map((n) => (
            <li key={n} className="min-w-0 p-5">
              <span className="inline-flex items-center gap-3 border border-line bg-bg-2 py-1 pl-1 pr-3">
                <span className="flex size-6 items-center justify-center bg-surface-3 text-[11px] text-fg">{n}</span>
                <span className="text-[12px] font-medium uppercase tracking-wider text-fg"><T k={`agents.flow.${n}.title`} /></span>
                <ArrowRight size={12} className="text-subtle" aria-hidden />
              </span>
              <p className="mt-3 text-[13px] leading-relaxed text-muted"><T k={`agents.flow.${n}.body`} /></p>
            </li>
          ))}
        </ol>
        <p className="micro border-t border-line px-5 py-3 normal-case tracking-normal">
          <T k="agents.flow.note" vars={{ model: AI_MODEL_NAME }} />
        </p>
      </Panel>
    </div>
  );
}
