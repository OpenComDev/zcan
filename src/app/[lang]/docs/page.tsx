import Link from "@/components/locale-link";
import type { ReactNode } from "react";
import { Code } from "@/components/docs/code";
import { FlowDiagram } from "@/components/docs/flow-diagram";
import { Lifecycle } from "@/components/docs/lifecycle";
import { LiveStrip } from "@/components/docs/live-strip";
import { NetworkChart } from "@/components/docs/network-chart";
import { QuoteLab } from "@/components/docs/quote-lab";
import { SendTimeline } from "@/components/docs/send-timeline";
import { Toc, type TocItem } from "@/components/docs/toc";
import { Panel } from "@/components/hud/panel";
import { AGENTS as AGENT_DEFS } from "@/lib/agents";
import { T } from "@/lib/i18n";
import { AI_MODEL_NAME } from "@/lib/ai-model";
import { pageMeta } from "@/lib/page-meta";

export function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  return pageMeta(params, "/docs", "docs");
}

/** Section labels and leads live in src/i18n/docs.ts as `docs.toc.<id>` and `docs.lead.<id>`. */
const TOC: TocItem[] = [
  { id: "overview", n: "01" },
  { id: "lifecycle", n: "02" },
  { id: "quotes", n: "03" },
  { id: "networks", n: "04" },
  { id: "private-send", n: "05" },
  { id: "live-data", n: "06" },
  { id: "privacy", n: "07" },
  { id: "api", n: "08" },
  { id: "self-host", n: "09" },
];

function Section({ id, n, children }: { id: string; n: string; children: ReactNode }) {
  return (
    <Panel
      id={id}
      title={
        <>
          {n} · <T k={`docs.toc.${id}`} />
        </>
      }
      marks
      bodyClassName="p-4 sm:p-6"
    >
      <p className="mb-6 max-w-2xl text-[14px] leading-relaxed text-muted">
        <T k={`docs.lead.${id}`} />
      </p>
      {children}
    </Panel>
  );
}

/** Row ids → `docs.privacy.<id>.feature|what|to`. `nothing` rows render the "what" cell in green. */
const PRIVACY: { id: string; nothing?: boolean }[] = [
  { id: "link", nothing: true },
  { id: "photo", nothing: true },
  { id: "swap" },
  { id: "prices" },
  { id: "agents" },
  { id: "rechecks", nothing: true },
  { id: "training" },
  { id: "history", nothing: true },
];

/** Row ids → `docs.fresh.<id>.data|freq`; the source column stays as-is unless `sourceKey` is set. */
const FRESH: { id: string; source: string; sourceKey?: boolean }[] = [
  { id: "usd", source: "Coinbase WebSocket" },
  { id: "tokens", source: "NEAR Intents /v0/tokens" },
  { id: "history", source: "CoinGecko" },
  { id: "quotes", source: "", sourceKey: true },
  { id: "status", source: "1Click /v0/status" },
];

/** English agent names (brand-like, shown untranslated). */
const AGENTS = AGENT_DEFS.map((a) => a.name);

/** `desc` is a `docs.api.<desc>` key; examples are code and stay untranslated. */
const ENDPOINTS: { method: string; path: string; desc: string; example: string }[] = [
  { method: "GET", path: "/api/tokens", desc: "tokens", example: `curl https://your-zcan.app/api/tokens` },
  {
    method: "POST",
    path: "/api/quote",
    desc: "quote",
    example: `# recipient: unified u1… or transparent t1…/tex1…; Sapling-only zs1… is rejected
curl -X POST https://your-zcan.app/api/quote \\
  -H 'content-type: application/json' \\
  -d '{"from":"nep141:btc.omft.near","to":"nep141:zec.omft.near",
       "amount":"0.01","mode":"float","dry":true,
       "recipient":"u1…","refundTo":"bc1…"}'`,
  },
  { method: "GET", path: "/api/status?address=…&memo=…", desc: "status", example: `curl 'https://your-zcan.app/api/status?address=bc1q…'` },
  { method: "POST", path: "/api/deposit", desc: "deposit", example: `{"txHash":"…","depositAddress":"bc1q…"}` },
  { method: "GET", path: "/api/chart", desc: "chart", example: `curl https://your-zcan.app/api/chart` },
  { method: "POST", path: "/api/agents/plan", desc: "plan", example: `{"agentId":"breach-guide","values":{"breach":"…"}}` },
  {
    method: "POST",
    path: "/api/agents/run",
    desc: "run",
    example: `{"t":"status","text":"Searching the public web…"}
{"t":"search","query":"Example Corp breach 2026"}
{"t":"source","url":"https://…","title":"…"}
{"t":"text","text":"## What happened\\n…"}
{"t":"done"}`,
  },
];

