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

  it.each([
    "https://eur01.safelinks.protection.outlook.com/",
    "https://safelinks.protection.outlook.com/",
    "https://slack-redir.net/link",
  ])("unwraps %s and cleans the destination without opening it", (wrapper) => {
    const r = cleanLink(`${wrapper}?url=${encodeURIComponent("https://example.org/x?keep=yes&utm_source=work")}`);
    expect(r.cleaned).toBe("https://example.org/x?keep=yes");
    expect(r.unwrapped).toBe(true);
    expect(r.removed.map((x) => x.key)).toEqual(["redirect", "utm_source"]);
    expect(r.trackers.map((x) => x.id)).toEqual(["redirect", "ga"]);
  });

  it("unwraps nested Outlook and Slack links within the existing depth limit", () => {
    const slack = `https://slack-redir.net/link?url=${encodeURIComponent("http://example.org/x?utm_medium=email")}`;
    const outlook = `https://nam12.safelinks.protection.outlook.com/?url=${encodeURIComponent(slack)}`;
    const r = cleanLink(outlook);
    expect(r.cleaned).toBe("http://example.org/x");
    expect(r.removed.filter((x) => x.key === "redirect")).toHaveLength(2);
    let nested = "https://example.org/x";
    for (let i = 0; i < 4; i++) nested = `https://slack-redir.net/link?url=${encodeURIComponent(nested)}`;
    const bounded = cleanLink(nested);
    expect(new URL(bounded.cleaned).hostname).toBe("slack-redir.net");
    expect(bounded.removed.filter((x) => x.key === "redirect")).toHaveLength(3);
  });

  it.each([
    "https://evilsafelinks.protection.outlook.com/",
    "https://eur01.safelinks.protection.outlook.com.evil.test/",
    "https://eur01.safelinks.protection.outlook.com/other",
    "https://evil.slack-redir.net/link",
    "https://slack-redir.net.evil.test/link",
    "https://slack-redir.net/link/other",
    "https://slack-redir.net/",
  ])("leaves a non-matching host or path alone: %s", (wrapper) => {
    const input = `${wrapper}?url=${encodeURIComponent("https://example.org/x")}`;
    const r = cleanLink(input);
    expect(r.unwrapped).toBe(false);
    expect(r.cleaned).toBe(input);
  });

  it.each(["javascript:alert(1)", "data:text/plain,hello", "file:///tmp/example", "not-a-full-link", "%", ""])("keeps an invalid or non-HTTP(S) target wrapped: %s", (target) => {
    const input = `https://slack-redir.net/link?url=${encodeURIComponent(target)}`;
    const r = cleanLink(input);
    expect(r.unwrapped).toBe(false);
    expect(r.cleaned).toBe(input);
  });

  it("only uses the declared url parameter", () => {
    const input = `https://slack-redir.net/link?u=${encodeURIComponent("https://example.org/x")}`;
    expect(cleanLink(input)).toMatchObject({ unwrapped: false, cleaned: input });
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
