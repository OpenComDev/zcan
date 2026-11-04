import { expect, test } from "@playwright/test";

test("submitting before the page is ready never puts the link in the URL", async ({ page }) => {
  await page.route("**/_next/static/**", (route) => route.abort());
  await page.goto("/tools");
  await page.getByRole("textbox", { name: "Link to clean" }).fill("https://example.com/?secret=1");
  await page.getByRole("button", { name: "Clean link", exact: true }).click();
  await page.waitForTimeout(1000);
  expect(page.url()).not.toContain("secret");
});

test("link cleaner removes trackers without network requests", async ({ page }) => {
  await page.goto("/tools");
  const box = page.getByRole("textbox", { name: "Link to clean" });
  // Wait for the page's code to run: "Try a tracked link" only works once the page is hydrated.
  await expect(async () => {
    await page.getByRole("button", { name: "Try a tracked link" }).click();
    await expect(page.getByText(/trackers? removed/i).first()).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 120_000 });
  await box.fill("https://example.com/item?id=4&utm_source=news&fbclid=abc123");
  // Requests made after this point that carry the link would mean it left the device.
  const requests: string[] = [];
  page.on("request", (r) => {
    if (!r.url().includes("/_next/") && !r.url().includes("__nextjs")) requests.push(r.url());
  });
  await page.getByRole("button", { name: "Clean link", exact: true }).click();
  await expect(page.getByText("https://example.com/item?id=4", { exact: true })).toBeVisible();
  expect(requests.filter((u) => u.includes("example.com") || u.includes("utm_source"))).toEqual([]);
});

test("address checker recognises a Bitcoin address", async ({ page }) => {
  await page.goto("/tools/address");
  await page.getByRole("textbox").first().fill("bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq");
  await expect(page.getByText(/Bitcoin/).first()).toBeVisible();
});

test("password generator makes a password", async ({ page }) => {
  await page.goto("/tools/passwords");
  await expect(page.locator("[translate=no], output, code").first()).toBeVisible();
});
