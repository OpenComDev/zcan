import { describe, expect, it } from "vitest";
import { browserOf, routeOf, sanitizeReport, scrubStack, scrubText } from "@/lib/error-scrub";

const SEED12 = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const HOST = "www.zcan.dev";

describe("scrubText", () => {
  it("removes addresses, emails, keys and long ids", () => {
    const s = scrubText(
      "Bad recipient t1Rv4exT7bqhZqi2j7xz8bUHDMxwosrjADU for alice@example.com via 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 hash e3b0c44298fc1c149afbf4c8996fb92427ae41e4 order 1234567",
    );
    expect(s).not.toMatch(/t1Rv4|alice|0xd8dA|e3b0c4|1234567/);
    expect(s).toContain("[address]");
    expect(s).toContain("[email]");
  });

  it("drops the whole message when it contains a seed phrase", () => {
    expect(scrubText(`JSON parse failed near "${SEED12}"`)).toBe("[removed: looked like a secret]");
  });

  it("keeps only the host of other sites and strips query strings", () => {
    expect(scrubText("fetch https://api.example.org/v1/user/42?token=abc failed")).toBe("fetch https://api.example.org failed");
    expect(scrubText(`load https://${HOST}/pay/r?to=t1abc&amount=2 failed`, HOST)).toBe("load /pay/r failed");
  });

  it("caps length", () => {
    expect(scrubText("x ".repeat(1000)).length).toBeLessThanOrEqual(401);
  });
});

describe("scrubStack", () => {
  it("keeps Zcan bundle paths and drops other URLs", () => {
    const stack = [
      "TypeError: x is undefined",
      `    at render (https://${HOST}/_next/static/chunks/0a1b2c3d4e5f6a7b.js:1:2345)`,
      "    at https://cdn.example.com/lib.js?v=9:10:20",
      "    at chrome-extension://abcdef/content.js:1:1",
    ].join("\n");
    const out = scrubStack(stack, HOST)!.split("\n");
    expect(out[0]).toBe("at render (/_next/static/chunks/0a1b2c3d4e5f6a7b.js:1:2345)");
    expect(out[1]).toBe("at (https://cdn.example.com:10:20)");
    expect(out[2]).toContain("[extension]");
  });
});

describe("routeOf", () => {
  it("replaces ids and drops query strings", () => {
    expect(routeOf("/order/abc123def456")).toBe("/order/[id]");
    expect(routeOf("/pay/r?to=t1abc&amount=1")).toBe("/pay/r");
    expect(routeOf("/learn/viewing-keys")).toBe("/learn/viewing-keys");
  });
});

describe("browserOf", () => {
  it("reports only family, major version and OS", () => {
    expect(browserOf("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.7390.54 Safari/537.36")).toBe("Chrome 141 · macOS");
    expect(browserOf("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1")).toBe("Safari 18 · iOS");
    expect(browserOf("Mozilla/5.0 (X11; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0")).toBe("Firefox 145 · Linux");
  });
});

describe("sanitizeReport", () => {
  it("rejects junk and unknown sources", () => {
    expect(sanitizeReport(null)).toBeNull();
    expect(sanitizeReport({ source: "evil", message: "x" })).toBeNull();
  });

  it("re-scrubs fields from the client", () => {
    const r = sanitizeReport({ source: "client", name: "Error", message: "bad t1Rv4exT7bqhZqi2j7xz8bUHDMxwosrjADU", route: "/order/xyz789abc?x=1", env: "Chrome 141", locale: "es", release: "not-a-sha" }, HOST);
    expect(r).toMatchObject({ source: "client", message: "bad [address]", route: "/order/[id]", locale: "es" });
    expect(r?.release).toBeUndefined();
  });
});
