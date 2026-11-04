import Link from "@/components/locale-link";
import { Panel } from "@/components/hud/panel";
import { T } from "@/lib/i18n";
import { AI_MODEL_NAME } from "@/lib/ai-model";
import { pageMeta } from "@/lib/page-meta";

export function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  return pageMeta(params, "/help", "help");
}

/** Text lives in src/i18n/help.ts: `help.step.{n}.title/body` and `help.faq.{n}.q/a`. */
const STEPS = [1, 2, 3, 4];
const FAQ = [1, 2, 3, 4, 5, 6, 7, 8];

export default function HelpPage() {
  return (
    <div className="grid gap-3">
      <h1 className="sr-only">
        <T k="help.title" />
      </h1>
      <Panel title={<T k="help.how" />} bodyClassName="p-0">
        <ol className="grid divide-y divide-line sm:grid-cols-2 sm:divide-y-0 xl:grid-cols-4 xl:divide-x">
          {STEPS.map((n) => (
            <li key={n} className="min-w-0 p-5 sm:border-b sm:border-line xl:border-b-0">
              <p className="num text-[40px] text-fg">{String(n).padStart(2, "0")}</p>
              <p className="mt-3 w-fit border-t border-line-strong pt-1.5 text-[12px] uppercase tracking-wider text-fg">
                <T k={`help.step.${n}.title`} />
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-muted">
                <T k={`help.step.${n}.body`} />
              </p>
            </li>
          ))}
        </ol>
      </Panel>
      <Panel
        title={<T k="help.questions" />}
        meta={
          <span>
            <T k="help.entries" vars={{ n: FAQ.length }} />
          </span>
        }
        bodyClassName="p-0"
      >
        <div className="divide-y divide-line">
          {FAQ.map((n) => (
            <details key={n} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-[13px] uppercase tracking-wide text-fg transition-colors hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
                <span className="min-w-0">
                  <T k={`help.faq.${n}.q`} />
                </span>
                <span className="shrink-0 text-subtle transition-transform duration-200 group-open:rotate-45 group-open:text-accent" aria-hidden>
                  +
                </span>
              </summary>
              <p className="px-5 pb-5 text-[13px] leading-relaxed text-muted">
                <T k={`help.faq.${n}.a`} vars={{ model: AI_MODEL_NAME }} />
              </p>
            </details>
          ))}
        </div>
      </Panel>
      <p className="px-1 text-[13px] leading-relaxed text-muted">
        <T k="trust.help.line" />{" "}
        <Link href="/security" className="text-fg underline decoration-line-strong underline-offset-2 hover:text-accent">
          <T k="trust.help.security" />
        </Link>
        {" · "}
        <Link href="/transparency" className="text-fg underline decoration-line-strong underline-offset-2 hover:text-accent">
          <T k="trust.help.transparency" />
        </Link>
      </p>
    </div>
  );
}
