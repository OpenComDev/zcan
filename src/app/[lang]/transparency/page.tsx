import Link from "@/components/locale-link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Panel } from "@/components/hud/panel";
import { ServiceHealth } from "@/components/trust/service-health";
import { BACKUP_NAME, BACKUP_POLICY, backupConfigured } from "@/lib/changenow";
import { AI_HOST, AI_MODEL_NAME, AI_RECIPIENT_POLICY, AI_SELF_HOSTED } from "@/lib/ai-model";
import { analyticsProvider } from "@/lib/analytics-events";
import { T } from "@/lib/i18n";
import { pageMeta } from "@/lib/page-meta";

export function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  return pageMeta(params, "/transparency", "transparency");
}

type Tag = "local" | "server" | "direct" | "optin";

const ANALYTICS = analyticsProvider();
const ANALYTICS_NAME = ANALYTICS === "umami" ? "Umami" : "Plausible Analytics";

/**
 * One row per feature. `name` is an existing nav/tool key; `to` omitted means nothing leaves the device.
 * Verified against: src/app/api/* (server calls), src/components/*cleaner*, src/components/tools/*,
 * src/lib/live-prices.ts (Coinbase WebSocket), src/components/token-icon.tsx (jsDelivr),
 * src/lib/use-order-watcher.ts (status polling), src/components/wallet/* and src/lib/training.ts.
 */
const FEATURES: { id: string; name: string; href: string; tags: Tag[]; to?: string }[] = [
  { id: "swap", name: "shell.nav.swap", href: "/", tags: ["server", "direct"], to: "trust.tr.f.swap.to" },
  { id: "send", name: "shell.nav.send", href: "/send", tags: ["server", "local"], to: "trust.tr.f.send.to" },
  { id: "pay", name: "shell.nav.pay", href: "/pay", tags: ["local"], to: "trust.tr.f.pay.to" },
  { id: "history", name: "shell.nav.history", href: "/history", tags: ["local", "server"], to: "trust.tr.f.history.to" },
  { id: "markets", name: "shell.nav.markets", href: "/markets", tags: ["direct", "server", "local"], to: "trust.tr.f.markets.to" },
  { id: "network", name: "shell.nav.network", href: "/network", tags: ["server"], to: "trust.tr.f.network.to" },
  { id: "status", name: "shell.nav.status", href: "/status", tags: ["server", "direct"], to: "trust.tr.f.status.to" },
  { id: "link", name: "shell.tool.link-cleaner", href: "/tools#link-cleaner", tags: ["local"] },
  { id: "photo", name: "shell.tool.photo-cleaner", href: "/tools#photo-cleaner", tags: ["local"] },
  { id: "doc", name: "shell.tool.documents", href: "/tools/documents", tags: ["local"] },
  { id: "clipboard", name: "shell.tool.clipboard", href: "/tools/clipboard", tags: ["local"] },
  { id: "address", name: "shell.tool.address", href: "/tools/address", tags: ["local", "direct"], to: "trust.tr.f.address.to" },
  { id: "passwords", name: "shell.tool.passwords", href: "/tools/passwords", tags: ["direct"], to: "trust.tr.f.passwords.to" },
  { id: "fingerprint", name: "shell.tool.fingerprint", href: "/tools/fingerprint", tags: ["local"] },
  { id: "aliases", name: "shell.tool.aliases", href: "/tools/aliases", tags: ["local"] },
  {
    id: "agents",
    name: "shell.nav.agents",
    href: "/agents",
    tags: ["server"],
    to: AI_HOST ? "trust.tr.f.agents.toHosted" : AI_SELF_HOSTED ? "trust.tr.f.agents.toSelf" : "trust.tr.f.agents.to",
  },
  { id: "wallet", name: "trust.tr.f.wallet.name", href: "/", tags: ["direct", "server"], to: "trust.tr.f.wallet.to" },
  { id: "training", name: "trust.tr.f.training.name", href: "/agents", tags: ["optin", "server"], to: "trust.tr.f.training.to" },
  // src/lib/referral-store.ts (browser) → /api/quote appFees (src/lib/referral.ts)
  { id: "referral", name: "trust.tr.f.referral.name", href: "/refer", tags: ["local", "server"], to: "trust.tr.f.referral.to" },
  // The zcan-locale cookie (src/lib/i18n.tsx rememberLocale), read by next.config.ts redirects.
  { id: "language", name: "shell.settings.language", href: "/transparency", tags: ["local"], to: "trust.tr.f.language.to" },
  // src/lib/error-report.ts → /api/errors → src/lib/error-store.ts (switch: Settings → Privacy)
  { id: "crash", name: "trust.tr.f.crash.name", href: "/transparency", tags: ["server"], to: "trust.tr.f.crash.to" },
  // src/lib/analytics.ts → /api/event → provider. Only listed when NEXT_PUBLIC_ANALYTICS is set.
  ...(ANALYTICS ? [{ id: "usage", name: "trust.tr.f.usage.name", href: "/transparency", tags: ["server"] as Tag[], to: "trust.tr.f.usage.to" }] : []),
];

