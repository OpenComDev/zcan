import { expect, type Page } from "@playwright/test";

/**
 * Collects uncaught page errors and console errors. Errors from third-party network calls
 * (wallet relays, price feeds, explorers) are ignored: CI has no say over those services.
 */
export function watchErrors(page: Page) {
  const errors: string[] = [];
  const ignore = /Failed to load resource|net::ERR_|ERR_NAME_NOT_RESOLVED|walletconnect|reown|web3modal|coinbase|Download the React DevTools|\[HMR\]|\[Fast Refresh\]/i;
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !ignore.test(m.text())) errors.push(`console: ${m.text()}`);
  });
  return errors;
}

/** Waits for React to hydrate: the shell marks <html> once client code has run. */
export async function hydrated(page: Page) {
  await page.waitForFunction(() => document.documentElement.lang !== "" && document.readyState === "complete");
}

export async function noHorizontalOverflow(page: Page) {
  const extra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(extra, "page is wider than the screen").toBeLessThanOrEqual(1);
}
