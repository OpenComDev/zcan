import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

/**
 * The extension's content script (extension/dist/content.js, from `pnpm build:extension`) run on a test
 * page with the chrome.* APIs it uses simulated. Branded Chrome can't load unpacked extensions under
 * automation, so this checks the script's behaviour directly.
 */
const CONTENT = "extension/dist/content.js";

const STUB = () => {
  const w = window as unknown as Record<string, unknown>;
  w.__copied = null;
  w.chrome = {
    i18n: { getMessage: (k: string) => k },
    storage: { local: { get: async () => ({}), set: async () => {} }, onChanged: { addListener() {} } },
    runtime: {
      sendMessage: async (m: { type: string; address?: string }) => {
        if (m.type === "copied-address") w.__copied = { address: m.address, at: Date.now() };
        if (m.type === "last-copied") return w.__copied;
      },
    },
  };
};

test.skip(!existsSync(CONTENT), "run `pnpm build:extension` first");

test.beforeEach(async ({ page }) => {
  await page.setContent(`<p id="link">https://example.com/a?id=1&utm_source=news&fbclid=abc</p><p id="addr">0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045</p><input id="to">`);
  await page.evaluate(STUB);
  await page.addScriptTag({ content: readFileSync(CONTENT, "utf8") });
  await page.waitForTimeout(100);
});

const copy = (page: import("@playwright/test").Page, id: string) =>
  page.evaluate((id) => {
    const r = document.createRange();
    r.selectNodeContents(document.getElementById(id)!);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(r);
    const data = new DataTransfer();
    document.dispatchEvent(new ClipboardEvent("copy", { clipboardData: data, bubbles: true, cancelable: true }));
    return data.getData("text/plain");
  }, id);

const paste = (page: import("@playwright/test").Page, text: string) =>
  page.evaluate((text) => {
    const data = new DataTransfer();
    data.setData("text/plain", text);
    document.getElementById("to")!.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, text);

test("copying a tracked link puts the clean link on the clipboard", async ({ page }) => {
  expect(await copy(page, "link")).toBe("https://example.com/a?id=1");
});

test("pasting a different address than the one copied shows a warning", async ({ page }) => {
  await copy(page, "addr");
  await paste(page, "0xd8dA9999999999999999999999999999999A6045");
  await expect(page.locator("zcan-guard")).toHaveCount(1);
});

test("pasting the same address shows nothing", async ({ page }) => {
  await copy(page, "addr");
  await paste(page, "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045");
  await page.waitForTimeout(300);
  await expect(page.locator("zcan-guard")).toHaveCount(0);
});