const TAG_CLS: Record<Tag, string> = { local: "text-green", server: "text-info", direct: "text-warn", optin: "text-accent" };

/**
 * Outside services. Rows that also appear on the landing page reuse its `landing.row.<id>` copy so the two stay in sync.
 * `policy` is the official privacy policy where we're sure of the URL; otherwise `site` links the homepage.
 */
type Party = { id: string; name: string; forKey: string; getsKey: string; policy?: string; site?: string; optional?: boolean };

/** Whoever receives agent inputs: the GPU host running Zcan's own model, Zcan itself, or the outside provider. */
const AI_PARTY: Party = AI_HOST
  ? { id: "ai", name: AI_HOST, forKey: "trust.party.aiHost.for", getsKey: "trust.party.aiHost.gets", policy: AI_RECIPIENT_POLICY }
  : AI_SELF_HOSTED
    ? { id: "ai", name: AI_MODEL_NAME, forKey: "landing.row.ai.for", getsKey: "trust.party.aiSelf.gets" }
    : { id: "ai", name: AI_MODEL_NAME, forKey: "landing.row.ai.for", getsKey: "landing.row.ai.gets", policy: AI_RECIPIENT_POLICY };

const PARTIES: Party[] = [
  {
    id: "near",
    name: "NEAR Intents (1Click)",
    forKey: "trust.party.near.for",
    getsKey: "landing.row.near.gets",
    site: "https://near-intents.org/",
  },
  // Listed only when the backup swap route is switched on (CHANGENOW_API_KEY).
  ...(backupConfigured()
    ? [{ id: "changenow", name: BACKUP_NAME, forKey: "trust.party.changenow.for", getsKey: "trust.party.changenow.gets", policy: BACKUP_POLICY, optional: true }]
    : []),
  { id: "coinbase", name: "Coinbase", forKey: "landing.row.coinbase.for", getsKey: "landing.row.coinbase.gets", policy: "https://www.coinbase.com/legal/privacy" },
  { id: "coingecko", name: "CoinGecko", forKey: "landing.row.coingecko.for", getsKey: "landing.row.coingecko.gets", policy: "https://www.coingecko.com/en/privacy" },
  { id: "blockchair", name: "Blockchair", forKey: "trust.party.blockchair.for", getsKey: "trust.party.blockchair.gets", site: "https://blockchair.com/" },
  {
    id: "zcashexplorer",
    name: "zcashexplorer.app",
    forKey: "trust.party.zcashexplorer.for",
    getsKey: "trust.party.zcashexplorer.gets",
    site: "https://mainnet.zcashexplorer.app/",
  },
  AI_PARTY,
  { id: "tavily", name: "Tavily", forKey: "landing.row.tavily.for", getsKey: "landing.row.tavily.gets", policy: "https://tavily.com/privacy", optional: true },
  { id: "hibp", name: "Have I Been Pwned", forKey: "landing.row.hibp.for", getsKey: "landing.row.hibp.gets", policy: "https://haveibeenpwned.com/Privacy" },
  { id: "reown", name: "Reown (WalletConnect)", forKey: "landing.row.reown.for", getsKey: "landing.row.reown.gets", policy: "https://reown.com/privacy-policy" },
  {
    id: "publicnode",
    name: "PublicNode",
    forKey: "trust.party.publicnode.for",
    getsKey: "trust.party.publicnode.gets",
    site: "https://www.publicnode.com/",
  },
  { id: "mempool", name: "mempool.space", forKey: "trust.party.mempool.for", getsKey: "trust.party.mempool.gets", site: "https://mempool.space/" },
  {
    id: "jsdelivr",
    name: "jsDelivr",
    forKey: "trust.party.jsdelivr.for",
    getsKey: "trust.party.jsdelivr.gets",
    site: "https://www.jsdelivr.com/",
  },
  { id: "vercel", name: "Vercel", forKey: "trust.party.vercel.for", getsKey: "trust.party.vercel.gets", policy: "https://vercel.com/legal/privacy-policy" },
  ...(ANALYTICS === "umami"
    ? [{ id: "umami", name: "Umami", forKey: "trust.party.analytics.for", getsKey: "trust.party.analytics.gets", policy: "https://umami.is/privacy" }]
    : ANALYTICS === "plausible"
      ? [{ id: "plausible", name: "Plausible Analytics", forKey: "trust.party.analytics.for", getsKey: "trust.party.analytics.gets", policy: "https://plausible.io/privacy" }]
      : []),
  {
    id: "upstash",
    name: "Upstash Redis",
    forKey: "trust.party.upstash.for",
    getsKey: "trust.party.upstash.gets",
    policy: "https://upstash.com/trust/privacy.pdf",
    optional: true,
  },
];

