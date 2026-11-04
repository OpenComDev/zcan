import Link from "@/components/locale-link";
import { ArrowRight, ArrowUp, Ban, Eye, ListChecks, MonitorSmartphone, ShieldCheck, UserX, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { help } from "@/i18n/help";
import { analyticsProvider } from "@/lib/analytics-events";
import { AI_HOST, AI_MODEL_NAME } from "@/lib/ai-model";
import { AGENTS } from "@/lib/agents";
import { T } from "@/lib/i18n";
import { AgentGlyph, Emblem, ProtectGlyph, SwapGlyph } from "./illustrations";
import s from "./landing.module.css";
import { LiveNumbers } from "./live-numbers";

/*
 * The home page below the swap: what Zcan is, for first-time visitors and search engines.
 * A server component; text goes through <T> (English on the server, the reader's language after
 * hydration). Only the live numbers need client JS. Strings live in src/i18n/landing.ts.
 */

const SITE = "https://www.zcan.dev";

/* ---------- building blocks ---------- */

function Frame({ id, n, label, meta, children, bodyClassName = "p-5 sm:p-7" }: { id: string; n: string; label: string; meta?: ReactNode; children: ReactNode; bodyClassName?: string }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="panel marks min-w-0">
      <header className="panel-head">
        <p className="label truncate">
          {n} · <T k={`landing.n.${label}`} />
        </p>
        {meta && <p className="micro hidden shrink-0 pr-4 sm:block">{meta}</p>}
      </header>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

function Heading({ id, a, b, className = "text-[28px] sm:text-[40px]" }: { id: string; a: string; b: string; className?: string }) {
  return (
    <h2 id={`${id}-title`} className={`display text-fg ${className}`} style={{ overflowWrap: "anywhere" }}>
      <T k={a} /> <span className="text-accent"><T k={b} /></span>
    </h2>
  );
}

function Arrow({ href, k }: { href: string; k: string }) {
  const cls = "group inline-flex min-h-6 items-center gap-1 text-[12px] uppercase tracking-wider text-text transition-colors hover:text-accent";
  const body = (
    <>
      <T k={k} />
      <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" aria-hidden />
    </>
  );
  return href.startsWith("#") ? (
    <a href={href} className={cls}>
      {body}
    </a>
  ) : (
    <Link href={href} className={cls}>
      {body}
    </Link>
  );
}

/* ---------- 01 · hero ---------- */

const PILLS: { id: string; icon: LucideIcon }[] = [
  { id: "custody", icon: ShieldCheck },
  { id: "account", icon: UserX },
  { id: "device", icon: MonitorSmartphone },
  { id: "open", icon: Eye },
];

function Hero() {
  return (
    <Frame id="about" n="01" label="about" meta={<T k="landing.hero.meta" />} bodyClassName="p-0">
      <div className="grid lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="min-w-0 p-5 sm:p-7 lg:py-10">
          <p className="eyebrow">
            <T k="landing.hero.eyebrow" />
          </p>
          <Heading id="about" a="landing.hero.headA" b="landing.hero.headB" className="mt-4 text-[34px] sm:text-[52px]" />
          <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-text">
            <T k="landing.hero.lead" />
          </p>
          <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-muted">
            <T k="landing.hero.sub" />
          </p>
        </div>
        <div className="dots hidden items-center justify-center border-l border-line p-8 lg:flex">
          <div className="w-full max-w-[300px]">
            <Emblem />
          </div>
        </div>
      </div>
      <ul className="grid grid-cols-2 gap-px border-t border-line bg-line lg:grid-cols-4">
        {PILLS.map(({ id, icon: Icon }, i) => (
          <li key={id} className="flex min-w-0 gap-3 bg-surface p-4 sm:p-5">
            <span className="flex size-8 shrink-0 items-center justify-center border border-line text-accent">
              <Icon size={15} aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="micro block">0{i + 1}</span>
              <span className="mt-0.5 block text-[12px] font-medium uppercase tracking-wide text-fg">
                <T k={`landing.pill.${id}`} />
              </span>
              <span className="mt-1 hidden text-[12px] leading-relaxed text-muted sm:block">
                <T k={`landing.pill.${id}.body`} />
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

/* ---------- 02 · what you can do ---------- */

const TOOLS = ["link-cleaner", "photo-cleaner", "documents", "clipboard", "address", "fingerprint", "passwords", "aliases"];

const THINGS: { id: string; Glyph: () => ReactNode; href: string; cta: string; facts: { k: string; vars?: Record<string, number> }[] }[] = [
  { id: "swap", Glyph: SwapGlyph, href: "#exchange", cta: "landing.do.swap.cta", facts: [{ k: "f1" }, { k: "f2" }, { k: "f3" }] },
  { id: "protect", Glyph: ProtectGlyph, href: "/tools", cta: "landing.do.protect.cta", facts: [] },
  { id: "ask", Glyph: AgentGlyph, href: "/agents", cta: "landing.do.ask.cta", facts: [{ k: "f1", vars: { n: AGENTS.length } }, { k: "f2" }, { k: "f3" }] },
];

function Things() {
  return (
    <Frame id="what-you-can-do" n="02" label="do" meta={<T k="landing.do.meta" />} bodyClassName="p-0">
      <div className="p-5 sm:p-7">
        <Heading id="what-you-can-do" a="landing.do.headA" b="landing.do.headB" />
        <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-muted">
          <T k="landing.do.intro" />
        </p>
      </div>
      <div className="grid gap-px border-t border-line bg-line md:grid-cols-3">
        {THINGS.map(({ id, Glyph, href, cta, facts }, i) => (
          <article key={id} aria-labelledby={`do-${id}`} className="flex min-w-0 flex-col bg-surface">
            <div className="dots relative border-b border-line px-4 py-5 sm:px-6">
              <span className="micro absolute left-3 top-3">{String.fromCharCode(65 + i)}</span>
              <Glyph />
            </div>
            <div className="flex flex-1 flex-col p-5 sm:p-6">
              <p className="eyebrow">
                <T k={`landing.do.${id}.k`} />
              </p>
              <h3 id={`do-${id}`} className="mt-2 text-[16px] font-medium uppercase tracking-wide text-fg">
                <T k={`landing.do.${id}.title`} />
              </h3>
              <p className="mt-2 text-[13px] leading-relaxed text-muted">
                <T k={`landing.do.${id}.body`} />
              </p>
              <ul className="mt-4 flex flex-wrap gap-1.5">
                {id === "protect"
                  ? TOOLS.map((tool) => (
                      <li key={tool} className="tag text-text">
                        <T k={`shell.tool.${tool}`} />
                      </li>
                    ))
                  : facts.map((f) => (
                      <li key={f.k} className="tag text-text">
                        <T k={`landing.do.${id}.${f.k}`} vars={f.vars} />
                      </li>
                    ))}
              </ul>
              <div className="mt-auto pt-5">
                <Arrow href={href} k={cta} />
              </div>
            </div>
          </article>
        ))}
      </div>
    </Frame>
  );
}

/* ---------- 03 · how privacy works ---------- */

/** `you` marks the steps you do yourself, in your own wallet. */
const PATH: { n: number; you?: boolean; hot?: boolean }[] = [{ n: 1, you: true }, { n: 2 }, { n: 3 }, { n: 4 }, { n: 5, you: true, hot: true }];

function Segment({ i, dashed }: { i: number; dashed: boolean }) {
  const line = dashed ? "border-dashed border-line-strong" : "border-solid border-accent/50";
  const delay = { animationDelay: `${i * 0.6}s` };
  return (
    <>
      {/* Phones: vertical, from this node down to the next. */}
      <span aria-hidden className="absolute bottom-0 left-2 top-7 w-2 overflow-hidden lg:hidden">
        <span className={`absolute inset-y-0 left-1/2 border-l ${line}`} />
        {!dashed && (
          <span className={`absolute inset-0 ${s.runY}`} style={delay}>
            <span className="absolute left-1/2 top-0 size-1.5 -translate-x-1/2 rounded-full bg-accent" />
          </span>
        )}
      </span>
      {/* Desktop: horizontal, from this column's centre to the next one's. */}
      <span aria-hidden className="absolute left-1/2 top-2 hidden h-2 w-full overflow-hidden lg:block">
        <span className={`absolute inset-x-0 top-1/2 border-t ${line}`} />
        {!dashed && (
          <span className={`absolute inset-0 ${s.runX}`} style={delay}>
            <span className="absolute left-0 top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-accent" />
          </span>
        )}
      </span>
    </>
  );
}

function PrivacyPath() {
  return (
    <Frame id="how-privacy-works" n="03" label="path" meta={<T k="landing.path.meta" />}>
      <Heading id="how-privacy-works" a="landing.path.headA" b="landing.path.headB" />
      <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-muted">
        <T k="landing.path.intro" />
      </p>

      <div className="dots mt-6 border border-line p-4 sm:p-6">
        <ol className="grid lg:grid-cols-5">
          {PATH.map(({ n, you, hot }) => (
            <li key={n} className="relative grid grid-cols-[24px_minmax(0,1fr)] gap-3 pb-6 last:pb-0 lg:block lg:px-3 lg:pb-0 lg:text-center">
              {n < PATH.length && <Segment i={n - 1} dashed={n === PATH.length - 1} />}
              <span className="relative z-10 flex size-6 items-center justify-center lg:mx-auto" aria-hidden>
                <span className={`size-3 rotate-45 border ${hot ? "border-text bg-accent" : "border-text bg-surface"}`} />
              </span>
              <div className="min-w-0 lg:mt-4">
                <p className="micro flex items-center gap-2 lg:justify-center">
                  <span className="tabular">0{n}</span>
                  {you && (
                    <span className="tag h-4 px-1 text-[9px] text-accent">
                      <T k="landing.path.you" />
                    </span>
                  )}
                </p>
                <h3 className="mt-1 text-[13px] font-medium uppercase tracking-wide text-fg">
                  <T k={`landing.path.${n}.title`} />
                </h3>
                <p className="mt-1 text-[12px] leading-relaxed text-muted">
                  <T k={`landing.path.${n}.body`} />
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-3 grid gap-px border border-line bg-line md:grid-cols-2">
        <div className="min-w-0 bg-surface p-4 sm:p-5">
          <h3 className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-wider text-fg">
            <Eye size={14} className="text-warn" aria-hidden /> <T k="landing.path.sees" />
          </h3>
          <ul className="mt-3 grid gap-2 text-[13px] leading-relaxed text-muted">
            {[1, 2, 3, 4].map((i) => (
              <li key={i} className="grid grid-cols-[12px_minmax(0,1fr)] gap-2">
                <span className="text-warn" aria-hidden>
                  ·
                </span>
                <span>
                  <T k={`landing.path.sees.${i}`} />
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="min-w-0 bg-surface p-4 sm:p-5">
          <h3 className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-wider text-fg">
            <Ban size={14} className="text-green" aria-hidden /> <T k="landing.path.never" />
          </h3>
          <ul className="mt-3 grid gap-2 text-[13px] leading-relaxed text-muted">
            {[1, 2, 3, 4].map((i) => (
              <li key={i} className="grid grid-cols-[12px_minmax(0,1fr)] gap-2">
                <span className="text-green" aria-hidden>
                  ·
                </span>
                <span>
                  <T k={`landing.path.never.${i}`} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className="mt-3 border-l-2 border-accent pl-3 text-[13px] leading-relaxed text-text">
        <T k="landing.path.note" />
      </p>
      <p className="mt-5 flex flex-wrap gap-x-6 gap-y-2">
        <Arrow href="/docs#privacy" k="landing.path.docs" />
        <Arrow href="/learn/shield-after-swap" k="landing.path.learn" />
        <Arrow href="/learn" k="landing.path.learnAll" />
      </p>
    </Frame>
  );
}

/* ---------- 04 · why trust it ---------- */

const FACTS: { id: string; icon: LucideIcon }[] = [
  { id: "account", icon: UserX },
  { id: "custody", icon: ShieldCheck },
  { id: "device", icon: MonitorSmartphone },
  // With analytics switched on, the claim changes from "no analytics" to "no trackers".
  { id: analyticsProvider() ? "adsA" : "ads", icon: Ban },
];

/** Service names are brands and stay untranslated; `id` keys `landing.row.<id>.for|gets`. */
const SERVICES: { id: string; name: string }[] = [
  { id: "near", name: "NEAR Intents (1Click)" },
  { id: "coinbase", name: "Coinbase" },
  { id: "coingecko", name: "CoinGecko" },
  // Self-hosted on rented GPUs: the GPU host is who processes agent inputs (see src/lib/ai-model.ts).
  { id: "ai", name: AI_HOST ?? AI_MODEL_NAME },
  { id: "tavily", name: "Tavily" },
  { id: "hibp", name: "Have I Been Pwned" },
  { id: "reown", name: "Reown (WalletConnect)" },
];

function Trust() {
  return (
    <Frame id="trust" n="04" label="trust" meta={<T k="landing.trust.meta" vars={{ n: SERVICES.length }} />}>
      <Heading id="trust" a="landing.trust.headA" b="landing.trust.headB" />
      <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-muted">
        <T k="landing.trust.intro" />
      </p>

      <ul className="mt-6 grid gap-px border border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
        {FACTS.map(({ id, icon: Icon }) => (
          <li key={id} className="min-w-0 bg-surface p-4 sm:p-5">
            <Icon size={16} className="text-accent" aria-hidden />
            <h3 className="mt-3 text-[12px] font-medium uppercase tracking-wider text-fg">
              <T k={`landing.fact.${id}.title`} />
            </h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
              <T k={`landing.fact.${id}.body`} />
            </p>
          </li>
        ))}
      </ul>

      <div className="relative mt-6 overflow-x-auto overscroll-x-contain">
        <table className="w-full min-w-[560px] text-left text-[12px]">
          <caption className="label mb-3 text-left">
            <T k="landing.table.caption" />
          </caption>
          <thead>
            <tr className="micro border-b border-line">
              <th scope="col" className="py-2 pr-3 font-medium">
                <T k="landing.table.service" />
              </th>
              <th scope="col" className="py-2 pr-3 font-medium">
                <T k="landing.table.for" />
              </th>
              <th scope="col" className="py-2 font-medium">
                <T k="landing.table.gets" />
              </th>
            </tr>
          </thead>
          <tbody>
            {SERVICES.map((r) => (
              <tr key={r.id} className="border-b border-line align-top">
                <th scope="row" className="py-2.5 pr-3 font-normal uppercase text-fg" translate="no">
                  {r.name}
                </th>
                <td className="py-2.5 pr-3 text-accent">
                  <T k={`landing.row.${r.id}.for`} />
                </td>
                <td className="py-2.5 leading-relaxed text-muted">
                  <T k={`landing.row.${r.id}.gets`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-5 flex flex-wrap gap-x-6 gap-y-2">
        <Arrow href="/transparency" k="trust.link.transparency" />
        <Arrow href="/security" k="trust.link.security" />
        <Arrow href="/status" k="landing.trust.status" />
        <Arrow href="/docs#privacy" k="landing.trust.docs" />
        <Arrow href="/legal/website/privacy-policy" k="landing.trust.policy" />
        <Arrow href="/support" k="landing.trust.support" />
      </p>
    </Frame>
  );
}

/* ---------- 05 · live ---------- */

function Live() {
  return (
    <Frame id="live" n="05" label="live" meta={<T k="landing.live.meta" />}>
      <Heading id="live" a="landing.live.headA" b="landing.live.headB" className="text-[24px] sm:text-[32px]" />
      <div className="mt-5">
        <LiveNumbers />
      </div>
    </Frame>
  );
}

/* ---------- 06 · FAQ + CTA ---------- */

/** Picked from /help (`help.faq.<n>`), so the answers stay identical in both places and in the JSON-LD. */
const FAQ = [2, 5, 3, 8];

function Faq() {
  return (
    <Frame id="faq" n="06" label="faq" meta={<T k="landing.faq.meta" vars={{ n: FAQ.length }} />} bodyClassName="p-0">
      <div className="p-5 sm:p-7">
        <Heading id="faq" a="landing.faq.headA" b="landing.faq.headB" className="text-[24px] sm:text-[32px]" />
      </div>
      <div className="divide-y divide-line border-t border-line">
        {FAQ.map((n) => (
          <details key={n} className="group">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-surface-2 sm:px-7 [&::-webkit-details-marker]:hidden">
              <h3 className="min-w-0 text-[13px] font-normal uppercase tracking-wide text-fg">
                <T k={`help.faq.${n}.q`} />
              </h3>
              <span className="shrink-0 text-subtle transition-transform duration-200 group-open:rotate-45 group-open:text-accent" aria-hidden>
                +
              </span>
            </summary>
            <p className="max-w-3xl px-5 pb-5 text-[13px] leading-relaxed text-muted sm:px-7">
              <T k={`help.faq.${n}.a`} />
            </p>
          </details>
        ))}
      </div>
      <p className="border-t border-line px-5 py-4 sm:px-7">
        <Arrow href="/help" k="landing.faq.all" />
      </p>
    </Frame>
  );
}

function Cta() {
  return (
    <section aria-labelledby="get-started-title" className="panel marks hatch min-w-0">
      <div className="flex flex-col gap-6 p-6 sm:p-10 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="eyebrow">
            <T k="landing.n.cta" />
          </p>
          <Heading id="get-started" a="landing.cta.headA" b="landing.cta.headB" className="mt-3 text-[30px] sm:text-[44px]" />
          <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-muted">
            <T k="landing.cta.body" />
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          <a href="#exchange" className="btn-accent inline-flex min-h-11 items-center justify-center gap-2 px-5 text-[13px]">
            <ArrowUp size={15} aria-hidden /> <T k="landing.cta.swap" />
          </a>
          <Link
            href="/tools"
            className="inline-flex min-h-11 items-center justify-center gap-2 border border-line-strong bg-surface px-5 text-[13px] font-medium uppercase tracking-[0.06em] text-text transition-colors hover:border-text hover:text-fg"
          >
            <ListChecks size={15} aria-hidden /> <T k="landing.cta.tools" />
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ---------- structured data ---------- */

function JsonLd() {
  const en = help.en as Record<string, string>;
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE}/#organization`,
        name: "Zcan",
        url: SITE,
        logo: `${SITE}/zcan-logo.png`,
        email: "info@zcan.dev",
        sameAs: ["https://x.com/zcan"],
      },
      {
        "@type": "WebSite",
        "@id": `${SITE}/#website`,
        name: "Zcan",
        url: SITE,
        description: "Private swaps into Zcash, tools that strip trackers and photo metadata, and privacy agents that ask before they act.",
        inLanguage: ["en", "es", "pt", "tr", "ru", "zh"],
        publisher: { "@id": `${SITE}/#organization` },
      },
      {
        "@type": "FAQPage",
        "@id": `${SITE}/#faq`,
        mainEntity: FAQ.map((n) => ({
          "@type": "Question",
          name: en[`faq.${n}.q`],
          acceptedAnswer: { "@type": "Answer", text: en[`faq.${n}.a`] },
        })),
      },
    ],
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

/* ---------- page ---------- */

/** Everything a first-time visitor (or a crawler) finds by scrolling past the swap. */
export function Landing() {
  return (
    <div className="mt-6 grid gap-3">
      <div className="micro flex items-center gap-3" aria-hidden>
        <span className="h-px flex-1 bg-line" />
        <T k="landing.rule" />
        <span className="h-px flex-1 bg-line" />
      </div>
      <Hero />
      <Things />
      <PrivacyPath />
      <Trust />
      <Live />
      <Faq />
      <Cta />
      <JsonLd />
    </div>
  );
}
