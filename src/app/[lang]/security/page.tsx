import Link from "@/components/locale-link";
import { ArrowRight, Ban, Bot, DatabaseBackup, HandCoins, KeyRound, MonitorSmartphone, ScrollText, UserX, Wallet, type LucideIcon } from "lucide-react";
import { Panel } from "@/components/hud/panel";
import { analyticsProvider } from "@/lib/analytics-events";
import { T } from "@/lib/i18n";
import { pageMeta } from "@/lib/page-meta";

export function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  return pageMeta(params, "/security", "security");
}

const MAIL = "info@zcan.dev";
const SUBJECT = "Security";
const MAILTO = `mailto:${MAIL}?subject=${encodeURIComponent(SUBJECT)}`;

/** Each id keys `trust.sec.p.<id>.title|body`. Every claim is backed by the code named next to it. */
const PRACTICES: { id: string; icon: LucideIcon }[] = [
  { id: "account", icon: UserX }, // src/lib/history.ts, src/app/history/backup.ts — localStorage only
  { id: "custody", icon: HandCoins }, // src/app/api/quote → src/lib/oneclick.ts; deposit address from the 1Click quote
  { id: "wallet", icon: Wallet }, // src/components/wallet/wallet-pay.tsx — wallet signs; verifyOrder before signing
  { id: "device", icon: MonitorSmartphone }, // src/components/*cleaner*, src/components/tools/*, src/components/trust/local-proof.tsx
  { id: "password", icon: KeyRound }, // src/components/tools/password-check.tsx — 5-char SHA-1 prefix, padded
  { id: "history", icon: DatabaseBackup }, // src/app/history/backup.ts — PBKDF2-SHA-256 600k → AES-256-GCM
  { id: "agents", icon: Bot }, // src/lib/agents-server.ts, src/app/api/agents/run — web_search is the only tool
  { id: "training", icon: ScrollText }, // src/lib/training.ts — opt-in, anonymized, withdrawable
  // No analytics SDKs; wallet-provider.tsx sets analytics: false. Usage counts (src/lib/analytics.ts) go through /api/event.
  { id: analyticsProvider() ? "adsA" : "ads", icon: Ban },
];

const SCOPE = ["wallet", "swap", "requests", "api"];
const HABITS = [1, 2, 3, 4];
const NAV = [
  { id: "protect", k: "trust.sec.nav.protect" },
  { id: "review", k: "trust.sec.nav.review" },
  { id: "report", k: "trust.sec.nav.report" },
  { id: "dependencies", k: "trust.sec.nav.deps" },
  { id: "your-part", k: "trust.sec.nav.you" },
];

const linkCls = "group inline-flex min-h-6 items-center gap-1 text-[12px] uppercase tracking-wider text-text transition-colors hover:text-accent";

