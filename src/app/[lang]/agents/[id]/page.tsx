import type { Metadata } from "next";
import Link from "@/components/locale-link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { AgentIcon } from "@/components/agent-icon";
import { Panel } from "@/components/hud/panel";
import { AGENTS, agentText, getAgent } from "@/lib/agents";
import { isLocale } from "@/lib/locales";
import { translate } from "@/lib/translate";
import { languageAlternates } from "@/lib/page-meta";
import { T } from "@/lib/i18n";
import { AgentWorkspace, AgentWorkspaceLoader } from "./agent-workspace";
import { AI_MODEL_NAME } from "@/lib/ai-model";

type Props = { params: Promise<{ lang: string; id: string }> };

export function generateStaticParams() {
  return AGENTS.map((a) => ({ id: a.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, lang } = await params;
  const agent = getAgent(id);
  if (!agent) return {};
  const locale = isLocale(lang) ? lang : "en";
  const path = `/agents/${agent.id}`;
  const title = agentText((k) => translate(locale, k), agent.id, "name", agent.name);
  const description = agentText((k) => translate(locale, k), agent.id, "tagline", agent.tagline);
  const alternates = languageAlternates(path, locale);
  return { title, description, alternates, openGraph: { title, description, url: alternates.canonical as string } };
}

export default function AgentPage({ params }: Props) {
  return (
    <Suspense fallback={<div className="panel h-[520px] animate-pulse" aria-busy="true">
          <span className="sr-only"><T k="common.loading" /></span>
        </div>}>
      <AgentContent params={params} />
    </Suspense>
  );
}

async function AgentContent({ params }: { params: Props["params"] }) {
  const agent = getAgent((await params).id);
  if (!agent) notFound();

  return (
    <div className="grid gap-3 xl:grid-cols-[340px_minmax(0,1fr)]">
      <Panel
        title={<T k="agents.agent" />}
        meta={
          <Link href="/agents" className="flex items-center gap-1 hover:text-fg">
            <ArrowLeft size={12} aria-hidden /> <T k="agents.all" />
          </Link>
        }
        marks
      >
        <div className="flex items-center gap-3">
          <AgentIcon icon={agent.icon} size={44} />
          <h1 className="min-w-0 break-words text-[18px] font-medium uppercase tracking-wide text-fg"><T k={`agents.def.${agent.id}.name`} /></h1>
        </div>
        <p className="mt-4 text-[13px] leading-relaxed text-muted"><T k={`agents.def.${agent.id}.description`} /></p>
        <dl className="mt-5 grid gap-2 border-t border-line pt-4 text-[12px] uppercase">
          <div className="flex justify-between gap-3"><dt className="text-subtle"><T k="agents.meta.model" /></dt><dd className="text-right text-text">{AI_MODEL_NAME}</dd></div>
          <div className="flex justify-between gap-3">
            <dt className="text-subtle"><T k="agents.meta.web" /></dt>
            <dd className="text-right text-text">
              <T k={agent.usesWeb ? (process.env.TAVILY_API_KEY ? "agents.meta.webPublic" : "agents.meta.webOff") : "agents.meta.off"} />
            </dd>
          </div>
          <div className="flex justify-between gap-3"><dt className="text-subtle"><T k="agents.meta.approval" /></dt><dd className="text-right text-accent"><T k="agents.meta.everyStep" /></dd></div>
          <div className="flex justify-between gap-3"><dt className="text-subtle"><T k="agents.meta.storage" /></dt><dd className="text-right text-text"><T k="agents.meta.storageValue" /></dd></div>
        </dl>
      </Panel>
      {/* The fallback is the plain workspace; the loader swaps in a pre-filled one for ?rerun=<scheduleId>. */}
      <Suspense fallback={<AgentWorkspace agentId={agent.id} />}>
        <AgentWorkspaceLoader agentId={agent.id} />
      </Suspense>
    </div>
  );
}