const arrowLink = "group inline-flex min-h-6 items-center gap-1 text-[12px] uppercase tracking-wider text-text transition-colors hover:text-accent";

export default function TransparencyPage() {
  return (
    <div className="grid gap-3">
      <Panel title={<T k="trust.tr.panel" />} meta={<T k="trust.tr.meta" />} marks bodyClassName="p-5 sm:p-8">
        <header className="max-w-[72ch]">
          <p className="eyebrow text-accent">
            <T k="trust.tr.eyebrow" />
          </p>
          <h1 className="display mt-3 text-[32px] text-fg text-balance sm:text-[44px]">
            <T k="trust.tr.title" />
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-muted text-pretty">
            <T k="trust.tr.intro" />
          </p>
          <p className="mt-3 border-l-2 border-accent pl-3 text-[13px] leading-relaxed text-text">
            <T k="trust.tr.hosting" />
          </p>
        </header>
      </Panel>

      <Panel id="health" title={<T k="trust.tr.health.title" />} meta={<T k="trust.tr.health.meta" />} bodyClassName="p-0">
        <ServiceHealth />
      </Panel>

      <Panel
        id="features"
        title={<T k="trust.tr.features.title" />}
        meta={<T k="trust.tr.features.meta" vars={{ n: FEATURES.length }} />}
        bodyClassName="p-0"
      >
        <div className="hidden border-b border-line px-5 py-2 md:grid md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.5fr)_minmax(0,1fr)] md:gap-6">
          <span className="micro">
            <T k="trust.tr.col.feature" />
          </span>
          <span className="micro">
            <T k="trust.tr.col.leaves" />
          </span>
          <span className="micro">
            <T k="trust.tr.col.to" />
          </span>
        </div>
        <ul className="divide-y divide-line">
          {FEATURES.map((f) => (
            <li
              key={f.id}
              className="grid min-w-0 gap-2 px-5 py-4 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.5fr)_minmax(0,1fr)] md:gap-6"
            >
              <div className="min-w-0">
                <h3 className="text-[13px] uppercase tracking-wide text-fg">
                  <Link href={f.href} className="hover:text-accent">
                    <T k={f.name} />
                  </Link>
                </h3>
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {f.tags.map((tag) => (
                    <li key={tag} className={`tag ${TAG_CLS[tag]}`}>
                      <T k={`trust.tr.tag.${tag}`} />
                    </li>
                  ))}
                </ul>
              </div>
              <p className="min-w-0 text-[13px] leading-relaxed text-text">
                <T k={`trust.tr.f.${f.id}.leaves`} />
              </p>
              <p className="min-w-0 text-[13px] leading-relaxed text-muted">
                <span className="micro mr-2 md:hidden">
                  <T k="trust.tr.col.to" />:
                </span>
                {f.to ? <T k={f.to} vars={{ model: AI_MODEL_NAME, host: AI_HOST ?? "", provider: ANALYTICS_NAME }} /> : <T k="trust.tr.nobody" />}
              </p>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel id="third-parties" title={<T k="trust.tr.parties.title" />} meta={<T k="trust.tr.parties.meta" vars={{ n: PARTIES.length }} />} bodyClassName="p-0">
        <div className="relative overflow-x-auto overscroll-x-contain">
          <table className="w-full min-w-[680px] text-left text-[12px]">
            <caption className="sr-only">
              <T k="landing.table.caption" />
            </caption>
            <thead>
              <tr className="micro border-b border-line">
                <th scope="col" className="px-5 py-2 font-medium">
                  <T k="landing.table.service" />
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  <T k="landing.table.for" />
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  <T k="landing.table.gets" />
                </th>
                <th scope="col" className="py-2 pr-5 font-medium">
                  <T k="trust.tr.col.policy" />
                </th>
              </tr>
            </thead>
            <tbody>
              {PARTIES.map((p) => (
                <tr key={p.id} className="border-b border-line align-top last:border-b-0">
                  <th scope="row" className="px-5 py-3 font-normal uppercase text-fg" translate="no">
                    {p.name}
                  </th>
                  <td className="py-3 pr-4 text-accent">
                    <T k={p.forKey} />
                    {p.optional && (
                      <span className="micro mt-1 block normal-case tracking-normal">
                        <T k={p.id === "upstash" ? "trust.tr.tag.optin" : "trust.tr.when"} />
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-4 leading-relaxed text-muted">
                    <T k={p.getsKey} />
                  </td>
                  <td className="py-3 pr-5">
                    {p.policy || p.site ? (
                      <a
                        href={p.policy ?? p.site}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-6 items-center gap-1 whitespace-nowrap text-text underline decoration-line-strong underline-offset-2 hover:text-accent"
                      >
                        <T k={p.policy ? "trust.tr.policy" : "trust.tr.site"} />
                        <ArrowUpRight size={12} aria-hidden />
                        <span className="sr-only">({p.name})</span>
                      </a>
                    ) : (
                      <span className="text-subtle">
                        <T k="trust.tr.policyNone" />
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel id="model" title={<T k="trust.tr.model.title" />} meta={<span translate="no">{AI_MODEL_NAME}</span>} bodyClassName="p-5 sm:p-6">
        <div className="max-w-[72ch] text-[14px] leading-relaxed text-text">
          {AI_SELF_HOSTED ? (
            <>
              <p className="text-fg">
                {AI_HOST ? <T k="trust.tr.model.hosted" vars={{ model: AI_MODEL_NAME, host: AI_HOST }} /> : <T k="trust.tr.model.self" />}
              </p>
              <p className="mt-2 text-muted">
                <T k="trust.tr.model.selfSearch" />
              </p>
            </>
          ) : (
            <p className="text-fg">
              <T k="trust.tr.model.provider" vars={{ model: AI_MODEL_NAME }} />
            </p>
          )}
          <p className="mt-3 text-muted">
            <T k="trust.tr.model.training" />
          </p>
        </div>
      </Panel>

      <Panel id="proof" title={<T k="trust.tr.proof.title" />} bodyClassName="p-5 sm:p-6">
        <p className="max-w-[72ch] text-[14px] leading-relaxed text-text">
          <T k="trust.tr.proof.body" />
        </p>
        <p className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
          <Link href="/tools" className={arrowLink}>
            <T k="shell.nav.tools" />
            <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
          <Link href="/security" className={arrowLink}>
            <T k="trust.tr.more.security" />
            <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
        </p>
      </Panel>
    </div>
  );
}
