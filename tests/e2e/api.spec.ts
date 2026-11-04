import { expect, test } from "@playwright/test";

test("security headers are set", async ({ request }) => {
  const res = await request.get("/");
  const h = res.headers();
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  // The base policy is always enforced; the full allowlist is enforced or report-only (CSP_ENFORCE).
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["content-security-policy"]).toContain("object-src 'none'");
  expect(h["content-security-policy"]).toContain("form-action 'self'");
  const full = h["content-security-policy-report-only"] ?? h["content-security-policy"];
  expect(full).toContain("default-src 'self'");
  expect(full).toContain("connect-src 'self'");
  expect(full).toContain("report-uri /api/csp-report");
  expect(h["cross-origin-opener-policy"]).toBe("same-origin-allow-popups");
});

test("security.txt is served", async ({ request }) => {
  const res = await request.get("/.well-known/security.txt");
  expect(res.ok()).toBe(true);
  expect(await res.text()).toContain("Contact: mailto:");
});

test("swap token list loads with ZEC", async ({ request }) => {
  const res = await request.get("/api/tokens");
  expect(res.ok(), await res.text()).toBe(true);
  const list: { symbol: string }[] = await res.json();
  expect(list.some((t) => t.symbol === "ZEC")).toBe(true);
});

test("swap quote endpoint validates input", async ({ request }) => {
  const res = await request.post("/api/quote", { data: { from: "", to: "", amount: "" } });
  expect(res.status()).toBe(400);
});

// A real (dry, price-only) quote needs the 1Click key on the server. CI sets E2E_QUOTE=1 when the key is available.
test("swap quote loads", async ({ request }) => {
  test.skip(process.env.E2E_QUOTE !== "1", "no 1Click key in this environment");
  const tokens: { id: string; symbol: string; chain: string }[] = await (await request.get("/api/tokens")).json();
  const usdc = tokens.find((t) => t.symbol === "USDC" && t.chain === "eth");
  const zec = tokens.find((t) => t.symbol === "ZEC" && t.chain === "zec");
  expect(usdc && zec).toBeTruthy();
  const res = await request.post("/api/quote", {
    data: {
      from: usdc!.id,
      to: zec!.id,
      amount: "50",
      mode: "float",
      dry: true,
      recipient:
        "u1l8xunezsvhq8fgzfl7404m450nwnd76zshscn6nfys7vyz2ywyh4cc5daaq0c7q2su5lqfh23sp7fkf3kt27ve5948mzpfdvckzaect2jtte308mkwlycj2u0eac077wu70vqcetkxf",
      refundTo: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    },
  });
  expect(res.ok(), await res.text()).toBe(true);
  const body = await res.json();
  expect(Number(body.quote?.amountOut)).toBeGreaterThan(0);
});

test("health endpoint reports services", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBe(true);
  const body = await res.json();
  expect(Array.isArray(body.services)).toBe(true);
});

test("shared results have a page and a preview image, built only from the numbers", async ({ request }) => {
  const img = await request.get("/api/og/share?kind=fingerprint&n=44000");
  expect(img.status()).toBe(200);
  expect(img.headers()["content-type"]).toContain("image/png");
  expect((await request.get("/api/og/share?kind=photo&n=<b>")).status()).toBe(404);
  const html = await (await request.get("/es/share/photo?n=23&gps=1")).text();
  expect(html).toContain("23 datos ocultos eliminados de una foto");
  expect(html).toContain("/api/og/share?kind=photo&amp;n=23&amp;gps=1");
  expect(html).toContain('content="noindex');
});

test("policy violation reports are accepted and never echo anything back", async ({ request }) => {
  const res = await request.post("/api/csp-report", {
    headers: { "content-type": "application/csp-report" },
    data: { "csp-report": { "document-uri": "https://www.zcan.dev/tools", "effective-directive": "connect-src", "blocked-uri": "https://example.com/x" } },
  });
  expect(res.status()).toBe(204);
  expect(await res.text()).toBe("");
});
