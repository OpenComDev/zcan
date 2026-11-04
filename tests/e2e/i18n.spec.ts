import { expect, test } from "@playwright/test";
import { DICTS } from "../../src/i18n";
import { LOCALE_CODES, localePath } from "../../src/lib/locales";

for (const locale of LOCALE_CODES) {
  const url = localePath("/tools", locale);

  test(`${url} is rendered in ${locale} on the server`, async ({ request }) => {
    const res = await request.get(url, { headers: { "sec-fetch-dest": "document" } });
    expect(res.status()).toBe(200);
    const html = await res.text();
    // Already translated in the HTML: no English flash before hydration.
    expect(html).toContain(`<html lang="${locale}"`);
    expect(html).toContain(DICTS[locale].tools!["link.clean"]);
    expect(html).toContain(`<title>${DICTS[locale].meta?.["tools.title"] ?? DICTS.en.meta!["tools.title"]} · Zcan</title>`);
    // Every language version is linked for search engines.
    for (const l of LOCALE_CODES) expect(html).toContain(`href="https://www.zcan.dev${localePath("/tools", l)}"`);
  });

  test(`${url} works in the browser and keeps links in ${locale}`, async ({ page }) => {
    await page.goto(url);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.getByRole("button", { name: DICTS[locale].tools!["link.clean"], exact: true })).toBeVisible();
    const hrefs = await page.locator('nav a[href^="/"]').evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
    expect(hrefs.length).toBeGreaterThan(3);
    if (locale !== "en") for (const h of hrefs) expect(h === `/${locale}` || h.startsWith(`/${locale}/`), h).toBe(true);
  });
}

test("/en/… redirects to the bare English URL", async ({ request }) => {
  const res = await request.get("/en/tools", { maxRedirects: 0 });
  expect(res.status()).toBe(308);
  expect(res.headers()["location"]).toMatch(/\/tools$/);
});

test("a saved language choice redirects bare pages, keeping the query", async ({ request }) => {
  const res = await request.get("/tools?x=1", { maxRedirects: 0, headers: { cookie: "zcan-locale=es", "sec-fetch-dest": "document" } });
  expect(res.status()).toBe(307);
  expect(res.headers()["location"]).toMatch(/\/es\/tools\?x=1$/);
});

test("browser language picks the first visit's language, an explicit English choice wins", async ({ request }) => {
  const first = await request.get("/learn", { maxRedirects: 0, headers: { "accept-language": "ru-RU,ru;q=0.9", "sec-fetch-dest": "document" } });
  expect(first.status()).toBe(307);
  expect(first.headers()["location"]).toMatch(/\/ru\/learn$/);
  const chose = await request.get("/learn", { maxRedirects: 0, headers: { "accept-language": "ru", cookie: "zcan-locale=en", "sec-fetch-dest": "document" } });
  expect(chose.status()).toBe(200);
});

test("unknown pages are a translated 404", async ({ page }) => {
  const res = await page.goto("/es/no-such-page");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: DICTS.es.misc!["notFound.title"] })).toBeVisible();
});

test("the sitemap lists every language", async ({ request }) => {
  const xml = await (await request.get("/sitemap.xml")).text();
  for (const l of LOCALE_CODES) expect(xml).toContain(`https://www.zcan.dev${localePath("/tools/fingerprint", l)}`);
  expect(xml).not.toContain("/order/");
});
