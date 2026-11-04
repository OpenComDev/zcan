# Contributing to Zcan

Thanks for helping. Bug reports, translations and pull requests are all welcome.

## Getting started

```bash
pnpm install
cp .env.example .env.local   # optional: the site runs without any keys
pnpm dev
```

Swaps work without keys (keyless 1Click quotes). The privacy agents need an `AI_API_KEY`; see
`.env.example` and `deploy/model/README.md`.

## Before you open a pull request

```bash
pnpm typecheck && pnpm lint && pnpm test
```

CI runs these plus a production build and the Playwright end-to-end tests.

- Keep pull requests focused on one change, and explain the why in the description.
- Add or update tests for behaviour changes (`tests/unit` for logic, `tests/e2e` for flows).
- User-facing text lives in `src/i18n/*.ts`. Add new strings in every language; if you can't translate
  one, use the English text and say so in the pull request.
- Never commit keys or `.env` files. Server secrets stay in server-only modules (`import "server-only"`).
- The site makes privacy claims. If a change sends user data somewhere new, update the Transparency
  page (`src/app/[lang]/transparency`) in the same pull request.

## Security issues

Don't open public issues for vulnerabilities. See [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contributions are licensed under the
[GNU AGPL-3.0](LICENSE), the same license as the project.
