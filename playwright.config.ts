import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end checks. Three ways to run:
 * - CI (GitHub Actions): builds, starts `next start` on :3000 and tests it.
 * - Against a deployment: E2E_BASE_URL=https://preview-url pnpm test:e2e
 * - Locally against `pnpm dev`: E2E_BASE_URL=http://localhost:3000 E2E_CHANNEL=chrome pnpm test:e2e
 */
const external = process.env.E2E_BASE_URL;
const baseURL = external ?? "http://localhost:3000";
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
// The dev server compiles each route on first visit, which can take a minute on a slow disk.
const slow = !process.env.CI;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: slow ? 240_000 : 60_000,
  expect: { timeout: slow ? 90_000 : 15_000 },
  fullyParallel: !slow,
  workers: slow ? 1 : undefined,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    channel: process.env.E2E_CHANNEL || undefined,
    trace: "retain-on-failure",
    extraHTTPHeaders: bypass ? { "x-vercel-protection-bypass": bypass, "x-vercel-set-bypass-cookie": "true" } : undefined,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /pages\.spec\.ts/ },
  ],
  webServer: external
    ? undefined
    : { command: "pnpm start", url: baseURL, reuseExistingServer: !process.env.CI, timeout: 120_000 },
});
