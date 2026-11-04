# Changelog

All notable changes to Zcan are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.1] - 2026-11-04

### Security

- Agent plans are now signed by the server and checked before a run (security review finding ZS-10). Edited
  plans are refused, and runs whose plan Zcan didn't sign are never offered as training data.

### Added

- A "Source code" link in the site footer and on the Transparency page.
- A demo GIF and this changelog.

### Removed

- Dependabot version-update pull requests.

## [0.1.0] - 2026-11-04

First public release, under the AGPL-3.0.

### Added

- **Private swap:** 200+ assets ↔ ZEC through NEAR Intents 1Click, with floating and fixed-rate modes, live quotes
  and a refund address.
- **Backup swap route:** fixed-rate ChangeNOW orders on popular pairs, used automatically while 1Click is down.
- **Private send:** split one amount across up to 10 recipients with custom shares and staggered delays.
- **Payment requests** and **order tracking**.
- **Nine privacy agents:** Exposure Scout, Breach Guide, Access Auditor, Data Broker Remover, Account Cleanup,
  Social Media Lockdown, Phishing Check, Wallet Hygiene and Travel Privacy. Plan → approve → run, with Tavily web
  search, scheduled re-checks and follow-up checklists.
- **Zcan's own model:** gpt-oss-20b on vLLM, deployed to Modal GPUs that scale to zero (`deploy/model`).
- **Privacy tools:** link cleaner and photo metadata cleaner, both fully in the browser.
- **Markets:** live ZEC price, 24h history and local price alerts.
- **Transparency page** with live service health and a per-feature map of what leaves the device.
- **Browser extension** (Manifest V3): clean links on copy and a clipboard address guard.
- Six languages: English, Spanish, Portuguese, Turkish, Russian and Chinese.

[Unreleased]: https://github.com/OpenComDev/zcan/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/OpenComDev/zcan/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/OpenComDev/zcan/releases/tag/v0.1.0
