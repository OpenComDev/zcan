import { describe, expect, it } from "vitest";
import { ONE_IN_CAP, parseShare, roundOneIn, shareUrl } from "@/lib/share-results";

const q = (s: string) => new URLSearchParams(s);

describe("share results", () => {
  it("rounds to two significant figures", () => {
    expect(roundOneIn(43_712)).toBe(44_000);
    expect(roundOneIn(987)).toBe(990);
    expect(roundOneIn(12)).toBe(12);
    expect(roundOneIn(1e12)).toBe(ONE_IN_CAP);
  });

  it("parses valid links and rejects junk", () => {
    expect(parseShare("fingerprint", q("n=43712"))).toEqual({ kind: "fingerprint", n: 44_000 });
    expect(parseShare("photo", q("n=23&gps=1"))).toEqual({ kind: "photo", n: 23, gps: true });
    expect(parseShare("photo", q("n=0"))).toBeNull();
    expect(parseShare("photo", q("n=<script>"))).toBeNull();
    expect(parseShare("fingerprint", q("n=1e9"))).toBeNull();
    expect(parseShare("other", q("n=5"))).toBeNull();
  });

  it("builds links in the sharer's language with only the numbers", () => {
    expect(shareUrl({ kind: "photo", n: 7, gps: true }, "es", "https://www.zcan.dev")).toBe("https://www.zcan.dev/es/share/photo?n=7&gps=1");
    expect(shareUrl({ kind: "fingerprint", n: 43_712 }, "en", "https://www.zcan.dev")).toBe("https://www.zcan.dev/share/fingerprint?n=44000");
  });
});
