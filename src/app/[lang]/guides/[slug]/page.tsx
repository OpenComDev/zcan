import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, Bot, CloudOff } from "lucide-react";
import Link from "@/components/locale-link";
import { GuideTool } from "@/components/guides/guide-tool";
import { Panel } from "@/components/hud/panel";
import { GUIDES, getGuide } from "@/lib/guides";
import { isLocale, localePath, type Locale } from "@/lib/locales";
import { languageAlternates } from "@/lib/page-meta";
import { translate } from "@/lib/translate";

type Props = { params: Promise<{ lang: string; slug: string }> };

const SITE = "https://www.zcan.dev";

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, lang } = await params;
  if (!getGuide(slug)) return {};
  const locale: Locale = isLocale(lang) ? lang : "en";
  const title = translate(locale, `guides.${slug}.q`);
  const description = translate(locale, `guides.${slug}.desc`);
  const alternates = languageAlternates(`/guides/${slug}`, locale);
  return { title, description, alternates, openGraph: { type: "article", title, description, url: alternates.canonical as string } };
}

export default function GuidePage({ params }: Props) {
  return (
    <Suspense fallback={<div className="panel h-[640px] animate-pulse" aria-busy="true" />}>
      <Guide params={params} />
    </Suspense>
  );
}

async function Guide({ params }: Props) {
  const { slug, lang } = await params;
  const g = getGuide(slug);
  if (!g) notFound();
  const locale: Locale = isLocale(lang) ? lang : "en";
  const t = (key: string, vars?: Record<string, string>) => translate(locale, `guides.${key}`, vars);
  const s = (key: string) => t(`${slug}.${key}`);
  const steps = Array.from({ length: g.steps }, (_, i) => s(`step${i + 1}`));
  const faqs = Array.from({ length: g.faqs }, (_, i) => ({ q: s(`faq${i + 1}.q`), a: s(`faq${i + 1}.a`) }));
  const url = `${SITE}${localePath(`/guides/${slug}`, locale)}`;

  // Structured data for search engines: the question, its steps and its FAQ, and where the page sits.
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "HowTo",
        name: s("q"),
        description: s("desc"),
        inLanguage: locale,
        url,
        step: steps.map((text, i) => ({ "@type": "HowToStep", position: i + 1, text })),
      },
      {
        "@type": "FAQPage",
        inLanguage: locale,
        mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Zcan", item: `${SITE}${localePath("/", locale)}` },
          { "@type": "ListItem", position: 2, name: t("index.title"), item: `${SITE}${localePath("/guides", locale)}` },
          { "@type": "ListItem", position: 3, name: s("q"), item: url },
        ],
      },
    ],
  };

  const tool = g.tool;
  const toolName = "embed" in tool ? null : translate(locale, tool.nameKey);

  return (
    <div className="grid gap-3">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <Panel
        as="article"
        title={t("index.eyebrow")}
        meta={
          <Link href="/guides" className="flex items-center gap-1 hover:text-fg">
            <ArrowLeft size={12} aria-hidden /> {t("label.all")}
          </Link>
        }
        marks
        bodyClassName="p-5 sm:p-7"
      >
        <h1 className="display text-[26px] text-fg sm:text-[36px]" style={{ textWrap: "balance" }}>
          {s("q")}
        </h1>
        <section aria-labelledby="answer" className="mt-5 max-w-2xl border-l-2 border-accent pl-4">
          <h2 id="answer" className="eyebrow">
            {t("label.answer")}
          </h2>
          <p className="mt-2 text-[15px] leading-relaxed text-fg">{s("answer")}</p>
        </section>
        {!("embed" in tool) && (
          <Link
            href={tool.href}
            className="btn-accent mt-6 inline-flex h-11 items-center gap-2 px-5 text-[12px]"
          >
            {tool.agent ? <Bot size={15} aria-hidden /> : null}
            {t("label.open", { name: toolName ?? "" })} <ArrowRight size={14} aria-hidden />
          </Link>
        )}
      </Panel>

      {"embed" in tool && (
        <section aria-label={t("label.tool")} className="grid gap-2">
          <p className="micro flex items-center gap-1.5 px-1">
            <CloudOff size={12} aria-hidden /> {t("label.local")}
          </p>
          <GuideTool tool={tool.embed} />
        </section>
      )}

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title={t("label.steps")} bodyClassName="p-5 sm:p-6">
          <ol className="grid gap-3">
            {steps.map((text, i) => (
              <li key={i} className="flex gap-3 text-[14px] leading-relaxed text-text">
                <span className="tabular mt-0.5 inline-flex size-6 shrink-0 items-center justify-center border border-line text-[11px] text-accent">{i + 1}</span>
                <span className="min-w-0">{text}</span>
              </li>
            ))}
          </ol>
          {"embed" in tool && (
            <Link href={tool.href} className="mt-5 inline-flex min-h-6 items-center gap-1 text-[12px] uppercase tracking-wider text-muted hover:text-accent">
              {t("label.open", { name: translate(locale, "shell.nav.tools") })} <ArrowUpRight size={12} aria-hidden />
            </Link>
          )}
        </Panel>
        <Panel title={t("label.why")} bodyClassName="p-5 sm:p-6">
          <p className="text-[14px] leading-relaxed text-text">{s("why")}</p>
        </Panel>
      </div>

      <Panel title={t("label.faq")} bodyClassName="p-0">
        <div className="divide-y divide-line">
          {faqs.map((f, i) => (
            <details key={i} className="group px-5 py-4 sm:px-6">
              <summary className="cursor-pointer list-none text-[14px] font-medium text-fg marker:hidden [&::-webkit-details-marker]:hidden">
                <span className="mr-2 text-accent group-open:hidden" aria-hidden>+</span>
                <span className="mr-2 hidden text-accent group-open:inline" aria-hidden>−</span>
                {f.q}
              </summary>
              <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </Panel>

      <Panel title={t("label.related")} bodyClassName="p-0">
        <ul className="grid divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {g.related.map((r) => (
            <li key={r} className="min-w-0">
              <Link href={`/guides/${r}`} className="group flex h-full min-w-0 items-start justify-between gap-3 p-5 text-[14px] text-text hover:bg-surface-2 hover:text-fg">
                <span className="min-w-0">{translate(locale, `guides.${r}.q`)}</span>
                <ArrowRight size={14} className="mt-1 shrink-0 text-subtle group-hover:text-accent" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
