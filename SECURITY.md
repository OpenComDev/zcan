# Security policy

Zcan routes real funds, so security reports matter more than anything else here.

## Reporting a vulnerability

**Don't open a public issue.** Email **info@zcan.dev** with:

- what you found and where (URL, file, route),
- steps to reproduce,
- what an attacker could do with it.

You'll get a reply within 72 hours. Please give us a reasonable window to fix the issue before you
disclose it publicly; we'll credit you in the fix unless you'd rather stay anonymous.

## Scope

In scope: this repository and the site it runs (zcan.dev), including the swap and send flows, the API
routes under `src/app/api`, the privacy agents, and the browser extension in `extension/`.

Out of scope: the third-party services Zcan uses (NEAR Intents 1Click, ChangeNOW, Modal, Tavily,
CoinGecko, Coinbase). Report problems in those to their owners.

## Past reviews

`docs/security-review-2026-10.md` is the most recent internal review, with each finding and its status.
