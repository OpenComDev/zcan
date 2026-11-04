import { describe, expect, it } from "vitest";
import { LinkError, SAMPLE_LINK, cleanLink } from "@/lib/link-clean";

describe("cleanLink", () => {
  it("strips utm and click-id parameters and keeps the rest", () => {
    const r = cleanLink("https://example.com/page?id=7&utm_source=x&utm_medium=y&fbclid=abc&gclid=def");
    expect(r.cleaned).toBe("https://example.com/page?id=7");
    expect(r.removed.map((x) => x.key).sort()).toEqual(["fbclid", "gclid", "utm_medium", "utm_source"]);
  });

  it("leaves a clean link unchanged", () => {
    const r = cleanLink("https://example.com/a?q=zcash");
    expect(r.cleaned).toBe("https://example.com/a?q=zcash");
    expect(r.removed).toHaveLength(0);
  });

  it("unwraps redirect wrappers", () => {
    const r = cleanLink(`https://l.facebook.com/l.php?u=${encodeURIComponent("https://example.org/x?utm_source=fb")}`);
    expect(r.unwrapped).toBe(true);
    expect(r.cleaned).toBe("https://example.org/x");
  });

  it("canonicalises Amazon product links", () => {
    const r = cleanLink("https://www.amazon.com/Some-Long-Slug/dp/B000123456/ref=sr_1_1?keywords=x&qid=1");
    expect(r.cleaned).toBe("https://www.amazon.com/dp/B000123456");
  });

  it("adds https when the scheme is missing", () => {
    expect(cleanLink("example.com/x?utm_campaign=a").cleaned).toBe("https://example.com/x");
  });

  it("cleans the sample link", () => {
    expect(cleanLink(SAMPLE_LINK).removed.length).toBeGreaterThan(0);
  });

  it.each([
    ["", "empty"],
    ["javascript:alert(1)", "protocol"],
    ["localhost", "notFull"],
  ])("rejects %j with %s", (input, code) => {
    expect(() => cleanLink(input)).toThrow(LinkError);
    try {
      cleanLink(input);
    } catch (e) {
      expect((e as LinkError).code).toBe(code);
    }
  });
});
