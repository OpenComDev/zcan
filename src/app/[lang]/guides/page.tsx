import { ArrowRight, Bot, CloudOff } from "lucide-react";
import Link from "@/components/locale-link";
import { Panel } from "@/components/hud/panel";
import { GUIDES } from "@/lib/guides";
import { pageMeta } from "@/lib/page-meta";
import { T } from "@/lib/i18n";

export function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  return pageMeta(params, "/guides", "guides");
}

export default function GuidesPage() {
  return (
    <div className="grid gap-3">
      <Panel title={<T k="guides.index.eyebrow" />} meta={<span>{GUIDES.length}</span>} marks bodyClassName="p-5 sm:p-7">
        <h1 className="display text-[28px] text-fg sm:text-[40px]" style={{ textWrap: "balance" }}>
          <T k="guides.index.h1" />
        </h1>
        <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-muted">
          <T k="guides.index.lead" />
        </p>
      </Panel>
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {GUIDES.map((g) => (
          <li key={g.slug} className="min-w-0">
            <Link href={`/guides/${g.slug}`} className="panel group flex h-full min-w-0 flex-col gap-3 p-5 transition-colors hover:border-line-strong">
              <span className="micro flex items-center gap-1.5">
                {"embed" in g.tool ? <CloudOff size={12} aria-hidden /> : <Bot size={12} aria-hidden />}
                {"embed" in g.tool ? <T k="guides.label.local" /> : "agent" in g.tool && g.tool.agent ? <T k="guides.label.agent" /> : <T k="shell.nav.swap" />}
              </span>
              <span className="text-[16px] font-medium text-fg text-balance">
                <T k={`guides.${g.slug}.q`} />
              </span>
              <span className="line-clamp-3 text-[13px] leading-relaxed text-muted">
                <T k={`guides.${g.slug}.desc`} />
              </span>
              <span className="mt-auto inline-flex items-center gap-1 text-[12px] uppercase tracking-wider text-subtle group-hover:text-accent">
                <T k="guides.label.answer" /> <ArrowRight size={12} aria-hidden />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
