# Zcan

[![CI](https://github.com/OpenComDev/zcan/actions/workflows/ci.yml/badge.svg)](https://github.com/OpenComDev/zcan/actions/workflows/ci.yml)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)

**Less exposed. More in control.** Live at [zcan.dev](https://www.zcan.dev). A privacy toolkit with:

- **Private swap**: any asset ↔ ZEC with no account. Swaps are real and settle through the [NEAR Intents 1Click API](https://docs.near-intents.org/near-intents/integration/distribution-channels/1click-api), with [ChangeNOW](https://changenow.io) as an optional backup route while 1Click is unreachable; Zcan never holds funds.
- **Privacy tools** (`/tools`): a link cleaner that strips tracking parameters and unwraps redirects, and a photo cleaner that shows a photo's EXIF, GPS, XMP and IPTC data and saves a clean JPEG. Both run fully in the browser.
- **Privacy agents** (`/agents`): Exposure Scout, Breach Guide, Access Auditor and more, running on Zcan's own open-weights model (or any OpenAI-compatible API) with Tavily web search. Each agent drafts a plan, waits for the user to approve or skip each step, then runs only the approved steps and streams a report.
- **Private send** (`/send`): split one amount (e.g. ZEC → ZEC) across up to 10 recipients with shares and staggered delays. Each leg is its own 1Click order paid by a market maker, so recipients never see your wallet. The `/send/[id]` batch page schedules and tracks every deposit.
- **Docs** (`/docs`): animated architecture and lifecycle diagrams, a live quote/slippage lab, a live networks chart and the API reference.
- **iPhone app teaser**: the private browser, VPN and tools from the brand film, marked "Dropping soon".

## Interface

Zcan is laid out like an instrument-panel app rather than a landing page:

- **Window bar:** breadcrumbs, local clock, measured API latency, ⌘K command palette, and an Orders button that opens a live order feed.
- **Sidebar:** views (Swap, Markets, Tools, Agents, Track, iPhone app, Help), recent orders with live statuses, and a ZEC/USD 24h chart.
- **Swap view:** a point-cloud HUD viewport, the swap form, and Pair Inspector, ZEC Market and Order Feed panels.
- **Mobile:** the sidebar collapses into a bottom tab bar and a menu.

The theme lives in `src/app/globals.css`. Change `--accent` to re-skin the whole app.

## Live data

| Data | Source | Freshness |
| --- | --- | --- |
| USD prices for ZEC and 26 other assets | Coinbase public WebSocket (`src/lib/live-prices.ts`) | Real time, batched to 4 updates a second |
| Token list and fallback prices | NEAR Intents 1Click `/v0/tokens` | Every 30 s |
| ZEC 24h history, volume and market cap | CoinGecko (`/api/chart`), with live ticks appended | Every 5 min |
| Swap quotes | 1Click dry-run quotes | Every 15 s while the form is complete |
| Order status (order page / background) | 1Click `/v0/status` | Every 5 s / 10 s |

Swap quotes and payouts always come from 1Click. Coinbase prices are used for display and estimates only.

## Run it

```bash
pnpm install
cp .env.example .env.local   # optional — works without any keys
pnpm dev
```

## Languages

Pages live under `src/app/[lang]` and are rendered on the server in English, Spanish, Portuguese, Turkish,
Russian and Chinese. English is served at bare paths (`/tools`), other languages under their code
(`/es/tools`); `next.config.ts` rewrites bare paths to English and redirects to a visitor's chosen language
(`zcan-locale` cookie) or, on a first visit, their browser language. Use `@/components/locale-link` instead of
`next/link` so links stay in the reader's language. Strings live in `src/i18n/*.ts`; page titles and
descriptions in `src/i18n/meta.ts`.

## Browser extension

`extension/` holds a small Manifest V3 extension that brings two tools to every site, with no network access:
links you copy are cleaned of trackers (plus a right-click "Copy clean link"), and an always-on clipboard
guard warns when a pasted crypto address isn't the one you copied. It bundles the site's own
`src/lib/link-clean.ts`.

```bash
pnpm build:extension   # → extension/dist (load unpacked) and extension/zcan-extension.zip (store upload)
```

Try it: Chrome → `chrome://extensions` → Developer mode → Load unpacked → `extension/dist`.
Publishing needs a Chrome Web Store developer account; upload the zip. CI builds the zip on every push.

## Tests

```bash
pnpm typecheck && pnpm lint   # types and lint
pnpm test                     # unit tests (Vitest): link cleaner, secret guard, checklists, addresses, translations
pnpm build && pnpm test:e2e   # end-to-end tests (Playwright) against `next start`
E2E_BASE_URL=http://localhost:3000 E2E_CHANNEL=chrome pnpm test:e2e   # …or against a running dev server
```

GitHub Actions runs all of these on every push (`.github/workflows/ci.yml`), and runs the end-to-end
tests again against each Vercel deployment once it's ready (`preview.yml`). Optional repository secrets:
`ONECLICK_API_KEY` (adds a real dry swap-quote test) and `VERCEL_AUTOMATION_BYPASS_SECRET` (if Vercel
deployment protection is on).

## How a swap works

1. **Estimate.** The widget prices the pair from `/api/tokens` (1Click's token list with live USD prices).
2. **Exact quote.** Once both addresses are filled in, it requests a dry-run quote (`dry: true`) every 30 s and shows the rate, the guaranteed minimum and the ETA.
3. **Create.** "Exchange now" requests a real quote (`dry: false`). 1Click returns a one-time deposit address, the order is saved to local history, and the user lands on `/order/<depositAddress>`.
4. **Track.** The order page polls `/api/status` every 5 s. The flow runs awaiting deposit → confirming → exchanging → completed, or ends as refunded/failed. Users can submit a tx hash to speed up detection.

Every swap has native ZEC on one side; the server enforces this.

| Mode | 1Click `swapType` | Behaviour |
| --- | --- | --- |
| Floating (default) | `EXACT_INPUT` | Fixed send amount. Receive amount is estimated, with a 1% guaranteed minimum. |
| Fixed rate | `EXACT_OUTPUT` | Fixed receive amount. Send amount includes a buffer, and any excess is refunded. |

## Layout

```
src/
  app/
    page.tsx              Home: hero + widget, ZEC markets, promise, how it works, FAQ
    order/[id]/           Order page: deposit QR, countdown, live status, tx links
    track/                Look up an order by deposit address
    api/tokens|quote|status|deposit   Server proxies to 1Click (keeps keys server-side)
  components/             Exchange widget, token picker, history drawer, header, footer
  lib/
    oneclick.ts           Typed 1Click client (server-only)
    token-list.ts         Normalized, cached token list
    tokens.ts             Shared token types + amount helpers
    history.ts            Local swap history (localStorage)
```

## Privacy agents

1. `POST /api/agents/plan` asks the model for a plan as JSON (a JSON schema, or JSON mode for DeepSeek). Nothing is searched at this stage.
2. The user unticks any steps they don't want.
3. `POST /api/agents/run` runs only the approved steps. When a search step was approved and `TAVILY_API_KEY` is set, the model gets a `web_search` tool backed by Tavily (at most 8 searches per run). It streams newline-delimited JSON (search queries, sources and report text) to the page.

The model is any OpenAI-compatible API. The intended setup is **Zcan's own model**: an open-weights model
served with vLLM on Modal GPUs that scale to zero, behind Modal's proxy token, with no prompt logging. See
[`deploy/model/README.md`](deploy/model/README.md). Without it, DeepSeek is the default. `src/lib/ai-model.ts`
keeps the site's wording tied to the real endpoint: an outside provider is always named, and the "own model"
wording only appears for a self-hosted deployment. Search queries go to Tavily either way. Per-IP and daily
limits are shared through Upstash when it's configured (`src/lib/shared-limit.ts`).

## Configuration

Everything is optional; see [`.env.example`](.env.example) for the full list with explanations. The main ones:

- `ONECLICK_API_KEY`: 1Click API key. Keyless quotes include a 0.2% 1Click fee.
- `CHANGENOW_API_KEY`: backup swap route used only while 1Click is down.
- `ZCAN_FEE_RECIPIENT` / `ZCAN_FEE_BPS`: your own service fee, paid to a NEAR Intents account.
- `AI_API_KEY` / `AI_BASE_URL` / `AI_MODEL`: turns on the privacy agents (see `deploy/model/README.md`).
- `TAVILY_API_KEY`: live web search for the agents.
- `NEXT_PUBLIC_REOWN_PROJECT_ID`: "Pay with wallet" on order pages.
- `KV_REST_API_URL` / `KV_REST_API_TOKEN`: Upstash Redis for shared rate limits, crash reports and opt-in training data.

## Contributing

Pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first. Report security issues privately:
see [SECURITY.md](SECURITY.md).

## License

Zcan is free software under the [GNU Affero General Public License v3.0](LICENSE). If you run a modified
version as a public service, the AGPL requires you to offer your users its source code.

The license covers the code, not the brand. The Zcan name and logo aren't licensed for use by forks;
please rename your deployment.

Zcan is an independent project and isn't affiliated with Electric Coin Co. or the Zcash Foundation.