export default function DocsPage() {
  return (
    <div className="grid gap-3 xl:grid-cols-[220px_minmax(0,1fr)]">
      <Toc items={TOC} />
      <div className="grid min-w-0 gap-3">
        <Panel
          title={<T k="docs.panel" />}
          meta={
            <span>
              <T k="docs.meta" />
            </span>
          }
          bodyClassName="p-5 sm:p-7"
        >
          <p className="eyebrow">
            <T k="docs.eyebrow" />
          </p>
          <h1 className="mt-4 text-[32px] font-medium uppercase leading-[1.05] tracking-tight text-fg sm:text-[44px]" style={{ overflowWrap: "anywhere" }}>
            <T k="docs.headA" /> <span className="text-accent"><T k="docs.headB" /></span>
          </h1>
          <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-muted">
            <T k="docs.intro" />
          </p>
        </Panel>

        <Section id="overview" n="01">
          <div className="dots border border-line p-2 sm:p-4">
            <FlowDiagram />
          </div>
        </Section>

        <Section id="lifecycle" n="02">
          <Lifecycle />
        </Section>

        <Section id="quotes" n="03">
          <QuoteLab />
        </Section>

        <Section id="networks" n="04">
          <NetworkChart />
        </Section>

        <Section id="private-send" n="05">
          <SendTimeline />
          <ul className="mt-6 grid gap-3 text-[13px] leading-relaxed text-muted md:grid-cols-3">
            {["custody", "unlinked", "limits"].map((k) => (
              <li key={k} className="min-w-0 border border-line p-3">
                <span className="block text-[12px] uppercase tracking-wider text-fg">
                  <T k={`docs.send.${k}.title`} />
                </span>
                <T k={`docs.send.${k}.body`} />
              </li>
            ))}
          </ul>
          <Link href="/send" className="btn-accent mt-5 inline-flex min-h-10 items-center px-4 py-2 text-[12px]">
            <T k="docs.send.open" />
          </Link>
        </Section>

        <Section id="live-data" n="06">
          <LiveStrip />
          <table className="mt-6 w-full text-left text-[12px]">
            <thead>
              <tr className="micro border-b border-line">
                <th scope="col" className="py-2 pr-3 font-medium">
                  <T k="docs.fresh.data" />
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  <T k="docs.fresh.source" />
                </th>
                <th scope="col" className="py-2 font-medium">
                  <T k="docs.fresh.freshness" />
                </th>
              </tr>
            </thead>
            <tbody>
              {FRESH.map((r) => (
                <tr key={r.id} className="border-b border-line">
                  <td className="py-2.5 pr-3 uppercase text-fg">
                    <T k={`docs.fresh.${r.id}.data`} />
                  </td>
                  <td className="py-2.5 pr-3 text-muted" style={{ overflowWrap: "anywhere" }}>
                    {r.sourceKey ? <T k={`docs.fresh.${r.id}.source`} /> : r.source}
                  </td>
                  <td className="py-2.5 text-accent">
                    <T k={`docs.fresh.${r.id}.freq`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section id="privacy" n="07">
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-[12px]">
              <thead>
                <tr className="micro border-b border-line">
                  <th scope="col" className="py-2 pr-3 font-medium">
                    <T k="docs.privacy.feature" />
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    <T k="docs.privacy.leaves" />
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    <T k="docs.privacy.goesTo" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {PRIVACY.map((r) => (
                  <tr key={r.id} className="border-b border-line">
                    <td className="py-2.5 pr-3 uppercase text-fg">
                      <T k={`docs.privacy.${r.id}.feature`} />
                    </td>
                    <td className={`py-2.5 pr-3 ${r.nothing ? "text-green" : "text-text"}`}>
                      <T k={`docs.privacy.${r.id}.what`} />
                    </td>
                    <td className="py-2.5 text-muted">
                      <T k={`docs.privacy.${r.id}.to`} vars={{ model: AI_MODEL_NAME }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-6 border border-line p-3 text-[13px] leading-relaxed text-muted">
            <span className="block text-[12px] uppercase tracking-wider text-fg">
              <T k="docs.agents.title" vars={{ n: AGENTS.length }} />
            </span>
            <ul className="mt-2 flex flex-wrap gap-1.5" translate="no">
              {AGENTS.map((a) => (
                <li key={a} className="tag text-text">
                  {a}
                </li>
              ))}
            </ul>
            <p className="mt-2">
              <T k="docs.agents.body" />
            </p>
          </div>
        </Section>

        <Section id="api" n="08">
          <div className="grid gap-4">
            {ENDPOINTS.map((e) => (
              <div key={e.path} className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                <div>
                  <p className="flex items-center gap-2 text-[13px]">
                    <span className={`tag ${e.method === "GET" ? "text-green" : "text-accent"}`}>{e.method}</span>
                    <code className="text-fg">{e.path}</code>
                  </p>
                  <p className="mt-2 text-[13px] leading-relaxed text-muted">
                    <T k={`docs.api.${e.desc}`} />
                  </p>
                </div>
                <Code label={<T k={e.path.startsWith("/api/agents/run") ? "docs.api.stream" : "docs.api.request"} />}>{e.example}</Code>
              </div>
            ))}
          </div>
        </Section>

        <Section id="self-host" n="09">
          <Code label=".env.local">{`# Swaps (optional; keyless quotes include a 0.2% 1Click fee)
ONECLICK_JWT=
ZCAN_FEE_RECIPIENT=   # your NEAR Intents account for a service fee
ZCAN_FEE_BPS=         # e.g. 50 = 0.5%

# Privacy agents — any OpenAI-compatible model (DeepSeek by default)
AI_API_KEY=
AI_BASE_URL=          # e.g. your own vLLM deployment (deploy/model); empty = DeepSeek
AI_MODEL=             # model for reports (required for a custom endpoint)
AI_PLAN_MODEL=        # optional faster model for plans
NEXT_PUBLIC_AI_SELF_HOSTED=   # true only for a model you deploy yourself
NEXT_PUBLIC_AI_MODEL_NAME=    # its name, e.g. "Zcan Privacy Model"
NEXT_PUBLIC_AI_HOST=          # GPU host, e.g. "Modal"
NEXT_PUBLIC_AI_PROVIDER=      # or: the outside AI company answering
TAVILY_API_KEY=       # optional live web search

# Optional: opt-in, anonymized training data for your own model
TRAINING_SIGNING_SECRET=   # 32+ random characters
TRAINING_ADMIN_TOKEN=      # 24+ chars; GET /api/training/export
KV_REST_API_URL=           # Upstash / Vercel KV Redis REST store
KV_REST_API_TOKEN=

# Optional: cookieless usage counts, proxied through /api/event
NEXT_PUBLIC_ANALYTICS=     # plausible | umami
ANALYTICS_SITE=            # Plausible domain or Umami website id`}</Code>
        </Section>
      </div>
    </div>
  );
}
