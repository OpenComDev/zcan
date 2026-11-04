import { describe, expect, it } from "vitest";
import { SAMPLE_ADDRESSES, checkAddress } from "@/lib/address-check";
import { classifyZecAddress, cleanLabel, parseZecAmount, requestLink, zip321 } from "@/components/pay/pay-utils";

describe("checkAddress", () => {
  it("recognises the sample addresses with valid checksums", () => {
    const [zec, btc, eth] = SAMPLE_ADDRESSES.map((s) => checkAddress(s.address));
    expect(zec?.chainId).toBe("zcash");
    expect(zec?.privacy).toBe("shielded");
    expect(btc?.chainId).toBe("bitcoin");
    expect(btc?.checksum).toBe("valid");
    expect(eth?.chainId).toBe("evm");
    expect(eth?.checksum).toBe("valid");
  });

  it("catches a mistyped bech32 address", () => {
    expect(checkAddress("bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdr")?.checksum).toBe("invalid");
  });

  it("returns null for non-addresses", () => {
    expect(checkAddress("")).toBeNull();
    expect(checkAddress("hello world")).toBeNull();
  });
});

describe("pay utils", () => {
  it("classifies Zcash addresses", () => {
    expect(classifyZecAddress("t1Rv4exT7bqhZqi2j7xz8bUHDMxwosrjADU").kind).toBe("transparent");
    expect(classifyZecAddress(SAMPLE_ADDRESSES[0].address).kind).toBe("unified");
    expect(classifyZecAddress("bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq").valid).toBe(false);
  });

  it.each([
    ["1", "1"],
    ["0.50", "0.5"],
    ["1,25", "1.25"],
    [".1", "0.1"],
    ["007.10", "7.1"],
  ])("normalises amount %j to %j", (raw, out) => {
    expect(parseZecAmount(raw)).toBe(out);
  });

  it.each(["0", "-1", "abc", "1.123456789", "21000001"])("rejects amount %j", (raw) => {
    expect(parseZecAmount(raw)).toBeNull();
  });

  it("strips bidi overrides and control characters from labels", () => {
    expect(cleanLabel("Rent‮ gnp.exe \u0007 March")).toBe("Rent gnp.exe March");
  });

  it("builds ZIP-321 URIs and request links", () => {
    expect(zip321("t1abc", "1.5", "Coffee & cake")).toBe("zcash:t1abc?amount=1.5&message=Coffee%20%26%20cake");
    expect(requestLink("https://zcan.dev", { to: "t1abc", amount: "2", label: "A B" })).toBe("https://zcan.dev/pay/r?to=t1abc&amount=2&label=A%20B");
  });
});
