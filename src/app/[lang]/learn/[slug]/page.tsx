import type { Metadata } from "next";
import Link from "@/components/locale-link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, ArrowRight, ExternalLink } from "lucide-react";
import { Panel } from "@/components/hud/panel";
import { ARTICLES, getArticle } from "@/components/learn/articles";
import { ExplainerFallback, ExplainerNav, ReadOnView, ReadToggle, Rich } from "@/components/learn/learn-client";
import { T } from "@/lib/i18n";
import { isLocale } from "@/lib/locales";
import { translate } from "@/lib/translate";
import { languageAlternates } from "@/lib/page-meta";

type Props = { params: Promise<{ slug: string; lang: string }> };

export function generateStaticParams() {
  return ARTICLES.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, lang } = await params;
  const article = getArticle(slug);
  if (!article) return {};
  const locale = isLocale(lang) ? lang : "en";
  const title = translate(locale, `learn.${slug}.title`);
  const description = translate(locale, `learn.${slug}.summary`);
  const alternates = languageAlternates(`/learn/${slug}`, locale);
  return { title, description, alternates, openGraph: { type: "article", title, description, url: alternates.canonical as string } };
}

export default function LearnArticlePage({ params }: Props) {
  return (
    <Suspense fallback={<ExplainerFallback />}>
      <Article params={params} />
    </Suspense>
  );
}

async function Article({ params }: { params: Props["params"] }) {
  const { slug } = await params;
  const i = ARTICLES.findIndex((a) => a.slug === slug);
  if (i < 0) notFound();
  const a = ARTICLES[i];
  const prev = ARTICLES[i - 1];
  const next = ARTICLES[i + 1];
  const { Diagram } = a;

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Panel
        as="article"
        title={<T k="learn.crumb" vars={{ n: a.n }} />}
        meta={
          <Link href="/learn" className="flex items-center gap-1 hover:text-fg">
            <ArrowLeft size={12} aria-hidden /> <T k="learn.all" />
          </Link>
        }
        marks
        bodyClassName="p-5 sm:p-7"
      >
        <p className="eyebrow">
          <T k="learn.minRead" vars={{ n: a.minutes }} />
        </p>
        <h1 className="display mt-3 text-[26px] text-fg sm:text-[36px]" style={{ textWrap: "balance" }}>
          <T k={`learn.${a.slug}.title`} />
        </h1>
        <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-muted">
          <T k={`learn.${a.slug}.summary`} />
        </p>
        <figure className="dots mt-6 border border-line p-2 sm:p-4">
          <Diagram />
        </figure>
        <div className="report mt-6 max-w-2xl">
          {a.body.map((b) =>
            "p" in b ? (
              <p key={b.p}>
                <Rich k={`learn.${a.slug}.${b.p}`} />
              </p>
            ) : (
              <ol key={b.ol.join()}>
                {b.ol.map((k) => (
                  <li key={k}>
                    <Rich k={`learn.${a.slug}.${k}`} />
                  </li>
                ))}
              </ol>
            ),
          )}
        </div>
        {a.cta && (
          <Link href={a.cta.href} className="btn-accent mt-6 inline-flex h-10 items-center gap-2 px-4 text-[12px]">
            <T k={a.cta.k} /> <ArrowRight size={14} aria-hidden />
          </Link>
        )}
      </Panel>

      <div className="grid min-w-0 content-start gap-3">
        <Panel title={<T k="learn.takeaways" />} marks>
          <ul className="grid gap-3">
            {Array.from({ length: a.takeaways }, (_, i) => (
              <li key={i} className="flex gap-3 text-[13px] leading-relaxed text-text">
                <span className="mt-[7px] size-1.5 shrink-0 rotate-45 bg-accent" aria-hidden />
                <span className="min-w-0">
                  <T k={`learn.${a.slug}.take${i + 1}`} />
                </span>
              </li>
            ))}
          </ul>
          <ReadOnView slug={a.slug} />
          <div className="mt-5">
            <ReadToggle slug={a.slug} />
          </div>
        </Panel>

        <Panel title={<T k="learn.sources" />}>
          <ul className="grid gap-2">
            {a.sources.map((s) => (
              <li key={s.href}>
                <a href={s.href} target="_blank" rel="noreferrer" className="flex items-start gap-2 text-[13px] leading-snug text-muted hover:text-fg">
                  <ExternalLink size={13} className="mt-0.5 shrink-0 text-accent" aria-hidden />
                  <span className="min-w-0 break-words">{s.k ? <T k={s.k} /> : s.label}</span>
                </a>
              </li>
            ))}
          </ul>
        </Panel>

        <ExplainerNav>
          {prev ? (
            <Link href={`/learn/${prev.slug}`} className="min-w-0 bg-surface p-3 hover:bg-surface-2">
              <span className="micro flex items-center gap-1">
                <ArrowLeft size={11} aria-hidden /> <T k="learn.prev" />
              </span>
              <span className="mt-1 block truncate text-[12px] uppercase text-text">
                <T k={`learn.${prev.slug}.title`} />
              </span>
            </Link>
          ) : (
            <span className="bg-surface" />
          )}
          {next ? (
            <Link href={`/learn/${next.slug}`} className="min-w-0 bg-surface p-3 text-right hover:bg-surface-2">
              <span className="micro flex items-center justify-end gap-1">
                <T k="learn.next" /> <ArrowRight size={11} aria-hidden />
              </span>
              <span className="mt-1 block truncate text-[12px] uppercase text-text">
                <T k={`learn.${next.slug}.title`} />
              </span>
            </Link>
          ) : (
            <Link href="/learn" className="min-w-0 bg-surface p-3 text-right hover:bg-surface-2">
              <span className="micro flex items-center justify-end gap-1">
                <T k="learn.done" /> <ArrowRight size={11} aria-hidden />
              </span>
              <span className="mt-1 block truncate text-[12px] uppercase text-text">
                <T k="learn.all" />
              </span>
            </Link>
          )}
        </ExplainerNav>
      </div>
    </div>
  );
}