export default function SecurityPage() {
  return (
    <div className="grid gap-3">
      <Panel title={<T k="trust.sec.panel" />} meta={<T k="trust.sec.updated" />} marks bodyClassName="p-5 sm:p-8">
        <header className="max-w-[72ch]">
          <p className="eyebrow text-accent">
            <T k="trust.sec.eyebrow" />
          </p>
          <h1 className="display mt-3 text-[32px] text-fg text-balance sm:text-[44px]">
            <T k="trust.sec.title" />
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-muted text-pretty">
            <T k="trust.sec.intro" />
          </p>
        </header>
        <nav aria-labelledby="sec-jump" className="mt-6">
          <p id="sec-jump" className="micro">
            <T k="trust.sec.jump" />
          </p>
          <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
            {NAV.map((n) => (
              <li key={n.id}>
                <a href={`#${n.id}`} className={linkCls}>
                  <T k={n.k} />
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </Panel>

      <Panel
        id="protect"
        title={<T k="trust.sec.nav.protect" />}
        meta={<T k="trust.sec.protect.meta" vars={{ n: PRACTICES.length }} />}
        bodyClassName="p-0"
      >
        <ul className="grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-3">
          {PRACTICES.map(({ id, icon: Icon }) => (
            <li key={id} className="min-w-0 bg-surface p-4 sm:p-5">
              <Icon size={16} className="text-accent" aria-hidden />
              <h3 className="mt-3 text-[12px] font-medium uppercase tracking-wider text-fg">
                <T k={`trust.sec.p.${id}.title`} />
              </h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
                <T k={`trust.sec.p.${id}.body`} />
              </p>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel id="review" title={<T k="trust.sec.nav.review" />} meta={<T k="trust.sec.review.meta" />} bodyClassName="p-5 sm:p-6">
        <div className="max-w-[72ch] text-[14px] leading-relaxed text-text">
          <p>
            <T k="trust.sec.review.body" />
          </p>
          <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
            {SCOPE.map((s) => (
              <li key={s} className="flex items-baseline gap-2 text-[13px] text-fg">
                <span className="text-accent" aria-hidden>
                  ■
                </span>
                <T k={`trust.sec.review.s.${s}`} />
              </li>
            ))}
          </ul>
          <p className="mt-3 text-muted">
            <T k="trust.sec.review.how" />
          </p>
          <p className="mt-4 border-l-2 border-warn pl-3 text-fg">
            <T k="trust.sec.review.notAudit" />
          </p>
        </div>
      </Panel>

      <Panel id="report" title={<T k="trust.sec.nav.report" />} meta={<T k="trust.sec.report.meta" />} bodyClassName="p-5 sm:p-8">
        <div className="max-w-[72ch]">
          <p className="text-[15px] leading-relaxed text-fg">
            <T k="trust.sec.report.lead" />
          </p>
          <p className="mt-4">
            <a href={MAILTO} className="btn-accent inline-flex min-h-11 items-center px-5 text-[12px] uppercase tracking-wider">
              <T k="trust.sec.report.cta" vars={{ email: MAIL }} />
            </a>
          </p>
          <p className="micro mt-4 normal-case tracking-normal">
            <T k="trust.sec.report.english" />
          </p>
        </div>

        {/* Policy text: kept in English, like the privacy policy. Change it together with security.txt. */}
        <article lang="en" className="report mt-6 max-w-[72ch]">
          <h3>How to report</h3>
          <p>
            Email <a href={MAILTO}>{MAIL}</a> with the subject line “{SUBJECT}”. Please include:
          </p>
          <ul>
            <li>The affected page, URL or API route.</li>
            <li>Steps to reproduce the problem, and what you expected to happen.</li>
            <li>The impact: what an attacker could do with it.</li>
            <li>Any proof-of-concept, screenshots or logs, with no real user data in them.</li>
            <li>How we can reach you for follow-up questions.</li>
          </ul>

          <h3>In scope</h3>
          <ul>
            <li>
              The website at <code>www.zcan.dev</code> and <code>zcan.dev</code>.
            </li>
            <li>
              Its API routes under <code>/api/</code>.
            </li>
          </ul>

          <h3>Out of scope</h3>
          <ul>
            <li>
              Third-party services Zcan relies on, such as NEAR Intents (1Click), Coinbase, CoinGecko, Blockchair, Reown (WalletConnect), the AI
              provider and wallet apps. Please report those to the service directly.
            </li>
            <li>Social engineering or phishing of Zcan’s team or users.</li>
            <li>Volumetric denial of service and load testing.</li>
          </ul>

          <h3>Please</h3>
          <ul>
            <li>Don’t access, change or delete other people’s data. If you reach any by accident, stop and tell us.</li>
            <li>Use only your own addresses and small test amounts.</li>
            <li>Don’t degrade the service for anyone else.</li>
            <li>Give us reasonable time to fix the problem before you disclose it publicly. We’ll agree on a date with you.</li>
          </ul>

          <h3>Safe harbor</h3>
          <p>
            If you act in good faith and follow this policy, we will treat your research as authorized, we won’t take legal action against you
            for it, and we won’t ask anyone else to. If you’re unsure whether something is allowed, email us before you try it.
          </p>

          <h3>What to expect</h3>
          <p>
            We aim to acknowledge reports within 3 business days. We’ll keep you posted while we look into it and tell you when it’s fixed. If
            you’d like, we’ll credit you once the fix is live.
          </p>
          <p>There’s no paid bug bounty program yet.</p>

          <h3>Machine-readable contact</h3>
          <p>
            Contact details are also published at <a href="/.well-known/security.txt">/.well-known/security.txt</a> (RFC 9116).
          </p>
        </article>
      </Panel>

      <Panel id="dependencies" title={<T k="trust.sec.nav.deps" />} meta={<span translate="no">Dependabot</span>} bodyClassName="p-5 sm:p-6">
        <p className="max-w-[72ch] text-[14px] leading-relaxed text-text">
          <T k="trust.sec.deps.body" />
        </p>
      </Panel>

      <Panel id="your-part" title={<T k="trust.sec.nav.you" />} meta={<T k="trust.sec.you.meta" vars={{ n: HABITS.length }} />} bodyClassName="p-0">
        <ol className="divide-y divide-line">
          {HABITS.map((n) => (
            <li key={n} className="flex min-w-0 items-baseline gap-4 px-5 py-4">
              <span className="tabular shrink-0 text-[12px] text-accent" aria-hidden>
                {String(n).padStart(2, "0")}
              </span>
              <span className="min-w-0 text-[14px] leading-relaxed text-text">
                <T k={`trust.sec.you.${n}`} />
              </span>
            </li>
          ))}
        </ol>
      </Panel>

      <p className="flex flex-wrap gap-x-6 gap-y-2 px-1">
        <Link href="/transparency" className={linkCls}>
          <T k="trust.sec.more.transparency" />
          <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" aria-hidden />
        </Link>
        <Link href="/status" className={linkCls}>
          <T k="trust.sec.more.status" />
          <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" aria-hidden />
        </Link>
      </p>
    </div>
  );
}
