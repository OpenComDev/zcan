import Link from "@/components/locale-link";
import { ArrowRight } from "lucide-react";
import { Panel } from "@/components/hud/panel";
import { ARTICLES } from "@/components/learn/articles";
import { LearnProgressBar, ReadBadge } from "@/components/learn/learn-client";
import { T } from "@/lib/i18n";
import { pageMeta } from "@/lib/page-meta";

export function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  return pageMeta(params, "/learn", "learn");
}

export default function LearnPage() {
  return (
    <div className="grid gap-3">
      <Panel title={<T k="learn.panel" />} meta={<span><T k="learn.meta" vars={{ n: ARTICLES.length }} /></span>} marks bodyClassName="p-5 sm:p-7">
        <p className="eyebrow"><T k="learn.eyebrow" /></p>
        <h1 className="display mt-4 text-[30px] text-fg sm:text-[40px]">
          <T k="learn.headA" /> <span className="text-accent"><T k="learn.headB" /></span>
        </h1>
        <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-muted">
          <T k="learn.intro" />
        </p>
        <div className="mt-6 max-w-md">
          <LearnProgressBar slugs={ARTICLES.map((a) => a.slug)} />
        </div>
      </Panel>

      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {ARTICLES.map(({ slug, n, minutes, Diagram }) => (
          <li key={slug} className="min-w-0">
            <Link
              href={`/learn/${slug}`}
              className="panel group flex h-full flex-col outline-none transition-colors duration-150 hover:border-line-strong focus-visible:border-accent"
            >
              <div className="panel-head">
                <span className="label truncate">
                  {n} · <T k="learn.explainer" />
                </span>
                <ReadBadge slug={slug} />
              </div>
              <div className="dots pointer-events-none border-b border-line p-3" aria-hidden>
                <Diagram />
              </div>
              <div className="flex flex-1 flex-col p-4">
                <h2 className="text-[15px] font-medium uppercase tracking-wide text-fg">
                  <T k={`learn.${slug}.title`} />
                </h2>
                <p className="mt-2 flex-1 text-[13px] leading-relaxed text-muted">
                  <T k={`learn.${slug}.summary`} />
                </p>
                <p className="micro mt-4 flex items-center justify-between gap-3">
                  <span>
                    <T k="learn.minRead" vars={{ n: minutes }} />
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-text transition-colors duration-150 group-hover:text-accent">
                    <T k="learn.readCta" /> <ArrowRight size={12} aria-hidden />
                  </span>
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
