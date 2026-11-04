import { expect, test } from "@playwright/test";
import { noHorizontalOverflow, watchErrors } from "./helpers";

const ROUTES = [
  "/",
  "/app",
  "/tools",
  "/tools/address",
  "/tools/aliases",
  "/tools/clipboard",
  "/tools/documents",
  "/tools/fingerprint",
  "/tools/passwords",
  "/agents",
  "/agents/phishing-check",
  "/agents/wallet-hygiene",
  "/learn",
  "/learn/transparent-vs-shielded",
  "/guides",
  "/guides/remove-location-from-photos",
  "/guides/remove-tracking-from-links",
  "/guides/is-this-email-phishing",
  "/markets",
  "/network",
  "/status",
  "/pay",
  "/send",
  "/history",
  "/track",
  "/help",
  "/docs",
  "/security",
  "/refer",
  "/transparency",
  "/support",
  "/legal/website/privacy-policy",
];

for (const route of ROUTES) {
  test(`renders ${route}`, async ({ page }) => {
    const errors = watchErrors(page);
    const res = await page.goto(route);
    expect(res?.status(), "HTTP status").toBeLessThan(400);
    await expect(page.locator("h1").first()).toBeVisible();
    // Give client code a moment to run so hydration errors surface. (Not "networkidle": prices poll.)
    await page.waitForTimeout(1500);
    await noHorizontalOverflow(page);
    expect(errors).toEqual([]);
  });
}

// The main pages in every other language too (one per language keeps the run short).
for (const route of ["/es", "/pt/agents", "/tr/learn", "/ru/send", "/zh/pay", "/es/guides/check-if-password-was-leaked", "/zh/guides/browser-fingerprint-test"]) {
  test(`renders ${route}`, async ({ page }) => {
    const errors = watchErrors(page);
    const res = await page.goto(route);
    expect(res?.status(), "HTTP status").toBeLessThan(400);
    await expect(page.locator("h1").first()).toBeAttached();
    await page.waitForTimeout(1500);
    await noHorizontalOverflow(page);
    expect(errors).toEqual([]);
  });
}

test("unknown pages return 404", async ({ page }) => {
  const res = await page.goto("/this-page-does-not-exist");
  expect(res?.status()).toBe(404);
});
